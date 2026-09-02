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
// handles like "jd2" or "R2D2" don't trip it.
function looksRandomToken(str) {
  const s = String(str || '').trim();
  if (s.length < 8 || /\s/.test(s)) return false;
  if (!/^[A-Za-z0-9]+$/.test(s)) return false;
  return /\d/.test(s) && /[a-z]/.test(s) && /[A-Z]/.test(s);
}

// Long unbroken alphanumeric run that isn't a URL, email, or data URL.
function looksRandomBlob(str) {
  const s = String(str || '').trim();
  if (s.length < 30 || /\s/.test(s)) return false;
  if (/^(https?:\/\/|data:|www\.)/i.test(s) || s.includes('@')) return false;
  return /^[A-Za-z0-9]+$/.test(s) && /\d/.test(s) && /[a-z]/.test(s) && /[A-Z]/.test(s);
}

// Inspect a parsed submission. Returns an array of short reason strings;
// empty means it looks human.
function detectSpam({ name, notes, customAnswers, honeypot } = {}) {
  const reasons = [];
  if (String(honeypot || '').trim()) reasons.push('honeypot filled');
  if (looksRandomToken(name)) reasons.push('random name');
  if (looksRandomBlob(notes)) reasons.push('random notes');
  for (const [key, val] of Object.entries(customAnswers || {})) {
    if (typeof val === 'string' && looksRandomBlob(val)) {
      reasons.push(`random answer (${key})`);
      break;
    }
  }
  return reasons;
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
  looksRandomBlob,
  detectSpam,
  detectSpamInRow,
};
