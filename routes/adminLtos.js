const { sendHTML, parseBody, redirect, getFlashMsg } = require('../helpers');
const { requireAuth, isCompanyWide, getUserLocationSlugs } = require('../auth');
const { ltosList, ltoEditor, DAYS } = require('../views/adminLtosViews');
const { sanitizeImageSrc } = require('../views/imageUploadWidget');
const { writeAudit } = require('../auditLog');

const VALID_DAYS = new Set(DAYS);

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

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value == null || value === '') return [];
  return [value];
}

function parseDrinks(body) {
  const names = asArray(body.drink_name);
  const descs = asArray(body.drink_description);
  const prices = asArray(body.drink_price);
  const out = [];
  for (let i = 0; i < names.length; i++) {
    const name = String(names[i] || '').trim().slice(0, 200);
    if (!name) continue;
    const description = String(descs[i] || '').trim().slice(0, 500) || null;
    const price = String(prices[i] || '').trim().slice(0, 30) || null;
    out.push({ name, description, price, displayOrder: i });
  }
  return out;
}

function parseDateOnly(value) {
  if (!value) return null;
  const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  // Treat as Eastern midnight to keep calendar dates stable.
  const d = new Date(`${value}T00:00:00-05:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseDaysOfWeek(body) {
  const raw = asArray(body.daysOfWeek).map((v) => String(v).toUpperCase());
  return raw.filter((v) => VALID_DAYS.has(v));
}

async function handleAdminLtos(req, res, pathname, prisma) {
  if (!pathname.startsWith('/admin/ltos')) return false;

  const user = requireAuth(req, res);
  if (!user) { redirect(res, '/admin/login'); return true; }
  if (!prisma) { sendHTML(res, 500, '<p>DB not available</p>'); return true; }

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

  // ─── Delete: POST /admin/ltos/:id/delete ───
  const deleteMatch = pathname.match(/^\/admin\/ltos\/([0-9a-f-]{8,})\/delete$/i);
  if (deleteMatch && req.method === 'POST') {
    const id = deleteMatch[1];
    const lto = await prisma.limitedTimeOffer.findUnique({ where: { id }, include: { location: true } }).catch(() => null);
    if (!lto || (!userIsCompanyWide && !allowedLocationIds.has(lto.locationId))) {
      sendHTML(res, 404, '<h1>Not found</h1>');
      return true;
    }
    await prisma.limitedTimeOffer.delete({ where: { id } });
    writeAudit(prisma, req, user, {
      action: 'delete',
      resourceType: 'lto',
      resourceId: id,
      resourceLabel: lto.title,
    }).catch(() => {});
    flashRedirect(res, `/admin/ltos${lto.location ? `?location=${encodeURIComponent(lto.location.slug)}` : ''}`, 'success', 'LTO deleted.');
    return true;
  }

  // ─── New: GET form, POST create ───
  if (pathname === '/admin/ltos/new') {
    if (req.method === 'POST') {
      const body = await parseBody(req);
      const title = String(body.title || '').trim().slice(0, 200);
      if (!title) {
        flashRedirect(res, '/admin/ltos/new', 'error', 'Title is required.');
        return true;
      }
      const locationId = String(body.locationId || '').trim();
      if (!locationId || !allowedLocationIds.has(locationId)) {
        flashRedirect(res, '/admin/ltos/new', 'error', 'Pick a valid location.');
        return true;
      }
      const created = await prisma.limitedTimeOffer.create({
        data: {
          locationId,
          title,
          description: String(body.description || '').trim().slice(0, 2000) || null,
          image: sanitizeImageSrc(body.image),
          drinks: parseDrinks(body),
          daysOfWeek: parseDaysOfWeek(body),
          startDate: parseDateOnly(body.startDate),
          endDate: parseDateOnly(body.endDate),
          isActive: body.isActive === 'on',
        },
      });
      writeAudit(prisma, req, user, {
        action: 'create',
        resourceType: 'lto',
        resourceId: created.id,
        resourceLabel: title,
      }).catch(() => {});
      flashRedirect(res, `/admin/ltos/${created.id}`, 'success', 'LTO created.');
      return true;
    }
    const url = new URL(req.url, 'http://x');
    const defaultLocationSlug = url.searchParams.get('location') || (locations[0] && locations[0].slug) || '';
    sendHTML(res, 200, ltoEditor({
      lto: null,
      locations,
      user,
      flashMsg: decodeFlash(req),
      defaultLocationSlug,
      canPickLocation,
    }));
    return true;
  }

  // ─── Edit: GET /admin/ltos/:id, POST update ───
  const editMatch = pathname.match(/^\/admin\/ltos\/([0-9a-f-]{8,})$/i);
  if (editMatch) {
    const id = editMatch[1];
    const lto = await prisma.limitedTimeOffer.findUnique({
      where: { id },
      include: { location: { select: { id: true, slug: true, name: true } } },
    }).catch(() => null);
    if (!lto || (!userIsCompanyWide && !allowedLocationIds.has(lto.locationId))) {
      sendHTML(res, 404, '<h1>Not found</h1>');
      return true;
    }
    if (req.method === 'POST') {
      const body = await parseBody(req);
      const title = String(body.title || '').trim().slice(0, 200);
      if (!title) {
        flashRedirect(res, `/admin/ltos/${id}`, 'error', 'Title is required.');
        return true;
      }
      // Allow location move only if the user can access both old and new.
      let locationId = lto.locationId;
      if (canPickLocation && body.locationId) {
        const candidate = String(body.locationId).trim();
        if (allowedLocationIds.has(candidate)) locationId = candidate;
      }
      await prisma.limitedTimeOffer.update({
        where: { id },
        data: {
          locationId,
          title,
          description: String(body.description || '').trim().slice(0, 2000) || null,
          image: sanitizeImageSrc(body.image),
          drinks: parseDrinks(body),
          daysOfWeek: parseDaysOfWeek(body),
          startDate: parseDateOnly(body.startDate),
          endDate: parseDateOnly(body.endDate),
          isActive: body.isActive === 'on',
        },
      });
      writeAudit(prisma, req, user, {
        action: 'update',
        resourceType: 'lto',
        resourceId: id,
        resourceLabel: title,
      }).catch(() => {});
      flashRedirect(res, `/admin/ltos/${id}`, 'success', 'Saved.');
      return true;
    }
    sendHTML(res, 200, ltoEditor({
      lto,
      locations,
      user,
      flashMsg: decodeFlash(req),
      defaultLocationSlug: lto.location?.slug || '',
      canPickLocation,
    }));
    return true;
  }

  // ─── List: /admin/ltos ───
  if (pathname === '/admin/ltos') {
    const url = new URL(req.url, 'http://x');
    const filters = {
      location: url.searchParams.get('location') || '',
    };
    const where = userIsCompanyWide
      ? {}
      : { locationId: { in: locations.map((l) => l.id).length ? locations.map((l) => l.id) : ['__none__'] } };
    if (filters.location) {
      const loc = locations.find((l) => l.slug === filters.location);
      if (loc) where.locationId = loc.id;
    }
    const ltos = await prisma.limitedTimeOffer.findMany({
      where,
      orderBy: [{ updatedAt: 'desc' }],
      include: { location: { select: { name: true, slug: true } } },
      take: 200,
    }).catch(() => []);

    sendHTML(res, 200, ltosList({
      ltos,
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

module.exports = { handleAdminLtos };
