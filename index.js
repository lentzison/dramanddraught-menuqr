const http = require('http');
const url = require('url');
const querystring = require('querystring');
let prisma;
try { prisma = require('./db'); } catch { prisma = null; }

const PORT = parseInt(process.env.PORT || '80', 10);

// Fallback Dram & Draught locations data
const fallbackLocations = [
  {
    name: 'Greensboro',
    slug: 'greensboro',
    city: 'Greensboro',
    state: 'NC',
    address: '300 West Gate City Blvd',
    zipCode: '27406',
    phone: '',
    email: 'greensboro@dramanddraught.com',
    specialText: '300+ Whiskeys | Craft Cocktails | NC Beers',
    hours: {
      monday: '4:00 PM - 12:00 AM',
      tuesday: '4:00 PM - 12:00 AM',
      wednesday: '4:00 PM - 12:00 AM',
      thursday: '4:00 PM - 2:00 AM',
      friday: '4:00 PM - 2:00 AM',
      saturday: '12:00 PM - 2:00 AM',
      sunday: '12:00 PM - 12:00 AM'
    },
    features: ['300+ Whiskeys', 'Craft Cocktails', 'NC Draft Beer', 'Wine Selection', 'Indoor & Outdoor Seating']
  },
  {
    name: 'Raleigh',
    slug: 'raleigh',
    city: 'Raleigh',
    state: 'NC',
    address: '1 Glenwood Avenue, Suite 101',
    zipCode: '27603',
    phone: '',
    email: 'raleigh@dramanddraught.com',
    specialText: 'Glenwood South Location | Happy Hour Daily',
    hours: {
      monday: '3:00 PM - 2:00 AM',
      tuesday: '3:00 PM - 2:00 AM',
      wednesday: '3:00 PM - 2:00 AM',
      thursday: '3:00 PM - 2:00 AM',
      friday: '3:00 PM - 2:00 AM',
      saturday: '12:00 PM - 2:00 AM',
      sunday: '12:00 PM - 12:00 AM'
    },
    features: ['300+ Whiskeys', 'Craft Cocktails', 'NC Draft Beer', 'Wine Selection', 'Late Night']
  },
  {
    name: 'Durham',
    slug: 'durham',
    city: 'Durham',
    state: 'NC',
    address: '701 W. Main Street Suite 123',
    zipCode: '27701',
    phone: '',
    email: 'durham@dramanddraught.com',
    specialText: 'Downtown Durham | Brightleaf Square',
    hours: {
      monday: '3:00 PM - 12:00 AM',
      tuesday: '3:00 PM - 12:00 AM',
      wednesday: '3:00 PM - 12:00 AM',
      thursday: '3:00 PM - 12:00 AM',
      friday: '3:00 PM - 2:00 AM',
      saturday: '12:00 PM - 2:00 AM',
      sunday: '12:00 PM - 12:00 AM'
    },
    features: ['300+ Whiskeys', 'Craft Cocktails', 'NC Draft Beer', 'Wine Selection', 'Historic Location']
  },
  {
    name: 'Winston-Salem',
    slug: 'winston-salem',
    city: 'Winston-Salem',
    state: 'NC',
    address: '486 North Patterson Avenue STE 120',
    zipCode: '27101',
    phone: '',
    email: 'winston@dramanddraught.com',
    specialText: 'Innovation Quarter | Indoor & Outdoor Seating',
    hours: {
      monday: '3:00 PM - 12:00 AM',
      tuesday: '3:00 PM - 12:00 AM',
      wednesday: '3:00 PM - 12:00 AM',
      thursday: '3:00 PM - 2:00 AM',
      friday: '3:00 PM - 2:00 AM',
      saturday: '12:00 PM - 2:00 AM',
      sunday: '12:00 PM - 12:00 AM'
    },
    features: ['300+ Whiskeys', 'Craft Cocktails', 'NC Draft Beer', 'Wine Selection', 'Outdoor Patio']
  },
  {
    name: 'Cary',
    slug: 'cary',
    city: 'Cary',
    state: 'NC',
    address: '3 Fenton Main St',
    zipCode: '27511',
    phone: '',
    email: 'cary@dramanddraught.com',
    specialText: 'Fenton Development | Extended Weekend Hours',
    hours: {
      monday: '4:00 PM - 12:00 AM',
      tuesday: '12:00 PM - 12:00 AM',
      wednesday: '12:00 PM - 12:00 AM',
      thursday: '12:00 PM - 12:00 AM',
      friday: '12:00 PM - 2:00 AM',
      saturday: '12:00 PM - 2:00 AM',
      sunday: '12:00 PM - 11:00 PM'
    },
    features: ['300+ Whiskeys', 'Craft Cocktails', 'NC Draft Beer', 'Wine Selection', 'Family Friendly']
  },
  {
    name: 'Charlotte',
    slug: 'charlotte',
    city: 'Charlotte',
    state: 'NC',
    address: '1220 S Tryon St',
    zipCode: '28203',
    phone: '',
    email: 'charlotte@dramanddraught.com',
    specialText: 'South End Location | Open Late',
    hours: {
      monday: '3:00 PM - 2:00 AM',
      tuesday: '3:00 PM - 2:00 AM',
      wednesday: '3:00 PM - 2:00 AM',
      thursday: '3:00 PM - 2:00 AM',
      friday: '3:00 PM - 2:00 AM',
      saturday: '12:00 PM - 2:00 AM',
      sunday: '12:00 PM - 12:00 AM'
    },
    features: ['300+ Whiskeys', 'Craft Cocktails', 'NC Draft Beer', 'Wine Selection', 'Late Night', 'South End']
  },
  {
    name: 'Wilmington',
    slug: 'wilmington',
    city: 'Wilmington',
    state: 'NC',
    address: '109 Market St',
    zipCode: '28401',
    phone: '',
    email: 'wilmington@dramanddraught.com',
    specialText: 'Historic Downtown | Steps from Riverwalk',
    hours: {
      monday: '2:00 PM - 12:00 AM',
      tuesday: '2:00 PM - 12:00 AM',
      wednesday: '2:00 PM - 12:00 AM',
      thursday: '2:00 PM - 12:00 AM',
      friday: '12:00 PM - 2:00 AM',
      saturday: '12:00 PM - 2:00 AM',
      sunday: '12:00 PM - 12:00 AM'
    },
    features: ['300+ Whiskeys', 'Craft Cocktails', 'NC Draft Beer', 'Wine Selection', 'Historic Downtown', 'Near Riverwalk']
  }
];

