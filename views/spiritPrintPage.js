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
      if (Number.isFinite(a)) meta.push(`${a % 1 === 0 ? a : a.toFixed(1)}% ABV`);
    }
    const prices = [];
    if (s.oneOzPrice != null) prices.push(`1 oz ${money(s.oneOzPrice)}`);
    if (s.oneHalfOzPrice != null) prices.push(`1.5 oz ${money(s.oneHalfOzPrice)}`);
    if (s.twoOzPrice != null) prices.push(`2 oz ${money(s.twoOzPrice)}`);
    return `<div class="sp-row">
      <div class="sp-name">${escHTML(s.name || 'Unnamed')}${s.isAllocated ? ' <span class="sp-tag">Allocated</span>' : ''}</div>
      ${meta.length ? `<div class="sp-meta">${escHTML(meta.join(' · '))}</div>` : ''}
      ${prices.length ? `<div class="sp-prices">${escHTML(prices.join('   ·   '))}</div>` : ''}
    </div>`;
  };

  const body = cats.length
    ? cats.map((c) => `<section class="sp-cat">
        <h2 class="sp-cat-title">${escHTML(c)}</h2>
        ${groups.get(c).map(spiritRow).join('')}
      </section>`).join('')
    : '<p class="sp-empty">No spirits found for this location yet.</p>';

  const count = items.length;
  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Spirit List — Dram &amp; Draught ${escHTML(location.name)}</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #ece8df; color: #1c1a17; font-family: Georgia, 'Times New Roman', serif; }
  .sheet { max-width: 8.5in; margin: 18px auto; background: #fff; padding: 0.6in 0.7in; box-shadow: 0 4px 24px rgba(0,0,0,0.12); }
  .doc-head { text-align: center; border-bottom: 2px solid #b8913e; padding-bottom: 14px; margin-bottom: 22px; }
  .doc-brand { font-size: 0.78rem; letter-spacing: 0.36em; text-transform: uppercase; color: #b8913e; font-family: Arial, Helvetica, sans-serif; font-weight: 700; }
  .doc-title { font-size: 1.95rem; margin: 8px 0 4px; font-weight: 700; }
  .doc-sub { font-size: 0.84rem; color: #6b655c; font-family: Arial, Helvetica, sans-serif; }
  .cols { column-count: 2; column-gap: 32px; }
  @media (max-width: 640px) { .cols { column-count: 1; } }
  .sp-cat { break-inside: avoid-column; -webkit-column-break-inside: avoid; margin: 0 0 16px; }
  .sp-cat-title { font-size: 0.92rem; letter-spacing: 0.14em; text-transform: uppercase; color: #2c2622; border-bottom: 1px solid #ddd5c5; padding-bottom: 4px; margin: 0 0 9px; font-family: Arial, Helvetica, sans-serif; }
  .sp-row { break-inside: avoid; -webkit-column-break-inside: avoid; margin: 0 0 10px; }
  .sp-name { font-size: 1.03rem; font-weight: 700; line-height: 1.2; }
  .sp-tag { font-size: 0.58rem; letter-spacing: 0.08em; text-transform: uppercase; color: #fff; background: #b8913e; padding: 1px 5px; border-radius: 3px; font-family: Arial, sans-serif; vertical-align: middle; }
  .sp-meta { font-size: 0.78rem; color: #6b655c; font-style: italic; line-height: 1.3; }
  .sp-prices { font-size: 0.82rem; color: #2c2622; font-family: Arial, Helvetica, sans-serif; margin-top: 1px; }
  .sp-empty { text-align: center; color: #6b655c; padding: 48px; font-style: italic; }
  .doc-foot { text-align: center; margin-top: 22px; padding-top: 10px; border-top: 1px solid #ddd5c5; color: #8a8378; font-size: 0.72rem; font-family: Arial, sans-serif; }
  .print-bar { position: fixed; top: 14px; right: 16px; display: flex; gap: 8px; z-index: 10; }
  .print-bar a, .print-bar button { font-family: Arial, sans-serif; font-size: 0.85rem; padding: 9px 14px; border-radius: 8px; border: 1px solid #b8913e; cursor: pointer; text-decoration: none; }
  .print-bar button { background: #b8913e; color: #fff; }
  .print-bar a { background: #fff; color: #2c2622; }
  @media print {
    html, body { background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .sheet { max-width: none; margin: 0; padding: 0; box-shadow: none; }
    .print-bar { display: none !important; }
    @page { margin: 0.5in; }
  }
</style></head><body>
  <div class="print-bar">
    <a href="/admin/spirit-list">← Back</a>
    <button type="button" onclick="window.print()">Print / Save PDF</button>
  </div>
  <div class="sheet">
    <div class="doc-head">
      <div class="doc-brand">Dram &amp; Draught</div>
      <h1 class="doc-title">${escHTML(location.name)} &mdash; Spirit List</h1>
      <div class="doc-sub">${count} spirit${count === 1 ? '' : 's'} &middot; Updated ${escHTML(updated)}</div>
    </div>
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
