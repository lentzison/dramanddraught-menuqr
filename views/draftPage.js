const { getOpenState } = require('../helpers');

function escHTML(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

const TAP_TYPE_LABELS = {
  STANDARD: 'On Tap',
  NITRO: 'Nitro',
  WINE: 'Wine on Tap',
  COCKTAIL: 'Cocktails on Tap',
};

const TAP_TYPE_ORDER = ['STANDARD', 'NITRO', 'WINE', 'COCKTAIL'];

function generateDraftPage(location, taps = [], hasError = false) {
  const spiritListUrl = `https://public.apps.dramanddraught.com/spirits/${location.slug}`;
  const openState = getOpenState(location);
  const statusClass = openState.isOpen === true ? 'status-open' : openState.isOpen === false ? 'status-closed' : 'status-unknown';
  const availabilityMessage = hasError ? 'Draft list is temporarily unavailable.' : 'Draft list coming soon!';

  // Group taps by tapType
  const groups = {};
  for (const tap of taps) {
    const type = tap.tapType || 'STANDARD';
    if (!groups[type]) groups[type] = [];
    groups[type].push(tap);
  }

  const hasTaps = taps.length > 0;

  const renderTapCard = (tap) => {
    const isEmpty = !tap.beerName;
    return `
      <div class="tap-card${isEmpty ? ' empty' : ''}">
        <div class="tap-number">${tap.tapNumber}</div>
        <div class="tap-info">
          ${isEmpty ? `
            <div class="tap-name muted">Coming Soon</div>
            ${tap.tapName ? `<div class="tap-line-name">${escHTML(tap.tapName)}</div>` : ''}
          ` : `
            <div class="tap-name">${escHTML(tap.beerName)}</div>
            ${tap.brewery ? `<div class="tap-brewery">${escHTML(tap.brewery)}</div>` : ''}
            <div class="tap-meta">
              ${tap.style ? `<span class="tap-style">${escHTML(tap.style)}</span>` : ''}
              ${tap.abv ? `<span class="abv-badge">${tap.abv}%</span>` : ''}
              ${tap.ibu ? `<span class="ibu-badge">${tap.ibu} IBU</span>` : ''}
            </div>
            ${tap.notes ? `<div class="tap-notes">${escHTML(tap.notes)}</div>` : ''}
          `}
        </div>
        ${!isEmpty && (tap.price || tap.servingSize) ? `
          <div class="tap-price-col">
            ${tap.price ? `<div class="tap-price">${escHTML(tap.price)}</div>` : ''}
            ${tap.servingSize ? `<div class="tap-size">${escHTML(tap.servingSize)}</div>` : ''}
          </div>
        ` : ''}
      </div>
    `;
  };

  const sectionsHTML = hasTaps ? TAP_TYPE_ORDER
    .filter(type => groups[type] && groups[type].length > 0)
    .map(type => `
      <div class="section">
        <div class="section-header">
          <h2>${TAP_TYPE_LABELS[type]}</h2>
          <span class="section-count">${groups[type].length} ${groups[type].length === 1 ? 'tap' : 'taps'}</span>
        </div>
        ${groups[type].map(renderTapCard).join('')}
      </div>
    `).join('') : (hasError ? '' : `
      <div class="section">
        <div class="empty-card">
          <p>${availabilityMessage}</p>
          <a href="${spiritListUrl}" class="spirit-link" target="_blank">Browse Our Spirit List →</a>
        </div>
      </div>
    `);

  return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>On Draft - Dram & Draught ${escHTML(location.name)}</title>
        <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        :root {
          --bg-a: #09090c;
          --bg-b: #19151d;
          --panel: #17141c;
          --line: rgba(216, 174, 73, 0.25);
          --text: #efe7d4;
          --muted: #b0a99c;
          --gold: #d9b25f;
          --amber: #b97c3d;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        body {
          font-family: "Palatino Linotype", "Bodoni MT", "Trebuchet MS", Georgia, serif;
          color: var(--text);
          background:
            radial-gradient(1100px 520px at 15% -8%, rgba(216, 174, 73, 0.2), transparent 60%),
            radial-gradient(900px 520px at 100% 0%, rgba(185, 124, 61, 0.2), transparent 56%),
            linear-gradient(180deg, var(--bg-a), #09090c 42%, #080808 100%);
          min-height: 100vh;
          animation: fadeIn .45s ease-out;
        }
        .header {
          text-align: center;
          padding: 30px 20px 0;
        }
        .brand {
          font-size: clamp(1.7rem, 7vw, 2.2rem);
          font-weight: 800;
          letter-spacing: 0.09em;
          text-transform: uppercase;
          background: linear-gradient(135deg, #f3d7a5, var(--gold), var(--amber));
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .location-name {
          color: var(--muted);
          text-transform: uppercase;
          letter-spacing: 0.1em;
          margin-top: 6px;
          font-size: 0.9rem;
        }
        .page-banner {
          margin: 14px auto 0;
          max-width: 680px;
          border: 1px solid var(--line);
          border-radius: 18px;
          padding: 16px 14px 14px;
          text-align: center;
          background: linear-gradient(170deg, rgba(23, 20, 28, 0.95), rgba(12, 11, 12, 0.9));
          box-shadow: 0 14px 34px rgba(0, 0, 0, 0.5);
        }
        .page-title {
          font-size: 1.6rem;
          font-weight: 800;
          color: #fff;
        }
        .page-subtitle {
          color: #d9b25f;
          font-size: 0.9rem;
          margin-top: 2px;
        }
        .status-line {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          margin-top: 10px;
          border: 1px solid #2a2a2c;
          border-radius: 999px;
          padding: 6px 12px;
          font-size: 0.78rem;
          text-transform: uppercase;
          font-weight: 700;
          letter-spacing: 0.04em;
        }
        .status-open { color: #22c55e; border-color: rgba(34,197,94,0.4); background: rgba(34,197,94,0.11); }
        .status-closed { color: #f59e0b; border-color: rgba(245,158,11,0.4); background: rgba(245,158,11,0.11); }
        .status-unknown { color: #9ca3af; border-color: rgba(156,163,175,0.4); background: rgba(156,163,175,0.11); }
        .container {
          max-width: 680px;
          margin: 0 auto;
          padding: 22px 16px 30px;
        }
        .section {
          margin: 22px 0;
        }
        .section-header {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 10px;
          padding: 0 2px;
        }
        .section-header h2 {
          flex: 1;
          font-size: 1.05rem;
          color: var(--gold);
          font-weight: 800;
          letter-spacing: 0.02em;
          text-transform: uppercase;
        }
        .section-count {
          color: var(--muted);
          font-size: 0.76rem;
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: 999px;
          padding: 3px 10px;
          font-weight: 600;
        }
        .tap-card {
          display: grid;
          grid-template-columns: auto 1fr auto;
          gap: 12px 14px;
          align-items: center;
          background: var(--panel);
          border: 1px solid #2a262d;
          border-radius: 12px;
          padding: 14px;
          margin-bottom: 10px;
          transition: transform 0.18s ease, border-color 0.18s ease;
          box-shadow: 0 10px 24px rgba(0,0,0,0.25);
        }
        .tap-card:hover { transform: translateY(-1px); border-color: rgba(216,174,73,0.32); }
        .tap-card.empty { opacity: 0.6; }
        .tap-number {
          width: 34px;
          height: 34px;
          background: linear-gradient(135deg, var(--gold), var(--amber));
          color: #14110d;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 800;
          font-size: 0.9rem;
          flex-shrink: 0;
        }
        .tap-info { min-width: 0; }
        .tap-name { font-weight: 800; color: #fff; font-size: 1rem; }
        .tap-name.muted { color: #777; font-style: italic; }
        .tap-line-name { color: #8d8578; font-size: 0.8rem; margin-top: 2px; }
        .tap-brewery { color: #d7bc75; font-size: 0.86rem; margin-top: 2px; }
        .tap-meta {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
          margin-top: 5px;
        }
        .tap-style { color: #a7a093; font-size: 0.82rem; }
        .abv-badge, .ibu-badge {
          display: inline-block;
          background: rgba(216,174,73,0.15);
          color: var(--gold);
          font-size: 0.72rem;
          font-weight: 700;
          padding: 2px 7px;
          border-radius: 6px;
        }
        .ibu-badge {
          background: rgba(185,124,61,0.2);
          color: var(--amber);
        }
        .tap-notes {
          color: #8d8678;
          font-size: 0.82rem;
          margin-top: 4px;
          font-style: italic;
        }
        .tap-price-col { text-align: right; }
        .tap-price {
          color: var(--gold);
          font-weight: 800;
          font-size: 1.08rem;
        }
        .tap-size {
          color: #9d9486;
          font-size: 0.75rem;
          margin-top: 2px;
        }
        .empty-card {
          text-align: center;
          background: var(--panel);
          border: 1px solid #2a262d;
          border-radius: 14px;
          padding: 32px 20px;
          box-shadow: 0 10px 24px rgba(0, 0, 0, 0.2);
        }
        .empty-card p { color: #a39887; line-height: 1.5; }
        .warning-card {
          text-align: center;
          background: rgba(234, 179, 8, 0.09);
          border: 1px solid rgba(234,179,8,0.24);
          border-radius: 14px;
          padding: 16px;
          color: #f2d06b;
          margin-bottom: 10px;
          box-shadow: 0 8px 24px rgba(0,0,0,0.2);
        }
        .warning-card p { margin-bottom: 10px; line-height: 1.4; }
        .spirit-link, .spirit-cta {
          display: inline-block;
          margin-top: 16px;
          color: #14110d;
          background: linear-gradient(135deg, var(--gold), var(--amber));
          padding: 10px 22px;
          border-radius: 10px;
          text-decoration: none;
          font-weight: 700;
          font-size: 0.9rem;
        }
        .spirit-link:hover, .spirit-cta:hover { filter: brightness(1.05); }
        .spirit-cta {
          width: 100%;
          margin: 26px 0 8px;
          text-align: center;
          padding: 13px 20px;
          font-size: 0.95rem;
          letter-spacing: 0.02em;
          border: 1px solid rgba(255,255,255,0.2);
        }
        .footer {
          text-align: center;
          padding: 24px 20px 32px;
        }
        .back-link {
          display: inline-block;
          color: #938a7b;
          text-decoration: none;
          font-size: 0.9rem;
          font-weight: 600;
        }
        .back-link:hover { color: var(--gold); }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="brand">Dram & Draught</div>
        <div class="location-name">${escHTML(location.name)}</div>
      </div>

      <div class="page-banner">
        <div class="page-title">On Draft</div>
        <div class="page-subtitle">What's pouring now</div>
        ${openState.isOpen === null ? '' : `
        <div class="status-line ${statusClass}">
          ${openState.status}${openState.todayHours ? ` · ${escHTML(openState.todayHours)}` : ''}
        </div>
        `}
      </div>

      <div class="container">
        ${hasError ? `
          <div class="section">
            <div class="warning-card">
              <p>${availabilityMessage}</p>
              <a href="${spiritListUrl}" class="spirit-link" target="_blank">Browse Our Spirit List →</a>
            </div>
          </div>
        ` : ''}
        ${sectionsHTML}

        <a href="${spiritListUrl}" class="spirit-cta" target="_blank">Browse Our Full Spirit List →</a>

        <div class="footer">
          <a href="/${location.slug}" class="back-link">← Back to ${escHTML(location.name)}</a>
        </div>
      </div>
    </body>
    </html>
  `;
}

module.exports = { generateDraftPage };
