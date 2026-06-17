const { sendHTML, parseBody, redirect, generateCocktailImage, getFlashMsg } = require('../helpers');
const { requireAuth, isCompanyWide, getUserLocationSlugs, canAccessLocation } = require('../auth');
const { specialsDashboard, dayThemeEditor, bottlesList, bottleEditor, DAYS, DAY_LABELS } = require('../views/adminSpecialsViews');
const { adminLayout } = require('../views/adminLayout');
const { getSpiritCategories, getSpiritCatalog, getHalfPriceSpirits } = require('../bartenderDb');
const { sendJSON } = require('../helpers');
const { sanitizeImageSrc } = require('../views/imageUploadWidget');
const { writeAudit } = require('../auditLog');
const { parseOverrideDate, easternParts } = require('../dateEastern');
// No insecure default — an unset token means the optional second-factor check
// is simply skipped (the endpoint still requires an admin login + company role).
const OP_IMAGE_REGEN_TOKEN = process.env.OP_SPECIAL_IMAGE_REGEN_TOKEN || '';
const AI_SPECIAL_IMAGES_ENABLED = (process.env.ENABLE_AI_SPECIAL_IMAGES || '').toLowerCase() === 'true';

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeCategory(value) {
  const normalized = normalizeText(value).toLowerCase();
  return normalized || null;
}

function toStringArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map((item) => String(item || '').trim()).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value.split(',').map((item) => item.trim()).filter(Boolean);
  }
  return [String(value).trim()].filter(Boolean);
}

function normalizeOrderValue(value, fallback = 0) {
  const parsed = parseInt(value, 10);
  if (Number.isFinite(parsed) && parsed >= 0) {
    return parsed;
  }
  return fallback;
}

const { escHTML } = require('../views/escapeHtml');

function getAllCategories(specials = []) {
  return [...new Set((specials || [])
    .map((special) => normalizeCategory(special.category))
    .filter(Boolean))];
}

function normalizeSpecialDisplayOrder(prisma, dayThemeId) {
  return prisma.dailySpecial.findMany({
    where: { dayThemeId, isActive: true },
    orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }]
  }).then((specials) => {
    const updates = specials
      .map((special, index) => {
        if (special.displayOrder === index) return null;
        return prisma.dailySpecial.update({
          where: { id: special.id },
          data: { displayOrder: index },
        });
      })
      .filter(Boolean);

    if (!updates.length) return;
    return prisma.$transaction(updates);
  });
}

async function reorderSpecialToPosition(prisma, dayThemeId, specialId, targetIndex) {
  const specials = await prisma.dailySpecial.findMany({
    where: { dayThemeId, isActive: true },
    orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
  });

  const sourceIndex = specials.findIndex((special) => special.id === specialId);
  if (sourceIndex < 0) return false;

  const sanitizedTarget = Math.max(0, Math.min(targetIndex, specials.length - 1));
  if (sourceIndex === sanitizedTarget) return true;

  const normalized = [...specials];
  const [entry] = normalized.splice(sourceIndex, 1);
  normalized.splice(sanitizedTarget, 0, entry);

  const updates = normalized.map((special, index) =>
    prisma.dailySpecial.update({
      where: { id: special.id },
      data: { displayOrder: index },
    })
  );
  if (updates.length) await prisma.$transaction(updates);
  return true;
}

function parseSpecialOrderPayload(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return toStringArray(value).filter((item) => !!item);
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return toStringArray(parsed);
      }
      return [];
    } catch {
      return toStringArray(value);
    }
  }
  return [];
}

function escapeHtml(value) {
  const input = normalizeText(value);
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(value) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'numeric',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function csvEscape(value) {
  const text = normalizeText(value);
  const escaped = text.replace(/"/g, '""');
  return /[",\r\n]/.test(escaped) ? `"${escaped}"` : escaped;
}

function buildGuestFeedbackWhere(rawUrl) {
  const parsedUrl = new URL(rawUrl || '/', `http://${process?.env?.MENUQR_FALLBACK_HOST || 'localhost'}`);
  const includeOptInOnly = parsedUrl.searchParams.get('newsletter') === '1';
  const locationSlug = normalizeText(parsedUrl.searchParams.get('location')).toLowerCase();

  return {
    where: {
      ...(includeOptInOnly ? { newsletterOptIn: true } : {}),
      ...(locationSlug ? { locationSlug } : {}),
    },
    includeOptInOnly,
    locationSlug: locationSlug || '',
  };
}

function renderStars(rating) {
  const n = Number(rating) || 0;
  let s = '';
  for (let i = 1; i <= 5; i++) s += `<span style="color:${i <= n ? '#d4af37' : '#333'};font-size:1rem;">★</span>`;
  return s;
}

function renderFeedbackDashboard(rows) {
  // Summary stats
  const total = rows.length;
  const withEmail = rows.filter(r => r.guestEmail).length;
  const newsletterCount = rows.filter(r => r.newsletterOptIn).length;
  const giftCardCount = rows.filter(r => r.giftCardOptIn).length;
  const ratings = rows.filter(r => r.rating > 0);
  const avgRating = ratings.length > 0 ? (ratings.reduce((s, r) => s + r.rating, 0) / ratings.length).toFixed(1) : '—';

  // Star distribution
  const starCounts = [0, 0, 0, 0, 0];
  ratings.forEach(r => { if (r.rating >= 1 && r.rating <= 5) starCounts[r.rating - 1]++; });
  const maxStarCount = Math.max(...starCounts, 1);

  function statCard(label, value, color) {
    return `<div class="admin-stat">
      <strong style="color:${color || 'var(--gold-strong)'}">${escapeHtml(String(value))}</strong>
      <span>${escapeHtml(label)}</span>
    </div>`;
  }

  const summaryCards = `
    <div class="admin-stat-grid">
      ${statCard('Total Reviews', total, '#d4af37')}
      ${statCard('Avg Rating', avgRating, '#d4af37')}
      ${statCard('With Email', withEmail, '#7ecf8a')}
      ${statCard('Newsletter', newsletterCount, '#7ecf8a')}
      ${statCard('Gift Card', giftCardCount, '#7ecf8a')}
    </div>`;

  const starDist = `
    <div class="card">
      <h2 style="margin-top:0">Rating Distribution</h2>
      ${[5,4,3,2,1].map(star => `
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
          <span style="min-width:50px;font-size:0.85rem;color:#d4af37;text-align:right;">${star} ★</span>
          <div style="flex:1;background:#1a1a1d;border-radius:4px;height:22px;overflow:hidden;">
            <div style="width:${Math.round((starCounts[star-1] / maxStarCount) * 100)}%;background:linear-gradient(90deg,#d4af37,#b8913e);height:100%;border-radius:4px;min-width:${starCounts[star-1] > 0 ? '2' : '0'}px;"></div>
          </div>
          <span style="min-width:30px;font-size:0.82rem;color:#ccc;">${starCounts[star-1]}</span>
        </div>
      `).join('')}
    </div>`;

  if (!rows.length) {
    return summaryCards + '<div class="empty-state"><strong>No feedback yet</strong>Guest feedback and opt-ins will appear here as submissions arrive.</div>';
  }

  const feedbackCards = rows.map(entry => {
    const feedbackText = normalizeText(entry.feedbackText).replace(/\n/g, '<br>');
    const date = entry.createdAt ? new Date(entry.createdAt).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
    const name = entry.guestName || 'Anonymous';
    const email = entry.guestEmail || '';
    const badges = [
      entry.newsletterOptIn ? '<span style="background:#2a3a2a;color:#7ecf8a;padding:2px 8px;border-radius:6px;font-size:0.72rem;font-weight:700;">Newsletter</span>' : '',
      entry.giftCardOptIn ? '<span style="background:#3a352a;color:#d4af37;padding:2px 8px;border-radius:6px;font-size:0.72rem;font-weight:700;">Gift Card</span>' : '',
    ].filter(Boolean).join(' ');

    return `
      <div class="card" style="margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:6px;margin-bottom:8px;">
          <div>
            <span style="font-weight:700;color:#eee;">${escapeHtml(name)}</span>
            ${email ? `<span style="color:#666;font-size:0.82rem;margin-left:8px;"><a href="mailto:${escapeHtml(email)}" style="color:#888;text-decoration:none;">${escapeHtml(email)}</a></span>` : ''}
          </div>
          <div style="display:flex;align-items:center;gap:8px;">
            ${badges}
            <span style="color:#666;font-size:0.78rem;">${escapeHtml(date)}</span>
          </div>
        </div>
        <div style="margin-bottom:8px;">${renderStars(entry.rating)}</div>
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;">
          <p style="color:#bbb;font-size:0.88rem;line-height:1.5;margin:0;flex:1;">${feedbackText || '<span style="color:#555;">No message</span>'}</p>
          <span style="color:#555;font-size:0.75rem;white-space:nowrap;">${escapeHtml(entry.locationName || '')}</span>
        </div>
      </div>`;
  }).join('');

  return summaryCards + starDist + feedbackCards;
}

function buildFeedbackExportUrl({ includeOptInOnly, locationSlug }) {
  const parts = ['/admin/feedback/export'];
  const params = new URLSearchParams();
  if (includeOptInOnly) params.set('newsletter', '1');
  if (locationSlug) params.set('location', locationSlug);
  const query = params.toString();
  return `${parts[0]}${query ? `?${query}` : ''}`;
}

function buildFeedbackPageUrl({ includeOptInOnly, locationSlug }) {
  const params = new URLSearchParams();
  if (includeOptInOnly) params.set('newsletter', '1');
  if (locationSlug) params.set('location', locationSlug);
  const query = params.toString();
  return `/admin/feedback${query ? `?${query}` : ''}`;
}

function buildFeedbackCsv(rows) {
  const csvRows = [
    ['Date', 'Location', 'Location Slug', 'Guest Name', 'Guest Email', 'Rating', 'Newsletter Opt-In', 'Feedback']
      .map(csvEscape)
      .join(','),
  ];

  rows.forEach((entry) => {
    csvRows.push([
      entry.createdAt ? formatDate(entry.createdAt) : '',
      entry.locationName || '',
      entry.locationSlug || '',
      entry.guestName || '',
      entry.guestEmail || '',
      `${entry.rating || 0}/5`,
      entry.newsletterOptIn ? 'Yes' : 'No',
      normalizeText(entry.feedbackText),
    ].map(csvEscape).join(','));
  });

  return `${csvRows.join('\\n')}\\n`;
}

async function runSpecialImageRegeneration(prisma, requestedDay) {
  const dayFilter = DAYS.includes(requestedDay) ? { dayOfWeek: requestedDay } : {};
  const where = {
    ...dayFilter,
    isActive: true,
    overrideDate: null, // recurring themes only; overrides regen from their own editor
  };

  const themes = await prisma.dayTheme.findMany({
    where,
    include: { specials: { where: { isActive: true }, orderBy: { displayOrder: 'asc' } } },
  });

  let attempted = 0;
  let generated = 0;
  let totalSpecials = 0;
  for (const theme of themes) {
    if (!theme?.specials?.length) continue;
    const result = await generateImageSet(prisma, theme.specials, true);
    attempted += result.attempted;
    generated += result.generated;
    totalSpecials += (result.attempted + result.skipped);
  }

  return {
    ok: true,
    themesProcessed: themes.length,
    totalSpecials,
    attempted,
    generated,
  };
}

async function generateImageSet(prisma, specials, force = false) {
  const source = Array.isArray(specials) ? specials : [];
  const pending = force ? source : source.filter((s) => !s.imageUrl);
  if (!pending.length) return { attempted: 0, generated: 0, skipped: source.length };

  const cache = new Map();
  let attempted = 0;
  let generated = 0;

  for (const special of pending) {
    const key = `${special.name}|${special.description || ''}|${special.detailText || ''}`;
    if (cache.has(key)) {
      await prisma.dailySpecial.update({ where: { id: special.id }, data: { imageUrl: cache.get(key) } }).catch(() => {});
      attempted += 1;
      continue;
    }

    const imageUrl = await generateCocktailImage({
      name: special.name,
      description: special.description,
      detailText: special.detailText,
      category: special.category,
      section: special.section,
    });
    attempted += 1;
    if (imageUrl) {
      cache.set(key, imageUrl);
      generated += 1;
      await prisma.dailySpecial.update({ where: { id: special.id }, data: { imageUrl } }).catch(() => {});
    }
    if (!force && source.length > 0) await new Promise((resolve) => setTimeout(resolve, 1200));
  }

  return { attempted, generated, skipped: source.length - attempted };
}

function parseAdminRequestUrl(req) {
  return new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
}

function parseFlightMonth(value, fallback) {
  const parsed = parseInt(value, 10);
  if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 12) return parsed;
  return fallback;
}

function parseFlightYear(value, fallback) {
  const parsed = parseInt(value, 10);
  if (Number.isFinite(parsed) && parsed >= 2020 && parsed <= 2100) return parsed;
  return fallback;
}

function getLocationBySlug(locations, slug) {
  const normalized = normalizeText(slug).toLowerCase();
  if (!normalized) return null;
  return (locations || []).find((location) => String(location.slug || '').trim().toLowerCase() === normalized) || null;
}

function buildFlightPoursFromBody(body) {
  return [0, 1, 2]
    .filter((i) => normalizeText(body[`pour${i}_name`]))
    .map((i) => ({
      spiritName: normalizeText(body[`pour${i}_name`]),
      pourSize: normalizeText(body[`pour${i}_size`]) || null,
      description: normalizeText(body[`pour${i}_desc`]) || null,
      tastingNotes: normalizeText(body[`pour${i}_notes`]) || null,
      displayOrder: i,
    }));
}

async function loadFlightAdminContext(prisma, month, year) {
  const [locations, relatedFlights] = await Promise.all([
    prisma.location.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    }),
    prisma.flight.findMany({
      where: { month, year },
      include: {
        pours: { orderBy: { displayOrder: 'asc' } },
        location: true,
      },
      orderBy: [{ locationId: 'asc' }, { updatedAt: 'desc' }],
    }),
  ]);

  return { locations, relatedFlights };
}

async function findFlightForScope(prisma, month, year, locationId, excludeId = null) {
  return prisma.flight.findFirst({
    where: {
      month,
      year,
      locationId,
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
    },
    include: {
      pours: { orderBy: { displayOrder: 'asc' } },
      location: true,
    },
  });
}

async function buildFlightDeleteRedirect(prisma, month, year, deletedLocationId = null) {
  const remaining = await prisma.flight.findMany({
    where: { month, year },
    include: { location: true },
    orderBy: [{ locationId: 'asc' }, { updatedAt: 'desc' }],
  });

  const companyDefault = remaining.find((entry) => !entry.locationId) || null;
  const matchingLocation = deletedLocationId
    ? remaining.find((entry) => entry.locationId === deletedLocationId) || null
    : null;
  const nextTarget = companyDefault || matchingLocation || remaining[0] || null;
  return nextTarget ? `/admin/flights/${nextTarget.id}?msg=deleted` : '/admin/flights?msg=deleted';
}

