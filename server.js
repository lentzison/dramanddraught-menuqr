const http = require('http');

const PORT = 3000; // CapRover requires port 3000

console.log('Starting server...');

const server = http.createServer((req, res) => {
  console.log('Request received:', req.url);

  res.writeHead(200, { 'Content-Type': 'text/html' });

  if (req.url === '/') {
    res.end(`
      <h1>Dram & Draught</h1>
      <p>Select a location:</p>
      <ul>
        <li><a href="/greensboro">Greensboro - 300 West Gate City Blvd</a></li>
        <li><a href="/raleigh">Raleigh - 1 Glenwood Avenue</a></li>
        <li><a href="/durham">Durham - 701 W. Main Street</a></li>
        <li><a href="/winston-salem">Winston-Salem - 486 North Patterson Ave</a></li>
        <li><a href="/cary">Cary - 3 Fenton Main St</a></li>
        <li><a href="/charlotte">Charlotte - 1220 S Tryon St</a></li>
        <li><a href="/wilmington">Wilmington - 109 Market St</a></li>
      </ul>
    `);
  } else {
    res.end(`
      <h1>Dram & Draught - ${req.url.substring(1)}</h1>
      <p>Location page</p>
      <a href="/">Back to all locations</a>
    `);
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});

// Keep the process alive
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
  });
});