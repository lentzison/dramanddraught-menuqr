const http = require('http');
const url = require('url');
const { sendHTML, sendEmailViaGoogle } = require('./helpers');

let prisma;
try { prisma = require('./db'); } catch { prisma = null; }

const { handlePublic } = require('./routes/public');
const { handleAdmin } = require('./routes/admin');
const { handleAdminSpecials } = require('./routes/adminSpecials');

const PORT = parseInt(process.env.PORT || '80', 10);

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

const handler = async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  console.log(`${req.method} ${pathname}`);

  try {
    // Admin specials routes (session auth): /admin/specials/*, /admin/flights/*, /admin/bottles/*
    if (pathname.startsWith('/admin/specials') || pathname.startsWith('/admin/flights') || pathname.startsWith('/admin/bottles') || pathname.startsWith('/admin/feedback')) {
      if (prisma && await handleAdminSpecials(req, res, pathname, prisma)) return;
    }

    // Admin routes: /admin/login, /admin/logout, /admin, /admin/seed, /admin/location/*
    if (pathname.startsWith('/admin')) {
      if (await handleAdmin(req, res, pathname, prisma)) return;
    }

    // Public routes: /, /{slug}, /{slug}/specials
    if (await handlePublic(req, res, pathname, prisma)) return;

    sendHTML(res, 404, '<h1>Page not found</h1><p><a href="/">Back to home</a></p>');
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

// One-time seed: add Snacks category to locations if missing
const SNACKS_SEED = {
  cary: [
    { name: 'Pimento Cheese', price: 10, displayOrder: 0 },
    { name: 'Antipasto', price: 10, displayOrder: 1 },
  ],
  durham: [
    { name: 'Sopressata & Cheddar Snack Tray', description: 'Sopressata salami, sharp cheddar & crackers', price: 10, displayOrder: 0 },
    { name: 'San Carlo Chips, Lime & Pink Pepper', description: 'Italian-style kettle chips with lime and pink peppercorn', price: 10, displayOrder: 1 },
  ],
  raleigh: [
    { name: 'Sopressata & Cheddar Snack Tray', description: 'Sopressata salami, sharp cheddar & crackers', price: 10, displayOrder: 0 },
    { name: 'San Carlo Chips, Lime & Pink Pepper', description: 'Italian-style kettle chips with lime and pink peppercorn', price: 10, displayOrder: 1 },
  ],
};

async function seedSnacks() {
  if (!prisma) return;
  for (const [slug, items] of Object.entries(SNACKS_SEED)) {
    try {
      const loc = await prisma.location.findFirst({ where: { slug, isActive: true } });
      if (!loc) continue;
      const existing = await prisma.menuCategory.findFirst({ where: { locationId: loc.id, name: 'Snacks' } });
      if (existing) continue;
      const cats = await prisma.menuCategory.findMany({ where: { locationId: loc.id }, orderBy: { displayOrder: 'desc' }, take: 1 });
      const nextOrder = cats.length > 0 ? cats[0].displayOrder + 1 : 0;
      await prisma.menuCategory.create({
        data: {
          locationId: loc.id,
          name: 'Snacks',
          displayOrder: nextOrder,
          isActive: true,
          items: { create: items.map(i => ({ ...i, isAvailable: true })) },
        },
      });
      console.log(`Seeded ${slug} Snacks menu category.`);
    } catch (err) {
      console.warn(`${slug} snacks seed skipped:`, err.message);
    }
  }
}

const GIFT_CARD_RECIPIENTS = [
  'carrie@dramanddraught.com',
  'lexi@dramanddraught.com',
  'lentz@dramanddraught.com',
];

// Monthly gift card drawing — runs on startup, picks a winner for the previous month
async function runGiftCardDrawing() {
  if (!prisma) return;
  try {
    // Determine previous month
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
    let drawMonth = now.getMonth(); // 0-indexed, so this is previous month (current - 1)
    let drawYear = now.getFullYear();
    if (drawMonth === 0) { drawMonth = 12; drawYear -= 1; } // January -> draw for December

    // Only run after the 1st of the new month, skip if too early in the month
    if (now.getDate() > 7) {
      // Also check current month hasn't been drawn yet (in case server restarts mid-month)
    }

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

    // Get all opted-in feedback entries from that month with valid emails
    const startDate = new Date(drawYear, drawMonth - 1, 1); // month is 0-indexed in Date
    const endDate = new Date(drawMonth === 12 ? drawYear + 1 : drawYear, drawMonth === 12 ? 0 : drawMonth, 1);

    const entries = await prisma.guestFeedback.findMany({
      where: {
        giftCardOptIn: true,
        guestEmail: { not: null },
        createdAt: { gte: startDate, lt: endDate },
      },
      select: { id: true, guestName: true, guestEmail: true, locationName: true, rating: true },
    });

    if (entries.length === 0) {
      console.log(`No gift card entries for ${drawMonth}/${drawYear}.`);
      return;
    }

    // Pick random winner
    const winner = entries[Math.floor(Math.random() * entries.length)];
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
      `Total entries this month: ${entries.length}`,
      '',
      '--- ACTION REQUIRED ---',
      '',
      '1. Send a $100 Dram & Draught gift card to the winner at the email above',
      '2. Include a congratulations message letting them know they won the monthly drawing',
      '3. Reply-all to this email confirming the gift card has been sent',
      '',
      'Thank you!',
    ].join('\n');

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

// TEMPORARY: test gift card winner email — remove after confirming
async function testGiftCardEmail() {
  try {
    const emailBody = [
      'MONTHLY $100 GIFT CARD DRAWING - MARCH 2026',
      '',
      'Winner: Lentz',
      'Email: lentzison@gmail.com',
      'Location: Raleigh',
      'Rating given: 5/5',
      'Total entries this month: 42',
      '',
      '--- ACTION REQUIRED ---',
      '',
      '1. Send a $100 Dram & Draught gift card to the winner at the email above',
      '2. Include a congratulations message letting them know they won the monthly drawing',
      '3. Reply-all to this email confirming the gift card has been sent',
      '',
      'Thank you!',
    ].join('\n');

    const result = await sendEmailViaGoogle({
      to: GIFT_CARD_RECIPIENTS,
      subject: 'Gift Card Winner - March 2026: Lentz (TEST)',
      body: emailBody,
    });
    console.log('Test gift card email result:', result);
  } catch (err) {
    console.error('Test gift card email error:', err.message);
  }
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Dram & Draught server running on port ${PORT}`);
  console.log('Ready to serve location pages!');
  seedSnacks();
  runGiftCardDrawing();
  testGiftCardEmail();
});
