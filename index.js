const http = require('http');
const url = require('url');

const PORT = process.env.PORT || 3000;

// Static Dram & Draught locations data
const locations = [
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

// Generate location page HTML
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
        .hours-item {
          display: flex;
          justify-content: space-between;
          padding: 10px;
          background: #f8f9fa;
          border-radius: 8px;
          margin-bottom: 5px;
        }
        .feature-tag {
          display: inline-block;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          padding: 8px 16px;
          border-radius: 25px;
          font-size: 0.9em;
          margin: 5px;
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
        }
        .back-link {
          display: inline-block;
          color: white;
          text-decoration: none;
          padding: 10px 20px;
          background: rgba(255,255,255,0.2);
          border-radius: 20px;
          margin-bottom: 20px;
        }
      </style>
    </head>
    <body>
      <div class="hero">
        <h1>🥃 Dram & Draught ${location.name}</h1>
        <p>Welcome to Our ${location.city} Location</p>
        ${location.specialText ? `<p style="color: #764ba2; font-weight: 600; margin-top: 10px;">🎉 ${location.specialText}</p>` : ''}
      </div>
      <div class="container">
        <a href="/" class="back-link">← View All Locations</a>

        <div class="card">
          <h2>📍 Visit Us</h2>
          <p><strong>Address:</strong><br>${location.address}<br>${location.city}, ${location.state} ${location.zipCode}</p>
          ${location.email ? `<p><strong>Email:</strong> ${location.email}</p>` : ''}
        </div>

        <div class="card">
          <h2>🕐 Hours of Operation</h2>
          ${Object.entries(location.hours).map(([day, hours]) => `
            <div class="hours-item">
              <span><strong>${day.charAt(0).toUpperCase() + day.slice(1)}</strong></span>
              <span>${hours}</span>
            </div>
          `).join('')}
        </div>

        <div class="card">
          <h2>✨ Features & Amenities</h2>
          <div>
            ${location.features.map(f => `<span class="feature-tag">${f}</span>`).join('')}
          </div>
        </div>

        <div class="card" style="text-align: center;">
          <h2>Ready to Visit?</h2>
          <p style="margin: 20px 0;">We can't wait to serve you at our ${location.city} location!</p>
          <a href="https://maps.google.com/?q=${encodeURIComponent(location.address + ', ' + location.city + ', ' + location.state)}" class="cta-button" target="_blank">🗺️ Get Directions</a>
          <a href="https://www.dramanddraught.com/menus/" class="cta-button" target="_blank">📋 View Menu</a>
        </div>
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
          text-decoration: none;
          color: inherit;
          display: block;
          transition: transform 0.3s;
        }
        .location-card:hover {
          transform: translateY(-5px);
        }
        .location-name {
          font-size: 1.5em;
          color: #333;
          margin-bottom: 10px;
          font-weight: 600;
        }
        .view-location {
          display: inline-block;
          color: white;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          padding: 10px 20px;
          border-radius: 20px;
          font-weight: 500;
          margin-top: 15px;
        }
      </style>
    </head>
    <body>
      <div class="hero">
        <h1>🥃 Dram & Draught</h1>
        <p>Select Your Location</p>
        <p style="margin-top: 10px; color: #999; font-size: 0.9em;">300+ Whiskeys | Craft Cocktails | NC Beers</p>
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
              <p style="color: #764ba2; font-size: 0.9em;">${loc.specialText || ''}</p>
              <span class="view-location">View Location →</span>
            </a>
          `).join('')}
        </div>
      </div>
    </body>
    </html>
  `;
}

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  console.log(`Request: ${pathname}`);

  try {
    if (pathname === '/') {
      sendHTML(res, 200, generateHomepage(locations));
    } else if (pathname.startsWith('/') && pathname.length > 1 && !pathname.includes('.')) {
      const slug = pathname.substring(1);
      const location = locations.find(l => l.slug === slug);

      if (location) {
        sendHTML(res, 200, generateLocationPage(location));
      } else {
        sendHTML(res, 404, '<h1>Location not found</h1><p><a href="/">← Back to locations</a></p>');
      }
    } else {
      sendHTML(res, 404, '<h1>Page not found</h1><p><a href="/">← Back to home</a></p>');
    }
  } catch (error) {
    console.error('Error:', error);
    sendHTML(res, 500, '<h1>Server Error</h1><p>Please try again later.</p>');
  }
});

server.listen(PORT, () => {
  console.log(`Dram & Draught server running on port ${PORT}`);
  console.log('Ready to serve location pages!');
});