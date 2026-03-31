const http = require('http');
const url = require('url');
const { sendHTML } = require('./helpers');

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

// One-time seed: add Snacks category to Cary menu if missing
async function seedCarySnacks() {
  if (!prisma) return;
  try {
    const cary = await prisma.location.findFirst({ where: { slug: 'cary', isActive: true } });
    if (!cary) return;
    const existing = await prisma.menuCategory.findFirst({ where: { locationId: cary.id, name: 'Snacks' } });
    if (existing) return;
    const cats = await prisma.menuCategory.findMany({ where: { locationId: cary.id }, orderBy: { displayOrder: 'desc' }, take: 1 });
    const nextOrder = cats.length > 0 ? cats[0].displayOrder + 1 : 0;
    await prisma.menuCategory.create({
      data: {
        locationId: cary.id,
        name: 'Snacks',
        displayOrder: nextOrder,
        isActive: true,
        items: {
          create: [
            { name: 'Pimento Cheese', price: 10, displayOrder: 0, isAvailable: true },
            { name: 'Antipasto', price: 10, displayOrder: 1, isAvailable: true },
          ],
        },
      },
    });
    console.log('Seeded Cary Snacks menu category.');
  } catch (err) {
    console.warn('Cary snacks seed skipped:', err.message);
  }
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Dram & Draught server running on port ${PORT}`);
  console.log('Ready to serve location pages!');
  seedCarySnacks();
});
