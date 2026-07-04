// Admin-side printable spirit list. Two views:
//   generateSpiritListIndex — pick a location (admin chrome via adminLayout)
//   generateSpiritPrintPage — standalone, guest-facing spirit "book" for one
//     location: gold-framed cover page, then one chapter per spirit family
//     (Whiskey, Agave, Rum & Cane…) that starts on a fresh printed page,
//     two-column rows of name · ABV tag · bare price trio. A fixed gold
//     frame + running footer repeat on every printed page.
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

// Guest-book hygiene: catalog rows that would embarrass the printed list.
// Whole-string repetitions of test/sample/dummy/placeholder ("test",
// "testtesttest") and the "LASTONE" placeholder — never partial matches, so
// real bottlings are untouched.
const TEST_NAME_RE = /^(?:\s*(?:test|sample|dummy|placeholder)\s*)+\d*$|^last\s*one$/i;

// Split a spirit list into printable items and the ones held back (test
// entries, unpriced or $0 rows). The filtered list is surfaced in the admin
// editor so the underlying rows get fixed in the Bartender dashboard.
function filterPrintableSpirits(items = [], notes = {}) {
  const printable = [];
  const filtered = [];
  for (const it of items) {
    const raw = String(it.name || '').trim();
    const curated = (it.productId && notes[it.productId]) ? String(notes[it.productId]).trim() : '';
    const shown = curated || raw;
    const prices = [it.oneOzPrice, it.oneHalfOzPrice, it.twoOzPrice]
      .map((v) => (v == null || v === '' ? null : Number.parseFloat(v)))
      .filter((n) => n != null && Number.isFinite(n));
    let reason = null;
    if (TEST_NAME_RE.test(raw) || TEST_NAME_RE.test(shown)) reason = 'looks like a test entry';
    else if (prices.length === 0) reason = 'no pour prices on file';
    else if (prices.every((p) => p <= 0)) reason = 'all pour prices are $0';
    if (reason) filtered.push({ productId: it.productId || null, name: shown, category: it.primaryCategory || '', reason });
    else printable.push(it);
  }
  return { printable, filtered };
}

