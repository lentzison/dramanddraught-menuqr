const { sendHTML, parseBody, redirect, getFlashMsg, uploadImageToMedia } = require('../helpers');
const { requireAuth, isCompanyWide, getUserLocationSlugs } = require('../auth');
const { tvBoardsList, tvBoardEditor } = require('../views/adminTvViews');
const { sanitizeImageSrc } = require('../views/imageUploadWidget');
const { writeAudit } = require('../auditLog');

const VALID_TYPES = new Set(['specials', 'draft', 'events', 'flights', 'bottles', 'picks', 'message']);

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
    if (m.type === 'picks') {
      mod.items = (Array.isArray(m.items) ? m.items : [])
        .filter((it) => it && String(it.name || '').trim())
        .slice(0, 12)
        .map((it) => {
          const item = { name: String(it.name).trim().slice(0, 80) };
          const d = trimOrUndef(it.description, 160); if (d) item.description = d;
          const by = trimOrUndef(it.by, 40); if (by) item.by = by;
          const price = trimOrUndef(it.price, 20); if (price) item.price = price;
          return item;
        });
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

  // ─── New: GET form, POST create ───
  if (pathname === '/admin/tv/new') {
    if (req.method === 'POST') {
      const body = await parseBody(req);
      const name = String(body.name || '').trim().slice(0, 80);
      if (!name) { flashRedirect(res, '/admin/tv/new', 'error', 'Board name is required.'); return true; }
      const locationId = String(body.locationId || '').trim();
      if (!locationId || !allowedLocationIds.has(locationId)) { flashRedirect(res, '/admin/tv/new', 'error', 'Pick a valid location.'); return true; }
      const slugBase = slugify(body.slug) || slugify(name);
      const slug = await ensureUniqueSlug(prisma, locationId, slugBase, null);
      const { logo, modules } = await resolveBoardMedia(parseModules(body.modulesJson), body.logo, slug);
      const created = await prisma.tvBoard.create({
        data: {
          locationId,
          name,
          slug,
          logo,
          rotateSeconds: clampInt(body.rotateSeconds, 4, 120, 15),
          isActive: body.isActive === 'on',
          modules,
        },
      });
      writeAudit(prisma, req, user, { action: 'create', resourceType: 'tv_board', resourceId: created.id, resourceLabel: name }).catch(() => {});
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
      const body = await parseBody(req);
      const name = String(body.name || '').trim().slice(0, 80);
      if (!name) { flashRedirect(res, `/admin/tv/${id}`, 'error', 'Board name is required.'); return true; }
      let locationId = board.locationId;
      if (canPickLocation && body.locationId) {
        const candidate = String(body.locationId).trim();
        if (allowedLocationIds.has(candidate)) locationId = candidate;
      }
      const slugBase = slugify(body.slug) || slugify(name) || board.slug;
      const slug = await ensureUniqueSlug(prisma, locationId, slugBase, id);
      const { logo, modules } = await resolveBoardMedia(parseModules(body.modulesJson), body.logo, slug);
      await prisma.tvBoard.update({
        where: { id },
        data: {
          locationId,
          name,
          slug,
          logo,
          rotateSeconds: clampInt(body.rotateSeconds, 4, 120, 15),
          isActive: body.isActive === 'on',
          modules,
        },
      });
      writeAudit(prisma, req, user, { action: 'update', resourceType: 'tv_board', resourceId: id, resourceLabel: name }).catch(() => {});
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
