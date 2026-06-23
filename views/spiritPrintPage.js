// Admin-side printable spirit list. Two views:
//   generateSpiritListIndex — pick a location (admin chrome via adminLayout)
//   generateSpiritPrintPage — standalone, print-optimized document for one
//     location, grouped by category, "detailed" rows (name · region/style ·
//     ABV + all pour prices), two-column, branded header + "Updated" date.
// Pulls live spirit data each load, so reprints are always current.

const { adminLayout } = require('./adminLayout');
const { escHTML } = require('./escapeHtml');

// Category display order: whiskey family first, then common spirit families,
// everything else alphabetical at the end.
const CATEGORY_ORDER = [
  'Bourbon', 'Rye Whiskey', 'Rye', 'Tennessee Whiskey', 'American Whiskey',
  'Single Malt Scotch', 'Scotch', 'Blended Scotch', 'Irish Whiskey',
  'Japanese Whisky', 'Canadian Whisky', 'Whiskey', 'Whisky',
  'Tequila', 'Mezcal', 'Agave', 'Rum', 'Cachaça',
  'Gin', 'Vodka', 'Cognac', 'Armagnac', 'Brandy',
  'Aperitif', 'Amaro', 'Liqueur', 'Other',
];

function catRank(c) {
  const norm = String(c || '').trim().toLowerCase();
  const i = CATEGORY_ORDER.findIndex((x) => x.toLowerCase() === norm);
  if (i >= 0) return i;
  return /(bourbon|whisk|scotch|rye|tennessee)/i.test(String(c || '')) ? 60 : 999;
}

function money(v) {
  if (v == null || v === '') return '';
  const n = Number.parseFloat(String(v));
  if (!Number.isFinite(n)) return '';
  return n % 1 === 0 ? `$${n}` : `$${n.toFixed(2)}`;
}

