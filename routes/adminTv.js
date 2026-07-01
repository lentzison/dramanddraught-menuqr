const { sendHTML, sendJSON, parseBody, redirect, getFlashMsg, uploadImageToMedia } = require('../helpers');
const { requireAuth, isCompanyWide, getUserLocationSlugs } = require('../auth');
const { tvBoardsList, tvBoardEditor } = require('../views/adminTvViews');
const { generateTvBoardPage } = require('../views/tvBoardPage');
const { isCuratedType } = require('../views/tvModules');
const { loadTvBoardData } = require('./public');
const { sanitizeImageSrc } = require('../views/imageUploadWidget');
const { parseOverrideDate } = require('../dateEastern');
const { writeAudit } = require('../auditLog');

// Boards carry inline base64 images (logo + Image modules, ~1MB each encoded),
// so the save/preview POST bodies run well past the 4MB parseBody default.
const BOARD_BODY_LIMIT = { maxBytes: 16 * 1024 * 1024 };
const BODY_TOO_LARGE_MSG = 'That board is too large to send — remove some uploaded images or use hosted image URLs instead.';

const VALID_TYPES = new Set(['specials', 'draft', 'events', 'flights', 'bottles', 'picks', 'message', 'image']);

function flashRedirect(res, baseUrl, type, text) {
  const sep = baseUrl.includes('?') ? '&' : '?';
  redirect(res, `${baseUrl}${sep}msg=${encodeURIComponent(`${type}|${text}`)}`);
}

function decodeFlash(req) {
  const msg = getFlashMsg(req.url);
  if (!msg) return null;
  const raw = String(msg);
  const idx = raw.indexOf('|');
  if (idx > 0) return { type: raw.slice(0, idx), text: raw.slice(idx + 1) };
  return { type: 'success', text: raw };
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

async function ensureUniqueSlug(prisma, locationId, base, excludeId) {
  let slug = base || 'board';
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? slug : `${slug}-${i + 1}`;
    const existing = await prisma.tvBoard.findFirst({
      where: { locationId, slug: candidate, ...(excludeId ? { NOT: { id: excludeId } } : {}) },
      select: { id: true },
    }).catch(() => null);
    if (!existing) return candidate;
  }
  return `${slug}-${Date.now()}`;
}

function clampInt(value, min, max, fallback) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function trimOrUndef(value, max) {
  const v = String(value == null ? '' : value).trim().slice(0, max);
  return v || undefined;
}

