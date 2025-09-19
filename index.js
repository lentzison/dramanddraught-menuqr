const http = require('http');
const url = require('url');
require('dotenv').config();

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const PORT = process.env.PORT || 3000;

// Helper function to send JSON response
function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(JSON.stringify(data));
}

// Helper function to send HTML response
function sendHTML(res, statusCode, html) {
  res.writeHead(statusCode, { 'Content-Type': 'text/html' });
  res.end(html);
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  try {
    // Homepage
    if (pathname === '/') {
      const locations = await prisma.location.findMany({
        where: { isActive: true },
        orderBy: { name: 'asc' }
      });

      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>MenuQR - Locations</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            h1 { color: #333; }
            .locations { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 20px; }
            .location { border: 1px solid #ddd; padding: 15px; border-radius: 8px; }
            .location h2 { margin-top: 0; color: #555; }
            .location a { color: #0066cc; text-decoration: none; }
            .location a:hover { text-decoration: underline; }
          </style>
        </head>
        <body>
          <h1>MenuQR Locations</h1>
          <div class="locations">
            ${locations.map(loc => `
              <div class="location">
                <h2>${loc.name}</h2>
                <p>${loc.address || ''}<br>${loc.city}, ${loc.state} ${loc.zipCode || ''}</p>
                <p>📞 ${loc.phone || 'N/A'}</p>
                <a href="/${loc.slug}">View Location →</a>
              </div>
            `).join('')}
          </div>
        </body>
        </html>
      `;
      sendHTML(res, 200, html);
    }
    // API endpoint for all locations
    else if (pathname === '/api/locations') {
      const locations = await prisma.location.findMany({
        where: { isActive: true },
        orderBy: { name: 'asc' }
      });
      sendJSON(res, 200, { success: true, data: locations });
    }
    // Individual location pages
    else if (pathname.startsWith('/') && pathname.length > 1) {
      const slug = pathname.substring(1);
      const location = await prisma.location.findUnique({
        where: { slug },
        include: {
          menuCategories: {
            where: { isActive: true },
            orderBy: { displayOrder: 'asc' },
            include: {
              items: {
                where: { isAvailable: true },
                orderBy: { displayOrder: 'asc' }
              }
            }
          },
          events: {
            where: {
              isActive: true,
              startDate: { gte: new Date() }
            },
            orderBy: { startDate: 'asc' }
          }
        }
      });

      if (!location) {
        sendHTML(res, 404, '<h1>Location not found</h1>');
        return;
      }

      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>${location.name} - MenuQR</title>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
            .container { max-width: 800px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; }
            h1 { color: #333; margin-bottom: 10px; }
            .info { background: #f0f0f0; padding: 15px; border-radius: 5px; margin: 20px 0; }
            .hours { background: #fff; border: 1px solid #ddd; padding: 10px; border-radius: 5px; }
            .features { display: flex; flex-wrap: wrap; gap: 10px; margin: 15px 0; }
            .feature { background: #e3f2fd; padding: 5px 10px; border-radius: 15px; font-size: 14px; }
            .menu-category { margin: 20px 0; }
            .menu-category h3 { color: #555; border-bottom: 2px solid #eee; padding-bottom: 5px; }
            .menu-item { padding: 10px; border-bottom: 1px solid #eee; }
            .menu-item:last-child { border-bottom: none; }
            .price { float: right; color: #0066cc; font-weight: bold; }
            .back-link { display: inline-block; margin-bottom: 20px; color: #0066cc; text-decoration: none; }
          </style>
        </head>
        <body>
          <div class="container">
            <a href="/" class="back-link">← All Locations</a>
            <h1>${location.name}</h1>

            <div class="info">
              <p><strong>Address:</strong> ${location.address || ''}, ${location.city}, ${location.state} ${location.zipCode || ''}</p>
              ${location.phone ? `<p><strong>Phone:</strong> ${location.phone}</p>` : ''}
              ${location.email ? `<p><strong>Email:</strong> ${location.email}</p>` : ''}
              ${location.specialText ? `<p><strong>Special:</strong> ${location.specialText}</p>` : ''}
            </div>

            ${location.hours ? `
              <div class="hours">
                <h3>Hours</h3>
                ${Object.entries(location.hours).map(([day, hours]) =>
                  `<p><strong>${day.charAt(0).toUpperCase() + day.slice(1)}:</strong> ${hours}</p>`
                ).join('')}
              </div>
            ` : ''}

            ${location.features && location.features.length > 0 ? `
              <div class="features">
                ${location.features.map(f => `<span class="feature">${f}</span>`).join('')}
              </div>
            ` : ''}

            ${location.menuCategories && location.menuCategories.length > 0 ? `
              <h2>Menu</h2>
              ${location.menuCategories.map(cat => `
                <div class="menu-category">
                  <h3>${cat.name}</h3>
                  ${cat.description ? `<p>${cat.description}</p>` : ''}
                  ${cat.items.map(item => `
                    <div class="menu-item">
                      ${item.price ? `<span class="price">$${item.price}</span>` : ''}
                      <strong>${item.name}</strong>
                      ${item.description ? `<br><small>${item.description}</small>` : ''}
                    </div>
                  `).join('')}
                </div>
              `).join('')}
            ` : ''}

            ${location.events && location.events.length > 0 ? `
              <h2>Upcoming Events</h2>
              ${location.events.map(event => `
                <div class="menu-item">
                  <strong>${event.title}</strong>
                  <br><small>${new Date(event.startDate).toLocaleDateString()}</small>
                  ${event.description ? `<br>${event.description}` : ''}
                </div>
              `).join('')}
            ` : ''}
          </div>
        </body>
        </html>
      `;
      sendHTML(res, 200, html);
    }
    else {
      sendHTML(res, 404, '<h1>Page not found</h1>');
    }
  } catch (error) {
    console.error('Error:', error);
    sendHTML(res, 500, '<h1>Internal Server Error</h1>');
  }
});

server.listen(PORT, () => {
  console.log(`MenuQR server running on port ${PORT}`);
});