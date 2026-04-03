const { adminLayout } = require('./adminLayout');

const DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
const DAY_LABELS = { MONDAY: 'Monday', TUESDAY: 'Tuesday', WEDNESDAY: 'Wednesday', THURSDAY: 'Thursday', FRIDAY: 'Friday', SATURDAY: 'Saturday', SUNDAY: 'Sunday' };
const MONTHS = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function escHTML(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function buildCategoryOptions(selected, options = []) {
  const merged = ['cocktail', 'beer', 'wine', 'whiskey', 'food', 'other']
    .concat((options || []).map((value) => String(value || '').trim().toLowerCase()))
    .filter(Boolean);

  const seen = new Set();
  const unique = [];
  for (const value of merged) {
    if (seen.has(value)) continue;
    seen.add(value);
    unique.push(value);
  }

  return ['']
    .concat(unique)
    .map((value) => {
      const selectedAttr = value === selected ? ' selected' : '';
      const label = value ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : 'None';
      return `<option value="${value}"${selectedAttr}>${label}</option>`;
    })
    .join('');
}

// ─── Half-Price Spirit Picker ───
function renderHalfPricePicker(day, theme, actionUrl, spiritCatalog, spiritCategories) {
  const config = theme.halfPriceConfig || {};
  const categories = (spiritCategories && spiritCategories.categories) || [];
  const catalog = spiritCatalog || [];
  const isWednesday = day === 'WEDNESDAY';
  const dayLabel = isWednesday ? 'Whiskey' : 'Agave Spirits';

  const savedCategories = config.categories || [];
  const savedPicks = config.picks || [];
  const savedPickSet = new Set(savedPicks.map(String));
  const priceMin = config.priceMin != null ? config.priceMin : '';
  const priceMax = config.priceMax != null ? config.priceMax : '';

  const WHISKEY_DEFAULTS = ['Bourbon', 'Rye Whiskey', 'Tennessee Whiskey', 'American Whiskey', 'Canadian Whisky', 'Irish Whiskey', 'Blended Scotch', 'Single Malt Scotch', 'Japanese Whisky', 'Whiskey', 'Flavored Whiskey', 'International Whiskey'];
  const AGAVE_DEFAULTS = ['Tequila', 'Mezcal'];

  // Determine active categories: saved config, or day defaults on first load
  const hasExistingConfig = Object.keys(config).length > 0;
  const activeCategories = hasExistingConfig ? savedCategories : (isWednesday ? WHISKEY_DEFAULTS : AGAVE_DEFAULTS);

  // Build category pill HTML
  const categoryPills = categories.map(cat => {
    const active = activeCategories.includes(cat);
    return `<button type="button" class="hp-pill${active ? ' hp-pill-active' : ''}" data-hp-cat="${escHTML(cat)}">${escHTML(cat)}</button>`;
  }).join('');

  // Group catalog by category for table rendering
  const grouped = {};
  catalog.forEach(s => {
    const cat = s.primaryCategory || 'Uncategorized';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(s);
  });

  // Build table rows grouped by category
  let tableRows = '';
  const sortedCats = Object.keys(grouped).sort();
  for (const cat of sortedCats) {
    const spirits = grouped[cat];
    const selectedInGroup = spirits.filter(s => savedPickSet.has(String(s.productId))).length;
    tableRows += `<tr class="hp-group-header" data-hp-group="${escHTML(cat)}">
      <td colspan="5">
        <span class="hp-group-label">${escHTML(cat)}</span>
        <span class="hp-group-count">(${spirits.length})</span>
        <span class="hp-group-selected" data-hp-gsel="${escHTML(cat)}">${selectedInGroup > 0 ? `${selectedInGroup} selected` : ''}</span>
        <button type="button" class="hp-grp-btn hp-grp-selall" data-hp-grpact="${escHTML(cat)}">all</button>
        <button type="button" class="hp-grp-btn hp-grp-selnone" data-hp-grpclr="${escHTML(cat)}">none</button>
      </td>
    </tr>`;
    for (const s of spirits) {
      const checked = savedPickSet.has(String(s.productId)) ? ' checked' : '';
      const halfPrice = s.oneOzPrice ? (s.oneOzPrice / 2).toFixed(0) : '';
      tableRows += `<tr class="hp-row${checked ? ' hp-row-picked' : ''}" data-hp-id="${escHTML(s.productId)}" data-hp-cat="${escHTML(s.primaryCategory || '')}" data-hp-name="${escHTML(s.name.toLowerCase())}" data-hp-price="${s.oneOzPrice || ''}">
        <td class="hp-cell-cb"><input type="checkbox" class="hp-spirit-cb" value="${escHTML(s.productId)}"${checked} /></td>
        <td class="hp-cell-name">${escHTML(s.name)}</td>
        <td class="hp-cell-cat">${escHTML(s.primaryCategory || '')}</td>
        <td class="hp-cell-price">${s.oneOzPrice ? `$${s.oneOzPrice}` : ''}</td>
        <td class="hp-cell-half">${s.oneOzPrice ? `$${halfPrice}` : ''}</td>
      </tr>`;
    }
  }

  const catalogJSON = JSON.stringify(catalog.map(s => ({
    id: s.productId,
    name: s.name,
    cat: s.primaryCategory,
    price: s.oneOzPrice,
  })));

  return `
    <div class="card hp-picker" style="background:rgba(212,175,55,0.05); border:1px solid rgba(212,175,55,0.2)">
      <style>
        .hp-picker .hp-pills { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:16px }
        .hp-picker .hp-pill { background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.15); color:#ccc; padding:5px 14px; border-radius:20px; font-size:0.85rem; cursor:pointer; transition:all 0.15s }
        .hp-picker .hp-pill:hover { border-color:rgba(212,175,55,0.5); color:#d4af37 }
        .hp-picker .hp-pill-active { background:rgba(212,175,55,0.25); border-color:#d4af37; color:#d4af37; font-weight:600 }
        .hp-picker .hp-filter-row { display:flex; gap:16px; align-items:flex-end; flex-wrap:wrap; margin-bottom:16px }
        .hp-picker .hp-filter-row label { font-size:0.82rem; color:#888; display:block; margin-bottom:3px }
        .hp-picker .hp-filter-row input { width:80px }
        .hp-picker .hp-filter-row .hp-search-wrap { flex:1; min-width:180px }
        .hp-picker .hp-filter-row .hp-search-wrap input { width:100% }
        .hp-picker .hp-status-bar { display:flex; align-items:center; gap:10px; padding:8px 12px; background:rgba(0,0,0,0.25); border-radius:6px; margin-bottom:2px; font-size:0.88rem; color:#aaa; flex-wrap:wrap }
        .hp-picker .hp-status-bar label { display:flex; align-items:center; gap:6px; cursor:pointer; color:#ccc; font-size:0.85rem }
        .hp-picker .hp-status-bar input { width:auto }
        .hp-picker .hp-status-counts { margin-left:auto; white-space:nowrap }
        .hp-picker .hp-status-counts strong { color:#d4af37 }
        .hp-picker .hp-view-btns { display:inline-flex; gap:0; border:1px solid #555; border-radius:4px; overflow:hidden; margin-left:8px }
        .hp-picker .hp-view-btn { background:transparent; border:none; color:#888; padding:3px 10px; font-size:0.78rem; cursor:pointer }
        .hp-picker .hp-view-btn:not(:last-child) { border-right:1px solid #555 }
        .hp-picker .hp-view-btn.hp-vb-active { background:rgba(212,175,55,0.2); color:#d4af37; font-weight:600 }
        .hp-picker .hp-table-wrap { max-height:500px; overflow-y:auto; border:1px solid #333; border-radius:8px; background:rgba(0,0,0,0.2) }
        .hp-picker .hp-table { width:100%; border-collapse:collapse }
        .hp-picker .hp-group-header td { padding:8px 12px 5px; font-weight:700; color:#d4af37; font-size:0.85rem; border-bottom:1px solid rgba(212,175,55,0.2); background:rgba(212,175,55,0.06) }
        .hp-picker .hp-group-count { color:#888; font-weight:400; font-size:0.8rem }
        .hp-picker .hp-group-selected { color:#8cb369; font-weight:500; font-size:0.78rem; margin-left:6px }
        .hp-picker .hp-grp-btn { background:transparent; border:1px solid #555; color:#888; padding:1px 8px; border-radius:3px; font-size:0.72rem; cursor:pointer; margin-left:4px; text-transform:uppercase; letter-spacing:0.03em }
        .hp-picker .hp-grp-btn:hover { border-color:#d4af37; color:#d4af37 }
        .hp-picker .hp-row td { padding:6px 12px; border-bottom:1px solid rgba(255,255,255,0.04); font-size:0.88rem; color:#ccc }
        .hp-picker .hp-row:hover td { background:rgba(212,175,55,0.06) }
        .hp-picker .hp-row-picked td { background:rgba(140,179,105,0.06) }
        .hp-picker .hp-row-picked .hp-cell-name { color:#8cb369 }
        .hp-picker .hp-cell-cb { width:30px; text-align:center }
        .hp-picker .hp-cell-cb input { width:auto; cursor:pointer }
        .hp-picker .hp-cell-name { font-weight:500 }
        .hp-picker .hp-cell-cat { color:#888; font-size:0.82rem }
        .hp-picker .hp-cell-price { color:#888; font-size:0.85rem; text-align:right; white-space:nowrap }
        .hp-picker .hp-cell-half { color:#d4af37; font-weight:600; font-size:0.85rem; text-align:right; white-space:nowrap }
        .hp-picker .hp-row-hidden { display:none }
      </style>

      <h2>Half-Price ${escHTML(dayLabel)}</h2>
      <p style="color:#aaa; margin-bottom:14px">
        Select categories to auto-pick all spirits in them. Use search and price to narrow down, then fine-tune individual picks.
        ${savedPicks.length > 0 ? `<br/><span style="color:#8cb369; font-weight:600">${savedPicks.length} spirits currently selected</span> &mdash; changes won't apply until you save.` : ''}
      </p>

      <label style="font-weight:700; color:#d4af37; margin-bottom:8px; display:block">Categories <span style="font-weight:400; color:#888; font-size:0.82rem">(click to toggle &mdash; activating selects all spirits in that category)</span></label>
      <div class="hp-pills" id="hp-pills">
        ${categoryPills || '<span style="color:#666">No categories loaded from bartender database</span>'}
      </div>

      <div class="hp-filter-row">
        <div>
          <label>Min $/oz</label>
          <input type="number" id="hp-priceMin" value="${escHTML(String(priceMin))}" min="0" step="1" placeholder="0" />
        </div>
        <div>
          <label>Max $/oz</label>
          <input type="number" id="hp-priceMax" value="${escHTML(String(priceMax))}" min="0" step="1" placeholder="any" />
        </div>
        <div class="hp-search-wrap">
          <label>Search</label>
          <input type="text" id="hp-search" placeholder="Search spirits by name..." />
        </div>
      </div>

      <div class="hp-status-bar" id="hp-status-bar">
        <button type="button" class="btn btn-secondary btn-sm" id="hp-select-all" style="padding:2px 10px; font-size:0.8rem">Select All</button>
        <button type="button" class="btn btn-secondary btn-sm" id="hp-deselect-all" style="padding:2px 10px; font-size:0.8rem">Deselect All</button>
        <div class="hp-view-btns">
          <button type="button" class="hp-view-btn hp-vb-active" data-hp-view="all">All</button>
          <button type="button" class="hp-view-btn" data-hp-view="selected">Selected</button>
          <button type="button" class="hp-view-btn" data-hp-view="unselected">Unselected</button>
        </div>
        <span class="hp-status-counts" id="hp-counts">...</span>
      </div>

      <div class="hp-table-wrap">
        <table class="hp-table" id="hp-table">
          <tbody>${tableRows}</tbody>
        </table>
      </div>

      <form method="POST" action="${actionUrl}" style="margin-top:14px">
        <input type="hidden" name="_action" value="saveHalfPrice" />
        <input type="hidden" name="halfPriceConfig" id="hp-config-json" value="${escHTML(JSON.stringify(config))}" />
        <button type="submit" class="btn btn-primary">Save Half-Price Selection</button>
      </form>
    </div>

    <script>
    (function() {
      var catalog = ${catalogJSON};
      var configInput = document.getElementById('hp-config-json');
      var pills = document.querySelectorAll('.hp-pill');
      var rows = document.querySelectorAll('.hp-row');
      var groupHeaders = document.querySelectorAll('.hp-group-header');
      var priceMinEl = document.getElementById('hp-priceMin');
      var priceMaxEl = document.getElementById('hp-priceMax');
      var searchEl = document.getElementById('hp-search');
      var selectAllBtn = document.getElementById('hp-select-all');
      var deselectAllBtn = document.getElementById('hp-deselect-all');
      var countsEl = document.getElementById('hp-counts');
      var viewMode = 'all';

      // --- View mode (All / Selected / Unselected) ---
      document.querySelectorAll('.hp-view-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
          document.querySelectorAll('.hp-view-btn').forEach(function(b) { b.classList.remove('hp-vb-active'); });
          btn.classList.add('hp-vb-active');
          viewMode = btn.getAttribute('data-hp-view');
          applyFilters();
        });
      });

      // --- Category pills: filter view only (no auto-select) ---
      pills.forEach(function(pill) {
        pill.addEventListener('click', function() {
          pill.classList.toggle('hp-pill-active');
          applyFilters();
        });
      });

      // --- Per-group select all / deselect all (only visible rows) ---
      document.querySelectorAll('.hp-grp-selall').forEach(function(btn) {
        btn.addEventListener('click', function() {
          var cat = btn.getAttribute('data-hp-grpact');
          rows.forEach(function(row) {
            if (row.getAttribute('data-hp-cat') === cat && !row.classList.contains('hp-row-hidden')) {
              var cb = row.querySelector('.hp-spirit-cb');
              if (cb) { cb.checked = true; row.classList.add('hp-row-picked'); }
            }
          });
          updateCounts(); buildConfig();
        });
      });
      document.querySelectorAll('.hp-grp-selnone').forEach(function(btn) {
        btn.addEventListener('click', function() {
          var cat = btn.getAttribute('data-hp-grpclr');
          rows.forEach(function(row) {
            if (row.getAttribute('data-hp-cat') === cat && !row.classList.contains('hp-row-hidden')) {
              var cb = row.querySelector('.hp-spirit-cb');
              if (cb) { cb.checked = false; row.classList.remove('hp-row-picked'); }
            }
          });
          updateCounts(); buildConfig();
        });
      });

      function getActiveCategories() {
        return Array.from(document.querySelectorAll('.hp-pill-active')).map(function(p) { return p.getAttribute('data-hp-cat'); });
      }

      // --- Filtering ---
      function applyFilters() {
        var activeCats = getActiveCategories();
        var minP = priceMinEl.value ? parseFloat(priceMinEl.value) : null;
        var maxP = priceMaxEl.value ? parseFloat(priceMaxEl.value) : null;
        var q = (searchEl.value || '').toLowerCase().trim();

        var visibleByGroup = {};
        var selectedByGroup = {};
        rows.forEach(function(row) {
          var cat = row.getAttribute('data-hp-cat');
          var name = row.getAttribute('data-hp-name');
          var price = row.getAttribute('data-hp-price') ? parseFloat(row.getAttribute('data-hp-price')) : null;
          var cb = row.querySelector('.hp-spirit-cb');
          var isChecked = cb && cb.checked;

          var catOk = activeCats.length === 0 || activeCats.indexOf(cat) !== -1;
          var priceOk = true;
          if (minP !== null && (price === null || price < minP)) priceOk = false;
          if (maxP !== null && (price === null || price > maxP)) priceOk = false;
          var searchOk = !q || name.indexOf(q) !== -1;

          var filterPass = catOk && priceOk && searchOk;

          // Apply view mode
          var viewPass = true;
          if (viewMode === 'selected' && !isChecked) viewPass = false;
          if (viewMode === 'unselected' && isChecked) viewPass = false;

          var visible = filterPass && viewPass;
          if (visible) {
            row.classList.remove('hp-row-hidden');
            visibleByGroup[cat] = (visibleByGroup[cat] || 0) + 1;
          } else {
            row.classList.add('hp-row-hidden');
          }

          // Track selected per group (regardless of visibility)
          if (isChecked) selectedByGroup[cat] = (selectedByGroup[cat] || 0) + 1;
        });

        // Show/hide group headers and update counts
        groupHeaders.forEach(function(hdr) {
          var g = hdr.getAttribute('data-hp-group');
          var cnt = visibleByGroup[g] || 0;
          var sel = selectedByGroup[g] || 0;
          if (cnt > 0) {
            hdr.classList.remove('hp-row-hidden');
            var countSpan = hdr.querySelector('.hp-group-count');
            if (countSpan) countSpan.textContent = '(' + cnt + ')';
            var selSpan = hdr.querySelector('.hp-group-selected');
            if (selSpan) selSpan.textContent = sel > 0 ? sel + ' selected' : '';
          } else {
            hdr.classList.add('hp-row-hidden');
          }
        });

        updateCounts();
        buildConfig();
      }

      // --- Counts ---
      function updateCounts() {
        var visibleCount = 0;
        var pickedCount = 0;
        rows.forEach(function(row) {
          if (!row.classList.contains('hp-row-hidden')) visibleCount++;
          var cb = row.querySelector('.hp-spirit-cb');
          if (cb && cb.checked) pickedCount++;
        });
        countsEl.innerHTML = visibleCount + ' shown &middot; <strong>' + pickedCount + ' of ' + catalog.length + ' selected</strong>';
      }

      // --- Select all / deselect visible spirits only ---
      selectAllBtn.addEventListener('click', function() {
        rows.forEach(function(row) {
          if (row.classList.contains('hp-row-hidden')) return;
          var cb = row.querySelector('.hp-spirit-cb');
          if (cb) { cb.checked = true; row.classList.add('hp-row-picked'); }
        });
        updateCounts(); buildConfig();
      });

      deselectAllBtn.addEventListener('click', function() {
        rows.forEach(function(row) {
          if (row.classList.contains('hp-row-hidden')) return;
          var cb = row.querySelector('.hp-spirit-cb');
          if (cb) { cb.checked = false; row.classList.remove('hp-row-picked'); }
        });
        updateCounts(); buildConfig();
      });

      // --- Build config JSON ---
      function buildConfig() {
        var config = {};
        config.categories = getActiveCategories();
        if (priceMinEl.value) config.priceMin = parseFloat(priceMinEl.value);
        if (priceMaxEl.value) config.priceMax = parseFloat(priceMaxEl.value);

        var picks = [];
        rows.forEach(function(row) {
          var cb = row.querySelector('.hp-spirit-cb');
          if (!cb) return;
          if (cb.checked) picks.push(cb.value);
        });
        config.picks = picks;
        if (configInput) configInput.value = JSON.stringify(config);
      }

      // --- Row checkbox change: update picked style ---
      function onCheckboxChange(row) {
        var cb = row.querySelector('.hp-spirit-cb');
        if (cb && cb.checked) row.classList.add('hp-row-picked');
        else row.classList.remove('hp-row-picked');
        updateCounts(); buildConfig();
      }

      // --- Event listeners ---
      priceMinEl.addEventListener('input', applyFilters);
      priceMaxEl.addEventListener('input', applyFilters);
      searchEl.addEventListener('input', applyFilters);
      rows.forEach(function(row) {
        var cb = row.querySelector('.hp-spirit-cb');
        if (cb) cb.addEventListener('change', function() { onCheckboxChange(row); });
      });

      // Init
      applyFilters();
    })();
    </script>
  `;
}

// ─── 7-Day Grid Dashboard ───
function specialsDashboard(themes, user, flashMsg) {
  const themeMap = {};
  themes.forEach(t => { themeMap[t.dayOfWeek] = t; });

  const grid = DAYS.map(day => {
    const theme = themeMap[day];
    return `
      <a href="/admin/specials/day/${day}" class="day-card" style="text-decoration:none">
        <div class="day-name">${DAY_LABELS[day]}</div>
        <div class="theme-name">${theme ? escHTML(theme.name) : '<em style="color:#555">Not set</em>'}</div>
        <div class="specials-count">${theme ? `${theme.specials.length} special${theme.specials.length !== 1 ? 's' : ''}` : ''}</div>
        ${theme ? `<span class="tag ${theme.isActive ? 'tag-active' : 'tag-inactive'}">${theme.isActive ? 'Active' : 'Inactive'}</span>` : ''}
      </a>
    `;
  }).join('');

  return adminLayout('Daily Specials', `
    <h1>Daily Specials</h1>
    <p style="color:#888; margin-bottom:20px">Manage the weekly programming for all locations. Click a day to edit its theme and specials.</p>
    <div class="grid-7">${grid}</div>
  `, user, { pathname: '/admin/specials', flashMsg });
}

// ─── Day Theme Editor ───
function dayThemeEditor(day, theme, specials, locations, locationSlug, user, message, categoryOptions = [], flashMsg, spiritCatalog = [], spiritCategories = {}, halfPriceTheme = null) {
  const isNew = !theme;
  const isOverride = !!locationSlug;
  const loc = locationSlug ? locations.find(l => l.slug === locationSlug) : null;

  const overrideTabs = locations.length > 0 ? `
    <div style="margin-bottom:20px; display:flex; gap:8px; flex-wrap:wrap">
      <a href="/admin/specials/day/${day}" class="btn ${!isOverride ? 'btn-primary' : 'btn-secondary'} btn-sm">Company Default</a>
      ${locations.map(l => `<a href="/admin/specials/day/${day}/location/${l.slug}" class="btn ${locationSlug === l.slug ? 'btn-primary' : 'btn-secondary'} btn-sm">${escHTML(l.name)}</a>`).join('')}
    </div>
  ` : '';

  const actionUrl = `/admin/specials/day/${day}${isOverride ? `/location/${locationSlug}` : ''}`;

  const specialsList = (specials || []).map((s, i) => `
    <div class="special-item" id="special-${s.id}" data-special-id="${s.id}" draggable="true">
      <div class="drag-handle" aria-label="Drag to reorder">\u22ee\u22ee</div>
      <div class="special-main">
        <div class="name">
          ${s.imageUrl ? `<img src="${escHTML(s.imageUrl)}" alt="" class="special-thumb" style="vertical-align:middle; margin-right:8px" />` : ''}
          ${escHTML(s.name)} <span class="muted">#${i + 1}</span>
          ${s.price ? ` <span class="price">${escHTML(s.price)}</span>` : ''}
        </div>
        ${s.description ? `<div class="desc">${escHTML(s.description)}</div>` : ''}
        <div style="display:flex; gap:4px; flex-wrap:wrap; margin-top:4px">
          ${s.isFeatured ? '<span class="tag" style="background:rgba(212,175,55,0.3); color:#d4af37">\u2605</span>' : ''}
          ${s.category ? `<span class="tag" style="background:rgba(212,175,55,0.15); color:#d4af37">${escHTML(s.category)}</span>` : ''}
          ${s.section ? `<span class="tag" style="background:rgba(183,115,51,0.15); color:#b87333">${escHTML(s.section)}</span>` : ''}
          ${s.badges ? escHTML(s.badges).split(',').map(b => `<span class="tag" style="background:rgba(212,175,55,0.15); color:#d4af37">${b.trim()}</span>`).join('') : ''}
        </div>
      </div>
      <div class="special-meta">
        <form method="POST" action="${actionUrl}" class="inline-form">
          <input type="hidden" name="_action" value="moveSpecial" />
          <input type="hidden" name="specialId" value="${s.id}" />
          <button type="submit" name="direction" value="up" class="btn btn-secondary btn-sm${i === 0 ? ' btn-disabled' : ''}" ${i === 0 ? 'disabled' : ''}>\u2191</button>
          <button type="submit" name="direction" value="down" class="btn btn-secondary btn-sm${i === specials.length - 1 ? ' btn-disabled' : ''}" ${i === specials.length - 1 ? 'disabled' : ''}>\u2193</button>
        </form>
        <button type="button" class="btn btn-secondary btn-sm" onclick="toggleEdit('${s.id}')">Edit</button>
        <form method="POST" action="${actionUrl}" style="display:inline">
          <input type="hidden" name="_action" value="deleteSpecial" />
          <input type="hidden" name="specialId" value="${s.id}" />
          <button type="submit" class="btn btn-danger btn-sm" onclick="return confirm('Delete this special?')">Del</button>
        </form>
      </div>
    </div>
    <div class="edit-form-inline" id="edit-${s.id}" style="display:none">
      <form method="POST" action="${actionUrl}">
        <input type="hidden" name="_action" value="editSpecial" />
        <input type="hidden" name="specialId" value="${s.id}" />
        <div class="form-row">
          <div><label>Name</label><input type="text" name="specialName" value="${escHTML(s.name)}" required /></div>
          <div><label>Price</label><input type="text" name="specialPrice" value="${escHTML(s.price)}" /></div>
        </div>
        <label>Description</label>
        <input type="text" name="specialDescription" value="${escHTML(s.description)}" placeholder="Short description" />
        <label>Detail Text</label>
        <textarea name="specialDetailText" placeholder="Longer sell copy / tasting notes">${escHTML(s.detailText)}</textarea>
        <div class="form-row">
          <div><label>Section</label><input type="text" name="specialSection" value="${escHTML(s.section)}" placeholder="e.g. $8 Cocktails" /></div>
          <div><label>Badges</label><input type="text" name="specialBadges" value="${escHTML(s.badges)}" placeholder="e.g. New, Staff Pick" /></div>
        </div>
        <div class="form-row">
          <div><label>Time Window</label><input type="text" name="specialTimeWindow" value="${escHTML(s.timeWindow)}" placeholder="e.g. Until 7 PM" /></div>
          <div><label>Category</label><select name="specialCategory">${buildCategoryOptions(s.category, categoryOptions)}</select></div>
          <div><label>Order</label><input type="number" name="specialOrder" value="${s.displayOrder}" /></div>
        </div>
        <label>Image URL</label>
        <input type="text" name="specialImageUrl" value="${escHTML(s.imageUrl)}" placeholder="https://..." />
        ${s.imageUrl ? `<img src="${escHTML(s.imageUrl)}" alt="Preview" class="image-preview" />` : ''}
        <label style="display:flex; align-items:center; gap:8px; margin-top:8px">
          <input type="checkbox" name="specialFeatured" ${s.isFeatured ? 'checked' : ''} style="width:auto" />
          <span>Featured (gold highlight)</span>
        </label>
        <div class="form-actions">
          <button type="submit" class="btn btn-primary btn-sm">Save</button>
          <button type="button" class="btn btn-secondary btn-sm" onclick="toggleEdit('${s.id}')">Cancel</button>
        </div>
      </form>
    </div>
  `).join('');

  return adminLayout(`${DAY_LABELS[day]} Theme`, `
    <h1>${DAY_LABELS[day]}${isOverride && loc ? ` &mdash; ${escHTML(loc.name)}` : ''}</h1>
    ${message ? `<div class="alert ${message.type === 'error' ? 'alert-error' : 'alert-success'}">${message.text}</div>` : ''}
    ${overrideTabs}

    <div class="card">
      <h2>Theme Details</h2>
      <form method="POST" action="/admin/specials/day/${day}${isOverride ? `/location/${locationSlug}` : ''}">
        <input type="hidden" name="_action" value="saveTheme" />
        <label>Theme Name</label>
        <input type="text" name="name" value="${escHTML(theme ? theme.name : '')}" required placeholder="e.g. Industry Night" />
        <label>Tagline</label>
        <input type="text" name="tagline" value="${escHTML(theme ? theme.tagline : '')}" placeholder="e.g. We take care of our own" />
        <label>Description</label>
        <textarea name="description" placeholder="Optional longer description">${escHTML(theme ? theme.description : '')}</textarea>
        <label style="display:flex; align-items:center; gap:8px; margin-top:16px">
          <input type="checkbox" name="isActive" ${!theme || theme.isActive ? 'checked' : ''} style="width:auto" />
          <span>Active</span>
        </label>
        <div class="form-actions">
          <button type="submit" class="btn btn-primary">Save Theme</button>
          ${theme ? `
            <button type="submit" name="_action" value="deleteTheme" class="btn btn-danger" onclick="return confirm('Delete this theme and all its specials?')">Delete Theme</button>
          ` : ''}
        </div>
      </form>
    </div>

    ${day === 'SUNDAY' && theme ? `
    <div class="card" style="background:rgba(212,175,55,0.05); border:1px solid rgba(212,175,55,0.2)">
      <h2>Break Even Bottles</h2>
      <p style="color:#ccc; line-height:1.6; margin-bottom:12px">Sunday bottles are managed through the <strong>Bartender Dashboard</strong>, not here. To update this week's bottles:</p>
      <ol style="color:#aaa; line-height:1.8; padding-left:20px; margin-bottom:12px">
        <li>Log in to the <a href="https://bartender.apps.dramanddraught.com" target="_blank" style="color:#d4af37">Bartender Dashboard</a></li>
        <li>Go to <strong>Break Even Bottles</strong> in the sidebar</li>
        <li>Select the location and set this week's bottles</li>
        <li>Mark them as <strong>Active</strong> &mdash; they'll appear on the public page automatically</li>
      </ol>
      <p style="color:#888; font-size:0.85rem">The public specials page pulls bottles directly from the dashboard each week. No changes needed here.</p>
    </div>
    ` : ''}

    ${(day === 'WEDNESDAY' || day === 'THURSDAY') && !isOverride ? `
    <div class="card" style="background:rgba(212,175,55,0.05); border:1px solid rgba(212,175,55,0.2)">
      <h2>Half-Price ${day === 'WEDNESDAY' ? 'Whiskey' : 'Agave Spirits'}</h2>
      <p style="color:#aaa">Half-price spirit selections are configured per location since each location has different inventory and pricing. Select a location tab above to configure.</p>
    </div>
    ` : ''}
    ${(day === 'WEDNESDAY' || day === 'THURSDAY') && isOverride && (halfPriceTheme || theme) ? renderHalfPricePicker(day, halfPriceTheme || theme, actionUrl, spiritCatalog, spiritCategories) : ''}

    ${theme ? `
    <div class="card">
      <h2>Specials</h2>

      <div class="add-special-box">
        <h3 style="margin-top:0">Add Special</h3>
        <form method="POST" action="${actionUrl}">
          <input type="hidden" name="_action" value="addSpecial" />
          <div class="form-row">
            <div>
              <label>Name</label>
              <input type="text" name="specialName" required placeholder="e.g. Well Cocktails" />
            </div>
            <div>
              <label>Price</label>
              <input type="text" name="specialPrice" placeholder="e.g. $5, 50% off" />
            </div>
          </div>
          <label>Description</label>
          <input type="text" name="specialDescription" placeholder="Short description" />
          <label>Detail Text</label>
          <textarea name="specialDetailText" placeholder="Longer sell copy / tasting notes"></textarea>
          <div class="form-row">
            <div>
              <label>Section</label>
              <input type="text" name="specialSection" placeholder="e.g. $8 Cocktails" />
            </div>
            <div>
              <label>Badges</label>
              <input type="text" name="specialBadges" placeholder="e.g. New, Staff Pick" />
            </div>
          </div>
          <div class="form-row">
            <div>
              <label>Time Window</label>
              <input type="text" name="specialTimeWindow" placeholder="e.g. Until 7 PM" />
            </div>
            <div>
              <label>Category</label>
              <select name="specialCategory">${buildCategoryOptions('', categoryOptions)}</select>
            </div>
            <div>
              <label>Display Order</label>
              <input type="number" name="specialOrder" value="${(specials || []).length}" />
            </div>
          </div>
          <label>Image URL</label>
          <input type="text" name="specialImageUrl" placeholder="https://..." />
          <label style="display:flex; align-items:center; gap:8px; margin-top:8px">
            <input type="checkbox" name="specialFeatured" style="width:auto" />
            <span>Featured (gold highlight)</span>
          </label>
          <div class="form-actions">
            <button type="submit" class="btn btn-primary">Add Special</button>
          </div>
        </form>
      </div>

      ${specialsList ? `
        <div class="special-controls">
          <form id="reorderForm" method="POST" action="${actionUrl}" class="inline-form">
            <input type="hidden" name="_action" value="reorderSpecials" />
            <input type="hidden" name="specialOrderPayload" id="specialOrderPayload" value="" />
            <button type="submit" class="btn btn-secondary btn-sm">Save order</button>
          </form>
          <form id="bulkCategoryForm" method="POST" action="${actionUrl}" class="inline-form">
            <input type="hidden" name="_action" value="setSpecialCategoryBulk" />
            <select name="specialCategory">${buildCategoryOptions('', categoryOptions)}</select>
            <button type="submit" class="btn btn-secondary btn-sm">Apply category to selected</button>
            <span class="muted count" id="selectedSpecialCount">0 selected</span>
          </form>
        </div>
        <div id="specialsList" class="specials-list">
          ${specialsList}
        </div>
      ` : '<p class="empty-state">No specials yet. Add one above.</p>'}
    </div>
    ` : ''}

    <p style="margin-top:20px"><a href="/admin/specials">&larr; Back to Weekly Overview</a></p>
    <script>
      function refreshSpecialOrderState() {
        const container = document.getElementById('specialsList');
        if (!container) return;

        const items = Array.from(container.querySelectorAll('.special-item'));
        items.forEach((item, index) => {
          item.dataset.orderIndex = String(index);
          var name = item.querySelector('.name');
          if (name) {
            name.innerHTML = name.textContent.replace(/\\s+#\\d+$/, '') + ' <span class="muted">#' + (index + 1) + '</span>';
          }
        });

        const payload = JSON.stringify(items.map((item) => item.dataset.specialId).filter(Boolean));
        var payloadEl = document.getElementById('specialOrderPayload');
        if (payloadEl) payloadEl.value = payload;

        var selectedCountEl = document.getElementById('selectedSpecialCount');
        if (selectedCountEl) {
          const selectedCount = items.filter((item) => {
            const checkbox = item.querySelector('input[type="checkbox"][form="bulkCategoryForm"]');
            return checkbox && checkbox.checked;
          }).length;
          selectedCountEl.textContent = selectedCount + ' selected';
        }
      }

      function getReorderList() {
        return document.getElementById('specialsList');
      }

      function initializeSpecialDragAndDrop() {
        var container = getReorderList();
        if (!container) return;

        var draggedItem = null;
        var items = Array.from(container.querySelectorAll('.special-item'));

        items.forEach((item) => {
          item.setAttribute('draggable', 'true');
          item.addEventListener('dragstart', function(event) {
            draggedItem = event.currentTarget;
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', draggedItem.dataset.specialId || '');
            event.currentTarget.classList.add('dragging');
          });

          item.addEventListener('dragend', function(event) {
            event.currentTarget.classList.remove('dragging');
            refreshSpecialOrderState();
            draggedItem = null;
          });

          item.addEventListener('dragover', function(event) {
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
            const target = event.currentTarget;
            const bounds = target.getBoundingClientRect();
            const offset = event.clientY - bounds.top;
            if (draggedItem && target !== draggedItem) {
              if (offset < bounds.height / 2) {
                container.insertBefore(draggedItem, target);
              } else {
                container.insertBefore(draggedItem, target.nextSibling);
              }
            }
          });
        });
      }

      function toggleEdit(id) {
        var el = document.getElementById('edit-' + id);
        if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
      }

      initializeSpecialDragAndDrop();
      refreshSpecialOrderState();
    </script>
  `, user, { pathname: '/admin/specials', flashMsg });
}

function buildFlightNewUrl(month, year, locationSlug = '', copyFromId = '') {
  const params = new URLSearchParams();
  if (month) params.set('month', String(month));
  if (year) params.set('year', String(year));
  if (locationSlug) params.set('location', String(locationSlug));
  if (copyFromId) params.set('copyFrom', String(copyFromId));
  const query = params.toString();
  return `/admin/flights/new${query ? `?${query}` : ''}`;
}

function getFlightScopeLabel(flight) {
  return flight && flight.location ? flight.location.name : 'Company Default';
}

function getFlightScopeSlug(flight) {
  return flight && flight.location ? String(flight.location.slug || '') : '';
}

// ─── Flights List ───
function flightsList(flights, locations, user, flashMsg) {
  const groups = new Map();
  (flights || []).forEach((flight) => {
    const key = `${flight.year}-${flight.month}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(flight);
  });

  const rows = Array.from(groups.values()).map((entries) => {
    const variants = [...entries];
    const sample = variants[0];
    const companyDefault = variants.find((entry) => !entry.locationId) || null;
    const overrides = variants.filter((entry) => !!entry.locationId);
    const manageTarget = companyDefault || overrides[0] || null;
    const missingLocations = (locations || []).filter((location) => !overrides.some((entry) => entry.locationId === location.id));

    const defaultCell = companyDefault
      ? `
        <div><a href="/admin/flights/${companyDefault.id}">${escHTML(companyDefault.theme)}</a></div>
        <div style="color:#888; font-size:0.9rem; margin-top:4px">
          ${escHTML(companyDefault.price || 'Price not set')} • ${companyDefault.pours.length} pour${companyDefault.pours.length !== 1 ? 's' : ''}
          <span class="tag ${companyDefault.isActive ? 'tag-active' : 'tag-inactive'}" style="margin-left:8px">${companyDefault.isActive ? 'Active' : 'Inactive'}</span>
        </div>
      `
      : `
        <div style="color:#888">No company default yet.</div>
        <div style="margin-top:8px">
          <a href="${buildFlightNewUrl(sample.month, sample.year, '', manageTarget ? manageTarget.id : '')}" class="btn btn-secondary btn-sm">Create Shared Default</a>
        </div>
      `;

    const overridesCell = overrides.length > 0
      ? `
        <div style="display:flex; gap:8px; flex-wrap:wrap">
          ${overrides.map((entry) => `
            <a href="/admin/flights/${entry.id}" class="btn btn-secondary btn-sm">${escHTML(getFlightScopeLabel(entry))}</a>
          `).join('')}
        </div>
        ${companyDefault && missingLocations.length > 0 ? `
          <div style="color:#888; font-size:0.85rem; margin-top:8px">
            ${missingLocations.length} location${missingLocations.length !== 1 ? 's' : ''} still use the company default.
          </div>
        ` : ''}
      `
      : `
        <div style="color:#888">No location overrides. All locations use the company default.</div>
        ${companyDefault && missingLocations.length > 0 ? `
          <div style="margin-top:8px; display:flex; gap:8px; flex-wrap:wrap">
            ${missingLocations.slice(0, 3).map((location) => `
              <a href="${buildFlightNewUrl(sample.month, sample.year, location.slug, companyDefault.id)}" class="btn btn-secondary btn-sm">Override ${escHTML(location.name)}</a>
            `).join('')}
            ${missingLocations.length > 3 ? `<span style="color:#888; font-size:0.85rem">+${missingLocations.length - 3} more in editor</span>` : ''}
          </div>
        ` : ''}
      `;

    return `
      <tr>
        <td>${MONTHS[sample.month]} ${sample.year}</td>
        <td>${defaultCell}</td>
        <td>${overridesCell}</td>
        <td>${manageTarget ? `<a href="/admin/flights/${manageTarget.id}" class="btn btn-secondary btn-sm">Manage</a>` : `<a href="${buildFlightNewUrl(sample.month, sample.year)}" class="btn btn-secondary btn-sm">Create</a>`}</td>
      </tr>
    `;
  }).join('');

  return adminLayout('Flights', `
    <h1>Tasting Flights</h1>
    <p style="color:#888; margin-bottom:16px">Set a company default for the month, then create location overrides only when a bar needs a different lineup.</p>
    <a href="/admin/flights/new" class="btn btn-primary" style="margin-bottom:16px">New Flight</a>
    ${flights.length === 0 ? '<div class="empty-state">No flights yet. Create one to get started.</div>' : `
      <table>
        <thead><tr><th>Month</th><th>Company Default</th><th>Location Overrides</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `}
  `, user, { pathname: '/admin/flights', flashMsg });
}

