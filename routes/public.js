const fs = require('fs');
const path = require('path');
const url = require('url');
const {
  sendHTML,
  sendJSON,
  redirect,
  getLocations,
  getDayLabel,
  buildGuestBottleNotesForCatalog,
  buildFeedbackMailto,
  getOpenAiDiagnosticSnapshot,
  parseBody,
  sendFeedbackEmails,
  sendEmailViaGoogle,
  getFeedbackFromAddress,
} = require('../helpers');
const { generateHomepage } = require('../views/homepage');
const { generateHiringIndexPage } = require('../views/hiringIndexPage');
const { generateLocationPage } = require('../views/locationPage');
const specialPages = require('../views/specialsPage');
const {
  generateSpecialsPage,
  getEasternDay: importedGetEasternDay,
  getEasternMonth: importedGetEasternMonth,
  DAYS_ORDER: importDaysOrder,
} = specialPages;
const {
  getBreakEvenBottles,
  getOnTap,
  getBarSupportEmails,
  getBarSupportEmailsForLocation,
  getHalfPriceSpirits,
  getSpiritList,
  getSpiritFlight,
  getFeaturedFlights,
  hasFeaturedFlights,
} = require('../bartenderDb');
const { generateDraftPage } = require('../views/draftPage');
const { generateFlightsPage } = require('../views/flightsPage');
const { generateMenuPage } = require('../views/menuPage');
const { generateSpiritsPage } = require('../views/spiritsPage');
const { generateEventPage, generateEventConfirmationPage, generateEventTermsPage, eventStatus } = require('../views/eventPage');
const { generateEventsIndexPage } = require('../views/eventsIndexPage');
const { generateApplyPage, generateApplyClosedPage, generateApplySuccessPage, POSITIONS, DAYS, SHIFTS } = require('../views/applyPage');
const {
  generateQuestionnairePage,
  generateQuestionnaireDonePage,
  generateQuestionnaireExpiredPage,
} = require('../views/questionnairePage');
const { QUESTIONS: HIRING_QUESTIONS, QUESTIONNAIRE_VERSION } = require('../hiring/knowledgeBase');
const { runAiEvaluation } = require('../hiring/aiEvaluation');
const { generateNotFoundPage } = require('../views/notFoundPage');
const {
  trackPageView,
  buildTrackingScript,
  getVisitorId,
  linkVisitorToEmail,
  recordAnalyticsEvent,
} = require('../analytics');

const DAYS_ORDER = Array.isArray(importDaysOrder) && importDaysOrder.length > 0 ? importDaysOrder : ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];

function injectTracking(html, sessionId) {
  const script = buildTrackingScript(sessionId);
  if (!script) return html;
  return html.replace('</body>', script + '</body>');
}

// Extract the query string (including leading ?) from req.url so source tags
// like ?src=event get picked up by trackPageView on every route.
function getQueryString(req) {
  if (!req || !req.url) return '';
  const idx = req.url.indexOf('?');
  return idx >= 0 ? req.url.slice(idx) : '';
}

// Send a branded 404 with the list of active locations as alternatives.
async function send404(req, res, prisma) {
  const locations = await getLocations(prisma).catch(() => []);
  const requestedPath = req.url ? req.url.split('?')[0] : '';
  sendHTML(res, 404, generateNotFoundPage({ locations, requestedPath }));
}
const BRAND_LOGO_PATH = path.join(__dirname, '..', 'assets', 'dram-draught-logo-white.png');

function getEasternDayFallback() {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
  return { dayOfWeek: days[now.getDay()], dayLabel: dayOfWeekLabel(days[now.getDay()]), date: now };
}

function getEasternMonthFallback() {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  return { month: now.getMonth() + 1, year: now.getFullYear() };
}

const DAY_LABELS = {
  MONDAY: 'Monday',
  TUESDAY: 'Tuesday',
  WEDNESDAY: 'Wednesday',
  THURSDAY: 'Thursday',
  FRIDAY: 'Friday',
  SATURDAY: 'Saturday',
  SUNDAY: 'Sunday',
};

function dayOfWeekLabel(dayOfWeek) {
  return DAY_LABELS[dayOfWeek];
}

const getEasternDay = typeof importedGetEasternDay === 'function' ? importedGetEasternDay : getEasternDayFallback;
const getEasternMonth = typeof importedGetEasternMonth === 'function' ? importedGetEasternMonth : getEasternMonthFallback;

function buildNextThemeLookup(prisma, location, activeDay) {
  const dayIndex = DAYS_ORDER.indexOf(activeDay);
  if (dayIndex === -1 || !prisma) return Promise.resolve(null);

  const tryLookup = async (dayOfWeek) => {
    let theme = await prisma.dayTheme.findFirst({
      where: { dayOfWeek, locationId: location.id, isActive: true },
      include: { specials: { where: { isActive: true }, orderBy: { displayOrder: 'asc' } } },
    });
    if (theme) return theme;
    return prisma.dayTheme.findFirst({
      where: { dayOfWeek, locationId: null, isActive: true },
      include: { specials: { where: { isActive: true }, orderBy: { displayOrder: 'asc' } } },
    });
  };

  const checks = [];
  for (let i = 1; i <= 7; i++) {
    const dayOfWeek = DAYS_ORDER[(dayIndex + i) % 7];
    checks.push(tryLookup(dayOfWeek).then((theme) => ({ dayOfWeek, theme })).catch(() => ({ dayOfWeek, theme: null })));
  }
  return Promise.all(checks).then((results) => {
    const found = results.find((r) => r.theme);
    return found || null;
  });
}

function normalizeEmail(value) {
  return String(value || '').trim();
}

function maybeResolveLocationByGoogleIdentity(locs, requestedSlug) {
  if (!Array.isArray(locs) || !requestedSlug) return null;
  const requested = locs.find((loc) => loc && loc.slug === requestedSlug);
  if (!requested) return null;

  const requestedPlaceId = String(requested.googlePlaceId || '').trim();
  if (!requestedPlaceId) return null;

  const peers = locs.filter((loc) => String(loc && loc.googlePlaceId ? loc.googlePlaceId : '').trim() === requestedPlaceId);
  if (peers.length <= 1) return null;

  const preferred = peers.find((loc) =>
    loc && loc.slug !== requestedSlug
    && (String(loc.slug || '').toLowerCase() === 'winston-salem'
      || /winston/i.test(String(loc.name || '')))
  );
  if (preferred) return preferred;

  return peers.find((loc) => loc && loc.slug !== requestedSlug) || null;
}

function isLikelyValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function sanitizeFeedbackInput(value) {
  return String(value || '').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function parseBooleanValue(value) {
  if (typeof value === 'boolean') return value;
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return false;
  return ['1', 'true', 'yes', 'y', 'on'].includes(normalized);
}

function buildStaffFeedbackBody(location, rating, guestName, guestEmail, feedbackText, newsletterOptIn = false) {
  const locName = location && location.name ? location.name : 'Dram & Draught';
  const locCity = location && location.city ? `${location.city}, ${location.state || 'NC'}` : '';
  const comment = String(feedbackText || '').trim();
  return (
    `Guest feedback received for ${locName}.\\n`
    + `${locCity ? `Location: ${locName} (${locCity})\\n` : ''}`
    + `Guest: ${guestName || 'Anonymous'}${guestEmail ? ` (${guestEmail})` : ''}\\n`
    + `Rating: ${rating}/5\\n`
    + `Newsletter opt-in: ${newsletterOptIn ? 'Yes' : 'No'}\\n`
    + `Guest feedback:\\n${comment || 'No details provided.'}`
  );
}

// Auto-generated placeholder used when a guest leaves 5 stars without any
// feedback text. We never want to surface that as a quote on the public site.
const AUTO_FIVE_STAR_PLACEHOLDER = 'Guest gave a 5-star rating.';

function firstNameOnly(name) {
  if (!name || typeof name !== 'string') return null;
  const trimmed = name.trim();
  if (!trimmed) return null;
  // Take everything up to the first whitespace so we never surface a last name.
  // Also strip any trailing punctuation (e.g. "Sarah." → "Sarah").
  const first = trimmed.split(/\s+/)[0].replace(/[^A-Za-z0-9\-']+$/, '');
  return first || null;
}

function applyReviewCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

async function handlePublicReviews(req, res, prisma) {
  applyReviewCors(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return true;
  }

  if (req.method !== 'GET') {
    sendJSON(res, 405, { ok: false, error: 'Method Not Allowed' });
    return true;
  }

  if (!prisma || !prisma.guestFeedback || typeof prisma.guestFeedback.findMany !== 'function') {
    sendJSON(res, 200, { ok: true, reviews: [] });
    return true;
  }

  const url = new URL(req.url, 'http://placeholder');
  const limitRaw = parseInt(url.searchParams.get('limit') || '6', 10);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(limitRaw, 24)) : 6;

  try {
    // Pull a generous batch so we can filter out the auto-generated placeholder
    // and still have enough real quotes to hit the requested limit.
    const rows = await prisma.guestFeedback.findMany({
      where: { rating: 5 },
      orderBy: { createdAt: 'desc' },
      take: limit * 4,
      select: {
        id: true,
        rating: true,
        guestName: true,
        feedbackText: true,
        locationName: true,
        locationSlug: true,
        createdAt: true,
      },
    });

    const reviews = [];
    for (const row of rows) {
      const raw = (row.feedbackText || '').trim();
      if (!raw) continue;

      // Strip the auto-generated placeholder anywhere it appears. Some entries
      // have it as a prefix followed by the real feedback; we want to surface
      // the real feedback without the leftover prompt text.
      let cleaned = raw
        .split(AUTO_FIVE_STAR_PLACEHOLDER)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();

      if (!cleaned) continue;

      reviews.push({
        id: row.id,
        rating: row.rating,
        quote: cleaned,
        firstName: firstNameOnly(row.guestName),
        locationName: row.locationName || null,
        locationSlug: row.locationSlug || null,
        createdAt: row.createdAt ? row.createdAt.toISOString() : null,
      });

      if (reviews.length >= limit) break;
    }

    res.setHeader('Cache-Control', 'public, max-age=300');
    sendJSON(res, 200, { ok: true, reviews });
    return true;
  } catch (err) {
    console.error('[menuqr] reviews API error:', err.message);
    sendJSON(res, 500, { ok: false, error: 'Failed to load reviews' });
    return true;
  }
}

async function handlePublicFlights(req, res, slug) {
  applyReviewCors(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return true;
  }

  if (req.method !== 'GET') {
    sendJSON(res, 405, { ok: false, error: 'Method Not Allowed' });
    return true;
  }

  try {
    const result = await getFeaturedFlights(slug);
    const items = (result?.items || []).map((flight) => ({
      id: flight.id,
      theme: flight.theme,
      description: flight.description,
      isFridayFlight: flight.isFridayFlight,
      priceLabel: flight.priceLabel,
      fridayPriceLabel: flight.fridayPriceLabel || null,
      regularPriceLabel: flight.regularPriceLabel || null,
      pours: (flight.pours || []).map((pour) => ({
        spiritName: pour.spiritName,
        pourSize: pour.pourSize,
        tastingNotes: pour.tastingNotes || pour.description || null,
      })),
    }));
    res.setHeader('Cache-Control', 'public, max-age=300');
    sendJSON(res, 200, { ok: true, slug, flights: items, error: result?.error || null });
    return true;
  } catch (err) {
    console.error('[menuqr] flights API error:', err.message);
    sendJSON(res, 500, { ok: false, error: 'Failed to load flights' });
    return true;
  }
}

async function handleFeedback(req, res, prisma) {
  if (req.method !== 'POST') {
    sendHTML(res, 405, '<h1>Method Not Allowed</h1>');
    return true;
  }

  const body = await parseBody(req);
  const requestedSlug = normalizeEmail(body.locationSlug || body.slug || '');
  const ratingRaw = Number(body.rating);
  const rating = Number.isFinite(ratingRaw) ? Math.max(1, Math.min(5, Math.floor(ratingRaw))) : null;
  const isFiveStar = rating === 5;
  const guestEmailRaw = normalizeEmail(body.email || body.guestEmail || '');
  const guestName = String(body.name || body.guestName || '').trim();
  const feedbackText = String(body.feedback || body.comments || '').trim();
  const newsletterOptIn = parseBooleanValue(
    body.newsletterOptIn || body.newsletter || body.subscribeToNewsletter || body.newsletterSignup,
  );
  const giftCardOptIn = parseBooleanValue(body.giftCardOptIn);

  if (!requestedSlug) {
    sendJSON(res, 400, { ok: false, error: 'Missing location slug' });
    return true;
  }

  if (!rating || rating < 1 || rating > 5) {
    sendJSON(res, 400, { ok: false, error: 'Rating must be between 1 and 5' });
    return true;
  }

  if (guestEmailRaw && !isLikelyValidEmail(guestEmailRaw)) {
    sendJSON(res, 400, { ok: false, error: 'Please provide a valid email address or leave it blank' });
    return true;
  }

  const normalizedFeedback = sanitizeFeedbackInput(
    isFiveStar && !feedbackText ? 'Guest gave a 5-star rating.' : feedbackText,
  );
  const guestEmail = guestEmailRaw;

  const locs = await getLocations(prisma);
  const location = locs.find((l) => l.slug === requestedSlug);
  if (!location) {
    sendJSON(res, 404, { ok: false, error: 'Location not found' });
    return true;
  }

  const supportEmails = await (
    getBarSupportEmailsForLocation
      ? getBarSupportEmailsForLocation(location.slug).catch(() => [])
      : getBarSupportEmails().catch(() => [])
  );
  const senderEmail = getFeedbackFromAddress();
  const { reply, guestSent, staffSent, deliveryErrors } = await sendFeedbackEmails({
    locationName: location.name || 'Dram & Draught',
    rating,
    guestName: sanitizeFeedbackInput(guestName) || null,
    guestEmail,
    feedbackText: normalizedFeedback,
    staffEmails: supportEmails,
    newsletterOptIn,
  });

  const visitorId = getVisitorId(req);
  const currentSession = visitorId && prisma?.visitorSession
    ? await prisma.visitorSession.findFirst({ where: { visitorId }, orderBy: { updatedAt: 'desc' } }).catch(() => null)
    : null;
  let savedFeedbackId = null;
  if (prisma && prisma.guestFeedback && typeof prisma.guestFeedback.create === 'function') {
    try {
      const created = await prisma.guestFeedback.create({
        data: {
          locationId: location.id || null,
          locationName: location.name || 'Dram & Draught',
          locationSlug: requestedSlug,
          rating,
          guestName: sanitizeFeedbackInput(guestName) || null,
          guestEmail,
          feedbackText: normalizedFeedback,
          newsletterOptIn: Boolean(newsletterOptIn),
          giftCardOptIn: Boolean(giftCardOptIn),
          visitorId: visitorId || null,
          sessionId: currentSession?.id || null,
          source: currentSession?.source || null,
        },
      });
      savedFeedbackId = created?.id || null;
    } catch (err) {
      console.warn('Error storing feedback in database:', err.message);
    }
  }

  if (guestEmail) {
    await linkVisitorToEmail(req, prisma, guestEmail, {
      visitorId,
      session: currentSession,
      locationSlug: requestedSlug,
      source: currentSession?.source || null,
      giftCardOptIn: Boolean(giftCardOptIn),
      newsletterOptIn: Boolean(newsletterOptIn),
      kind: 'feedback',
    });
  }
  await recordAnalyticsEvent(req, prisma, 'feedback_submit', {
    visitorId,
    session: currentSession,
    email: guestEmail || null,
    locationId: location.id || null,
    locationSlug: requestedSlug,
    source: currentSession?.source || null,
    pagePath: `/${requestedSlug}`,
    entityType: 'feedback',
    entityId: savedFeedbackId,
    metadata: { rating, giftCardOptIn: Boolean(giftCardOptIn), newsletterOptIn: Boolean(newsletterOptIn) },
  });
  if (giftCardOptIn && guestEmail) {
    await recordAnalyticsEvent(req, prisma, 'gift_card_entry', {
      visitorId,
      session: currentSession,
      email: guestEmail,
      locationId: location.id || null,
      locationSlug: requestedSlug,
      source: currentSession?.source || null,
      pagePath: `/${requestedSlug}`,
      entityType: 'feedback',
      entityId: savedFeedbackId,
      metadata: { rating },
    });
  }
  if (newsletterOptIn && guestEmail) {
    await recordAnalyticsEvent(req, prisma, 'newsletter_optin', {
      visitorId,
      session: currentSession,
      email: guestEmail,
      locationId: location.id || null,
      locationSlug: requestedSlug,
      source: currentSession?.source || null,
      pagePath: `/${requestedSlug}`,
      entityType: 'feedback',
      entityId: savedFeedbackId,
      metadata: { rating },
    });
  }

  // Sync newsletter opt-in to public site email marketing
  if (newsletterOptIn && guestEmail) {
    const publicApiBase = process.env.PUBLIC_WEB_ORIGIN || 'https://public.apps.dramanddraught.com';
    fetch(`${publicApiBase}/api/public/newsletter/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: guestEmail,
        firstName: guestName || '',
        source: `menuqr-${requestedSlug}`,
      }),
    }).catch((err) => {
      console.warn('[menuqr] Failed to sync newsletter subscriber to public site:', err.message);
    });
  }

  const staffMailto = buildFeedbackMailto({
    email: senderEmail,
    subject: `Guest Feedback: ${location.name} (${rating}/5)`,
    body: buildStaffFeedbackBody(
      location,
      rating,
      guestName,
      guestEmail,
      feedbackText,
      newsletterOptIn,
    ),
  });
  const userMailto = buildFeedbackMailto({
    email: guestEmail,
    subject: reply.subject,
    body: reply.body,
  });

  const responsePayload = {
    ok: true,
    reply,
    delivery: {
      guest: guestSent,
      staff: staffSent,
      sender: senderEmail,
      errors: deliveryErrors,
    },
    supportRecipients: supportEmails.length,
    userMailto,
    staffMailto,
    rating,
    feedbackId: savedFeedbackId,
    newsletterOptIn: Boolean(newsletterOptIn),
    location: {
      name: location.name,
      slug: location.slug,
    },
  };

  if (!guestSent) {
    const guestCode = responsePayload?.delivery?.errors?.guest?.code;
    responsePayload.note = guestCode
      ? `Email send failed (${guestCode}). You can still open a draft email with the message below.`
      : 'Email send failed. You can still open a draft email with the message below.';
    return sendJSON(res, 200, responsePayload);
  }

  sendJSON(res, 200, {
    ...responsePayload,
    message: 'Thanks for the feedback. We sent a personalized confirmation to your email.',
  });
  return true;
}

async function loadLocationSpecials(prisma, location, dayOfWeek, warningState) {
  const fallback = {
    theme: null,
    activeSpecials: [],
    tomorrowTheme: null,
    nextAvailable: null,
  };
  if (!prisma) return fallback;

  let theme = null;
  let activeSpecials = [];
  let allSpecials = [];
  try {
    const locationTheme = await prisma.dayTheme.findFirst({
      where: { dayOfWeek, locationId: location.id, isActive: true },
      include: { specials: { where: { isActive: true }, orderBy: { displayOrder: 'asc' } } },
    });
    const defaultTheme = await prisma.dayTheme.findFirst({
      where: { dayOfWeek, locationId: null, isActive: true },
      include: { specials: { where: { isActive: true }, orderBy: { displayOrder: 'asc' } } },
    });

    // Use location theme if it exists, otherwise company default
    theme = locationTheme || defaultTheme || null;

    // If location theme has no specials of its own, inherit from company default
    if (theme) {
      const themeSpecials = theme.specials || [];
      const defaultSpecials = defaultTheme ? (defaultTheme.specials || []) : [];
      allSpecials = themeSpecials.length > 0 ? themeSpecials : defaultSpecials;
      // Merge halfPriceConfig: prefer location-specific, fall back to default
      if (locationTheme && defaultTheme && !locationTheme.halfPriceConfig && defaultTheme.halfPriceConfig) {
        theme = { ...theme, halfPriceConfig: defaultTheme.halfPriceConfig };
      }
      activeSpecials = allSpecials;
    } else {
      const nextAvailable = await buildNextThemeLookup(prisma, location, dayOfWeek);
      if (nextAvailable && nextAvailable.theme) {
        fallback.nextAvailable = {
          dayOfWeek: nextAvailable.dayOfWeek,
          dayLabel: getDayLabel(nextAvailable.dayOfWeek),
          title: nextAvailable.theme.name,
          tagline: nextAvailable.theme.tagline || null,
          theme: nextAvailable.theme,
        };
      }
    }
  } catch (err) {
    warningState.specials = true;
  }

  if (allSpecials.length === 0 && theme) {
    const nextAvailable = await buildNextThemeLookup(prisma, location, dayOfWeek);
    if (nextAvailable && nextAvailable.theme) {
      fallback.nextAvailable = {
        dayOfWeek: nextAvailable.dayOfWeek,
        dayLabel: getDayLabel(nextAvailable.dayOfWeek),
        title: nextAvailable.theme.name,
        tagline: nextAvailable.theme.tagline || null,
        theme: nextAvailable.theme,
      };
    }
  }

  return {
    ...fallback,
    theme,
    activeSpecials,
    tomorrowTheme: await (async () => {
      const tomorrowIdx = (DAYS_ORDER.indexOf(dayOfWeek) + 1) % 7;
      const tomorrowDay = DAYS_ORDER[tomorrowIdx];
      return prisma.dayTheme.findFirst({
        where: { dayOfWeek: tomorrowDay, locationId: null, isActive: true },
      }).catch(() => null);
    })(),
  };
}

async function loadFlightForLocation(prisma, location, month, year, includePours = false) {
  const query = includePours
    ? { include: { pours: { orderBy: { displayOrder: 'asc' } } } }
    : {};

  let flight = null;
  if (location?.id) {
    flight = await prisma.flight.findFirst({
      where: { month, year, locationId: location.id, isActive: true },
      ...query,
    });
  }

  if (flight) return flight;

  return prisma.flight.findFirst({
    where: { month, year, locationId: null, isActive: true },
    ...query,
  });
}

async function handleSpecials(req, res, prisma, parsedUrl, location) {
  const loc = location;

  const queryDay = (parsedUrl.query.day || '').toUpperCase();
  const todayDay = getEasternDay().dayOfWeek;
  const viewingDay = DAYS_ORDER.includes(queryDay) ? queryDay : todayDay;
  const { month, year } = getEasternMonth();

  const warnings = {
    specials: false,
    bottles: false,
    flight: false,
  };

  let theme = null;
  let specials = [];
  let nextAvailable = null;
  let tomorrowTheme = null;
  let flight = null;
  let fridayFlights = [];
  let fridayFlight = null;
  let bottles = [];
  let halfPriceSpirits = [];
  let bartenderFlightState = { items: [], item: null, error: null };

  if (prisma) {
    const loaded = await loadLocationSpecials(prisma, loc, viewingDay, warnings);
    theme = loaded.theme;
    specials = loaded.activeSpecials;
    nextAvailable = loaded.nextAvailable;
    tomorrowTheme = loaded.tomorrowTheme;

    try {
      bartenderFlightState = await getSpiritFlight(loc.slug);
      warnings.flight = !!bartenderFlightState.error;
    } catch (err) {
      warnings.flight = true;
      console.warn('Bartender DB error loading Friday flight:', err.message);
    }

    // Always populate fridayFlights from bartender state (extended flights show every day)
    fridayFlights = bartenderFlightState.items || [];
    flight = bartenderFlightState.item;

    if (viewingDay === 'FRIDAY') {
      if (fridayFlights.length === 0) {
        try {
          const legacyFlight = await loadFlightForLocation(prisma, loc, month, year, true);
          if (legacyFlight) {
            flight = legacyFlight;
            fridayFlights = [legacyFlight];
          }
        } catch (err) {
          warnings.flight = true;
          console.warn('DB error loading legacy Friday flight:', err.message);
        }
      }
    } else {
      fridayFlight = bartenderFlightState.item;

      if (!fridayFlight) {
        try {
          fridayFlight = await loadFlightForLocation(prisma, loc, month, year, false);
        } catch (err) {
          warnings.flight = true;
          console.warn('DB error loading legacy Friday flight tease:', err.message);
        }
      }
    }

    if (viewingDay === 'SUNDAY') {
      try {
        const loadedBottles = await getBreakEvenBottles(loc.slug);
        bottles = loadedBottles.items || [];
        warnings.bottles = !!loadedBottles.error;
      } catch (err) {
        warnings.bottles = true;
        console.warn('DB error loading break-even bottles:', err.message);
      }

      if (bottles.length > 0 && process.env.OPENAI_API_KEY) {
        bottles = await buildGuestBottleNotesForCatalog(bottles, true);
      }
    }

    if (theme && theme.halfPriceConfig && theme.halfPriceConfig.picks && theme.halfPriceConfig.picks.length > 0) {
      try {
        const loaded = await getHalfPriceSpirits(loc.slug, theme.halfPriceConfig);
        halfPriceSpirits = loaded.items || [];
        warnings.halfPrice = !!loaded.error;
      } catch (err) {
        warnings.halfPrice = true;
        console.warn('DB error loading half-price spirits:', err.message);
      }
    }
  } else {
    warnings.specials = true;
  }

  // Active LTOs for the day being viewed. Filter on the day-of-week and any
  // optional date window. We pull all active LTOs for the location and filter
  // in code because Postgres array-contains via Prisma needs the enum value.
  let ltos = [];
  if (prisma?.limitedTimeOffer) {
    try {
      const all = await prisma.limitedTimeOffer.findMany({
        where: { locationId: loc.id, isActive: true },
        orderBy: { updatedAt: 'desc' },
      });
      // Compare against today (Eastern) for the date window check; the day-of-
      // week match uses the day the user is currently viewing.
      const todayEastern = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
      todayEastern.setHours(0, 0, 0, 0);
      ltos = all.filter((lto) => {
        if (!Array.isArray(lto.daysOfWeek) || !lto.daysOfWeek.includes(viewingDay)) return false;
        if (lto.startDate && new Date(lto.startDate) > todayEastern) return false;
        if (lto.endDate && new Date(lto.endDate) < todayEastern) return false;
        return true;
      });
    } catch (err) {
      console.warn('DB error loading LTOs:', err.message);
    }
  }

  const qs = parsedUrl.search || '';
  const sid = await trackPageView(req, res, prisma, loc.slug, loc.id, `/${loc.slug}/specials`, qs);
  sendHTML(
    res,
    200,
    injectTracking(generateSpecialsPage(loc, theme, specials, flight, bottles, viewingDay, tomorrowTheme, fridayFlight, {
      nextAvailable,
      warnings,
      halfPriceSpirits,
      fridayFlights,
      ltos,
    }), sid),
  );
  return true;
}

function generateTrainingPage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Daily Specials — Staff Training Guide | Dram &amp; Draught</title>
  <style>
    @page { size: letter; margin: 0.5in 0.55in; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; color: #1a1a1a; font-size: 10.5px; line-height: 1.45; background: #fff; }
    .page { max-width: 7.5in; margin: 0 auto; padding: 16px 0; }

    /* Header */
    .hdr { text-align: center; border-bottom: 2.5px solid #b8952e; padding-bottom: 10px; margin-bottom: 10px; }
    .hdr h1 { font-size: 20px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; color: #1a1a1a; }
    .hdr h1 span { color: #b8952e; }
    .hdr p { color: #555; font-size: 10px; margin-top: 3px; }

    /* Intro */
    .intro { background: #f8f5ee; border: 1px solid #e5dcc8; border-radius: 6px; padding: 8px 11px; margin-bottom: 10px; font-size: 10px; color: #333; }
    .intro strong { color: #1a1a1a; }

    /* Day grid */
    .days { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; margin-bottom: 10px; }
    .day { border: 1px solid #ddd; border-radius: 6px; padding: 7px 9px; break-inside: avoid; }
    .day-hdr { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; }
    .day-badge { background: #b8952e; color: #fff; font-size: 8px; font-weight: 800; padding: 2px 7px; border-radius: 10px; text-transform: uppercase; letter-spacing: 0.04em; }
    .day-name { font-weight: 800; font-size: 11.5px; color: #1a1a1a; }
    .day-theme { color: #b8952e; font-weight: 700; font-size: 10px; }
    .day ul { padding-left: 14px; margin-top: 3px; }
    .day li { font-size: 9.5px; color: #333; margin-bottom: 1.5px; }
    .day li strong { color: #1a1a1a; }
    .day .note { font-size: 8.5px; color: #777; font-style: italic; margin-top: 3px; }

    .day-featured { border-color: #b8952e; background: rgba(184,149,46,0.04); }
    .day.day-span { grid-column: span 2; }

    /* QR / How it works */
    .bottom-row { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; margin-bottom: 8px; }
    .box { border: 1px solid #ddd; border-radius: 6px; padding: 7px 9px; }
    .box h3 { font-size: 10.5px; font-weight: 800; color: #1a1a1a; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.03em; }
    .box ol, .box ul { padding-left: 14px; }
    .box li { font-size: 9.5px; color: #333; margin-bottom: 2px; }
    .box li strong { color: #1a1a1a; }
    .qr-url { font-family: "Courier New", monospace; font-size: 9px; background: #f5f0e5; padding: 2px 5px; border-radius: 3px; color: #b8952e; font-weight: 700; }

    /* Tips */
    .tips { border: 1.5px solid #b8952e; border-radius: 6px; padding: 7px 9px; background: rgba(184,149,46,0.04); }
    .tips h3 { font-size: 10.5px; font-weight: 800; color: #b8952e; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.03em; }
    .tips ul { padding-left: 14px; }
    .tips li { font-size: 9.5px; color: #333; margin-bottom: 2px; }

    .footer { text-align: center; color: #aaa; font-size: 8px; margin-top: 8px; }

    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .page { padding: 0; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
<div class="page">
  <div class="hdr">
    <h1>Dram <span>&amp;</span> Draught &mdash; Daily Specials Guide</h1>
    <p>Staff Training Reference</p>
  </div>

  <div class="intro">
    Every day of the week has a unique theme with curated specials. Guests scan a <strong>QR code</strong> on the table tent, menu, or A-frame to see that day's lineup on their phone &mdash; always live, always up to date. <strong>But specials only increase sales if YOU are actively inviting guests in.</strong> Mention upcoming specials to every table: "We have half-price whiskey tomorrow," "Come back Friday for flight night." The QR code is the tool &mdash; <strong>you are the salesperson.</strong>
  </div>

  <div class="days">
    <div class="day day-featured">
      <div class="day-hdr"><span class="day-badge">Mon</span> <span class="day-name">Monday</span></div>
      <div class="day-theme">Industry Night</div>
      <ul>
        <li><strong>For everyone</strong> &mdash; specials we'd enjoy ourselves, especially great for industry folks</li>
        <li><strong>$8 cocktails:</strong> Daiquiri, Old Fashioned</li>
        <li><strong>$5 shots:</strong> Fernet/Malort, Snaquiris, Pineapple UpDowns, M&amp;Ms</li>
        <li><strong>25% off</strong> beer, wine &amp; THC all night</li>
      </ul>
      <p class="note">Open to all guests. Make everyone feel like an insider.</p>
    </div>

    <div class="day">
      <div class="day-hdr"><span class="day-badge">Tue</span> <span class="day-name">Tuesday</span></div>
      <div class="day-theme">$9 Classic Cocktails</div>
      <ul>
        <li><strong>All classics $9:</strong> Old Fashioned, Negroni, Daiquiri, Manhattan, Mai Tai, and many more</li>
        <li>Full list organized by spirit (whiskey, gin, rum, tequila, brandy, vodka)</li>
        <li>Great night to introduce guests to something new at a low-risk price</li>
      </ul>
      <p class="note">The QR page shows every classic available. Point guests there when they can't decide.</p>
    </div>

    <div class="day day-featured">
      <div class="day-hdr"><span class="day-badge">Wed</span> <span class="day-name">Wednesday</span></div>
      <div class="day-theme">Whiskey Wednesday</div>
      <ul>
        <li><strong>$10 whiskey cocktails:</strong> Old Fashioned, Manhattan, Gold Rush + monthly rotating</li>
        <li><strong>50% off select whiskey pours</strong> &mdash; curated list per location</li>
        <li>Guests see the full half-price list with pricing on the QR specials page</li>
        <li><strong>Show the savings:</strong> Original price struck through, half price highlighted</li>
      </ul>
      <p class="note">Guide undecided guests to scan the QR &mdash; the price comparison sells itself.</p>
    </div>

    <div class="day day-featured">
      <div class="day-hdr"><span class="day-badge">Thu</span> <span class="day-name">Thursday</span></div>
      <div class="day-theme">Agave Thursday</div>
      <ul>
        <li><strong>$10 agave cocktails:</strong> Margarita, Spicy Margarita, Paloma, Oaxaca Old Fashioned</li>
        <li><strong>50% off select tequila &amp; mezcal pours</strong></li>
        <li>Upsell: "Try it with Fortaleza for half off tonight"</li>
      </ul>
    </div>

    <div class="day day-featured">
      <div class="day-hdr"><span class="day-badge">Fri</span> <span class="day-name">Friday</span></div>
      <div class="day-theme">Flight Night + Features</div>
      <ul>
        <li><strong>Monthly whiskey flight</strong> &mdash; 3 curated pours with tasting notes &amp; tasting card</li>
        <li>Additional flights rotate: cocktail flights, wine flights, and more</li>
        <li>Special events &amp; featured spirits may also be layered in &mdash; check the page</li>
        <li>Walk guests through flights &mdash; great conversation starter and easy sell</li>
      </ul>
    </div>

    <div class="day">
      <div class="day-hdr"><span class="day-badge">Sat</span> <span class="day-name">Saturday</span></div>
      <div class="day-theme">Features &amp; Events</div>
      <ul>
        <li>No fixed specials &mdash; full menu available</li>
        <li>Featured spirits, events, and pop-ups will appear here when scheduled</li>
        <li>High-traffic night &mdash; know the menu, make personal recommendations</li>
      </ul>
    </div>

    <div class="day day-featured day-span">
      <div class="day-hdr"><span class="day-badge">Sun</span> <span class="day-name">Sunday</span></div>
      <div class="day-theme">Break Even Bottles</div>
      <ul>
        <li><strong>Select bottles sold at cost</strong> &mdash; our gift to our guests</li>
        <li>1 oz pours so everyone gets a taste &mdash; bottles are managed in the Bartender Dashboard</li>
        <li>Tasting notes appear automatically on the specials page</li>
        <li><strong>Know the bottles:</strong> What are they? Where are they from? What do they taste like?</li>
      </ul>
      <p class="note">Bottles change weekly. Check the Bartender Dashboard at the start of each Sunday shift.</p>
    </div>
  </div>

  <div class="bottom-row">
    <div class="box">
      <h3>How the QR Code Works</h3>
      <ol>
        <li>Guest scans QR code on table tent, menu, or A-frame</li>
        <li>Opens the <strong>specials page</strong> for your location</li>
        <li>Shows <strong>today's specials</strong> automatically (can tap to view other days)</li>
        <li>Half-price items show original + discounted price</li>
        <li>Flight details, break-even bottles &mdash; all there</li>
      </ol>
      <p style="margin-top:5px; font-size:9px; color:#555">
        The page updates instantly when admin makes changes &mdash; no app download needed.
      </p>
    </div>

    <div class="tips">
      <h3>The #1 Rule: Invite Them Back</h3>
      <ul>
        <li><strong>Every guest should leave knowing about another day's special.</strong> This is what drives repeat visits.</li>
        <li><strong>Mon/Tue:</strong> "Come back Wednesday &mdash; half-price whiskey, scan the QR to preview the list"</li>
        <li><strong>Wed:</strong> "If you like tequila, tomorrow is half-price agave night"</li>
        <li><strong>Thu:</strong> "Friday is flight night &mdash; great way to try something new"</li>
        <li><strong>Fri/Sat:</strong> "Sunday we sell bottles at cost &mdash; some really special stuff"</li>
        <li><strong>Sun:</strong> "Monday's industry night &mdash; $8 cocktails, $5 shots, 25% off beer &amp; wine"</li>
        <li><strong>Half-price nights:</strong> Suggest premium pours &mdash; "$22 pours for $11 is a steal"</li>
        <li><strong>Check the specials page before every shift.</strong> Know the lineup cold.</li>
      </ul>
    </div>
  </div>

</div>

<div class="no-print" style="text-align:center; padding:16px">
  <button onclick="window.print()" style="background:#b8952e; color:#fff; border:none; padding:12px 32px; border-radius:8px; font-size:14px; font-weight:700; cursor:pointer;">Print / Save as PDF</button>
</div>
</body>
</html>`;
}

function generateHRTrainingPage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bartender Dashboard HR — Manager Training Guide | Dram &amp; Draught</title>
  <style>
    @page { size: letter; margin: 0.4in 0.5in; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; color: #1a1a1a; font-size: 11.5px; line-height: 1.5; background: #fff; }
    .page { max-width: 7.5in; margin: 0 auto; }

    .hdr { text-align: center; padding-bottom: 10px; margin-bottom: 12px; border-bottom: 3px solid #b8952e; }
    .hdr h1 { font-size: 22px; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; }
    .hdr h1 span { color: #b8952e; }
    .hdr p { color: #666; font-size: 11px; margin-top: 2px; }

    .callout { background: #faf7f0; border: 1.5px solid #b8952e; border-radius: 5px; padding: 7px 14px; margin-bottom: 12px; text-align: center; }
    .callout p { font-size: 12px; font-weight: 700; color: #b8952e; }

    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .span2 { grid-column: span 2; }

    .card { border: 1.5px solid #ddd; border-radius: 6px; padding: 11px 14px; break-inside: avoid; }
    .card-accent { border-color: #b8952e; background: rgba(184,149,46,0.03); }
    .card h3 { font-size: 12.5px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.02em; margin-bottom: 6px; padding-bottom: 4px; border-bottom: 1px solid #e8e0d0; }
    .card h3 .n { display: inline-flex; align-items: center; justify-content: center; background: #b8952e; color: #fff; width: 19px; height: 19px; border-radius: 50%; font-size: 10px; margin-right: 5px; }
    .card ol, .card ul { padding-left: 16px; }
    .card li { font-size: 11px; color: #333; margin-bottom: 3px; }
    .card li strong { color: #1a1a1a; }
    .card .hint { font-size: 10px; color: #888; font-style: italic; margin-top: 5px; padding-top: 4px; border-top: 1px dashed #ddd; }

    .doc-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 6px; }
    .doc-item { font-size: 11px; line-height: 1.45; }
    .doc-item strong { display: block; color: #b8952e; font-size: 10px; text-transform: uppercase; letter-spacing: 0.03em; margin-bottom: 1px; }

    .nt-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 5px; margin-top: 6px; }
    .nt { background: #f8f5ee; border-radius: 4px; padding: 5px 8px; font-size: 10px; line-height: 1.35; }
    .nt b { display: block; font-size: 8.5px; text-transform: uppercase; letter-spacing: 0.04em; color: #b8952e; margin-bottom: 1px; }

    .ref-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 12px; }
    .ref-grid li { font-size: 10.5px; margin-bottom: 2px; }

    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
<div class="page">
  <div class="hdr">
    <h1>Bartender <span>Dashboard</span> &mdash; HR Manager Guide</h1>
    <p>How to onboard, track, and develop your team &bull; bartender.dramanddraught.com</p>
  </div>

  <div class="callout">
    <p>Log in with your manager credentials &bull; All HR tools are under Team in the sidebar</p>
  </div>

  <div class="grid">

    <div class="card card-accent">
      <h3><span class="n">1</span> Sending an Employee Invite</h3>
      <ol>
        <li>Go to <strong>Team &rarr; Invites</strong>, click <strong>Send Invite</strong></li>
        <li>Enter name, email, role, and location</li>
        <li>System loads a <strong>default welcome template</strong></li>
        <li><strong>Review &amp; edit before sending</strong> &mdash; add start date, who to ask for, parking, dress code, anything specific</li>
        <li>New hire receives email with <strong>registration link</strong></li>
      </ol>
      <p class="hint">Track status: Pending &rarr; Sent &rarr; Viewed &rarr; Completed. Resend if needed.</p>
    </div>

    <div class="card card-accent">
      <h3><span class="n">2</span> Onboarding &amp; First Steps</h3>
      <ol>
        <li>New hire registers &rarr; appears in <strong>Team &rarr; Onboarding</strong></li>
        <li>System assigns <strong>onboarding checklist</strong> with tasks &amp; due dates</li>
        <li>Employee sees their checklist in <strong>My HR Portal</strong></li>
        <li><strong>Monitor progress</strong> &mdash; completion % shown per hire</li>
        <li>Follow up on overdue items &mdash; don't let new hires fall behind</li>
      </ol>
      <p class="hint">Key items: handbook sign-off, documents (2 forms of ID or passport), emergency contact, training plan, Sling, Toast access, confirm clock-in.</p>
    </div>

    <div class="card span2 card-accent">
      <h3><span class="n">3</span> HR Notes &amp; Documentation &mdash; The Most Important Habit</h3>
      <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 10px; align-items:start;">
        <div>
          <ul>
            <li>Every employee profile has a <strong>Notes</strong> section &mdash; <strong>use it constantly</strong></li>
            <li><strong>This is your paper trail.</strong> If it's not written down, it didn't happen</li>
            <li>Notes are timestamped, tied to your name, and permanent</li>
            <li>Pin critical notes to top &bull; Mark notes <strong>private</strong> (managers only)</li>
          </ul>
          <div class="nt-grid">
            <div class="nt"><b>Recognition</b> Great shift, guest compliment, above &amp; beyond</div>
            <div class="nt"><b>Coaching</b> Skill feedback, technique, growth areas</div>
            <div class="nt"><b>Concern</b> Late, called out, sidework missed, policy issue</div>
            <div class="nt"><b>Performance</b> Consistency, speed, upsells, compliments</div>
            <div class="nt"><b>Meeting</b> 1-on-1 recap, review follow-up, goal check-in</div>
            <div class="nt"><b>General</b> Availability, preferences, circumstances</div>
          </div>
        </div>
        <div>
          <div class="doc-grid" style="grid-template-columns:1fr; gap:6px;">
            <div class="doc-item"><strong>Something great?</strong> Write a Recognition note now. People repeat what gets noticed. Builds the case for promotions and raises.</div>
            <div class="doc-item"><strong>Late?</strong> Log as Concern with date, how late, whether they communicated. Patterns = documented patterns you can act on.</div>
            <div class="doc-item"><strong>Called out?</strong> Did they follow call-out policy? Who did they contact? Track frequency.</div>
            <div class="doc-item"><strong>Sidework not done?</strong> Be specific: what wasn't done, was it discussed? "Didn't restock well 3" &gt; "lazy."</div>
            <div class="doc-item"><strong>Coaching conversation?</strong> Document what was discussed and agreed on. If it escalates, you need the trail.</div>
            <div class="doc-item"><strong>Guest feedback?</strong> Complaints and compliments both matter at review time.</div>
          </div>
          <p class="hint" style="margin-top:6px;">If you'd reference it at a review, promotion, or termination &mdash; write it down now.</p>
        </div>
      </div>
    </div>

    <div class="card">
      <h3><span class="n">4</span> Performance Reviews</h3>
      <ul>
        <li>Scheduled automatically: <strong>30-day, 90-day, quarterly, annual</strong></li>
        <li>Dashboard flags <strong>overdue reviews</strong> &mdash; don't ignore them</li>
        <li>Captures: strengths, areas to improve, rating, <strong>action items with due dates</strong></li>
        <li>Employee can see their review and comment</li>
        <li><strong>HR notes feed into reviews</strong> &mdash; no scrambling to remember</li>
      </ul>
      <p class="hint">6 months of notes = 10 min review. No notes = an hour of guessing.</p>
    </div>

    <div class="card">
      <h3><span class="n">5</span> Training Plans (Current Process)</h3>
      <ul>
        <li>Each new hire gets a <strong>written training plan</strong> from their manager</li>
        <li>This is a <strong>separate document</strong> &mdash; fill it out, hand it to them</li>
        <li><strong>Email a copy to Lentz, Carrie, and Katy</strong> so leadership can track</li>
        <li>Plans must be <strong>specific to the employee</strong> &mdash; not a generic checklist</li>
        <li>Automated training tracking coming to the dashboard &mdash; for now: paper + email</li>
      </ul>
    </div>

    <div class="card span2 card-accent" style="padding: 9px 14px;">
      <h3 style="margin-bottom:4px; padding-bottom:3px;">Quick Reference</h3>
      <div class="ref-grid">
        <ul>
          <li><strong>Send invite:</strong> Team &rarr; Invites &rarr; Send Invite</li>
          <li><strong>Track onboarding:</strong> Team &rarr; Onboarding</li>
          <li><strong>View/edit employee:</strong> Team &rarr; click name</li>
          <li><strong>Add HR note:</strong> Employee profile &rarr; Notes tab</li>
        </ul>
        <ul>
          <li><strong>Performance reviews:</strong> Employee profile &rarr; Reviews tab</li>
          <li><strong>Training plans:</strong> Fill out, hand out, email Lentz/Carrie/Katy</li>
          <li><strong>HR reports:</strong> Team &rarr; Reports</li>
          <li><strong>Handbook:</strong> Team &rarr; Handbook</li>
        </ul>
      </div>
    </div>
  </div>
</div>

<div class="no-print" style="text-align:center; padding:16px">
  <button onclick="window.print()" style="background:#b8952e; color:#fff; border:none; padding:12px 32px; border-radius:8px; font-size:14px; font-weight:700; cursor:pointer;">Print / Save as PDF</button>
  <a href="/training" style="display:inline-block; margin-left:12px; color:#b8952e; font-size:14px; font-weight:600; text-decoration:none;">Specials Training Guide &rarr;</a>
</div>
</body>
</html>`;
}

async function handleDraft(req, res, prisma, locationSlug) {
  const locs = await getLocations(prisma);
  const location = locs.find((l) => l.slug === locationSlug);
  if (!location) {
    await send404(req, res, prisma);
    return true;
  }

  let taps = [];
  let tapError = false;
  if (prisma) {
    const loadedTaps = await getOnTap(locationSlug);
    taps = loadedTaps.items || [];
    tapError = !!loadedTaps.error;
  } else {
    tapError = true;
  }
  const sid = await trackPageView(req, res, prisma, location.slug, location.id, `/${location.slug}/draft`, getQueryString(req));
  sendHTML(res, 200, injectTracking(generateDraftPage(location, taps, tapError), sid));
  return true;
}

async function handleMenu(req, res, prisma, locationSlug) {
  const locs = await getLocations(prisma);
  const location = locs.find((l) => l.slug === locationSlug);
  if (!location) {
    await send404(req, res, prisma);
    return true;
  }

  let menu = [];
  let menuError = false;
  if (prisma) {
    try {
      menu = await prisma.menuCategory.findMany({
        where: { locationId: location.id, isActive: true },
        include: {
          items: { where: { isAvailable: true }, orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }] },
        },
        orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
      });
    } catch (err) {
      menuError = true;
      console.warn('DB error loading menu:', err.message);
    }
  } else {
    menuError = true;
  }

  const sid = await trackPageView(req, res, prisma, location.slug, location.id, `/${location.slug}/menu`, getQueryString(req));
  sendHTML(res, 200, injectTracking(generateMenuPage(location, menu, menuError), sid));
  return true;
}

async function handleSpirits(req, res, prisma, locationSlug) {
  const locs = await getLocations(prisma);
  const location = locs.find((l) => l.slug === locationSlug);
  if (!location) {
    await send404(req, res, prisma);
    return true;
  }

  let spirits = [];
  let spiritsError = false;
  if (prisma) {
    try {
      const loaded = await getSpiritList(locationSlug);
      spirits = loaded.items || [];
      spiritsError = !!loaded.error;
    } catch (err) {
      spiritsError = true;
      console.warn('DB error loading spirit list:', err.message);
    }
  } else {
    spiritsError = true;
  }

  const sid = await trackPageView(req, res, prisma, location.slug, location.id, `/${location.slug}/spirits`, getQueryString(req));
  sendHTML(res, 200, injectTracking(generateSpiritsPage(location, spirits, spiritsError), sid));
  return true;
}

const APPLY_POSITIONS_SET = new Set(['Bartender', 'Barback', 'Server', 'Host', 'Floor Manager', 'Other']);
const APPLY_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const APPLY_SHIFTS = ['day', 'evening', 'late'];
const APPLY_RESUME_MAX_BYTES = 5 * 1024 * 1024;
const APPLY_RESUME_ALLOWED_MIMES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/png',
]);

function trimField(v, max) {
  return String(v == null ? '' : v).trim().slice(0, max);
}

function parseAvailability(body) {
  const out = {};
  for (const day of APPLY_DAYS) {
    const raw = body[`avail_${day}`];
    const arr = Array.isArray(raw) ? raw : (raw ? [raw] : []);
    const filtered = arr.map((v) => String(v)).filter((v) => APPLY_SHIFTS.includes(v));
    if (filtered.length) out[day] = filtered;
  }
  return out;
}

function parseResume(body) {
  const data = String(body.resume_data || '').trim();
  if (!data) return null;
  // Accept "data:<mime>;base64,<payload>" only.
  const m = data.match(/^data:([^;]+);base64,([A-Za-z0-9+/=]+)$/);
  if (!m) return { error: 'Resume could not be read. Please re-attach the file.' };
  const mime = m[1].toLowerCase();
  if (!APPLY_RESUME_ALLOWED_MIMES.has(mime)) {
    return { error: 'Resume must be a PDF, Word document, or image (JPG/PNG).' };
  }
  // Base64 inflates ~33%; data URL length includes the prefix.
  if (data.length > APPLY_RESUME_MAX_BYTES * 1.4) {
    return { error: 'Resume is over 5 MB.' };
  }
  return {
    data,
    mime,
    fileName: trimField(body.resume_filename, 200) || 'resume',
  };
}

async function handleApply(req, res, prisma, locationSlug) {
  const locs = await getLocations(prisma);
  const location = locs.find((l) => l.slug === locationSlug);
  if (!location || !prisma) {
    await send404(req, res, prisma);
    return true;
  }

  const sid = await trackPageView(req, res, prisma, location.slug, location.id, `/${location.slug}/apply`, getQueryString(req));

  if (req.method !== 'POST') {
    if (!location.isHiring) {
      sendHTML(res, 200, injectTracking(generateApplyClosedPage(location), sid));
      return true;
    }
    sendHTML(res, 200, injectTracking(generateApplyPage(location), sid));
    return true;
  }

  // Submission. Even if hiring is currently off we'll redirect them to the
  // closed page rather than silently store an application.
  if (!location.isHiring) {
    sendHTML(res, 200, injectTracking(generateApplyClosedPage(location), sid));
    return true;
  }

  let body;
  try {
    body = await parseBody(req, { maxBytes: 10 * 1024 * 1024 });
  } catch (err) {
    sendHTML(res, 400, injectTracking(generateApplyPage(location, {
      errorMessage: 'Submission was too large. Please use a smaller resume file (max 5 MB).',
    }), sid));
    return true;
  }

  const name = trimField(body.name, 200);
  const email = trimField(body.email, 200).toLowerCase();
  const phone = trimField(body.phone, 50);
  const position = trimField(body.position, 60);
  const positionOther = position === 'Other' ? trimField(body.positionOther, 100) : null;
  const age21Raw = trimField(body.age21, 10).toLowerCase();
  const age21 = age21Raw === 'yes';
  // Legal eligibility for alcohol-service duties: yes / no / unsure. Required
  // for Bartender; optional for non-alcohol-handling roles. Stored verbatim.
  const alcEligRaw = trimField(body.alcoholEligibility, 10).toLowerCase();
  const alcoholEligibility = ['yes', 'no', 'unsure'].includes(alcEligRaw) ? alcEligRaw : null;
  const earliestStartRaw = trimField(body.earliestStart, 20);
  const yearsRaw = trimField(body.yearsExperience, 10);
  const yearsExperience = /^\d{1,2}$/.test(yearsRaw) ? Math.min(parseInt(yearsRaw, 10), 60) : null;
  const priorEmployers = trimField(body.priorEmployers, 4000);
  const certifications = trimField(body.certifications, 500);
  const spiritKnowledge = trimField(body.spiritKnowledge, 4000);
  const whyDD = trimField(body.whyDD, 4000);
  const referredBy = trimField(body.referredBy, 200);
  const availability = parseAvailability(body);

  const errors = [];
  if (!name) errors.push('Name is required.');
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('A valid email is required.');
  if (!phone) errors.push('Phone is required.');
  if (!position || !APPLY_POSITIONS_SET.has(position)) errors.push('Please select a position.');
  if (position === 'Other' && !positionOther) errors.push('Please tell us which "Other" role.');
  if (!age21Raw) errors.push('Please tell us if you are 21 or older.');
  if (position === 'Bartender' && !alcoholEligibility) {
    errors.push('Please answer whether you are legally eligible to perform alcohol-service duties.');
  }

  let earliestStart = null;
  if (earliestStartRaw) {
    const d = new Date(earliestStartRaw + 'T00:00:00');
    if (!Number.isNaN(d.valueOf())) earliestStart = d;
  }

  const resumeParsed = parseResume(body);
  if (resumeParsed && resumeParsed.error) errors.push(resumeParsed.error);

  if (errors.length) {
    sendHTML(res, 400, injectTracking(generateApplyPage(location, {
      errorMessage: errors.join(' '),
      prev: {
        name, email, phone, position, positionOther,
        age21: age21Raw, alcoholEligibility: alcEligRaw, earliestStart: earliestStartRaw,
        yearsExperience: yearsRaw, priorEmployers, certifications,
        spiritKnowledge, whyDD, referredBy, availability,
      },
    }), sid));
    return true;
  }

  const fwd = req.headers['x-forwarded-for'];
  const ip = fwd ? String(fwd).split(',')[0].trim() : (req.socket?.remoteAddress || null);
  const visitorId = getVisitorId(req);
  const currentSession = visitorId && prisma?.visitorSession
    ? await prisma.visitorSession.findFirst({ where: { visitorId }, orderBy: { updatedAt: 'desc' } }).catch(() => null)
    : null;

  let application;
  try {
    application = await prisma.jobApplication.create({
      data: {
        locationId: location.id,
        name,
        email,
        phone: phone || null,
        position,
        positionOther: positionOther || null,
        age21,
        alcoholEligibility,
        earliestStart,
        availability: Object.keys(availability).length ? availability : null,
        yearsExperience,
        priorEmployers: priorEmployers || null,
        certifications: certifications || null,
        spiritKnowledge: spiritKnowledge || null,
        whyDD: whyDD || null,
        referredBy: referredBy || null,
        resumeData: resumeParsed && !resumeParsed.error ? resumeParsed.data : null,
        resumeFileName: resumeParsed && !resumeParsed.error ? resumeParsed.fileName : null,
        resumeMimeType: resumeParsed && !resumeParsed.error ? resumeParsed.mime : null,
        ipAddress: ip,
        visitorId: visitorId || null,
        sessionId: currentSession?.id || null,
        source: currentSession?.source || null,
      },
    });
  } catch (err) {
    console.error('[apply] create failed:', err.message);
    sendHTML(res, 500, injectTracking(generateApplyPage(location, {
      errorMessage: 'Something went wrong saving your application. Please try again.',
    }), sid));
    return true;
  }

  // Fire-and-forget notifications.
  notifyApplicationSubmitted(location, application).catch((err) => console.warn('[apply] notify failed:', err.message));

  // Send applicant to the hospitality questionnaire. The old success page is
  // still available via /apply/q/{id}/done after the questionnaire is submitted.
  redirect(res, `/apply/q/${application.id}`);
  return true;
}

// ─── Hospitality questionnaire (post-application screening) ───
async function handleQuestionnaire(req, res, prisma, applicationId) {
  if (!prisma) {
    sendHTML(res, 500, '<h1>Service unavailable</h1>');
    return true;
  }
  const application = await prisma.jobApplication.findUnique({
    where: { id: applicationId },
    include: { location: true, questionnaire: true },
  }).catch(() => null);

  if (!application) {
    await send404(req, res, prisma);
    return true;
  }

  const locationName = application.location?.name || 'Dram & Draught';
  const locationSlug = application.location?.slug || '';

  if (req.method === 'GET') {
    if (application.questionnaire) {
      sendHTML(res, 200, generateQuestionnaireDonePage({ application, locationName, locationSlug }));
      return true;
    }
    sendHTML(res, 200, generateQuestionnairePage({ application, locationName, locationSlug }));
    return true;
  }

  if (req.method !== 'POST') {
    sendJSON(res, 405, { ok: false, error: 'Method Not Allowed' });
    return true;
  }

  // Block re-submission.
  if (application.questionnaire) {
    sendHTML(res, 200, generateQuestionnaireExpiredPage({ locationName, locationSlug }));
    return true;
  }

  let body;
  try {
    body = await parseBody(req);
  } catch (err) {
    sendHTML(res, 400, generateQuestionnairePage({
      application, locationName, locationSlug,
      errorMessage: 'Could not read your submission. Please try again.',
    }));
    return true;
  }

  const answers = {};
  const missing = [];
  for (const q of HIRING_QUESTIONS) {
    const raw = body[q.id];
    const text = typeof raw === 'string' ? raw.trim() : '';
    if (!text) missing.push(q.order);
    answers[q.id] = text.slice(0, 4000);
  }

  if (missing.length) {
    sendHTML(res, 400, generateQuestionnairePage({
      application, locationName, locationSlug,
      prev: answers,
      errorMessage: `Please answer every question (missing: ${missing.join(', ')}).`,
    }));
    return true;
  }

  let questionnaire;
  try {
    questionnaire = await prisma.jobApplicationQuestionnaire.create({
      data: {
        applicationId: application.id,
        answers,
        version: QUESTIONNAIRE_VERSION,
      },
    });
  } catch (err) {
    console.error('[questionnaire] create failed:', err.message);
    sendHTML(res, 500, generateQuestionnairePage({
      application, locationName, locationSlug,
      prev: answers,
      errorMessage: 'Something went wrong saving your answers. Please try again.',
    }));
    return true;
  }

  // Run the AI evaluation in the background — never block the response.
  runAndPersistEvaluation(prisma, application, questionnaire).catch((err) => {
    console.warn('[hiring] AI evaluation pipeline error:', err.message);
  });

  sendHTML(res, 200, generateQuestionnaireDonePage({ application, locationName, locationSlug }));
  return true;
}

async function runAndPersistEvaluation(prisma, application, questionnaire) {
  if (!prisma || !application || !questionnaire) return;
  let evaluation;
  try {
    evaluation = await runAiEvaluation({ application, questionnaire });
  } catch (err) {
    console.warn('[hiring] AI evaluation crashed:', err.message);
    evaluation = {
      errorDetail: err.message || String(err),
      recommendation: 'hold',
      weightedScore: 0,
      confidence: 'low',
      humanReviewRequired: true,
      humanReviewReasons: ['AI evaluation pipeline error. Manager review required.'],
      candidateSummary: '',
      overallRationale: 'AI evaluation pipeline error.',
      jobRelatedConcerns: [],
      suggestedInterviewQuestions: [],
      possibleBetterRoleFit: null,
      categoryScores: [],
      modelName: 'claude-opus-4-7',
      promptVersion: 'error',
      knowledgeBaseVersion: 'error',
      rawAiPayload: null,
    };
  }

  try {
    await prisma.jobApplicationAiEvaluation.create({
      data: {
        applicationId: application.id,
        recommendation: evaluation.recommendation,
        weightedScore: evaluation.weightedScore,
        confidence: evaluation.confidence,
        humanReviewRequired: evaluation.humanReviewRequired,
        humanReviewReasons: evaluation.humanReviewReasons || [],
        candidateSummary: evaluation.candidateSummary || '',
        overallRationale: evaluation.overallRationale || '',
        jobRelatedConcerns: evaluation.jobRelatedConcerns || [],
        suggestedInterviewQuestions: evaluation.suggestedInterviewQuestions || [],
        possibleBetterRoleFit: evaluation.possibleBetterRoleFit || null,
        categoryScores: evaluation.categoryScores || [],
        modelName: evaluation.modelName,
        promptVersion: evaluation.promptVersion,
        knowledgeBaseVersion: evaluation.knowledgeBaseVersion,
        rawAiPayload: evaluation.rawAiPayload || null,
        errorDetail: evaluation.errorDetail || null,
      },
    });
  } catch (err) {
    console.error('[hiring] persisting AI evaluation failed:', err.message);
  }
}

async function notifyApplicationSubmitted(location, application) {
  // Email applicant a confirmation.
  const applicantBody = [
    `Hi ${application.name.split(' ')[0] || 'there'},`,
    '',
    `Thanks for applying to Dram & Draught – ${location.name}. We've received your application for the ${application.position}${application.positionOther ? ` (${application.positionOther})` : ''} role and our team will be in touch.`,
    '',
    `Reference: ${application.id}`,
    '',
    'Cheers,',
    'Dram & Draught',
  ].join('\n');
  const applicantEmail = application.email
    ? sendEmailViaGoogle({
        to: application.email,
        subject: `We received your application — Dram & Draught ${location.name}`,
        body: applicantBody,
      }).catch((err) => console.warn('[apply] applicant email failed:', err.message))
    : Promise.resolve();

  // Email GMs / HR for this location so it lands in someone's inbox.
  const gmEmails = await getBarSupportEmailsForLocation(location.slug).catch(() => []);
  const recipients = Array.from(new Set(gmEmails.filter(Boolean)));
  let teamEmail = Promise.resolve();
  if (recipients.length) {
    const adminUrl = `https://menuqr.apps.dramanddraught.com/admin/applicants/${application.id}`;
    const lines = [
      `New application at ${location.name}`,
      `Position: ${application.position}${application.positionOther ? ` (${application.positionOther})` : ''}`,
      '',
      `Name: ${application.name}`,
      `Email: ${application.email}`,
      application.phone ? `Phone: ${application.phone}` : null,
      application.referredBy ? `Referred by: ${application.referredBy}` : null,
      application.age21 ? '21+: yes' : '21+: no',
      application.earliestStart ? `Earliest start: ${new Date(application.earliestStart).toISOString().slice(0, 10)}` : null,
      application.yearsExperience != null ? `Years experience: ${application.yearsExperience}` : null,
      application.certifications ? `Certifications: ${application.certifications}` : null,
      application.priorEmployers ? `Prior employers:\n${application.priorEmployers}` : null,
      application.spiritKnowledge ? `Spirit knowledge:\n${application.spiritKnowledge}` : null,
      application.whyDD ? `Why D&D:\n${application.whyDD}` : null,
      application.resumeFileName ? `Resume attached: ${application.resumeFileName} (view in admin)` : 'No resume attached',
      '',
      `Review: ${adminUrl}`,
    ].filter(Boolean);
    teamEmail = sendEmailViaGoogle({
      to: recipients,
      subject: `New application: ${application.name} — ${location.name}`,
      body: lines.join('\n'),
    }).catch((err) => console.warn('[apply] team email failed:', err.message));
  }

  await Promise.all([applicantEmail, teamEmail]);
}

const LUBRICATION_CUP_RECIPIENTS = [
  'jax.Daugherty@rndc-usa.com',
  'anna@dramanddraught.com',
  'lentz@dramanddraught.com',
];

async function handleLubricationCupSignup(req, res) {
  if (req.method !== 'POST') {
    sendJSON(res, 405, { ok: false, error: 'Method Not Allowed' });
    return true;
  }

  let body;
  try {
    body = await parseBody(req);
  } catch (err) {
    sendJSON(res, 400, { ok: false, error: 'Invalid request body' });
    return true;
  }

  const name = String(body.name || '').trim();
  const email = String(body.email || '').trim();
  const phone = String(body.phone || '').trim();
  const bar = String(body.bar || '').trim();
  const experience = String(body.experience || '').trim();
  const why = String(body.why || '').trim();
  const location = String(body.location || '').trim();

  if (!name || !email || !bar || !experience) {
    sendJSON(res, 400, { ok: false, error: 'Please fill in all required fields.' });
    return true;
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    sendJSON(res, 400, { ok: false, error: 'Please enter a valid email address.' });
    return true;
  }

  // Process optional photo
  const photoRaw = String(body.photo || '').trim();
  let attachments;
  if (photoRaw && photoRaw.startsWith('data:image/')) {
    const commaIdx = photoRaw.indexOf(',');
    if (commaIdx > 0) {
      const meta = photoRaw.slice(0, commaIdx); // e.g. "data:image/jpeg;base64"
      const base64Data = photoRaw.slice(commaIdx + 1);
      // Validate size: base64 string < 2MB
      if (base64Data.length < 2 * 1024 * 1024) {
        const mimeMatch = meta.match(/^data:(image\/[a-z+]+)/);
        const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
        const ext = mimeType === 'image/png' ? 'png' : 'jpg';
        attachments = [{ mimeType, filename: name.replace(/[^a-zA-Z0-9]/g, '_') + '.' + ext, base64Data }];
      }
    }
  }

  const staffBody = [
    'LUBRICATION CUP - NEW COMPETITOR SIGNUP',
    '',
    `Name: ${name}`,
    `Email: ${email}`,
    phone ? `Phone: ${phone}` : '',
    `Bar: ${bar}`,
    `Experience: ${experience}`,
    why ? `Why compete: ${why}` : '',
    location ? `Location: ${location}` : '',
    attachments ? '(Photo attached)' : '(No photo submitted)',
  ].filter(Boolean).join('\n');

  try {
    const result = await sendEmailViaGoogle({
      to: LUBRICATION_CUP_RECIPIENTS,
      subject: `Lubrication Cup Signup: ${name}`,
      body: staffBody,
      attachments,
    });

    if (result && result.ok) {
      sendJSON(res, 200, { ok: true });
    } else {
      console.warn('Lubrication Cup signup email failed:', result);
      sendJSON(res, 200, { ok: true });
    }
  } catch (err) {
    console.error('Lubrication Cup signup email error:', err.message);
    sendJSON(res, 200, { ok: true });
  }

  return true;
}

async function loadEventRowsWithCounts(prisma, query) {
  if (!prisma) return [];
  return prisma.event.findMany({
    ...query,
    include: {
      _count: { select: { signups: true } },
    },
  }).catch(async (err) => {
    console.warn('Public events include failed, falling back:', err.message);
    const rows = await prisma.event.findMany(query).catch(() => []);
    for (const ev of rows) {
      ev._count = {
        signups: await prisma.eventSignup.count({ where: { eventId: ev.id } }).catch(() => 0),
      };
    }
    return rows;
  });
}

async function getPublicEventsForLocation(prisma, locationId, options = {}) {
  if (!prisma || !locationId) return { upcoming: [], recent: [] };
  const now = new Date();
  const upcomingTake = Math.max(parseInt(options.upcomingTake, 10) || 0, 0);
  const recentTake = Math.max(parseInt(options.recentTake, 10) || 0, 0);

  const baseWhere = {
    locationId,
    isActive: true,
    isCancelled: false,
  };

  const upcoming = upcomingTake > 0
    ? await loadEventRowsWithCounts(prisma, {
        where: {
          ...baseWhere,
          OR: [
            { startDate: { gte: now } },
            { endDate: { gte: now } },
            { promoteUntil: { gte: now } },
          ],
        },
        orderBy: [{ startDate: 'asc' }],
        take: upcomingTake,
      })
    : [];

  const recent = recentTake > 0
    ? await loadEventRowsWithCounts(prisma, {
        where: {
          ...baseWhere,
          startDate: { lt: now },
        },
        orderBy: [{ startDate: 'desc' }],
        take: recentTake,
      })
    : [];

  const mapEvent = (ev) => ({
    ...ev,
    signupCount: ev._count?.signups || 0,
  });

  return {
    upcoming: upcoming.map(mapEvent),
    recent: recent.map(mapEvent),
  };
}

async function handlePublic(req, res, pathname, prisma) {
  // Serve any file under /assets/** from the project's assets directory.
  // Path traversal defense: resolve the candidate path and require it stays
  // rooted inside the assets dir.
  if (pathname.startsWith('/assets/')) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      sendHTML(res, 405, '<h1>Method Not Allowed</h1>');
      return true;
    }
    const assetsRoot = path.join(__dirname, '..', 'assets');
    const candidate = path.normalize(path.join(assetsRoot, pathname.replace(/^\/assets\//, '')));
    if (!candidate.startsWith(assetsRoot + path.sep) && candidate !== assetsRoot) {
      sendHTML(res, 403, '<h1>Forbidden</h1>');
      return true;
    }
    try {
      const buf = fs.readFileSync(candidate);
      const ext = path.extname(candidate).toLowerCase();
      const mime = ({
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.webp': 'image/webp',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.ico': 'image/x-icon',
      })[ext] || 'application/octet-stream';
      res.writeHead(200, {
        'Content-Type': mime,
        'Content-Length': buf.length,
        'Cache-Control': 'public, max-age=604800, immutable',
      });
      if (req.method === 'HEAD') res.end();
      else res.end(buf);
      return true;
    } catch (err) {
      sendHTML(res, 404, '<h1>Asset not found</h1>');
      return true;
    }
  }

  if (pathname === '/api/ai-status') {
    if (req.method !== 'GET') {
      sendJSON(res, 405, { ok: false, error: 'Method Not Allowed' });
      return true;
    }
    const diagnostics = getOpenAiDiagnosticSnapshot();
    sendJSON(res, 200, { ok: true, ai: diagnostics });
    return true;
  }

  if (pathname === '/api/feedback') {
    return handleFeedback(req, res, prisma);
  }

  if (pathname === '/api/public/reviews') {
    return handlePublicReviews(req, res, prisma);
  }

  // /api/public/flights/:slug — JSON list of currently active spirit flights
  // for a given location, used by the public site's per-location specials page.
  const publicFlightsMatch = pathname.match(/^\/api\/public\/flights\/([a-z0-9-]+)$/);
  if (publicFlightsMatch) {
    return handlePublicFlights(req, res, publicFlightsMatch[1]);
  }

  if (pathname === '/api/lubrication-cup-signup') {
    return handleLubricationCupSignup(req, res);
  }

  if (pathname === '/api/analytics/heartbeat') {
    if (req.method !== 'POST') { sendJSON(res, 405, { ok: false }); return true; }
    try {
      const body = await parseBody(req);
      const sessionId = String(body.sessionId || '').trim();
      if (!sessionId || !prisma) { sendJSON(res, 200, { ok: true }); return true; }
      const data = { updatedAt: new Date() };
      if (body.durationSecs && Number.isFinite(Number(body.durationSecs))) {
        data.durationSecs = Math.min(Math.round(Number(body.durationSecs)), 7200);
        data.endedAt = new Date();
      }
      if (body.screenWidth && Number.isFinite(Number(body.screenWidth))) data.screenWidth = Number(body.screenWidth);
      if (body.screenHeight && Number.isFinite(Number(body.screenHeight))) data.screenHeight = Number(body.screenHeight);
      if (body.language) data.language = String(body.language).slice(0, 20);
      await prisma.visitorSession.update({ where: { id: sessionId }, data }).catch(() => {});
    } catch (err) { console.warn('Heartbeat error:', err.message); }
    sendJSON(res, 200, { ok: true });
    return true;
  }

  // Staff training pages (printable)
  if (pathname === '/training') {
    sendHTML(res, 200, generateTrainingPage());
    return true;
  }
  if (pathname === '/training/hr') {
    sendHTML(res, 200, generateHRTrainingPage());
    return true;
  }

  // Homepage
  if (pathname === '/') {
    const locs = await getLocations(prisma);
    const sid = await trackPageView(req, res, prisma, '', null, '/', getQueryString(req));
    sendHTML(res, 200, injectTracking(generateHomepage(locs), sid));
    return true;
  }

  // Hiring landing page — one shareable URL that lists every location currently
  // hiring and links to that location's /{slug}/apply form.
  if (pathname === '/hiring' || pathname === '/careers' || pathname === '/jobs') {
    const locs = await getLocations(prisma);
    const sid = await trackPageView(req, res, prisma, '', null, '/hiring', getQueryString(req));
    sendHTML(res, 200, injectTracking(generateHiringIndexPage(locs), sid));
    return true;
  }

  // Specials page: /{slug}/specials?day=MONDAY
  const specialsMatch = pathname.match(/^\/([a-z0-9-]+)\/specials$/);
  if (specialsMatch) {
    const slug = specialsMatch[1];
    const parsedUrl = url.parse(req.url, true);
    const locs = await getLocations(prisma);
    const location = locs.find((l) => l.slug === slug);
    if (!location) {
      await send404(req, res, prisma);
      return true;
    }

    return handleSpecials(req, res, prisma, parsedUrl, location);
  }

  // Draft page: /{slug}/draft
  const draftMatch = pathname.match(/^\/([a-z0-9-]+)\/draft$/);
  if (draftMatch) {
    const slug = draftMatch[1];
    return handleDraft(req, res, prisma, slug);
  }

  // Menu page: /{slug}/menu
  const menuMatch = pathname.match(/^\/([a-z0-9-]+)\/menu$/);
  if (menuMatch) {
    const slug = menuMatch[1];
    return handleMenu(req, res, prisma, slug);
  }

  // Spirit list page: /{slug}/spirits
  const spiritsMatch = pathname.match(/^\/([a-z0-9-]+)\/spirits$/);
  if (spiritsMatch) {
    const slug = spiritsMatch[1];
    return handleSpirits(req, res, prisma, slug);
  }

  // Employment application page: GET shows form, POST submits.
  const applyMatch = pathname.match(/^\/([a-z0-9-]+)\/apply$/);
  if (applyMatch) {
    return handleApply(req, res, prisma, applyMatch[1]);
  }

  // Post-application hospitality questionnaire: GET shows form, POST submits.
  const questionnaireMatch = pathname.match(/^\/apply\/q\/([0-9a-f-]{36})$/i);
  if (questionnaireMatch) {
    return handleQuestionnaire(req, res, prisma, questionnaireMatch[1]);
  }

  // Flights page: /{slug}/flights
  const flightsMatch = pathname.match(/^\/([a-z0-9-]+)\/flights$/);
  if (flightsMatch) {
    const slug = flightsMatch[1];
    const locs = await getLocations(prisma);
    const location = locs.find((l) => l.slug === slug);
    if (!location) {
      await send404(req, res, prisma);
      return true;
    }
    let flights = [];
    try {
      const result = await getFeaturedFlights(slug);
      flights = result.items || [];
    } catch (err) {
      console.warn('Error loading featured flights:', err.message);
    }
    const sid = await trackPageView(req, res, prisma, location.slug, location.id, `/${location.slug}/flights`, getQueryString(req));
    sendHTML(res, 200, injectTracking(generateFlightsPage(location, flights), sid));
    return true;
  }

  // Event signup submission: POST /{slug}/events/{eventSlug}/signup
  const eventSignupMatch = pathname.match(/^\/([a-z0-9-]+)\/events\/([a-z0-9-]+)\/signup$/);
  if (eventSignupMatch && req.method === 'POST') {
    const [, locSlug, eventSlug] = eventSignupMatch;
    const locs = await getLocations(prisma);
    const location = locs.find((l) => l.slug === locSlug);
    if (!location || !prisma) {
      await send404(req, res, prisma);
      return true;
    }
    const event = await prisma.event.findFirst({
      where: { locationId: location.id, slug: eventSlug },
    }).catch(() => null);
    if (!event) {
      await send404(req, res, prisma);
      return true;
    }
    const signupCount = await prisma.eventSignup.count({ where: { eventId: event.id } }).catch(() => 0);
    const status = eventStatus(event, signupCount);
    if (status.key !== 'open') {
      // Re-render the page with the status banner
      const sid = await trackPageView(req, res, prisma, location.slug, location.id, `/${location.slug}/events/${event.slug}`, getQueryString(req));
      sendHTML(res, 200, injectTracking(generateEventPage(location, event, signupCount), sid));
      return true;
    }

    const body = await parseBody(req);
    const name = String(body.name || '').trim().slice(0, 120);
    const email = String(body.email || '').trim().slice(0, 200) || null;
    const phone = String(body.phone || '').trim().slice(0, 50) || null;
    const partySizeRaw = parseInt(body.partySize, 10);
    const partySize = Number.isFinite(partySizeRaw) && partySizeRaw > 0 ? Math.min(partySizeRaw, 50) : null;
    const notes = String(body.notes || '').trim().slice(0, 1000) || null;

    // Validate required fields
    const errors = [];
    if (!name) errors.push('Name is required.');
    if (event.collectEmail && !email) errors.push('Email is required.');

    // Custom answers — image questions can hold a base64 data URL up to ~750KB.
    // images-multi questions carry a JSON-stringified array of data URLs
    // (same per-entry cap, max count enforced client-side and re-checked here).
    const customAnswers = {};
    const questions = Array.isArray(event.customQuestions) ? event.customQuestions : [];
    for (const q of questions) {
      const raw = body[`cq_${q.id}`];
      if (q.type === 'images-multi') {
        const rawStr = String(raw == null ? '' : raw).trim();
        let arr = [];
        try {
          const parsed = JSON.parse(rawStr || '[]');
          if (Array.isArray(parsed)) arr = parsed;
        } catch (e) { arr = []; }
        const max = Number.isFinite(q.max) && q.max > 0 ? q.max : 5;
        arr = arr
          .filter((x) => typeof x === 'string')
          .filter((x) => /^(data:image\/(jpeg|jpg|png|gif|webp);base64,|https?:\/\/)/i.test(x))
          .filter((x) => x.length <= 750 * 1024)
          .slice(0, max);
        if (q.required && arr.length === 0) errors.push(`${q.label} is required.`);
        if (arr.length > 0) customAnswers[q.id] = arr;
        continue;
      }
      let val = String(raw == null ? '' : raw).trim();
      if (q.type === 'image') {
        // Accept either a data URL or http(s) URL; cap at ~750KB
        if (val && !/^(data:image\/(jpeg|jpg|png|gif|webp);base64,|https?:\/\/)/i.test(val)) {
          val = '';
        }
        if (val.length > 750 * 1024) val = '';
      } else {
        val = val.slice(0, 500);
      }
      if (q.required && !val) errors.push(`${q.label} is required.`);
      if (val) customAnswers[q.id] = val;
    }

    if (errors.length > 0) {
      const sid = await trackPageView(req, res, prisma, location.slug, location.id, `/${location.slug}/events/${event.slug}`, getQueryString(req));
      sendHTML(res, 400, injectTracking(
        generateEventPage(location, event, signupCount, {
          prevValues: { name, email, phone, partySize, notes, ...Object.fromEntries(questions.map(q => [q.id, body[`cq_${q.id}`] || ''])) },
          errorMessage: errors.join(' '),
        }),
        sid,
      ));
      return true;
    }

    // Two-step gate: if the event has any `ackOnly` sections (parking/setup/
    // lock-in rules on the art pop-up), show the terms page first. The terms
    // page POSTs back to this same endpoint with `_confirmed=true` carrying
    // all the hidden field values, and we drop through to the create below.
    const hasAckSections = Array.isArray(event.sections)
      && event.sections.some(s => s && s.ackOnly === true);
    const confirmed = body._confirmed === 'true';
    if (hasAckSections && !confirmed) {
      const sid = await trackPageView(req, res, prisma, location.slug, location.id, `/${location.slug}/events/${event.slug}/terms`, getQueryString(req));
      sendHTML(res, 200, injectTracking(
        generateEventTermsPage(location, event, {
          name, email, phone, partySize, notes, customAnswers,
        }),
        sid,
      ));
      return true;
    }

    // Get client IP
    const fwd = req.headers['x-forwarded-for'];
    const ip = fwd ? String(fwd).split(',')[0].trim() : (req.socket?.remoteAddress || null);

    const isVendorEvent = event.isVendorEvent === true;
    const visitorId = getVisitorId(req);
    const currentSession = visitorId && prisma?.visitorSession
      ? await prisma.visitorSession.findFirst({ where: { visitorId }, orderBy: { updatedAt: 'desc' } }).catch(() => null)
      : null;

    let signup;
    try {
      signup = await prisma.eventSignup.create({
        data: {
          eventId: event.id,
          name,
          email,
          phone,
          partySize,
          notes,
          customAnswers: Object.keys(customAnswers).length > 0 ? customAnswers : null,
          ipAddress: ip,
          visitorId: visitorId || null,
          sessionId: currentSession?.id || null,
          source: currentSession?.source || null,
          status: isVendorEvent ? 'pending' : 'approved',
        },
      });
    } catch (err) {
      console.error('Error creating event signup:', err.message);
      const sid = await trackPageView(req, res, prisma, location.slug, location.id, `/${location.slug}/events/${event.slug}`, getQueryString(req));
      sendHTML(res, 500, injectTracking(
        generateEventPage(location, event, signupCount, {
          prevValues: { name, email, phone, partySize, notes },
          errorMessage: 'Something went wrong saving your signup. Please try again.',
        }),
        sid,
      ));
      return true;
    }

    if (email) {
      await linkVisitorToEmail(req, prisma, email, {
        visitorId,
        session: currentSession,
        locationSlug: location.slug,
        source: currentSession?.source || null,
        kind: 'event_signup',
      });
    }
    await recordAnalyticsEvent(req, prisma, 'event_signup', {
      visitorId,
      session: currentSession,
      email,
      locationId: location.id || null,
      locationSlug: location.slug,
      source: currentSession?.source || null,
      pagePath: `/${location.slug}/events/${event.slug}/signup`,
      entityType: 'event',
      entityId: event.id,
      entityName: event.title,
      metadata: {
        eventSlug: event.slug,
        status: isVendorEvent ? 'pending' : 'approved',
        partySize,
        isVendorEvent,
      },
    });

    // Best-effort notification email. For vendor events, always notify the
    // location's GM/admin list in addition to the configured notifyEmail so
    // the approval queue never gets missed.
    try {
      const recipients = new Set();
      if (event.notifyEmail) recipients.add(String(event.notifyEmail).trim().toLowerCase());
      if (isVendorEvent) {
        const gmEmails = await getBarSupportEmailsForLocation(location.slug).catch(() => []);
        for (const e of gmEmails) recipients.add(e);
      }
      if (recipients.size > 0) {
        const subject = isVendorEvent
          ? `New vendor application: ${event.title}`
          : `New signup: ${event.title}`;
        const bodyLines = [
          isVendorEvent
            ? `New vendor application for "${event.title}" at ${location.name}`
            : `New signup for "${event.title}" at ${location.name}`,
          `Event date: ${event.startDate ? new Date(event.startDate).toLocaleString('en-US', { timeZone: 'America/New_York' }) : ''}`,
          '',
          `Name: ${name}`,
          email ? `Email: ${email}` : null,
          phone ? `Phone: ${phone}` : null,
          partySize ? `Party size: ${partySize}` : null,
          notes ? `Notes: ${notes}` : null,
        ].filter(Boolean);
        for (const q of questions) {
          const v = customAnswers[q.id];
          if (!v) continue;
          if (Array.isArray(v)) {
            // Don't dump base64 blobs in email bodies — summarize.
            bodyLines.push(`${q.label}: ${v.length} image${v.length === 1 ? '' : 's'} attached (view in admin)`);
          } else if (q.type === 'image' || /^(data:image\/|https?:\/\/)/i.test(String(v))) {
            // Single-image question: same summary treatment so we don't paste a
            // multi-megabyte data URL into the email body.
            bodyLines.push(`${q.label}: 1 image attached (view in admin)`);
          } else {
            bodyLines.push(`${q.label}: ${v}`);
          }
        }
        if (isVendorEvent) {
          bodyLines.push('', 'Review & approve: https://menuqr.apps.dramanddraught.com/admin/events/' + event.id + '/signups');
        } else {
          bodyLines.push('', `Total signups: ${signupCount + 1}${event.capacity ? ' / ' + event.capacity : ''}`);
        }
        await sendEmailViaGoogle({
          to: Array.from(recipients),
          subject,
          body: bodyLines.join('\n'),
        }).catch(err => console.warn('Event notify email failed:', err.message));
      }
    } catch (err) {
      console.warn('Event notify email error:', err.message);
    }

    const sid = await trackPageView(req, res, prisma, location.slug, location.id, `/${location.slug}/events/${event.slug}/signup`, getQueryString(req));
    sendHTML(res, 200, injectTracking(generateEventConfirmationPage(location, event, signup), sid));
    return true;
  }

  // Events index: /{slug}/events
  const eventsIndexMatch = pathname.match(/^\/([a-z0-9-]+)\/events$/);
  if (eventsIndexMatch) {
    const [, locSlug] = eventsIndexMatch;
    const locs = await getLocations(prisma);
    const location = locs.find((l) => l.slug === locSlug);
    if (!location || !prisma) {
      await send404(req, res, prisma);
      return true;
    }

    const { upcoming, recent } = await getPublicEventsForLocation(prisma, location.id, {
      upcomingTake: 12,
      recentTake: 4,
    });
    const sid = await trackPageView(req, res, prisma, location.slug, location.id, `/${location.slug}/events`, getQueryString(req));
    sendHTML(res, 200, injectTracking(generateEventsIndexPage(location, upcoming, recent), sid));
    return true;
  }

  // Event page: /{slug}/events/{eventSlug}
  const eventPageMatch = pathname.match(/^\/([a-z0-9-]+)\/events\/([a-z0-9-]+)$/);
  if (eventPageMatch) {
    const [, locSlug, eventSlug] = eventPageMatch;
    const locs = await getLocations(prisma);
    const location = locs.find((l) => l.slug === locSlug);
    if (!location || !prisma) {
      await send404(req, res, prisma);
      return true;
    }
    const event = await prisma.event.findFirst({
      where: { locationId: location.id, slug: eventSlug },
    }).catch(() => null);
    if (!event) {
      await send404(req, res, prisma);
      return true;
    }
    const signupCount = await prisma.eventSignup.count({ where: { eventId: event.id } }).catch(() => 0);
    const sid = await trackPageView(req, res, prisma, location.slug, location.id, `/${location.slug}/events/${event.slug}`, getQueryString(req));
    sendHTML(res, 200, injectTracking(generateEventPage(location, event, signupCount), sid));
    return true;
  }

  // Legacy redirect: /:slug/lubrication-cup → /:slug/events/lubrication-cup
  // The old hardcoded page has been replaced with a real event in /admin/events
  // that admins can edit. This 301 keeps printed/QR/social links working.
  const cupMatch = pathname.match(/^\/([a-z0-9-]+)\/lubrication-cup$/);
  if (cupMatch) {
    const slug = cupMatch[1];
    const target = `/${slug}/events/lubrication-cup` + getQueryString(req);
    res.writeHead(301, { Location: target });
    res.end();
    return true;
  }

  // Location page: /{slug}
  if (pathname.length > 1 && !pathname.includes('.') && !pathname.startsWith('/admin')) {
    const slug = pathname.substring(1);
    if (slug.includes('/')) return false;

    const locs = await getLocations(prisma);
    const location = locs.find((l) => l.slug === slug);
    if (location) {
      let menuCategories = [];
      if (prisma) {
        try {
          menuCategories = await prisma.menuCategory.findMany({
            where: { locationId: location.id, isActive: true },
            include: { items: { where: { isAvailable: true }, orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }] } },
            orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
          });
        } catch (err) { console.warn('Menu load error:', err.message); }
      }
      let showFlightsButton = false;
      try {
        showFlightsButton = await hasFeaturedFlights(slug);
      } catch (err) { console.warn('Featured flights check error:', err.message); }
      const { upcoming: upcomingEvents } = await getPublicEventsForLocation(prisma, location.id, { upcomingTake: 3 });
      const sid = await trackPageView(req, res, prisma, location.slug, location.id, `/${location.slug}`, getQueryString(req));
      sendHTML(res, 200, injectTracking(generateLocationPage(location, locs, menuCategories, {
        showFlightsButton,
        upcomingEvents,
        hasEvents: upcomingEvents.length > 0,
      }), sid));
      return true;
    }
    await send404(req, res, prisma);
    return true;
  }

  return false;
}

module.exports = { handlePublic };
