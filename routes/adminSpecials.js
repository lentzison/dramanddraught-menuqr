const { sendHTML, parseBody, redirect, generateCocktailImage, getFlashMsg } = require('../helpers');
const { requireAuth } = require('../auth');
const { specialsDashboard, dayThemeEditor, flightsList, flightEditor, bottlesList, bottleEditor, DAYS } = require('../views/adminSpecialsViews');
const { adminLayout } = require('../views/adminLayout');
const { getSpiritCategories, getSpiritCatalog, getHalfPriceSpirits, getUpcomingSpiritFlightsAdmin, buildSpiritFlightBuilderUrl } = require('../bartenderDb');
const { sendJSON } = require('../helpers');
const OP_IMAGE_REGEN_TOKEN = process.env.OP_SPECIAL_IMAGE_REGEN_TOKEN || 'menuqr-special-image-regenerate';

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

function escHTML(value) {
  return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatFlightDateLabel(value) {
  if (!value) return '';
  const parsed = new Date(`${value}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function renderFlightBridgePage(overview, user, flashMsg) {
  const rows = (overview.items || []).map((item) => `
    <tr>
      <td>${escHTML(formatFlightDateLabel(item.flightDate))}</td>
      <td>${escHTML(item.locationName)}</td>
      <td>
        <div style="font-weight:700">${escHTML(item.theme)}</div>
        ${item.description ? `<div style="color:#888; font-size:0.9rem; margin-top:4px">${escHTML(item.description)}</div>` : ''}
      </td>
      <td>${escHTML(item.fridayPriceLabel || '-')}</td>
      <td>${escHTML(item.regularPriceLabel || '-')}</td>
      <td>${item.pourCount || 0}</td>
      <td><a href="${escHTML(item.builderUrl)}" class="btn btn-secondary btn-sm" target="_blank" rel="noreferrer">Manage</a></td>
    </tr>
  `).join('');

  const locationButtons = (overview.locations || []).map((location) => `
    <a href="${escHTML(location.builderUrl)}" class="btn btn-secondary btn-sm" target="_blank" rel="noreferrer">${escHTML(location.name)}</a>
  `).join('');

  return adminLayout('Flights', `
    <h1>Friday Flights</h1>
    <p style="color:#888; margin-bottom:16px">
      Flights are now built in the bartender dashboard so they can pull live spirit-list pricing and feed the public specials page directly.
    </p>

    <div class="card" style="margin-bottom:20px">
      <div style="display:flex; gap:12px; align-items:flex-start; justify-content:space-between; flex-wrap:wrap">
        <div style="max-width:720px">
          <h2 style="margin-bottom:8px">Open The Builder</h2>
          <p style="color:#888; margin-bottom:12px">
            Regular price is the sum of each 1 oz pour. Friday Flight Night automatically discounts that total by $5.
            Start from a location below or open the full planner.
          </p>
          <div style="display:flex; gap:8px; flex-wrap:wrap">
            <a href="${escHTML(buildSpiritFlightBuilderUrl())}" class="btn btn-primary" target="_blank" rel="noreferrer">Open Flight Builder</a>
            ${locationButtons}
          </div>
        </div>
      </div>
    </div>

    ${overview.error ? `
      <div class="alert alert-error">
        Could not load bartender-backed flights right now: ${escHTML(overview.error)}
      </div>
    ` : ''}

    ${overview.items && overview.items.length > 0 ? `
      <table>
        <thead>
          <tr>
            <th>Friday</th>
            <th>Location</th>
            <th>Flight</th>
            <th>Friday Price</th>
            <th>Regular</th>
            <th>Pours</th>
            <th></th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    ` : `
      <div class="empty-state">No upcoming Friday flights are scheduled yet.</div>
    `}
  `, user, { pathname: '/admin/flights', flashMsg });
}

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
    return `<div style="background:#1a1a1d;border:1px solid #333;border-radius:12px;padding:16px;text-align:center;min-width:100px;">
      <div style="font-size:1.6rem;font-weight:800;color:${color || '#d4af37'};">${escapeHtml(String(value))}</div>
      <div style="font-size:0.76rem;color:#999;margin-top:4px;">${escapeHtml(label)}</div>
    </div>`;
  }

  const summaryCards = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:12px;margin-bottom:20px;">
      ${statCard('Total Reviews', total, '#d4af37')}
      ${statCard('Avg Rating', avgRating, '#d4af37')}
      ${statCard('With Email', withEmail, '#7ecf8a')}
      ${statCard('Newsletter', newsletterCount, '#7ecf8a')}
      ${statCard('Gift Card', giftCardCount, '#7ecf8a')}
    </div>`;

  const starDist = `
    <div style="background:#111;border:1px solid #333;border-radius:12px;padding:16px;margin-bottom:20px;">
      <h3 style="color:#d4af37;font-size:0.82rem;letter-spacing:0.12em;text-transform:uppercase;margin-bottom:12px;">Rating Distribution</h3>
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
    return summaryCards + '<p style="color:#666;text-align:center;padding:40px;">No feedback yet.</p>';
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
      <div style="background:#111;border:1px solid #333;border-radius:12px;padding:16px;margin-bottom:10px;">
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
  if (pathname === '/admin/specials/regenerate-images') {
    const body = await parseBody(req);
    const token = body?.token || req.headers['x-regenerate-token'];
    if (!OP_IMAGE_REGEN_TOKEN || token !== OP_IMAGE_REGEN_TOKEN) {
      sendHTML(res, 401, '<p>Unauthorized</p>');
      return true;
    }

    const requestedDay = String(body.day || '').toUpperCase().trim();
    void runSpecialImageRegeneration(prisma, requestedDay).catch((err) => {
      console.error('Regenerate images background job failed:', err.message || err);
    });

    res.writeHead(202, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, message: 'Regeneration started.' }));
    return true;
  }

  const user = requireAuth(req, res);
  if (!user) { redirect(res, '/admin/login'); return true; }

  if (pathname === '/admin/feedback/export') {
    try {
      if (!prisma?.guestFeedback) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Guest feedback storage not configured yet.');
        return true;
      }

      const parsedUrl = `http://${req.headers.host || 'localhost'}${req.url}`;
      const { where, includeOptInOnly, locationSlug } = buildGuestFeedbackWhere(parsedUrl);
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
      const [rows, locations] = await Promise.all([
        prisma.guestFeedback.findMany({
          where,
          orderBy: { createdAt: 'desc' },
        }),
        prisma.location.findMany({
          where: { isActive: true },
          orderBy: { name: 'asc' },
        }),
      ]);

      const selectedLocation = locations.find((loc) => loc.slug === locationSlug);
      const filterLabel = locationSlug && selectedLocation
        ? `&nbsp;for <strong>${escapeHtml(selectedLocation.name)}</strong>`
        : '';

      const locationOptions = locations.map((loc) => `<option value="${escapeHtml(loc.slug)}"${locationSlug === loc.slug ? ' selected' : ''}>${escapeHtml(loc.name)}</option>`).join('');

      const filterControls = `
        <form method="GET" action="/admin/feedback" style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-bottom:20px;">
          <select name="location" style="padding:8px 12px;background:#1a1a1d;color:#ccc;border:1px solid #333;border-radius:8px;font-size:0.88rem;">
            <option value="">All Locations</option>${locationOptions}
          </select>
          <div style="display:flex;gap:4px;">
            <a href="/admin/feedback${locationSlug ? '?location=' + escapeHtml(locationSlug) : ''}" style="padding:8px 14px;background:${!includeOptInOnly ? '#d4af37' : '#333'};color:${!includeOptInOnly ? '#0e0d0b' : '#ccc'};border-radius:8px;text-decoration:none;font-size:0.82rem;font-weight:700;">All</a>
            <a href="/admin/feedback?newsletter=1${locationSlug ? '&location=' + escapeHtml(locationSlug) : ''}" style="padding:8px 14px;background:${includeOptInOnly ? '#d4af37' : '#333'};color:${includeOptInOnly ? '#0e0d0b' : '#ccc'};border-radius:8px;text-decoration:none;font-size:0.82rem;font-weight:700;">Newsletter</a>
          </div>
          <button type="submit" style="padding:8px 16px;background:#d4af37;color:#0e0d0b;border:none;border-radius:8px;font-weight:700;cursor:pointer;">Filter</button>
          <a href="${buildFeedbackExportUrl({ includeOptInOnly, locationSlug })}" style="padding:8px 16px;background:#333;color:#ccc;border-radius:8px;text-decoration:none;font-size:0.82rem;">Export CSV</a>
          <span style="color:#666;font-size:0.82rem;">Showing ${rows.length} entries${filterLabel}</span>
        </form>`;

      sendHTML(
        res,
        200,
        adminLayout(
          'Guest Feedback',
          `<h1>Guest Feedback</h1>${filterControls}${renderFeedbackDashboard(rows)}`,
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
    const themes = await prisma.dayTheme.findMany({
      where: { locationId: null },
      include: { specials: { where: { isActive: true }, orderBy: { displayOrder: 'asc' } } },
    });
    sendHTML(res, 200, specialsDashboard(themes, user, flashMsg));
    return true;
  }

  // ─── Day Theme Editor ───
  const dayMatch = pathname.match(/^\/admin\/specials\/day\/([A-Z]+)$/);
  const dayLocMatch = pathname.match(/^\/admin\/specials\/day\/([A-Z]+)\/location\/([a-z0-9-]+)$/);

  if (dayMatch || dayLocMatch) {
    const day = dayMatch ? dayMatch[1] : dayLocMatch[1];
    const locationSlug = dayLocMatch ? dayLocMatch[2] : null;

    if (!DAYS.includes(day)) {
      sendHTML(res, 404, '<h1>Invalid day</h1>');
      return true;
    }

    const locations = await prisma.location.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });
    let location = null;
    if (locationSlug) {
      location = locations.find(l => l.slug === locationSlug);
      if (!location) { sendHTML(res, 404, '<h1>Location not found</h1>'); return true; }
    }

    const locationId = location ? location.id : null;

    if (req.method === 'POST') {
      const body = await parseBody(req);
      const action = body._action;

      if (action === 'saveTheme') {
        // Prisma can't upsert on composite unique with null, so findFirst + create/update
        const existing = await prisma.dayTheme.findFirst({ where: { dayOfWeek: day, locationId: locationId } });
        if (existing) {
          await prisma.dayTheme.update({
            where: { id: existing.id },
            data: { name: body.name, tagline: body.tagline || null, description: body.description || null, isActive: body.isActive === 'on' },
          });
        } else {
          await prisma.dayTheme.create({
            data: { dayOfWeek: day, locationId: locationId, name: body.name, tagline: body.tagline || null, description: body.description || null, isActive: body.isActive === 'on' },
          });
        }
        redirect(res, pathname + '?msg=saved');
        return true;
      }

      if (action === 'saveHalfPrice') {
        const config = JSON.parse(body.halfPriceConfig || '{}');
        const existing = await prisma.dayTheme.findFirst({ where: { dayOfWeek: day, locationId: locationId } });
        if (existing) {
          await prisma.dayTheme.update({
            where: { id: existing.id },
            data: { halfPriceConfig: config },
          });
        } else if (locationId) {
          // Auto-create location override theme for half-price config
          const defaultTheme = await prisma.dayTheme.findFirst({ where: { dayOfWeek: day, locationId: null } });
          await prisma.dayTheme.create({
            data: {
              dayOfWeek: day,
              locationId: locationId,
              name: defaultTheme ? defaultTheme.name : day,
              tagline: defaultTheme ? defaultTheme.tagline : null,
              description: defaultTheme ? defaultTheme.description : null,
              isActive: defaultTheme ? defaultTheme.isActive : true,
              halfPriceConfig: config,
            },
          });
        }
        redirect(res, pathname + '?msg=saved');
        return true;
      }

      if (action === 'deleteTheme') {
        const existing = await prisma.dayTheme.findFirst({ where: { dayOfWeek: day, locationId: locationId } });
        if (existing) await prisma.dayTheme.delete({ where: { id: existing.id } });
        redirect(res, '/admin/specials?msg=deleted');
        return true;
      }

      if (action === 'generateSpecialImages') {
        const currentTheme = await prisma.dayTheme.findFirst({
          where: { dayOfWeek: day, locationId: locationId },
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
          where: { dayOfWeek: day, locationId: locationId }
        });
        if (theme) {
          const maxOrderSpecial = await prisma.dailySpecial.findFirst({
            where: { dayThemeId: theme.id },
            orderBy: { displayOrder: 'desc' },
          });
          const fallbackOrder = maxOrderSpecial ? maxOrderSpecial.displayOrder + 1 : 0;
          await prisma.dailySpecial.create({
            data: {
              dayThemeId: theme.id,
              name: body.specialName,
              description: body.specialDescription || null,
              price: body.specialPrice || null,
              imageUrl: body.specialImageUrl || null,
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
            imageUrl: body.specialImageUrl || null,
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
        const theme = await prisma.dayTheme.findFirst({ where: { dayOfWeek: day, locationId: locationId } });
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
        const theme = await prisma.dayTheme.findFirst({ where: { dayOfWeek: day, locationId: locationId } });
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
        const theme = await prisma.dayTheme.findFirst({ where: { dayOfWeek: day, locationId: locationId } });
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
        const theme = await prisma.dayTheme.findFirst({ where: { dayOfWeek: day, locationId: locationId } });
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
        redirect(res, pathname + '?msg=deleted');
        return true;
      }
    }

    // GET: show editor
    // For location override, use a compound unique that allows null
    const flashMsg = getFlashMsg(req.url);
    const theme = await prisma.dayTheme.findFirst({
      where: { dayOfWeek: day, locationId: locationId },
      include: { specials: { orderBy: { displayOrder: 'asc' } } },
    });
    const categoryOptions = getAllCategories(theme ? theme.specials : []);

    let spiritCatalog = [];
    let spiritCategories = { categories: [], styles: [] };
    // For location overrides on half-price days, build a synthetic theme with halfPriceConfig
    // from the company default if no location-specific theme exists yet
    let halfPriceTheme = theme;
    if ((day === 'WEDNESDAY' || day === 'THURSDAY') && locationSlug) {
      try {
        [spiritCategories, spiritCatalog] = await Promise.all([
          getSpiritCategories(),
          getSpiritCatalog(locationSlug),
        ]);
      } catch (err) {
        console.warn('Error loading spirit catalog for admin:', err.message);
      }
      if (!halfPriceTheme) {
        const defaultTheme = await prisma.dayTheme.findFirst({ where: { dayOfWeek: day, locationId: null } });
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
      halfPriceTheme
    ));
    return true;
  }

  // ─── Flights List ───
  if (pathname === '/admin/flights') {
    const flashMsg = getFlashMsg(req.url);
    const overview = await getUpcomingSpiritFlightsAdmin();
    sendHTML(res, 200, renderFlightBridgePage(overview, user, flashMsg));
    return true;
  }

  // ─── New Flight ───
  if (pathname === '/admin/flights/new') {
    redirect(res, buildSpiritFlightBuilderUrl());
    return true;
  }

  // ─── Edit/Delete Flight ───
  const flightMatch = pathname.match(/^\/admin\/flights\/([a-f0-9-]+)$/);
  if (flightMatch) {
    redirect(res, buildSpiritFlightBuilderUrl());
    return true;
  }

  // ─── Bottles List ───
  if (pathname === '/admin/bottles') {
    const flashMsg = getFlashMsg(req.url);
    const bottles = await prisma.featuredBottle.findMany({
      orderBy: [{ year: 'desc' }, { month: 'desc' }, { displayOrder: 'asc' }],
    });
    sendHTML(res, 200, bottlesList(bottles, user, flashMsg));
    return true;
  }

  // ─── New Bottle ───
  if (pathname === '/admin/bottles/new') {
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

  // Analytics dashboard
  if (pathname === '/admin/analytics' || pathname === '/admin/analytics/export') {
    const user = requireAuth(req, res);
    if (!user) { redirect(res, '/admin/login'); return true; }

    if (!prisma?.visitorSession) {
      sendHTML(res, 200, adminLayout('Analytics', '<p>Analytics not available yet. Waiting for database migration.</p>', user, { pathname: '/admin/analytics' }));
      return true;
    }

    const url = require('url');
    const parsed = url.parse(req.url, true);
    const filterSlug = parsed.query.location || '';
    const filterRange = parsed.query.range || '7d';

    // Date range
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
    let rangeStart;
    if (filterRange === 'today') rangeStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    else if (filterRange === '30d') rangeStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    else rangeStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const where = { startedAt: { gte: rangeStart } };
    if (filterSlug) where.locationSlug = filterSlug;

    try {
      // CSV export
      if (pathname === '/admin/analytics/export') {
        const rows = await prisma.visitorSession.findMany({ where, orderBy: { startedAt: 'desc' }, take: 5000 });
        const csvHeader = 'Date,Location,Device,Browser,OS,Entry Page,Pages,Duration (s),QR Scan,Return Visitor,Screen,Language,IP\n';
        const csvRows = rows.map(r => [
          r.startedAt ? r.startedAt.toISOString() : '',
          r.locationSlug || '',
          r.deviceType || '',
          r.browser || '',
          r.os || '',
          r.entryPage || '',
          r.pageCount || 1,
          r.durationSecs || '',
          r.isQrScan ? 'Yes' : 'No',
          '', // return visitor computed below
          r.screenWidth && r.screenHeight ? `${r.screenWidth}x${r.screenHeight}` : '',
          r.language || '',
          r.ipAddress || '',
        ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
        res.writeHead(200, { 'Content-Type': 'text/csv', 'Content-Disposition': `attachment; filename="analytics-${filterRange}.csv"` });
        res.end(csvHeader + csvRows);
        return true;
      }

      // Dashboard data
      const [sessions, locations, pageViews] = await Promise.all([
        prisma.visitorSession.findMany({ where, orderBy: { startedAt: 'desc' }, take: 10000 }),
        prisma.location.findMany({ where: { isActive: true }, orderBy: { name: 'asc' }, select: { slug: true, name: true } }),
        prisma.pageView.groupBy({ by: ['pageType'], _count: true, where: { viewedAt: { gte: rangeStart }, ...(filterSlug ? { locationSlug: filterSlug } : {}) } }),
      ]);

      const totalScans = sessions.length;
      const uniqueVisitors = new Set(sessions.map(s => s.visitorId)).size;
      const durationsValid = sessions.filter(s => s.durationSecs && s.durationSecs > 0);
      const avgDuration = durationsValid.length > 0 ? Math.round(durationsValid.reduce((sum, s) => sum + s.durationSecs, 0) / durationsValid.length) : 0;
      const avgPages = totalScans > 0 ? (sessions.reduce((sum, s) => sum + (s.pageCount || 1), 0) / totalScans).toFixed(1) : '0';

      // Return visitors (visited more than once ever)
      const visitorCounts = {};
      sessions.forEach(s => { visitorCounts[s.visitorId] = (visitorCounts[s.visitorId] || 0) + 1; });
      const returnVisitors = Object.values(visitorCounts).filter(c => c > 1).length;
      const returnRate = uniqueVisitors > 0 ? Math.round((returnVisitors / uniqueVisitors) * 100) : 0;

      // Device breakdown
      const devices = {};
      sessions.forEach(s => { const d = s.deviceType || 'unknown'; devices[d] = (devices[d] || 0) + 1; });

      // Browser breakdown
      const browsers = {};
      sessions.forEach(s => { const b = s.browser || 'Other'; browsers[b] = (browsers[b] || 0) + 1; });

      // OS breakdown
      const osList = {};
      sessions.forEach(s => { const o = s.os || 'Other'; osList[o] = (osList[o] || 0) + 1; });

      // Scans by day
      const byDay = {};
      sessions.forEach(s => {
        const d = s.startedAt ? s.startedAt.toISOString().slice(0, 10) : 'unknown';
        byDay[d] = (byDay[d] || 0) + 1;
      });
      const daysSorted = Object.entries(byDay).sort((a, b) => a[0].localeCompare(b[0]));
      const maxDay = Math.max(...daysSorted.map(d => d[1]), 1);

      // Scans by hour
      const byHour = {};
      sessions.forEach(s => {
        if (!s.startedAt) return;
        const h = new Date(s.startedAt.toLocaleString('en-US', { timeZone: 'America/New_York' })).getHours();
        byHour[h] = (byHour[h] || 0) + 1;
      });

      // Location breakdown
      const byLocation = {};
      sessions.forEach(s => { const l = s.locationSlug || 'home'; byLocation[l] = (byLocation[l] || 0) + 1; });

      // QR vs direct
      const qrCount = sessions.filter(s => s.isQrScan).length;

      // Page type breakdown from groupBy
      const pageTypeCounts = {};
      pageViews.forEach(p => { pageTypeCounts[p.pageType] = p._count; });

      function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

      function barChart(entries, maxVal) {
        return entries.map(([label, count]) => `
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
            <span style="min-width:80px;font-size:0.82rem;color:#aaa;text-align:right;">${esc(label)}</span>
            <div style="flex:1;background:#1a1a1d;border-radius:4px;height:22px;overflow:hidden;">
              <div style="width:${Math.round((count / maxVal) * 100)}%;background:linear-gradient(90deg,#d4af37,#b8913e);height:100%;border-radius:4px;min-width:2px;"></div>
            </div>
            <span style="min-width:36px;font-size:0.82rem;color:#ccc;">${count}</span>
          </div>
        `).join('');
      }

      function statCard(label, value) {
        return `<div style="background:#1a1a1d;border:1px solid #333;border-radius:12px;padding:16px;text-align:center;min-width:120px;">
          <div style="font-size:1.6rem;font-weight:800;color:#d4af37;">${esc(String(value))}</div>
          <div style="font-size:0.78rem;color:#999;margin-top:4px;">${esc(label)}</div>
        </div>`;
      }

      // Build filter controls
      const locationOptions = locations.map(l => `<option value="${esc(l.slug)}"${filterSlug === l.slug ? ' selected' : ''}>${esc(l.name)}</option>`).join('');
      const rangeOptions = [['today', 'Today'], ['7d', 'Last 7 Days'], ['30d', 'Last 30 Days']]
        .map(([val, label]) => `<option value="${val}"${filterRange === val ? ' selected' : ''}>${label}</option>`).join('');

      const filters = `
        <form method="GET" action="/admin/analytics" style="display:flex;gap:10px;margin-bottom:20px;flex-wrap:wrap;align-items:center;">
          <select name="location" style="padding:8px 12px;background:#1a1a1d;color:#ccc;border:1px solid #333;border-radius:8px;font-size:0.88rem;">
            <option value="">All Locations</option>${locationOptions}
          </select>
          <select name="range" style="padding:8px 12px;background:#1a1a1d;color:#ccc;border:1px solid #333;border-radius:8px;font-size:0.88rem;">
            ${rangeOptions}
          </select>
          <button type="submit" style="padding:8px 16px;background:#d4af37;color:#0e0d0b;border:none;border-radius:8px;font-weight:700;cursor:pointer;">Filter</button>
          <a href="/admin/analytics/export?location=${esc(filterSlug)}&range=${esc(filterRange)}" style="padding:8px 16px;background:#333;color:#ccc;border-radius:8px;text-decoration:none;font-size:0.85rem;">Export CSV</a>
        </form>`;

      // Format duration
      const fmtDur = (s) => s >= 60 ? `${Math.floor(s/60)}m ${s%60}s` : `${s}s`;

      // Recent sessions table
      const recentRows = sessions.slice(0, 50).map(s => {
        const time = s.startedAt ? new Date(s.startedAt).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
        return `<tr>
          <td>${esc(time)}</td>
          <td>${esc(s.locationSlug || 'home')}</td>
          <td>${esc(s.deviceType || '?')}</td>
          <td>${esc(s.browser || '?')}</td>
          <td>${esc(s.os || '?')}</td>
          <td>${esc(s.entryPage || '/')}</td>
          <td>${s.pageCount || 1}</td>
          <td>${s.durationSecs ? fmtDur(s.durationSecs) : '-'}</td>
          <td>${s.isQrScan ? 'QR' : 'Direct'}</td>
          <td>${s.screenWidth ? `${s.screenWidth}x${s.screenHeight}` : '-'}</td>
        </tr>`;
      }).join('');

      const content = `
        <h1>Analytics</h1>
        ${filters}

        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px;margin-bottom:24px;">
          ${statCard('Total Scans', totalScans)}
          ${statCard('Unique Visitors', uniqueVisitors)}
          ${statCard('Avg Duration', fmtDur(avgDuration))}
          ${statCard('Pages / Session', avgPages)}
          ${statCard('Return Rate', returnRate + '%')}
          ${statCard('QR Scans', Math.round((qrCount/Math.max(totalScans,1))*100) + '%')}
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:24px;">
          <div style="background:#111;border:1px solid #333;border-radius:12px;padding:16px;">
            <h3 style="color:#d4af37;font-size:0.82rem;letter-spacing:0.12em;text-transform:uppercase;margin-bottom:12px;">Scans by Day</h3>
            ${daysSorted.length > 0 ? barChart(daysSorted.map(([d, c]) => [d.slice(5), c]), maxDay) : '<p style="color:#666;">No data</p>'}
          </div>
          <div style="background:#111;border:1px solid #333;border-radius:12px;padding:16px;">
            <h3 style="color:#d4af37;font-size:0.82rem;letter-spacing:0.12em;text-transform:uppercase;margin-bottom:12px;">By Location</h3>
            ${barChart(Object.entries(byLocation).sort((a,b) => b[1]-a[1]), Math.max(...Object.values(byLocation), 1))}
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:20px;margin-bottom:24px;">
          <div style="background:#111;border:1px solid #333;border-radius:12px;padding:16px;">
            <h3 style="color:#d4af37;font-size:0.82rem;letter-spacing:0.12em;text-transform:uppercase;margin-bottom:12px;">Devices</h3>
            ${barChart(Object.entries(devices).sort((a,b) => b[1]-a[1]), Math.max(...Object.values(devices), 1))}
          </div>
          <div style="background:#111;border:1px solid #333;border-radius:12px;padding:16px;">
            <h3 style="color:#d4af37;font-size:0.82rem;letter-spacing:0.12em;text-transform:uppercase;margin-bottom:12px;">Browsers</h3>
            ${barChart(Object.entries(browsers).sort((a,b) => b[1]-a[1]), Math.max(...Object.values(browsers), 1))}
          </div>
          <div style="background:#111;border:1px solid #333;border-radius:12px;padding:16px;">
            <h3 style="color:#d4af37;font-size:0.82rem;letter-spacing:0.12em;text-transform:uppercase;margin-bottom:12px;">Operating Systems</h3>
            ${barChart(Object.entries(osList).sort((a,b) => b[1]-a[1]), Math.max(...Object.values(osList), 1))}
          </div>
        </div>

        <div style="background:#111;border:1px solid #333;border-radius:12px;padding:16px;margin-bottom:24px;">
          <h3 style="color:#d4af37;font-size:0.82rem;letter-spacing:0.12em;text-transform:uppercase;margin-bottom:12px;">Top Pages</h3>
          ${barChart(Object.entries(pageTypeCounts).sort((a,b) => b[1]-a[1]), Math.max(...Object.values(pageTypeCounts), 1))}
        </div>

        <div style="background:#111;border:1px solid #333;border-radius:12px;padding:16px;overflow-x:auto;">
          <h3 style="color:#d4af37;font-size:0.82rem;letter-spacing:0.12em;text-transform:uppercase;margin-bottom:12px;">Recent Sessions</h3>
          <table style="width:100%;border-collapse:collapse;font-size:0.82rem;">
            <thead><tr style="color:#999;text-align:left;border-bottom:1px solid #333;">
              <th style="padding:8px 6px;">Time</th><th style="padding:8px 6px;">Location</th><th style="padding:8px 6px;">Device</th>
              <th style="padding:8px 6px;">Browser</th><th style="padding:8px 6px;">OS</th><th style="padding:8px 6px;">Entry Page</th>
              <th style="padding:8px 6px;">Pages</th><th style="padding:8px 6px;">Duration</th><th style="padding:8px 6px;">Source</th><th style="padding:8px 6px;">Screen</th>
            </tr></thead>
            <tbody style="color:#ccc;">${recentRows || '<tr><td colspan="10" style="padding:12px;color:#666;">No sessions yet</td></tr>'}</tbody>
          </table>
        </div>
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
