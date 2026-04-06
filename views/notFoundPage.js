const { vintageThemeCss } = require('./publicTheme');
const { brandMarkCss, renderBrandMark } = require('./brandMark');

function escHTML(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Branded 404 page that gives the user somewhere to go.
// Optionally accepts a list of locations so we can offer them as alternatives.
function generateNotFoundPage(options = {}) {
  const { locations = [], requestedPath = '' } = options;
  const locationLinks = (locations || []).map(loc => `
    <a href="/${escHTML(loc.slug)}" class="nf-loc">
      <span class="nf-loc-name">${escHTML(loc.name)}</span>
      ${loc.city ? `<span class="nf-loc-city">${escHTML(loc.city)}</span>` : ''}
    </a>
  `).join('');

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta name="theme-color" content="#0f1012">
      <title>Page not found - Dram &amp; Draught</title>
      <style>
        ${vintageThemeCss()}
        ${brandMarkCss()}
        body {
          background: linear-gradient(180deg, var(--bg-a), var(--bg-b));
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 40px 20px;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
        }
        .nf-card {
          max-width: 560px;
          width: 100%;
          background: var(--panel);
          border: 1px solid var(--line);
          border-radius: 20px;
          padding: 38px 28px;
          text-align: center;
          box-shadow: 0 22px 58px var(--shadow);
        }
        .nf-card .brand-mark { max-width: 200px; margin: 0 auto 18px; }
        .nf-eyebrow {
          color: var(--gold);
          font-size: 0.68rem;
          font-weight: 800;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          margin-bottom: 8px;
        }
        .nf-title {
          font-family: 'Playfair Display', Georgia, serif;
          font-size: 1.8rem;
          font-weight: 800;
          color: var(--text);
          line-height: 1.15;
          margin-bottom: 8px;
        }
        .nf-message {
          color: var(--muted);
          font-size: 0.95rem;
          line-height: 1.55;
          margin-bottom: 22px;
        }
        .nf-path {
          display: inline-block;
          background: var(--panel-strong);
          color: var(--gold);
          font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
          font-size: 0.78rem;
          padding: 4px 10px;
          border-radius: 6px;
          border: 1px solid var(--line);
          margin-top: 4px;
          word-break: break-all;
        }
        .nf-locations {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          justify-content: center;
          margin: 20px 0 24px;
        }
        .nf-loc {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          padding: 12px 16px;
          background: var(--panel-strong);
          border: 1px solid var(--line);
          border-radius: 10px;
          color: var(--text);
          text-decoration: none;
          min-width: 140px;
          transition: border-color 0.15s, background 0.15s;
        }
        .nf-loc:hover {
          border-color: var(--gold);
          background: var(--panel-soft);
          text-decoration: none;
        }
        .nf-loc-name { font-weight: 700; font-size: 0.95rem; color: var(--text); }
        .nf-loc-city { color: var(--muted); font-size: 0.78rem; margin-top: 2px; }
        .nf-home {
          display: inline-block;
          padding: 12px 26px;
          background: linear-gradient(135deg, var(--gold), var(--amber));
          color: #0c0c0c;
          text-decoration: none;
          font-weight: 800;
          border-radius: 10px;
          font-size: 0.92rem;
          transition: filter 0.2s;
        }
        .nf-home:hover { filter: brightness(1.1); text-decoration: none; }
      </style>
    </head>
    <body>
      <div class="nf-card">
        ${renderBrandMark()}
        <div class="nf-eyebrow">404</div>
        <h1 class="nf-title">Page not found</h1>
        <p class="nf-message">
          We couldn't find the page you were looking for. It may have moved or been removed.
          ${requestedPath ? `<br/><span class="nf-path">${escHTML(requestedPath)}</span>` : ''}
        </p>
        ${locationLinks ? `
          <div style="color: var(--smoke); font-size: 0.7rem; font-weight: 800; letter-spacing: 0.14em; text-transform: uppercase; margin-bottom: 8px;">Pick a location</div>
          <div class="nf-locations">${locationLinks}</div>
        ` : ''}
        <a href="/" class="nf-home">Back to Home</a>
      </div>
    </body>
    </html>
  `;
}

module.exports = { generateNotFoundPage };
