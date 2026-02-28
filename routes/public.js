const url = require('url');
const {
  sendHTML,
  sendJSON,
  getLocations,
  getDayLabel,
  buildGuestBottleNotesForCatalog,
  buildFeedbackMailto,
  parseBody,
  sendFeedbackEmails,
  getFeedbackFromAddress,
} = require('../helpers');
const { generateHomepage } = require('../views/homepage');
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
} = require('../bartenderDb');
const { generateDraftPage } = require('../views/draftPage');
const { generateMenuPage } = require('../views/menuPage');

const DAYS_ORDER = Array.isArray(importDaysOrder) && importDaysOrder.length > 0 ? importDaysOrder : ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];

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

  if (!requestedSlug) {
    sendJSON(res, 400, { ok: false, error: 'Missing location slug' });
    return true;
  }

  if (!rating || rating < 1 || rating > 5) {
    sendJSON(res, 400, { ok: false, error: 'Rating must be between 1 and 5' });
    return true;
  }

  if (!isFiveStar && !feedbackText) {
    sendJSON(res, 400, { ok: false, error: 'Feedback details are required' });
    return true;
  }

  if (!guestEmailRaw) {
    sendJSON(res, 400, { ok: false, error: 'Email is required for feedback confirmation.' });
    return true;
  }

  if (!isLikelyValidEmail(guestEmailRaw)) {
    sendJSON(res, 400, { ok: false, error: 'Please provide a valid email address' });
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
        },
      });
      savedFeedbackId = created?.id || null;
    } catch (err) {
      console.warn('Error storing feedback in database:', err.message);
    }
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
    theme = await prisma.dayTheme.findFirst({
      where: { dayOfWeek, locationId: location.id, isActive: true },
      include: { specials: { where: { isActive: true }, orderBy: { displayOrder: 'asc' } } },
    });
    if (!theme) {
      theme = await prisma.dayTheme.findFirst({
        where: { dayOfWeek, locationId: null, isActive: true },
        include: { specials: { where: { isActive: true }, orderBy: { displayOrder: 'asc' } } },
      });
    }

    if (theme) {
      allSpecials = theme.specials || [];
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
  let fridayFlight = null;
  let bottles = [];

  if (prisma) {
    const loaded = await loadLocationSpecials(prisma, loc, viewingDay, warnings);
    theme = loaded.theme;
    specials = loaded.activeSpecials;
    nextAvailable = loaded.nextAvailable;
    tomorrowTheme = loaded.tomorrowTheme;

    if (viewingDay === 'FRIDAY') {
      try {
        flight = await prisma.flight.findFirst({
          where: { month, year, locationId: loc.id, isActive: true },
          include: { pours: { orderBy: { displayOrder: 'asc' } } },
        });
        if (!flight) {
          flight = await prisma.flight.findFirst({
            where: { month, year, locationId: null, isActive: true },
            include: { pours: { orderBy: { displayOrder: 'asc' } } },
          });
        }
      } catch (err) {
        warnings.flight = true;
        console.warn('DB error loading Friday flight:', err.message);
      }
    } else {
      try {
        fridayFlight = await prisma.flight.findFirst({
          where: { month, year, locationId: null, isActive: true },
        });
      } catch (err) {
        warnings.flight = true;
        console.warn('DB error loading Friday flight tease:', err.message);
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
  } else {
    warnings.specials = true;
  }

  sendHTML(
    res,
    200,
    generateSpecialsPage(loc, theme, specials, flight, bottles, viewingDay, tomorrowTheme, fridayFlight, {
      nextAvailable,
      warnings,
    }),
  );
  return true;
}

async function handleDraft(req, res, prisma, locationSlug) {
  const locs = await getLocations(prisma);
  const location = locs.find((l) => l.slug === locationSlug);
  if (!location) {
    sendHTML(res, 404, '<h1>Location not found</h1><p><a href="/">Back to locations</a></p>');
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
  sendHTML(res, 200, generateDraftPage(location, taps, tapError));
  return true;
}

async function handleMenu(req, res, prisma, locationSlug) {
  const locs = await getLocations(prisma);
  const location = locs.find((l) => l.slug === locationSlug);
  if (!location) {
    sendHTML(res, 404, '<h1>Location not found</h1><p><a href="/">Back to locations</a></p>');
    return true;
  }

  let menu = [];
  let menuError = false;
  if (prisma) {
    try {
      menu = await prisma.menuCategory.findMany({
        where: { locationId: location.id, isActive: true },
        include: {
          items: { where: { isActive: true }, orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }] },
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

  sendHTML(res, 200, generateMenuPage(location, menu, menuError));
  return true;
}

async function handlePublic(req, res, pathname, prisma) {
  if (pathname === '/api/feedback') {
    return handleFeedback(req, res, prisma);
  }

  // Homepage
  if (pathname === '/') {
    const locs = await getLocations(prisma);
    sendHTML(res, 200, generateHomepage(locs));
    return true;
  }

  // Specials page: /{slug}/specials?day=MONDAY
  const specialsMatch = pathname.match(/^\/([a-z0-9-]+)\/specials$/);
  if (specialsMatch) {
    const slug = specialsMatch[1];
    const parsedUrl = url.parse(req.url, true);
    const locs = await getLocations(prisma);
    const location = locs.find((l) => l.slug === slug);
    const resolvedLocation = maybeResolveLocationByGoogleIdentity(locs, slug);
    if (resolvedLocation && resolvedLocation.slug !== slug) {
      redirect(res, `/${resolvedLocation.slug}/specials${parsedUrl.search || ''}`);
      return true;
    }
    if (!location) {
      sendHTML(res, 404, '<h1>Location not found</h1><p><a href="/">Back to locations</a></p>');
      return true;
    }

    return handleSpecials(req, res, prisma, parsedUrl, location);
  }

  // Draft page: /{slug}/draft
  const draftMatch = pathname.match(/^\/([a-z0-9-]+)\/draft$/);
  if (draftMatch) {
    const slug = draftMatch[1];
    const locs = await getLocations(prisma);
    const resolvedLocation = maybeResolveLocationByGoogleIdentity(locs, slug);
    if (resolvedLocation && resolvedLocation.slug !== slug) {
      redirect(res, `/${resolvedLocation.slug}/draft`);
      return true;
    }
    return handleDraft(req, res, prisma, slug);
  }

  // Menu page: /{slug}/menu
  const menuMatch = pathname.match(/^\/([a-z0-9-]+)\/menu$/);
  if (menuMatch) {
    const slug = menuMatch[1];
    const locs = await getLocations(prisma);
    const resolvedLocation = maybeResolveLocationByGoogleIdentity(locs, slug);
    if (resolvedLocation && resolvedLocation.slug !== slug) {
      redirect(res, `/${resolvedLocation.slug}/menu`);
      return true;
    }
    return handleMenu(req, res, prisma, slug);
  }

  // Location page: /{slug}
  if (pathname.length > 1 && !pathname.includes('.') && !pathname.startsWith('/admin')) {
    const slug = pathname.substring(1);
    if (slug.includes('/')) return false;

    const locs = await getLocations(prisma);
    const resolvedLocation = maybeResolveLocationByGoogleIdentity(locs, slug);
    if (resolvedLocation && resolvedLocation.slug !== slug) {
      redirect(res, `/${resolvedLocation.slug}`);
      return true;
    }

    const location = locs.find((l) => l.slug === slug);
    if (location) {
      sendHTML(res, 200, generateLocationPage(location));
      return true;
    }
    sendHTML(res, 404, '<h1>Location not found</h1><p><a href="/">Back to locations</a></p>');
    return true;
  }

  return false;
}

module.exports = { handlePublic };
