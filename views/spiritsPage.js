const { getOpenState } = require('../helpers');
const { vintageThemeCss } = require('./publicTheme');
const { brandMarkCss, renderBrandMark } = require('./brandMark');
const { escHTML } = require('./escapeHtml');

function formatMoney(value) {
  if (value === null || value === undefined) return '';
  const numeric = Number.parseFloat(String(value));
  if (Number.isNaN(numeric)) return '';
  return `$${numeric.toFixed(2)}`;
}

function hasSpiritNotes(spirit) {
  return Boolean(
    spirit
    && (spirit.description
      || spirit.tastingNotes
      || spirit.noseNotes
      || spirit.palateNotes
      || spirit.finishNotes),
  );
}

function serializeForScript(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function generateSpiritsPage(location, spirits = [], hasError = false) {
  const openState = getOpenState(location);
  const statusClass = openState.isOpen === true ? 'status-open' : openState.isOpen === false ? 'status-closed' : 'status-unknown';
  const items = Array.isArray(spirits) ? spirits : [];
  const categories = Array.from(new Set(items.map((item) => item.primaryCategory || 'Other').filter(Boolean)))
    .sort((a, b) => a.localeCompare(b));
  const spiritData = items.map((item) => ({
    productId: String(item.productId),
    name: item.name || '',
    primaryCategory: item.primaryCategory || 'Other',
    subCategory: item.subCategory || '',
    distillery: item.distillery || '',
    region: item.region || '',
    style: item.style || '',
    bottleSize: item.bottleSize || '',
    abv: item.abv,
    oneOzPrice: item.oneOzPrice,
    oneHalfOzPrice: item.oneHalfOzPrice,
    twoOzPrice: item.twoOzPrice,
    isAllocated: Boolean(item.isAllocated),
    description: item.description || '',
    tastingNotes: item.tastingNotes || '',
    noseNotes: item.noseNotes || '',
    palateNotes: item.palateNotes || '',
    finishNotes: item.finishNotes || '',
  }));

  const listMarkup = items.length ? items.map((item) => {
    const metaParts = [
      item.primaryCategory || null,
      item.subCategory || null,
      item.distillery || null,
      item.region || null,
      item.style || null,
      item.abv ? `${item.abv}% ABV` : null,
      item.bottleSize || null,
    ].filter(Boolean);

    return `
      <article class="spirit-row" data-spirit-id="${escHTML(String(item.productId))}">
        <div class="spirit-main">
          <div class="spirit-name-row">
            <h2 class="spirit-name">${escHTML(item.name || 'Untitled Spirit')}</h2>
            ${item.isAllocated ? '<span class="spirit-badge">Allocated</span>' : ''}
          </div>
          ${metaParts.length ? `<div class="spirit-meta">${metaParts.map((part) => `<span>${escHTML(String(part))}</span>`).join('<span class="spirit-meta-dot">•</span>')}</div>` : ''}
        </div>
        <div class="spirit-pricing">
          ${item.oneOzPrice != null ? `<div class="price-chip"><span>1 oz</span><strong>${formatMoney(item.oneOzPrice)}</strong></div>` : ''}
          ${item.oneHalfOzPrice != null ? `<div class="price-chip"><span>1.5 oz</span><strong>${formatMoney(item.oneHalfOzPrice)}</strong></div>` : ''}
          ${item.twoOzPrice != null ? `<div class="price-chip"><span>2 oz</span><strong>${formatMoney(item.twoOzPrice)}</strong></div>` : ''}
        </div>
        <div class="spirit-actions-cell">
          ${hasSpiritNotes(item) ? `<button type="button" class="notes-button" data-open-notes="${escHTML(String(item.productId))}">Notes</button>` : '<span class="notes-placeholder">No notes</span>'}
        </div>
      </article>
    `;
  }).join('') : '';

  const emptyMarkup = hasError
    ? `
      <div class="empty-card">
        <p>The spirit list is temporarily unavailable.</p>
        <div class="actions">
          <a class="action-link" href="/${location.slug}/menu">House Menu</a>
          <a class="action-link" href="/${location.slug}/specials">Today's Specials</a>
        </div>
      </div>
    `
    : `
      <div class="empty-card">
        <p>No spirit list has been published for this location yet.</p>
        <div class="actions">
          <a class="action-link" href="/${location.slug}/menu">House Menu</a>
          <a class="action-link" href="/${location.slug}/specials">Today's Specials</a>
        </div>
      </div>
    `;

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta name="theme-color" content="#0f1012">
      <title>Spirit List - ${escHTML(location.name)} - Dram &amp; Draught</title>
      <style>
        ${vintageThemeCss()}
        ${brandMarkCss()}
        .header {
          text-align: center;
          padding: 30px 24px 26px;
          max-width: 980px;
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
        .hero {
          margin: -10px auto 0;
          max-width: 760px;
          text-align: center;
          padding: 20px 20px 18px;
          border: 1px solid var(--line);
          border-radius: 18px;
          background: linear-gradient(180deg, rgba(20, 21, 24, 0.95), rgba(9, 9, 10, 0.98));
          box-shadow: 0 16px 30px rgba(0, 0, 0, 0.3), inset 0 0 0 1px rgba(255,255,255,0.03);
          position: relative;
          z-index: 1;
        }
        .hero-label {
          color: var(--gold);
          font-size: 0.72rem;
          text-transform: uppercase;
          letter-spacing: 0.24em;
          font-weight: 800;
        }
        .hero-title {
          margin-top: 8px;
          font-size: clamp(1.7rem, 4vw, 2.4rem);
          color: var(--cream);
          letter-spacing: 0.04em;
        }
        .container {
          max-width: 980px;
          margin: 0 auto;
          padding: 24px 6px 36px;
        }
        .toolbar {
          margin: 24px 0 16px;
          padding: 16px;
          display: grid;
          grid-template-columns: minmax(0, 2fr) minmax(220px, 1fr) auto;
          gap: 12px;
          align-items: end;
          background: linear-gradient(180deg, rgba(20, 21, 24, 0.95), rgba(9, 9, 10, 0.98));
          border: 1px solid var(--line);
          border-radius: 16px;
          box-shadow: 0 12px 24px rgba(0,0,0,0.22);
        }
        .field {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .field label {
          color: var(--muted);
          font-size: 0.76rem;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          font-weight: 700;
        }
        .field input,
        .field select {
          width: 100%;
          background: rgba(255,255,255,0.05);
          color: var(--cream);
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: 10px;
          padding: 12px 14px;
          font: inherit;
        }
        .field input::placeholder { color: #8c8578; }
        .field input:focus,
        .field select:focus {
          outline: none;
          border-color: rgba(210,170,103,0.42);
          box-shadow: 0 0 0 3px rgba(210,170,103,0.12);
        }
        .toolbar-count {
          min-width: 160px;
          text-align: right;
          padding-bottom: 3px;
        }
        .toolbar-count strong {
          display: block;
          color: var(--cream);
          font-size: 1.6rem;
          line-height: 1;
        }
        .toolbar-count span {
          color: var(--muted);
          font-size: 0.82rem;
          line-height: 1.45;
        }
        .list-wrap {
          background: linear-gradient(180deg, rgba(20, 21, 24, 0.95), rgba(9, 9, 10, 0.98));
          border: 1px solid var(--line);
          border-radius: 18px;
          overflow: hidden;
          box-shadow: 0 16px 30px rgba(0,0,0,0.24);
        }
        .spirit-row {
          display: grid;
          grid-template-columns: minmax(0, 1.8fr) minmax(240px, 0.95fr) 112px;
          gap: 18px;
          align-items: center;
          padding: 18px 20px;
          border-bottom: 1px solid rgba(255,255,255,0.06);
        }
        .spirit-row:last-child { border-bottom: 0; }
        .spirit-row:hover { background: rgba(255,255,255,0.025); }
        .spirit-name-row {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }
        .spirit-name {
          margin: 0;
          color: var(--cream);
          font-size: 1.06rem;
          line-height: 1.3;
        }
        .spirit-badge {
          border-radius: 999px;
          padding: 4px 10px;
          border: 1px solid rgba(210,170,103,0.28);
          color: var(--gold);
          background: rgba(210,170,103,0.09);
          font-size: 0.68rem;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          font-weight: 800;
        }
        .spirit-meta {
          margin-top: 7px;
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          color: #c8c2ba;
          font-size: 0.84rem;
          line-height: 1.5;
        }
        .spirit-meta-dot {
          color: #776f63;
        }
        .spirit-pricing {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          flex-wrap: wrap;
        }
        .price-chip {
          min-width: 72px;
          text-align: right;
          padding: 8px 10px;
          border-radius: 10px;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
        }
        .price-chip span {
          display: block;
          color: var(--muted);
          font-size: 0.7rem;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          font-weight: 700;
        }
        .price-chip strong {
          display: block;
          margin-top: 3px;
          color: var(--gold);
          font-size: 0.94rem;
        }
        .spirit-actions-cell {
          display: flex;
          justify-content: flex-end;
          align-items: center;
        }
        .notes-button {
          width: 100%;
          max-width: 96px;
          color: var(--cream);
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: 10px;
          padding: 10px 12px;
          font: inherit;
          font-size: 0.8rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          cursor: pointer;
        }
        .notes-button:hover {
          border-color: rgba(210,170,103,0.28);
          background: rgba(210,170,103,0.12);
        }
        .notes-placeholder {
          color: #756e63;
          font-size: 0.78rem;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }
        .empty-card {
          text-align: center;
          background: linear-gradient(180deg, rgba(20, 21, 24, 0.95), rgba(9, 9, 10, 0.98));
          border: 1px solid var(--line);
          border-radius: 16px;
          padding: 34px 20px;
          box-shadow: 0 12px 24px rgba(0,0,0,0.22);
        }
        .empty-card p {
          color: var(--muted);
          line-height: 1.5;
        }
        .no-results {
          display: none;
          margin-top: 14px;
          text-align: center;
          padding: 18px;
          color: var(--muted);
          border: 1px dashed rgba(255,255,255,0.14);
          border-radius: 14px;
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
        .action-link:hover {
          transform: translateY(-2px);
          background: var(--accent-soft);
          border-color: rgba(210,170,103,0.28);
        }
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
        .modal {
          display: none;
          position: fixed;
          inset: 0;
          z-index: 40;
          background: rgba(2, 2, 3, 0.82);
          padding: 20px;
          align-items: center;
          justify-content: center;
        }
        .modal.is-open { display: flex; }
        .modal-card {
          position: relative;
          width: min(720px, 100%);
          max-height: min(80vh, 860px);
          overflow-y: auto;
          background: linear-gradient(180deg, rgba(20, 21, 24, 0.98), rgba(9, 9, 10, 0.99));
          border: 1px solid var(--line);
          border-radius: 20px;
          padding: 24px 22px 22px;
          box-shadow: 0 30px 80px rgba(0,0,0,0.5);
        }
        .modal-close {
          position: absolute;
          top: 14px;
          right: 14px;
          width: 36px;
          height: 36px;
          border-radius: 50%;
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(255,255,255,0.05);
          color: var(--cream);
          font-size: 1.2rem;
          cursor: pointer;
        }
        .modal-eyebrow {
          color: var(--gold);
          font-size: 0.74rem;
          text-transform: uppercase;
          letter-spacing: 0.18em;
          font-weight: 800;
        }
        .modal-title {
          margin: 8px 0 10px;
          color: var(--cream);
          font-size: clamp(1.8rem, 4vw, 2.4rem);
          line-height: 1.12;
        }
        .modal-meta {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          color: #c8c2ba;
          font-size: 0.86rem;
          line-height: 1.45;
        }
        .modal-section {
          margin-top: 18px;
          padding-top: 16px;
          border-top: 1px solid rgba(255,255,255,0.08);
        }
        .modal-section h3 {
          margin: 0 0 8px;
          color: var(--gold);
          font-size: 0.86rem;
          text-transform: uppercase;
          letter-spacing: 0.12em;
        }
        .modal-section p {
          color: #ddd7cf;
          line-height: 1.65;
          white-space: pre-wrap;
        }
        @media (max-width: 920px) {
          .toolbar {
            grid-template-columns: 1fr;
          }
          .toolbar-count {
            text-align: left;
            min-width: 0;
          }
          .spirit-row {
            grid-template-columns: 1fr;
          }
          .spirit-pricing,
          .spirit-actions-cell {
            justify-content: flex-start;
          }
        }
        @media (max-width: 720px) {
          .header {
            padding: 26px 16px 22px;
            border-radius: 0 0 24px 24px;
          }
          .brand {
            width: min(78vw, 340px);
          }
          .hero {
            margin-top: -8px;
            padding: 18px 14px 16px;
          }
          .container {
            padding: 22px 2px 32px;
          }
          .spirit-row {
            padding: 16px 14px;
          }
          .spirit-pricing {
            gap: 8px;
          }
          .price-chip {
            min-width: 68px;
          }
        }
      </style>
    </head>
    <body>
      <div class="header">
        ${renderBrandMark({ className: 'brand', note: 'Spirit List' })}
        <div class="location-name">${escHTML(location.name)}</div>
        ${openState.isOpen === null ? '' : `
        <div class="status-line ${statusClass}">
          ${openState.status}${openState.todayHours ? ` · ${escHTML(openState.todayHours)}` : ''}
        </div>
        `}
      </div>

      <div class="hero">
        <div class="hero-label">Poured By The Ounce</div>
        <div class="hero-title">Spirit List</div>
      </div>

      <div class="container">
        ${items.length ? `
          <section class="toolbar">
            <div class="field">
              <label for="spirits-search">Search The Backbar</label>
              <input id="spirits-search" type="search" placeholder="Search spirits, distilleries, regions, or styles" />
            </div>
            <div class="field">
              <label for="spirits-category">Filter By Category</label>
              <select id="spirits-category">
                <option value="all">All Spirits (${items.length})</option>
                ${categories.map((category) => `<option value="${escHTML(category)}">${escHTML(category)} (${items.filter((item) => (item.primaryCategory || 'Other') === category).length})</option>`).join('')}
              </select>
            </div>
            <div class="toolbar-count">
              <strong id="spirits-result-count">${items.length}</strong>
              <span id="spirits-result-context">of ${items.length} across all categories</span>
            </div>
          </section>

          <section class="list-wrap">
            <div id="spirits-list">
              ${listMarkup}
            </div>
          </section>
          <div id="spirits-no-results" class="no-results">No spirits match that search.</div>
        ` : emptyMarkup}

        <div class="actions">
          <a class="action-link" href="/${location.slug}/specials">Today's Specials</a>
          <a class="action-link" href="/${location.slug}/menu">House Menu</a>
          <a class="action-link" href="/${location.slug}/draft">On Draft</a>
        </div>
      </div>

      <div class="footer">
        <a href="/${location.slug}" class="back-link">← Back to ${escHTML(location.name)}</a>
      </div>

      <div class="modal" id="spirit-notes-modal" aria-hidden="true">
        <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title">
          <button type="button" class="modal-close" id="modal-close" aria-label="Close notes">×</button>
          <div class="modal-eyebrow" id="modal-eyebrow"></div>
          <h2 class="modal-title" id="modal-title"></h2>
          <div class="modal-meta" id="modal-meta"></div>
          <div id="modal-body"></div>
        </div>
      </div>

      <script>
        (function () {
          const spirits = ${serializeForScript(spiritData)};
          const list = document.getElementById('spirits-list');
          const searchInput = document.getElementById('spirits-search');
          const categorySelect = document.getElementById('spirits-category');
          const countEl = document.getElementById('spirits-result-count');
          const contextEl = document.getElementById('spirits-result-context');
          const noResultsEl = document.getElementById('spirits-no-results');
          const modal = document.getElementById('spirit-notes-modal');
          const modalClose = document.getElementById('modal-close');
          const modalEyebrow = document.getElementById('modal-eyebrow');
          const modalTitle = document.getElementById('modal-title');
          const modalMeta = document.getElementById('modal-meta');
          const modalBody = document.getElementById('modal-body');

          if (!list || !searchInput || !categorySelect || !countEl || !contextEl || !noResultsEl) return;

          const rows = Array.from(list.querySelectorAll('[data-spirit-id]'));
          const rowMap = new Map(rows.map((row) => [String(row.getAttribute('data-spirit-id')), row]));
          const spiritMap = new Map(spirits.map((item) => [String(item.productId), item]));

          function escapeHtml(value) {
            return String(value || '')
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;')
              .replace(/'/g, '&#39;');
          }

          function scoreSpirit(spirit, term) {
            const name = String(spirit.name || '').toLowerCase();
            const category = String(spirit.primaryCategory || '').toLowerCase();
            const subCategory = String(spirit.subCategory || '').toLowerCase();
            const distillery = String(spirit.distillery || '').toLowerCase();
            const region = String(spirit.region || '').toLowerCase();
            const style = String(spirit.style || '').toLowerCase();

            if (name === term) return 1000;
            if (name.startsWith(term)) return 500;
            if (name.includes(' ' + term)) return 250;
            if (name.includes(term)) return 100;
            if (category.startsWith(term) || distillery.startsWith(term) || region.startsWith(term)) return 75;
            if (category.includes(' ' + term) || distillery.includes(' ' + term) || region.includes(' ' + term)) return 50;
            if (category.includes(term) || distillery.includes(term) || region.includes(term) || subCategory.includes(term) || style.includes(term)) return 25;
            return 0;
          }

          function renderResults() {
            const term = String(searchInput.value || '').trim().toLowerCase();
            const category = String(categorySelect.value || 'all');

            const categoryItems = category === 'all'
              ? spirits.slice()
              : spirits.filter((item) => String(item.primaryCategory || 'Other') === category);

            const filtered = term
              ? categoryItems
                .map((item) => ({ item, score: scoreSpirit(item, term) }))
                .filter((entry) => entry.score > 0)
                .sort((a, b) => {
                  if (b.score !== a.score) return b.score - a.score;
                  return String(a.item.name || '').localeCompare(String(b.item.name || ''));
                })
                .map((entry) => entry.item)
              : categoryItems;

            const visibleIds = new Set(filtered.map((item) => String(item.productId)));
            rows.forEach((row) => {
              row.style.display = visibleIds.has(String(row.getAttribute('data-spirit-id'))) ? '' : 'none';
            });

            filtered.forEach((item) => {
              const row = rowMap.get(String(item.productId));
              if (row) list.appendChild(row);
            });

            countEl.textContent = String(filtered.length);
            contextEl.textContent = 'of ' + categoryItems.length + ' ' + (category === 'all' ? 'across all categories' : 'in ' + category);
            noResultsEl.style.display = filtered.length ? 'none' : 'block';
          }

          function buildMeta(spirit) {
            return [
              spirit.primaryCategory || '',
              spirit.subCategory || '',
              spirit.distillery || '',
              spirit.region || '',
              spirit.abv != null ? spirit.abv + '% ABV' : '',
              spirit.bottleSize || '',
            ].filter(Boolean);
          }

          function buildSection(title, text) {
            if (!text) return '';
            return '<section class="modal-section"><h3>' + escapeHtml(title) + '</h3><p>' + escapeHtml(text) + '</p></section>';
          }

          function openModal(spiritId) {
            const spirit = spiritMap.get(String(spiritId));
            if (!spirit || !modal) return;

            modalEyebrow.textContent = spirit.distillery || spirit.region || spirit.primaryCategory || '';
            modalTitle.textContent = spirit.name || '';
            modalMeta.innerHTML = buildMeta(spirit).map((part) => '<span>' + escapeHtml(part) + '</span>').join('<span class="spirit-meta-dot">•</span>');
            modalBody.innerHTML = [
              buildSection('Story', spirit.description),
              buildSection('Nose', spirit.noseNotes),
              buildSection('Palate', spirit.palateNotes),
              buildSection('Finish', spirit.finishNotes),
              buildSection('Tasting Notes', spirit.tastingNotes),
            ].join('');

            modal.classList.add('is-open');
            modal.setAttribute('aria-hidden', 'false');
            document.body.style.overflow = 'hidden';
          }

          function closeModal() {
            if (!modal) return;
            modal.classList.remove('is-open');
            modal.setAttribute('aria-hidden', 'true');
            document.body.style.overflow = '';
          }

          searchInput.addEventListener('input', renderResults);
          categorySelect.addEventListener('change', renderResults);

          list.addEventListener('click', function (event) {
            const button = event.target.closest('[data-open-notes]');
            if (!button) return;
            openModal(button.getAttribute('data-open-notes'));
          });

          if (modalClose) modalClose.addEventListener('click', closeModal);
          if (modal) {
            modal.addEventListener('click', function (event) {
              if (event.target === modal) closeModal();
            });
          }
          document.addEventListener('keydown', function (event) {
            if (event.key === 'Escape') closeModal();
          });
        })();
      </script>
    </body>
    </html>
  `;
}

module.exports = { generateSpiritsPage };
