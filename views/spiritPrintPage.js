// Admin-side printable spirit list. Two views:
//   generateSpiritListIndex — pick a location (admin chrome via adminLayout)
//   generateSpiritPrintPage — standalone, print-optimized document for one
//     location, grouped by category, "detailed" rows (name · region/style ·
//     ABV + all pour prices), two-column, branded header + "Updated" date.
// Pulls live spirit data each load, so reprints are always current.

const { adminLayout } = require('./adminLayout');
const { escHTML } = require('./escapeHtml');
const { normalizeName } = require('../spiritAbvSync');

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

// Bare pour price (no $) — the printed list shows "6 · 9 · 12" per row and
// the masthead legend explains the units once, which keeps rows compact and
// lets long spirit names fit on one line.
function pour(v) {
  if (v == null || v === '') return '';
  const n = Number.parseFloat(String(v));
  if (!Number.isFinite(n)) return '';
  return n % 1 === 0 ? String(n) : n.toFixed(2);
}

// Major spirit families — each becomes a full-width section on the printed
// sheet, with the catalog's primaryCategory values nested as sub-sections.
const SPIRIT_FAMILIES = [
  { title: 'Whiskey', cats: ['Bourbon', 'Rye Whiskey', 'Rye', 'Tennessee Whiskey', 'American Whiskey', 'Single Malt Scotch', 'Scotch', 'Blended Scotch', 'Irish Whiskey', 'Japanese Whisky', 'Canadian Whisky', 'Whiskey', 'Whisky'] },
  { title: 'Agave', cats: ['Tequila', 'Mezcal', 'Agave', 'Raicilla', 'Sotol'] },
  { title: 'Rum & Cane', cats: ['Rum', 'Cachaça', 'Cachaca'] },
  { title: 'Gin & Vodka', cats: ['Gin', 'Vodka'] },
  { title: 'Brandy & Cognac', cats: ['Cognac', 'Armagnac', 'Brandy', 'Calvados', 'Pisco'] },
  { title: 'Aperitifs & Liqueurs', cats: ['Aperitif', 'Aperitivo', 'Amaro', 'Liqueur', 'Vermouth'] },
];
const FAMILY_FALLBACK = 'More Spirits';
const FAMILY_ORDER = SPIRIT_FAMILIES.map((f) => f.title).concat([FAMILY_FALLBACK]);

function familyTitleFor(cat) {
  const norm = String(cat || '').trim().toLowerCase();
  for (const f of SPIRIT_FAMILIES) if (f.cats.some((c) => c.toLowerCase() === norm)) return f.title;
  const s = String(cat || '');
  if (/(bourbon|whisk|scotch|\brye\b|tennessee)/i.test(s)) return 'Whiskey';
  if (/(tequila|mezcal|agave|raicilla|sotol)/i.test(s)) return 'Agave';
  if (/(rum|cacha)/i.test(s)) return 'Rum & Cane';
  if (/(gin|vodka)/i.test(s)) return 'Gin & Vodka';
  if (/(cognac|armagnac|brandy|calvados|pisco|eau)/i.test(s)) return 'Brandy & Cognac';
  if (/(aperitif|aperitivo|amaro|liqueur|vermouth|cordial)/i.test(s)) return 'Aperitifs & Liqueurs';
  return FAMILY_FALLBACK;
}

