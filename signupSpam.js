// Bot defenses for the public event-signup form.
//
// Three independent layers, each of which alone stops the Aug 2026 bot run
// (77 waitlist entries with random 10-char names, +1 random phones, random
// 55-char answers, paced 7 min apart to slip under the IP throttle):
//
//   1. Honeypot — a visually hidden field real browsers leave empty. Bots
//      that fill every input fill it.
//   2. Signed form token — the page embeds an HMAC of (eventId, renderTime).
//      The POST must carry it, be at least MIN_AGE old (no instant submits)
//      and under MAX_AGE (no replaying a scraped token forever). A bot that
//      posts straight to the action URL without loading the page fails.
//   3. Content heuristics — random alphanumeric "names" and long unbroken
//      alphanumeric answers are flagged. Flagged signups are stored with
//      status "spam" (skipping notification emails and the approval queue)
//      so a false positive can be restored from admin.

const crypto = require('crypto');

const HONEYPOT_FIELD = 'company_website';
const TOKEN_FIELD = '_ft';
const MIN_AGE_MS = 3 * 1000;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

// Stable across restarts when SIGNUP_TOKEN_SECRET is set; otherwise derived
// from DATABASE_URL so a redeploy doesn't invalidate every open form. Falls
// back to a per-process random secret in dev.
const SECRET = process.env.SIGNUP_TOKEN_SECRET
  || (process.env.DATABASE_URL
    ? crypto.createHash('sha256').update('signup-form:' + process.env.DATABASE_URL).digest('hex')
    : crypto.randomBytes(32).toString('hex'));

function sign(eventId, ts) {
  return crypto.createHmac('sha256', SECRET).update(`${eventId}:${ts}`).digest('base64url').slice(0, 32);
}

function makeFormToken(eventId, now = Date.now()) {
  return `${now}.${sign(String(eventId), now)}`;
}

// Returns { ok: true } or { ok: false, reason } where reason is one of
// 'missing' | 'invalid' | 'too_fast' | 'expired'.
function verifyFormToken(token, eventId, now = Date.now()) {
  const raw = String(token || '').trim();
  if (!raw) return { ok: false, reason: 'missing' };
  const dot = raw.indexOf('.');
  if (dot <= 0) return { ok: false, reason: 'invalid' };
  const ts = Number(raw.slice(0, dot));
  const sig = raw.slice(dot + 1);
  if (!Number.isFinite(ts) || !sig) return { ok: false, reason: 'invalid' };
  const expected = sign(String(eventId), ts);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { ok: false, reason: 'invalid' };
  const age = now - ts;
  if (age < MIN_AGE_MS) return { ok: false, reason: 'too_fast' };
  if (age > MAX_AGE_MS) return { ok: false, reason: 'expired' };
  return { ok: true };
}

// Hidden field markup. Positioned off-screen rather than display:none —
// some bots skip display:none inputs but still fill off-screen ones.
function honeypotHtml() {
  return `<div style="position:absolute;left:-10000px;top:auto;width:1px;height:1px;overflow:hidden;" aria-hidden="true">
        <label for="ev-${HONEYPOT_FIELD}">Company website</label>
        <input type="text" id="ev-${HONEYPOT_FIELD}" name="${HONEYPOT_FIELD}" tabindex="-1" autocomplete="off" value="" />
      </div>`;
}

function formTokenHtml(eventId) {
  return `<input type="hidden" name="${TOKEN_FIELD}" value="${makeFormToken(eventId)}" />`;
}

// A "word" that reads as machine-generated: no spaces, letters AND digits
// mixed, both upper and lower case. Real single-word names ("Cher",
// "Noir Candle Collection") don't mix all three. Threshold is 8 chars so
// handles like "jd2" or "R2D2" don't trip it. This is a STRONG signal —
// one hit is enough.
function looksRandomToken(str) {
  const s = String(str || '').trim();
  if (s.length < 8 || /\s/.test(s)) return false;
  if (!/^[A-Za-z0-9]+$/.test(s)) return false;
  return /\d/.test(s) && /[a-z]/.test(s) && /[A-Z]/.test(s);
}

// Letters-only variant (second bot run, Aug 22–24 2026: "gKTQRHZhCBIdvaHRHZZw",
// "tvvtugayYtVZSvvO"): a single unbroken word of 14+ letters with capitals
// scattered through the middle. Camel-case brand names could look like this,
// so it's a WEAK signal — a submission needs two of them to be flagged.
function looksRandomLetters(str) {
  const s = String(str || '').trim();
  if (s.length < 14 || /\s/.test(s)) return false;
  if (!/^[A-Za-z]+$/.test(s)) return false;
  const internalCaps = (s.slice(1).match(/[A-Z]/g) || []).length;
  return internalCaps >= 3 && /[a-z]/.test(s);
}

// Long unbroken alphanumeric run that isn't a URL, email, or data URL.
function looksRandomBlob(str) {
  const s = String(str || '').trim();
  if (s.length < 30 || /\s/.test(s)) return false;
  if (/^(https?:\/\/|data:|www\.)/i.test(s) || s.includes('@')) return false;
  return /^[A-Za-z0-9]+$/.test(s) && /\d/.test(s) && /[a-z]/.test(s) && /[A-Z]/.test(s);
}

// Inspect a parsed submission. Returns an array of short reason strings;
// empty means it looks human. Strong signals flag on their own; weak
// (letters-only) signals need two independent fields to agree.
function detectSpam({ name, notes, customAnswers, honeypot } = {}) {
  const strong = [];
  const weak = [];
  if (String(honeypot || '').trim()) strong.push('honeypot filled');
  if (looksRandomToken(name)) strong.push('random name');
  else if (looksRandomLetters(name)) weak.push('random-looking name');
  if (looksRandomBlob(notes)) strong.push('random notes');
  else if (looksRandomLetters(notes)) weak.push('random-looking notes');
  for (const [key, val] of Object.entries(customAnswers || {})) {
    if (typeof val !== 'string') continue;
    if (looksRandomBlob(val)) { strong.push(`random answer (${key})`); break; }
    if (looksRandomLetters(val)) { weak.push(`random-looking answer (${key})`); break; }
  }
  if (strong.length > 0) return [...strong, ...weak];
  if (weak.length >= 2) return weak;
  return [];
}

// Same heuristics against a stored EventSignup row (for the admin
// "scan for spam" bulk action).
function detectSpamInRow(signup) {
  return detectSpam({
    name: signup.name,
    notes: signup.notes,
    customAnswers: signup.customAnswers && typeof signup.customAnswers === 'object' ? signup.customAnswers : {},
  });
}

module.exports = {
  HONEYPOT_FIELD,
  TOKEN_FIELD,
  MIN_AGE_MS,
  MAX_AGE_MS,
  makeFormToken,
  verifyFormToken,
  honeypotHtml,
  formTokenHtml,
  looksRandomToken,
  looksRandomLetters,
  looksRandomBlob,
  detectSpam,
  detectSpamInRow,
};
