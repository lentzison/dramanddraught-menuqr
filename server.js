const http = require('http');

const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  console.log(`Request received: ${req.url}`);

  res.writeHead(200, { 'Content-Type': 'text/html' });

  if (req.url === '/') {
    res.end(`
      <h1>Dram & Draught Locations</h1>
      <ul>
        <li><a href="/greensboro">Greensboro</a></li>
        <li><a href="/raleigh">Raleigh</a></li>
        <li><a href="/durham">Durham</a></li>
        <li><a href="/winston-salem">Winston-Salem</a></li>
        <li><a href="/cary">Cary</a></li>
        <li><a href="/charlotte">Charlotte</a></li>
        <li><a href="/wilmington">Wilmington</a></li>
      </ul>
    `);
  } else {
    res.end(`
      <h1>Dram & Draught ${req.url.substring(1)}</h1>
      <p>Location page</p>
      <a href="/">Back to all locations</a>
    `);
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on http://0.0.0.0:${PORT}`);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
  });
});