function generateSpiritPrintPage(location, items = [], opts = {}) {
  const updated = opts.updatedAt
    || new Date().toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'long', day: 'numeric', year: 'numeric' });

  const groups = new Map();
  for (const it of items) {
    const cat = (it.primaryCategory || 'Other').toString().trim() || 'Other';
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat).push(it);
  }
  const cats = [...groups.keys()].sort((a, b) => {
    const r = catRank(a) - catRank(b);
    return r !== 0 ? r : a.localeCompare(b);
  });
  for (const c of cats) groups.get(c).sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));

  const spiritRow = (s) => {
    const meta = [s.region, s.style].map((x) => (x ? String(x).trim() : '')).filter(Boolean);
    if (s.abv != null && s.abv !== '') {
      const a = Number.parseFloat(s.abv);
      if (Number.isFinite(a)) meta.push(`${a % 1 === 0 ? a : a.toFixed(1)}%`);
    }
    // Prices in fixed pour order (1 / 1.5 / 2 oz) — the header legend explains it.
    const prices = [s.oneOzPrice, s.oneHalfOzPrice, s.twoOzPrice]
      .filter((v) => v != null)
      .map((v) => money(v));
    return `<div class="sp-row">
      <div class="sp-line">
        <span class="sp-name">${escHTML(s.name || 'Unnamed')}</span>
        <span class="sp-dots"></span>
        ${prices.length ? `<span class="sp-price">${escHTML(prices.join(' / '))}</span>` : ''}
      </div>
      ${meta.length ? `<div class="sp-meta">${escHTML(meta.join(' · '))}</div>` : ''}
    </div>`;
  };

  const body = cats.length
    ? cats.map((c) => `<section class="sp-cat">
        <h2 class="sp-cat-title"><span>${escHTML(c)}</span></h2>
        ${groups.get(c).map(spiritRow).join('')}
      </section>`).join('')
    : '<p class="sp-empty">No spirits found for this location yet.</p>';

  const count = items.length;
  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Spirit List — Dram &amp; Draught ${escHTML(location.name)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,500;0,600;1,400&display=swap" rel="stylesheet">
<style>
  @font-face { font-family: 'Mostra One'; font-weight: 400; font-display: swap; src: url('/assets/fonts/MostraOne-Regular.ttf') format('truetype'); }
  @font-face { font-family: 'Mostra One'; font-weight: 700; font-display: swap; src: url('/assets/fonts/MostraOne-Bold.ttf') format('truetype'); }
  :root { --ink:#211c16; --muted:#8a7f6f; --gold:#9c7b32; --hair:#e4dccb; --paper:#fffdf8; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #e8e2d5; color: var(--ink); font-family: 'EB Garamond', Georgia, serif; }
  .sheet { max-width: 8.5in; margin: 20px auto; background: var(--paper); padding: 0.7in 0.8in 0.6in; box-shadow: 0 6px 30px rgba(0,0,0,0.14); }
  .doc-head { text-align: center; margin-bottom: 26px; }
  .doc-brand { font-family: 'Mostra One', Georgia, serif; font-weight: 700; font-size: 1.05rem; letter-spacing: 0.42em; text-transform: uppercase; color: var(--gold); margin-left: 0.42em; }
  .doc-rule { width: 64px; height: 1px; background: var(--gold); margin: 12px auto; opacity: 0.7; }
  .doc-title { font-family: 'Mostra One', Georgia, serif; font-weight: 400; font-size: 2.1rem; letter-spacing: 0.02em; margin: 0 0 6px; }
  .doc-sub { font-size: 0.9rem; color: var(--muted); font-style: italic; }
  .doc-legend { font-size: 0.78rem; color: var(--muted); letter-spacing: 0.03em; margin-top: 8px; }
  .cols { column-count: 2; column-gap: 38px; }
  @media (max-width: 640px) { .cols { column-count: 1; } }
  .sp-cat { break-inside: avoid-column; -webkit-column-break-inside: avoid; margin: 0 0 18px; }
  .sp-cat-title { text-align: center; font-family: 'Mostra One', Georgia, serif; font-size: 0.82rem; letter-spacing: 0.22em; text-transform: uppercase; color: var(--gold); margin: 4px 0 12px; display: flex; align-items: center; gap: 10px; }
  .sp-cat-title::before, .sp-cat-title::after { content: ''; flex: 1; height: 1px; background: var(--hair); }
  .sp-row { break-inside: avoid; -webkit-column-break-inside: avoid; margin: 0 0 11px; }
  .sp-line { display: flex; align-items: baseline; }
  .sp-name { font-size: 1.06rem; font-weight: 600; line-height: 1.25; color: var(--ink); }
  .sp-dots { flex: 1; margin: 0 7px; border-bottom: 1px dotted #c9bfa8; transform: translateY(-3px); min-width: 12px; }
  .sp-price { white-space: nowrap; font-size: 0.98rem; font-weight: 500; color: var(--ink); font-variant-numeric: tabular-nums; }
  .sp-meta { font-size: 0.84rem; color: var(--muted); font-style: italic; line-height: 1.3; margin-top: 1px; }
  .sp-empty { text-align: center; color: var(--muted); padding: 56px; font-style: italic; }
  .doc-foot { text-align: center; margin-top: 26px; padding-top: 12px; border-top: 1px solid var(--hair); color: var(--muted); font-size: 0.76rem; font-style: italic; }
  .print-bar { position: fixed; top: 14px; right: 16px; display: flex; gap: 8px; z-index: 10; }
  .print-bar a, .print-bar button { font-family: 'EB Garamond', Georgia, serif; font-size: 0.95rem; padding: 9px 16px; border-radius: 8px; border: 1px solid var(--gold); cursor: pointer; text-decoration: none; }
  .print-bar button { background: var(--gold); color: #fff; }
  .print-bar a { background: #fff; color: var(--ink); }
  @media print {
    html, body { background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .sheet { max-width: none; margin: 0; padding: 0; box-shadow: none; }
    .print-bar { display: none !important; }
    @page { margin: 0.55in; }
  }
</style></head><body>
  <div class="print-bar">
    <a href="/admin/spirit-list">← Back</a>
    <button type="button" onclick="window.print()">Print / Save PDF</button>
  </div>
  <div class="sheet">
    <header class="doc-head">
      <div class="doc-brand">Dram &amp; Draught</div>
      <div class="doc-rule"></div>
      <h1 class="doc-title">${escHTML(location.name)} Spirit List</h1>
      <div class="doc-sub">${count} spirit${count === 1 ? '' : 's'} &middot; Updated ${escHTML(updated)}</div>
      <div class="doc-legend">Prices shown per pour — 1 oz / 1.5 oz / 2 oz</div>
    </header>
    <div class="cols">${body}</div>
    <div class="doc-foot">Dram &amp; Draught ${escHTML(location.name)} &middot; Prices subject to change</div>
  </div>
</body></html>`;
}

function generateSpiritListIndex(locations = [], user) {
  const cards = locations.length
    ? locations.map((l) => `
      <div class="sl-card">
        <div class="sl-card-name">${escHTML(l.name)}</div>
        <a class="btn btn-primary" href="/admin/spirit-list/print?location=${encodeURIComponent(l.slug)}" target="_blank" rel="noopener">Open printable list →</a>
      </div>`).join('')
    : '<p style="color:var(--text-muted,#888);">No locations available.</p>';

  const content = `
    <div class="page-header"><div>
      <div class="admin-kicker">Spirits</div>
      <h1>Printable Spirit Lists</h1>
      <p class="page-subtitle">Open a location's list, then <strong>Print → Save as PDF</strong> or print on paper. It always reflects the current spirit data, so every reprint stays up to date.</p>
    </div></div>
    <style>
      .sl-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 14px; }
      .sl-card { background: #1a1a1d; border: 1px solid #2a2a2a; border-radius: 12px; padding: 18px; display: flex; flex-direction: column; gap: 14px; }
      .sl-card-name { font-size: 1.1rem; font-weight: 800; color: var(--text, #eee); }
      .sl-card .btn { text-align: center; }
    </style>
    <div class="sl-grid">${cards}</div>`;
  return adminLayout('Spirit Lists', content, user, { pathname: '/admin/spirit-list' });
}

module.exports = { generateSpiritPrintPage, generateSpiritListIndex };