// Optional per-module schedule (dayparting), all fields optional:
// { days: [0..6], start: "HH:MM", end: "HH:MM", until: "YYYY-MM-DD" } —
// interpreted in Eastern wall time by isModuleVisibleNow on the display side.
function parseSchedule(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const out = {};
  const days = Array.isArray(raw.days)
    ? [...new Set(raw.days.map((d) => parseInt(d, 10)).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort((a, b) => a - b)
    : [];
  if (days.length > 0 && days.length < 7) out.days = days;
  const hhmm = (v) => {
    const m = String(v || '').match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
    return m ? `${m[1].padStart(2, '0')}:${m[2]}` : null;
  };
  const start = hhmm(raw.start); if (start) out.start = start;
  // Keep end even when it equals start (display treats that as always-on) so
  // what the admin typed round-trips instead of silently becoming start-only.
  const end = hhmm(raw.end); if (end) out.end = end;
  // parseOverrideDate rejects calendar-impossible dates like 2026-02-31.
  const until = parseOverrideDate(String(raw.until || '')) ? String(raw.until) : null;
  if (until) out.until = until;
  return Object.keys(out).length ? out : null;
}

// The board-level fields shared by create, update, and preview — one builder
// so the live preview can never drift from what a save would store.
function boardFieldsFromBody(body) {
  return {
    name: String(body.name || '').trim().slice(0, 80),
    orientation: body.orientation === 'landscape' ? 'landscape' : 'portrait',
    rotateSeconds: clampInt(body.rotateSeconds, 4, 120, 15),
    isActive: body.isActive === 'on',
    modules: parseModules(body.modulesJson),
  };
}

// Parse + validate the client-serialized modules JSON into a clean array.
function parseModules(raw) {
  let arr;
  try { arr = JSON.parse(raw || '[]'); } catch { arr = []; }
  if (!Array.isArray(arr)) arr = [];
  let pinnedUsed = false;
  const out = [];
  for (let i = 0; i < arr.length && out.length < 20; i++) {
    const m = arr[i];
    if (!m || !VALID_TYPES.has(m.type)) continue;
    const mod = { id: (String(m.id || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40)) || `m${i}_${Math.random().toString(36).slice(2, 8)}`, type: m.type };
    const title = trimOrUndef(m.title, 60); if (title) mod.title = title;
    const sec = parseInt(m.seconds, 10); if (Number.isFinite(sec) && sec > 0) mod.seconds = Math.min(120, Math.max(4, sec));
    if (m.pinned && !pinnedUsed) { mod.pinned = true; pinnedUsed = true; }
    const schedule = parseSchedule(m.schedule); if (schedule) mod.schedule = schedule;
    if (m.type === 'picks') {
      mod.items = (Array.isArray(m.items) ? m.items : [])
        .filter((it) => it && String(it.name || '').trim())
        .slice(0, 30)
        .map((it) => {
          const item = { name: String(it.name).trim().slice(0, 80) };
          const d = trimOrUndef(it.description, 160); if (d) item.description = d;
          const by = trimOrUndef(it.by, 40); if (by) item.by = by;
          const price = trimOrUndef(it.price, 20); if (price) item.price = price;
          return item;
        });
    }
    if (m.type === 'draft') {
      // Curated can/bottle beers shown beneath the live draught taps.
      const cans = (Array.isArray(m.cans) ? m.cans : [])
        .filter((c) => c && String(c.name || '').trim())
        .slice(0, 20)
        .map((c) => {
          const item = { name: String(c.name).trim().slice(0, 80) };
          const brewery = trimOrUndef(c.brewery, 60); if (brewery) item.brewery = brewery;
          const style = trimOrUndef(c.style, 60); if (style) item.style = style;
          const abv = trimOrUndef(c.abv, 10); if (abv) item.abv = abv;
          const price = trimOrUndef(c.price, 20); if (price) item.price = price;
          return item;
        });
      if (cans.length) mod.cans = cans;
    }
    if (m.type === 'message') {
      const heading = trimOrUndef(m.heading, 80); if (heading) mod.heading = heading;
      const body = trimOrUndef(m.body, 300); if (body) mod.body = body;
    }
    if (m.type === 'image') {
      const img = sanitizeImageSrc(m.image); if (img) mod.image = img;
      const caption = trimOrUndef(m.caption, 120); if (caption) mod.caption = caption;
      mod.fit = m.fit === 'cover' ? 'cover' : 'contain';
    }
    out.push(mod);
  }
  return out;
}

// Push any inline data-URL image into the media library and swap in the hosted
// URL; already-hosted URLs (and data URLs when media isn't configured) pass
// through unchanged. Covers the board logo + every Image module.
async function uploadIfDataUrl(src, tags) {
  if (!src) return null;
  if (!/^data:/i.test(src)) return src;
  const uploaded = await uploadImageToMedia(src, { collection: 'tv-boards', tags: tags || '' });
  return (uploaded && uploaded.url) ? uploaded.url : src;
}

// The editor preview re-renders on a short debounce while someone types, but
// the live feeds (own DB + external bartender DB) can't have changed keystroke
// to keystroke — cache the loaded data briefly per location + module-type set.
const PREVIEW_DATA_TTL_MS = 30 * 1000;
const previewDataCache = new Map();

async function loadPreviewData(prisma, location, board) {
  const types = [...new Set((board.modules || []).map((m) => m && m.type).filter(Boolean))].sort();
  const key = `${location.id}:${types.join(',')}`;
  const hit = previewDataCache.get(key);
  if (hit && Date.now() - hit.at < PREVIEW_DATA_TTL_MS) return hit.data;
  const data = await loadTvBoardData(prisma, location, board).catch(() => ({}));
  previewDataCache.set(key, { at: Date.now(), data });
  return data;
}

async function resolveBoardMedia(modules, logoRaw, slug) {
  const logo = await uploadIfDataUrl(sanitizeImageSrc(logoRaw), slug);
  for (const m of modules) {
    if (m.type === 'image' && m.image) {
      m.image = await uploadIfDataUrl(m.image, slug);
    }
  }
  return { logo, modules };
}

async function handleAdminTv(req, res, pathname, prisma) {
  if (!pathname.startsWith('/admin/tv')) return false;

  const user = requireAuth(req, res);
  if (!user) { redirect(res, '/admin/login'); return true; }
  if (!prisma || !prisma.tvBoard) { sendHTML(res, 500, '<p>DB not available</p>'); return true; }

  const userIsCompanyWide = isCompanyWide(user);
  const userSlugs = userIsCompanyWide ? null : getUserLocationSlugs(user);

  const locWhere = { isActive: true };
  if (!userIsCompanyWide) {
    locWhere.slug = { in: userSlugs.length ? userSlugs : ['__none__'] };
  }
  const locations = await prisma.location.findMany({
    where: locWhere,
    orderBy: { name: 'asc' },
    select: { id: true, slug: true, name: true },
  }).catch(() => []);
  const allowedLocationIds = new Set(locations.map((l) => l.id));
  if (locations.length === 0 && !userIsCompanyWide) {
    sendHTML(res, 403, '<h1>No location access</h1><p>Your account isn\'t assigned to a location yet.</p>');
    return true;
  }
  const canPickLocation = locations.length > 1;

  // ─── Delete: POST /admin/tv/:id/delete ───
  const deleteMatch = pathname.match(/^\/admin\/tv\/([0-9a-f-]{8,})\/delete$/i);
  if (deleteMatch && req.method === 'POST') {
    const id = deleteMatch[1];
    const board = await prisma.tvBoard.findUnique({ where: { id }, include: { location: true } }).catch(() => null);
    if (!board || (!userIsCompanyWide && !allowedLocationIds.has(board.locationId))) {
      sendHTML(res, 404, '<h1>Not found</h1>');
      return true;
    }
    await prisma.tvBoard.delete({ where: { id } });
    writeAudit(prisma, req, user, { action: 'delete', resourceType: 'tv_board', resourceId: id, resourceLabel: board.name }).catch(() => {});
    flashRedirect(res, `/admin/tv${board.location ? `?location=${encodeURIComponent(board.location.slug)}` : ''}`, 'success', 'Board deleted.');
    return true;
  }

  // ─── Duplicate: POST /admin/tv/:id/duplicate ───
  // Creates a hidden copy (same location) and opens it in the editor — from
  // there the location dropdown moves it to another bar if that's the goal.
  const dupMatch = pathname.match(/^\/admin\/tv\/([0-9a-f-]{8,})\/duplicate$/i);
  if (dupMatch && req.method === 'POST') {
    const id = dupMatch[1];
    const board = await prisma.tvBoard.findUnique({ where: { id } }).catch(() => null);
    if (!board || (!userIsCompanyWide && !allowedLocationIds.has(board.locationId))) {
      sendHTML(res, 404, '<h1>Not found</h1>');
      return true;
    }
    const name = `${board.name} (copy)`.slice(0, 80);
    const slug = await ensureUniqueSlug(prisma, board.locationId, slugify(name) || board.slug, null);
    const created = await prisma.tvBoard.create({
      data: {
        locationId: board.locationId,
        name,
        slug,
        logo: board.logo,
        orientation: board.orientation,
        rotateSeconds: board.rotateSeconds,
        isActive: false, // hidden until reviewed, so it never hits the TV picker half-baked
        modules: board.modules,
      },
    });
    writeAudit(prisma, req, user, { action: 'create', resourceType: 'tv_board', resourceId: created.id, resourceLabel: `${name} (duplicate of ${board.name})` }).catch(() => {});
    flashRedirect(res, `/admin/tv/${created.id}`, 'success', 'Board duplicated — it\'s hidden until you activate it. To copy it to another location, switch the location below and save.');
    return true;
  }

  // ─── Live preview: POST /admin/tv/preview ───
  // Renders the full TV page for the editor's current (possibly unsaved) form
  // state; the editor drops the HTML into an <iframe srcdoc>. Inline data-URL
  // images are previewed as-is — nothing is uploaded to the media library.
  if (pathname === '/admin/tv/preview' && req.method === 'POST') {
    let body;
    try { body = await parseBody(req, BOARD_BODY_LIMIT); }
    catch {
      // 200 with a message page so the iframe shows why instead of silently freezing.
      sendHTML(res, 200, `<body style="font-family:sans-serif;background:#0d0e10;color:#a7a3a0;padding:40px;font-size:28px">${BODY_TOO_LARGE_MSG}</body>`);
      return true;
    }
    const locationId = String(body.locationId || '').trim();
    const location = locations.find((l) => l.id === locationId) || locations[0];
    if (!location) { sendHTML(res, 400, '<p>No location available.</p>'); return true; }
    const fields = boardFieldsFromBody(body);
    const board = {
      id: 'preview',
      locationId: location.id,
      slug: 'preview',
      logo: sanitizeImageSrc(body.logo) || null,
      ...fields,
      name: fields.name || 'Preview',
      isActive: true,
      updatedAt: new Date(),
    };
    const data = await loadPreviewData(prisma, location, board);
    sendHTML(res, 200, generateTvBoardPage(location, board, data, { portrait: board.orientation !== 'landscape', preview: true }));
    return true;
  }

  // ─── Live-data sample: GET /admin/tv/live-sample?location=<id>&type=<type> ───
  // A peek at what a live module is pulling right now, shown inline in the
  // editor so nobody has to walk to a TV to sanity-check a feed.
  if (pathname === '/admin/tv/live-sample') {
    const url = new URL(req.url, 'http://x');
    const locationId = String(url.searchParams.get('location') || '');
    const type = String(url.searchParams.get('type') || '');
    const location = locations.find((l) => l.id === locationId);
    // Every non-curated (live) module type has a sample; curated ones store
    // their own content, so there's nothing to peek at.
    if (!location || !VALID_TYPES.has(type) || isCuratedType(type)) {
      sendJSON(res, 400, { ok: false, items: [] });
      return true;
    }
    const data = await loadTvBoardData(prisma, location, { modules: [{ id: 's', type }] }).catch(() => ({}));
    let items = [];
    if (type === 'specials') items = ((data.specials && data.specials.items) || []).map((i) => i.name);
    else if (type === 'draft') items = ((data.draft && data.draft.items) || []).map((i) => i.beerName);
    else if (type === 'events') items = (data.events || []).map((e) => e.title);
    else if (type === 'flights') items = (data.flights || []).map((f) => f.theme || 'Flight');
    else if (type === 'bottles') items = (data.bottles || []).map((b) => b.name);
    items = items.filter(Boolean).slice(0, 6).map((s) => String(s).slice(0, 60));
    res.setHeader('Cache-Control', 'no-store');
    sendJSON(res, 200, { ok: true, type, items });
    return true;
  }

  // ─── New: GET form, POST create ───
  if (pathname === '/admin/tv/new') {
    if (req.method === 'POST') {
      let body;
      try { body = await parseBody(req, BOARD_BODY_LIMIT); }
      catch { flashRedirect(res, '/admin/tv/new', 'error', BODY_TOO_LARGE_MSG); return true; }
      const fields = boardFieldsFromBody(body);
      if (!fields.name) { flashRedirect(res, '/admin/tv/new', 'error', 'Board name is required.'); return true; }
      const locationId = String(body.locationId || '').trim();
      if (!locationId || !allowedLocationIds.has(locationId)) { flashRedirect(res, '/admin/tv/new', 'error', 'Pick a valid location.'); return true; }
      const slugBase = slugify(body.slug) || slugify(fields.name);
      const slug = await ensureUniqueSlug(prisma, locationId, slugBase, null);
      const { logo, modules } = await resolveBoardMedia(fields.modules, body.logo, slug);
      const created = await prisma.tvBoard.create({
        data: { ...fields, locationId, slug, logo, modules },
      });
      writeAudit(prisma, req, user, { action: 'create', resourceType: 'tv_board', resourceId: created.id, resourceLabel: fields.name }).catch(() => {});
      flashRedirect(res, `/admin/tv/${created.id}`, 'success', 'Board created.');
      return true;
    }
    const url = new URL(req.url, 'http://x');
    const defaultLocationSlug = url.searchParams.get('location') || (locations[0] && locations[0].slug) || '';
    sendHTML(res, 200, tvBoardEditor({ board: null, locations, user, flashMsg: decodeFlash(req), defaultLocationSlug, canPickLocation }));
    return true;
  }

  // ─── Edit: GET /admin/tv/:id, POST update ───
  const editMatch = pathname.match(/^\/admin\/tv\/([0-9a-f-]{8,})$/i);
  if (editMatch) {
    const id = editMatch[1];
    const board = await prisma.tvBoard.findUnique({
      where: { id },
      include: { location: { select: { id: true, slug: true, name: true } } },
    }).catch(() => null);
    if (!board || (!userIsCompanyWide && !allowedLocationIds.has(board.locationId))) {
      sendHTML(res, 404, '<h1>Not found</h1>');
      return true;
    }
    if (req.method === 'POST') {
      let body;
      try { body = await parseBody(req, BOARD_BODY_LIMIT); }
      catch { flashRedirect(res, `/admin/tv/${id}`, 'error', BODY_TOO_LARGE_MSG); return true; }
      const fields = boardFieldsFromBody(body);
      if (!fields.name) { flashRedirect(res, `/admin/tv/${id}`, 'error', 'Board name is required.'); return true; }
      let locationId = board.locationId;
      if (canPickLocation && body.locationId) {
        const candidate = String(body.locationId).trim();
        if (allowedLocationIds.has(candidate)) locationId = candidate;
      }
      const slugBase = slugify(body.slug) || slugify(fields.name) || board.slug;
      const slug = await ensureUniqueSlug(prisma, locationId, slugBase, id);
      const { logo, modules } = await resolveBoardMedia(fields.modules, body.logo, slug);
      await prisma.tvBoard.update({
        where: { id },
        data: { ...fields, locationId, slug, logo, modules },
      });
      writeAudit(prisma, req, user, { action: 'update', resourceType: 'tv_board', resourceId: id, resourceLabel: fields.name }).catch(() => {});
      flashRedirect(res, `/admin/tv/${id}`, 'success', 'Saved.');
      return true;
    }
    sendHTML(res, 200, tvBoardEditor({ board, locations, user, flashMsg: decodeFlash(req), defaultLocationSlug: board.location?.slug || '', canPickLocation }));
    return true;
  }

  // ─── List: /admin/tv ───
  if (pathname === '/admin/tv') {
    const url = new URL(req.url, 'http://x');
    const filters = { location: url.searchParams.get('location') || '' };
    const where = userIsCompanyWide
      ? {}
      : { locationId: { in: locations.map((l) => l.id).length ? locations.map((l) => l.id) : ['__none__'] } };
    if (filters.location) {
      const loc = locations.find((l) => l.slug === filters.location);
      if (loc) where.locationId = loc.id;
    }
    const boards = await prisma.tvBoard.findMany({
      where,
      orderBy: [{ updatedAt: 'desc' }],
      include: { location: { select: { name: true, slug: true } } },
      take: 200,
    }).catch(() => []);

    sendHTML(res, 200, tvBoardsList({
      boards,
      locations,
      filters,
      user,
      flashMsg: decodeFlash(req),
      canSeeMultipleLocations: userIsCompanyWide || locations.length > 1,
    }));
    return true;
  }

  return false;
}

module.exports = { handleAdminTv };