// ─── Flight Editor ───
function flightEditor(flight, isNew, user, message, flashMsg, options = {}) {
  const locations = options.locations || [];
  const relatedFlights = options.relatedFlights || [];
  const selectedLocationSlug = options.selectedLocationSlug || getFlightScopeSlug(flight);
  const selectedLocation = selectedLocationSlug ? locations.find((location) => location.slug === selectedLocationSlug) : null;
  const pours = flight && Array.isArray(flight.pours) ? [...flight.pours].sort((a, b) => a.displayOrder - b.displayOrder) : [];
  const now = new Date();
  const defaultMonth = flight ? flight.month : now.getMonth() + 1;
  const defaultYear = flight ? flight.year : now.getFullYear();
  const companyDefault = relatedFlights.find((entry) => !entry.locationId) || null;
  const currentScopeSlug = selectedLocation ? selectedLocation.slug : getFlightScopeSlug(flight);
  const isOverride = !!currentScopeSlug;
  const copySource = options.copySource || null;
  const copySourceId = isNew ? (copySource ? copySource.id : '') : (flight ? flight.id : '');

  const monthOptions = Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}" ${defaultMonth === i + 1 ? 'selected' : ''}>${MONTHS[i + 1]}</option>`).join('');
  const yearOptions = Array.from({ length: 3 }, (_, i) => {
    const y = now.getFullYear() + i - 1;
    return `<option value="${y}" ${defaultYear === y ? 'selected' : ''}>${y}</option>`;
  }).join('');

  const scopeOptions = [
    `<option value=""${!selectedLocation ? ' selected' : ''}>Company Default</option>`,
    ...locations.map((location) => `<option value="${escHTML(location.slug)}"${selectedLocation && selectedLocation.slug === location.slug ? ' selected' : ''}>${escHTML(location.name)}</option>`),
  ].join('');

  const tabs = locations.length > 0 ? `
    <div style="margin-bottom:20px; display:flex; gap:8px; flex-wrap:wrap">
      <a href="${companyDefault ? `/admin/flights/${companyDefault.id}` : buildFlightNewUrl(defaultMonth, defaultYear, '', copySourceId)}" class="btn ${!currentScopeSlug ? 'btn-primary' : 'btn-secondary'} btn-sm">Company Default${companyDefault ? '' : ' +'}</a>
      ${locations.map((location) => {
        const existing = relatedFlights.find((entry) => getFlightScopeSlug(entry) === location.slug) || null;
        const href = existing ? `/admin/flights/${existing.id}` : buildFlightNewUrl(defaultMonth, defaultYear, location.slug, copySourceId || (companyDefault ? companyDefault.id : ''));
        const label = `${escHTML(location.name)}${existing ? '' : ' +'}`;
        return `<a href="${href}" class="btn ${currentScopeSlug === location.slug ? 'btn-primary' : 'btn-secondary'} btn-sm">${label}</a>`;
      }).join('')}
    </div>
    <p style="color:#888; font-size:0.85rem; margin-top:-8px; margin-bottom:16px">Tabs marked with <strong>+</strong> create a copy for that location so you can swap a product without changing everyone else.</p>
  ` : '';

  const scopeSummary = selectedLocation
    ? `This override only affects ${escHTML(selectedLocation.name)}. Delete it any time to fall back to the company default.`
    : 'This is the shared flight for every location that does not have its own override.';

  const copyNote = copySource
    ? `
      <div class="card" style="background:rgba(212,175,55,0.08); border:1px solid rgba(212,175,55,0.18)">
        <strong>Prefilled from ${escHTML(getFlightScopeLabel(copySource))}.</strong>
        <div style="color:#888; margin-top:6px">You can change pours, price, or description before saving this ${selectedLocation ? 'location override' : 'company default'}.</div>
      </div>
    `
    : '';

  const scopeField = isNew ? `
    <label>Applies To</label>
    <select name="locationSlug">${scopeOptions}</select>
    <p style="color:#888; font-size:0.85rem; margin-top:8px">Use Company Default when most locations share the same flight. Create a location override only when one bar needs different pours.</p>
  ` : `
    <label>Applies To</label>
    <div style="margin-top:8px">
      <span class="tag" style="background:rgba(212,175,55,0.15); color:#d4af37">${escHTML(selectedLocation ? selectedLocation.name : 'Company Default')}</span>
    </div>
    <p style="color:#888; font-size:0.85rem; margin-top:8px">${scopeSummary}</p>
  `;

  const pourFields = [0, 1, 2].map((i) => {
    const p = pours[i] || {};
    return `
      <div class="card">
        <h3>Pour ${i + 1}</h3>
        <label>Name</label>
        <input type="text" name="pour${i}_name" value="${escHTML(p.spiritName)}" ${i === 0 ? 'required' : ''} placeholder="e.g. Westward Single Malt, Pinot Grigio, Espresso Martini" />
        <label>Pour Size</label>
        <input type="text" name="pour${i}_size" value="${escHTML(p.pourSize)}" placeholder="e.g. 1 oz" />
        <label>Description</label>
        <input type="text" name="pour${i}_desc" value="${escHTML(p.description)}" placeholder="e.g. Portland, Oregon — or grape varietal, cocktail style" />
      </div>
    `;
  }).join('');

  const deleteLabel = isOverride ? 'Delete Override' : 'Delete Flight';
  const deleteConfirm = isOverride
    ? 'Delete this override and fall back to the company default for this location?'
    : 'Delete this flight?';

  return adminLayout(isNew ? 'New Flight' : 'Edit Flight', `
    <h1>${isNew ? 'Create Flight' : 'Edit Flight'}</h1>
    ${message ? `<div class="alert ${message.type === 'error' ? 'alert-error' : 'alert-success'}">${message.text}</div>` : ''}
    ${tabs}
    ${copyNote}
    <form method="POST" action="/admin/flights/${isNew ? 'new' : flight.id}">
      <div class="card">
        <h2>Flight Details</h2>
        ${scopeField}
        <label>Theme</label>
        <input type="text" name="theme" value="${escHTML(flight ? flight.theme : '')}" required placeholder="e.g. American Single Malts" />
        <label>Description</label>
        <textarea name="description" placeholder="Optional description of the flight theme">${escHTML(flight ? flight.description : '')}</textarea>
        <div class="form-row">
          <div>
            <label>Month</label>
            <select name="month">${monthOptions}</select>
          </div>
          <div>
            <label>Year</label>
            <select name="year">${yearOptions}</select>
          </div>
          <div>
            <label>Price</label>
            <input type="text" name="price" value="${escHTML(flight ? flight.price : '$15')}" placeholder="e.g. $15" />
          </div>
        </div>
        <label style="display:flex; align-items:center; gap:8px; margin-top:16px">
          <input type="checkbox" name="isActive" ${!flight || flight.isActive ? 'checked' : ''} style="width:auto" />
          <span>Active</span>
        </label>
      </div>
      <h2>Pours</h2>
      ${pourFields}
      <div class="form-actions">
        <button type="submit" class="btn btn-primary">${isNew ? 'Create Flight' : 'Save Changes'}</button>
        ${!isNew ? `<button type="submit" name="_action" value="delete" class="btn btn-danger" onclick="return confirm('${deleteConfirm}')">${deleteLabel}</button>` : ''}
        <a href="/admin/flights" class="btn btn-secondary">Cancel</a>
      </div>
    </form>
  `, user, { pathname: '/admin/flights', flashMsg });
}

