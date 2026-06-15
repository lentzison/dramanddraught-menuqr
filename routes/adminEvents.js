const { sendHTML, parseBody, redirect, getFlashMsg, sendEmailViaGoogle, uploadImageToMedia } = require('../helpers');
const { requireAuth, isCompanyWide, getUserLocationSlugs, canAccessLocation } = require('../auth');
const {
  eventsList,
  eventEditor,
  eventSignupsView,
  eventSignupDecisionView,
  eventResultsView,
} = require('../views/adminEventsViews');
const { sanitizeImageSrc } = require('../views/imageUploadWidget');
const { writeAudit } = require('../auditLog');
const { SIGNUP_TYPES, effectiveSignupType, needsApproval } = require('../eventSignupTypes');
const { normalizeCriteria, normalizeJudges, makeJudgeToken } = require('../eventJudging');
const { normalizeThemeKey } = require('../views/eventThemes');
const { parseDateTimeLocal } = require('../dateEastern');
const { normalizeRecurrenceRule } = require('../recurrence');
const { rolloverEvent, materializeOccurrences, syncManualOccurrences, announceToSeries } = require('../eventRollover');
const { htmlToRichText } = require('../views/eventPage');
const { generateEventSections } = require('../eventDesignAI');
const { eventIdentityKey, effectiveGroupKey, eventBaseName } = require('../eventGrouping');

// Build the "group with" dropdown options for the editor: one entry per
// distinct existing group among the user's events (excluding the one being
// edited), labelled by base name + date + the venues already in it.
async function buildGroupOptions(prisma, locations, excludeEventId) {
  const locationIds = locations.map(l => l.id);
  const rows = await prisma.event.findMany({
    where: {
      ...(locationIds.length ? { locationId: { in: locationIds } } : {}),
      ...(excludeEventId ? { id: { not: excludeEventId } } : {}),
    },
    select: { title: true, startDate: true, groupKey: true, location: { select: { name: true } } },
    orderBy: { startDate: 'desc' },
    take: 500,
  }).catch(() => []);
  const groups = new Map();
  for (const ev of rows) {
    const key = effectiveGroupKey(ev);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, { key, base: eventBaseName(ev.title), date: ev.startDate, locs: new Set() });
    if (ev.location && ev.location.name) groups.get(key).locs.add(ev.location.name);
  }
  return Array.from(groups.values()).map(g => {
    const dateStr = g.date ? new Date(g.date).toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric' }) : '';
    const locStr = g.locs.size ? Array.from(g.locs).join(', ') : '';
    return { key: g.key, label: [g.base, dateStr, locStr].filter(Boolean).join(' · ') };
  });
}

// Parse the "specific dates" list (a JSON array of datetime-local strings) into
// de-duplicated UTC Dates.
function parseRepeatDates(raw) {
  let arr = [];
  try { arr = JSON.parse(raw || '[]'); } catch { arr = []; }
  if (!Array.isArray(arr)) return [];
  const seen = new Set();
  const out = [];
  for (const s of arr) {
    const d = parseDateTimeLocal(String(s));
    if (d && !seen.has(d.getTime())) { seen.add(d.getTime()); out.push(d); }
  }
  return out;
}

// Build {isRecurring, recurrenceRule, mode, dates} from the event form's Repeat
// fields. Two modes: "pattern" (weekly/monthly rule) or "dates" (an explicit,
// possibly-irregular list the admin sets and edits over time).
function parseRecurrenceFromBody(body) {
  if (body.repeatEnabled !== 'on') return { isRecurring: false, recurrenceRule: null, mode: 'off', dates: [] };
  const mode = body.repeatMode === 'dates' ? 'dates' : 'pattern';
  if (mode === 'dates') {
    // Repeats on specific dates with no pattern — recurring, but no rule.
    return { isRecurring: true, recurrenceRule: null, mode: 'dates', dates: parseRepeatDates(body.repeatDates) };
  }
  const rule = normalizeRecurrenceRule({
    frequency: body.repeatFrequency,
    interval: body.repeatInterval,
    weekday: body.repeatWeekday,
    weekOfMonth: body.repeatWeekOfMonth,
    time: body.repeatTime,
    durationMinutes: body.repeatDurationMinutes,
    until: body.repeatUntil ? `${body.repeatUntil}T00:00:00` : null,
    count: body.repeatCount,
  });
  return rule
    ? { isRecurring: true, recurrenceRule: rule, mode: 'pattern', dates: [] }
    : { isRecurring: false, recurrenceRule: null, mode: 'off', dates: [] };
}

function normalizeText(value) {
  return String(value || '').trim();
}

// ─── Import-from-Dram support ───────────────────────────────────────────────
// The public Dram & Draught site exposes events its admins created (and which
// aren't owned by menuqr yet) at GET /api/external/events, behind a shared
// X-API-Key. We pull that list to offer a guided "import & finish" on our admin
// events page. Configure via DRAM_PUBLIC_URL + DRAM_EXTERNAL_API_KEY.
function dramApiConfig() {
  const base = (process.env.DRAM_PUBLIC_URL || 'https://public.dramanddraught.com').replace(/\/+$/, '');
  const key = process.env.DRAM_EXTERNAL_API_KEY || process.env.EXTERNAL_API_KEY || '';
  return { base, key };
}

async function fetchImportableDramEvents() {
  const { base, key } = dramApiConfig();
  if (!key || typeof fetch !== 'function') return [];
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);
    const resp = await fetch(`${base}/api/external/events`, {
      headers: { 'X-API-Key': key, Accept: 'application/json' },
      signal: ctrl.signal,
    }).finally(() => clearTimeout(t));
    if (!resp.ok) { console.warn('[import] Dram feed returned', resp.status); return []; }
    const data = await resp.json();
    return Array.isArray(data?.items) ? data.items : [];
  } catch (err) {
    console.warn('[import] Could not reach Dram feed:', err.message);
    return [];
  }
}