function generateSpiritPrintPage(location, items = [], opts = {}) {
  const notes = opts.notes || {}; // { productId: displayName } curated in the editor
  const abvNotes = opts.abvNotes || {}; // { productId: abv } override when the catalog has none
  const updated = opts.updatedAt
    || new Date().toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'long', day: 'numeric', year: 'numeric' });

  // Two-tier grouping: family → primaryCategory → spirits.
  const families = new Map(); // familyTitle -> Map<cat, items[]>
  for (const it of items) {
    const cat = (it.primaryCategory || 'Other').toString().trim() || 'Other';
    const fam = familyTitleFor(cat);
    if (!families.has(fam)) families.set(fam, new Map());
    const catMap = families.get(fam);
    if (!catMap.has(cat)) catMap.set(cat, []);
    catMap.get(cat).push(it);
  }
  const orderedFamilies = [...families.keys()].sort((a, b) => {
    const ia = FAMILY_ORDER.indexOf(a); const ib = FAMILY_ORDER.indexOf(b);
    return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib) || a.localeCompare(b);
  });

  const spiritRow = (s) => {
    // Short, recognizable name (curated in the editor) falls back to the source.
    const name = (s.productId && notes[s.productId]) ? String(notes[s.productId]).trim() : (s.name || 'Unnamed');
    // Effective ABV: catalog value, falling back to the editor override.
    let abvNum = (s.abv != null && s.abv !== '') ? Number.parseFloat(s.abv) : null;
    if ((abvNum == null || !Number.isFinite(abvNum)) && s.productId && abvNotes[s.productId] != null) {
      abvNum = Number.parseFloat(abvNotes[s.productId]);
    }
    let abv = '';
    if (abvNum != null && Number.isFinite(abvNum)) abv = `${abvNum % 1 === 0 ? abvNum : abvNum.toFixed(1)}%`;
    // Prices in fixed pour order (1 / 1.5 / 2 oz), bare numbers — the
    // masthead legend explains the units once.
    const prices = [s.oneOzPrice, s.oneHalfOzPrice, s.twoOzPrice]
      .filter((v) => v != null)
      .map((v) => pour(v));
    // The ABV tag lives inside the name span (joined with a thin space) so it
    // hugs the last word of the name instead of orphan-wrapping on its own line.
    return `<div class="sp-row">
      <div class="sp-line">
        <span class="sp-name">${escHTML(name)}${abv ? `<i class="sp-abv">&thinsp;${escHTML(abv)}</i>` : ''}</span>
        <span class="sp-dots"></span>
        ${prices.length ? `<span class="sp-price">${escHTML(prices.join(' · '))}</span>` : ''}
      </div>
    </div>`;
  };

  const body = items.length
    ? orderedFamilies.map((fam) => {
        const catMap = families.get(fam);
        const famCats = [...catMap.keys()].sort((a, b) => {
          const r = catRank(a) - catRank(b);
          return r !== 0 ? r : a.localeCompare(b);
        });
        for (const c of famCats) catMap.get(c).sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
        const subs = famCats.map((c) => {
          // Skip a redundant sub-header when the only category equals the family.
          const showSub = !(famCats.length === 1 && c.trim().toLowerCase() === fam.trim().toLowerCase());
          return `<section class="sp-sub">
            ${showSub ? `<h3 class="sp-sub-title">${escHTML(c)}</h3>` : ''}
            ${catMap.get(c).map(spiritRow).join('')}
          </section>`;
        }).join('');
        return `<h2 class="sp-fam"><span>${escHTML(fam)}</span></h2>${subs}`;
      }).join('')
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
  :root { --ink:#221d16; --soft:#5c5345; --muted:#8a7f6f; --gold:#9c7b32; --gold-lt:#bd9a5c; --hair:#e4dccb; --paper:#fffdf8; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #d8d0bf; color: var(--ink); font-family: 'EB Garamond', Georgia, serif; -webkit-font-smoothing: antialiased; }
  .sheet { max-width: 8.5in; margin: 24px auto; background: var(--paper); padding: 0.72in 0.85in 0.55in; box-shadow: 0 10px 44px rgba(40,30,12,0.22); border-top: 3px solid var(--gold); }

  /* ── Masthead ── */
  .mast { text-align: center; margin-bottom: 22px; }
  .mast-brand { font-family: 'Mostra One', Georgia, serif; font-weight: 700; font-size: 0.95rem; letter-spacing: 0.5em; text-transform: uppercase; color: var(--gold); margin-left: 0.5em; }
  .mast-div { display: flex; align-items: center; justify-content: center; gap: 13px; margin: 13px auto 15px; max-width: 360px; color: var(--gold-lt); }
  .mast-div::before, .mast-div::after { content: ''; height: 1px; flex: 1; background: linear-gradient(90deg, transparent, var(--gold-lt)); }
  .mast-div::after { background: linear-gradient(90deg, var(--gold-lt), transparent); }
  .mast-dia { font-size: 0.62rem; letter-spacing: 0.34em; transform: translateY(-1px); }
  .mast-title { font-family: 'Mostra One', Georgia, serif; font-weight: 400; font-size: 2.55rem; letter-spacing: 0.04em; line-height: 1; margin: 0; }
  .mast-loc { font-style: italic; font-size: 1.16rem; color: var(--soft); margin-top: 9px; }
  .mast-sub { font-size: 0.74rem; color: var(--muted); letter-spacing: 0.16em; text-transform: uppercase; margin-top: 12px; }
  .mast-legend { font-size: 0.82rem; color: var(--muted); font-style: italic; margin-top: 3px; }

  /* ── Columns ── */
  .cols { column-count: 2; column-gap: 38px; }
  @media (max-width: 640px) { .cols { column-count: 1; } }

  /* ── Family section header (spans both columns) ── */
  .sp-fam { column-span: all; -webkit-column-span: all; break-after: avoid; text-align: center; font-family: 'Mostra One', Georgia, serif; font-weight: 700; font-size: 1.18rem; letter-spacing: 0.24em; text-transform: uppercase; color: var(--ink); margin: 24px 0 13px; display: flex; align-items: center; justify-content: center; gap: 17px; }
  .sp-fam:first-child { margin-top: 2px; }
  .sp-fam::before, .sp-fam::after { content: ''; width: 54px; height: 2px; background: var(--gold); }
  .sp-fam span { padding-bottom: 2px; }

  /* ── Sub-category ── */
  .sp-sub { break-inside: avoid-column; -webkit-column-break-inside: avoid; page-break-inside: avoid; margin: 0 0 15px; }
  .sp-sub-title { font-weight: 600; font-size: 0.76rem; letter-spacing: 0.18em; text-transform: uppercase; color: var(--gold); margin: 2px 0 7px; padding-bottom: 4px; border-bottom: 1px solid var(--hair); }

  /* ── Spirit rows ──
     Roomy names + compact bare-number price trio ("6 · 9 · 12") so almost
     every row fits one line; the ABV rides inside the name span as a tiny
     muted tag. Chosen from rendered options against the full Cary list. */
  .sp-row { break-inside: avoid; -webkit-column-break-inside: avoid; margin: 0 0 5.5px; }
  .sp-line { display: flex; align-items: baseline; }
  .sp-name { font-size: 0.94rem; font-weight: 500; line-height: 1.22; color: var(--ink); }
  .sp-abv { font-size: 0.6rem; color: #b0a68e; font-style: normal; white-space: nowrap; letter-spacing: 0.02em; }
  .sp-dots { flex: 1; margin: 0 7px; border-bottom: 1px dotted #d5c9ab; transform: translateY(-3px); min-width: 14px; }
  .sp-price { white-space: nowrap; font-size: 0.86rem; font-weight: 500; color: #4c4436; font-variant-numeric: tabular-nums; letter-spacing: 0.01em; }
  .sp-empty { text-align: center; color: var(--muted); padding: 60px; font-style: italic; }

  /* ── Footer ── */
  .doc-foot { text-align: center; margin-top: 30px; padding-top: 14px; border-top: 1px solid var(--hair); color: var(--muted); font-size: 0.74rem; font-style: italic; letter-spacing: 0.03em; }

  /* ── Screen-only print bar ── */
  .print-bar { position: fixed; top: 14px; right: 16px; display: flex; gap: 8px; z-index: 10; }
  .print-bar a, .print-bar button { font-family: 'EB Garamond', Georgia, serif; font-size: 0.95rem; padding: 9px 16px; border-radius: 8px; border: 1px solid var(--gold); cursor: pointer; text-decoration: none; }
  .print-bar button { background: var(--gold); color: #fff; }
  .print-bar a { background: #fff; color: var(--ink); }

  @media print {
    html, body { background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .sheet { max-width: none; margin: 0; padding: 0; box-shadow: none; border-top: none; }
    .print-bar { display: none !important; }
    .sp-fam { margin-top: 22px; }
    @page { margin: 0.55in; }
  }
</style></head><body>
  <div class="print-bar">
    <a href="/admin/spirit-list">← Back</a>
    <button type="button" onclick="window.print()">Print / Save PDF</button>
  </div>
  <div class="sheet">
    <header class="mast">
      <div class="mast-brand">Dram &amp; Draught</div>
      <div class="mast-div"><span class="mast-dia">◆ ◆ ◆</span></div>
      <h1 class="mast-title">Spirit List</h1>
      <div class="mast-loc">${escHTML(location.name)}</div>
      <div class="mast-sub">${count} Pour${count === 1 ? '' : 's'} &middot; Updated ${escHTML(updated)}</div>
      <div class="mast-legend">Prices in dollars per pour — 1 oz &middot; 1.5 oz &middot; 2 oz</div>
    </header>
    <main class="cols">${body}</main>
    <div class="doc-foot">Dram &amp; Draught &middot; ${escHTML(location.name)} &middot; Prices subject to change</div>
  </div>
</body></html>`;
}

function generateSpiritListIndex(locations = [], user, opts = {}) {
  const cards = locations.length
    ? locations.map((l) => `
      <div class="sl-card">
        <div class="sl-card-name">${escHTML(l.name)}</div>
        <div class="sl-card-actions">
          <a class="btn btn-secondary" href="/admin/spirit-list/editor?location=${encodeURIComponent(l.slug)}">Edit names</a>
          <a class="btn btn-primary" href="/admin/spirit-list/print?location=${encodeURIComponent(l.slug)}" target="_blank" rel="noopener">Print →</a>
        </div>
      </div>`).join('')
    : '<p style="color:var(--text-muted,#888);">No locations available.</p>';

  const syncAction = opts.canSync
    ? '<a class="btn btn-secondary" href="/admin/spirit-list/sync-abv">⚖︎ Sync ABVs across locations</a>'
    : '';

  const content = `
    <div class="page-header"><div>
      <div class="admin-kicker">Spirits</div>
      <h1>Printable Spirit Lists</h1>
      <p class="page-subtitle">Open a location's list, then <strong>Print → Save as PDF</strong> or print on paper. It always reflects the current spirit data, so every reprint stays up to date.</p>
    </div>${syncAction ? `<div class="page-header-actions">${syncAction}</div>` : ''}</div>
    <style>
      .sl-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 14px; }
      .sl-card { background: #1a1a1d; border: 1px solid #2a2a2a; border-radius: 12px; padding: 18px; display: flex; flex-direction: column; gap: 14px; }
      .sl-card-name { font-size: 1.1rem; font-weight: 800; color: var(--text, #eee); }
      .sl-card-actions { display: flex; gap: 8px; flex-wrap: wrap; }
      .sl-card-actions .btn { flex: 1; text-align: center; white-space: nowrap; }
    </style>
    <div class="sl-grid">${cards}</div>`;
  return adminLayout('Spirit Lists', content, user, { pathname: '/admin/spirit-list' });
}

// ── Editor: curate each spirit's short printed name, with AI shorten assist ──
function generateSpiritEditorPage(location, items = [], notes = {}, user, opts = {}) {
  const abvNotes = opts.abvNotes || {}; // { productId: abv } override for spirits missing a catalog ABV
  const fmtAbv = (v) => {
    if (v == null || v === '') return '';
    const n = Number.parseFloat(v);
    if (!Number.isFinite(n)) return '';
    return n % 1 === 0 ? String(n) : n.toFixed(1);
  };
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

  const customized = items.filter((s) => s.productId && notes[s.productId] && String(notes[s.productId]).trim()).length;

  const row = (s) => {
    const prices = [s.oneOzPrice, s.oneHalfOzPrice, s.twoOzPrice].filter((v) => v != null).map((v) => money(v));
    const pid = String(s.productId || '');
    const orig = String(s.name || '');
    const cur = (s.productId && notes[s.productId]) ? String(notes[s.productId]) : orig;
    // ABV: catalog value is authoritative; the editor override only fills a gap.
    const srcAbv = fmtAbv(s.abv);
    const curAbv = srcAbv || (s.productId && abvNotes[s.productId] != null ? fmtAbv(abvNotes[s.productId]) : '');
    const abvMissing = !srcAbv; // catalog has no ABV — this is what "look up missing" targets
    return `<div class="sp-ed-row">
      <div class="sp-ed-info">
        <div class="sp-ed-src">${escHTML(orig)}</div>
        <div class="sp-ed-facts">${prices.length ? escHTML(prices.join('  /  ')) : '<span style="opacity:.6">no price on file</span>'}</div>
      </div>
      <div class="sp-ed-edit">
        <input type="text" class="sp-ed-input" name="name_${escHTML(pid)}" data-pid="${escHTML(pid)}" data-orig="${escHTML(orig)}" value="${escHTML(cur)}" placeholder="Short name for the printed list" />
        <div class="sp-ed-controls">
          <button type="button" class="btn btn-secondary btn-sm" data-ai="${escHTML(pid)}">✨ Shorten</button>
          <span class="sp-ed-abv-group">
            <input type="text" class="sp-ed-abv" name="abv_${escHTML(pid)}" data-abv-pid="${escHTML(pid)}" data-orig-abv="${escHTML(srcAbv)}" data-missing="${abvMissing ? '1' : '0'}" value="${escHTML(curAbv)}" placeholder="—" inputmode="decimal" title="ABV %" />
            <span class="sp-ed-abv-suffix">% ABV</span>
            <button type="button" class="btn btn-secondary btn-sm" data-abv="${escHTML(pid)}">🔍 Look up</button>
          </span>
          <span class="sp-ed-flags" data-flags="${escHTML(pid)}"></span>
        </div>
      </div>
    </div>`;
  };

  const body = cats.length
    ? cats.map((c) => `<section class="sp-ed-cat">
        <h2 class="sp-ed-cat-title">${escHTML(c)}</h2>
        ${groups.get(c).map(row).join('')}
      </section>`).join('')
    : '<p style="color:var(--text-muted);">No spirits found for this location.</p>';

  const content = `
    <div class="page-header"><div>
      <div class="admin-kicker">Spirits</div>
      <h1>Edit Spirit Names &mdash; ${escHTML(location.name)}</h1>
      <p class="page-subtitle">Set the short, recognizable name that prints on the list (the printed list shows just <strong>name · ABV · price</strong>). <strong>✨ Shorten</strong> suggests a tidy name from the full catalog name; <strong>🔍 Look up</strong> fills in a missing ABV. Both are AI suggestions — review before saving. ${customized} of ${items.length} have a custom name.</p>
    </div></div>
    <style>
      .sp-ed-bar { position: sticky; top: 0; z-index: 5; display: flex; align-items: center; gap: 12px; flex-wrap: wrap; background: var(--panel, #111); border: 1px solid var(--line, #2a2a2a); border-radius: 12px; padding: 12px 16px; margin-bottom: 18px; }
      .sp-ed-bar .grow { flex: 1; }
      #ed-bulk-status { color: var(--text-muted, #999); font-size: 0.85rem; }
      .sp-ed-cat { margin-bottom: 22px; }
      .sp-ed-cat-title { font-size: 0.82rem; letter-spacing: 0.14em; text-transform: uppercase; color: var(--gold-strong, #d4af37); border-bottom: 1px solid var(--line, #2a2a2a); padding-bottom: 6px; margin: 0 0 12px; }
      .sp-ed-row { display: grid; grid-template-columns: minmax(180px, 320px) 1fr; gap: 16px; padding: 11px 0; border-bottom: 1px solid rgba(255,255,255,0.05); align-items: start; }
      .sp-ed-src { color: var(--text-muted, #8b949e); font-size: 0.9rem; line-height: 1.3; }
      .sp-ed-facts { font-size: 0.8rem; color: var(--text-muted, #8b949e); opacity: 0.85; margin-top: 3px; line-height: 1.4; }
      .sp-ed-input { width: 100%; background: rgba(255,255,255,0.04); border: 1px solid var(--line, #2a2a2a); border-radius: 8px; color: var(--text, #eee); padding: 9px 11px; font: inherit; font-size: 0.98rem; font-weight: 600; }
      .sp-ed-controls { display: flex; align-items: center; gap: 10px; margin-top: 6px; flex-wrap: wrap; }
      .sp-ed-abv-group { display: inline-flex; align-items: center; gap: 6px; }
      .sp-ed-abv { width: 64px; background: rgba(255,255,255,0.04); border: 1px solid var(--line, #2a2a2a); border-radius: 8px; color: var(--text, #eee); padding: 7px 8px; font: inherit; font-size: 0.92rem; text-align: right; font-variant-numeric: tabular-nums; }
      .sp-ed-abv[data-missing="1"] { border-color: rgba(212,175,55,0.5); }
      .sp-ed-abv-suffix { font-size: 0.78rem; color: var(--text-muted, #8b949e); }
      .sp-ed-flags { font-size: 0.82rem; line-height: 1.4; }
      .sp-ed-flags .err { color: #f87171; }
      .sp-ed-flags .note { color: var(--text-muted, #8b949e); }
      @media (max-width: 700px) { .sp-ed-row { grid-template-columns: 1fr; gap: 6px; } }
    </style>
    <form method="POST" action="/admin/spirit-list/editor?location=${encodeURIComponent(location.slug)}">
      <div class="sp-ed-bar">
        <button type="submit" class="btn btn-primary">Save all</button>
        <button type="button" class="btn btn-secondary" id="ed-shorten-all">✨ Shorten all</button>
        <button type="button" class="btn btn-secondary" id="ed-abv-all">🔍 Look up missing ABVs</button>
        <span id="ed-bulk-status"></span>
        <span class="grow"></span>
        <a class="btn btn-secondary btn-sm" href="/admin/spirit-list/print?location=${encodeURIComponent(location.slug)}" target="_blank" rel="noopener">Print preview →</a>
      </div>
      ${body}
      <div style="margin-top:18px;"><button type="submit" class="btn btn-primary">Save all</button></div>
    </form>
    <script>
      (function(){
        var LOC = ${JSON.stringify(location.slug)};
        function findInput(pid){ var all = document.querySelectorAll('input[data-pid]'); for (var i=0;i<all.length;i++){ if (all[i].getAttribute('data-pid')===pid) return all[i]; } return null; }
        function findFlags(pid){ var all = document.querySelectorAll('[data-flags]'); for (var i=0;i<all.length;i++){ if (all[i].getAttribute('data-flags')===pid) return all[i]; } return null; }
        function showErr(pid, error){ var el = findFlags(pid); if (!el) return; el.innerHTML = error ? '<span class="err">' + String(error).replace(/</g,'&lt;') + '</span>' : ''; }
        function shortenOne(pid){
          return fetch('/admin/spirit-list/editor/ai', { method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body:'location='+encodeURIComponent(LOC)+'&productId='+encodeURIComponent(pid) })
            .then(function(r){ return r.json(); })
            .then(function(d){ var inp = findInput(pid); if (inp && d && d.name) inp.value = d.name; showErr(pid, d && d.error); return d; })
            .catch(function(){ showErr(pid, 'Request failed'); });
        }
        document.querySelectorAll('[data-ai]').forEach(function(btn){
          btn.addEventListener('click', function(){
            var pid = btn.getAttribute('data-ai'); var old = btn.textContent; btn.disabled = true; btn.textContent = '…';
            shortenOne(pid).then(function(){ btn.disabled = false; btn.textContent = old; });
          });
        });
        var allBtn = document.getElementById('ed-shorten-all');
        if (allBtn) allBtn.addEventListener('click', function(){
          // Only names you haven't touched yet (still equal to the full catalog name).
          var todo = Array.prototype.slice.call(document.querySelectorAll('input[data-pid]')).filter(function(t){ return t.value.trim() === (t.getAttribute('data-orig')||'').trim(); });
          var CAP = 80;
          if (!todo.length){ alert('Every name has already been shortened or edited.'); return; }
          if (todo.length > CAP) todo = todo.slice(0, CAP);
          if (!confirm('Use AI to shorten ' + todo.length + ' names? Review them before saving.')) return;
          var status = document.getElementById('ed-bulk-status'); allBtn.disabled = true;
          var i = 0;
          (function next(){
            if (i >= todo.length){ status.textContent = 'Done — review and Save all.'; allBtn.disabled = false; return; }
            status.textContent = 'Shortening ' + (i+1) + ' of ' + todo.length + '…';
            var pid = todo[i].getAttribute('data-pid'); i++;
            shortenOne(pid).then(next);
          })();
        });

        // ── ABV lookup (fill a missing ABV from the catalog) ──
        function findAbv(pid){ var all = document.querySelectorAll('input[data-abv-pid]'); for (var i=0;i<all.length;i++){ if (all[i].getAttribute('data-abv-pid')===pid) return all[i]; } return null; }
        function lookupAbvOne(pid){
          return fetch('/admin/spirit-list/editor/abv', { method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body:'location='+encodeURIComponent(LOC)+'&productId='+encodeURIComponent(pid) })
            .then(function(r){ return r.json(); })
            .then(function(d){
              var inp = findAbv(pid), fl = findFlags(pid);
              if (d && d.error){ showErr(pid, d.error); }
              else if (d && d.abv != null){ if (inp){ inp.value = d.abv; inp.setAttribute('data-missing','0'); } if (fl) fl.innerHTML = ''; }
              else if (fl){ fl.innerHTML = '<span class="note">No ABV found — enter it manually.</span>'; }
              return d;
            })
            .catch(function(){ showErr(pid, 'Request failed'); });
        }
        document.querySelectorAll('[data-abv]').forEach(function(btn){
          btn.addEventListener('click', function(){
            var pid = btn.getAttribute('data-abv'); var old = btn.textContent; btn.disabled = true; btn.textContent = '…';
            lookupAbvOne(pid).then(function(){ btn.disabled = false; btn.textContent = old; });
          });
        });
        var abvAllBtn = document.getElementById('ed-abv-all');
        if (abvAllBtn) abvAllBtn.addEventListener('click', function(){
          // Only spirits with no ABV filled in yet (blank input).
          var todo = Array.prototype.slice.call(document.querySelectorAll('input[data-abv-pid]')).filter(function(t){ return t.value.trim() === ''; });
          var CAP = 80;
          if (!todo.length){ alert('Every spirit already has an ABV.'); return; }
          if (todo.length > CAP) todo = todo.slice(0, CAP);
          if (!confirm('Use AI to look up ' + todo.length + ' missing ABV' + (todo.length === 1 ? '' : 's') + '? Review them before saving.')) return;
          var status = document.getElementById('ed-bulk-status'); abvAllBtn.disabled = true;
          var i = 0;
          (function next(){
            if (i >= todo.length){ status.textContent = 'Done — review and Save all.'; abvAllBtn.disabled = false; return; }
            status.textContent = 'Looking up ABV ' + (i+1) + ' of ' + todo.length + '…';
            var pid = todo[i].getAttribute('data-abv-pid'); i++;
            lookupAbvOne(pid).then(next);
          })();
        });
      })();
    </script>`;
  return adminLayout('Edit Spirit Names', content, user, { pathname: '/admin/spirit-list', flashMsg: opts.flashMsg });
}

// ── Cross-location ABV sync: preview + apply ──
// Shows what would be filled (per target location) when copying ABVs from a
// source location to same-named spirits that are currently missing one.
function generateAbvSyncPage(data, user, opts = {}) {
  const { source, locations = [], plan, sourceSlug } = data;
  const fmt = (n) => (n % 1 === 0 ? String(n) : Number(n).toFixed(1));

  const sourceOptions = locations.map((l) =>
    `<option value="${escHTML(l.slug)}"${l.slug === sourceSlug ? ' selected' : ''}>${escHTML(l.name)}</option>`).join('');

  const conflictNote = (plan.sourceConflicts && plan.sourceConflicts.length)
    ? `<div class="sync-warn">⚠︎ ${plan.sourceConflicts.length} spirit name${plan.sourceConflicts.length === 1 ? '' : 's'} at ${escHTML(source.name)} appear more than once with different ABVs — the first value is used. Review: ${escHTML(plan.sourceConflicts.map((c) => `${c.name} (${fmt(c.abv)} vs ${fmt(c.otherAbv)})`).join('; '))}</div>`
    : '';

  const locSections = plan.locations.map((loc) => {
    const fillRows = loc.fills.map((f) => {
      const via = normalizeName(f.name) === normalizeName(f.sourceName)
        ? '' : ` <span class="sync-via">(matched “${escHTML(f.sourceName)}”)</span>`;
      return `<tr><td>${escHTML(f.name)}${via}</td><td class="sync-abv">${escHTML(fmt(f.abv))}% ABV</td></tr>`;
    }).join('');
    const unmatchedList = loc.unmatched.length
      ? `<details class="sync-unmatched"><summary>${loc.unmatched.length} blank, no name match (left as-is)</summary><div>${loc.unmatched.map((u) => escHTML(u.name)).join(' · ')}</div></details>`
      : '';
    return `<section class="sync-loc">
      <h2>${escHTML(loc.name)} <span class="sync-count">${loc.fills.length} to fill · ${loc.alreadySet} already set · ${loc.unmatched.length} unmatched</span></h2>
      ${loc.fills.length ? `<table class="sync-table"><thead><tr><th>Spirit (this location)</th><th>ABV to set</th></tr></thead><tbody>${fillRows}</tbody></table>` : '<p class="sync-none">Nothing to fill here.</p>'}
      ${unmatchedList}
    </section>`;
  }).join('');

  const content = `
    <div class="page-header"><div>
      <div class="admin-kicker"><a href="/admin/spirit-list" style="color:inherit;">Spirits</a> › Sync ABVs</div>
      <h1>Sync ABVs Across Locations</h1>
      <p class="page-subtitle">Copies ABVs from a source location to same-named spirits elsewhere that are <strong>missing</strong> one. Existing ABVs are never changed. Matches by name (case/spacing/punctuation insensitive). Review below, then apply.</p>
    </div></div>
    <style>
      .sync-bar { display:flex; align-items:center; gap:12px; flex-wrap:wrap; background:var(--panel,#111); border:1px solid var(--line,#2a2a2a); border-radius:12px; padding:14px 16px; margin-bottom:18px; }
      .sync-bar label { color:var(--text-muted,#999); font-size:0.9rem; }
      .sync-bar select { background:rgba(255,255,255,0.04); border:1px solid var(--line,#2a2a2a); border-radius:8px; color:var(--text,#eee); padding:8px 10px; font:inherit; }
      .sync-summary { font-size:1.02rem; margin:0 0 16px; }
      .sync-summary strong { color:var(--gold-strong,#d4af37); }
      .sync-warn { background:rgba(212,175,55,0.08); border:1px solid rgba(212,175,55,0.4); border-radius:10px; padding:10px 14px; margin-bottom:16px; font-size:0.88rem; color:#e8d9a8; }
      .sync-loc { margin-bottom:22px; }
      .sync-loc h2 { font-size:1.05rem; border-bottom:1px solid var(--line,#2a2a2a); padding-bottom:6px; margin:0 0 10px; }
      .sync-count { font-size:0.8rem; font-weight:400; color:var(--text-muted,#8b949e); letter-spacing:0.02em; }
      .sync-table { width:100%; border-collapse:collapse; }
      .sync-table th { text-align:left; font-size:0.74rem; text-transform:uppercase; letter-spacing:0.08em; color:var(--text-muted,#8b949e); padding:4px 8px; }
      .sync-table td { padding:6px 8px; border-bottom:1px solid rgba(255,255,255,0.05); font-size:0.95rem; }
      .sync-abv { white-space:nowrap; font-variant-numeric:tabular-nums; color:var(--gold-strong,#d4af37); font-weight:600; }
      .sync-via { color:var(--text-muted,#8b949e); font-size:0.82rem; }
      .sync-none { color:var(--text-muted,#8b949e); font-style:italic; margin:4px 0; }
      .sync-unmatched { margin-top:8px; color:var(--text-muted,#8b949e); font-size:0.85rem; }
      .sync-unmatched summary { cursor:pointer; }
      .sync-unmatched div { margin-top:6px; opacity:0.85; line-height:1.6; }
      .page-header-actions { display:flex; align-items:center; }
    </style>
    <form method="GET" action="/admin/spirit-list/sync-abv" class="sync-bar">
      <label for="src">Source of truth:</label>
      <select id="src" name="source" onchange="this.form.submit()">${sourceOptions}</select>
      <span style="color:var(--text-muted,#777);font-size:0.82rem;">change to re-scan</span>
    </form>
    ${conflictNote}
    <p class="sync-summary"><strong>${escHTML(source.name)}</strong> has ${plan.sourceCount} spirit${plan.sourceCount === 1 ? '' : 's'} with an ABV on file. <strong>${plan.totalFills}</strong> blank ABV${plan.totalFills === 1 ? '' : 's'} across the other locations can be filled from it.</p>
    ${plan.totalFills ? `
      <form method="POST" action="/admin/spirit-list/sync-abv?source=${encodeURIComponent(sourceSlug)}" onsubmit="return confirm('Fill ${plan.totalFills} ABV${plan.totalFills === 1 ? '' : 's'} from ${escAttr(source.name)}? Existing ABVs are not touched.');" style="margin-bottom:8px;">
        <button type="submit" class="btn btn-primary">Apply — fill ${plan.totalFills} ABV${plan.totalFills === 1 ? '' : 's'}</button>
      </form>` : '<p class="sync-none">No blanks to fill — everything that matches a source name already has an ABV.</p>'}
    ${locSections}`;

  return adminLayout('Sync ABVs', content, user, { pathname: '/admin/spirit-list', flashMsg: opts.flashMsg });
}

// Minimal attribute-safe escaper for inline JS string literals (confirm dialog).
function escAttr(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '\\u0027' }[c])); }

module.exports = { generateSpiritPrintPage, generateSpiritListIndex, generateSpiritEditorPage, generateAbvSyncPage };