// ─── Bottles List ───
function bottlesList(bottles, user, flashMsg) {
  const rows = bottles.map(b => `
    <tr>
      <td><a href="/admin/bottles/${b.id}">${escHTML(b.name)}</a></td>
      <td>${MONTHS[b.month]} ${b.year}</td>
      <td>${escHTML(b.category || '-')}</td>
      <td style="color:#d4af37; font-weight:700">${escHTML(b.costPrice)}</td>
      <td style="color:#666; text-decoration:line-through">${escHTML(b.regularPrice || '-')}</td>
      <td><span class="tag ${b.isActive ? 'tag-active' : 'tag-inactive'}">${b.isActive ? 'Active' : 'Inactive'}</span></td>
      <td><a href="/admin/bottles/${b.id}" class="btn btn-secondary btn-sm">Edit</a></td>
    </tr>
  `).join('');

  return adminLayout('Sunday Bottles', `
    <h1>Sunday Break Even Bottles</h1>
    <p style="color:#888; margin-bottom:16px">Featured bottles sold at cost on Sundays.</p>
    <a href="/admin/bottles/new" class="btn btn-primary" style="margin-bottom:16px">New Bottle</a>
    ${bottles.length === 0 ? '<div class="empty-state">No bottles yet. Add one to get started.</div>' : `
      <table>
        <thead><tr><th>Name</th><th>Month</th><th>Category</th><th>Cost Price</th><th>Regular</th><th>Status</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `}
  `, user, { pathname: '/admin/bottles', flashMsg });
}

