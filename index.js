const http = require('http');
const url = require('url');
const { getBrand } = require('./brand');
const { sendHTML, sendEmailViaGoogle, getLocations } = require('./helpers');

let prisma;
try { prisma = require('./db'); } catch { prisma = null; }

const { handlePublic } = require('./routes/public');
const { handleAdmin } = require('./routes/admin');
const { handleAdminSpecials } = require('./routes/adminSpecials');
const { handleAdminMenu } = require('./routes/adminMenu');
const { handleAdminEvents } = require('./routes/adminEvents');
const { handleAdminApplicants } = require('./routes/adminApplicants');
const { handleAdminLtos } = require('./routes/adminLtos');
const { handleAdminTv } = require('./routes/adminTv');
const { scheduleInterviewReminders } = require('./interviewReminders');
const { scheduleEventReminders } = require('./eventReminders');
const { scheduleEventRollovers } = require('./eventRollover');
const { scheduleScreeningRetry } = require('./screeningRetry');
const { scheduleApplicantDailyRecap } = require('./applicantDailyRecap');
const { scheduleQuestionnaireReminders } = require('./questionnaireReminders');
const { scheduleDataRetention } = require('./dataRetention');
const { generateNotFoundPage } = require('./views/notFoundPage');

const PORT = parseInt(process.env.PORT || '80', 10);

// Node 20 kills the process on an unhandled promise rejection. The background
// schedulers below are fire-and-forget, so a single transient failure inside
// one (a Prisma pool timeout, a Gmail 5xx) used to take the whole site down —
// that is what caused the repeated crashes on Aug 5-6 2026. A rejected
// background promise is never worth dropping the server for: log it loudly
// and keep serving.
process.on('unhandledRejection', (err) => {
  console.error('[unhandledRejection]', err && err.stack ? err.stack : err);
});

// An uncaught exception leaves the process in an undefined state, so here we
// do exit — but deliberately and with a stack trace in the log, so the
// container restarts clean instead of wedging.
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err && err.stack ? err.stack : err);
  process.exit(1);
});

function sendSafeServerError(res) {
  if (!res || res.writableEnded) return;
  if (res.headersSent) {
    try {
      res.end();
    } catch {}
    return;
  }
  sendHTML(res, 500, '<h1>Server Error</h1><p>Please try again later.</p>');
}

const { setSessionStore, hydrateSession } = require('./auth');
if (prisma) setSessionStore(prisma);

const handler = async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  // Liveness probe for the Docker HEALTHCHECK. Answered before logging so the
  // every-30s poll doesn't drown the request log. Reaching this line at all
  // proves the event loop is still turning, which is the failure this guards
  // against: a wedged process keeps its container "running", so Swarm never
  // replaces it and the site 502s until someone redeploys by hand.
  if (pathname === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok');
    return;
  }

  console.log(`${req.method} ${pathname}`);

  try {
    // Sessions are DB-backed so deploys don't log admins out; pull this
    // request's session into the in-memory store before any route runs.
    if (pathname.startsWith('/admin')) await hydrateSession(req);

    // Admin specials routes (session auth): /admin/specials/*, /admin/bottles/*
    if (pathname.startsWith('/admin/specials') || pathname.startsWith('/admin/bottles') || pathname.startsWith('/admin/feedback') || pathname.startsWith('/admin/analytics') || pathname.startsWith('/admin/spirit-list')) {
      if (prisma && await handleAdminSpecials(req, res, pathname, prisma)) return;
    }

    // Admin food menu routes: /admin/menu, /admin/menu/:slug
    if (pathname.startsWith('/admin/menu')) {
      if (await handleAdminMenu(req, res, pathname, prisma)) return;
    }

    // Admin events routes: /admin/events, /admin/events/new, /admin/events/:id, /admin/events/:id/signups
    if (pathname.startsWith('/admin/events')) {
      if (await handleAdminEvents(req, res, pathname, prisma)) return;
    }

    // Admin applicants routes: /admin/applicants, /admin/applicants/:id, status changes, interviews
    if (pathname.startsWith('/admin/applicants')) {
      if (await handleAdminApplicants(req, res, pathname, prisma)) return;
    }

    // Admin LTO routes: /admin/ltos, /admin/ltos/new, /admin/ltos/:id
    if (pathname.startsWith('/admin/ltos')) {
      if (await handleAdminLtos(req, res, pathname, prisma)) return;
    }

    // Admin TV board routes: /admin/tv, /admin/tv/new, /admin/tv/:id
    if (pathname.startsWith('/admin/tv')) {
      if (await handleAdminTv(req, res, pathname, prisma)) return;
    }

    // Admin routes: /admin/login, /admin/logout, /admin, /admin/seed, /admin/locations/*
    if (pathname.startsWith('/admin')) {
      if (await handleAdmin(req, res, pathname, prisma)) return;
    }

    // Public routes: /, /{slug}, /{slug}/specials
    if (await handlePublic(req, res, pathname, prisma)) return;

    // Branded 404 for public paths (admin gets a plain 404 to avoid leaking nav)
    if (pathname.startsWith('/admin')) {
      sendHTML(res, 404, '<h1>Page not found</h1><p><a href="/admin">Back to admin</a></p>');
    } else {
      const locations = await getLocations(prisma).catch(() => []);
      sendHTML(res, 404, generateNotFoundPage({ locations, requestedPath: pathname }));
    }
  } catch (error) {
    console.error('Error:', error);
    sendSafeServerError(res);
  }
};

