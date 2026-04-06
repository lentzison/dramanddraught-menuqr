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

  // Analytics — live count endpoint
  if (pathname === '/admin/analytics/live') {
    const user = requireAuth(req, res);
    if (!user) { sendJSON(res, 401, { ok: false }); return true; }
    if (!prisma?.visitorSession) { sendJSON(res, 200, { count: 0 }); return true; }
    const url = require('url');
    const parsed = url.parse(req.url, true);
    const slug = parsed.query.location || '';
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    const liveWhere = { updatedAt: { gte: fiveMinAgo } };
    if (slug) liveWhere.locationSlug = slug;
    const count = await prisma.visitorSession.count({ where: liveWhere }).catch(() => 0);
    sendJSON(res, 200, { count });
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

    const prevRangeStart = new Date(rangeStart.getTime() - Math.max(rangeDurationMs, 24 * 60 * 60 * 1000));
    const where = { startedAt: { gte: rangeStart } };
    const prevWhere = { startedAt: { gte: prevRangeStart, lt: rangeStart } };
    if (filterSlug) { where.locationSlug = filterSlug; prevWhere.locationSlug = filterSlug; }
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
      const pvWhere = { viewedAt: { gte: rangeStart }, ...(filterSlug ? { locationSlug: filterSlug } : {}) };
      // For the source dropdown, query distinct sources within the current date range ignoring the source filter itself
      const sourceListWhere = { startedAt: { gte: rangeStart }, ...(filterSlug ? { locationSlug: filterSlug } : {}), source: { not: null } };

      const [sessions, prevSessions, locations, pageViews, liveCount, distinctSources] = await Promise.all([
        prisma.visitorSession.findMany({ where, orderBy: { startedAt: 'desc' }, take: 10000 }),
        prisma.visitorSession.findMany({ where: prevWhere, orderBy: { startedAt: 'desc' }, take: 10000 }),
        prisma.location.findMany({ where: { isActive: true }, orderBy: { name: 'asc' }, select: { slug: true, name: true } }),
        prisma.pageView.groupBy({ by: ['pageType'], _count: true, where: pvWhere }),
        prisma.visitorSession.count({ where: { updatedAt: { gte: fiveMinAgo }, ...(filterSlug ? { locationSlug: filterSlug } : {}) } }),
        prisma.visitorSession.findMany({ where: sourceListWhere, select: { source: true }, distinct: ['source'], take: 50 }),
      ]);
      const availableSources = distinctSources.map(s => s.source).filter(Boolean).sort();

      // Returning visitors — who visited before this period?
      const currentVisitorIds = [...new Set(sessions.map(s => s.visitorId))];
      let returningVisitorIdSet = new Set();
      if (currentVisitorIds.length > 0 && currentVisitorIds.length <= 5000) {
        const prior = await prisma.visitorSession.findMany({
          where: { visitorId: { in: currentVisitorIds }, startedAt: { lt: rangeStart } },
          select: { visitorId: true },
          distinct: ['visitorId'],
        }).catch(() => []);
        returningVisitorIdSet = new Set(prior.map(p => p.visitorId));
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

      // ── Previous period metrics ──
      const prevTotal = prevSessions.length;
      const prevUnique = new Set(prevSessions.map(s => s.visitorId)).size;
      const prevDurValid = prevSessions.filter(s => s.durationSecs && s.durationSecs > 0);
      const prevAvgDur = prevDurValid.length > 0 ? Math.round(prevDurValid.reduce((sum, s) => sum + s.durationSecs, 0) / prevDurValid.length) : 0;
      const prevAvgPages = prevTotal > 0 ? +(prevSessions.reduce((sum, s) => sum + (s.pageCount || 1), 0) / prevTotal).toFixed(1) : 0;
      const prevReturnRate = (() => { const u = new Set(prevSessions.map(s => s.visitorId)).size; const r = (() => { const c = {}; prevSessions.forEach(s => { c[s.visitorId] = (c[s.visitorId] || 0) + 1; }); return Object.values(c).filter(v => v > 1).length; })(); return u > 0 ? Math.round((r / u) * 100) : 0; })();

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
        const slug = s.locationSlug || 'home';
        byLocation[slug] = (byLocation[slug] || 0) + 1;
        const day = s.startedAt ? s.startedAt.toISOString().slice(0, 10) : 'unknown';
        if (!locationDayMap[slug]) locationDayMap[slug] = {};
        locationDayMap[slug][day] = (locationDayMap[slug][day] || 0) + 1;
      });
      const prevByLocation = {};
      prevSessions.forEach(s => { const slug = s.locationSlug || 'home'; prevByLocation[slug] = (prevByLocation[slug] || 0) + 1; });
      const locationsSorted = Object.entries(byLocation).sort((a, b) => b[1] - a[1]);
      const locationNameMap = {};
      locations.forEach(l => { locationNameMap[l.slug] = l.name; });

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

      // ── Filter controls ──
      const locationOptions = locations.map(l => '<option value="' + esc(l.slug) + '"' + (filterSlug === l.slug ? ' selected' : '') + '>' + esc(l.name) + '</option>').join('');
      const rangeChoices = [['today', 'Today'], ['7d', 'Last 7 Days'], ['30d', 'Last 30 Days'], ['custom', 'Custom Range']];
      const rangeOptions = rangeChoices.map(([val, label]) => '<option value="' + val + '"' + (filterRange === val ? ' selected' : '') + '>' + label + '</option>').join('');
      const sourceOptions = ['<option value="organic"' + (filterSource === 'organic' ? ' selected' : '') + '>Organic (store QR / direct)</option>']
        .concat(availableSources.map(s => '<option value="' + esc(s) + '"' + (filterSource === s ? ' selected' : '') + '>' + esc(s) + '</option>'))
        .join('');

      const filterForm = `
        <form id="analytics-filter" method="GET" action="/admin/analytics" style="display:flex;gap:10px;margin-bottom:20px;flex-wrap:wrap;align-items:center;">
          <select name="location" onchange="this.form.submit()" style="padding:8px 12px;background:#1a1a1d;color:#ccc;border:1px solid #333;border-radius:8px;font-size:0.88rem;">
            <option value="">All Locations</option>${locationOptions}
          </select>
          <select name="source" onchange="this.form.submit()" style="padding:8px 12px;background:#1a1a1d;color:#ccc;border:1px solid #333;border-radius:8px;font-size:0.88rem;">
            <option value="">All Sources</option>${sourceOptions}
          </select>
          <select name="range" id="range-select" onchange="handleRangeChange(this)" style="padding:8px 12px;background:#1a1a1d;color:#ccc;border:1px solid #333;border-radius:8px;font-size:0.88rem;">
            ${rangeOptions}
          </select>
          <span id="custom-dates" style="display:${filterRange === 'custom' ? 'flex' : 'none'};gap:8px;align-items:center;">
            <input type="date" name="startDate" value="${esc(customStart)}" style="padding:6px 8px;background:#1a1a1d;color:#ccc;border:1px solid #333;border-radius:6px;font-size:0.82rem;" />
            <span style="color:#666;">to</span>
            <input type="date" name="endDate" value="${esc(customEnd)}" style="padding:6px 8px;background:#1a1a1d;color:#ccc;border:1px solid #333;border-radius:6px;font-size:0.82rem;" />
            <button type="submit" style="padding:6px 14px;background:#d4af37;color:#0e0d0b;border:none;border-radius:6px;font-weight:700;cursor:pointer;font-size:0.82rem;">Go</button>
          </span>
          <a href="/admin/analytics/export?location=${esc(filterSlug)}&range=${esc(filterRange)}&source=${esc(filterSource)}" style="margin-left:auto;padding:8px 14px;background:#222;color:#aaa;border-radius:8px;text-decoration:none;font-size:0.82rem;">Export CSV</a>
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
      const linkBuilderSection = `
        <div class="a-card" style="margin-top:24px;background:#111;border:1px solid rgba(96,165,250,0.3);">
          <h3 class="a-heading" style="color:#60a5fa;">Trackable Links</h3>
          <p style="color:#aaa;font-size:0.85rem;margin-bottom:14px;line-height:1.5;">
            Generate a tagged URL to paste into social posts, emails, or ads. Traffic from tagged links shows up under its source tag in the breakdown above &mdash; everything else stays in &ldquo;Organic&rdquo; (store QR scans and direct visits).
          </p>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:12px;">
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
              </select>
            </div>
            <div>
              <label style="display:block;font-size:0.72rem;color:#888;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:5px;">Source Tag</label>
              <input type="text" id="tl-source" placeholder="e.g. instagram, event" value="instagram" style="width:100%;padding:8px 10px;background:#1a1a1d;color:#ccc;border:1px solid #333;border-radius:6px;font-size:0.85rem;" />
            </div>
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
            var urlIn = document.getElementById('tl-url');
            var copyBtn = document.getElementById('tl-copy');
            var copied = document.getElementById('tl-copied');
            var base = ${JSON.stringify(baseUrl)};
            function update() {
              var loc = locSel.value;
              var page = pageSel.value;
              var src = (srcIn.value || '').trim().toLowerCase().replace(/[^a-z0-9_.\\-]/g, '');
              var url = base + '/' + loc + page;
              if (src) url += '?src=' + encodeURIComponent(src);
              urlIn.value = url;
            }
            locSel.addEventListener('change', update);
            pageSel.addEventListener('change', update);
            srcIn.addEventListener('input', update);
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
      const content = `
        <style>
          .a-stat { background:#1a1a1d;border:1px solid #2a2a2a;border-radius:12px;padding:14px 10px;text-align:center;min-width:0; }
          .a-card { background:#111;border:1px solid #2a2a2a;border-radius:12px;padding:16px; }
          .a-heading { color:#d4af37;font-size:0.78rem;letter-spacing:0.12em;text-transform:uppercase;margin-bottom:12px;font-weight:700; }
          .a-grid-2 { display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:24px; }
          .a-grid-3 { display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px; }
          .a-grid-stats { display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:24px; }
          @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }
          @media(max-width:768px) {
            .a-grid-2 { grid-template-columns:1fr; }
            .a-grid-3 { grid-template-columns:1fr; }
            .a-grid-stats { grid-template-columns:repeat(2,1fr); }
          }
        </style>
        <h1>Analytics</h1>
        ${filterForm}
        ${liveBanner}

        <div class="a-grid-stats">
          ${statCard('Sessions', totalSessions, pctChange(totalSessions, prevTotal))}
          ${statCard('Unique Visitors', uniqueVisitors, pctChange(uniqueVisitors, prevUnique))}
          ${statCard('Avg Duration', fmtDur(avgDuration), pctChange(avgDuration, prevAvgDur))}
          ${statCard('Pages / Session', avgPages, pctChange(avgPages, prevAvgPages))}
          ${statCard('Return Rate', returnRate + '%', pctChange(returnRate, prevReturnRate))}
        </div>

        <div class="a-grid-2">
          ${sparkChart}
          ${heatmapChart}
        </div>

        ${locationSection}
        ${funnelSection}

        <div class="a-grid-2">
          <div class="a-card">
            <h3 class="a-heading">Top Entry Pages</h3>
            ${entryPagesChart || '<p style="color:#666;font-size:0.85rem;">No data</p>'}
          </div>
          <div class="a-card">
            <h3 class="a-heading">Traffic Sources</h3>
            ${sourceSection}
            ${nvrSection}
          </div>
        </div>

        ${linkBuilderSection}

        <div class="a-card" style="margin-top:24px;overflow-x:auto;">
          <h3 class="a-heading">Recent Sessions</h3>
          <table style="width:100%;border-collapse:collapse;font-size:0.82rem;">
            <thead><tr style="color:#888;text-align:left;border-bottom:1px solid #2a2a2a;">
              <th style="padding:6px;">Time</th><th style="padding:6px;">Location</th><th style="padding:6px;">Device</th>
              <th style="padding:6px;">Source</th><th style="padding:6px;">Entry Page</th>
              <th style="padding:6px;">Pages</th><th style="padding:6px;">Duration</th>
            </tr></thead>
            <tbody style="color:#ccc;">${recentRows || '<tr><td colspan="7" style="padding:12px;color:#666;">No sessions yet</td></tr>'}</tbody>
          </table>
        </div>

        ${techSection}

        <script>
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