function generateSpiritPrintPage(location, items = [], opts = {}) {
  const notes = opts.notes || {}; // { productId: displayName } curated in the editor
  const abvNotes = opts.abvNotes || {}; // { productId: abv } override when the catalog has none
  const updated = opts.updatedAt
    || new Date().toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'long', day: 'numeric', year: 'numeric' });

  // Hold back test rows and unpriced/$0 pours — the editor page lists what
  // was hidden so the data gets fixed at the source.
  items = filterPrintableSpirits(items, notes).printable;

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
  // Fold near-duplicate catalog categories into one section: a generic name
  // whose word appears inside exactly one bigger sibling category merges into
  // it ("Liqueur" → "Amaro/Liqueur", "Rye" → "Rye Whiskey"). The count guard
  // keeps a large generic bucket (e.g. "Rum") from being mislabeled under a
  // smaller specific one (e.g. "Spiced Rum").
  for (const catMap of families.values()) {
    for (const cat of [...catMap.keys()]) {
      const norm = cat.trim().toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const wordRe = new RegExp(`(^|[^a-z])${norm}([^a-z]|$)`);
      const supersets = [...catMap.keys()].filter((o) =>
        o !== cat && wordRe.test(o.trim().toLowerCase()) && catMap.get(o).length > catMap.get(cat).length);
      if (supersets.length === 1) {
        catMap.get(supersets[0]).push(...catMap.get(cat));
        catMap.delete(cat);
      }
    }
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
    // Ledger columns: name | ABV | 1 oz | 1.5 oz | 2 oz. Positional — a
    // missing price leaves its cell empty so the other pours stay aligned
    // under the right header.
    const prices = [s.oneOzPrice, s.oneHalfOzPrice, s.twoOzPrice].map((v) => pour(v));
    return `<div class="sp-row blk">
      <span class="sp-name">${escHTML(name)}</span>
      <span class="sp-cell sp-abv">${abv ? escHTML(abv) : ''}</span>
      ${prices.map((p) => `<span class="sp-cell">${escHTML(p)}</span>`).join('')}
    </div>`;
  };

  // Column header row — pinned by the paginator to the top of every column
  // on every page, so wherever a guest's eye lands the ABV and pour columns
  // are labeled directly above the numbers.
  const colHead = `<div class="sp-cols-head"><span></span><span>abv</span><span>1 oz</span><span>1.5 oz</span><span>2 oz</span></div>`;

  // Source content for the client-side paginator: one hidden .fam block per
  // family holding a flat run of blocks — a head-blk (sub-category title +
  // column headers) followed by its rows. A script on the page measures these
  // and deals them into exact 8.5×11in page boxes, each with its own gold
  // frame, footer, and page number, so screen and paper look identical.
  // (Chrome no longer repeats position:fixed chrome on every printed page,
  // and CSS multicol fragmentation makes a mess of page breaks — explicit
  // page boxes are the only way to get clean letter pages.)
  const famSrc = orderedFamilies.map((fam) => {
    const catMap = families.get(fam);
    const famCats = [...catMap.keys()].sort((a, b) => {
      const r = catRank(a) - catRank(b);
      return r !== 0 ? r : a.localeCompare(b);
    });
    for (const c of famCats) catMap.get(c).sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
    let famCount = 0;
    const blocks = famCats.map((c) => {
      const rows = catMap.get(c);
      famCount += rows.length;
      // Skip a redundant sub-header when the only category equals the family.
      const showSub = !(famCats.length === 1 && c.trim().toLowerCase() === fam.trim().toLowerCase());
      return (showSub ? `<div class="blk head-blk"><h3 class="sp-sub-title"><span>${escHTML(c)}</span></h3></div>` : '')
        + rows.map(spiritRow).join('');
    }).join('');
    return `<div class="fam" data-title="${escHTML(fam)}" data-legend="${famCount} pour${famCount === 1 ? '' : 's'}">${blocks}</div>`;
  }).join('');

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
  html, body { margin: 0; padding: 0; background: #211d18; color: var(--ink); font-family: 'EB Garamond', Georgia, serif; -webkit-font-smoothing: antialiased; }

  /* ── Pages: real 8.5in × 11in boxes, identical on screen and paper ── */
  .pg { position: relative; width: 8.5in; height: 11in; margin: 26px auto; background: var(--paper); box-shadow: 0 14px 44px rgba(0,0,0,0.45); overflow: hidden; }
  .pg::before { content: ''; position: absolute; inset: 0.28in; border: 1.5px solid rgba(156,123,50,0.6); pointer-events: none; }
  .pg::after { content: ''; position: absolute; inset: 0.325in; border: 1px solid rgba(156,123,50,0.28); pointer-events: none; }
  .pg-inner { position: absolute; top: 0.55in; left: 0.62in; right: 0.62in; bottom: 0.68in; display: flex; flex-direction: column; }
  .pg-cols { flex: 1; min-height: 0; display: flex; gap: 34px; }
  .pg-col { flex: 1 1 0; min-width: 0; overflow: hidden; }
  .pg-foot { position: absolute; left: 0; right: 0; bottom: 0.155in; text-align: center; font-size: 0.58rem; letter-spacing: 0.22em; text-transform: uppercase; color: var(--muted); }

  /* ── Cover ── */
  .cover .pg-inner { align-items: center; justify-content: center; text-align: center; }
  .mast-est { font-size: 0.72rem; letter-spacing: 0.42em; text-transform: uppercase; color: var(--muted); margin-bottom: 16px; margin-left: 0.42em; }
  .mast-brand { font-family: 'Mostra One', Georgia, serif; font-weight: 700; font-size: 1.28rem; letter-spacing: 0.5em; text-transform: uppercase; color: var(--gold); margin-left: 0.5em; }
  .mast-div { display: flex; align-items: center; justify-content: center; gap: 13px; margin: 22px auto; width: 100%; max-width: 380px; color: var(--gold-lt); }
  .mast-div::before, .mast-div::after { content: ''; height: 1px; flex: 1; background: linear-gradient(90deg, transparent, var(--gold-lt)); }
  .mast-div::after { background: linear-gradient(90deg, var(--gold-lt), transparent); }
  .mast-dia { font-size: 0.62rem; letter-spacing: 0.34em; transform: translateY(-1px); }
  .mast-title { font-family: 'Mostra One', Georgia, serif; font-weight: 400; font-size: 3.4rem; letter-spacing: 0.05em; line-height: 1.04; margin: 0; }
  .mast-loc { font-style: italic; font-size: 1.35rem; color: var(--soft); margin-top: 14px; }
  .mast-sub { font-size: 0.76rem; color: var(--muted); letter-spacing: 0.18em; text-transform: uppercase; margin-top: 26px; }
  .mast-legend { font-size: 0.95rem; color: var(--soft); font-style: italic; margin-top: 8px; }
  .mast-note { font-size: 0.78rem; color: var(--muted); font-style: italic; margin-top: 34px; max-width: 4.6in; line-height: 1.5; }

  /* ── Family page header ── */
  .fam-head { text-align: center; margin-bottom: 18px; }
  .fam-eyebrow { font-size: 0.68rem; letter-spacing: 0.3em; text-transform: uppercase; color: var(--muted); margin-bottom: 12px; }
  .fam-title { font-family: 'Mostra One', Georgia, serif; font-weight: 400; font-size: 2.1rem; letter-spacing: 0.06em; line-height: 1.05; margin: 0; color: var(--ink); }
  .fam-title .cont { font-family: 'EB Garamond', Georgia, serif; font-style: italic; font-size: 1.05rem; color: var(--muted); letter-spacing: 0.02em; }
  .fam-rule { display: flex; align-items: center; justify-content: center; gap: 12px; margin: 12px auto 10px; max-width: 300px; color: var(--gold-lt); }
  .fam-rule::before, .fam-rule::after { content: ''; height: 1px; flex: 1; background: linear-gradient(90deg, transparent, var(--gold-lt)); }
  .fam-rule::after { background: linear-gradient(90deg, var(--gold-lt), transparent); }
  .fam-dia { font-size: 0.56rem; transform: translateY(-1px); }
  .fam-legend { font-size: 0.8rem; color: var(--muted); font-style: italic; }
  /* Continuation pages get a slim header so the columns gain room. */
  .fam-cont { margin-bottom: 12px; }
  .fam-cont .fam-title { font-size: 1.35rem; }
  .fam-cont .fam-eyebrow { margin-bottom: 7px; }

  /* ── Sub-category: centered small caps with flanking hairlines ── */
  .head-blk { margin: 12px 0 5px; }
  .pg-col > .sp-cols-head + .head-blk { margin-top: 4px; }
  .sp-sub-title { display: flex; align-items: center; gap: 10px; font-weight: 600; font-size: 0.74rem; letter-spacing: 0.2em; text-transform: uppercase; color: var(--gold); margin: 0; text-align: center; }
  .sp-sub-title::before, .sp-sub-title::after { content: ''; height: 1px; flex: 1; background: var(--hair); }
  .sp-sub-title span { flex: none; }

  /* ── Spirit rows: ledger grid ──
     Shared columns for the header row and every spirit row so ABVs and the
     three pour prices align straight down the page. Bare numbers under
     explicit "1 oz / 1.5 oz / 2 oz" headers. */
  .sp-row, .sp-cols-head { display: grid; grid-template-columns: 1fr 2.5em 3em 3.4em 3em; gap: 0 7px; align-items: baseline; }
  .sp-cols-head { padding: 0 0 3px; border-bottom: 1px solid #d9cfb8; margin-bottom: 6px; }
  .sp-cols-head span { text-align: right; font-size: 0.58rem; font-weight: 600; letter-spacing: 0.09em; text-transform: uppercase; color: #a2977f; }
  .sp-row { margin: 0; padding: 3px 0; border-bottom: 1px solid #f3edde; }
  .sp-name { font-size: 0.9rem; font-weight: 500; line-height: 1.2; color: var(--ink); }
  .sp-cell { text-align: right; font-size: 0.85rem; font-weight: 500; color: #4c4436; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .sp-abv { font-size: 0.62rem; font-weight: 400; color: #b0a68e; letter-spacing: 0.02em; }
  .sp-empty { text-align: center; color: var(--muted); padding: 60px; font-style: italic; }

  /* ── Screen-only print bar ── */
  .print-bar { position: fixed; top: 14px; right: 16px; display: flex; gap: 8px; z-index: 10; }
  .print-bar a, .print-bar button { font-family: 'EB Garamond', Georgia, serif; font-size: 0.95rem; padding: 9px 16px; border-radius: 8px; border: 1px solid var(--gold); cursor: pointer; text-decoration: none; }
  .print-bar button { background: var(--gold); color: #fff; }
  .print-bar a { background: #fff; color: var(--ink); }

  @media print {
    html, body { background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .print-bar { display: none !important; }
    /* Zero page margins: each .pg IS the full letter sheet, so the browser
       adds nothing around it and the gold frame lands identically on paper. */
    @page { size: letter; margin: 0; }
    .pg { margin: 0; box-shadow: none; break-after: page; page-break-after: always; }
    .pg:last-of-type { break-after: auto; page-break-after: auto; }
  }
</style></head><body>
  <div class="print-bar">
    <a href="/admin/spirit-list">← Back</a>
    <button type="button" onclick="window.print()">Print / Save PDF</button>
  </div>
  <div id="book">
    <section class="pg cover">
      <div class="pg-inner">
        <div class="mast-est">North Carolina</div>
        <div class="mast-brand">Dram &amp; Draught</div>
        <div class="mast-div"><span class="mast-dia">◆ ◆ ◆</span></div>
        <h1 class="mast-title">Spirit List</h1>
        <div class="mast-loc">${escHTML(location.name)}</div>
        <div class="mast-div"><span class="mast-dia">◆ ◆ ◆</span></div>
        <div class="mast-sub">${count} Pour${count === 1 ? '' : 's'} &middot; Updated ${escHTML(updated)}</div>
        <div class="mast-legend">Priced by the pour — 1 oz &middot; 1.5 oz &middot; 2 oz</div>
        <div class="mast-note">Ask your bartender about anything on these pages — flights, recommendations, and allocated pours included. Prices subject to change.</div>
      </div>
      <div class="pg-foot"></div>
    </section>
    ${items.length ? '' : '<section class="pg"><div class="pg-inner"><p class="sp-empty">No spirits found for this location yet.</p></div></section>'}
  </div>
  <div id="src" style="display:none">${famSrc}</div>
  <script>
  (function () {
    var LOC = ${JSON.stringify(location.name)};
    var COLHEAD = ${JSON.stringify(colHead)};
    var book = document.getElementById('book');
    var src = document.getElementById('src');
    var done = false;

    function newPage(title, legend, cont) {
      var pg = document.createElement('section');
      pg.className = 'pg';
      var inner = document.createElement('div');
      inner.className = 'pg-inner';
      var head = document.createElement('header');
      head.className = 'fam-head' + (cont ? ' fam-cont' : '');
      var eyebrow = document.createElement('div');
      eyebrow.className = 'fam-eyebrow';
      eyebrow.textContent = 'Dram & Draught — ' + LOC;
      head.appendChild(eyebrow);
      var h2 = document.createElement('h2');
      h2.className = 'fam-title';
      h2.textContent = title;
      if (cont) {
        var c = document.createElement('span');
        c.className = 'cont';
        c.textContent = ' · continued';
        h2.appendChild(c);
      }
      head.appendChild(h2);
      if (!cont) {
        var rule = document.createElement('div');
        rule.className = 'fam-rule';
        rule.innerHTML = '<span class="fam-dia">\\u25c6</span>';
        head.appendChild(rule);
        if (legend) {
          var lg = document.createElement('div');
          lg.className = 'fam-legend';
          lg.textContent = legend;
          head.appendChild(lg);
        }
      }
      inner.appendChild(head);
      var cols = document.createElement('div');
      cols.className = 'pg-cols';
      // Every column starts with the ABV / 1 oz / 1.5 oz / 2 oz header row so
      // the numbers are always labeled directly above wherever you're reading.
      cols.innerHTML = '<div class="pg-col">' + COLHEAD + '</div><div class="pg-col">' + COLHEAD + '</div>';
      inner.appendChild(cols);
      pg.appendChild(inner);
      var foot = document.createElement('div');
      foot.className = 'pg-foot';
      pg.appendChild(foot);
      book.appendChild(pg);
      return pg;
    }

    function paginate() {
      if (done) return;
      done = true;
      var fams = src.querySelectorAll('.fam');
      Array.prototype.forEach.call(fams, function (fam) {
        var title = fam.getAttribute('data-title') || '';
        var legend = fam.getAttribute('data-legend') || '';
        var blocks = Array.prototype.slice.call(fam.children);
        var pg = newPage(title, legend, false);
        var cols = pg.querySelectorAll('.pg-col');
        var ci = 0;
        var curSection = '';
        function fits(col) { return col.scrollHeight <= col.clientHeight + 1; }
        function advance() {
          ci++;
          if (ci >= 2) {
            pg = newPage(title, legend, true);
            cols = pg.querySelectorAll('.pg-col');
            ci = 0;
          }
        }
        function sectionTitle(text) {
          var d = document.createElement('div');
          d.className = 'blk head-blk';
          var h = document.createElement('h3');
          h.className = 'sp-sub-title';
          var s = document.createElement('span');
          s.textContent = text;
          h.appendChild(s);
          d.appendChild(h);
          return d;
        }
        blocks.forEach(function (b) {
          var isHead = b.className.indexOf('head-blk') !== -1;
          if (isHead) {
            var span = b.querySelector('.sp-sub-title span');
            curSection = span ? span.textContent : '';
          }
          var col = cols[ci];
          // A column picking up mid-section repeats the section name (e.g.
          // "Bourbon") under its header row so every column is self-labeled.
          if (!isHead && curSection && col.children.length === 1
              && col.firstElementChild.className.indexOf('sp-cols-head') !== -1) {
            col.appendChild(sectionTitle(curSection));
          }
          col.appendChild(b);
          if (!fits(col)) {
            var moved = [b];
            col.removeChild(b);
            // Never strand a section header at the bottom of a column —
            // carry it forward with the row that overflowed.
            var last = col.lastElementChild;
            while (last && last.className.indexOf('head-blk') !== -1) {
              col.removeChild(last);
              if (!isHead) moved.unshift(last);
              last = col.lastElementChild;
            }
            advance();
            col = cols[ci];
            if (!isHead && curSection && moved[0].className.indexOf('head-blk') === -1) {
              col.appendChild(sectionTitle(curSection));
            }
            moved.forEach(function (m) { col.appendChild(m); });
          }
        });
      });
      src.parentNode.removeChild(src);
      // A column holding only its header row (e.g. an unused right column on
      // a family's last page) reads as clutter — clear it.
      Array.prototype.forEach.call(book.querySelectorAll('.pg-col'), function (col) {
        if (col.children.length === 1 && col.firstElementChild.className.indexOf('sp-cols-head') !== -1) {
          col.removeChild(col.firstElementChild);
        }
      });
      // Footers: brand line on the cover, brand + page number on the rest.
      var pages = book.querySelectorAll('.pg');
      Array.prototype.forEach.call(pages, function (p, i) {
        var f = p.querySelector('.pg-foot');
        if (!f) return;
        f.textContent = i === 0
          ? 'Dram & Draught · ' + LOC
          : 'Dram & Draught · ' + LOC + ' · Page ' + i + ' of ' + (pages.length - 1);
      });
    }

    // Measure only after fonts load (Garamond metrics shift line wraps);
    // the timer is a safety net so the list never stays blank.
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () { setTimeout(paginate, 30); });
    }
    setTimeout(paginate, 2500);
  })();
  </script>
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

  // Rows held back from the printed list — surfaced here so the source rows
  // get fixed in the Bartender dashboard (they can't be edited from menuqr).
  const filteredOut = Array.isArray(opts.filteredOut) ? opts.filteredOut : [];
  const filteredPanel = filteredOut.length ? `
    <div class="card" style="margin-bottom:18px; padding:14px 16px; border:1px solid rgba(252,211,77,0.35); background:rgba(252,211,77,0.05);">
      <div style="font-weight:800; color:#fcd34d; margin-bottom:6px;">⚠︎ ${filteredOut.length} spirit${filteredOut.length === 1 ? ' is' : 's are'} hidden from the printed list</div>
      <div style="color:var(--text-muted,#999); font-size:0.85rem; margin-bottom:10px;">These come straight from the spirit catalog — fix or 86 them in the <strong>Bartender dashboard</strong> and they'll reappear (or disappear for good) here automatically.</div>
      <div style="display:grid; gap:4px; font-size:0.88rem;">
        ${filteredOut.map((f) => `<div><strong style="color:var(--text,#ddd);">${escHTML(f.name)}</strong> <span style="color:var(--text-muted,#8b949e);">${f.category ? `(${escHTML(f.category)}) ` : ''}— ${escHTML(f.reason)}</span></div>`).join('')}
      </div>
    </div>` : '';

  const content = `
    <div class="page-header"><div>
      <div class="admin-kicker">Spirits</div>
      <h1>Edit Spirit Names &mdash; ${escHTML(location.name)}</h1>
      <p class="page-subtitle">Set the short, recognizable name that prints on the list (the printed list shows just <strong>name · ABV · price</strong>). <strong>✨ Shorten</strong> suggests a tidy name from the full catalog name; <strong>🔍 Look up</strong> fills in a missing ABV. Both are AI suggestions — review before saving. Saved name changes are also written to the <strong>Bartender catalog</strong>, so every menu picks them up. ${customized} of ${items.length} have a custom name.</p>
    </div></div>
    ${filteredPanel}
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
        <button type="button" class="btn btn-secondary" id="ed-auto-shorten" title="AI-shortens long names in one pass and writes them to the Bartender catalog">⚡ Auto-shorten long names</button>
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
        var autoBtn = document.getElementById('ed-auto-shorten');
        if (autoBtn) autoBtn.addEventListener('click', function(){
          if (!confirm('AI-shorten up to 60 overly long names in one pass?\\n\\nNew names are saved AND written to the Bartender catalog, so every menu picks them up. You review the results on the next screen.')) return;
          autoBtn.disabled = true; autoBtn.textContent = '\\u26a1 Working\\u2026 up to a minute';
          var f = document.createElement('form');
          f.method = 'POST';
          f.action = '/admin/spirit-list/editor/auto-shorten?location=' + encodeURIComponent(LOC);
          document.body.appendChild(f);
          f.submit();
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

// ── Auto-shorten report: what the AI batch renamed, what synced to Bartender ──
function generateAutoShortenReport(location, data, user) {
  const { renamed = [], failed = [], remaining = 0, scanned = 0 } = data;
  const rows = renamed.map((r) => `
    <tr>
      <td class="as-from">${escHTML(r.from)}</td>
      <td class="as-arrow">→</td>
      <td class="as-to">${escHTML(r.to)}</td>
      <td class="as-sync">${r.synced ? '<span style="color:#6ee7b7">✓ Bartender catalog</span>' : '<span style="color:#fcd34d">menuqr only — catalog write failed</span>'}</td>
    </tr>`).join('');
  const failList = failed.length
    ? `<div class="as-fails"><strong>${failed.length} skipped:</strong> ${failed.map((f) => `${escHTML(f.name)} <span style="opacity:.7">(${escHTML(f.error)})</span>`).join(' · ')}</div>`
    : '';
  const content = `
    <div class="page-header"><div>
      <div class="admin-kicker"><a href="/admin/spirit-list" style="color:inherit;">Spirits</a> › Auto-shorten</div>
      <h1>Auto-Shorten Results — ${escHTML(location.name)}</h1>
      <p class="page-subtitle">${renamed.length} of ${scanned} long name${scanned === 1 ? '' : 's'} shortened. Renames marked ✓ were written to the Bartender catalog, so every menu picks them up. Review below — anything off is a quick fix in the name editor.</p>
    </div></div>
    <style>
      .as-table { width:100%; border-collapse:collapse; }
      .as-table td { padding:8px; border-bottom:1px solid rgba(255,255,255,0.06); font-size:0.92rem; vertical-align:top; }
      .as-from { color:var(--text-muted,#8b949e); max-width:380px; }
      .as-arrow { color:var(--gold-strong,#d4af37); white-space:nowrap; }
      .as-to { color:var(--text,#eee); font-weight:700; }
      .as-sync { font-size:0.8rem; white-space:nowrap; }
      .as-fails { margin-top:14px; color:#fca5a5; font-size:0.86rem; line-height:1.6; }
      .as-actions { display:flex; gap:10px; margin:18px 0; flex-wrap:wrap; }
    </style>
    <div class="as-actions">
      <a class="btn btn-secondary" href="/admin/spirit-list/editor?location=${encodeURIComponent(location.slug)}">← Back to name editor</a>
      <a class="btn btn-secondary" href="/admin/spirit-list/print?location=${encodeURIComponent(location.slug)}" target="_blank" rel="noopener">Print preview →</a>
      ${remaining > 0 ? `
        <form method="POST" action="/admin/spirit-list/editor/auto-shorten?location=${encodeURIComponent(location.slug)}" style="margin:0;">
          <button type="submit" class="btn btn-primary">Shorten the next ${remaining > 60 ? 60 : remaining} →</button>
        </form>` : ''}
    </div>
    ${remaining > 0 ? `<p style="color:var(--text-muted,#999);">${remaining} long name${remaining === 1 ? '' : 's'} still to go — run the next batch when ready.</p>` : '<p style="color:#6ee7b7;">All long names are done.</p>'}
    ${renamed.length ? `<div class="card" style="padding:8px 14px;"><table class="as-table"><tbody>${rows}</tbody></table></div>` : '<p style="color:var(--text-muted,#999);">Nothing needed shortening in this batch.</p>'}
    ${failList}`;
  return adminLayout('Auto-Shorten Results', content, user, { pathname: '/admin/spirit-list' });
}

module.exports = { generateSpiritPrintPage, generateSpiritListIndex, generateSpiritEditorPage, generateAbvSyncPage, generateAutoShortenReport, filterPrintableSpirits };