const server = http.createServer((req, res) => {
  Promise.resolve(handler(req, res)).catch((err) => {
    console.error('Unhandled error:', err);
    sendSafeServerError(res);
  });
});

const GIFT_CARD_RECIPIENTS =
    [
  `carrie@${getBrand().contact.emailDomain}`,
  `lexi@${getBrand().contact.emailDomain}`,
  `lentz@${getBrand().contact.emailDomain}`,
];

// Monthly gift card drawing — runs on the 15th, picks a winner from the previous month
// Never picks the same person (by email) twice
async function runGiftCardDrawing() {
  if (!prisma) return;
  try {
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));

    // Only run on or after the 15th
    if (now.getDate() < 15) {
      console.log('Gift card drawing: waiting until the 15th.');
      return;
    }

    // Draw for the previous month
    let drawMonth = now.getMonth(); // 0-indexed current month, so this = previous month (1-indexed)
    let drawYear = now.getFullYear();
    if (drawMonth === 0) { drawMonth = 12; drawYear -= 1; }

    // Check if drawing already done for that month
    if (prisma.giftCardDrawing) {
      const existing = await prisma.giftCardDrawing.findFirst({
        where: { month: drawMonth, year: drawYear },
      });
      if (existing) {
        console.log(`Gift card drawing already done for ${drawMonth}/${drawYear}: ${existing.winnerEmail}`);
        return;
      }
    }

    // Get all past winner emails to exclude them
    let pastWinnerEmails = [];
    if (prisma.giftCardDrawing) {
      const pastWinners = await prisma.giftCardDrawing.findMany({
        select: { winnerEmail: true },
      });
      pastWinnerEmails = pastWinners.map(w => w.winnerEmail.toLowerCase());
    }

    // Get all opted-in feedback entries from that month with valid emails
    const startDate = new Date(drawYear, drawMonth - 1, 1);
    const endDate = new Date(drawMonth === 12 ? drawYear + 1 : drawYear, drawMonth === 12 ? 0 : drawMonth, 1);

    const entries = await prisma.guestFeedback.findMany({
      where: {
        giftCardOptIn: true,
        guestEmail: { not: null },
        createdAt: { gte: startDate, lt: endDate },
      },
      select: { id: true, guestName: true, guestEmail: true, locationName: true, rating: true },
    });

    // Filter out past winners
    const eligible = entries.filter(e => e.guestEmail && !pastWinnerEmails.includes(e.guestEmail.toLowerCase()));

    if (eligible.length === 0) {
      console.log(`No eligible gift card entries for ${drawMonth}/${drawYear} (${entries.length} total, ${entries.length - eligible.length} past winners excluded).`);
      return;
    }

    // Pick random winner
    const winner = eligible[Math.floor(Math.random() * eligible.length)];
    const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const monthLabel = monthNames[drawMonth - 1] + ' ' + drawYear;

    // Save drawing result
    if (prisma.giftCardDrawing) {
      await prisma.giftCardDrawing.create({
        data: {
          month: drawMonth,
          year: drawYear,
          winnerId: winner.id,
          winnerName: winner.guestName || null,
          winnerEmail: winner.guestEmail,
          locationName: winner.locationName || null,
        },
      });
    }

    // Email staff
    const emailBody = [
      `MONTHLY $100 GIFT CARD DRAWING - ${monthLabel.toUpperCase()}`,
      '',
      `Winner: ${winner.guestName || 'Guest'}`,
      `Email: ${winner.guestEmail}`,
      `Location: ${winner.locationName || 'N/A'}`,
      `Rating given: ${winner.rating}/5`,
      `Eligible entries: ${eligible.length}`,
      `Total entries: ${entries.length}`,
      pastWinnerEmails.length > 0 ? `Past winners excluded: ${entries.length - eligible.length}` : '',
      '',
      '--- ACTION REQUIRED ---',
      '',
      `1. Send a $100 ${getBrand().identity.name} gift card to the winner at the email above`,
      '2. Include a congratulations message letting them know they won the monthly drawing',
      '3. Reply-all to this email confirming the gift card has been sent',
      '',
      'Thank you!',
    ].filter(Boolean).join('\n');

    await sendEmailViaGoogle({
      to: GIFT_CARD_RECIPIENTS,
      subject: `Gift Card Winner - ${monthLabel}: ${winner.guestName || winner.guestEmail}`,
      body: emailBody,
    });

    console.log(`Gift card drawing complete for ${monthLabel}: ${winner.guestEmail}`);
  } catch (err) {
    console.warn('Gift card drawing error:', err.message);
  }
}

// Check for gift card drawing every hour so it fires reliably on the 15th
function scheduleGiftCardDrawing() {
  const guard = (err) =>
    console.error('[gift-card-drawing] run failed:', err && err.stack ? err.stack : err);
  runGiftCardDrawing().catch(guard);
  setInterval(() => {
    runGiftCardDrawing().catch(guard);
  }, 60 * 60 * 1000); // every hour
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`${getBrand().identity.name} server running on port ${PORT}`);
  console.log('Ready to serve location pages!');
  scheduleGiftCardDrawing();
  scheduleInterviewReminders(prisma);
  scheduleEventReminders(prisma);
  scheduleEventRollovers(prisma);
  scheduleApplicantDailyRecap(prisma);
  scheduleQuestionnaireReminders(prisma);
  scheduleScreeningRetry(prisma);
  scheduleDataRetention(prisma);
});
