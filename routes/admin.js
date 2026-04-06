const { sendHTML, parseBody, redirect, getFlashMsg, fallbackLocations, sendJSON } = require('../helpers');
const { authenticate, createSession, destroySession, requireAuth, refreshSession } = require('../auth');
const { loginPage } = require('../views/adminLayout');
const { locationsList, locationEditor } = require('../views/adminLocationViews');
const { adminDashboard } = require('../views/adminDashboard');
const { adminActivityView } = require('../views/adminActivityView');

const DAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
function getEasternToday() {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  return DAYS[now.getDay()];
}

// Build the per-location summary the dashboard renders.
async function buildDashboardData(prisma) {
  if (!prisma) return [];
  const todayDay = getEasternToday();
  const locations = await prisma.location.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
    select: { id: true, slug: true, name: true, city: true },
  }).catch(() => []);

  const now = new Date();
  return Promise.all(locations.map(async (loc) => {
    const summary = {
      location: loc,
      todayTheme: null,
      halfPriceCount: 0,
      menuCategoryCount: 0,
      menuItemCount: 0,
      activeEventCount: 0,
      nextEvent: null,
    };

    // Today's theme — prefer location override, fall back to company default
    try {
      const overrideTheme = await prisma.dayTheme.findFirst({
        where: { dayOfWeek: todayDay, locationId: loc.id, isActive: true },
        include: { specials: true },
      });
      const defaultTheme = !overrideTheme
        ? await prisma.dayTheme.findFirst({
            where: { dayOfWeek: todayDay, locationId: null, isActive: true },
            include: { specials: true },
          })
        : null;
      const theme = overrideTheme || defaultTheme;
      if (theme) {
        summary.todayTheme = {
          name: theme.name,
          tagline: theme.tagline || null,
          specialsCount: (theme.specials || []).length,
        };
        const cfg = theme.halfPriceConfig;
        if (cfg && Array.isArray(cfg.picks)) summary.halfPriceCount = cfg.picks.length;
      }
    } catch (err) { /* ignore — dashboard is best-effort */ }

    // Food menu counts
    try {
      const cats = await prisma.menuCategory.findMany({
        where: { locationId: loc.id, isActive: true },
        select: { id: true, _count: { select: { items: true } } },
      });
      summary.menuCategoryCount = cats.length;
      summary.menuItemCount = cats.reduce((s, c) => s + (c._count?.items || 0), 0);
    } catch (err) {
      // Fallback if _count include unsupported
      try {
        const cats = await prisma.menuCategory.findMany({ where: { locationId: loc.id, isActive: true } });
        summary.menuCategoryCount = cats.length;
        summary.menuItemCount = await prisma.menuItem.count({
          where: { category: { locationId: loc.id, isActive: true } },
        }).catch(() => 0);
      } catch (e) { /* ignore */ }
    }

    // Active events (not cancelled, signups window includes now or upcoming)
    try {
      const events = await prisma.event.findMany({
        where: {
          locationId: loc.id,
          isActive: true,
          isCancelled: false,
          startDate: { gte: now },
        },
        orderBy: { startDate: 'asc' },
        select: { id: true, slug: true, title: true, startDate: true },
        take: 10,
      });
      summary.activeEventCount = events.length;
      if (events.length > 0) {
        summary.nextEvent = events[0];
      }
    } catch (err) { /* ignore */ }

    return summary;
  }));
}

const WEEK_DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

function to12h(time24) {
  // "16:00" -> "4:00 PM"
  if (!time24) return '';
  const [hStr, mStr] = time24.split(':');
  let h = parseInt(hStr, 10);
  const m = mStr || '00';
  if (!Number.isFinite(h)) return '';
  const period = h >= 12 ? 'PM' : 'AM';
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return `${h}:${m} ${period}`;
}

function buildHoursFromForm(body) {
  const hours = {};
  for (const day of WEEK_DAYS) {
    if (body[`hours_${day}_closed`] === 'on') {
      hours[day] = 'Closed';
    } else {
      const open = to12h(body[`hours_${day}_open`]);
      const close = to12h(body[`hours_${day}_close`]);
      if (open && close) {
        hours[day] = `${open} - ${close}`;
      } else if (open) {
        hours[day] = open;
      }
      // If both empty, omit the key (preserve existing or leave unset)
    }
  }
  return hours;
}

function buildLinksFromForm(body) {
  const links = [];
  const maxLinks = parseInt(body.linkCount, 10) || 0;
  // Scan up to maxLinks + a buffer for safety
  for (let i = 0; i < maxLinks + 20; i++) {
    const label = (body[`link_label_${i}`] || '').trim();
    const url = (body[`link_url_${i}`] || '').trim();
    if (label && url) {
      links.push({ label, url });
    }
  }
  return links;
}