async function handleAdminSpecials(req, res, pathname, prisma) {
  const user = requireAuth(req, res);
  if (!user) { redirect(res, '/admin/login'); return true; }

  const userIsCompanyWide = isCompanyWide(user);
  const userSlugs = userIsCompanyWide ? null : getUserLocationSlugs(user);

  // Bulk image regeneration — now behind admin auth (was previously reachable
  // without a login) and disabled entirely unless ENABLE_AI_SPECIAL_IMAGES is
  // on, so it can never fan out paid image-API calls by accident.
  if (pathname === '/admin/specials/regenerate-images') {
    if (req.method !== 'POST') { sendHTML(res, 405, '<p>Method Not Allowed</p>'); return true; }
    if (!userIsCompanyWide) { sendHTML(res, 403, '<p>Forbidden</p>'); return true; }
    if (!AI_SPECIAL_IMAGES_ENABLED) {
      res.writeHead(409, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'AI special-image generation is disabled (set ENABLE_AI_SPECIAL_IMAGES=true to enable).' }));
      return true;
    }
    const body = await parseBody(req);
    // Optional second factor: only enforced if an ops token is configured.
    if (OP_IMAGE_REGEN_TOKEN) {
      const token = body?.token || req.headers['x-regenerate-token'];
      if (token !== OP_IMAGE_REGEN_TOKEN) { sendHTML(res, 401, '<p>Unauthorized</p>'); return true; }
    }
    const requestedDay = String(body.day || '').toUpperCase().trim();
    void runSpecialImageRegeneration(prisma, requestedDay).catch((err) => {
      console.error('Regenerate images background job failed:', err.message || err);
    });
    res.writeHead(202, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, message: 'Regeneration started.' }));
    return true;
  }

  if (pathname === '/admin/feedback/export') {
    try {
      if (!prisma?.guestFeedback) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Guest feedback storage not configured yet.');
        return true;
      }

      const parsedUrl = `http://${req.headers.host || 'localhost'}${req.url}`;
      const { where, locationSlug } = buildGuestFeedbackWhere(parsedUrl);
      if (!userIsCompanyWide) {
        if (locationSlug && !canAccessLocation(user, locationSlug)) {
          res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('Forbidden');
          return true;
        }
        // No location filter from the user → constrain to their slugs.
        if (!locationSlug) {
          where.locationSlug = { in: userSlugs.length > 0 ? userSlugs : ['__none__'] };
        }
      }
      const rows = await prisma.guestFeedback.findMany({
        where,
        orderBy: { createdAt: 'desc' },
      });

      const csv = buildFeedbackCsv(rows);
      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="guest-feedback.csv"',
      });
      res.end(csv);
      return true;
    } catch (err) {
      console.error('Error exporting feedback:', err.message);
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Failed to export feedback');
      return true;
    }
  }

  if (pathname === '/admin/feedback') {
    try {
      if (!prisma?.guestFeedback) {
        sendHTML(res, 404, '<p>Guest feedback storage is not yet available.</p>');
        return true;
      }

      const parsedUrl = `http://${req.headers.host || 'localhost'}${req.url}`;
      const { where, includeOptInOnly, locationSlug } = buildGuestFeedbackWhere(parsedUrl);
      if (!userIsCompanyWide) {
        if (locationSlug && !canAccessLocation(user, locationSlug)) {
          redirect(res, '/admin/feedback');
          return true;
        }
        if (!locationSlug) {
          where.locationSlug = { in: userSlugs.length > 0 ? userSlugs : ['__none__'] };
        }
      }
      const locationListWhere = userIsCompanyWide
        ? { isActive: true }
        : { isActive: true, slug: { in: userSlugs.length > 0 ? userSlugs : ['__none__'] } };
      const [rows, locations] = await Promise.all([
        prisma.guestFeedback.findMany({
          where,
          orderBy: { createdAt: 'desc' },
        }),
        prisma.location.findMany({
          where: locationListWhere,
          orderBy: { name: 'asc' },
        }),
      ]);

      const selectedLocation = locations.find((loc) => loc.slug === locationSlug);
      const filterLabel = locationSlug && selectedLocation
        ? `&nbsp;for <strong>${escapeHtml(selectedLocation.name)}</strong>`
        : '';

      const locationOptions = locations.map((loc) => `<option value="${escapeHtml(loc.slug)}"${locationSlug === loc.slug ? ' selected' : ''}>${escapeHtml(loc.name)}</option>`).join('');

      const filterControls = `
        <form method="GET" action="/admin/feedback" class="admin-filter-bar">
          <select name="location">
            <option value="">All Locations</option>${locationOptions}
          </select>
          <div class="segmented">
            <a href="/admin/feedback${locationSlug ? '?location=' + escapeHtml(locationSlug) : ''}" class="${!includeOptInOnly ? 'active' : ''}">All</a>
            <a href="/admin/feedback?newsletter=1${locationSlug ? '&location=' + escapeHtml(locationSlug) : ''}" class="${includeOptInOnly ? 'active' : ''}">Newsletter</a>
          </div>
          <button type="submit" class="btn btn-primary btn-sm">Filter</button>
          <a href="${buildFeedbackExportUrl({ includeOptInOnly, locationSlug })}" class="btn btn-secondary btn-sm">Export CSV</a>
          <span style="color:#666;font-size:0.82rem;">Showing ${rows.length} entries${filterLabel}</span>
        </form>`;

      sendHTML(
        res,
        200,
        adminLayout(
          'Guest Feedback',
          `<div class="page-header">
            <div>
              <div class="admin-kicker">Guest responses</div>
              <h1>Guest Feedback</h1>
              <p class="page-subtitle">Review ratings, comments, gift card entries, and newsletter opt-ins.</p>
            </div>
          </div>${filterControls}${renderFeedbackDashboard(rows)}`,
          user,
          { pathname: '/admin/feedback' },
        ),
      );
      return true;
    } catch (err) {
      console.error('Error loading feedback:', err.message);
      sendHTML(res, 500, '<p>Could not load feedback yet.</p>');
      return true;
    }
  }

  // ─── Half-Price Preview API ───
  if (pathname === '/admin/specials/half-price-preview' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const config = JSON.parse(body.config || '{}');
      const locationSlug = body.locationSlug || 'greensboro';
      const result = await getHalfPriceSpirits(locationSlug, config);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ count: result.items.length, names: result.items.slice(0, 20).map(s => s.name), error: result.error }));
    } catch (err) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ count: 0, names: [], error: err.message }));
    }
    return true;
  }

  // ─── Daily Specials Dashboard ───
  if (pathname === '/admin/specials') {
    const flashMsg = getFlashMsg(req.url);

    // Company-wide users see the company default themes; their grid edits the
    // null-location theme. GMs are scoped to their own location(s) — the grid
    // shows that location's overrides (falling back to the company default
    // theme name when no override exists yet) and links into the per-location
    // editor.
    if (userIsCompanyWide) {
      const themes = await prisma.dayTheme.findMany({
        where: { locationId: null, overrideDate: null },
        include: { specials: { where: { isActive: true }, orderBy: { displayOrder: 'asc' } } },
      });
      sendHTML(res, 200, specialsDashboard(themes, user, flashMsg));
      return true;
    }

    if (!userSlugs.length) {
      sendHTML(res, 403, adminLayout('Daily Specials', '<h1>No Location Access</h1><p>Your account isn\'t assigned to a location yet. Ask an admin to set you up.</p>', user, { pathname: '/admin/specials' }));
      return true;
    }

    const url = require('url');
    const parsed = url.parse(req.url, true);
    const requestedSlug = String(parsed.query.location || '').toLowerCase();
    const activeSlug = userSlugs.includes(requestedSlug) ? requestedSlug : userSlugs[0];

    const allowedLocations = await prisma.location.findMany({
      where: { slug: { in: userSlugs }, isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, slug: true, name: true },
    });
    const activeLocation = allowedLocations.find(l => l.slug === activeSlug) || null;
    if (!activeLocation) {
      sendHTML(res, 404, '<h1>Location not found</h1>');
      return true;
    }

    // Pull both the location overrides and the company defaults; merge so each
    // day card shows whichever is the source of truth for this location.
    const [overrides, defaults] = await Promise.all([
      prisma.dayTheme.findMany({
        where: { locationId: activeLocation.id, overrideDate: null },
        include: { specials: { where: { isActive: true }, orderBy: { displayOrder: 'asc' } } },
      }),
      prisma.dayTheme.findMany({
        where: { locationId: null, overrideDate: null },
        include: { specials: { where: { isActive: true }, orderBy: { displayOrder: 'asc' } } },
      }),
    ]);
    const themesByDay = {};
    defaults.forEach(t => { themesByDay[t.dayOfWeek] = t; });
    overrides.forEach(t => { themesByDay[t.dayOfWeek] = t; });
    const themes = Object.values(themesByDay);

    sendHTML(res, 200, specialsDashboard(themes, user, flashMsg, {
      locationSlug: activeLocation.slug,
      locationName: activeLocation.name,
      locationOptions: allowedLocations,
    }));
    return true;
  }

  // ─── Day Theme Editor ───
  const dayMatch = pathname.match(/^\/admin\/specials\/day\/([A-Z]+)(?:\/override\/(\d{4}-\d{2}-\d{2}))?$/);
  const dayLocMatch = pathname.match(/^\/admin\/specials\/day\/([A-Z]+)\/location\/([a-z0-9-]+)(?:\/override\/(\d{4}-\d{2}-\d{2}))?$/);

  if (dayMatch || dayLocMatch) {
    const day = dayMatch ? dayMatch[1] : dayLocMatch[1];
    const locationSlug = dayLocMatch ? dayLocMatch[2] : null;
    // Optional one-time override scope: /…/override/YYYY-MM-DD. overrideDate is a
    // canonical noon-Eastern UTC Date for that calendar day, or null for the
    // recurring weekly theme. It's the third dimension of the theme's identity.
    const overrideDateStr = dayMatch ? (dayMatch[2] || null) : (dayLocMatch[3] || null);
    const overrideDate = overrideDateStr ? parseOverrideDate(overrideDateStr) : null;
    if (overrideDateStr && !overrideDate) { redirect(res, '/admin/specials'); return true; }

    if (!DAYS.includes(day)) {
      sendHTML(res, 404, '<h1>Invalid day</h1>');
      return true;
    }

    // GMs cannot edit the company default theme (no location slug) and cannot
    // touch locations they don't own. Bounce them back to their dashboard.
    if (!userIsCompanyWide) {
      if (!locationSlug) {
        const target = userSlugs.length === 1 ? `/admin/specials/day/${day}/location/${userSlugs[0]}` : '/admin/specials';
        redirect(res, target);
        return true;
      }
      if (!canAccessLocation(user, locationSlug)) {
        redirect(res, '/admin/specials');
        return true;
      }
    }

    const locationListWhere = userIsCompanyWide
      ? { isActive: true }
      : { isActive: true, slug: { in: userSlugs.length > 0 ? userSlugs : ['__none__'] } };
    const locations = await prisma.location.findMany({ where: locationListWhere, orderBy: { name: 'asc' } });
    let location = null;
    if (locationSlug) {
      location = locations.find(l => l.slug === locationSlug);
      if (!location) { sendHTML(res, 404, '<h1>Location not found</h1>'); return true; }
    }

    const locationId = location ? location.id : null;
    // Every theme lookup in this handler is scoped to (day, location, override).
    // overrideDate null → the recurring weekly theme; a Date → that day's one-time
    // override. recurringWhere is the same scope but always the recurring theme,
    // used when cloning/falling back regardless of the current override scope.
    const themeWhere = { dayOfWeek: day, locationId: locationId, overrideDate: overrideDate };
    const recurringWhere = { dayOfWeek: day, locationId: locationId, overrideDate: null };
    const recurringPath = `/admin/specials/day/${day}${locationSlug ? `/location/${locationSlug}` : ''}`;

    if (req.method === 'POST') {
      const body = await parseBody(req);
      const action = body._action;

      if (action === 'saveTheme') {
        // Prisma can't upsert on composite unique with null, so findFirst + create/update
        const existing = await prisma.dayTheme.findFirst({ where: themeWhere });
        // Validate theme color: must be #RRGGBB or null
        const colorRaw = (body.themeColor || '').trim();
        const themeColor = /^#[0-9a-fA-F]{6}$/.test(colorRaw) && colorRaw.toLowerCase() !== '#d4af37'
          ? colorRaw : null;
        if (existing) {
          await prisma.dayTheme.update({
            where: { id: existing.id },
            data: { name: body.name, tagline: body.tagline || null, description: body.description || null, themeColor, isActive: body.isActive === 'on' },
          });
        } else {
          await prisma.dayTheme.create({
            data: { dayOfWeek: day, locationId: locationId, overrideDate: overrideDate, name: body.name, tagline: body.tagline || null, description: body.description || null, themeColor, isActive: body.isActive === 'on' },
          });
        }
        writeAudit(prisma, req, user, {
          action: existing ? 'update' : 'create', resourceType: 'day_theme',
          resourceLabel: body.name, locationSlug: locationSlug || null,
          details: { day },
        });
        redirect(res, pathname + '?msg=saved');
        return true;
      }

      if (action === 'saveHalfPrice') {
        const config = JSON.parse(body.halfPriceConfig || '{}');
        const existing = await prisma.dayTheme.findFirst({ where: themeWhere });
        if (existing) {
          await prisma.dayTheme.update({
            where: { id: existing.id },
            data: { halfPriceConfig: config },
          });
        } else if (locationId) {
          // Auto-create location override theme for half-price config
          const defaultTheme = await prisma.dayTheme.findFirst({ where: { dayOfWeek: day, locationId: null, overrideDate: null } });
          await prisma.dayTheme.create({
            data: {
              dayOfWeek: day,
              locationId: locationId,
              overrideDate: overrideDate,
              name: defaultTheme ? defaultTheme.name : day,
              tagline: defaultTheme ? defaultTheme.tagline : null,
              description: defaultTheme ? defaultTheme.description : null,
              isActive: defaultTheme ? defaultTheme.isActive : true,
              halfPriceConfig: config,
            },
          });
        }
        writeAudit(prisma, req, user, {
          action: 'update', resourceType: 'half_price', locationSlug: locationSlug || null,
          details: { day, picksCount: Array.isArray(config.picks) ? config.picks.length : 0 },
        });
        redirect(res, pathname + '?msg=saved');
        return true;
      }

      if (action === 'deleteTheme') {
        const existing = await prisma.dayTheme.findFirst({ where: themeWhere });
        if (existing) await prisma.dayTheme.delete({ where: { id: existing.id } });
        // Deleting an override drops back to the recurring day; deleting the
        // recurring theme returns to the weekly overview.
        redirect(res, (overrideDate ? recurringPath : '/admin/specials') + '?msg=deleted');
        return true;
      }

      // Schedule a one-time override for a specific date: clone the recurring
      // theme (specials + half-price config) into a dated copy you can freely
      // edit. On that date the public page shows the override, then reverts.
      if (action === 'createOverride') {
        const dateStr = (body.overrideDate || '').trim();
        const parsed = parseOverrideDate(dateStr);
        const dayLabel = DAY_LABELS[day] || day;
        if (!parsed) {
          redirect(res, recurringPath + '?msg=' + encodeURIComponent('error|Enter a valid date for the override.'));
          return true;
        }
        const WD_TO_DAY = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
        if (WD_TO_DAY[easternParts(parsed).weekday] !== day) {
          redirect(res, recurringPath + '?msg=' + encodeURIComponent(`error|That date isn't a ${dayLabel}. Pick a ${dayLabel} so the override lands on the right day.`));
          return true;
        }
        const overridePath = `${recurringPath}/override/${dateStr}`;
        const already = await prisma.dayTheme.findFirst({ where: { dayOfWeek: day, locationId: locationId, overrideDate: parsed } });
        if (already) { redirect(res, overridePath); return true; }
        // Clone from the recurring theme at this scope, else the company default.
        let source = await prisma.dayTheme.findFirst({ where: recurringWhere, include: { specials: { orderBy: { displayOrder: 'asc' } } } });
        if (!source && locationId) {
          source = await prisma.dayTheme.findFirst({ where: { dayOfWeek: day, locationId: null, overrideDate: null }, include: { specials: { orderBy: { displayOrder: 'asc' } } } });
        }
        const created = await prisma.dayTheme.create({
          data: {
            dayOfWeek: day,
            locationId: locationId,
            overrideDate: parsed,
            name: source ? source.name : day,
            tagline: source ? source.tagline : null,
            description: source ? source.description : null,
            themeColor: source ? source.themeColor : null,
            isActive: true,
            halfPriceConfig: source ? (source.halfPriceConfig ?? undefined) : undefined,
          },
        });
        if (source && Array.isArray(source.specials) && source.specials.length) {
          for (const sp of source.specials) {
            await prisma.dailySpecial.create({
              data: {
                dayThemeId: created.id,
                name: sp.name, description: sp.description, price: sp.price, imageUrl: sp.imageUrl,
                category: sp.category, displayOrder: sp.displayOrder, section: sp.section,
                detailText: sp.detailText, badges: sp.badges, timeWindow: sp.timeWindow,
                isFeatured: sp.isFeatured, isActive: sp.isActive,
              },
            });
          }
        }
        writeAudit(prisma, req, user, {
          action: 'create', resourceType: 'day_theme_override', resourceId: created.id,
          resourceLabel: created.name, locationSlug: locationSlug || null,
          details: { day, date: dateStr },
        });
        redirect(res, overridePath + '?msg=created');
        return true;
      }

      if (action === 'deleteOverride' && body.overrideId) {
        const ov = await prisma.dayTheme.findFirst({
          where: { id: body.overrideId, dayOfWeek: day, locationId: locationId, overrideDate: { not: null } },
        });
        if (ov) await prisma.dayTheme.delete({ where: { id: ov.id } });
        writeAudit(prisma, req, user, {
          action: 'delete', resourceType: 'day_theme_override', resourceId: body.overrideId,
          locationSlug: locationSlug || null, details: { day },
        });
        redirect(res, recurringPath + '?msg=deleted');
        return true;
      }

      if (action === 'generateSpecialImages') {
        const currentTheme = await prisma.dayTheme.findFirst({
          where: themeWhere,
          include: { specials: true },
        });
        if (currentTheme && currentTheme.specials && currentTheme.specials.length) {
          await generateImageSet(prisma, currentTheme.specials, body.forceImageRegeneration === 'on');
        }
        redirect(res, pathname + '?msg=saved');
        return true;
      }

      if (action === 'addSpecial') {
        const theme = await prisma.dayTheme.findFirst({
          where: themeWhere
        });
        if (theme) {
          const maxOrderSpecial = await prisma.dailySpecial.findFirst({
            where: { dayThemeId: theme.id },
            orderBy: { displayOrder: 'desc' },
          });
          const fallbackOrder = maxOrderSpecial ? maxOrderSpecial.displayOrder + 1 : 0;
          const createdSpecial = await prisma.dailySpecial.create({
            data: {
              dayThemeId: theme.id,
              name: body.specialName,
              description: body.specialDescription || null,
              price: body.specialPrice || null,
              imageUrl: sanitizeImageSrc(body.specialImageUrl),
              section: body.specialSection || null,
              detailText: body.specialDetailText || null,
              badges: body.specialBadges || null,
              timeWindow: body.specialTimeWindow || null,
              isFeatured: body.specialFeatured === 'on',
              category: normalizeCategory(body.specialCategory),
              displayOrder: normalizeOrderValue(body.specialOrder, fallbackOrder),
            }
          });
          await normalizeSpecialDisplayOrder(prisma, theme.id);
          writeAudit(prisma, req, user, {
            action: 'create', resourceType: 'daily_special', resourceId: createdSpecial.id,
            resourceLabel: createdSpecial.name, locationSlug: locationSlug || null,
            details: { day },
          });
        }
        redirect(res, pathname + '?msg=created');
        return true;
      }

      if (action === 'editSpecial' && body.specialId) {
        await prisma.dailySpecial.update({
          where: { id: body.specialId },
          data: {
            name: body.specialName,
            description: body.specialDescription || null,
            price: body.specialPrice || null,
            imageUrl: sanitizeImageSrc(body.specialImageUrl),
            category: normalizeCategory(body.specialCategory),
            displayOrder: parseInt(body.specialOrder) || 0,
            section: body.specialSection || null,
            detailText: body.specialDetailText || null,
            badges: body.specialBadges || null,
            timeWindow: body.specialTimeWindow || null,
            isFeatured: body.specialFeatured === 'on',
          }
        }).catch(() => {});
        const updated = await prisma.dailySpecial.findUnique({ where: { id: body.specialId }});
        if (updated && updated.dayThemeId) await normalizeSpecialDisplayOrder(prisma, updated.dayThemeId);
        writeAudit(prisma, req, user, {
          action: 'update', resourceType: 'daily_special', resourceId: body.specialId,
          resourceLabel: body.specialName, locationSlug: locationSlug || null,
          details: { day },
        });
        redirect(res, pathname + '?msg=saved');
        return true;
      }

      if (action === 'setSpecialCategory' && body.specialId) {
        const special = await prisma.dailySpecial.findUnique({ where: { id: body.specialId } });
        if (special) {
          await prisma.dailySpecial.update({
            where: { id: special.id },
            data: { category: normalizeCategory(body.specialCategory) },
          });
          await normalizeSpecialDisplayOrder(prisma, special.dayThemeId);
        }
        redirect(res, pathname + '?msg=saved');
        return true;
      }

      if (action === 'setSpecialCategoryBulk' && body.specialIds) {
        const theme = await prisma.dayTheme.findFirst({ where: themeWhere });
        if (!theme) {
          redirect(res, pathname);
          return true;
        }

        const specialIds = toStringArray(body.specialIds).filter((id) => typeof id === 'string' && id.trim() !== '');
        if (specialIds.length > 0) {
          const category = normalizeCategory(body.specialCategory);
          await prisma.dailySpecial.updateMany({
            where: {
              id: { in: specialIds },
              dayThemeId: theme.id,
            },
            data: {
              category,
            },
          });
        }
        redirect(res, pathname + '?msg=saved');
        return true;
      }

      if (action === 'reorderSpecials' && (body.specialOrderPayload || body.specialIds)) {
        const theme = await prisma.dayTheme.findFirst({ where: themeWhere });
        if (!theme) {
          redirect(res, pathname);
          return true;
        }

        const proposedOrder = parseSpecialOrderPayload(body.specialOrderPayload || body.specialIds);
        if (proposedOrder.length > 0) {
          const current = await prisma.dailySpecial.findMany({
            where: { dayThemeId: theme.id, isActive: true },
            orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
          });
          const knownIds = new Set(current.map((item) => item.id));
          const orderedIds = proposedOrder.filter((id) => knownIds.has(id));
          const missing = current.map((item) => item.id).filter((id) => !orderedIds.includes(id));
          const finalOrder = [...orderedIds, ...missing];

          const updates = finalOrder.map((id, index) =>
            prisma.dailySpecial.update({
              where: { id },
              data: { displayOrder: index },
            })
          );
          if (updates.length) await prisma.$transaction(updates);
        }

        redirect(res, pathname + '?msg=reordered');
        return true;
      }

      if (action === 'moveSpecial' && body.specialId) {
        const theme = await prisma.dayTheme.findFirst({ where: themeWhere });
        if (!theme) {
          redirect(res, pathname);
          return true;
        }

        const specials = await prisma.dailySpecial.findMany({
          where: { dayThemeId: theme.id, isActive: true },
          orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
        });
        const idx = specials.findIndex((item) => item.id === body.specialId);
        if (idx >= 0) {
          const direction = (normalizeText(body.direction) || '').toLowerCase();
          if (direction === 'up' && idx > 0) {
            const prev = specials[idx - 1];
            const current = specials[idx];
            await prisma.$transaction([
              prisma.dailySpecial.update({ where: { id: current.id }, data: { displayOrder: prev.displayOrder } }),
              prisma.dailySpecial.update({ where: { id: prev.id }, data: { displayOrder: current.displayOrder } }),
            ]);
            await normalizeSpecialDisplayOrder(prisma, theme.id);
          }
          if (direction === 'down' && idx < specials.length - 1) {
            const next = specials[idx + 1];
            const current = specials[idx];
            await prisma.$transaction([
              prisma.dailySpecial.update({ where: { id: current.id }, data: { displayOrder: next.displayOrder } }),
              prisma.dailySpecial.update({ where: { id: next.id }, data: { displayOrder: current.displayOrder } }),
            ]);
            await normalizeSpecialDisplayOrder(prisma, theme.id);
          }
        }
        redirect(res, pathname + '?msg=reordered');
        return true;
      }

      if (action === 'setSpecialOrder' && body.specialId) {
        const theme = await prisma.dayTheme.findFirst({ where: themeWhere });
        if (!theme) {
          redirect(res, pathname);
          return true;
        }
        const requested = parseInt(body.specialOrderValue, 10);
        if (Number.isInteger(requested) && requested >= 0) {
          await reorderSpecialToPosition(prisma, theme.id, body.specialId, requested);
        }
        redirect(res, pathname + '?msg=reordered');
        return true;
      }

      if (action === 'deleteSpecial' && body.specialId) {
        const current = await prisma.dailySpecial.findUnique({ where: { id: body.specialId } });
        await prisma.dailySpecial.delete({ where: { id: body.specialId } }).catch(() => {});
        if (current && current.dayThemeId) {
          await normalizeSpecialDisplayOrder(prisma, current.dayThemeId);
        }
        writeAudit(prisma, req, user, {
          action: 'delete', resourceType: 'daily_special', resourceId: body.specialId,
          resourceLabel: current ? current.name : null, locationSlug: locationSlug || null,
          details: { day },
        });
        redirect(res, pathname + '?msg=deleted');
        return true;
      }

      if (action === 'duplicateSpecial' && body.specialId) {
        const original = await prisma.dailySpecial.findUnique({ where: { id: body.specialId } });
        if (original) {
          const max = await prisma.dailySpecial.findFirst({
            where: { dayThemeId: original.dayThemeId },
            orderBy: { displayOrder: 'desc' },
            select: { displayOrder: true },
          });
          await prisma.dailySpecial.create({
            data: {
              dayThemeId: original.dayThemeId,
              name: `${original.name} (copy)`,
              description: original.description,
              price: original.price,
              imageUrl: original.imageUrl,
              section: original.section,
              detailText: original.detailText,
              badges: original.badges,
              timeWindow: original.timeWindow,
              isFeatured: original.isFeatured,
              category: original.category,
              displayOrder: (max ? max.displayOrder : -1) + 1,
            },
          });
        }
        redirect(res, pathname + '?msg=created');
        return true;
      }
    }

    // GET: show editor
    // For location override, use a compound unique that allows null
    const flashMsg = getFlashMsg(req.url);
    const theme = await prisma.dayTheme.findFirst({
      where: themeWhere,
      include: { specials: { orderBy: { displayOrder: 'asc' } } },
    });
    const categoryOptions = getAllCategories(theme ? theme.specials : []);

    // One-time overrides scheduled for this day/location (for the schedule panel
    // on the recurring editor). Kept after the date passes so they're reusable.
    const overrides = await prisma.dayTheme.findMany({
      where: { dayOfWeek: day, locationId: locationId, overrideDate: { not: null } },
      orderBy: { overrideDate: 'asc' },
      include: { _count: { select: { specials: true } } },
    });

    let spiritCatalog = [];
    let spiritCategories = { categories: [], styles: [] };
    // For any location override, load the spirit catalog so the half-price picker
    // can be used on any day. Fall back to company default config if no location-specific theme.
    let halfPriceTheme = theme;
    if (locationSlug) {
      try {
        [spiritCategories, spiritCatalog] = await Promise.all([
          getSpiritCategories(),
          getSpiritCatalog(locationSlug),
        ]);
      } catch (err) {
        console.warn('Error loading spirit catalog for admin:', err.message);
      }
      if (!halfPriceTheme) {
        const defaultTheme = await prisma.dayTheme.findFirst({ where: { dayOfWeek: day, locationId: null, overrideDate: null } });
        if (defaultTheme) {
          halfPriceTheme = { halfPriceConfig: defaultTheme.halfPriceConfig || {} };
        }
      }
    }

    sendHTML(res, 200, dayThemeEditor(
      day,
      theme,
      theme ? theme.specials : [],
      locations,
      locationSlug,
      user,
      null,
      categoryOptions,
      flashMsg,
      spiritCatalog,
      spiritCategories,
      halfPriceTheme,
      { showCompanyDefault: userIsCompanyWide, overrideDateStr, overrides }
    ));
    return true;
  }

  // ─── Bottles List ───
  if (pathname === '/admin/bottles') {
    if (!userIsCompanyWide) { redirect(res, '/admin'); return true; }
    const flashMsg = getFlashMsg(req.url);
    const bottles = await prisma.featuredBottle.findMany({
      orderBy: [{ year: 'desc' }, { month: 'desc' }, { displayOrder: 'asc' }],
    });
    sendHTML(res, 200, bottlesList(bottles, user, flashMsg));
    return true;
  }

  // ─── New Bottle ───
  if (pathname === '/admin/bottles/new') {
    if (!userIsCompanyWide) { redirect(res, '/admin'); return true; }
    if (req.method === 'POST') {
      const body = await parseBody(req);
      const bottle = await prisma.featuredBottle.create({
        data: {
          name: body.name,
          description: body.description || null,
          costPrice: body.costPrice,
          regularPrice: body.regularPrice || null,
          month: parseInt(body.month),
          year: parseInt(body.year),
          category: body.category || null,
          displayOrder: parseInt(body.displayOrder) || 0,
          isActive: body.isActive === 'on',
        }
      });
      redirect(res, `/admin/bottles/${bottle.id}?msg=created`);
      return true;
    }
    sendHTML(res, 200, bottleEditor(null, true, user, null, ''));
    return true;
  }

  // ─── Edit/Delete Bottle ───
  const bottleMatch = pathname.match(/^\/admin\/bottles\/([a-f0-9-]+)$/);
  if (bottleMatch) {
    if (!userIsCompanyWide) { redirect(res, '/admin'); return true; }
    const bottleId = bottleMatch[1];
    const bottle = await prisma.featuredBottle.findUnique({ where: { id: bottleId } });
    if (!bottle) { sendHTML(res, 404, '<h1>Bottle not found</h1>'); return true; }

    if (req.method === 'POST') {
      const body = await parseBody(req);
      if (body._action === 'delete') {
        await prisma.featuredBottle.delete({ where: { id: bottleId } });
        redirect(res, '/admin/bottles?msg=deleted');
        return true;
      }
      await prisma.featuredBottle.update({
        where: { id: bottleId },
        data: {
          name: body.name,
          description: body.description || null,
          costPrice: body.costPrice,
          regularPrice: body.regularPrice || null,
          month: parseInt(body.month),
          year: parseInt(body.year),
          category: body.category || null,
          displayOrder: parseInt(body.displayOrder) || 0,
          isActive: body.isActive === 'on',
        }
      });
      redirect(res, pathname + '?msg=saved');
      return true;
    }

    const flashMsg = getFlashMsg(req.url);
    sendHTML(res, 200, bottleEditor(bottle, false, user, null, flashMsg));
    return true;
  }

  // Analytics — live count endpoint
  if (pathname === '/admin/analytics/live') {
    if (!prisma?.visitorSession) { sendJSON(res, 200, { count: 0 }); return true; }
    const url = require('url');
    const parsed = url.parse(req.url, true);
    const slug = parsed.query.location || '';
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    const liveWhere = { updatedAt: { gte: fiveMinAgo } };
    if (slug) {
      if (!userIsCompanyWide && !canAccessLocation(user, slug)) { sendJSON(res, 403, { ok: false }); return true; }
      liveWhere.locationSlug = slug;
    } else if (!userIsCompanyWide) {
      liveWhere.locationSlug = { in: userSlugs.length > 0 ? userSlugs : ['__none__'] };
    }
    const count = await prisma.visitorSession.count({ where: liveWhere }).catch(() => 0);
    sendJSON(res, 200, { count });
    return true;
  }

  // Analytics dashboard
  if (pathname === '/admin/analytics' || pathname === '/admin/analytics/export') {
    if (!prisma?.visitorSession) {
      sendHTML(res, 200, adminLayout('Analytics', '<p>Analytics not available yet. Waiting for database migration.</p>', user, { pathname: '/admin/analytics' }));
      return true;
    }

    const url = require('url');
    const parsed = url.parse(req.url, true);
    const filterSlug = parsed.query.location || '';
    const filterRange = parsed.query.range || '7d';
    const customStart = parsed.query.startDate || '';
    const customEnd = parsed.query.endDate || '';
    const filterSource = parsed.query.source || '';

    // Date range
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
    let rangeStart;
    let rangeDurationMs;
    if (filterRange === 'custom' && customStart) {
      rangeStart = new Date(customStart + 'T00:00:00');
      const end = customEnd ? new Date(customEnd + 'T23:59:59') : now;
      rangeDurationMs = Math.min(end.getTime() - rangeStart.getTime(), 90 * 24 * 60 * 60 * 1000);
    } else if (filterRange === 'today') {
      rangeStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      rangeDurationMs = now.getTime() - rangeStart.getTime();
    } else if (filterRange === '30d') {
      rangeStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      rangeDurationMs = 30 * 24 * 60 * 60 * 1000;
    } else {
      rangeStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      rangeDurationMs = 7 * 24 * 60 * 60 * 1000;
    }

    // Enforce scope: GMs cannot select a location outside their own and cannot
    // see aggregate analytics across all locations. If they didn't pick a slug
    // (or picked an off-limits one), constrain the query to their slugs.
    let scopedFilterSlug = filterSlug;
    if (!userIsCompanyWide) {
      if (filterSlug && !canAccessLocation(user, filterSlug)) {
        scopedFilterSlug = '';
      }
    }
    const prevRangeStart = new Date(rangeStart.getTime() - Math.max(rangeDurationMs, 24 * 60 * 60 * 1000));
    const where = { startedAt: { gte: rangeStart } };
    const prevWhere = { startedAt: { gte: prevRangeStart, lt: rangeStart } };
    if (scopedFilterSlug) {
      where.locationSlug = scopedFilterSlug;
      prevWhere.locationSlug = scopedFilterSlug;
    } else if (!userIsCompanyWide) {
      const slugFilter = { in: userSlugs.length > 0 ? userSlugs : ['__none__'] };
      where.locationSlug = slugFilter;
      prevWhere.locationSlug = slugFilter;
    }
    if (filterSource) {
      if (filterSource === 'organic') {
        where.source = null;
        prevWhere.source = null;
      } else {
        where.source = filterSource;
        prevWhere.source = filterSource;
      }
    }

    try {
      // CSV export
      if (pathname === '/admin/analytics/export') {
        const rows = await prisma.visitorSession.findMany({ where, orderBy: { startedAt: 'desc' }, take: 5000 });
        const csvHeader = 'Date,Location,Device,Browser,OS,Source,Entry Page,Pages,Duration (s),QR Scan,Language,IP\n';
        const csvRows = rows.map(r => [
          r.startedAt ? r.startedAt.toISOString() : '',
          r.locationSlug || '',
          r.deviceType || '',
          r.browser || '',
          r.os || '',
          r.source || 'organic',
          r.entryPage || '',
          r.pageCount || 1,
          r.durationSecs || '',
          r.isQrScan ? 'Yes' : 'No',
          r.language || '',
          r.ipAddress || '',
        ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
        res.writeHead(200, { 'Content-Type': 'text/csv', 'Content-Disposition': `attachment; filename="analytics-${filterRange}.csv"` });
        res.end(csvHeader + csvRows);
        return true;
      }

      // Dashboard data
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
      // The same scoping rule applies to pageView/source queries: respect the
      // user's chosen slug if allowed, else cap to their assigned slugs.
      const slugScopeFragment = scopedFilterSlug
        ? { locationSlug: scopedFilterSlug }
        : (!userIsCompanyWide ? { locationSlug: { in: userSlugs.length > 0 ? userSlugs : ['__none__'] } } : {});
      const pvWhere = { viewedAt: { gte: rangeStart }, ...slugScopeFragment };
      // For the source dropdown, query distinct sources within the current date range ignoring the source filter itself
      const sourceListWhere = { startedAt: { gte: rangeStart }, ...slugScopeFragment, source: { not: null } };
      const locationListWhere = userIsCompanyWide
        ? { isActive: true }
        : { isActive: true, slug: { in: userSlugs.length > 0 ? userSlugs : ['__none__'] } };

      const analyticsEventWhere = { createdAt: { gte: rangeStart }, ...slugScopeFragment };
      if (filterSource) {
        analyticsEventWhere.source = filterSource === 'organic' ? null : filterSource;
      }
      const eventPageViewWhere = {
        viewedAt: { gte: rangeStart },
        pagePath: { contains: '/events/' },
        ...slugScopeFragment,
      };
      const guestLinkWhere = {};
      if (scopedFilterSlug) {
        guestLinkWhere.lastLocationSlug = scopedFilterSlug;
      } else if (!userIsCompanyWide) {
        guestLinkWhere.lastLocationSlug = { in: userSlugs.length > 0 ? userSlugs : ['__none__'] };
      }
      if (filterSource) {
        guestLinkWhere.lastSource = filterSource === 'organic' ? null : filterSource;
      }

      const [sessions, prevSessions, locations, pageViews, liveCount, distinctSources, analyticsEvents, knownGuestLinks, eventPageViews] = await Promise.all([
        prisma.visitorSession.findMany({ where, orderBy: { startedAt: 'desc' }, take: 10000 }),
        prisma.visitorSession.findMany({ where: prevWhere, orderBy: { startedAt: 'desc' }, take: 10000 }),
        prisma.location.findMany({ where: locationListWhere, orderBy: { name: 'asc' }, select: { id: true, slug: true, name: true } }),
        prisma.pageView.groupBy({ by: ['pageType'], _count: true, where: pvWhere }),
        prisma.visitorSession.count({ where: { updatedAt: { gte: fiveMinAgo }, ...slugScopeFragment } }),
        prisma.visitorSession.findMany({ where: sourceListWhere, select: { source: true }, distinct: ['source'], take: 50 }),
        prisma.analyticsEvent ? prisma.analyticsEvent.findMany({ where: analyticsEventWhere, orderBy: { createdAt: 'desc' }, take: 5000 }) : Promise.resolve([]),
        prisma.guestVisitorLink ? prisma.guestVisitorLink.findMany({ where: guestLinkWhere, orderBy: { lastSeenAt: 'desc' }, take: 5000 }) : Promise.resolve([]),
        prisma.pageView.findMany({ where: eventPageViewWhere, select: { visitorId: true, locationSlug: true, pagePath: true, viewedAt: true }, take: 5000 }),
      ]);
      const availableSources = distinctSources.map(s => s.source).filter(Boolean).sort();

      // Returning visitors — who visited before this period?
      const currentVisitorIds = [...new Set(sessions.map(s => s.visitorId))];
      let returningVisitorIdSet = new Set();
      let returningVisitorLocationSet = new Set();
      if (currentVisitorIds.length > 0 && currentVisitorIds.length <= 5000) {
        const priorWhere = { visitorId: { in: currentVisitorIds }, startedAt: { lt: rangeStart } };
        if (scopedFilterSlug) {
          priorWhere.locationSlug = scopedFilterSlug;
        } else if (!userIsCompanyWide) {
          priorWhere.locationSlug = { in: userSlugs.length > 0 ? userSlugs : ['__none__'] };
        }
        const prior = await prisma.visitorSession.findMany({
          where: priorWhere,
          select: { visitorId: true, locationSlug: true },
          distinct: ['visitorId', 'locationSlug'],
        }).catch(() => []);
        returningVisitorIdSet = new Set(prior.map(p => p.visitorId));
        returningVisitorLocationSet = new Set(prior.map(p => (p.locationSlug || 'home') + '::' + p.visitorId));
      }

      // ── Current period metrics ──
      const totalSessions = sessions.length;
      const uniqueVisitors = currentVisitorIds.length;
      const durationsValid = sessions.filter(s => s.durationSecs && s.durationSecs > 0);
      const avgDuration = durationsValid.length > 0 ? Math.round(durationsValid.reduce((sum, s) => sum + s.durationSecs, 0) / durationsValid.length) : 0;
      const avgPages = totalSessions > 0 ? +(sessions.reduce((sum, s) => sum + (s.pageCount || 1), 0) / totalSessions).toFixed(1) : 0;
      const newVisitors = currentVisitorIds.filter(id => !returningVisitorIdSet.has(id)).length;
      const returningVisitors = returningVisitorIdSet.size;
      const returnRate = uniqueVisitors > 0 ? Math.round((returningVisitors / uniqueVisitors) * 100) : 0;
      const qrCount = sessions.filter(s => s.isQrScan).length;
      const directCount = totalSessions - qrCount;

      // ── Traffic source breakdown (tagged via ?src= or ?utm_source=) ──
      // Sessions with an explicit source are shown as-is; untagged sessions are grouped as "Organic"
      // (organic = in-store QR scan or direct type-in, i.e. no tagged link was followed).
      const sourceCounts = {};
      sessions.forEach(s => {
        const key = (s.source && s.source.trim()) ? s.source.trim().toLowerCase() : 'organic';
        sourceCounts[key] = (sourceCounts[key] || 0) + 1;
      });
      const sourcesSorted = Object.entries(sourceCounts).sort((a, b) => b[1] - a[1]);
      const taggedSessions = totalSessions - (sourceCounts.organic || 0);
      const taggedRate = totalSessions > 0 ? Math.round((taggedSessions / totalSessions) * 100) : 0;
      const organicSessions = sourceCounts.organic || 0;

      // ── Previous period metrics ──
      const prevTotal = prevSessions.length;
      const prevUnique = new Set(prevSessions.map(s => s.visitorId)).size;
      const prevDurValid = prevSessions.filter(s => s.durationSecs && s.durationSecs > 0);
      const prevAvgDur = prevDurValid.length > 0 ? Math.round(prevDurValid.reduce((sum, s) => sum + s.durationSecs, 0) / prevDurValid.length) : 0;
      const prevAvgPages = prevTotal > 0 ? +(prevSessions.reduce((sum, s) => sum + (s.pageCount || 1), 0) / prevTotal).toFixed(1) : 0;
      const prevReturnRate = (() => { const u = new Set(prevSessions.map(s => s.visitorId)).size; const r = (() => { const c = {}; prevSessions.forEach(s => { c[s.visitorId] = (c[s.visitorId] || 0) + 1; }); return Object.values(c).filter(v => v > 1).length; })(); return u > 0 ? Math.round((r / u) * 100) : 0; })();
      const prevSourceCounts = {};
      prevSessions.forEach(s => {
        const key = (s.source && s.source.trim()) ? s.source.trim().toLowerCase() : 'organic';
        prevSourceCounts[key] = (prevSourceCounts[key] || 0) + 1;
      });
      const prevTaggedSessions = prevTotal - (prevSourceCounts.organic || 0);
      const prevOrganicSessions = prevSourceCounts.organic || 0;

      function pctChange(curr, prev) {
        if (prev === 0) return curr > 0 ? 100 : 0;
        return Math.round(((curr - prev) / prev) * 100);
      }

      // ── Scans by day ──
      const byDay = {};
      sessions.forEach(s => {
        const d = s.startedAt ? s.startedAt.toISOString().slice(0, 10) : 'unknown';
        byDay[d] = (byDay[d] || 0) + 1;
      });
      const daysSorted = Object.entries(byDay).sort((a, b) => a[0].localeCompare(b[0]));

      // Previous period by day (for comparison sparkline)
      const prevByDay = {};
      prevSessions.forEach(s => {
        const d = s.startedAt ? s.startedAt.toISOString().slice(0, 10) : 'unknown';
        prevByDay[d] = (prevByDay[d] || 0) + 1;
      });
      const prevDaysSorted = Object.entries(prevByDay).sort((a, b) => a[0].localeCompare(b[0]));

      // ── Peak hours heatmap ──
      const heatmap = Array.from({ length: 7 }, () => Array(24).fill(0));
      sessions.forEach(s => {
        if (!s.startedAt) return;
        const eastern = new Date(s.startedAt.toLocaleString('en-US', { timeZone: 'America/New_York' }));
        heatmap[eastern.getDay()][eastern.getHours()]++;
      });
      const heatmapMax = Math.max(...heatmap.flat(), 1);

      // ── Location breakdown ──
      const byLocation = {};
      const locationDayMap = {};
      sessions.forEach(s => {
        if (!s.locationSlug) return;
        const slug = s.locationSlug;
        byLocation[slug] = (byLocation[slug] || 0) + 1;
        const day = s.startedAt ? s.startedAt.toISOString().slice(0, 10) : 'unknown';
        if (!locationDayMap[slug]) locationDayMap[slug] = {};
        locationDayMap[slug][day] = (locationDayMap[slug][day] || 0) + 1;
      });
      const prevByLocation = {};
      prevSessions.forEach(s => {
        if (!s.locationSlug) return;
        const slug = s.locationSlug;
        prevByLocation[slug] = (prevByLocation[slug] || 0) + 1;
      });
      const locationsSorted = Object.entries(byLocation).sort((a, b) => b[1] - a[1]);
      const locationNameMap = {};
      locations.forEach(l => { locationNameMap[l.slug] = l.name; });
      const unassignedSessions = sessions.filter(s => !s.locationSlug).length;

      const locationMetricsMap = {};
      sessions.forEach(s => {
        if (!s.locationSlug) return;
        const slug = s.locationSlug;
        if (!locationMetricsMap[slug]) {
          locationMetricsMap[slug] = {
            slug,
            sessions: 0,
            tagged: 0,
            organic: 0,
            visitorIds: new Set(),
            returningVisitorIds: new Set(),
            pageTotal: 0,
            durationTotal: 0,
            durationCount: 0,
          };
        }
        const metric = locationMetricsMap[slug];
        metric.sessions++;
        if (s.source && s.source.trim()) metric.tagged++; else metric.organic++;
        metric.visitorIds.add(s.visitorId);
        if (returningVisitorLocationSet.has(slug + '::' + s.visitorId)) metric.returningVisitorIds.add(s.visitorId);
        metric.pageTotal += s.pageCount || 1;
        if (s.durationSecs && s.durationSecs > 0) {
          metric.durationTotal += s.durationSecs;
          metric.durationCount++;
        }
      });
      const locationMetrics = Object.values(locationMetricsMap).map(m => {
        const unique = m.visitorIds.size;
        const returning = m.returningVisitorIds.size;
        const avgPagesForLocation = m.sessions > 0 ? +(m.pageTotal / m.sessions).toFixed(1) : 0;
        const avgDurationForLocation = m.durationCount > 0 ? Math.round(m.durationTotal / m.durationCount) : 0;
        const shareScore = Math.round((m.tagged * 3) + (returning * 2) + (avgPagesForLocation * 4) + Math.min(avgDurationForLocation / 15, 20) + m.sessions);
        return {
          slug: m.slug,
          name: locationNameMap[m.slug] || m.slug,
          sessions: m.sessions,
          tagged: m.tagged,
          organic: m.organic,
          unique,
          returning,
          taggedRate: m.sessions > 0 ? Math.round((m.tagged / m.sessions) * 100) : 0,
          returnRate: unique > 0 ? Math.round((returning / unique) * 100) : 0,
          avgPages: avgPagesForLocation,
          avgDuration: avgDurationForLocation,
          shareScore,
        };
      });
      const sharingLeaderboardRows = locationMetrics.slice().sort((a, b) => b.tagged - a.tagged || b.shareScore - a.shareScore || b.sessions - a.sessions);
      const returningLeaderboardRows = locationMetrics.slice().sort((a, b) => b.returning - a.returning || b.returnRate - a.returnRate || b.sessions - a.sessions);
      const lowTaggedLocations = locationMetrics
        .filter(m => m.sessions >= 5 && m.taggedRate < 20)
        .sort((a, b) => b.sessions - a.sessions)
        .slice(0, 3);
      const strongReturningLocations = locationMetrics
        .filter(m => m.returning > 0)
        .sort((a, b) => b.returnRate - a.returnRate || b.returning - a.returning)
        .slice(0, 3);

      // ── Campaign, conversion, and known-guest analytics ──
      const eventsByType = {};
      analyticsEvents.forEach(ev => {
        eventsByType[ev.eventType] = (eventsByType[ev.eventType] || 0) + 1;
      });
      const giftCardEntries = eventsByType.gift_card_entry || 0;
      const newsletterOptIns = eventsByType.newsletter_optin || 0;
      const feedbackSubmits = eventsByType.feedback_submit || 0;
      const eventSignupCount = eventsByType.event_signup || 0;

      const campaignMap = {};
      sessions.forEach(s => {
        const key = s.qrId || s.campaign || s.source || 'organic';
        if (!campaignMap[key]) {
          campaignMap[key] = {
            label: key,
            qrId: s.qrId || '',
            campaign: s.campaign || '',
            source: s.source || 'organic',
            sessions: 0,
            visitorIds: new Set(),
            returningVisitorIds: new Set(),
            locations: new Set(),
            pageTotal: 0,
          };
        }
        const c = campaignMap[key];
        c.sessions++;
        c.visitorIds.add(s.visitorId);
        if (returningVisitorIdSet.has(s.visitorId)) c.returningVisitorIds.add(s.visitorId);
        if (s.locationSlug) c.locations.add(s.locationSlug);
        c.pageTotal += s.pageCount || 1;
      });
      const campaignRows = Object.values(campaignMap).map(c => ({
        label: c.label,
        qrId: c.qrId,
        campaign: c.campaign,
        source: c.source,
        sessions: c.sessions,
        unique: c.visitorIds.size,
        returning: c.returningVisitorIds.size,
        returnRate: c.visitorIds.size > 0 ? Math.round((c.returningVisitorIds.size / c.visitorIds.size) * 100) : 0,
        locations: c.locations.size,
        avgPages: c.sessions > 0 ? +(c.pageTotal / c.sessions).toFixed(1) : 0,
      })).sort((a, b) => {
        const aTracked = a.label === 'organic' ? 0 : 1;
        const bTracked = b.label === 'organic' ? 0 : 1;
        return bTracked - aTracked || b.sessions - a.sessions;
      }).slice(0, 12);

      const linksByVisitor = {};
      knownGuestLinks.forEach(link => {
        if (!linksByVisitor[link.visitorId]) linksByVisitor[link.visitorId] = [];
        linksByVisitor[link.visitorId].push(link);
      });
      const knownVisitorIds = [...new Set(knownGuestLinks.map(link => link.visitorId).filter(Boolean))];
      const lifetimeKnownSessions = knownVisitorIds.length > 0 && knownVisitorIds.length <= 5000
        ? await prisma.visitorSession.findMany({
            where: { visitorId: { in: knownVisitorIds }, ...slugScopeFragment },
            select: { visitorId: true, locationSlug: true, pageCount: true, startedAt: true },
            orderBy: { startedAt: 'desc' },
            take: 20000,
          }).catch(() => [])
        : [];
      const guestIdentityMap = {};
      knownGuestLinks.forEach(link => {
        if (!guestIdentityMap[link.emailHash]) {
          guestIdentityMap[link.emailHash] = {
            emailHash: link.emailHash,
            emailMasked: link.emailMasked,
            visitorIds: new Set(),
            firstSeenAt: link.firstSeenAt,
            lastSeenAt: link.lastSeenAt,
            locations: new Set(),
            giftCardOptIn: false,
            newsletterOptIn: false,
            feedbackCount: 0,
            eventSignupCount: 0,
            lifetimeSessions: 0,
            lifetimePageTotal: 0,
          };
        }
        const g = guestIdentityMap[link.emailHash];
        g.visitorIds.add(link.visitorId);
        if (link.lastLocationSlug) g.locations.add(link.lastLocationSlug);
        if (link.firstSeenAt && (!g.firstSeenAt || link.firstSeenAt < g.firstSeenAt)) g.firstSeenAt = link.firstSeenAt;
        if (link.lastSeenAt && (!g.lastSeenAt || link.lastSeenAt > g.lastSeenAt)) g.lastSeenAt = link.lastSeenAt;
        g.giftCardOptIn = g.giftCardOptIn || Boolean(link.giftCardOptIn);
        g.newsletterOptIn = g.newsletterOptIn || Boolean(link.newsletterOptIn);
        g.feedbackCount += link.feedbackCount || 0;
        g.eventSignupCount += link.eventSignupCount || 0;
      });
      lifetimeKnownSessions.forEach(s => {
        (linksByVisitor[s.visitorId] || []).forEach(link => {
          const g = guestIdentityMap[link.emailHash];
          if (!g) return;
          g.lifetimeSessions++;
          g.lifetimePageTotal += s.pageCount || 1;
          if (s.locationSlug) g.locations.add(s.locationSlug);
        });
      });
      sessions.forEach(s => {
        (linksByVisitor[s.visitorId] || []).forEach(link => {
          const g = guestIdentityMap[link.emailHash];
          if (!g) return;
          g.currentSessions = (g.currentSessions || 0) + 1;
          g.currentPageTotal = (g.currentPageTotal || 0) + (s.pageCount || 1);
          if (s.locationSlug) g.locations.add(s.locationSlug);
          if (returningVisitorIdSet.has(s.visitorId)) g.returning = true;
        });
      });
      const knownGuestRows = Object.values(guestIdentityMap)
        .filter(g => (g.currentSessions || 0) > 0 || g.lastSeenAt >= rangeStart)
        .map(g => ({
          emailMasked: g.emailMasked,
          visits: g.currentSessions || 0,
          lifetimeVisits: g.lifetimeSessions || 0,
          linkedDevices: g.visitorIds.size,
          locations: g.locations.size,
          returning: Boolean(g.returning) || g.visitorIds.size > 1,
          giftCardOptIn: g.giftCardOptIn,
          newsletterOptIn: g.newsletterOptIn,
          feedbackCount: g.feedbackCount,
          eventSignupCount: g.eventSignupCount,
          lastSeenAt: g.lastSeenAt,
        }))
        .sort((a, b) => b.visits - a.visits || Number(b.returning) - Number(a.returning) || b.lastSeenAt - a.lastSeenAt)
        .slice(0, 10);

      const visitorIntentMap = {};
      sessions.forEach(s => {
        if (!visitorIntentMap[s.visitorId]) {
          const link = (linksByVisitor[s.visitorId] || [])[0];
          visitorIntentMap[s.visitorId] = {
            visitorId: s.visitorId,
            label: link ? link.emailMasked : 'Visitor ' + String(s.visitorId || '').slice(0, 8),
            known: Boolean(link),
            sessions: 0,
            pageTotal: 0,
            durationTotal: 0,
            locations: new Set(),
            sources: new Set(),
            lastSeenAt: s.updatedAt || s.startedAt,
          };
        }
        const v = visitorIntentMap[s.visitorId];
        v.sessions++;
        v.pageTotal += s.pageCount || 1;
        v.durationTotal += s.durationSecs || 0;
        if (s.locationSlug) v.locations.add(s.locationSlug);
        if (s.source) v.sources.add(s.source);
        if ((s.updatedAt || s.startedAt) > v.lastSeenAt) v.lastSeenAt = s.updatedAt || s.startedAt;
      });
      const highIntentRows = Object.values(visitorIntentMap)
        .map(v => ({
          ...v,
          locationsCount: v.locations.size,
          score: (v.sessions * 3) + v.pageTotal + Math.min(Math.round(v.durationTotal / 30), 20) + (v.known ? 8 : 0),
        }))
        .filter(v => v.known && (v.sessions > 1 || v.pageTotal >= 4 || v.durationTotal >= 120))
        .sort((a, b) => b.score - a.score)
        .slice(0, 10);
      const anonymousIntentRows = Object.values(visitorIntentMap)
        .map(v => ({
          ...v,
          locationsCount: v.locations.size,
        }))
        .filter(v => !v.known);
      const anonymousRepeatVisitors = anonymousIntentRows.filter(v => v.sessions > 1).length;
      const anonymousDeepBrowsers = anonymousIntentRows.filter(v => v.pageTotal >= 8).length;
      const anonymousMultiLocationVisitors = anonymousIntentRows.filter(v => v.locationsCount >= 2).length;
      const anonymousActionableNote = anonymousIntentRows.length > 0
        ? 'Anonymous behavior is useful as a pattern, not as a person list. Use gift-card, feedback, newsletter, and event forms to turn these visitors into known repeat guests.'
        : 'No anonymous visitor behavior in this range.';

      const eventInterestMap = {};
      eventPageViews.forEach(pv => {
        const match = String(pv.pagePath || '').match(/\/events\/([^/?#]+)/);
        if (!match) return;
        const key = (pv.locationSlug || '') + '::' + match[1];
        if (!eventInterestMap[key]) {
          eventInterestMap[key] = {
            slug: match[1],
            locationSlug: pv.locationSlug || '',
            views: 0,
            visitors: new Set(),
            signups: 0,
          };
        }
        eventInterestMap[key].views++;
        eventInterestMap[key].visitors.add(pv.visitorId);
      });
      analyticsEvents.filter(ev => ev.eventType === 'event_signup').forEach(ev => {
        const slug = ev.metadata && ev.metadata.eventSlug ? ev.metadata.eventSlug : (ev.entityName || ev.entityId || 'event');
        const key = (ev.locationSlug || '') + '::' + slug;
        if (!eventInterestMap[key]) {
          eventInterestMap[key] = {
            slug,
            locationSlug: ev.locationSlug || '',
            views: 0,
            visitors: new Set(),
            signups: 0,
          };
        }
        eventInterestMap[key].signups++;
      });
      const eventInterestRows = Object.values(eventInterestMap).map(e => ({
        location: locationNameMap[e.locationSlug] || e.locationSlug || 'Unknown',
        event: e.slug,
        views: e.views,
        visitors: e.visitors.size,
        signups: e.signups,
        conversionRate: e.visitors.size > 0 ? Math.round((e.signups / e.visitors.size) * 100) : 0,
      })).sort((a, b) => b.views - a.views || b.signups - a.signups).slice(0, 10);

      // ── Content funnel ──
      const pageTypeCounts = {};
      pageViews.forEach(p => { pageTypeCounts[p.pageType] = p._count; });
      const funnelSteps = [
        { key: 'location', label: 'Location Page' },
        { key: 'specials', label: 'Specials' },
        { key: 'draft', label: 'Draft List' },
        { key: 'menu', label: 'Full Menu' },
      ];
      const funnelData = funnelSteps.map(step => ({ ...step, count: pageTypeCounts[step.key] || 0 }));
      const funnelMax = Math.max(...funnelData.map(d => d.count), 1);

      // ── Top entry pages ──
      const entryPages = {};
      sessions.forEach(s => { const ep = s.entryPage || '/'; entryPages[ep] = (entryPages[ep] || 0) + 1; });
      const topEntryPages = Object.entries(entryPages).sort((a, b) => b[1] - a[1]).slice(0, 8);
      const topEntryMax = topEntryPages.length > 0 ? topEntryPages[0][1] : 1;

      // ── Device breakdown (for technical section) ──
      const devices = {};
      sessions.forEach(s => { const d = s.deviceType || 'unknown'; devices[d] = (devices[d] || 0) + 1; });
      const browsers = {};
      sessions.forEach(s => { const b = s.browser || 'Other'; browsers[b] = (browsers[b] || 0) + 1; });
      const osList = {};
      sessions.forEach(s => { const o = s.os || 'Other'; osList[o] = (osList[o] || 0) + 1; });

      // ── Helpers ──
      function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
      function fmtDur(s) { return s >= 60 ? Math.floor(s / 60) + 'm ' + (s % 60) + 's' : s + 's'; }
      function fmtShortDate(d) {
        return d ? new Date(d).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '-';
      }

      function changeArrow(pct) {
        if (pct > 0) return '<span style="color:#4ade80;font-size:0.75rem;font-weight:700;">&uarr; ' + pct + '%</span>';
        if (pct < 0) return '<span style="color:#f87171;font-size:0.75rem;font-weight:700;">&darr; ' + Math.abs(pct) + '%</span>';
        return '<span style="color:#666;font-size:0.75rem;">&mdash;</span>';
      }

      function statCard(label, value, pct) {
        const arrow = pct !== undefined ? '<div style="margin-top:2px;">' + changeArrow(pct) + '</div>' : '';
        return '<div class="a-stat">'
          + '<div style="font-size:1.5rem;font-weight:800;color:#d4af37;">' + esc(String(value)) + '</div>'
          + arrow
          + '<div style="font-size:0.75rem;color:#888;margin-top:3px;text-transform:uppercase;letter-spacing:0.08em;">' + esc(label) + '</div>'
          + '</div>';
      }

      function sparklineSVG(data, w, h, color, dashed) {
        if (!data.length) return '';
        const max = Math.max(...data, 1);
        const stepX = data.length > 1 ? w / (data.length - 1) : w;
        const points = data.map((v, i) => (i * stepX).toFixed(1) + ',' + (h - 2 - (v / max) * (h - 4)).toFixed(1));
        const fillPoints = points.join(' ') + ' ' + w + ',' + h + ' 0,' + h;
        const dashAttr = dashed ? ' stroke-dasharray="4,3"' : '';
        const opacity = dashed ? '0.4' : '1';
        return '<polyline points="' + points.join(' ') + '" fill="none" stroke="' + color + '" stroke-width="2"' + dashAttr + ' opacity="' + opacity + '"/>'
          + (dashed ? '' : '<polygon points="' + fillPoints + '" fill="' + color + '" opacity="0.1"/>');
      }

      function barRow(label, count, maxVal) {
        const pct = maxVal > 0 ? Math.round((count / maxVal) * 100) : 0;
        return '<div style="display:flex;align-items:center;gap:8px;margin-bottom:5px;">'
          + '<span style="min-width:90px;font-size:0.82rem;color:#aaa;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(label) + '</span>'
          + '<div style="flex:1;background:#1a1a1d;border-radius:4px;height:20px;overflow:hidden;">'
          + '<div style="width:' + pct + '%;background:linear-gradient(90deg,#d4af37,#b8913e);height:100%;border-radius:4px;min-width:2px;"></div>'
          + '</div>'
          + '<span style="min-width:32px;font-size:0.82rem;color:#ccc;">' + count + '</span>'
          + '</div>';
      }

      // A small "?" with a hover/tap explanation, so jargon is always one tap away.
      function helpTip(text) {
        return '<span class="a-tip" tabindex="0" role="note" aria-label="' + esc(text) + '" data-tip="' + esc(text) + '">?</span>';
      }

      // A headline metric card: big number, optional vs-previous arrow, a plain
      // "what it means" line, and an optional "?" definition.
      function kpiCard(label, value, pct, meaning, help) {
        const arrow = (pct !== undefined && pct !== null) ? '<div style="margin-top:3px;">' + changeArrow(pct) + '</div>' : '';
        return '<div class="a-kpi">'
          + '<div class="a-kpi-label">' + esc(label) + (help ? ' ' + helpTip(help) : '') + '</div>'
          + '<div class="a-kpi-value">' + esc(String(value)) + '</div>'
          + arrow
          + (meaning ? '<div class="a-kpi-meaning">' + esc(meaning) + '</div>' : '')
          + '</div>';
      }

      // ── Plain-English takeaways + actions, computed from the metrics above ──
      // Returns a prioritized list of { tone, text }. tone drives the color.
      function buildInsights() {
        const out = [];
        const multiLoc = !scopedFilterSlug && locationsSorted.length > 1;

        // Overall trend
        if (totalSessions > 0) {
          const c = pctChange(totalSessions, prevTotal);
          const dir = c > 0 ? `up ${c}%` : (c < 0 ? `down ${Math.abs(c)}%` : 'flat');
          out.push({ tone: c >= 0 ? 'good' : 'warn', text: `${totalSessions} total visits this period — ${dir} vs the previous period.` });
        }

        // Marketing: top tagged source + its trend
        const topTagged = sourcesSorted.find(([k]) => k !== 'organic');
        if (topTagged) {
          const [name, count] = topTagged;
          const prev = prevSourceCounts[name] || 0;
          const c = pctChange(count, prev);
          const trend = prev === 0 ? 'new this period' : (c > 0 ? `up ${c}%` : (c < 0 ? `down ${Math.abs(c)}%` : 'flat'));
          out.push({ tone: 'good', text: `“${name}” is your top tagged source — ${count} visit${count === 1 ? '' : 's'} (${trend}).` });
        }

        // Marketing: tagged coverage
        if (totalSessions >= 15) {
          if (taggedRate < 25) {
            out.push({ tone: 'warn', text: `Only ${taggedRate}% of visits come from tagged links — add ?src= tags to your social posts and QR codes (use the Trackable Links tool on the Marketing tab) so you can see what's working.` });
          } else {
            out.push({ tone: 'good', text: `${taggedRate}% of visits came from your tagged links and QR codes — good tracking coverage.` });
          }
        }

        // Retention
        if (uniqueVisitors > 0) {
          const c = pctChange(returnRate, prevReturnRate);
          const trend = prevReturnRate === 0 ? '' : (c > 0 ? `, up ${c}%` : (c < 0 ? `, down ${Math.abs(c)}%` : ''));
          out.push({ tone: returnRate >= 25 ? 'good' : 'info', text: `${returnRate}% of visitors are returning${trend} — ${returningVisitors} repeat visitor${returningVisitors === 1 ? '' : 's'}.` });
        }
        const newCaptures = (newsletterOptIns || 0) + (giftCardEntries || 0);
        if (newCaptures > 0) {
          out.push({ tone: 'good', text: `Captured ${newsletterOptIns || 0} newsletter opt-in${(newsletterOptIns || 0) === 1 ? '' : 's'} and ${giftCardEntries || 0} gift-card entr${(giftCardEntries || 0) === 1 ? 'y' : 'ies'} — growing your known-guest list.` });
        }

        // Locations
        if (multiLoc && strongReturningLocations.length > 0) {
          const best = strongReturningLocations[0];
          out.push({ tone: 'good', text: `Best return rate: ${best.name} at ${best.returnRate}%.` });
        }
        if (multiLoc && lowTaggedLocations.length > 0) {
          const lt = lowTaggedLocations[0];
          out.push({ tone: 'warn', text: `${lt.name} gets traffic but only ${lt.taggedRate}% is tagged — tag its QR codes and printed links to see where its guests come from.` });
        }

        // Content / events
        if (eventInterestRows.length > 0) {
          const ev = eventInterestRows[0];
          if (ev.signups > 0) {
            out.push({ tone: 'good', text: `Top event “${ev.event}” drew ${ev.views} view${ev.views === 1 ? '' : 's'} and ${ev.signups} signup${ev.signups === 1 ? '' : 's'} (${ev.conversionRate}% of viewers).` });
          } else if (ev.views > 0) {
            out.push({ tone: 'info', text: `“${ev.event}” is your most-viewed event (${ev.views} views) but has no signups yet — make the signup button clearer or add a reason to sign up.` });
          }
        }

        if (out.length === 0) {
          out.push({ tone: 'info', text: 'Not enough traffic yet to surface trends. As visits add up, this box will call out what changed and what to do about it.' });
        }
        return out.slice(0, 6);
      }

      // ── Filter controls ──
      const locationOptions = locations.map(l => '<option value="' + esc(l.slug) + '"' + (filterSlug === l.slug ? ' selected' : '') + '>' + esc(l.name) + '</option>').join('');
      const rangeChoices = [['today', 'Today'], ['7d', 'Last 7 Days'], ['30d', 'Last 30 Days'], ['custom', 'Custom Range']];
      const rangeOptions = rangeChoices.map(([val, label]) => '<option value="' + val + '"' + (filterRange === val ? ' selected' : '') + '>' + label + '</option>').join('');
      const sourceOptions = ['<option value="organic"' + (filterSource === 'organic' ? ' selected' : '') + '>Organic (store QR / direct)</option>']
        .concat(availableSources.map(s => '<option value="' + esc(s) + '"' + (filterSource === s ? ' selected' : '') + '>' + esc(s) + '</option>'))
        .join('');

      const filterForm = `
        <form id="analytics-filter" method="GET" action="/admin/analytics" class="admin-filter-bar">
          <select name="location" onchange="this.form.submit()">
            <option value="">All Locations</option>${locationOptions}
          </select>
          <select name="source" onchange="this.form.submit()">
            <option value="">All Sources</option>${sourceOptions}
          </select>
          <select name="range" id="range-select" onchange="handleRangeChange(this)">
            ${rangeOptions}
          </select>
          <span id="custom-dates" style="display:${filterRange === 'custom' ? 'flex' : 'none'};gap:8px;align-items:center;">
            <input type="date" name="startDate" value="${esc(customStart)}" />
            <span style="color:#666;">to</span>
            <input type="date" name="endDate" value="${esc(customEnd)}" />
            <button type="submit" class="btn btn-primary btn-sm">Go</button>
          </span>
          <a href="/admin/analytics/export?location=${esc(filterSlug)}&range=${esc(filterRange)}&source=${esc(filterSource)}" class="btn btn-secondary btn-sm">Export CSV</a>
        </form>`;

      // ── Live banner ──
      const liveBanner = `
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:20px;padding:12px 16px;background:#111;border:1px solid #333;border-radius:10px;">
          <span style="width:10px;height:10px;border-radius:50%;background:#4ade80;display:inline-block;animation:pulse 2s infinite;"></span>
          <span style="color:#ccc;font-size:0.92rem;"><strong id="live-count" style="color:#fff;font-size:1.1rem;">${liveCount}</strong> ${liveCount === 1 ? 'person' : 'people'} browsing right now</span>
        </div>`;

      // ── Sparkline chart ──
      const sparkW = 400;
      const sparkH = 80;
      const currentData = daysSorted.map(d => d[1]);
      const prevData = prevDaysSorted.map(d => d[1]);
      const sparkChart = `
        <div class="a-card">
          <h3 class="a-heading">Daily Traffic</h3>
          ${daysSorted.length > 0 ? `
            <svg viewBox="0 0 ${sparkW} ${sparkH}" style="width:100%;height:auto;max-height:120px;" preserveAspectRatio="none">
              ${sparklineSVG(prevData, sparkW, sparkH, '#555', true)}
              ${sparklineSVG(currentData, sparkW, sparkH, '#d4af37', false)}
            </svg>
            <div style="display:flex;justify-content:space-between;font-size:0.72rem;color:#666;margin-top:4px;">
              <span>${daysSorted.length > 0 ? daysSorted[0][0].slice(5) : ''}</span>
              <span style="display:flex;gap:12px;">
                <span><span style="color:#d4af37;">&#9473;</span> current</span>
                <span><span style="color:#555;">&#9476; &#9476;</span> previous</span>
              </span>
              <span>${daysSorted.length > 0 ? daysSorted[daysSorted.length - 1][0].slice(5) : ''}</span>
            </div>
          ` : '<p style="color:#666;font-size:0.85rem;">No data yet</p>'}
        </div>`;

      // ── Peak hours heatmap ──
      const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const hourStart = 10; // 10am
      const hourEnd = 25;   // 1am next day (wraps)
      const heatmapHours = [];
      for (let h = hourStart; h < hourEnd; h++) heatmapHours.push(h % 24);

      let heatmapCells = '';
      // Header row
      heatmapCells += '<div style="min-width:32px;"></div>';
      for (let d = 0; d < 7; d++) {
        heatmapCells += '<div style="text-align:center;font-size:0.7rem;color:#888;font-weight:600;">' + dayLabels[d] + '</div>';
      }
      // Data rows
      for (const h of heatmapHours) {
        const hourLabel = h === 0 ? '12a' : h < 12 ? h + 'a' : h === 12 ? '12p' : (h - 12) + 'p';
        heatmapCells += '<div style="font-size:0.68rem;color:#666;text-align:right;padding-right:4px;display:flex;align-items:center;justify-content:flex-end;">' + hourLabel + '</div>';
        for (let d = 0; d < 7; d++) {
          const count = heatmap[d][h];
          const intensity = heatmapMax > 0 ? count / heatmapMax : 0;
          const bg = count === 0 ? 'rgba(255,255,255,0.03)' : 'rgba(212,175,55,' + (0.12 + intensity * 0.88).toFixed(2) + ')';
          heatmapCells += '<div class="hm-cell" data-count="' + count + '" style="background:' + bg + ';border-radius:3px;aspect-ratio:1;cursor:pointer;" title="' + dayLabels[d] + ' ' + hourLabel + ': ' + count + '"></div>';
        }
      }

      const heatmapChart = `
        <div class="a-card">
          <h3 class="a-heading">Peak Hours</h3>
          <div style="display:grid;grid-template-columns:32px repeat(7,1fr);gap:2px;max-width:360px;">
            ${heatmapCells}
          </div>
          <div style="display:flex;align-items:center;gap:8px;margin-top:8px;font-size:0.68rem;color:#666;">
            <span>Quiet</span>
            <div style="flex:1;max-width:80px;height:8px;border-radius:4px;background:linear-gradient(90deg,rgba(212,175,55,0.12),rgba(212,175,55,1));"></div>
            <span>Busy</span>
          </div>
        </div>`;

      // ── Location leaderboard ──
      const locLeaderboard = locationsSorted.length > 0 ? locationsSorted.map(([slug, count], i) => {
        const name = locationNameMap[slug] || slug;
        const pct = totalSessions > 0 ? Math.round((count / totalSessions) * 100) : 0;
        const prevCount = prevByLocation[slug] || 0;
        const change = pctChange(count, prevCount);
        // Mini sparkline for this location
        const locDays = locationDayMap[slug] || {};
        const allDays = daysSorted.map(d => d[0]);
        const locData = allDays.map(d => locDays[d] || 0);
        const miniSpark = locData.length > 1
          ? '<svg viewBox="0 0 60 20" style="width:60px;height:20px;" preserveAspectRatio="none">' + sparklineSVG(locData, 60, 20, '#d4af37', false) + '</svg>'
          : '';
        return '<tr>'
          + '<td style="color:#666;font-weight:700;">' + (i + 1) + '</td>'
          + '<td style="font-weight:600;color:#fff;">' + esc(name) + '</td>'
          + '<td>' + count + '</td>'
          + '<td style="color:#888;">' + pct + '%</td>'
          + '<td>' + miniSpark + '</td>'
          + '<td>' + changeArrow(change) + '</td>'
          + '</tr>';
      }).join('') : '<tr><td colspan="6" style="color:#666;padding:12px;">No data</td></tr>';

      const locationSection = `
        <div class="a-card" style="margin-bottom:24px;">
          <h3 class="a-heading">Traffic by Location</h3>
          <table style="width:100%;border-collapse:collapse;font-size:0.85rem;">
            <thead><tr style="color:#888;text-align:left;border-bottom:1px solid #222;">
              <th style="padding:6px;width:32px;">#</th><th style="padding:6px;">Location</th><th style="padding:6px;">Sessions</th>
              <th style="padding:6px;">Share</th><th style="padding:6px;">Trend</th><th style="padding:6px;">vs Prev</th>
            </tr></thead>
            <tbody style="color:#ccc;">${locLeaderboard}</tbody>
          </table>
        </div>`;

      const sharingRows = sharingLeaderboardRows.length > 0 ? sharingLeaderboardRows.map((m, i) => {
        return '<tr>'
          + '<td style="color:#666;font-weight:700;">' + (i + 1) + '</td>'
          + '<td><div style="font-weight:700;color:#fff;">' + esc(m.name) + '</div><div style="color:#777;font-size:0.74rem;">Score ' + m.shareScore + '</div></td>'
          + '<td><strong style="color:#93c5fd;">' + m.tagged + '</strong><div style="color:#777;font-size:0.74rem;">' + m.taggedRate + '% of traffic</div></td>'
          + '<td>' + m.sessions + '</td>'
          + '<td>' + m.unique + '</td>'
          + '<td>' + m.avgPages + '</td>'
          + '<td>' + (m.avgDuration ? fmtDur(m.avgDuration) : '-') + '</td>'
          + '</tr>';
      }).join('') : '<tr><td colspan="7" style="color:#666;padding:12px;">No sharing data yet</td></tr>';

      const returningRows = returningLeaderboardRows.length > 0 ? returningLeaderboardRows.map((m, i) => {
        return '<tr>'
          + '<td style="color:#666;font-weight:700;">' + (i + 1) + '</td>'
          + '<td style="font-weight:700;color:#fff;">' + esc(m.name) + '</td>'
          + '<td><strong style="color:#a78bfa;">' + m.returning + '</strong></td>'
          + '<td>' + m.returnRate + '%</td>'
          + '<td>' + m.unique + '</td>'
          + '<td>' + m.organic + '</td>'
          + '</tr>';
      }).join('') : '<tr><td colspan="6" style="color:#666;padding:12px;">No returning visitors yet</td></tr>';

      const insightList = [
        taggedSessions === 0
          ? 'No tagged sharing is showing yet. Use Trackable Links below for Instagram, Facebook, event posts, email, and ads.'
          : taggedSessions + ' sessions came from tagged links. Those are the clearest signal of locations actively sharing links.',
        organicSessions > 0
          ? organicSessions + ' sessions are organic/direct. This includes store QR scans, typed links, bookmarks, and untagged social links.'
          : 'No organic/direct sessions in this range.',
        strongReturningLocations.length > 0
          ? 'Best return signal: ' + strongReturningLocations.map(m => m.name + ' (' + m.returnRate + '%)').join(', ') + '.'
          : 'Returning visitor data will become more useful after visitors come back across multiple days.',
        lowTaggedLocations.length > 0
          ? 'Locations to coach on tagged sharing: ' + lowTaggedLocations.map(m => m.name).join(', ') + '.'
          : 'No obvious low-sharing location needs attention in this range.',
      ];
      const unassignedAnalyticsNote = unassignedSessions > 0
        ? '<div class="a-note">There are ' + unassignedSessions + ' non-location sessions in this range. They are included in total traffic, but left out of location rankings because they are not tied to a location.</div>'
        : '';

      const marketingSection = `
        <div class="a-card analytics-callout" style="margin-bottom:24px;background:#101114;border-color:#283244;">
          <div style="display:flex;justify-content:space-between;gap:16px;align-items:flex-start;flex-wrap:wrap;margin-bottom:14px;">
            <div>
              <h3 class="a-heading" style="color:#93c5fd;margin-bottom:6px;">Sharing and Return Rankings</h3>
              <p style="color:#aaa;font-size:0.86rem;line-height:1.5;margin:0;max-width:760px;">
                Tagged traffic is the reliable way to rank who is sharing links. Organic/direct traffic is still valuable, but it cannot prove whether the visit came from a printed QR, a bookmark, or an untagged post.
              </p>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
              <span class="metric-pill"><strong>${taggedSessions}</strong> tagged</span>
              <span class="metric-pill"><strong>${taggedRate}%</strong> tagged rate</span>
              <span class="metric-pill"><strong>${organicSessions}</strong> organic/direct</span>
            </div>
          </div>

          <div class="a-insights">
            ${insightList.map(text => '<div class="a-insight">' + esc(text) + '</div>').join('')}
          </div>
          ${unassignedAnalyticsNote}

          <div class="a-grid-2" style="margin-bottom:0;">
            <div style="overflow-x:auto;">
              <h4 style="color:#fff;font-size:0.92rem;margin:0 0 10px;">Locations driving shared traffic</h4>
              <table class="a-table">
                <thead><tr>
                  <th>#</th><th>Location</th><th>Tagged Visits</th><th>Sessions</th><th>Visitors</th><th>Pages</th><th>Time</th>
                </tr></thead>
                <tbody>${sharingRows}</tbody>
              </table>
            </div>
            <div style="overflow-x:auto;">
              <h4 style="color:#fff;font-size:0.92rem;margin:0 0 10px;">Best returning audience</h4>
              <table class="a-table">
                <thead><tr>
                  <th>#</th><th>Location</th><th>Returning</th><th>Rate</th><th>Visitors</th><th>Organic</th>
                </tr></thead>
                <tbody>${returningRows}</tbody>
              </table>
            </div>
          </div>
        </div>`;

      const campaignTableRows = campaignRows.length > 0 ? campaignRows.map((row, i) => {
        const label = row.label === 'organic' ? 'Organic / direct' : row.label;
        const detail = [
          row.qrId ? 'QR: ' + row.qrId : '',
          row.campaign ? 'Campaign: ' + row.campaign : '',
          row.source && row.source !== row.label ? 'Source: ' + row.source : '',
        ].filter(Boolean).join(' | ');
        return '<tr>'
          + '<td style="color:#666;font-weight:700;">' + (i + 1) + '</td>'
          + '<td><strong style="color:#fff;">' + esc(label) + '</strong>' + (detail ? '<div style="color:#777;font-size:0.74rem;">' + esc(detail) + '</div>' : '') + '</td>'
          + '<td>' + row.sessions + '</td>'
          + '<td>' + row.unique + '</td>'
          + '<td>' + row.returning + ' <span style="color:#777;">(' + row.returnRate + '%)</span></td>'
          + '<td>' + row.locations + '</td>'
          + '<td>' + row.avgPages + '</td>'
          + '</tr>';
      }).join('') : '<tr><td colspan="7" style="color:#666;padding:12px;">No campaign data yet</td></tr>';

      const knownGuestTableRows = knownGuestRows.length > 0 ? knownGuestRows.map((row, i) => {
        const tags = [
          row.returning ? 'returning' : '',
          row.giftCardOptIn ? 'gift card' : '',
          row.newsletterOptIn ? 'newsletter' : '',
        ].filter(Boolean).map(t => '<span class="tiny-tag">' + esc(t) + '</span>').join(' ');
        return '<tr>'
          + '<td style="color:#666;font-weight:700;">' + (i + 1) + '</td>'
          + '<td><strong style="color:#fff;">' + esc(row.emailMasked) + '</strong><div style="margin-top:3px;">' + tags + '</div></td>'
          + '<td>' + row.visits + '</td>'
          + '<td>' + row.lifetimeVisits + '</td>'
          + '<td>' + row.linkedDevices + '</td>'
          + '<td>' + row.locations + '</td>'
          + '<td>' + row.feedbackCount + '</td>'
          + '<td>' + row.eventSignupCount + '</td>'
          + '<td>' + esc(fmtShortDate(row.lastSeenAt)) + '</td>'
          + '</tr>';
      }).join('') : '<tr><td colspan="9" style="color:#666;padding:12px;">No known guests in this range yet</td></tr>';

      const eventInterestTableRows = eventInterestRows.length > 0 ? eventInterestRows.map((row, i) => {
        return '<tr>'
          + '<td style="color:#666;font-weight:700;">' + (i + 1) + '</td>'
          + '<td><strong style="color:#fff;">' + esc(row.event) + '</strong><div style="color:#777;font-size:0.74rem;">' + esc(row.location) + '</div></td>'
          + '<td>' + row.views + '</td>'
          + '<td>' + row.visitors + '</td>'
          + '<td>' + row.signups + '</td>'
          + '<td>' + row.conversionRate + '%</td>'
          + '</tr>';
      }).join('') : '<tr><td colspan="6" style="color:#666;padding:12px;">No event traffic in this range yet</td></tr>';

      const highIntentTableRows = highIntentRows.length > 0 ? highIntentRows.map((row, i) => {
        return '<tr>'
          + '<td style="color:#666;font-weight:700;">' + (i + 1) + '</td>'
          + '<td><strong style="color:#fff;">' + esc(row.label) + '</strong><div style="color:#777;font-size:0.74rem;">known guest</div></td>'
          + '<td>' + row.sessions + '</td>'
          + '<td>' + row.pageTotal + '</td>'
          + '<td>' + (row.durationTotal ? fmtDur(row.durationTotal) : '-') + '</td>'
          + '<td>' + row.locationsCount + '</td>'
          + '<td>' + row.score + '</td>'
          + '</tr>';
      }).join('') : '<tr><td colspan="7" style="color:#666;padding:12px;">No known high-intent guests in this range yet. This table will populate after guests enter an email and return.</td></tr>';

      const anonymousIntentSection = `
        <div class="anonymous-summary">
          <div><strong>${anonymousRepeatVisitors}</strong><span>anonymous repeat visitors</span></div>
          <div><strong>${anonymousDeepBrowsers}</strong><span>viewed 8+ pages</span></div>
          <div><strong>${anonymousMultiLocationVisitors}</strong><span>visited 2+ locations</span></div>
        </div>
        <p style="color:#9ca3af;font-size:0.82rem;line-height:1.45;margin:10px 0 0;">${esc(anonymousActionableNote)}</p>`;

      const funnelConversionRate = totalSessions > 0 ? Math.round(((giftCardEntries + eventSignupCount) / totalSessions) * 100) : 0;
      const conversionSection = `
        <div class="a-card" style="margin-bottom:24px;background:#111318;border-color:#263143;">
          <h3 class="a-heading" style="color:#93c5fd;">Conversion Analytics</h3>
          <div class="conversion-strip">
            <div><strong>${totalSessions}</strong><span>sessions</span></div>
            <div><strong>${feedbackSubmits}</strong><span>feedback</span></div>
            <div><strong>${giftCardEntries}</strong><span>gift card entries</span></div>
            <div><strong>${newsletterOptIns}</strong><span>newsletter opt-ins</span></div>
            <div><strong>${eventSignupCount}</strong><span>event signups</span></div>
            <div><strong>${funnelConversionRate}%</strong><span>entry/signup rate</span></div>
          </div>
          <p style="color:#9ca3af;font-size:0.84rem;line-height:1.5;margin:12px 0 0;">
            Known-guest reporting starts when someone enters an email on feedback, gift-card, newsletter, or event forms. Emails are masked in analytics, and repeat visits are matched through the visitor cookie linked to that email.
          </p>
        </div>`;

      // Individual cards from the former "deeper analytics" bundle, so each can
      // live under the tab where it belongs (Marketing / Guests / Content).
      const campaignCard = `
        <div class="a-card" style="overflow-x:auto;">
          <h3 class="a-heading">QR &amp; campaign performance ${helpTip('Each tagged link or QR code you created, and how much traffic + how many returning guests it brought. Untagged walk-ups show as "organic."')}</h3>
          <p class="a-sub">Which links and QR codes are actually pulling people in.</p>
          <table class="a-table">
            <thead><tr><th>#</th><th>Campaign</th><th>Visits</th><th>Visitors</th><th>Returning</th><th>Locations</th><th>Pages</th></tr></thead>
            <tbody>${campaignTableRows}</tbody>
          </table>
        </div>`;
      const knownGuestsCard = `
        <div class="a-card" style="overflow-x:auto;">
          <h3 class="a-heading">Known repeat guests ${helpTip('Guests who gave an email (via feedback, gift-card, newsletter, or an event form) and came back. Emails are masked for privacy.')}</h3>
          <p class="a-sub">Real people coming back — your most valuable audience.</p>
          <table class="a-table">
            <thead><tr><th>#</th><th>Guest</th><th>Range</th><th>Total</th><th>Devices</th><th>Locations</th><th>Feedback</th><th>Events</th><th>Last Seen</th></tr></thead>
            <tbody>${knownGuestTableRows}</tbody>
          </table>
        </div>`;
      const eventImpactCard = `
        <div class="a-card" style="overflow-x:auto;">
          <h3 class="a-heading">Event impact ${helpTip('How many people viewed each event page and how many of them signed up. "Rate" is signups ÷ unique visitors.')}</h3>
          <p class="a-sub">Which events drew interest and turned views into signups.</p>
          <table class="a-table">
            <thead><tr><th>#</th><th>Event</th><th>Views</th><th>Visitors</th><th>Signups</th><th>Rate</th></tr></thead>
            <tbody>${eventInterestTableRows}</tbody>
          </table>
        </div>`;
      const highIntentCard = `
        <div class="a-card" style="overflow-x:auto;">
          <h3 class="a-heading">Known high-intent guests ${helpTip('Known guests showing strong interest — multiple visits, lots of pages, or long time on site. Good people to follow up with.')}</h3>
          <p class="a-sub">Engaged, identifiable guests worth a personal follow-up.</p>
          <table class="a-table">
            <thead><tr><th>#</th><th>Guest</th><th>Visits</th><th>Pages</th><th>Time</th><th>Locations</th><th>Score</th></tr></thead>
            <tbody>${highIntentTableRows}</tbody>
          </table>
          ${anonymousIntentSection}
        </div>`;

      // ── Content engagement funnel ──
      const funnelSection = `
        <div class="a-card" style="margin-bottom:24px;">
          <h3 class="a-heading">Content Engagement</h3>
          ${funnelData.map((step, i) => {
            const widthPct = funnelMax > 0 ? Math.max(Math.round((step.count / funnelMax) * 100), 2) : 2;
            const dropoff = i > 0 && funnelData[i - 1].count > 0
              ? Math.round((1 - step.count / funnelData[i - 1].count) * 100)
              : null;
            return '<div style="margin-bottom:6px;">'
              + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px;">'
              + '<span style="font-size:0.82rem;color:#ccc;">' + esc(step.label) + '</span>'
              + '<span style="font-size:0.82rem;color:#d4af37;font-weight:700;">' + step.count + (dropoff !== null ? ' <span style="color:#f87171;font-weight:400;font-size:0.72rem;">(-' + dropoff + '%)</span>' : '') + '</span>'
              + '</div>'
              + '<div style="background:#1a1a1d;border-radius:4px;height:18px;overflow:hidden;">'
              + '<div style="width:' + widthPct + '%;height:100%;border-radius:4px;background:linear-gradient(90deg,#d4af37,#b8913e);"></div>'
              + '</div>'
              + '</div>';
          }).join('')}
        </div>`;

      // ── Top entry pages + traffic source ──
      const entryPagesChart = topEntryPages.map(([path, count]) => barRow(path, count, topEntryMax)).join('');

      // Build multi-source stacked bar + legend
      const sourcePalette = ['#d4af37', '#60a5fa', '#a78bfa', '#f472b6', '#4ade80', '#fb923c', '#22d3ee', '#facc15'];
      const sourceColorFor = (name, idx) => name === 'organic' ? '#555' : sourcePalette[idx % sourcePalette.length];
      const sourceBarSegments = sourcesSorted.map(([name, count], idx) => {
        const pct = totalSessions > 0 ? (count / totalSessions) * 100 : 0;
        const color = sourceColorFor(name, idx);
        return `<div style="width:${pct}%;background:${color};min-width:${count > 0 ? '2px' : '0'};" title="${esc(name)}: ${count} (${Math.round(pct)}%)"></div>`;
      }).join('');
      const sourceLegendRows = sourcesSorted.map(([name, count], idx) => {
        const pct = totalSessions > 0 ? Math.round((count / totalSessions) * 100) : 0;
        const color = sourceColorFor(name, idx);
        const displayName = name === 'organic' ? 'Organic (store QR / direct)' : name;
        return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;font-size:0.82rem;">
          <span style="width:10px;height:10px;border-radius:2px;background:${color};display:inline-block;flex-shrink:0;"></span>
          <span style="color:#ccc;flex:1;text-transform:capitalize;">${esc(displayName)}</span>
          <span style="color:#888;">${count} &middot; ${pct}%</span>
        </div>`;
      }).join('');
      const sourceSection = `
        <div>
          ${sourcesSorted.length > 0 ? `
            <div style="display:flex;gap:2px;height:24px;border-radius:6px;overflow:hidden;margin-bottom:10px;background:#1a1a1d;">
              ${sourceBarSegments}
            </div>
            <div>${sourceLegendRows}</div>
            ${taggedSessions === 0 ? `
              <div style="margin-top:10px;padding:8px 10px;background:rgba(96,165,250,0.08);border:1px solid rgba(96,165,250,0.2);border-radius:6px;font-size:0.78rem;color:#93c5fd;">
                No tagged traffic yet. Use the Trackable Links card below to tag your social links with <code style="background:#0d0d0d;padding:1px 5px;border-radius:3px;">?src=...</code>
              </div>
            ` : ''}
          ` : '<p style="color:#666;font-size:0.85rem;">No data yet</p>'}
        </div>`;

      // ── New vs returning ──
      const newPct = uniqueVisitors > 0 ? Math.round((newVisitors / uniqueVisitors) * 100) : 0;
      const retPct = 100 - newPct;
      const nvrSection = `
        <div style="margin-top:12px;">
          <div style="font-size:0.72rem;color:#888;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px;">New vs Returning</div>
          <div style="display:flex;gap:4px;height:18px;border-radius:6px;overflow:hidden;margin-bottom:6px;">
            <div style="width:${newPct}%;background:#60a5fa;min-width:${newVisitors > 0 ? '2px' : '0'};"></div>
            <div style="width:${retPct}%;background:#a78bfa;min-width:${returningVisitors > 0 ? '2px' : '0'};"></div>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:0.78rem;">
            <span style="color:#60a5fa;">New: ${newVisitors}</span>
            <span style="color:#a78bfa;">Returning: ${returningVisitors}</span>
          </div>
        </div>`;

      // ── Recent sessions table ──
      const recentRows = sessions.slice(0, 20).map(s => {
        const time = s.startedAt ? new Date(s.startedAt).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
        const srcLabel = s.source
          ? '<span style="background:rgba(96,165,250,0.15);color:#93c5fd;padding:2px 8px;border-radius:10px;font-size:0.72rem;font-weight:600;text-transform:capitalize;">' + esc(s.source) + '</span>'
          : '<span style="color:#666;font-size:0.78rem;">organic</span>';
        return '<tr>'
          + '<td>' + esc(time) + '</td>'
          + '<td>' + esc(locationNameMap[s.locationSlug] || s.locationSlug || 'home') + '</td>'
          + '<td>' + esc(s.deviceType || '?') + '</td>'
          + '<td>' + srcLabel + '</td>'
          + '<td>' + esc(s.entryPage || '/') + '</td>'
          + '<td>' + (s.pageCount || 1) + '</td>'
          + '<td>' + (s.durationSecs ? fmtDur(s.durationSecs) : '-') + '</td>'
          + '</tr>';
      }).join('');

      // ── Trackable Links builder ──
      // Base URL — prefer the request host so staging and prod both work
      const hostHeader = req.headers['x-forwarded-host'] || req.headers.host || 'apps.dramanddraught.com';
      const proto = (req.headers['x-forwarded-proto'] || (req.socket && req.socket.encrypted ? 'https' : 'http'));
      const baseUrl = proto + '://' + hostHeader;
      const linkLocationOptions = locations.map(l => '<option value="' + esc(l.slug) + '">' + esc(l.name) + '</option>').join('');

      // Load events per location for the link builder dropdown.
      // Include inactive events with a "(draft)" label so admins can prep
      // links for events that aren't live yet.
      let eventsByLocation = {};
      try {
        if (prisma.event) {
          const allEvents = await prisma.event.findMany({
            where: { isCancelled: false },
            orderBy: [{ startDate: 'desc' }],
            select: { id: true, slug: true, title: true, locationId: true, startDate: true, isActive: true },
            take: 300,
          });
          const locById = {};
          locations.forEach(l => { locById[l.id] = l.slug; });
          allEvents.forEach(ev => {
            const slug = locById[ev.locationId];
            if (!slug || !ev.slug) return;
            if (!eventsByLocation[slug]) eventsByLocation[slug] = [];
            eventsByLocation[slug].push({
              slug: ev.slug,
              title: ev.title + (ev.isActive ? '' : ' (draft)'),
            });
          });
        }
      } catch (err) {
        console.warn('Trackable links: event load failed:', err.message);
      }
      const linkBuilderSection = `
        <div class="a-card" style="margin-top:24px;background:#111;border:1px solid rgba(96,165,250,0.3);">
          <h3 class="a-heading" style="color:#60a5fa;">Trackable Links</h3>
          <p style="color:#aaa;font-size:0.85rem;margin-bottom:14px;line-height:1.5;">
            Generate a tagged URL to paste into social posts, emails, or ads. Traffic from tagged links shows up under its source tag in the breakdown above &mdash; everything else stays in &ldquo;Organic&rdquo; (store QR scans and direct visits).
          </p>
          <div style="display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;margin-bottom:12px;" class="tl-grid">
            <div>
              <label style="display:block;font-size:0.72rem;color:#888;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:5px;">Location</label>
              <select id="tl-location" style="width:100%;padding:8px 10px;background:#1a1a1d;color:#ccc;border:1px solid #333;border-radius:6px;font-size:0.85rem;">
                ${linkLocationOptions}
              </select>
            </div>
            <div>
              <label style="display:block;font-size:0.72rem;color:#888;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:5px;">Page</label>
              <select id="tl-page" style="width:100%;padding:8px 10px;background:#1a1a1d;color:#ccc;border:1px solid #333;border-radius:6px;font-size:0.85rem;">
                <option value="/specials">Specials</option>
                <option value="">Location Home</option>
                <option value="/menu">Full Menu</option>
                <option value="/draft">Draft List</option>
                <option value="/flights">Flights</option>
                <option value="/events/lubrication-cup">Lubrication Cup (legacy slug)</option>
                <option value="__event__">Event ↓ (pick below)</option>
              </select>
            </div>
            <div>
              <label style="display:block;font-size:0.72rem;color:#888;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:5px;">Source Tag</label>
              <input type="text" id="tl-source" placeholder="e.g. instagram, event" value="instagram" style="width:100%;padding:8px 10px;background:#1a1a1d;color:#ccc;border:1px solid #333;border-radius:6px;font-size:0.85rem;" />
            </div>
            <div>
              <label style="display:block;font-size:0.72rem;color:#888;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:5px;">Campaign</label>
              <input type="text" id="tl-campaign" placeholder="spring-menu" style="width:100%;padding:8px 10px;background:#1a1a1d;color:#ccc;border:1px solid #333;border-radius:6px;font-size:0.85rem;" />
            </div>
            <div>
              <label style="display:block;font-size:0.72rem;color:#888;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:5px;">QR ID</label>
              <input type="text" id="tl-qr" placeholder="table-tent-1" style="width:100%;padding:8px 10px;background:#1a1a1d;color:#ccc;border:1px solid #333;border-radius:6px;font-size:0.85rem;" />
            </div>
          </div>
          <div id="tl-event-row" style="display:none;margin-bottom:12px;">
            <label style="display:block;font-size:0.72rem;color:#888;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:5px;">Pick Event</label>
            <select id="tl-event-slug" style="width:100%;padding:8px 10px;background:#1a1a1d;color:#ccc;border:1px solid #333;border-radius:6px;font-size:0.85rem;">
              <option value="">— Select an event —</option>
            </select>
            <div id="tl-event-empty" style="display:none;color:#888;font-size:0.78rem;margin-top:6px;">No active events at this location yet. Create one in <a href="/admin/events" style="color:#60a5fa;">Events</a>.</div>
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px;">
            <span style="color:#666;font-size:0.76rem;margin-right:4px;align-self:center;">Quick picks:</span>
            <button type="button" class="tl-quick" data-src="instagram" style="background:#1a1a1d;border:1px solid #333;color:#aaa;padding:3px 10px;border-radius:12px;font-size:0.75rem;cursor:pointer;">instagram</button>
            <button type="button" class="tl-quick" data-src="facebook" style="background:#1a1a1d;border:1px solid #333;color:#aaa;padding:3px 10px;border-radius:12px;font-size:0.75rem;cursor:pointer;">facebook</button>
            <button type="button" class="tl-quick" data-src="event" style="background:#1a1a1d;border:1px solid #333;color:#aaa;padding:3px 10px;border-radius:12px;font-size:0.75rem;cursor:pointer;">event</button>
            <button type="button" class="tl-quick" data-src="email" style="background:#1a1a1d;border:1px solid #333;color:#aaa;padding:3px 10px;border-radius:12px;font-size:0.75rem;cursor:pointer;">email</button>
            <button type="button" class="tl-quick" data-src="tiktok" style="background:#1a1a1d;border:1px solid #333;color:#aaa;padding:3px 10px;border-radius:12px;font-size:0.75rem;cursor:pointer;">tiktok</button>
          </div>
          <div style="display:flex;gap:8px;align-items:stretch;">
            <input type="text" id="tl-url" readonly style="flex:1;padding:10px 12px;background:#0d0d0d;color:#d4af37;border:1px solid #333;border-radius:6px;font-size:0.85rem;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;" />
            <button type="button" id="tl-copy" style="padding:10px 16px;background:linear-gradient(135deg,#d4af37,#b87333);color:#111;border:none;border-radius:6px;font-weight:700;cursor:pointer;font-size:0.85rem;white-space:nowrap;">Copy</button>
          </div>
          <div id="tl-copied" style="display:none;margin-top:8px;color:#4ade80;font-size:0.78rem;">\u2713 Copied to clipboard</div>
        </div>
        <script>
          (function() {
            var locSel = document.getElementById('tl-location');
            var pageSel = document.getElementById('tl-page');
            var srcIn = document.getElementById('tl-source');
            var campaignIn = document.getElementById('tl-campaign');
            var qrIn = document.getElementById('tl-qr');
            var urlIn = document.getElementById('tl-url');
            var copyBtn = document.getElementById('tl-copy');
            var copied = document.getElementById('tl-copied');
            var eventRow = document.getElementById('tl-event-row');
            var eventSel = document.getElementById('tl-event-slug');
            var eventEmpty = document.getElementById('tl-event-empty');
            var base = ${JSON.stringify(baseUrl)};
            var eventsByLocation = ${JSON.stringify(eventsByLocation)};

            function refreshEventOptions() {
              if (!eventSel) return;
              var loc = locSel.value;
              var events = eventsByLocation[loc] || [];
              eventSel.innerHTML = '<option value="">— Select an event —</option>' +
                events.map(function(ev) {
                  return '<option value="' + ev.slug + '">' + ev.title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</option>';
                }).join('');
              if (eventEmpty) eventEmpty.style.display = events.length === 0 ? 'block' : 'none';
            }
            function update() {
              var loc = locSel.value;
              var pageVal = pageSel.value;
              var src = (srcIn.value || '').trim().toLowerCase().replace(/[^a-z0-9_.\\-]/g, '');
              var campaign = (campaignIn.value || '').trim().toLowerCase().replace(/[^a-z0-9_.\\-]/g, '');
              var qr = (qrIn.value || '').trim().toLowerCase().replace(/[^a-z0-9_.\\-]/g, '');

              if (eventRow) eventRow.style.display = pageVal === '__event__' ? 'block' : 'none';

              var pagePath;
              if (pageVal === '__event__') {
                var evSlug = eventSel ? eventSel.value : '';
                if (!evSlug) {
                  urlIn.value = base + '/' + loc + ' (pick an event above)';
                  return;
                }
                pagePath = '/events/' + evSlug;
              } else {
                pagePath = pageVal;
              }
              var url = base + '/' + loc + pagePath;
              var params = [];
              if (src) params.push('src=' + encodeURIComponent(src));
              if (campaign) params.push('campaign=' + encodeURIComponent(campaign));
              if (qr) params.push('qr=' + encodeURIComponent(qr));
              if (params.length) url += '?' + params.join('&');
              urlIn.value = url;
            }
            locSel.addEventListener('change', function() { refreshEventOptions(); update(); });
            pageSel.addEventListener('change', update);
            srcIn.addEventListener('input', update);
            campaignIn.addEventListener('input', update);
            qrIn.addEventListener('input', update);
            if (eventSel) eventSel.addEventListener('change', update);
            document.querySelectorAll('.tl-quick').forEach(function(btn) {
              btn.addEventListener('click', function() {
                srcIn.value = btn.getAttribute('data-src');
                update();
              });
            });
            copyBtn.addEventListener('click', function() {
              urlIn.select();
              try {
                navigator.clipboard.writeText(urlIn.value);
                copied.style.display = 'block';
                setTimeout(function() { copied.style.display = 'none'; }, 2000);
              } catch (e) {
                document.execCommand && document.execCommand('copy');
              }
            });
            refreshEventOptions();
            update();
          })();
        </script>`;

      // ── Technical details (collapsible) ──
      const techSection = `
        <details style="margin-top:24px;">
          <summary style="cursor:pointer;color:#888;font-size:0.82rem;letter-spacing:0.08em;text-transform:uppercase;padding:8px 0;">Technical Details</summary>
          <div class="a-grid-3" style="margin-top:12px;">
            <div class="a-card">
              <h3 class="a-heading">Devices</h3>
              ${Object.entries(devices).sort((a, b) => b[1] - a[1]).map(([d, c]) => barRow(d, c, Math.max(...Object.values(devices), 1))).join('')}
            </div>
            <div class="a-card">
              <h3 class="a-heading">Browsers</h3>
              ${Object.entries(browsers).sort((a, b) => b[1] - a[1]).map(([b, c]) => barRow(b, c, Math.max(...Object.values(browsers), 1))).join('')}
            </div>
            <div class="a-card">
              <h3 class="a-heading">Operating Systems</h3>
              ${Object.entries(osList).sort((a, b) => b[1] - a[1]).map(([o, c]) => barRow(o, c, Math.max(...Object.values(osList), 1))).join('')}
            </div>
          </div>
        </details>`;

      // ── Assemble page ──
      // ── Overview: insight strip, headline KPIs, tab nav ──
      const rangeLabelMap = { today: 'Today', '7d': 'Last 7 days', '30d': 'Last 30 days', custom: 'Selected range' };
      const rangeLabel = rangeLabelMap[filterRange] || 'This period';
      const insightItems = buildInsights();
      const insightStrip = `
        <div class="a-insight-strip">
          <div class="a-insight-head">${esc(rangeLabel)} — what to know</div>
          <ul class="a-insight-list">
            ${insightItems.map(it => `<li class="a-ins a-ins-${it.tone === 'good' || it.tone === 'warn' ? it.tone : 'info'}">${esc(it.text)}</li>`).join('')}
          </ul>
        </div>`;
      const headlineKpis = [
        kpiCard('Visits', totalSessions, pctChange(totalSessions, prevTotal), 'Times your pages were opened', 'A visit (session) is one person browsing in a sitting. The same person returning later counts again.'),
        kpiCard('Unique visitors', uniqueVisitors, pctChange(uniqueVisitors, prevUnique), 'Distinct people (by device)', 'Counts each device once in this range, no matter how many times it came back.'),
        kpiCard('Return rate', returnRate + '%', pctChange(returnRate, prevReturnRate), 'Share who had visited before', 'Of your unique visitors, the share that had also visited before this range. Higher means more loyalty.'),
        kpiCard('New guests', newVisitors, undefined, 'First-time visitors', 'Unique visitors with no earlier visit on record.'),
        kpiCard('From your links', taggedRate + '%', undefined, 'Visits from tagged links/QR', 'Share of visits that arrived through a link or QR code you tagged with ?src=. The rest are walk-ups (organic).'),
        kpiCard('Avg. time', fmtDur(avgDuration), pctChange(avgDuration, prevAvgDur), 'Typical time per visit', 'Average session length across visits we could measure.'),
      ].join('');
      const tabsNav = `
        <div class="a-tabs" role="tablist" aria-label="Analytics sections">
          ${[['overview', 'Overview'], ['traffic', 'Traffic'], ['marketing', 'Marketing'], ['guests', 'Guests'], ['engagement', 'Content'], ['details', 'Details']]
            .map(([id, label], i) => `<button type="button" class="a-tab${i === 0 ? ' is-active' : ''}" data-tab-btn="${id}" role="tab">${label}</button>`).join('')}
        </div>`;

      const content = `
        <style>
          .a-stat { background:#1a1a1d;border:1px solid #2a2a2a;border-radius:12px;padding:14px 10px;text-align:center;min-width:0; }
          .a-card { background:#111;border:1px solid #2a2a2a;border-radius:12px;padding:16px; }
          .a-heading { color:#d4af37;font-size:0.78rem;letter-spacing:0.12em;text-transform:uppercase;margin-bottom:12px;font-weight:700; }
          .a-grid-2 { display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:24px; }
          .a-grid-3 { display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px; }
          .a-grid-stats { display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:24px; }
          .metric-pill { display:inline-flex;align-items:center;gap:5px;padding:7px 10px;border:1px solid rgba(147,197,253,0.24);background:rgba(96,165,250,0.08);border-radius:999px;color:#bfdbfe;font-size:0.8rem;white-space:nowrap; }
          .metric-pill strong { color:#fff; }
          .a-insights { display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-bottom:18px; }
          .a-insight { background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:10px;color:#d1d5db;font-size:0.84rem;line-height:1.4; }
          .a-note { background:rgba(212,175,55,0.08);border:1px solid rgba(212,175,55,0.18);border-radius:8px;padding:9px 10px;color:#e6d39c;font-size:0.82rem;line-height:1.4;margin-bottom:16px; }
          .a-table { width:100%;border-collapse:collapse;font-size:0.82rem;min-width:560px; }
          .a-table th { padding:7px 6px;color:#8b949e;text-align:left;border-bottom:1px solid rgba(255,255,255,0.12);font-weight:700; }
          .a-table td { padding:8px 6px;color:#d1d5db;border-bottom:1px solid rgba(255,255,255,0.06);vertical-align:top; }
          .tiny-tag { display:inline-block;background:rgba(147,197,253,0.12);border:1px solid rgba(147,197,253,0.22);color:#bfdbfe;border-radius:999px;padding:2px 7px;font-size:0.68rem;margin:0 3px 3px 0; }
          .conversion-strip { display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px; }
          .conversion-strip div { background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:10px;text-align:center;min-width:0; }
          .conversion-strip strong { display:block;color:#fff;font-size:1.25rem;line-height:1; }
          .conversion-strip span { display:block;color:#8b949e;font-size:0.72rem;text-transform:uppercase;letter-spacing:0.07em;margin-top:6px; }
          .anonymous-summary { display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:12px; }
          .anonymous-summary div { background:rgba(255,255,255,0.035);border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:9px;text-align:center; }
          .anonymous-summary strong { display:block;color:#fff;font-size:1.15rem;line-height:1; }
          .anonymous-summary span { display:block;color:#8b949e;font-size:0.68rem;text-transform:uppercase;letter-spacing:0.06em;margin-top:6px; }
          @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }
          @media(max-width:1100px) {
            .tl-grid { grid-template-columns:repeat(2,minmax(0,1fr)) !important; }
          }
          @media(max-width:768px) {
            .a-grid-2 { grid-template-columns:1fr; }
            .a-grid-3 { grid-template-columns:1fr; }
            .a-grid-stats { grid-template-columns:repeat(2,1fr); }
            .a-insights { grid-template-columns:1fr; }
            .metric-pill { font-size:0.76rem;padding:6px 8px; }
            .conversion-strip { grid-template-columns:repeat(2,minmax(0,1fr)); }
            .anonymous-summary { grid-template-columns:1fr; }
            .tl-grid { grid-template-columns:1fr !important; }
          }
          /* ── Redesign: tabs, KPIs, tooltips, insight strip ── */
          .a-sub { color:#9ca3af;font-size:0.8rem;margin:-6px 0 12px;line-height:1.4; }
          .a-tabs { display:flex;flex-wrap:wrap;gap:4px;border-bottom:1px solid #2a2a2a;margin-bottom:22px; }
          .a-tab { background:none;border:none;border-bottom:2px solid transparent;color:#9ca3af;padding:10px 15px;font-size:0.92rem;font-weight:700;cursor:pointer;border-radius:6px 6px 0 0; }
          .a-tab:hover { color:#e5e7eb;background:rgba(255,255,255,0.03); }
          .a-tab.is-active { color:#d4af37;border-bottom-color:#d4af37; }
          .tab-panel { display:none; }
          .tab-panel.is-active { display:block; }
          .tab-intro { color:#9ca3af;font-size:0.9rem;margin:0 0 18px;line-height:1.5;max-width:760px; }
          .a-kpi-row { display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:22px; }
          .a-kpi { background:#1a1a1d;border:1px solid #2a2a2a;border-radius:12px;padding:14px 13px; }
          .a-kpi-label { font-size:0.72rem;color:#9ca3af;text-transform:uppercase;letter-spacing:0.06em;font-weight:700;display:flex;align-items:center;gap:5px; }
          .a-kpi-value { font-size:1.7rem;font-weight:800;color:#d4af37;margin-top:6px;line-height:1; }
          .a-kpi-meaning { font-size:0.74rem;color:#8b949e;margin-top:7px;line-height:1.35; }
          .a-tip { display:inline-flex;align-items:center;justify-content:center;width:15px;height:15px;border-radius:50%;background:#2a2a2a;color:#cbd5e1;font-size:0.66rem;font-weight:700;cursor:help;position:relative;flex-shrink:0;font-family:inherit; }
          .a-tip:hover, .a-tip:focus { background:#d4af37;color:#17110a;outline:none; }
          .a-tip::after { content:attr(data-tip);position:absolute;bottom:135%;left:50%;transform:translateX(-50%);width:240px;max-width:62vw;background:#0d0d0f;border:1px solid #3a3a3a;color:#e5e7eb;font-size:0.76rem;font-weight:400;line-height:1.45;text-transform:none;letter-spacing:0;padding:9px 11px;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,0.55);opacity:0;pointer-events:none;transition:opacity .12s;z-index:60; }
          .a-tip:hover::after, .a-tip:focus::after { opacity:1; }
          .a-insight-strip { background:#101114;border:1px solid #283244;border-radius:12px;padding:16px 18px;margin-bottom:22px; }
          .a-insight-head { color:#93c5fd;font-size:0.78rem;letter-spacing:0.1em;text-transform:uppercase;font-weight:800;margin-bottom:12px; }
          .a-insight-list { list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px; }
          .a-ins { padding:10px 12px;border-radius:8px;font-size:0.86rem;line-height:1.45;border:1px solid rgba(255,255,255,0.08);background:rgba(255,255,255,0.03);color:#d1d5db;border-left-width:3px;border-left-style:solid; }
          .a-ins-good { border-left-color:#4ade80; }
          .a-ins-warn { border-left-color:#fbbf24;background:rgba(251,191,36,0.06); }
          .a-ins-info { border-left-color:#60a5fa; }
          @media(max-width:768px) {
            .a-insight-list { grid-template-columns:1fr; }
            .a-kpi-row { grid-template-columns:repeat(2,1fr); }
            .a-tab { padding:9px 11px;font-size:0.86rem; }
          }
        </style>
        <div class="page-header">
          <div>
            <div class="admin-kicker">QR traffic</div>
            <h1>Analytics</h1>
            <p class="page-subtitle">See if your marketing is working, whether guests come back, which locations win, and what content lands — in plain English.</p>
          </div>
        </div>
        ${filterForm}
        ${liveBanner}
        ${tabsNav}

        <div class="tab-panel is-active" data-tab="overview" role="tabpanel">
          ${insightStrip}
          <div class="a-kpi-row">${headlineKpis}</div>
          ${sparkChart}
        </div>

        <div class="tab-panel" data-tab="traffic" role="tabpanel">
          <p class="tab-intro">Where your visits come from and when they happen, so you can time posts, staffing, and promos.</p>
          <div style="margin-bottom:20px;">${heatmapChart}</div>
          ${locationSection}
          <div class="a-grid-2">
            <div class="a-card">
              <h3 class="a-heading">Top entry pages ${helpTip('The first page each visit landed on. Tells you what your QR codes and links actually point people to.')}</h3>
              ${entryPagesChart || '<p style="color:#666;font-size:0.85rem;">No data</p>'}
            </div>
            <div class="a-card">
              <h3 class="a-heading">Traffic sources ${helpTip('Where visits came from. "Organic" means a walk-up QR scan or a direct type-in with no tag attached.')}</h3>
              ${sourceSection}
              ${nvrSection}
            </div>
          </div>
        </div>

        <div class="tab-panel" data-tab="marketing" role="tabpanel">
          <p class="tab-intro">How your links, QR codes, and campaigns are pulling people in — and where to tighten tracking.</p>
          ${marketingSection}
          <div style="margin-bottom:20px;">${campaignCard}</div>
          <div class="a-card" style="margin-bottom:20px;">
            <h3 class="a-heading">Traffic sources ${helpTip('Share of visits from each tagged source vs untagged walk-ups (organic).')}</h3>
            ${sourceSection}
          </div>
          ${linkBuilderSection}
        </div>

        <div class="tab-panel" data-tab="guests" role="tabpanel">
          <p class="tab-intro">New vs returning guests, who keeps coming back, and how well you turn visitors into known guests.</p>
          ${conversionSection}
          <div class="a-card" style="margin-bottom:20px;">
            <h3 class="a-heading">New vs returning ${helpTip('Split of unique visitors who are first-timers vs people who had visited before this range.')}</h3>
            ${nvrSection}
          </div>
          <div style="margin-bottom:20px;">${knownGuestsCard}</div>
          ${highIntentCard}
        </div>

        <div class="tab-panel" data-tab="engagement" role="tabpanel">
          <p class="tab-intro">What content earns attention and turns views into action.</p>
          <div style="margin-bottom:20px;">${funnelSection}</div>
          ${eventImpactCard}
        </div>

        <div class="tab-panel" data-tab="details" role="tabpanel">
          <p class="tab-intro">Devices, browsers, and the raw session log — for digging into specifics or exporting.</p>
          ${techSection}
          <div class="a-card" style="margin-top:24px;overflow-x:auto;">
            <h3 class="a-heading">Recent sessions ${helpTip('The latest individual visits — device, source, entry page, pages viewed, and time on site.')}</h3>
            <table style="width:100%;border-collapse:collapse;font-size:0.82rem;">
              <thead><tr style="color:#888;text-align:left;border-bottom:1px solid #2a2a2a;">
                <th style="padding:6px;">Time</th><th style="padding:6px;">Location</th><th style="padding:6px;">Device</th>
                <th style="padding:6px;">Source</th><th style="padding:6px;">Entry Page</th>
                <th style="padding:6px;">Pages</th><th style="padding:6px;">Duration</th>
              </tr></thead>
              <tbody style="color:#ccc;">${recentRows || '<tr><td colspan="7" style="padding:12px;color:#666;">No sessions yet</td></tr>'}</tbody>
            </table>
          </div>
        </div>

        <script>
          (function() {
            var btns = document.querySelectorAll('.a-tab');
            var panels = document.querySelectorAll('.tab-panel');
            function activate(id) {
              var matched = false;
              panels.forEach(function(p) { var on = p.getAttribute('data-tab') === id; p.classList.toggle('is-active', on); if (on) matched = true; });
              if (!matched) { id = 'overview'; panels.forEach(function(p) { p.classList.toggle('is-active', p.getAttribute('data-tab') === id); }); }
              btns.forEach(function(b) { b.classList.toggle('is-active', b.getAttribute('data-tab-btn') === id); });
              try { localStorage.setItem('analyticsTab', id); } catch (e) {}
            }
            btns.forEach(function(b) {
              b.addEventListener('click', function() {
                var id = b.getAttribute('data-tab-btn');
                activate(id);
                if (history.replaceState) history.replaceState(null, '', '#' + id);
              });
            });
            var initial = 'overview';
            if (location.hash && location.hash.length > 1) { initial = location.hash.slice(1); }
            else { try { var saved = localStorage.getItem('analyticsTab'); if (saved) initial = saved; } catch (e) {} }
            activate(initial);
          })();
          function handleRangeChange(sel) {
            var cd = document.getElementById('custom-dates');
            if (sel.value === 'custom') { cd.style.display = 'flex'; } else { cd.style.display = 'none'; sel.form.submit(); }
          }
          setInterval(function() {
            fetch('/admin/analytics/live?location=' + encodeURIComponent('${esc(filterSlug)}'))
              .then(function(r) { return r.json(); })
              .then(function(d) { var el = document.getElementById('live-count'); if (el) el.textContent = d.count; })
              .catch(function() {});
          }, 30000);
          document.querySelectorAll('.hm-cell').forEach(function(cell) {
            cell.addEventListener('click', function() {
              var t = cell.getAttribute('title');
              if (t) { var old = document.querySelector('.hm-tip'); if (old) old.remove(); var tip = document.createElement('div'); tip.className = 'hm-tip'; tip.textContent = t; tip.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#222;color:#fff;padding:6px 12px;border-radius:6px;font-size:0.8rem;z-index:50;'; document.body.appendChild(tip); setTimeout(function() { tip.remove(); }, 2000); }
            });
          });
        </script>
      `;

      sendHTML(res, 200, adminLayout('Analytics', content, user, { pathname: '/admin/analytics' }));
      return true;
    } catch (err) {
      console.error('Analytics dashboard error:', err);
      sendHTML(res, 500, adminLayout('Analytics', '<p>Error loading analytics data.</p>', user, { pathname: '/admin/analytics' }));
      return true;
    }
  }

  return false;
}

module.exports = { handleAdminSpecials };
