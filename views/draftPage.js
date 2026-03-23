const { getOpenState } = require('../helpers');
const { vintageThemeCss } = require('./publicTheme');

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
        <meta name="theme-color" content="#0f1012">
        <title>On Draft - Dram & Draught ${escHTML(location.name)}</title>
        <style>
        ${vintageThemeCss()}
        .header {
          text-align: center;
          padding: 30px 20px 0;
        }
        .brand {
          font-size: clamp(1.7rem, 7vw, 2.2rem);
          font-weight: 800;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          background: linear-gradient(180deg, #ffffff, #d0d4da 68%, #737a84 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .location-name {
          color: var(--muted);
          text-transform: uppercase;
          letter-spacing: 0.16em;
          margin-top: 6px;
          font-size: 0.9rem;
        }
        .page-banner {
          margin: 14px auto 0;
          max-width: 680px;
          border: 1px solid var(--line);
          border-radius: 12px;
          padding: 16px 14px 14px;
          text-align: center;
          background: linear-gradient(180deg, rgba(20, 21, 24, 0.95), rgba(9, 9, 10, 0.98));
          box-shadow: 0 14px 30px rgba(0, 0, 0, 0.3), inset 0 0 0 1px rgba(255,255,255,0.03);
        }
        .page-title {
          font-size: 1.6rem;
          font-weight: 800;
          color: var(--cream);
        }
        .page-subtitle {
          color: var(--gold);
          font-size: 0.9rem;
          margin-top: 2px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .status-line {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          margin-top: 10px;
          border: 1px solid rgba(255, 255, 255, 0.14);
          border-radius: 8px;
          padding: 6px 12px;
          font-size: 0.78rem;
          text-transform: uppercase;
          font-weight: 700;
          letter-spacing: 0.08em;
          background: rgba(34, 24, 17, 0.45);
        }
        .status-open { color: var(--cream); border-color: rgba(255,255,255,0.24); background: rgba(255,255,255,0.08); }
        .status-closed { color: #cdced1; border-color: rgba(255,255,255,0.16); background: rgba(255,255,255,0.05); }
        .status-unknown { color: var(--muted); border-color: rgba(255,255,255,0.12); background: rgba(255,255,255,0.03); }
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
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .section-count {
          color: var(--muted);
          font-size: 0.76rem;
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: 8px;
          padding: 3px 10px;
          font-weight: 600;
        }
        .tap-card {
          display: grid;
          grid-template-columns: auto 1fr auto;
          gap: 12px 14px;
          align-items: center;
          background: linear-gradient(180deg, rgba(20, 21, 24, 0.94), rgba(9, 9, 10, 0.98));
          border: 1px solid var(--line);
          border-radius: 10px;
          padding: 14px;
          margin-bottom: 10px;
          transition: transform 0.18s ease, border-color 0.18s ease;
          box-shadow: 0 10px 24px rgba(0,0,0,0.24), inset 0 0 0 1px rgba(255,255,255,0.03);
        }
        .tap-card:hover { transform: translateY(-1px); border-color: rgba(245,232,204,0.24); }
        .tap-card.empty { opacity: 0.6; }
        .tap-number {
          width: 34px;
          height: 34px;
          background: linear-gradient(180deg, #ffffff, #bcc1c8 64%, #727983);
          color: var(--ink);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 800;
          font-size: 0.9rem;
          flex-shrink: 0;
        }
        .tap-info { min-width: 0; }
        .tap-name { font-weight: 800; color: var(--cream); font-size: 1rem; }
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
        .tap-style { color: #b8bcc2; font-size: 0.82rem; }
        .abv-badge, .ibu-badge {
          display: inline-block;
          background: rgba(255,255,255,0.08);
          color: var(--gold);
          font-size: 0.72rem;
          font-weight: 700;
          padding: 2px 7px;
          border-radius: 6px;
        }
        .ibu-badge {
          background: rgba(111,118,127,0.18);
          color: #dde0e5;
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
          background: linear-gradient(180deg, rgba(20, 21, 24, 0.95), rgba(9, 9, 10, 0.98));
          border: 1px solid var(--line);
          border-radius: 10px;
          padding: 32px 20px;
          box-shadow: 0 10px 24px rgba(0, 0, 0, 0.2);
        }
        .empty-card p { color: var(--muted); line-height: 1.5; }
        .warning-card {
          text-align: center;
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.16);
          border-radius: 10px;
          padding: 16px;
          color: #f0f1f3;
          margin-bottom: 10px;
          box-shadow: 0 8px 24px rgba(0,0,0,0.2);
        }
        .warning-card p { margin-bottom: 10px; line-height: 1.4; }
        .spirit-link, .spirit-cta {
          display: inline-block;
          margin-top: 16px;
          color: var(--ink);
          background: linear-gradient(180deg, #ffffff, #bcc1c8 64%, #727983);
          padding: 10px 22px;
          border-radius: 8px;
          text-decoration: none;
          font-weight: 700;
          font-size: 0.9rem;
          border: 1px solid rgba(255, 255, 255, 0.12);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .spirit-link:hover, .spirit-cta:hover { filter: brightness(1.05); }
        .spirit-cta {
          width: 100%;
          margin: 26px 0 8px;
          text-align: center;
          padding: 13px 20px;
          font-size: 0.95rem;
          letter-spacing: 0.05em;
        }
        .footer {
          text-align: center;
          padding: 24px 20px 32px;
        }
        .back-link {
          display: inline-block;
          color: var(--muted);
          text-decoration: none;
          font-size: 0.9rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.06em;
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