async function handleAdmin(req, res, pathname, prisma) {
  // ─── Login ───
  if (pathname === '/admin/login') {
    if (req.method === 'POST') {
      const body = await parseBody(req);
      const result = await authenticate(body.email, body.password);
      if (result.error) {
        sendHTML(res, 200, loginPage(result.error));
        return true;
      }
      createSession(res, result.user);
      redirect(res, '/admin/locations');
      return true;
    }
    sendHTML(res, 200, loginPage());
    return true;
  }

  // ─── Logout ───
  if (pathname === '/admin/logout') {
    destroySession(req, res);
    redirect(res, '/admin/login');
    return true;
  }

  // ─── Session keepalive ping (called from admin pages every few minutes) ───
  if (pathname === '/admin/_ping') {
    const ok = refreshSession(req, res);
    sendJSON(res, ok ? 200 : 401, { ok });
    return true;
  }

  // ─── Activity feed (audit log) ───
  if (pathname === '/admin/activity') {
    const user = requireAuth(req, res);
    if (!user) { redirect(res, '/admin/login'); return true; }
    if (!prisma || !prisma.auditLog) {
      sendHTML(res, 200, adminActivityView([], { location: '', action: '', resourceType: '' }, [], user, ''));
      return true;
    }
    const url = require('url');
    const parsed = url.parse(req.url, true);
    const filters = {
      location: parsed.query.location || '',
      action: parsed.query.action || '',
      resourceType: parsed.query.resourceType || '',
    };
    const where = {};
    if (filters.location) where.locationSlug = filters.location;
    if (filters.action) where.action = filters.action;
    if (filters.resourceType) where.resourceType = filters.resourceType;

    const [entries, locations] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 200,
      }).catch(() => []),
      prisma.location.findMany({
        where: { isActive: true },
        orderBy: { name: 'asc' },
        select: { slug: true, name: true },
      }).catch(() => []),
    ]);
    const flashMsg = getFlashMsg(req.url);
    sendHTML(res, 200, adminActivityView(entries, filters, locations, user, flashMsg));
    return true;
  }

  // ─── Dashboard ───
  if (pathname === '/admin' || pathname === '/admin/dashboard') {
    const user = requireAuth(req, res);
    if (!user) { redirect(res, '/admin/login'); return true; }
    const flashMsg = getFlashMsg(req.url);
    const dashboardData = await buildDashboardData(prisma).catch((err) => {
      console.warn('Dashboard build error:', err.message);
      return [];
    });
    sendHTML(res, 200, adminDashboard(dashboardData, user, flashMsg));
    return true;
  }

  // ─── Seed (preserve existing) ───
  if (pathname === '/admin/seed') {
    const user = requireAuth(req, res);
    if (!user) { redirect(res, '/admin/login'); return true; }
    if (!prisma) { sendHTML(res, 500, '<p>DB not available</p>'); return true; }
    for (const l of fallbackLocations) {
      await prisma.location.upsert({
        where: { slug: l.slug },
        update: {
          name: l.name, city: l.city, state: l.state, address: l.address || null,
          zipCode: l.zipCode || null, phone: l.phone || null, email: l.email || null,
          specialText: l.specialText || null, hours: l.hours || {}, features: l.features || [], isActive: true,
        },
        create: {
          name: l.name, slug: l.slug, city: l.city, state: l.state, address: l.address || null,
          zipCode: l.zipCode || null, phone: l.phone || null, email: l.email || null,
          specialText: l.specialText || null, hours: l.hours || {}, features: l.features || [], isActive: true,
        }
      });
    }
    redirect(res, '/admin/locations?msg=saved');
    return true;
  }

  // ─── Locations List ───
  if (pathname === '/admin/locations') {
    const user = requireAuth(req, res);
    if (!user) { redirect(res, '/admin/login'); return true; }
    const flashMsg = getFlashMsg(req.url);
    const locs = prisma
      ? await prisma.location.findMany({ orderBy: { name: 'asc' } }).catch(() => [])
      : [];
    sendHTML(res, 200, locationsList(locs, user, flashMsg));
    return true;
  }

  // ─── Redirect old /admin/location/:slug -> /admin/locations/:slug ───
  if (pathname.startsWith('/admin/location/')) {
    const slug = pathname.split('/').pop();
    redirect(res, `/admin/locations/${slug}`);
    return true;
  }

  // ─── Location Editor ───
  const locMatch = pathname.match(/^\/admin\/locations\/([a-z0-9-]+)$/);
  if (locMatch) {
    const slug = locMatch[1];
    const user = requireAuth(req, res);
    if (!user) { redirect(res, '/admin/login'); return true; }

    if (!prisma) { sendHTML(res, 500, '<p>DB not available</p>'); return true; }
    const loc = await prisma.location.findUnique({ where: { slug } }).catch(() => null);
    if (!loc) { sendHTML(res, 404, '<h1>Location not found</h1>'); return true; }

    if (req.method === 'POST') {
      const body = await parseBody(req);
      const hours = buildHoursFromForm(body);
      const links = buildLinksFromForm(body);

      await prisma.location.update({
        where: { slug },
        data: {
          name: body.name || loc.name,
          address: body.address || null,
          city: body.city || loc.city,
          state: body.state || loc.state,
          zipCode: body.zipCode || null,
          email: body.email || null,
          phone: body.phone || null,
          specialText: body.specialText || null,
          menuUrl: body.menuUrl || null,
          features: (body.features || '').split(',').map(s => s.trim()).filter(Boolean),
          hours,
          links,
          isActive: body.isActive === 'on',
        }
      });
      redirect(res, `/admin/locations/${slug}?msg=saved`);
      return true;
    }

    const flashMsg = getFlashMsg(req.url);
    sendHTML(res, 200, locationEditor(loc, user, flashMsg));
    return true;
  }

  return false;
}

module.exports = { handleAdmin };
