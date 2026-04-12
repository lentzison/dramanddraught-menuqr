const { getOpenState } = require('../helpers');
const { vintageThemeCss } = require('./publicTheme');
const { brandMarkCss, renderBrandMark } = require('./brandMark');
const { escHTML } = require('./escapeHtml');

function formatMoney(value) {
  if (value === null || value === undefined) return '';
  const numeric = Number.parseFloat(String(value));
  if (Number.isNaN(numeric)) return String(value);
  return `$${numeric.toFixed(2)}`;
}

function generateMenuPage(location, menuCategories = [], hasError = false) {
  const openState = getOpenState(location);
  const menuItems = menuCategories || [];

  const statusClass = openState.isOpen === true ? 'status-open' : openState.isOpen === false ? 'status-closed' : 'status-unknown';

  const noMenuMessage = (!menuItems.length || hasError)
    ? `
      <div class="empty-card">
        <p>${hasError ? 'Menu data is temporarily unavailable.' : 'No menu has been published for this location yet.'}</p>
        <a href="/${location.slug}/spirits" class="spirit-link">Browse our Spirit List →</a>
      </div>
    `
    : '';

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta name="theme-color" content="#0f1012">
      <title>Menu - ${escHTML(location.name)} - Dram & Draught</title>
      <style>
        ${vintageThemeCss()}
        ${brandMarkCss()}
        .header {
          text-align: center;
          padding: 30px 24px 26px;
          max-width: 900px;
          margin: 0 auto;
          position: relative;
          overflow: hidden;
          background:
            linear-gradient(180deg, rgba(24, 25, 28, 0.97), rgba(7, 7, 8, 0.98)),
            radial-gradient(circle at top, rgba(255, 255, 255, 0.08), transparent 42%);
          border: 1px solid var(--line);
          border-top: 0;
          border-radius: 0 0 28px 28px;
          box-shadow: 0 22px 58px var(--shadow), inset 0 0 0 1px rgba(255,255,255,0.04);
        }
        .header::before {
          content: '';
          position: absolute;
          inset: 0;
          background:
            repeating-linear-gradient(90deg, rgba(255,255,255,0.03), rgba(255,255,255,0.03) 1px, transparent 1px, transparent 8px),
            repeating-linear-gradient(0deg, rgba(0,0,0,0.06), rgba(0,0,0,0.06) 1px, transparent 1px, transparent 10px);
          opacity: 0.24;
          pointer-events: none;
        }
        .brand {
          width: min(52vw, 360px);
          margin: 0 auto;
        }
        .location-name {
          color: #d3d0cb;
          text-transform: uppercase;
          letter-spacing: 0.2em;
          margin-top: 12px;
          font-size: 0.84rem;
        }
        .menu-hero {
          margin: -10px auto 0;
          max-width: 620px;
          text-align: center;
          padding: 18px 18px 18px;
          border: 1px solid var(--line);
          border-radius: 18px;
          background: linear-gradient(180deg, rgba(20, 21, 24, 0.95), rgba(9, 9, 10, 0.98));
          box-shadow: 0 16px 30px rgba(0, 0, 0, 0.3), inset 0 0 0 1px rgba(255,255,255,0.03);
          position: relative;
          z-index: 1;
        }
        .menu-label {
          color: var(--gold);
          font-size: 0.72rem;
          text-transform: uppercase;
          letter-spacing: 0.22em;
          font-weight: 800;
        }
        .menu-hero p {
          color: #d6d2cc;
          font-size: 0.92rem;
          margin-top: 8px;
          line-height: 1.55;
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
          background: rgba(255,255,255,0.04);
        }
        .status-open { color: #dce7cf; border-color: rgba(90,102,82,0.45); background: rgba(90,102,82,0.2); }
        .status-closed { color: #ead4a7; border-color: rgba(210,170,103,0.34); background: rgba(210,170,103,0.12); }
        .status-unknown { color: var(--muted); border-color: rgba(255,255,255,0.12); background: rgba(255,255,255,0.03); }
        .container {
          max-width: 760px;
          margin: 0 auto;
          padding: 24px 6px 36px;
        }
        .section {
          margin: 24px 0;
        }
        .section-header {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 12px;
          padding: 0 2px 10px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        }
        .section-title {
          flex: 1;
          color: var(--cream);
          font-size: 1.02rem;
          letter-spacing: 0.11em;
          text-transform: uppercase;
          font-weight: 800;
        }
        .menu-note {
          color: var(--muted);
          font-size: 0.84rem;
          margin: 0 0 10px 4px;
          line-height: 1.45;
        }
        .menu-note .muted-inline { color: #91897d; }
        .menu-item {
          background: linear-gradient(180deg, rgba(20, 21, 24, 0.94), rgba(9, 9, 10, 0.98));
          border: 1px solid var(--line);
          border-radius: 16px;
          padding: 16px;
          margin-bottom: 10px;
          box-shadow: 0 12px 24px rgba(0,0,0,0.24), inset 0 0 0 1px rgba(255,255,255,0.03);
          transition: transform 0.18s ease, border-color 0.18s ease;
        }
        .menu-item:hover {
          transform: translateY(-1px);
          border-color: rgba(255, 255, 255, 0.18);
        }
        .menu-item-header {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          gap: 12px;
        }
        .menu-item-name {
          font-weight: 700;
          color: var(--cream);
          font-size: 1rem;
          letter-spacing: 0.01em;
        }
        .menu-item-price {
          color: var(--gold);
          font-weight: 800;
          white-space: nowrap;
          border: 1px solid rgba(210, 170, 103, 0.24);
          border-radius: 999px;
          padding: 6px 10px;
          background: rgba(210, 170, 103, 0.08);
        }
        .menu-item-desc {
          color: #d0c1a7;
          font-size: 0.85rem;
          margin-top: 6px;
          line-height: 1.5;
        }
        .menu-count {
          margin-left: 6px;
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: 999px;
          color: var(--muted);
          font-size: 0.72rem;
          padding: 3px 8px;
          font-weight: 700;
          text-transform: none;
        }
        .empty-card {
          text-align: center;
          background: linear-gradient(180deg, rgba(20, 21, 24, 0.95), rgba(9, 9, 10, 0.98));
          border: 1px solid var(--line);
          border-radius: 16px;
          padding: 34px 20px;
          margin-top: 14px;
          box-shadow: 0 12px 24px rgba(0,0,0,0.22);
        }
        .empty-card p { color: var(--muted); line-height: 1.5; }
        .spirit-link {
          display: inline-block;
          margin-top: 16px;
          color: var(--ink);
          background: linear-gradient(180deg, var(--accent-light), var(--gold) 64%, var(--amber));
          padding: 10px 22px;
          border-radius: 8px;
          text-decoration: none;
          font-weight: 700;
          font-size: 0.9rem;
          border: 1px solid rgba(255, 255, 255, 0.12);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .actions {
          margin-top: 24px;
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          justify-content: center;
        }
        .action-link {
          display: inline-block;
          color: var(--cream);
          background: rgba(255,255,255,0.05);
          border: 1px solid var(--line);
          padding: 10px 14px;
          border-radius: 8px;
          text-decoration: none;
          font-weight: 600;
          min-width: 158px;
          text-align: center;
          transition: transform 0.18s ease, border-color 0.18s ease, background-color 0.18s ease;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .action-link:hover { transform: translateY(-2px); background: var(--accent-soft); border-color: rgba(210,170,103,0.28); }
        .footer {
          text-align: center;
          padding: 24px 20px 34px;
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
        @media (max-width: 720px) {
          .header {
            padding: 26px 16px 22px;
            border-radius: 0 0 24px 24px;
          }
          .brand {
            width: min(78vw, 340px);
          }
          .menu-hero {
            margin-top: -8px;
            padding: 16px 14px;
          }
          .container {
            padding: 22px 2px 32px;
          }
          .menu-item {
            padding: 14px;
          }
          .menu-item-header {
            align-items: flex-start;
            flex-direction: column;
          }
          .menu-item-price {
            margin-top: 8px;
          }
        }
      </style>
    </head>
    <body>
      <div class="header">
        ${renderBrandMark({ className: 'brand', note: 'Menu' })}
        <div class="location-name">${escHTML(location.name)}</div>
        ${openState.isOpen === null ? '' : `
        <div class="status-line ${statusClass}">
          ${openState.status}${openState.todayHours ? ` · ${escHTML(openState.todayHours)}` : ''}
        </div>
        `}
      </div>
      <div class="menu-hero">
        <div class="menu-label">House Menu</div>
        <p>Browse every drink we mean business over. Updated by location and category.</p>
      </div>
      <div class="container">
        ${menuItems.length ? menuItems.map(category => `
          <section class="section">
            <div class="section-header">
              <div class="section-title">${escHTML(category.name)}</div>
              <div class="menu-count">${category.items ? category.items.length : 0} items</div>
            </div>
            ${category.description ? `<p class="menu-note">${escHTML(category.description)}</p>` : ''}
            ${category.items && category.items.length ? category.items.map(item => `
              <div class="menu-item">
                <div class="menu-item-header">
                  <div class="menu-item-name">${escHTML(item.name)}</div>
                  <div class="menu-item-price">${item.price ? formatMoney(item.price) : ''}</div>
                </div>
                ${item.description ? `<div class="menu-item-desc">${escHTML(item.description)}</div>` : ''}
              </div>
            `).join('') : `<p class="menu-note">No menu items yet.</p>`}
          </section>
        `).join('') : noMenuMessage}

        <div class="actions">
          <a class="action-link" href="/${location.slug}/specials">Today's Specials</a>
          <a class="action-link" href="/${location.slug}/draft">On Draft</a>
          <a class="action-link" href="/${location.slug}/spirits">Spirit List</a>
        </div>
      </div>

      <div class="footer">
        <a href="/${location.slug}" class="back-link">← Back to ${escHTML(location.name)}</a>
      </div>
    </body>
    </html>
  `;
}

module.exports = { generateMenuPage };
