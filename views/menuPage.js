const { getOpenState } = require('../helpers');

function escHTML(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

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
        <a href="https://public.apps.dramanddraught.com/spirits/${location.slug}" class="spirit-link" target="_blank">Browse our Spirit List →</a>
      </div>
    `
    : '';

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta name="theme-color" content="#d4af37">
      <title>Menu - ${escHTML(location.name)} - Dram & Draught</title>
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
          padding: 28px 20px 0;
        }
        .brand {
          font-size: clamp(1.55rem, 6.4vw, 2.15rem);
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          background: linear-gradient(135deg, #f3d7a5, var(--gold), var(--amber));
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .location-name {
          color: var(--muted);
          text-transform: uppercase;
          letter-spacing: 0.1em;
          margin-top: 4px;
          font-size: 0.9rem;
        }
        .menu-hero {
          margin: 14px auto 0;
          max-width: 680px;
          text-align: center;
          padding: 14px 14px 16px;
          border: 1px solid var(--line);
          border-radius: 18px;
          background: linear-gradient(170deg, rgba(23, 20, 28, 0.94), rgba(12, 11, 12, 0.9));
          box-shadow: 0 14px 34px rgba(0, 0, 0, 0.45);
        }
        .menu-hero p {
          color: #a59a8c;
          font-size: 0.9rem;
          margin-top: 4px;
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
          padding: 22px 16px 32px;
        }
        .section {
          margin: 20px 0;
        }
        .section-header {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 11px;
          padding: 0 2px;
        }
        .section-title {
          flex: 1;
          color: #fff;
          font-size: 1rem;
          letter-spacing: 0.02em;
          text-transform: uppercase;
          font-weight: 800;
        }
        .menu-note {
          color: var(--muted);
          font-size: 0.82rem;
          margin: 0 0 8px 4px;
        }
        .menu-note .muted-inline { color: #91897d; }
        .menu-item {
          background: var(--panel);
          border: 1px solid #2a262d;
          border-radius: 12px;
          padding: 13px 14px;
          margin-bottom: 10px;
          box-shadow: 0 10px 22px rgba(0,0,0,0.25);
        }
        .menu-item-header {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          gap: 12px;
        }
        .menu-item-name {
          font-weight: 700;
          color: #fff;
          font-size: 1rem;
          letter-spacing: 0.01em;
        }
        .menu-item-price {
          color: var(--gold);
          font-weight: 800;
          white-space: nowrap;
        }
        .menu-item-desc {
          color: #9ca3af;
          font-size: 0.84rem;
          margin-top: 4px;
          line-height: 1.4;
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
          background: var(--panel);
          border: 1px solid #2a262d;
          border-radius: 14px;
          padding: 34px 20px;
          margin-top: 14px;
          box-shadow: 0 10px 24px rgba(0,0,0,0.2);
        }
        .empty-card p { color: #a39887; line-height: 1.5; }
        .spirit-link {
          display: inline-block;
          margin-top: 16px;
          color: #14110d;
          background: linear-gradient(135deg, var(--gold), var(--amber));
          padding: 10px 22px;
          border-radius: 10px;
          text-decoration: none;
          font-weight: 700;
          font-size: 0.9rem;
          border: 1px solid rgba(255,255,255,0.2);
        }
        .actions {
          margin-top: 18px;
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          justify-content: center;
        }
        .action-link {
          display: inline-block;
          color: #ece0c9;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid var(--line);
          padding: 10px 14px;
          border-radius: 999px;
          text-decoration: none;
          font-weight: 600;
          min-width: 146px;
          text-align: center;
          transition: transform 0.18s ease, border-color 0.18s ease, background-color 0.18s ease;
        }
        .action-link:hover { transform: translateY(-2px); background: rgba(255,255,255,0.06); border-color: rgba(255,255,255,0.3); }
        .footer {
          text-align: center;
          padding: 24px 20px 34px;
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
        <div class="brand">Dram & Draught Menu</div>
        <div class="location-name">${escHTML(location.name)}</div>
        ${openState.isOpen === null ? '' : `
        <div class="status-line ${statusClass}">
          ${openState.status}${openState.todayHours ? ` · ${escHTML(openState.todayHours)}` : ''}
        </div>
        `}
      </div>
      <div class="menu-hero">
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