// Helper function to send HTML response
function sendHTML(res, statusCode, html) {
  res.writeHead(statusCode, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}

function getDefaultLinks(location) {
  const slug = (location.slug || '').toLowerCase();
  const name = (location.name || '').toLowerCase();
  // Map known locations to spirit URLs
  const spiritUrlsBySlug = {
    'cary': 'https://public.apps.dramanddraught.com/spirits/cary',
    'charlotte': 'https://public.apps.dramanddraught.com/spirits/charlotte',
    'durham': 'https://public.apps.dramanddraught.com/spirits/durham',
    'greensboro': 'https://public.apps.dramanddraught.com/spirits/greensboro',
    'raleigh': 'https://public.apps.dramanddraught.com/spirits/raleigh',
    'wilmington': 'https://public.apps.dramanddraught.com/spirits/wilmington',
    'winston-salem': 'https://public.apps.dramanddraught.com/spirits/winston-salem',
    'winston': 'https://public.apps.dramanddraught.com/spirits/winston-salem',
  };
  const spiritUrlsByName = {
    'cary': 'https://public.apps.dramanddraught.com/spirits/cary',
    'charlotte': 'https://public.apps.dramanddraught.com/spirits/charlotte',
    'durham': 'https://public.apps.dramanddraught.com/spirits/durham',
    'greensboro': 'https://public.apps.dramanddraught.com/spirits/greensboro',
    'raleigh': 'https://public.apps.dramanddraught.com/spirits/raleigh',
    'wilmington': 'https://public.apps.dramanddraught.com/spirits/wilmington',
    'winston-salem': 'https://public.apps.dramanddraught.com/spirits/winston-salem',
    'winston': 'https://public.apps.dramanddraught.com/spirits/winston-salem',
  };
  const menu = spiritUrlsBySlug[slug] || spiritUrlsByName[name] || location.menuUrl || 'https://www.dramanddraught.com/menus/';
  // Only show Spirit List for now
  return [
    { label: 'Spirit List', url: menu },
  ];
}

function getIcon(label) {
  const l = (label || '').toLowerCase();
  if (l.includes('spirit')) return '🥃';
  if (l.includes('cocktail')) return '🍸';
  if (l.includes('event')) return '📅';
  if (l.includes('direction') || l.includes('map')) return '🗺️';
  if (l.includes('call')) return '☎️';
  if (l.includes('email')) return '✉️';
  return '➜';
}

function getLinkButtons(location) {
  // Intentionally ignore custom links; only show Spirit List
  return getDefaultLinks(location || {}).map(l => ({ ...l, icon: getIcon(l.label) }));
}

// Generate location page HTML (Linktree style)
function generateLocationPage(location) {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Dram & Draught ${location.name} - Whiskey Bar & Cocktails</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
          background:
            radial-gradient(1200px 600px at 20% -10%, #1b1c20 0%, transparent 60%),
            radial-gradient(1000px 500px at 110% -20%, #131316 0%, transparent 55%),
            linear-gradient(180deg, #0f0f10 0%, #0b0b0c 100%);
          min-height: 100vh;
        }
        .hero {
          background: #0f0f0f;
          color: #eee;
          border-radius: 0 0 30px 30px;
          box-shadow: 0 10px 40px rgba(0,0,0,0.3);
          padding: 30px 20px;
          text-align: center;
          border-bottom: 2px solid #2a2a2a;
        }
        .hero h1 {
          color: #fff;
          font-size: 3em;
          margin-bottom: 10px;
          background: linear-gradient(135deg, #d4af37, #b87333);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .hero-title { font-size: 3rem; letter-spacing: 0.03em; }
        .hero-subtitle { color: #eee; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 700; font-size: 1.4rem; margin-top: 6px; }
        .divider { width: 120px; height: 2px; margin: 14px auto; background: linear-gradient(90deg, #d4af37, #b87333); opacity: 0.7; border-radius: 2px; }
        .badge {
          display: inline-block;
          color: #d4af37;
          border: 1px solid #d4af37;
          padding: 6px 12px;
          border-radius: 999px;
          letter-spacing: 0.12em;
          font-weight: 700;
          font-size: 0.8em;
          background: rgba(212, 175, 55, 0.08);
          margin-top: 8px;
        }
        .container { max-width: 720px; margin: 0 auto; padding: 20px; }
        .rl-desc {
          color: #a6a6a6;
          max-width: 780px;
          margin: 12px auto 0;
          line-height: 1.6;
        }
        .rl-card { background: #151519; border: 1px solid #26282c; border-radius: 12px; padding: 14px 16px; max-width: 780px; margin: 12px auto 0; color: #bfbfbf; line-height: 1.65; box-shadow: 0 8px 22px rgba(0,0,0,0.35); }
        .rl-card p { margin: 0.4rem 0; }
        .rl-strong { color: #d4af37; font-weight: 700; }
        .linktree { max-width: 640px; margin: 0 auto; }
        .link-btn { display:flex; align-items:center; justify-content:center; gap:10px; text-decoration:none; text-align:center; color:#111; background:linear-gradient(135deg,#d4af37,#b87333); padding:16px 22px; border-radius:14px; font-weight:800; margin:16px 0; box-shadow:0 10px 28px rgba(0,0,0,0.4), inset 0 0 0 1px rgba(212,175,55,0.35); transition:transform .15s ease, filter .15s ease }
        .link-btn:hover { transform: translateY(-2px); filter: saturate(1.05) }
        .icon { font-size: 1.25rem }
        .chips { display:flex; gap:10px; justify-content:center; margin-top:6px }
        .chip { background:#1a1b1f; color:#cfd2d6; border:1px solid #26282c; padding:6px 10px; border-radius:999px; font-size:.85rem }
        .hours-item {
          display: flex;
          justify-content: space-between;
          padding: 10px;
          background: #111;
          border-radius: 8px;
          margin-bottom: 5px;
        }
        .feature-tag {
          display: inline-block;
          background: linear-gradient(135deg, #d4af37, #b87333);
          color: white;
          padding: 8px 16px;
          border-radius: 25px;
          font-size: 0.9em;
          margin: 5px;
        }
        .cta-button {
          display: inline-block;
          background: linear-gradient(135deg, #d4af37, #b87333);
          color: white;
          padding: 12px 30px;
          border-radius: 25px;
          text-decoration: none;
          font-weight: 600;
          margin: 10px 5px;
        }
        .back-link {
          display: inline-block;
          color: #eee;
          text-decoration: none;
          padding: 10px 20px;
          background: rgba(255,255,255,0.1);
          border-radius: 20px;
          margin-bottom: 20px;
        }
      </style>
    </head>
    <body>
      <div class="hero">
        <h1 class="hero-title">Dram & Draught</h1>
        <h2 class="hero-subtitle">${location.name}</h2>
        <div class="divider"></div>
        <div class="badge">REGISTERED LUBRICATION</div>
        <div class="rl-card">
          <p>Our first home was a converted service station, back when a sign for ‘Registered Lubrication’ actually meant you could count on getting quality fluids. We liked the idea, so we kept the name. Only now, instead of motor oil, it’s bourbon in your Old Fashioned and cocktails built to keep the night running smooth.</p>
          <p class="rl-strong">Same promise of quality, just more fun.</p>
        </div>
        <div class="chips">
          ${location.city ? `<span class=\"chip\">${location.city}, ${location.state || 'NC'}</span>` : ''}
          ${location.address ? `<span class=\"chip\">${location.address}</span>` : ''}
        </div>
      </div>
      <div class="container linktree">
        ${getLinkButtons(location).map(l => `<a class="link-btn" href="${l.url}" target="_blank" rel="noopener noreferrer"><span class="icon">${l.icon}</span><span>${l.label}</span></a>`).join('')}
      </div>
    </body>
    </html>
  `;
}

// Generate homepage HTML
function generateHomepage(locs) {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Dram & Draught - Locations in North Carolina</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
          background: linear-gradient(135deg, #0f0f0f 0%, #151515 100%);
          min-height: 100vh;
        }
        .hero {
          background: #0f0f0f;
          color: #eee;
          text-align: center;
          padding: 60px 20px;
          border-radius: 0 0 30px 30px;
          box-shadow: 0 10px 40px rgba(0,0,0,0.3);
          border-bottom: 2px solid #2a2a2a;
        }
        .hero h1 {
          font-size: 3em;
          margin-bottom: 10px;
          background: linear-gradient(135deg, #d4af37, #b87333);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .hero-title { font-size: 3rem; letter-spacing: 0.03em; }
        .divider { width: 120px; height: 2px; margin: 14px auto; background: linear-gradient(90deg, #d4af37, #b87333); opacity: 0.7; border-radius: 2px; }
        .rl-desc {
          color: #a6a6a6;
          max-width: 900px;
          margin: 10px auto 0;
          line-height: 1.6;
        }
        .rl-card { background: #151519; border: 1px solid #26282c; border-radius: 12px; padding: 14px 16px; max-width: 900px; margin: 12px auto 0; color: #bfbfbf; line-height: 1.65; box-shadow: 0 8px 22px rgba(0,0,0,0.35); }
        .rl-card p { margin: 0.4rem 0; }
        .rl-strong { color: #d4af37; font-weight: 700; }
        .badge {
          display: inline-block;
          color: #d4af37;
          border: 1px solid #d4af37;
          padding: 6px 12px;
          border-radius: 999px;
          letter-spacing: 0.12em;
          font-weight: 700;
          font-size: 0.8em;
          background: rgba(212, 175, 55, 0.08);
          margin-top: 8px;
        }
        .container {
          max-width: 1200px;
          margin: 0 auto;
          padding: 40px 20px;
        }
        .locations-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: 25px;
          margin-top: 30px;
        }
        .location-card {
          background: #121212;
          border-radius: 15px;
          padding: 25px;
          box-shadow: 0 10px 30px rgba(0,0,0,0.25);
          text-decoration: none;
          color: #ddd;
          display: block;
          transition: transform 0.3s;
        }
        .location-card:hover {
          transform: translateY(-5px);
        }
        .location-name {
          font-size: 1.5em;
          color: #fff;
          margin-bottom: 10px;
          font-weight: 600;
        }
        .view-location {
          display: inline-block;
          color: #111;
          background: linear-gradient(135deg, #d4af37, #b87333);
          padding: 10px 20px;
          border-radius: 20px;
          font-weight: 500;
          margin-top: 15px;
        }
      </style>
    </head>
    <body>
      <div class="hero">
        <h1 class="hero-title">Dram & Draught</h1>
        <div class="divider"></div>
        <div class="badge">REGISTERED LUBRICATION</div>
        <div class="rl-card">
          <p>Our first home was a converted service station, back when a sign for ‘Registered Lubrication’ actually meant you could count on getting quality fluids. We liked the idea, so we kept the name. Only now, instead of motor oil, it’s bourbon in your Old Fashioned and cocktails built to keep the night running smooth.</p>
          <p class="rl-strong">Same promise of quality, just more fun.</p>
        </div>
      </div>
      <div class="container">
        <div class="locations-grid">
          ${locs.map(loc => `
            <a href="/${loc.slug}" class="location-card">
              <h2 class="location-name">${loc.name}</h2>
              <p style="color: #666; margin-bottom: 8px;">
                ${loc.address}<br>
                ${loc.city}, ${loc.state} ${loc.zipCode}
              </p>
              <p style="color: #d4af37; font-size: 0.9em;">${loc.specialText || ''}</p>
              <span class="view-location">View Location →</span>
            </a>
          `).join('')}
        </div>
      </div>
    </body>
    </html>
  `;
}

async function getLocations() {
  if (prisma) {
    try {
      const locs = await prisma.location.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });
      return locs;
    } catch (e) {
      console.warn('DB unavailable, using fallback locations');
    }
  }
  return fallbackLocations;
}

function unauthorized(res) {
  res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="Admin"', 'Content-Type': 'text/plain' });
  res.end('Unauthorized');
}

function isAdmin(req) {
  const user = process.env.ADMIN_USER || 'admin';
  const pass = process.env.ADMIN_PASS || '';
  const hdr = req.headers['authorization'] || '';
  if (!hdr.startsWith('Basic ')) return false;
  const b64 = hdr.slice(6);
  try {
    const [u, p] = Buffer.from(b64, 'base64').toString('utf8').split(':');
    return u === user && p === pass;
  } catch {
    return false;
  }
}

function parseBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => {
      const ct = req.headers['content-type'] || '';
      if (ct.includes('application/x-www-form-urlencoded')) return resolve(querystring.parse(data));
      if (ct.includes('application/json')) {
        try { return resolve(JSON.parse(data || '{}')); } catch { return resolve({}); }
      }
      resolve({ raw: data });
    });
  });
}

const handler = async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  console.log(`Request: ${pathname}`);

  try {
    // Admin routes
    if (pathname === '/admin') {
      if (!isAdmin(req)) return unauthorized(res);
      const locs = await getLocations();
      const list = locs.map(l => `<li><a href="/admin/location/${l.slug}">${l.name}</a></li>`).join('');
      return sendHTML(res, 200, `<h1>Admin: Locations</h1><p><a href="/admin/seed">Seed default locations</a></p><ul>${list}</ul>`);
    }
    if (pathname === '/admin/seed') {
      if (!isAdmin(req)) return unauthorized(res);
      if (!prisma) return sendHTML(res, 500, '<p>DB not available</p>');
      // Upsert fallback locations
      for (const l of fallbackLocations) {
        await prisma.location.upsert({
          where: { slug: l.slug },
          update: {
            name: l.name,
            city: l.city,
            state: l.state,
            address: l.address || null,
            zipCode: l.zipCode || null,
            phone: l.phone || null,
            email: l.email || null,
            specialText: l.specialText || null,
            hours: l.hours || {},
            features: l.features || [],
            isActive: true,
          },
          create: {
            name: l.name,
            slug: l.slug,
            city: l.city,
            state: l.state,
            address: l.address || null,
            zipCode: l.zipCode || null,
            phone: l.phone || null,
            email: l.email || null,
            specialText: l.specialText || null,
            hours: l.hours || {},
            features: l.features || [],
            isActive: true,
          }
        });
      }
      return sendHTML(res, 200, '<p>Seed complete ✅</p><p><a href="/admin">Back to Admin</a></p>');
    }
    if (pathname.startsWith('/admin/location/')) {
      if (!isAdmin(req)) return unauthorized(res);
      const slug = pathname.split('/').pop();
      let loc = null;
      if (prisma) {
        loc = await prisma.location.findUnique({ where: { slug } }).catch(() => null);
      }
      if (!loc) return sendHTML(res, 404, '<h1>Not found</h1>');
      if (req.method === 'POST') {
        const body = await parseBody(req);
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
            hours: (() => { try { return JSON.parse(body.hours || '{}'); } catch { return loc.hours; } })(),
            links: (() => { try { return JSON.parse(body.links || '[]'); } catch { return loc.links; } })(),
          }
        });
        return sendHTML(res, 200, `<p>Saved ✅</p><p><a href="/admin/location/${slug}">Back</a> | <a href="/${slug}">View</a></p>`);
      }
      const form = `
        <h1>Edit ${loc.name}</h1>
        <form method="POST">
          <label>Name <input name="name" value="${loc.name}" /></label><br/>
          <label>Slug <input name="slug" value="${loc.slug}" disabled /></label><br/>
          <label>Address <input name="address" value="${loc.address || ''}" /></label><br/>
          <label>City <input name="city" value="${loc.city}" /></label><br/>
          <label>State <input name="state" value="${loc.state}" /></label><br/>
          <label>Zip <input name="zipCode" value="${loc.zipCode || ''}" /></label><br/>
          <label>Email <input name="email" value="${loc.email || ''}" /></label><br/>
          <label>Phone <input name="phone" value="${loc.phone || ''}" /></label><br/>
          <label>Special Text <input name="specialText" value="${loc.specialText || ''}" /></label><br/>
          <label>Menu URL <input name="menuUrl" value="${loc.menuUrl || ''}" /></label><br/>
          <label>Features (comma-separated)<br/>
            <input name="features" value="${(loc.features || []).join(', ')}" />
          </label><br/>
          <label>Link Buttons (JSON array of {label,url})<br/>
            <textarea name="links" rows="10" cols="80">${JSON.stringify(loc.links || [], null, 2)}</textarea>
          </label><br/>
          <label>Hours (JSON)<br/>
            <textarea name="hours" rows="8" cols="60">${JSON.stringify(loc.hours || {}, null, 2)}</textarea>
          </label><br/>
          <button type="submit">Save</button>
        </form>
        <p><a href="/admin">← Back to list</a></p>
      `;
      return sendHTML(res, 200, form);
    }

    // Public pages
    if (pathname === '/') {
      const locs = await getLocations();
      return sendHTML(res, 200, generateHomepage(locs));
    }
    if (pathname.startsWith('/') && pathname.length > 1 && !pathname.includes('.')) {
      const slug = pathname.substring(1);
      const locs = await getLocations();
      const location = locs.find(l => l.slug === slug);
      if (location) return sendHTML(res, 200, generateLocationPage(location));
      return sendHTML(res, 404, '<h1>Location not found</h1><p><a href="/">← Back to locations</a></p>');
    }
    return sendHTML(res, 404, '<h1>Page not found</h1><p><a href="/">← Back to home</a></p>');
  } catch (error) {
    console.error('Error:', error);
    sendHTML(res, 500, '<h1>Server Error</h1><p>Please try again later.</p>');
  }
};

// Main listener on PORT only (CapRover sets PORT)
const server = http.createServer((req, res) => {
  Promise.resolve(handler(req, res)).catch((err) => {
    console.error('Unhandled error:', err);
    try { sendHTML(res, 500, '<h1>Server Error</h1>'); } catch {}
  });
});
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Dram & Draught server running on port ${PORT}`);
  console.log('Ready to serve location pages!');
});