// Best-effort: match a public event's location to a menuqr location. The feed
// is inconsistent — it may send the venue name ("Dram & Draught Winston-Salem"),
// a city ("Winston-Salem" or "Winston Salem"), or a slug. We normalize both
// sides (drop the brand prefix, reduce to alphanumeric tokens) and compare on
// name, city, and slug, with a token-containment fallback. Returns '' when
// there's no confident match so the importer leaves the location unset rather
// than silently defaulting to the first venue.
function matchLocationId(publicLoc, locations) {
  if (!publicLoc || !Array.isArray(locations) || locations.length === 0) return '';
  const norm = (s) => String(s || '')
    .toLowerCase()
    .replace(/dram\s*(&|and)?\s*draught/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  const slugForm = (s) => norm(s).replace(/\s+/g, '-');

  const candidates = [publicLoc.name, publicLoc.city, publicLoc.slug, publicLoc.address].map(norm).filter(Boolean);
  const candidateSlugs = [publicLoc.name, publicLoc.city, publicLoc.slug].map(slugForm).filter(Boolean);

  // Exact-ish match on any normalized signal.
  for (const l of locations) {
    const lName = norm(l.name);
    const lCity = norm(l.city);
    const lSlug = String(l.slug || '').trim().toLowerCase();
    if (lName && candidates.includes(lName)) return l.id;
    if (lCity && candidates.includes(lCity)) return l.id;
    if (lSlug && (candidateSlugs.includes(lSlug) || candidates.includes(norm(lSlug)))) return l.id;
    if (candidateSlugs.includes(slugForm(l.name))) return l.id;
  }
  // Containment fallback: every token of a location's name appears in the
  // public location text (e.g. venue "...at Dram & Draught Winston-Salem").
  const hay = candidates.join(' ');
  for (const l of locations) {
    const toks = norm(l.name).split(' ').filter(Boolean);
    if (toks.length && toks.every((t) => hay.split(' ').includes(t))) return l.id;
  }
  return '';
}

// Validate the public "spots left" indicator mode.
function normalizeSpotsLeftMode(value) {
  const v = String(value || '').trim();
  return ['always', 'near-full', 'hidden'].includes(v) ? v : 'always';
}

// How the banner image is presented on the public page.
function normalizeBannerStyle(value) {
  const v = String(value || '').trim();
  return v === 'featured' ? 'featured' : 'hero';
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

function formatEventDateForEmail(event) {
  return event?.startDate
    ? new Date(event.startDate).toLocaleString('en-US', {
        timeZone: 'America/New_York',
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : '';
}

function buildVendorDecisionEmail(event, signup, decision, rejectionReason = '') {
  const isApprove = decision === 'approve';
  const dateStr = formatEventDateForEmail(event);
  const subject = isApprove
    ? `You're confirmed: ${event.title}`
    : `Update on your application: ${event.title}`;
  const bodyLines = isApprove
    ? [
        `Hi ${signup?.name || 'there'},`,
        '',
        `Great news — your application for "${event.title}" at ${event.location?.name || ''} has been approved.`,
        dateStr ? `Event: ${dateStr}` : null,
        '',
        "We'll be in touch with load-in details closer to the date.",
        '',
        `— Dram & Draught ${event.location?.name || ''}`,
      ].filter(Boolean)
    : [
        `Hi ${signup?.name || 'there'},`,
        '',
        `Thanks for applying to be a vendor at "${event.title}". Unfortunately we're not able to include you in this event.`,
        rejectionReason ? '' : null,
        rejectionReason ? `Notes from our team: ${rejectionReason}` : null,
        '',
        "We appreciate your interest and hope to work with you at a future event.",
        '',
        `— Dram & Draught ${event.location?.name || ''}`,
      ].filter(Boolean);
  return { subject, body: bodyLines.join('\n') };
}

// Eastern-timezone date helpers live in the shared dateEastern.js module so
// recurring-event date generation stays in lockstep with manually-entered dates.

function normalizeTicketUrl(value) {
  const v = normalizeText(value);
  if (!v) return null;
  // Bare http(s) URLs only — silently drop anything else so we never render
  // a junk href on the event page.
  if (!/^https?:\/\//i.test(v)) return null;
  return v;
}

function detectTicketProvider(value) {
  const v = normalizeTicketUrl(value);
  if (!v) return null;
  if (/eventbrite\.(com|ca|co\.uk)/i.test(v)) return 'eventbrite';
  return 'other';
}

function parseCapacity(value) {
  if (value == null || value === '') return null;
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Resolve the banner image to store. A freshly-uploaded inline photo (data URL)
// is pushed into the shared media system so it appears in the media dashboard
// and can be served at any size/crop; we then store the hosted media URL.
// If the media integration isn't configured (no EXTERNAL_API_KEY) or upload
// fails, we fall back to storing the data URL inline as before. Already-hosted
// URLs (including media URLs from a prior save) pass through unchanged, so we
// never re-upload the same image.
async function resolveEventImage(rawImage, slugForTags) {
  const src = sanitizeImageSrc(rawImage);
  if (!src) return null;
  if (/^data:/i.test(src)) {
    const uploaded = await uploadImageToMedia(src, { collection: 'event-banners', tags: slugForTags || '' });
    if (uploaded && uploaded.url) return uploaded.url;
    return src; // fallback: keep it inline
  }
  return src;
}

// Allowed background style values for sections that support theming.
function normalizeBgStyle(value) {
  const v = String(value || '').toLowerCase();
  return ['default', 'gold', 'dark', 'transparent'].includes(v) ? v : 'default';
}

// Helper for section types that have repeating rows (schedule, faq).
function pickArray(body, key) {
  const v = body[key];
  if (Array.isArray(v)) return v;
  if (v == null || v === '') return [];
  return [v];
}

function generateSectionId() {
  return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// Build a section object from form fields based on its type. Generates a fresh id when not provided.
function buildSectionFromForm(body, existingId = null) {
  const type = String(body.type || 'text').toLowerCase();
  const id = existingId || generateSectionId();
  const bgStyle = normalizeBgStyle(body.bgStyle);

  if (type === 'text') {
    return {
      id, type, bgStyle,
      heading: normalizeText(body.heading) || null,
      body: normalizeText(body.body) || null,
      align: ['left', 'center', 'right'].includes(String(body.align)) ? body.align : 'left',
    };
  }
  if (type === 'image') {
    const src = sanitizeImageSrc(body.src);
    if (!src) return null;
    return { id, type, src, caption: normalizeText(body.caption) || null, alt: normalizeText(body.alt) || null };
  }
  if (type === 'details') {
    const labels = pickArray(body, 'detail_label');
    const values = pickArray(body, 'detail_value');
    const items = [];
    for (let i = 0; i < labels.length; i++) {
      const label = normalizeText(labels[i]);
      const value = normalizeText(values[i]);
      if (label || value) items.push({ label, value });
    }
    return { id, type, bgStyle, title: normalizeText(body.title) || null, items };
  }
  if (type === 'button') {
    const url = normalizeText(body.url);
    if (!url) return null;
    return {
      id, type, bgStyle,
      label: normalizeText(body.label) || 'Learn More',
      url: url.slice(0, 2000),
      style: ['primary', 'secondary'].includes(String(body.style)) ? body.style : 'primary',
    };
  }
  if (type === 'video') {
    const url = normalizeText(body.url);
    if (!url) return null;
    return { id, type, bgStyle, url: url.slice(0, 2000), caption: normalizeText(body.caption) || null };
  }
  if (type === 'divider') {
    return { id, type };
  }
  if (type === 'hero') {
    const src = sanitizeImageSrc(body.src);
    if (!src) return null;
    return {
      id, type,
      src,
      eyebrow: normalizeText(body.eyebrow) || null,
      title: normalizeText(body.title) || null,
      subtitle: normalizeText(body.subtitle) || null,
    };
  }
  if (type === 'twocol') {
    const src = sanitizeImageSrc(body.src);
    if (!src) return null;
    return {
      id, type, bgStyle,
      src,
      alt: normalizeText(body.alt) || null,
      imagePosition: String(body.imagePosition) === 'right' ? 'right' : 'left',
      heading: normalizeText(body.heading) || null,
      body: normalizeText(body.body) || null,
    };
  }
  if (type === 'schedule') {
    const times = pickArray(body, 'sched_time');
    const titles = pickArray(body, 'sched_title');
    const descs = pickArray(body, 'sched_desc');
    const items = [];
    for (let i = 0; i < Math.max(times.length, titles.length); i++) {
      const time = normalizeText(times[i]);
      const title = normalizeText(titles[i]);
      const description = normalizeText(descs[i]);
      if (time || title || description) items.push({ time, title, description });
    }
    return { id, type, bgStyle, title: normalizeText(body.title) || null, items };
  }
  if (type === 'faq') {
    const questions = pickArray(body, 'faq_question');
    const answers = pickArray(body, 'faq_answer');
    const items = [];
    for (let i = 0; i < Math.max(questions.length, answers.length); i++) {
      const question = normalizeText(questions[i]);
      const answer = normalizeText(answers[i]);
      if (question || answer) items.push({ question, answer });
    }
    return { id, type, bgStyle, title: normalizeText(body.title) || null, items };
  }
  if (type === 'cocktailmenu') {
    const names = pickArray(body, 'cm_name');
    const ingredients = pickArray(body, 'cm_ingredients');
    const abvs = pickArray(body, 'cm_abv');
    const creators = pickArray(body, 'cm_creator');
    const vibes = pickArray(body, 'cm_vibe');
    const items = [];
    for (let i = 0; i < names.length; i++) {
      const name = normalizeText(names[i]);
      if (!name) continue; // a drink needs a name to render
      items.push({
        name: name.slice(0, 120),
        ingredients: normalizeText(ingredients[i]).slice(0, 300) || null,
        abv: normalizeText(abvs[i]).slice(0, 40) || null,
        creator: normalizeText(creators[i]).slice(0, 80) || null,
        vibe: normalizeText(vibes[i]).slice(0, 200) || null,
      });
    }
    return {
      id, type, bgStyle,
      title: normalizeText(body.title) || null,
      subtitle: normalizeText(body.subtitle) || null,
      items,
    };
  }
  return null;
}

function getSections(event) {
  return Array.isArray(event.sections) ? event.sections : [];
}

function cloneSection(section) {
  if (!section || typeof section !== 'object') return null;
  return {
    ...JSON.parse(JSON.stringify(section)),
    id: generateSectionId(),
  };
}

function parseCustomQuestions(body) {
  // Expect arrays: custom_label[], custom_type[], custom_required[], custom_id[].
  // custom_id is preserved from existing questions so saved EventSignup
  // customAnswers (keyed by question id) keep matching after edits. New rows
  // submit an empty custom_id and we generate one.
  const labels = Array.isArray(body['custom_label']) ? body['custom_label'] : (body['custom_label'] ? [body['custom_label']] : []);
  const types = Array.isArray(body['custom_type']) ? body['custom_type'] : (body['custom_type'] ? [body['custom_type']] : []);
  const ids = Array.isArray(body['custom_id']) ? body['custom_id'] : (body['custom_id'] != null ? [body['custom_id']] : []);
  const questions = [];
  for (let i = 0; i < labels.length; i++) {
    const label = normalizeText(labels[i]);
    if (!label) continue;
    const type = (types[i] || 'text').toLowerCase();
    const validType = ['text', 'textarea', 'number', 'yesno', 'image', 'images-multi'].includes(type) ? type : 'text';
    const required = body[`custom_required_${i}`] === 'on';
    const existingId = String(ids[i] || '').trim();
    questions.push({
      id: existingId || ('q_' + i + '_' + Math.random().toString(36).slice(2, 8)),
      label,
      type: validType,
      required,
    });
  }
  return questions;
}

// Parse the competition-judging config from the editor form. Mirrors
// parseCustomQuestions: parallel arrays for criteria (jc_label/jc_max/jc_id)
// and judges (judge_name/judge_id), with stable IDs preserved across edits so
// already-recorded scorecards keep matching their criterion.
function parseJudgingConfig(body) {
  const cLabels = Array.isArray(body['jc_label']) ? body['jc_label'] : (body['jc_label'] ? [body['jc_label']] : []);
  const cMaxes = Array.isArray(body['jc_max']) ? body['jc_max'] : (body['jc_max'] != null ? [body['jc_max']] : []);
  const cIds = Array.isArray(body['jc_id']) ? body['jc_id'] : (body['jc_id'] != null ? [body['jc_id']] : []);
  const criteria = normalizeCriteria(cLabels.map((label, i) => ({
    id: String(cIds[i] || '').trim(),
    label,
    max: cMaxes[i],
  })));

  const jNames = Array.isArray(body['judge_name']) ? body['judge_name'] : (body['judge_name'] ? [body['judge_name']] : []);
  const jIds = Array.isArray(body['judge_id']) ? body['judge_id'] : (body['judge_id'] != null ? [body['judge_id']] : []);
  const judges = normalizeJudges(jNames.map((name, i) => ({
    id: String(jIds[i] || '').trim(),
    name,
  })));

  let finalistTarget = parseInt(body.finalistTarget, 10);
  if (!Number.isFinite(finalistTarget) || finalistTarget <= 0) finalistTarget = null;
  else finalistTarget = Math.min(100, finalistTarget);

  return { criteria, judges, finalistTarget };
}

async function ensureUniqueSlug(prisma, locationId, baseSlug, excludeId = null) {
  let slug = baseSlug;
  let i = 2;
  // Loop until we find an unused slug
  while (true) {
    const existing = await prisma.event.findFirst({
      where: {
        locationId,
        slug,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });
    if (!existing) return slug;
    slug = `${baseSlug}-${i}`;
    i++;
    if (i > 100) return `${baseSlug}-${Date.now().toString(36)}`;
  }
}

async function handleAdminEvents(req, res, pathname, prisma) {
  if (!pathname.startsWith('/admin/events')) return false;

  const user = requireAuth(req, res);
  if (!user) { redirect(res, '/admin/login'); return true; }
  if (!prisma) { sendHTML(res, 500, '<p>DB not available</p>'); return true; }

  const userIsCompanyWide = isCompanyWide(user);
  const userSlugs = userIsCompanyWide ? null : getUserLocationSlugs(user);

  const locWhere = { isActive: true };
  if (!userIsCompanyWide) {
    locWhere.slug = { in: userSlugs.length > 0 ? userSlugs : ['__none__'] };
  }
  const locations = await prisma.location.findMany({
    where: locWhere,
    orderBy: { name: 'asc' },
    select: { id: true, slug: true, name: true },
  }).catch(() => []);
  const allowedLocationIds = new Set(locations.map(l => l.id));

  // ─── List all events ───
  if (pathname === '/admin/events') {
    const flashMsg = getFlashMsg(req.url);
    const urlObj = new URL(req.url, 'http://x');
    const filter = (urlObj.searchParams.get('filter') || 'upcoming').toLowerCase();
    const validFilters = new Set(['upcoming', 'past', 'hidden', 'cancelled', 'all']);
    const safeFilter = validFilters.has(filter) ? filter : 'upcoming';
    const eventWhere = userIsCompanyWide
      ? {}
      : { locationId: { in: Array.from(allowedLocationIds).length > 0 ? Array.from(allowedLocationIds) : ['__none__'] } };
    // For Upcoming filter the most useful sort is ascending by startDate;
    // for everything else the latest-first feel is what admins expect.
    const orderBy = safeFilter === 'upcoming' ? [{ startDate: 'asc' }] : [{ startDate: 'desc' }];
    const events = await prisma.event.findMany({
      where: eventWhere,
      orderBy,
      include: {
        location: { select: { slug: true, name: true } },
        // Live-date signups only (the current occurrence is the one not yet rolled over).
        _count: { select: { signups: { where: { occurrence: { is: { rolledOverAt: null } } } } } },
      },
    }).catch(async (err) => {
      console.warn('Events list include failed, falling back:', err.message);
      const rows = await prisma.event.findMany({ where: eventWhere, orderBy }).catch(() => []);
      for (const ev of rows) {
        const loc = locations.find(l => l.id === ev.locationId);
        ev.location = loc ? { slug: loc.slug, name: loc.name } : { slug: '', name: '' };
        ev._count = { signups: await prisma.eventSignup.count({ where: { eventId: ev.id, occurrence: { is: { rolledOverAt: null } } } }).catch(() => 0) };
      }
      return rows;
    });

    // Guided import of Dram-website events not yet on menuqr. Detection is by
    // event IDENTITY (base name + date) + location, so it recognizes events
    // already here whether they were imported or created by hand — not just by
    // source id. Sources are grouped by identity (the same event across venues)
    // and each venue is marked done ✓ or pending. Best-effort: a feed outage
    // just hides the panel.
    let importGroups = [];
    let importCount = 0;
    if (safeFilter === 'upcoming') {
      const dramEvents = await fetchImportableDramEvents();
      if (dramEvents.length) {
        const existing = await prisma.event.findMany({
          select: { title: true, startDate: true, locationId: true },
        }).catch(() => []);
        const existingSet = new Set();
        for (const e of existing) {
          const id = eventIdentityKey(e.title, e.startDate);
          if (id) existingSet.add(`${id}@@${e.locationId}`);
        }
        const now = Date.now();
        const byIdentity = new Map();
        for (const src of dramEvents) {
          const when = src.startAt ? new Date(src.startAt).getTime() : null;
          if (when != null && when < now - 12 * 60 * 60 * 1000) continue; // skip past
          const identity = eventIdentityKey(src.title, src.startAt);
          if (!identity) continue;
          const targetLoc = matchLocationId(src.location, locations) || null;
          // Location scoping: non-company-wide users only see their venues.
          if (!userIsCompanyWide && (!targetLoc || !locations.some(l => l.id === targetLoc))) continue;
          const sourceVenue = (src.location && (src.location.name || src.location.city)) || '';
          const locationName = targetLoc
            ? (locations.find(l => l.id === targetLoc)?.name || '')
            : (sourceVenue || 'Set location');
          const already = !!(targetLoc && existingSet.has(`${identity}@@${targetLoc}`));
          if (!byIdentity.has(identity)) {
            byIdentity.set(identity, {
              identity,
              baseName: eventBaseName(src.title),
              date: src.startAt || null,
              venues: [],
              seenLoc: new Set(),
              // Representative source detail for the "see details" view (the
              // description/image are the same across a multi-venue event).
              detail: {
                descPreview: String(src.description || src.summary || '').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim().slice(0, 320),
                image: (src.heroImage && /^https?:\/\//i.test(src.heroImage)) ? src.heroImage : null,
                ticketUrl: src.ticketUrl || null,
                capacity: src.capacity || null,
              },
            });
          }
          const g = byIdentity.get(identity);
          // De-dupe resolved venues (duplicate source rows for one venue).
          if (targetLoc) { if (g.seenLoc.has(targetLoc)) continue; g.seenLoc.add(targetLoc); }
          g.venues.push({ sourceId: src.id, locationName, locationId: targetLoc, already, needsPick: !targetLoc, sourceVenue });
        }
        importGroups = Array.from(byIdentity.values())
          .map(g => {
            g.venues.sort((a, b) => Number(a.already) - Number(b.already) || a.locationName.localeCompare(b.locationName));
            g.pendingCount = g.venues.filter(v => !v.already).length;
            return g;
          })
          .filter(g => g.pendingCount > 0) // hide fully-imported events
          .sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));
        importCount = importGroups.reduce((n, g) => n + g.pendingCount, 0);
      }
    }

    sendHTML(res, 200, eventsList(events, user, flashMsg, safeFilter, { groups: importGroups, count: importCount }));
    return true;
  }

  // ─── New event form / create ───
  if (pathname === '/admin/events/new') {
    if (req.method === 'POST') {
      const body = await parseBody(req);
      const flashError = (detail) => '/admin/events/new?msg=' + encodeURIComponent('error|' + detail);
      const title = normalizeText(body.title);
      const locationId = normalizeText(body.locationId);
      if (!title) { redirect(res, flashError('Event name is required.')); return true; }
      if (!locationId) { redirect(res, flashError('Please pick a location.')); return true; }
      if (!userIsCompanyWide && !allowedLocationIds.has(locationId)) {
        redirect(res, flashError('You can only create events for your own location.'));
        return true;
      }

      const baseSlug = slugify(body.slug || title) || 'event';
      const uniqueSlug = await ensureUniqueSlug(prisma, locationId, baseSlug);

      const startDate = parseDateTimeLocal(body.startDate);
      if (!startDate) { redirect(res, flashError('Event date and time are required.')); return true; }

      const customQuestions = parseCustomQuestions(body);
      const judging = parseJudgingConfig(body);
      const judgeToken = (judging.criteria.length > 0 && judging.judges.length > 0) ? makeJudgeToken() : null;
      const imageValue = await resolveEventImage(body.image, uniqueSlug);
      const recurrence = parseRecurrenceFromBody(body);
      // Imported events auto-link to their source so the same event at multiple
      // venues groups together; a manual groupKey in the form overrides it.
      const importedFromPublicId = (() => {
        const n = parseInt(body.importedFromPublicId, 10);
        return Number.isFinite(n) ? n : null;
      })();
      // groupKey is a manual override only; auto cross-location grouping is
      // computed from the event's identity (name + date) at render time.
      const groupKey = normalizeText(body.groupKey) || null;
      const fullDescription = normalizeText(body.description) || null;

      // Block creating the same event (same name + date, venue suffix ignored)
      // at a location that already has it. Cross-location is fine — that only
      // matches within the same locationId.
      const newIdentity = eventIdentityKey(title, startDate);
      if (newIdentity) {
        const sameLoc = await prisma.event.findMany({
          where: { locationId },
          select: { title: true, startDate: true },
        }).catch(() => []);
        if (sameLoc.some(e => eventIdentityKey(e.title, e.startDate) === newIdentity)) {
          redirect(res, flashError('That event already exists at this location (same name and date). Edit the existing one instead, or change the date/name.'));
          return true;
        }
      }

      try {
        const created = await prisma.event.create({
          data: {
            locationId,
            slug: uniqueSlug,
            title,
            description: fullDescription,
            // Imported events keep the original text admin-side for reference;
            // the public description gets distilled by the AI below.
            sourceDescription: importedFromPublicId != null ? fullDescription : null,
            startDate,
            endDate: parseDateTimeLocal(body.endDate),
            isRecurring: recurrence.isRecurring,
            recurrenceRule: recurrence.recurrenceRule || undefined,
            image: imageValue,
            promoteFrom: parseDateTimeLocal(body.promoteFrom),
            promoteUntil: parseDateTimeLocal(body.promoteUntil),
            capacity: parseCapacity(body.capacity),
            signupsEnabled: body.signupsEnabled === 'on',
            collectEmail: body.collectEmail === 'on',
            collectPhone: body.collectPhone === 'on',
            collectPartySize: body.collectPartySize === 'on',
            collectNotes: body.collectNotes === 'on',
            customQuestions: customQuestions.length > 0 ? customQuestions : null,
            judgingCriteria: judging.criteria.length > 0 ? judging.criteria : null,
            judges: judging.judges.length > 0 ? judging.judges : null,
            finalistTarget: judging.finalistTarget,
            judgeToken,
            confirmationMessage: normalizeText(body.confirmationMessage) || null,
            notifyEmail: normalizeText(body.notifyEmail) || null,
            isActive: body.isActive === 'on',
            isCancelled: false,
            signupType: SIGNUP_TYPES.includes(String(body.signupType)) ? String(body.signupType) : 'guest',
            // Keep isVendorEvent in sync so existing read paths still work
            // until they're all migrated to read signupType directly.
            isVendorEvent: String(body.signupType) === 'vendor',
            ticketUrl: normalizeTicketUrl(body.ticketUrl),
            ticketProvider: detectTicketProvider(body.ticketUrl),
            remindersEnabled: body.remindersEnabled === 'on',
            themeKey: normalizeThemeKey(body.themeKey),
            spotsLeftMode: normalizeSpotsLeftMode(body.spotsLeftMode),
            bannerStyle: normalizeBannerStyle(body.bannerStyle),
            // When finishing an imported Dram event, link it back so the public
            // sync transfers ownership to that row instead of duplicating it.
            importedFromPublicId,
            groupKey,
          },
        });
        // Create the first occurrence + (if recurring) the future buffer.
        await materializeOccurrences(prisma, created.id).catch((err) =>
          console.warn('[events] materialize after create failed:', err.message));
        if (recurrence.mode === 'dates') {
          await syncManualOccurrences(prisma, created.id, recurrence.dates).catch((err) =>
            console.warn('[events] sync dates after create failed:', err.message));
        }
        // Find slug for audit context
        const loc = locations.find(l => l.id === locationId);
        writeAudit(prisma, req, user, {
          action: 'create', resourceType: 'event', resourceId: created.id,
          resourceLabel: created.title, locationSlug: loc ? loc.slug : null,
        });
        // Imported event: design the page from the source description NOW (await
        // it) so the sections are already in the Page Builder when the editor
        // loads, and distill the public description to a short summary. The full
        // text stays in sourceDescription. Graceful if AI is unavailable.
        if (importedFromPublicId != null) {
          const dateText = startDate
            ? new Date(startDate).toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })
            : '';
          let designed = false;
          try {
            const { sections, summary } = await generateEventSections({
              title,
              description: fullDescription || '',
              dateText,
              locationName: loc ? loc.name : '',
              ticketUrl: normalizeTicketUrl(body.ticketUrl),
            });
            const data = {};
            if (sections.length) data.sections = sections;
            if (summary) data.description = summary; // concise public blurb; full text kept in sourceDescription
            if (Object.keys(data).length) {
              await prisma.event.update({ where: { id: created.id }, data });
              designed = sections.length > 0;
            }
          } catch (err) {
            console.warn('[event-design] import generation failed:', err.message);
          }
          const note = designed
            ? 'Imported and auto-designed — review the page in the Page Builder tab, then publish.'
            : 'Imported. Add page content in the Page Builder tab (AI design was unavailable), then publish.';
          redirect(res, `/admin/events/${created.id}?msg=` + encodeURIComponent('success|' + note) + '#page');
          return true;
        }
        redirect(res, `/admin/events/${created.id}?msg=created`);
        return true;
      } catch (err) {
        console.error('Error creating event:', err.message || err);
        redirect(res, flashError(err.message || 'Database error.'));
        return true;
      }
    }

    const flashMsg = getFlashMsg(req.url);

    // Guided import: ?importFrom=<publicEventId> pre-fills the create form from a
    // Dram website event, then the admin finishes the menuqr-specific setup.
    const importFrom = new URL(req.url, 'http://x').searchParams.get('importFrom');
    if (importFrom) {
      const dramEvents = await fetchImportableDramEvents();
      const src = dramEvents.find(it => String(it.id) === String(importFrom));
      if (!src) {
        redirect(res, '/admin/events?msg=' + encodeURIComponent('error|That Dram event could not be found — it may already be imported.'));
        return true;
      }
      // Eventbrite descriptions arrive as HTML; convert to our markdown-ish
      // format so the editor textarea and the public page show formatted text,
      // not raw tags.
      const rawDescription = src.description || src.summary || '';
      // Which venues already have this source imported — so we can avoid
      // pre-selecting one that's taken (multi-location: each venue gets its
      // own row). If the matched venue is taken, leave location blank to force
      // the admin to pick a fresh one.
      const takenLocs = await prisma.event
        .findMany({ where: { importedFromPublicId: Number(src.id) }, select: { locationId: true } })
        .then(rows => new Set(rows.map(r => r.locationId)))
        .catch(() => new Set());
      let matchedLoc = matchLocationId(src.location, locations);
      if (matchedLoc && takenLocs.has(matchedLoc)) matchedLoc = '';
      const draft = {
        title: src.title || '',
        description: htmlToRichText(rawDescription),
        slug: '',
        startDate: src.startAt || null,
        endDate: src.endAt || null,
        image: src.heroImage || '',
        capacity: src.capacity || null,
        ticketUrl: src.ticketUrl || '',
        locationId: matchedLoc,
        // No groupKey — siblings auto-group by identity (name + date).
      };
      const groupOptions = await buildGroupOptions(prisma, locations, null);
      sendHTML(res, 200, eventEditor(draft, locations, user, flashMsg, 0, {
        forceNew: true,
        importedFromPublicId: src.id,
        groupOptions,
        autoKey: eventIdentityKey(draft.title, draft.startDate),
      }));
      return true;
    }

    const groupOptions = await buildGroupOptions(prisma, locations, null);
    sendHTML(res, 200, eventEditor(null, locations, user, flashMsg, 0, { groupOptions }));
    return true;
  }

  // ─── Per-event QR code (PNG by default, ?fmt=svg for vector) ───
  // GET /admin/events/:id/qr?fmt=png|svg&size=600
  const qrMatch = pathname.match(/^\/admin\/events\/([a-zA-Z0-9-]+)\/qr$/);
  if (qrMatch) {
    const eventId = qrMatch[1];
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: { location: { select: { slug: true } } },
    }).catch(() => null);
    if (!event) { sendHTML(res, 404, '<h1>Event not found</h1>'); return true; }
    if (!userIsCompanyWide && !canAccessLocation(user, event.location?.slug)) {
      redirect(res, '/admin/events');
      return true;
    }
    if (!event.location?.slug || !event.slug) {
      sendHTML(res, 400, '<h1>Event has no public URL yet</h1>');
      return true;
    }

    const QRCode = require('qrcode');
    const urlObj = new URL(req.url, 'http://x');
    const fmt = (urlObj.searchParams.get('fmt') || 'png').toLowerCase();
    const size = Math.min(2000, Math.max(200, parseInt(urlObj.searchParams.get('size') || '800', 10)));
    const baseUrl = process.env.MENUQR_BASE_URL || 'https://menuqr.apps.dramanddraught.com';
    const target = `${baseUrl}/${event.location.slug}/events/${event.slug}`;
    const filename = `event-${event.slug}-qr.${fmt === 'svg' ? 'svg' : 'png'}`;

    try {
      if (fmt === 'svg') {
        const svg = await QRCode.toString(target, {
          type: 'svg',
          margin: 2,
          color: { dark: '#0f1012', light: '#ffffff' },
        });
        res.writeHead(200, {
          'Content-Type': 'image/svg+xml',
          'Content-Disposition': `inline; filename="${filename}"`,
          'Cache-Control': 'public, max-age=300',
        });
        res.end(svg);
      } else {
        const png = await QRCode.toBuffer(target, {
          type: 'png',
          margin: 2,
          width: size,
          color: { dark: '#0f1012', light: '#ffffff' },
        });
        res.writeHead(200, {
          'Content-Type': 'image/png',
          'Content-Length': png.length,
          'Content-Disposition': `inline; filename="${filename}"`,
          'Cache-Control': 'public, max-age=300',
        });
        res.end(png);
      }
    } catch (err) {
      console.warn('[adminEvents] QR generation failed:', err.message);
      sendHTML(res, 500, '<h1>Could not generate QR</h1>');
    }
    return true;
  }

  // ─── Edit event / view signups ───
  const editMatch = pathname.match(/^\/admin\/events\/([a-zA-Z0-9-]+)(?:\/(signups|signups\/export|results|delete))?$/);
  if (editMatch) {
    const eventId = editMatch[1];
    const subpath = editMatch[2] || '';

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: {
        location: { select: { slug: true, name: true } },
        currentOccurrence: true,
        occurrences: {
          orderBy: { startDate: 'asc' },
          include: { _count: { select: { signups: true } } },
        },
      },
    }).catch(() => null);
    if (!event) { sendHTML(res, 404, '<h1>Event not found</h1><p><a href="/admin/events">Back to events</a></p>'); return true; }
    if (!userIsCompanyWide && !canAccessLocation(user, event.location?.slug)) {
      redirect(res, '/admin/events');
      return true;
    }

    // Signups CSV export — current occurrence by default, ?scope=all for the
    // full series history, ?occ=<id> for a specific past date.
    if (subpath === 'signups/export') {
      const exportUrl = new URL(req.url, 'http://admin.local');
      const scope = String(exportUrl.searchParams.get('scope') || '').toLowerCase();
      const occParam = String(exportUrl.searchParams.get('occ') || '').trim();
      const exportWhere = { eventId };
      if (scope !== 'all') {
        const occId = occParam || event.currentOccurrenceId;
        if (occId) exportWhere.occurrenceId = occId;
      }
      const signups = await prisma.eventSignup.findMany({
        where: exportWhere,
        orderBy: { createdAt: 'asc' },
      });
      const customDefs = Array.isArray(event.customQuestions) ? event.customQuestions : [];
      const headers = ['Date', 'Name', 'Email', 'Phone', 'Party Size', 'Notes', 'Status', 'Checked In', 'Approved By', 'Approved At', 'Rejection Reason', ...customDefs.map(q => q.label)];
      const csvEscape = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
      const rows = signups.map(s => {
        const answers = s.customAnswers || {};
        return [
          s.createdAt ? s.createdAt.toISOString() : '',
          s.name || '',
          s.email || '',
          s.phone || '',
          s.partySize || '',
          s.notes || '',
          s.status || 'approved',
          s.checkedInAt ? s.checkedInAt.toISOString() : '',
          s.approvedBy || '',
          s.approvedAt ? s.approvedAt.toISOString() : '',
          s.rejectionReason || '',
          ...customDefs.map(q => {
            const v = answers[q.id];
            if (v == null) return '';
            // images-multi: CSV shouldn't carry base64 blobs. Just summarize.
            if (Array.isArray(v)) return `${v.length} image${v.length === 1 ? '' : 's'} attached`;
            return v;
          }),
        ].map(csvEscape).join(',');
      });
      const csv = headers.map(csvEscape).join(',') + '\n' + rows.join('\n');
      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="event-${event.slug}-signups.csv"`,
      });
      res.end(csv);
      return true;
    }

    // Judging results / leaderboard.
    if (subpath === 'results') {
      const finalists = await prisma.eventSignup.findMany({
        where: { eventId, isFinalist: true },
        orderBy: { createdAt: 'asc' },
      }).catch(() => []);
      sendHTML(res, 200, eventResultsView(event, finalists, user, getFlashMsg(req.url)));
      return true;
    }

    // Signups view
    if (subpath === 'signups') {
      const flashMsg = getFlashMsg(req.url);
      const parsedDecisionUrl = new URL(req.url, 'http://admin.local');
      const decision = String(parsedDecisionUrl.searchParams.get('decision') || '').toLowerCase();
      const decisionSignupId = String(parsedDecisionUrl.searchParams.get('signupId') || '').trim();

      if (req.method === 'GET' && (decision === 'approve' || decision === 'reject') && decisionSignupId) {
        const signup = await prisma.eventSignup.findFirst({
          where: { id: decisionSignupId, eventId },
        }).catch(() => null);
        if (!signup) {
          redirect(res, `/admin/events/${eventId}/signups?msg=` + encodeURIComponent('error|Signup not found.'));
          return true;
        }
        const email = buildVendorDecisionEmail(event, signup, decision);
        sendHTML(res, 200, eventSignupDecisionView(event, signup, decision, email, user, flashMsg));
        return true;
      }

      // Handle signup actions: delete / approve / reject (approve + reject are
      // only surfaced in the UI for vendor events).
      if (req.method === 'POST') {
        const body = await parseBody(req);
        const action = body._action || '';
        const signupId = body.signupId ? String(body.signupId) : '';

        if (action === 'deleteSignup' && signupId) {
          await prisma.eventSignup.delete({ where: { id: signupId } }).catch(() => null);
          redirect(res, `/admin/events/${eventId}/signups?msg=deleted`);
          return true;
        }

        // Toggle day-of check-in for a signup.
        if (action === 'checkin' && signupId) {
          const target = await prisma.eventSignup.findFirst({ where: { id: signupId, eventId } }).catch(() => null);
          if (!target) {
            redirect(res, `/admin/events/${eventId}/signups?msg=` + encodeURIComponent('error|Signup not found.'));
            return true;
          }
          await prisma.eventSignup.update({
            where: { id: signupId },
            data: { checkedInAt: target.checkedInAt ? null : new Date() },
          }).catch((err) => console.warn('Check-in toggle failed:', err.message));
          redirect(res, `/admin/events/${eventId}/signups?msg=` + (target.checkedInAt ? 'checkin-undone' : 'checked-in') + `#signup-${signupId}`);
          return true;
        }

        // Toggle finalist selection for a competition. Selecting a finalist
        // also confirms them (status → approved) so they leave the pending
        // queue; removing finalist leaves the status as-is.
        if (action === 'toggleFinalist' && signupId) {
          const target = await prisma.eventSignup.findFirst({ where: { id: signupId, eventId } }).catch(() => null);
          if (!target) {
            redirect(res, `/admin/events/${eventId}/signups?msg=` + encodeURIComponent('error|Signup not found.'));
            return true;
          }
          const makeFinalist = !target.isFinalist;
          await prisma.eventSignup.update({
            where: { id: signupId },
            data: {
              isFinalist: makeFinalist,
              ...(makeFinalist && target.status === 'pending'
                ? { status: 'approved', approvedBy: user.email, approvedAt: new Date() }
                : {}),
            },
          }).catch((err) => console.warn('Toggle finalist failed:', err.message));
          writeAudit(prisma, req, user, {
            action: 'update', resourceType: 'eventSignup', resourceId: signupId,
            resourceLabel: `${target.name || ''} — ${event.title}`,
            locationSlug: event.location?.slug || null,
            details: { isFinalist: makeFinalist },
          });
          redirect(res, `/admin/events/${eventId}/signups?msg=` + encodeURIComponent(makeFinalist ? 'success|Selected as finalist.' : 'success|Removed from finalists.') + `#signup-${signupId}`);
          return true;
        }

        // Open / close judge scoring for the event.
        if (action === 'toggleJudging') {
          await prisma.event.update({
            where: { id: eventId },
            data: { judgingOpen: !event.judgingOpen },
          }).catch((err) => console.warn('Toggle judging failed:', err.message));
          writeAudit(prisma, req, user, {
            action: 'update', resourceType: 'event', resourceId: eventId,
            resourceLabel: `${event.title} — judging ${event.judgingOpen ? 'closed' : 'opened'}`,
            locationSlug: event.location?.slug || null,
          });
          redirect(res, `/admin/events/${eventId}/signups?msg=` + encodeURIComponent(event.judgingOpen ? 'success|Scoring closed.' : 'success|Scoring opened — judges can now submit.'));
          return true;
        }

        // Promote a waitlisted signup to confirmed (approved) and notify them.
        if (action === 'promoteWaitlist' && signupId) {
          const target = await prisma.eventSignup.findFirst({ where: { id: signupId, eventId } }).catch(() => null);
          if (!target) {
            redirect(res, `/admin/events/${eventId}/signups?msg=` + encodeURIComponent('error|Signup not found.'));
            return true;
          }
          await prisma.eventSignup.update({
            where: { id: signupId },
            data: { status: 'approved', approvedBy: user.email, approvedAt: new Date() },
          }).catch((err) => console.warn('Promote waitlist failed:', err.message));
          writeAudit(prisma, req, user, {
            action: 'promote', resourceType: 'eventSignup', resourceId: signupId,
            resourceLabel: `${target.name || ''} — ${event.title}`,
            locationSlug: event.location?.slug || null,
          });
          if (target.email) {
            const dateStr = formatEventDateForEmail(event);
            sendEmailViaGoogle({
              to: target.email,
              subject: `A spot opened up: ${event.title}`,
              body: [
                `Hi ${target.name || 'there'},`,
                '',
                `Good news — a spot just opened up for "${event.title}" and you're confirmed off the waitlist.`,
                dateStr ? `Event: ${dateStr}` : null,
                '',
                `— Dram & Draught ${event.location?.name || ''}`,
              ].filter(Boolean).join('\n'),
            }).catch((err) => console.warn('Waitlist promote email failed:', err.message));
          }
          redirect(res, `/admin/events/${eventId}/signups?msg=promoted`);
          return true;
        }

        if ((action === 'approveSignup' || action === 'rejectSignup') && signupId) {
          const decisionParam = action === 'approveSignup' ? 'approve' : 'reject';
          redirect(res, `/admin/events/${eventId}/signups?decision=${decisionParam}&signupId=${encodeURIComponent(signupId)}`);
          return true;
        }

        if (action === 'sendDecision' && signupId) {
          const decisionValue = String(body.decision || '').toLowerCase();
          const isApprove = decisionValue === 'approve';
          if (!isApprove && decisionValue !== 'reject') {
            redirect(res, `/admin/events/${eventId}/signups?msg=` + encodeURIComponent('error|Invalid decision.'));
            return true;
          }
          const reason = isApprove ? null : (String(body.rejectionReason || '').trim().slice(0, 500) || null);
          const subject = String(body.emailSubject || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 200);
          const emailBody = String(body.emailBody || '').replace(/\r\n/g, '\n').trim().slice(0, 5000);
          if (!subject || !emailBody) {
            const signup = await prisma.eventSignup.findFirst({ where: { id: signupId, eventId } }).catch(() => null);
            if (!signup) {
              redirect(res, `/admin/events/${eventId}/signups?msg=` + encodeURIComponent('error|Signup not found.'));
              return true;
            }
            const fallback = buildVendorDecisionEmail(event, signup, decisionValue, reason || '');
            sendHTML(res, 400, eventSignupDecisionView(event, signup, decisionValue, {
              subject: subject || fallback.subject,
              body: emailBody || fallback.body,
            }, user, 'error|Subject and email body are required.'));
            return true;
          }

          const targetSignup = await prisma.eventSignup.findFirst({ where: { id: signupId, eventId } }).catch(() => null);
          if (!targetSignup) {
            redirect(res, `/admin/events/${eventId}/signups?msg=` + encodeURIComponent('error|Signup not found.'));
            return true;
          }

          let updated = null;
          try {
            updated = await prisma.eventSignup.update({
              where: { id: signupId },
              data: {
                status: isApprove ? 'approved' : 'rejected',
                approvedBy: user.email,
                approvedAt: new Date(),
                rejectionReason: reason,
              },
            });
          } catch (err) {
            console.error('Error updating signup status:', err.message);
            redirect(res, `/admin/events/${eventId}/signups?msg=` + encodeURIComponent('error|Could not update status.'));
            return true;
          }

          writeAudit(prisma, req, user, {
            action: isApprove ? 'approve' : 'reject',
            resourceType: 'eventSignup',
            resourceId: signupId,
            resourceLabel: `${updated?.name || ''} — ${event.title}`,
            locationSlug: event.location?.slug || null,
            details: { ...(reason ? { reason } : {}), emailSubject: subject, emailFrom: user.email },
          });

          // Best-effort email to the vendor with the decision, sent as the admin
          // who made the call when domain-wide delegation allows it.
          if (updated && updated.email) {
            try {
              await sendEmailViaGoogle({
                to: updated.email,
                subject,
                body: emailBody,
                from: user.email,
              }).catch((err) => console.warn('Vendor decision email failed:', err.message));
            } catch (err) {
              console.warn('Vendor decision email error:', err.message);
            }
          }

          redirect(res, `/admin/events/${eventId}/signups?msg=` + encodeURIComponent(isApprove ? 'approved' : 'rejected'));
          return true;
        }
      }

      // Scope to a chosen occurrence — default to the current (live) one.
      // ?occ=<id> selects a past date; ?occ=all shows the full history.
      const occParam = String(parsedDecisionUrl.searchParams.get('occ') || '').trim();
      const selectedOcc = occParam || event.currentOccurrenceId || null;
      const signupWhere = { eventId };
      if (selectedOcc && occParam !== 'all') signupWhere.occurrenceId = selectedOcc;
      const signups = await prisma.eventSignup.findMany({
        where: signupWhere,
        orderBy: { createdAt: 'desc' },
      });
      sendHTML(res, 200, eventSignupsView(event, signups, user, flashMsg, {
        occurrences: event.occurrences || [],
        currentOccurrenceId: event.currentOccurrenceId,
        selectedOcc: occParam === 'all' ? 'all' : selectedOcc,
      }));
      return true;
    }

    // POST: update, delete, or section CRUD
    if (req.method === 'POST') {
      const body = await parseBody(req);
      const action = body._action || '';

      if (action === 'delete') {
        await prisma.event.delete({ where: { id: eventId } }).catch((err) => {
          console.error('Error deleting event:', err.message);
        });
        writeAudit(prisma, req, user, {
          action: 'delete', resourceType: 'event', resourceId: eventId,
          resourceLabel: event.title, locationSlug: event.location?.slug || null,
        });
        redirect(res, '/admin/events?msg=deleted');
        return true;
      }

      if (action === 'duplicate') {
        // Make a copy of this event with a fresh slug. Doesn't copy signups.
        const baseSlug = await ensureUniqueSlug(prisma, event.locationId, event.slug + '-copy');
        try {
          const copy = await prisma.event.create({
            data: {
              locationId: event.locationId,
              slug: baseSlug,
              title: event.title + ' (copy)',
              description: event.description,
              startDate: event.startDate,
              endDate: event.endDate,
              image: event.image,
              promoteFrom: event.promoteFrom,
              promoteUntil: event.promoteUntil,
              capacity: event.capacity,
              signupsEnabled: event.signupsEnabled,
              collectEmail: event.collectEmail,
              collectPhone: event.collectPhone,
              collectPartySize: event.collectPartySize,
              collectNotes: event.collectNotes,
              customQuestions: event.customQuestions || undefined,
              sections: event.sections || undefined,
              confirmationMessage: event.confirmationMessage,
              notifyEmail: event.notifyEmail,
              isActive: false, // Default new copies to inactive so they don't go live immediately
              isCancelled: false,
            },
          });
          writeAudit(prisma, req, user, {
            action: 'duplicate', resourceType: 'event', resourceId: copy.id,
            resourceLabel: copy.title, locationSlug: event.location?.slug || null,
            details: { copiedFromId: eventId },
          });
          redirect(res, `/admin/events/${copy.id}?msg=created`);
          return true;
        } catch (err) {
          console.error('Error duplicating event:', err.message || err);
          redirect(res, `/admin/events/${eventId}?msg=` + encodeURIComponent('error|' + (err.message || 'Could not duplicate.')));
          return true;
        }
      }

      // ─── Recurring-event actions ───
      if (action === 'rollover') {
        // Manually advance to the next date now: archive current signups, open
        // the next occurrence, email the series. Optional explicit date.
        const manualDate = body.rolloverDate ? parseDateTimeLocal(body.rolloverDate) : null;
        const result = await rolloverEvent(prisma, event, { trigger: 'manual', manualDate })
          .catch((err) => ({ ok: false, reason: err.message }));
        if (result.ok) {
          writeAudit(prisma, req, user, {
            action: 'rollover', resourceType: 'event', resourceId: eventId,
            resourceLabel: event.title, locationSlug: event.location?.slug || null,
            details: { invitesSent: result.invitesSent },
          });
          redirect(res, `/admin/events/${eventId}?msg=` + encodeURIComponent(`success|Rolled over to the next date. ${result.invitesSent || 0} invite${result.invitesSent === 1 ? '' : 's'} sent.`));
        } else {
          const why = result.reason === 'no-next-date'
            ? 'No next date available — add a repeat rule or enter a date to roll over to.'
            : 'Could not roll over.';
          redirect(res, `/admin/events/${eventId}?msg=` + encodeURIComponent('error|' + why));
        }
        return true;
      }

      if (action === 'announce') {
        // Manually email everyone who's signed up across the series about the
        // current (live) date — e.g. after adding a newly-announced date.
        const sent = await announceToSeries(prisma, eventId).catch((err) => {
          console.warn('[events] announce failed:', err.message);
          return 0;
        });
        writeAudit(prisma, req, user, {
          action: 'announce', resourceType: 'event', resourceId: eventId,
          resourceLabel: event.title, locationSlug: event.location?.slug || null,
          details: { sent },
        });
        redirect(res, `/admin/events/${eventId}?msg=` + encodeURIComponent(`success|Emailed ${sent} past signup${sent === 1 ? '' : 's'} about this date.`) + '#repeat');
        return true;
      }

      if (action === 'addOccurrence') {
        const when = parseDateTimeLocal(body.occurrenceDate);
        if (!when) { redirect(res, `/admin/events/${eventId}?msg=error#repeat`); return true; }
        const maxSeq = await prisma.eventOccurrence.aggregate({ where: { eventId }, _max: { sequence: true } });
        await prisma.eventOccurrence.create({
          data: { eventId, startDate: when, endDate: parseDateTimeLocal(body.occurrenceEndDate), sequence: (maxSeq._max.sequence || 0) + 1, origin: 'manual' },
        }).catch((err) => console.warn('[events] add occurrence failed:', err.message));
        redirect(res, `/admin/events/${eventId}?msg=saved#repeat`);
        return true;
      }

      if (action === 'deleteOccurrence') {
        const occId = String(body.occurrenceId || '').trim();
        // Never delete the current (live) occurrence; archived/past ones keep
        // their signup history, so only remove future, un-attended dates.
        if (occId && occId !== event.currentOccurrenceId) {
          const occ = await prisma.eventOccurrence.findFirst({
            where: { id: occId, eventId }, include: { _count: { select: { signups: true } } },
          }).catch(() => null);
          if (occ && (occ._count?.signups || 0) === 0 && !occ.rolledOverAt) {
            await prisma.eventOccurrence.delete({ where: { id: occId } }).catch(() => {});
          }
        }
        redirect(res, `/admin/events/${eventId}?msg=saved#repeat`);
        return true;
      }

      // ─── Section actions ───
      // (Re)build the page sections from the stored source description with AI.
      // Replaces existing sections; the source text and the rest of the event
      // are untouched. Runs synchronously (admin clicked a button and waits).
      if (action === 'generateDesign') {
        const source = event.sourceDescription || event.description || '';
        if (String(source).trim().length < 40) {
          redirect(res, `/admin/events/${eventId}?msg=` + encodeURIComponent('error|Not enough source text to generate a design.') + '#page');
          return true;
        }
        const loc = locations.find(l => l.id === event.locationId);
        const dateText = event.startDate
          ? new Date(event.startDate).toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })
          : '';
        try {
          const { sections, summary } = await generateEventSections({
            title: event.title, description: source, dateText,
            locationName: loc ? loc.name : '', ticketUrl: event.ticketUrl || '',
          });
          if (!sections.length) {
            redirect(res, `/admin/events/${eventId}?msg=` + encodeURIComponent('error|AI returned no usable sections — try again, or build the page manually.') + '#page');
            return true;
          }
          const data = { sections };
          // Only set the public description from the summary if it's still empty.
          if (summary && !String(event.description || '').trim()) data.description = summary;
          await prisma.event.update({ where: { id: eventId }, data });
          redirect(res, `/admin/events/${eventId}?msg=` + encodeURIComponent('success|Generated ' + sections.length + ' section' + (sections.length === 1 ? '' : 's') + ' from the source. Review and edit below.') + '#page');
        } catch (err) {
          console.warn('[event-design] manual generation failed:', err.message);
          redirect(res, `/admin/events/${eventId}?msg=` + encodeURIComponent('error|Could not generate a design right now.') + '#page');
        }
        return true;
      }

      if (action === 'addSection') {
        const newSection = buildSectionFromForm(body);
        if (!newSection) { redirect(res, `/admin/events/${eventId}?msg=error#sections`); return true; }
        const next = [...getSections(event), newSection];
        await prisma.event.update({ where: { id: eventId }, data: { sections: next } });
        redirect(res, `/admin/events/${eventId}?msg=saved#sections`);
        return true;
      }

      if (action === 'editSection') {
        const sectionId = String(body.sectionId || '');
        if (!sectionId) { redirect(res, `/admin/events/${eventId}#sections`); return true; }
        const sections = getSections(event);
        const idx = sections.findIndex(s => s.id === sectionId);
        if (idx === -1) { redirect(res, `/admin/events/${eventId}#sections`); return true; }
        const updated = buildSectionFromForm(body, sectionId);
        if (!updated) { redirect(res, `/admin/events/${eventId}?msg=error#sections`); return true; }
        const next = [...sections];
        next[idx] = updated;
        await prisma.event.update({ where: { id: eventId }, data: { sections: next } });
        redirect(res, `/admin/events/${eventId}?msg=saved#sections`);
        return true;
      }

      if (action === 'deleteSection') {
        const sectionId = String(body.sectionId || '');
        const next = getSections(event).filter(s => s.id !== sectionId);
        await prisma.event.update({ where: { id: eventId }, data: { sections: next } });
        redirect(res, `/admin/events/${eventId}?msg=deleted#sections`);
        return true;
      }

      if (action === 'duplicateSection') {
        const sectionId = String(body.sectionId || '');
        const sections = getSections(event);
        const idx = sections.findIndex(s => s.id === sectionId);
        if (idx === -1) { redirect(res, `/admin/events/${eventId}#sections`); return true; }
        const copy = cloneSection(sections[idx]);
        if (!copy) { redirect(res, `/admin/events/${eventId}?msg=error#sections`); return true; }
        const next = [...sections];
        next.splice(idx + 1, 0, copy);
        await prisma.event.update({ where: { id: eventId }, data: { sections: next } });
        redirect(res, `/admin/events/${eventId}?msg=saved#sections`);
        return true;
      }

      if (action === 'moveSection') {
        const sectionId = String(body.sectionId || '');
        const direction = String(body.direction || '');
        const sections = [...getSections(event)];
        const idx = sections.findIndex(s => s.id === sectionId);
        if (idx === -1) { redirect(res, `/admin/events/${eventId}#sections`); return true; }
        if (direction === 'top' && idx > 0) {
          const [item] = sections.splice(idx, 1);
          sections.unshift(item);
          await prisma.event.update({ where: { id: eventId }, data: { sections } });
        } else if (direction === 'bottom' && idx < sections.length - 1) {
          const [item] = sections.splice(idx, 1);
          sections.push(item);
          await prisma.event.update({ where: { id: eventId }, data: { sections } });
        } else {
          const swapWith = direction === 'up' ? idx - 1 : idx + 1;
          if (swapWith >= 0 && swapWith < sections.length) {
            [sections[idx], sections[swapWith]] = [sections[swapWith], sections[idx]];
            await prisma.event.update({ where: { id: eventId }, data: { sections } });
          }
        }
        redirect(res, `/admin/events/${eventId}?msg=reordered#sections`);
        return true;
      }

      // Default = update event metadata
      const editFlashError = (detail) => `/admin/events/${eventId}?msg=` + encodeURIComponent('error|' + detail);
      const title = normalizeText(body.title);
      if (!title) { redirect(res, editFlashError('Event name is required.')); return true; }

      const customQuestions = parseCustomQuestions(body);
      const judging = parseJudgingConfig(body);
      // Generate a judge link the first time a comp is fully configured.
      const judgeToken = (judging.criteria.length > 0 && judging.judges.length > 0)
        ? (event.judgeToken || makeJudgeToken())
        : (event.judgeToken || null);

      // Allow moving the event to a different location (e.g. saved to the wrong
      // one). Validate it's a real location the user can manage.
      let targetLocationId = event.locationId;
      const requestedLoc = normalizeText(body.locationId);
      if (requestedLoc && requestedLoc !== event.locationId) {
        if (!locations.some(l => l.id === requestedLoc)) {
          redirect(res, editFlashError('Unknown location.')); return true;
        }
        if (!userIsCompanyWide && !allowedLocationIds.has(requestedLoc)) {
          redirect(res, editFlashError('You can only move events to your own location.')); return true;
        }
        targetLocationId = requestedLoc;
      }
      const locationChanged = targetLocationId !== event.locationId;

      // Re-check slug uniqueness whenever the slug OR the location changes
      // (slugs are unique per location).
      const desiredSlug = body.slug ? slugify(body.slug) : event.slug;
      const slug = (desiredSlug !== event.slug || locationChanged)
        ? await ensureUniqueSlug(prisma, targetLocationId, desiredSlug || slugify(title), eventId)
        : event.slug;
      const imageValue = await resolveEventImage(body.image, slug);
      const recurrence = parseRecurrenceFromBody(body);

      try {
        await prisma.event.update({
          where: { id: eventId },
          data: {
            title,
            slug,
            locationId: targetLocationId,
            description: normalizeText(body.description) || null,
            startDate: parseDateTimeLocal(body.startDate) || event.startDate,
            endDate: parseDateTimeLocal(body.endDate),
            image: imageValue,
            promoteFrom: parseDateTimeLocal(body.promoteFrom),
            promoteUntil: parseDateTimeLocal(body.promoteUntil),
            capacity: parseCapacity(body.capacity),
            signupsEnabled: body.signupsEnabled === 'on',
            collectEmail: body.collectEmail === 'on',
            collectPhone: body.collectPhone === 'on',
            collectPartySize: body.collectPartySize === 'on',
            collectNotes: body.collectNotes === 'on',
            customQuestions: customQuestions.length > 0 ? customQuestions : null,
            confirmationMessage: normalizeText(body.confirmationMessage) || null,
            notifyEmail: normalizeText(body.notifyEmail) || null,
            isActive: body.isActive === 'on',
            isCancelled: body.isCancelled === 'on',
            isRecurring: recurrence.isRecurring,
            recurrenceRule: recurrence.recurrenceRule || null,
            signupType: SIGNUP_TYPES.includes(String(body.signupType)) ? String(body.signupType) : (event.signupType || 'guest'),
            isVendorEvent: String(body.signupType) === 'vendor',
            judgingCriteria: judging.criteria.length > 0 ? judging.criteria : null,
            judges: judging.judges.length > 0 ? judging.judges : null,
            finalistTarget: judging.finalistTarget,
            judgeToken,
            groupKey: normalizeText(body.groupKey) || null,
            ticketUrl: normalizeTicketUrl(body.ticketUrl),
            ticketProvider: detectTicketProvider(body.ticketUrl),
            remindersEnabled: body.remindersEnabled === 'on',
            themeKey: normalizeThemeKey(body.themeKey),
            spotsLeftMode: normalizeSpotsLeftMode(body.spotsLeftMode),
            bannerStyle: normalizeBannerStyle(body.bannerStyle),
          },
        });
        // Reconcile occurrence rows with the saved dates + rule.
        await materializeOccurrences(prisma, eventId).catch((err) =>
          console.warn('[events] materialize after update failed:', err.message));
        if (recurrence.mode === 'dates') {
          await syncManualOccurrences(prisma, eventId, recurrence.dates).catch((err) =>
            console.warn('[events] sync dates after update failed:', err.message));
        }
        writeAudit(prisma, req, user, {
          action: 'update', resourceType: 'event', resourceId: eventId,
          resourceLabel: title, locationSlug: event.location?.slug || null,
        });
        redirect(res, `/admin/events/${eventId}?msg=saved`);
        return true;
      } catch (err) {
        console.error('Error updating event:', err.message || err);
        redirect(res, editFlashError(err.message || 'Database error.'));
        return true;
      }
    }

    // GET: show editor
    const flashMsg = getFlashMsg(req.url);
    const signupCount = await prisma.eventSignup.count({
      where: { eventId, ...(event.currentOccurrenceId ? { occurrenceId: event.currentOccurrenceId } : {}) },
    }).catch(() => 0);
    const groupOptions = await buildGroupOptions(prisma, locations, eventId);
    sendHTML(res, 200, eventEditor(event, locations, user, flashMsg, signupCount, {
      groupOptions,
      autoKey: eventIdentityKey(event.title, event.startDate),
    }));
    return true;
  }

  return false;
}

module.exports = { handleAdminEvents };