// ─── Bottle Editor ───
function bottleEditor(bottle, isNew, user, message, flashMsg) {
  const now = new Date();
  const defaultMonth = bottle ? bottle.month : now.getMonth() + 1;
  const defaultYear = bottle ? bottle.year : now.getFullYear();

  const monthOptions = Array.from({length: 12}, (_, i) => `<option value="${i+1}" ${defaultMonth === i+1 ? 'selected' : ''}>${MONTHS[i+1]}</option>`).join('');
  const yearOptions = Array.from({length: 3}, (_, i) => {
    const y = now.getFullYear() + i - 1;
    return `<option value="${y}" ${defaultYear === y ? 'selected' : ''}>${y}</option>`;
  }).join('');

  const catOptions = ['', 'bourbon', 'scotch', 'rye', 'irish', 'japanese', 'rum', 'tequila', 'mezcal', 'gin', 'vodka', 'other'].map(c =>
    `<option value="${c}" ${(bottle && bottle.category === c) ? 'selected' : ''}>${c ? c.charAt(0).toUpperCase() + c.slice(1) : 'None'}</option>`
  ).join('');

  return adminLayout(isNew ? 'New Bottle' : 'Edit Bottle', `
    <h1>${isNew ? 'Add Bottle' : 'Edit Bottle'}</h1>
    ${message ? `<div class="alert ${message.type === 'error' ? 'alert-error' : 'alert-success'}">${message.text}</div>` : ''}
    <form method="POST" action="/admin/bottles/${isNew ? 'new' : bottle.id}">
      <div class="card">
        <label>Bottle Name</label>
        <input type="text" name="name" value="${escHTML(bottle ? bottle.name : '')}" required placeholder="e.g. Buffalo Trace Bourbon" />
        <label>Description</label>
        <textarea name="description" placeholder="Optional description">${escHTML(bottle ? bottle.description : '')}</textarea>
        <div class="form-row">
          <div>
            <label>Cost Price (Break Even)</label>
            <input type="text" name="costPrice" value="${escHTML(bottle ? bottle.costPrice : '')}" required placeholder="e.g. $25" />
          </div>
          <div>
            <label>Regular Price</label>
            <input type="text" name="regularPrice" value="${escHTML(bottle ? bottle.regularPrice : '')}" placeholder="e.g. $45" />
          </div>
        </div>
        <div class="form-row">
          <div>
            <label>Month</label>
            <select name="month">${monthOptions}</select>
          </div>
          <div>
            <label>Year</label>
            <select name="year">${yearOptions}</select>
          </div>
          <div>
            <label>Category</label>
            <select name="category">${catOptions}</select>
          </div>
        </div>
        <div class="form-row">
          <div>
            <label>Display Order</label>
            <input type="number" name="displayOrder" value="${bottle ? bottle.displayOrder : 0}" />
          </div>
        </div>
        <label style="display:flex; align-items:center; gap:8px; margin-top:16px">
          <input type="checkbox" name="isActive" ${!bottle || bottle.isActive ? 'checked' : ''} style="width:auto" />
          <span>Active</span>
        </label>
      </div>
      <div class="form-actions">
        <button type="submit" class="btn btn-primary">${isNew ? 'Add Bottle' : 'Save Changes'}</button>
        ${!isNew ? `<button type="submit" name="_action" value="delete" class="btn btn-danger" onclick="return confirm('Delete this bottle?')">Delete</button>` : ''}
        <a href="/admin/bottles" class="btn btn-secondary">Cancel</a>
      </div>
    </form>
  `, user, { pathname: '/admin/bottles', flashMsg });
}

module.exports = { specialsDashboard, dayThemeEditor, flightsList, flightEditor, bottlesList, bottleEditor, DAYS, DAY_LABELS, MONTHS };
