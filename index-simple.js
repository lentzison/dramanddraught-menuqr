const http = require('http');
const url = require('url');

const PORT = process.env.PORT || 3000;

// Static Dram & Draught data
const locations = [
  { name: 'Greensboro', slug: 'greensboro', city: 'Greensboro', state: 'NC', address: '300 West Gate City Blvd', zipCode: '27406', hours: 'Mon-Wed: 4PM-12AM, Thu-Fri: 4PM-2AM, Sat: 12PM-2AM, Sun: 12PM-12AM' },
  { name: 'Raleigh', slug: 'raleigh', city: 'Raleigh', state: 'NC', address: '1 Glenwood Avenue, Suite 101', zipCode: '27603', hours: 'Mon-Fri: 3PM-2AM, Sat: 12PM-2AM, Sun: 12PM-12AM' },
  { name: 'Durham', slug: 'durham', city: 'Durham', state: 'NC', address: '701 W. Main Street Suite 123', zipCode: '27701', hours: 'Mon-Thu: 3PM-12AM, Fri: 3PM-2AM, Sat: 12PM-2AM, Sun: 12PM-12AM' },
  { name: 'Winston-Salem', slug: 'winston-salem', city: 'Winston-Salem', state: 'NC', address: '486 North Patterson Avenue STE 120', zipCode: '27101', hours: 'Mon-Wed: 3PM-12AM, Thu-Fri: 3PM-2AM, Sat: 12PM-2AM, Sun: 12PM-12AM' },
  { name: 'Cary', slug: 'cary', city: 'Cary', state: 'NC', address: '3 Fenton Main St', zipCode: '27511', hours: 'Mon: 4PM-12AM, Tue-Thu: 12PM-12AM, Fri-Sat: 12PM-2AM, Sun: 12PM-11PM' },
  { name: 'Charlotte', slug: 'charlotte', city: 'Charlotte', state: 'NC', address: '1220 S Tryon St', zipCode: '28203', hours: 'Mon-Fri: 3PM-2AM, Sat: 12PM-2AM, Sun: 12PM-12AM' },
  { name: 'Wilmington', slug: 'wilmington', city: 'Wilmington', state: 'NC', address: '109 Market St', zipCode: '28401', hours: 'Mon-Thu: 2PM-12AM, Fri-Sat: 12PM-2AM, Sun: 12PM-12AM' }
];

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });

  if (pathname === '/') {
    // Homepage
    res.end(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Dram & Draught - NC Locations</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body { font-family: Arial, sans-serif; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); margin: 0; padding: 20px; }
          .header { background: white; padding: 30px; text-align: center; border-radius: 10px; margin-bottom: 30px; }
          h1 { color: #333; margin: 0; }
          .locations { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 20px; }
          .location { background: white; padding: 20px; border-radius: 10px; text-decoration: none; color: #333; display: block; transition: transform 0.2s; }
          .location:hover { transform: translateY(-5px); }
          .location h2 { color: #667eea; margin: 0 0 10px 0; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>🥃 Dram & Draught</h1>
          <p>Select Your Location</p>
        </div>
        <div class="locations">
          ${locations.map(loc => `
            <a href="/${loc.slug}" class="location">
              <h2>${loc.name}</h2>
              <p>${loc.address}<br>${loc.city}, ${loc.state} ${loc.zipCode}</p>
              <p><small>${loc.hours}</small></p>
            </a>
          `).join('')}
        </div>
      </body>
      </html>
    `);
  } else {
    // Location page
    const slug = pathname.substring(1);
    const location = locations.find(l => l.slug === slug);

    if (location) {
      res.end(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Dram & Draught ${location.name}</title>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body { font-family: Arial, sans-serif; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); margin: 0; padding: 20px; }
            .container { max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; }
            h1 { color: #667eea; }
            .back { display: inline-block; margin-bottom: 20px; color: #667eea; text-decoration: none; }
          </style>
        </head>
        <body>
          <div class="container">
            <a href="/" class="back">← All Locations</a>
            <h1>🥃 Dram & Draught ${location.name}</h1>
            <p><strong>Address:</strong><br>${location.address}<br>${location.city}, ${location.state} ${location.zipCode}</p>
            <p><strong>Hours:</strong><br>${location.hours}</p>
            <p><strong>Features:</strong><br>300+ Whiskeys | Craft Cocktails | NC Draft Beer | Wine Selection</p>
            <a href="https://maps.google.com/?q=${encodeURIComponent(location.address + ', ' + location.city + ', ' + location.state)}" style="display: inline-block; background: #667eea; color: white; padding: 10px 20px; border-radius: 5px; text-decoration: none; margin-top: 20px;">Get Directions</a>
          </div>
        </body>
        </html>
      `);
    } else {
      res.end('<h1>Location not found</h1><p><a href="/">Back to locations</a></p>');
    }
  }
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});