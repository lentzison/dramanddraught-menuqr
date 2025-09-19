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
  res.writeHead(statusCode, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}

// Generate location page HTML
function generateLocationPage(location) {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${location.name} - MenuQR</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }

        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          min-height: 100vh;
        }

        .hero {
          background: white;
          border-radius: 0 0 30px 30px;
          box-shadow: 0 10px 40px rgba(0,0,0,0.1);
          padding: 30px 20px;
          text-align: center;
        }

        .hero h1 {
          color: #333;
          font-size: 2.5em;
          margin-bottom: 10px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .hero .tagline {
          color: #666;
          font-size: 1.1em;
          margin-bottom: 20px;
        }

        .container {
          max-width: 800px;
          margin: 0 auto;
          padding: 20px;
        }

        .card {
          background: white;
          border-radius: 15px;
          padding: 20px;
          margin-bottom: 20px;
          box-shadow: 0 5px 20px rgba(0,0,0,0.1);
        }

        .card h2 {
          color: #333;
          margin-bottom: 15px;
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .info-grid {
          display: grid;
          gap: 15px;
        }

        .info-item {
          display: flex;
          align-items: flex-start;
          gap: 10px;
        }

        .info-item .icon {
          font-size: 1.2em;
          margin-top: 2px;
        }

        .info-item .content {
          flex: 1;
        }

        .info-item .label {
          font-weight: 600;
          color: #555;
          margin-bottom: 3px;
        }

        .features {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          margin-top: 10px;
        }

        .feature-tag {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          padding: 8px 16px;
          border-radius: 25px;
          font-size: 0.9em;
        }

        .hours-grid {
          display: grid;
          gap: 10px;
        }

        .hours-item {
          display: flex;
          justify-content: space-between;
          padding: 10px;
          background: #f8f9fa;
          border-radius: 8px;
        }

        .hours-item .day {
          font-weight: 600;
          color: #555;
        }

        .hours-item .time {
          color: #666;
        }

        .menu-category {
          margin-bottom: 25px;
        }

        .menu-category h3 {
          color: #555;
          margin-bottom: 15px;
          padding-bottom: 8px;
          border-bottom: 2px solid #eee;
        }

        .menu-item {
          display: flex;
          justify-content: space-between;
          align-items: start;
          padding: 12px;
          margin-bottom: 8px;
          background: #f8f9fa;
          border-radius: 8px;
          transition: transform 0.2s;
        }

        .menu-item:hover {
          transform: translateX(5px);
        }

        .menu-item-info {
          flex: 1;
        }

        .menu-item-name {
          font-weight: 600;
          color: #333;
          margin-bottom: 3px;
        }

        .menu-item-desc {
          font-size: 0.9em;
          color: #666;
        }

        .menu-item-price {
          color: #667eea;
          font-weight: 700;
          font-size: 1.1em;
        }

        .event {
          padding: 15px;
          background: linear-gradient(135deg, rgba(102,126,234,0.1) 0%, rgba(118,75,162,0.1) 100%);
          border-radius: 10px;
          margin-bottom: 10px;
        }

        .event-title {
          font-weight: 600;
          color: #333;
          margin-bottom: 5px;
        }

        .event-date {
          color: #667eea;
          font-size: 0.9em;
          margin-bottom: 5px;
        }

        .event-desc {
          color: #666;
          font-size: 0.95em;
        }

        .social-links {
          display: flex;
          gap: 15px;
          justify-content: center;
          margin-top: 15px;
        }

        .social-link {
          display: inline-flex;
          width: 40px;
          height: 40px;
          align-items: center;
          justify-content: center;
          background: #f0f0f0;
          border-radius: 50%;
          text-decoration: none;
          transition: all 0.3s;
        }

        .social-link:hover {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          transform: scale(1.1);
        }

        .cta-button {
          display: inline-block;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          padding: 12px 30px;
          border-radius: 25px;
          text-decoration: none;
          font-weight: 600;
          margin: 10px 5px;
          transition: transform 0.2s;
        }

        .cta-button:hover {
          transform: scale(1.05);
        }

        .back-link {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          color: white;
          text-decoration: none;
          padding: 10px 20px;
          background: rgba(255,255,255,0.2);
          border-radius: 20px;
          margin-bottom: 20px;
          transition: all 0.3s;
        }

        .back-link:hover {
          background: rgba(255,255,255,0.3);
        }

        @media (max-width: 600px) {
          .hero h1 { font-size: 2em; }
          .container { padding: 15px; }
        }
      </style>
    </head>
    <body>
      <div class="hero">
        <h1>📍 ${location.name}</h1>
        <p class="tagline">Welcome to Our ${location.city} Location</p>
        ${location.specialText ? `<p style="color: #764ba2; font-weight: 600; margin-top: 10px;">🎉 ${location.specialText}</p>` : ''}
      </div>

      <div class="container">
        <a href="/" class="back-link">← View All Locations</a>

        <!-- Contact Information -->
        <div class="card">
          <h2>📍 Visit Us</h2>
          <div class="info-grid">
            <div class="info-item">
              <span class="icon">🏢</span>
              <div class="content">
                <div class="label">Address</div>
                <div>${location.address || 'Coming Soon'}</div>
                <div>${location.city}, ${location.state} ${location.zipCode || ''}</div>
              </div>
            </div>

            ${location.phone ? `
              <div class="info-item">
                <span class="icon">📞</span>
                <div class="content">
                  <div class="label">Phone</div>
                  <div><a href="tel:${location.phone.replace(/[^0-9]/g, '')}" style="color: #667eea; text-decoration: none;">${location.phone}</a></div>
                </div>
              </div>
            ` : ''}

            ${location.email ? `
              <div class="info-item">
                <span class="icon">✉️</span>
                <div class="content">
                  <div class="label">Email</div>
                  <div><a href="mailto:${location.email}" style="color: #667eea; text-decoration: none;">${location.email}</a></div>
                </div>
              </div>
            ` : ''}
          </div>

          ${location.features && location.features.length > 0 ? `
            <div style="margin-top: 20px;">
              <div class="label" style="margin-bottom: 10px;">Features & Amenities</div>
              <div class="features">
                ${location.features.map(f => `<span class="feature-tag">${f}</span>`).join('')}
              </div>
            </div>
          ` : ''}
        </div>

        <!-- Hours -->
        ${location.hours ? `
          <div class="card">
            <h2>🕐 Hours of Operation</h2>
            <div class="hours-grid">
              ${Object.entries(location.hours).map(([day, hours]) => `
                <div class="hours-item">
                  <span class="day">${day.charAt(0).toUpperCase() + day.slice(1)}</span>
                  <span class="time">${hours}</span>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}

        <!-- Menu -->
        ${location.menuCategories && location.menuCategories.length > 0 ? `
          <div class="card">
            <h2>🍽️ Menu</h2>
            ${location.menuCategories.map(cat => `
              <div class="menu-category">
                <h3>${cat.name}</h3>
                ${cat.description ? `<p style="color: #666; margin-bottom: 15px;">${cat.description}</p>` : ''}
                ${cat.items.map(item => `
                  <div class="menu-item">
                    <div class="menu-item-info">
                      <div class="menu-item-name">${item.name}</div>
                      ${item.description ? `<div class="menu-item-desc">${item.description}</div>` : ''}
                    </div>
                    ${item.price ? `<div class="menu-item-price">$${item.price}</div>` : ''}
                  </div>
                `).join('')}
              </div>
            `).join('')}
          </div>
        ` : ''}

        <!-- Events -->
        ${location.events && location.events.length > 0 ? `
          <div class="card">
            <h2>🎉 Upcoming Events</h2>
            ${location.events.map(event => `
              <div class="event">
                <div class="event-title">${event.title}</div>
                <div class="event-date">📅 ${new Date(event.startDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>
                ${event.description ? `<div class="event-desc">${event.description}</div>` : ''}
              </div>
            `).join('')}
          </div>
        ` : ''}

        <!-- Call to Action -->
        <div class="card" style="text-align: center;">
          <h2 style="justify-content: center;">Ready to Visit?</h2>
          <p style="color: #666; margin-bottom: 20px;">We can't wait to serve you at our ${location.city} location!</p>
          <div>
            ${location.phone ? `<a href="tel:${location.phone.replace(/[^0-9]/g, '')}" class="cta-button">📞 Call Now</a>` : ''}
            ${location.menuUrl ? `<a href="${location.menuUrl}" class="cta-button">📋 Full Menu</a>` : ''}
            <a href="https://maps.google.com/?q=${encodeURIComponent(location.address + ', ' + location.city + ', ' + location.state)}" class="cta-button" target="_blank">🗺️ Get Directions</a>
          </div>

          ${(location.facebook || location.instagram || location.twitter) ? `
            <div class="social-links">
              ${location.facebook ? `<a href="${location.facebook}" class="social-link" target="_blank">📘</a>` : ''}
              ${location.instagram ? `<a href="${location.instagram}" class="social-link" target="_blank">📷</a>` : ''}
              ${location.twitter ? `<a href="${location.twitter}" class="social-link" target="_blank">🐦</a>` : ''}
            </div>
          ` : ''}
        </div>
      </div>
    </body>
    </html>
  `;
}

// Generate homepage HTML
function generateHomepage(locations) {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>MenuQR - All Locations</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }

        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          min-height: 100vh;
        }

        .hero {
          background: white;
          text-align: center;
          padding: 60px 20px;
          border-radius: 0 0 30px 30px;
          box-shadow: 0 10px 40px rgba(0,0,0,0.1);
        }

        .hero h1 {
          font-size: 3em;
          margin-bottom: 10px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .hero p {
          font-size: 1.2em;
          color: #666;
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
          background: white;
          border-radius: 15px;
          padding: 25px;
          box-shadow: 0 5px 20px rgba(0,0,0,0.1);
          transition: all 0.3s;
          text-decoration: none;
          color: inherit;
          display: block;
        }

        .location-card:hover {
          transform: translateY(-5px);
          box-shadow: 0 10px 40px rgba(0,0,0,0.15);
        }

        .location-name {
          font-size: 1.5em;
          color: #333;
          margin-bottom: 10px;
          font-weight: 600;
        }

        .location-address {
          color: #666;
          margin-bottom: 8px;
          line-height: 1.5;
        }

        .location-phone {
          color: #667eea;
          font-weight: 500;
          margin-bottom: 15px;
        }

        .location-features {
          display: flex;
          flex-wrap: wrap;
          gap: 5px;
          margin-bottom: 15px;
        }

        .feature-dot {
          background: rgba(102,126,234,0.1);
          color: #667eea;
          padding: 3px 10px;
          border-radius: 12px;
          font-size: 0.85em;
        }

        .view-location {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          color: white;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          padding: 10px 20px;
          border-radius: 20px;
          font-weight: 500;
          transition: transform 0.2s;
        }

        .location-card:hover .view-location {
          transform: scale(1.05);
        }

        .search-box {
          margin: 20px 0;
          text-align: center;
        }

        .search-input {
          padding: 15px 25px;
          border-radius: 25px;
          border: none;
          width: 100%;
          max-width: 400px;
          font-size: 1em;
          box-shadow: 0 5px 20px rgba(0,0,0,0.1);
        }

        @media (max-width: 600px) {
          .hero h1 { font-size: 2em; }
          .locations-grid { grid-template-columns: 1fr; }
        }
      </style>
    </head>
    <body>
      <div class="hero">
        <h1>📍 MenuQR</h1>
        <p>Select Your Location</p>
      </div>

      <div class="container">
        <div class="search-box">
          <input type="text" class="search-input" placeholder="🔍 Search locations..." id="searchInput" onkeyup="filterLocations()">
        </div>

        <div class="locations-grid" id="locationsGrid">
          ${locations.map(loc => `
            <a href="/${loc.slug}" class="location-card">
              <h2 class="location-name">${loc.name}</h2>
              <div class="location-address">
                ${loc.address || 'Address Coming Soon'}<br>
                ${loc.city}, ${loc.state} ${loc.zipCode || ''}
              </div>
              <div class="location-phone">📞 ${loc.phone || 'Contact Coming Soon'}</div>
              ${loc.features && loc.features.length > 0 ? `
                <div class="location-features">
                  ${loc.features.slice(0, 3).map(f => `<span class="feature-dot">${f}</span>`).join('')}
                </div>
              ` : ''}
              <span class="view-location">View Location →</span>
            </a>
          `).join('')}
        </div>
      </div>

      <script>
        function filterLocations() {
          const input = document.getElementById('searchInput').value.toLowerCase();
          const cards = document.querySelectorAll('.location-card');

          cards.forEach(card => {
            const text = card.textContent.toLowerCase();
            card.style.display = text.includes(input) ? '' : 'none';
          });
        }
      </script>
    </body>
    </html>
  `;
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
      sendHTML(res, 200, generateHomepage(locations));
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
    else if (pathname.startsWith('/') && pathname.length > 1 && !pathname.includes('.')) {
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
            orderBy: { startDate: 'asc' },
            take: 5
          }
        }
      });

      if (!location) {
        sendHTML(res, 404, '<h1>Location not found</h1><p><a href="/">← Back to locations</a></p>');
        return;
      }

      sendHTML(res, 200, generateLocationPage(location));
    }
    else {
      sendHTML(res, 404, '<h1>Page not found</h1><p><a href="/">← Back to home</a></p>');
    }
  } catch (error) {
    console.error('Error:', error);
    sendHTML(res, 500, `
      <h1>Service Temporarily Unavailable</h1>
      <p>We're setting up the database. Please try again in a moment.</p>
      <p><a href="/">← Back to home</a></p>
    `);
  }
});

server.listen(PORT, () => {
  console.log(`MenuQR server running on port ${PORT}`);
  console.log(`Visit http://localhost:${PORT} to see all locations`);
});