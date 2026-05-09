const { adminLayout } = require('./adminLayout');
const { escHTML } = require('./escapeHtml');
const { imageUploadWidget, imageUploadWidgetCss, imageUploadWidgetScript } = require('./imageUploadWidget');

const DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
const DAY_LABELS = {
  MONDAY: 'Mon', TUESDAY: 'Tue', WEDNESDAY: 'Wed', THURSDAY: 'Thu',
  FRIDAY: 'Fri', SATURDAY: 'Sat', SUNDAY: 'Sun',
};

function dateToYMD(value) {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return '';
  // Render in Eastern so the date the admin sees matches the date they picked.
  const eastern = new Date(d.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const pad = n => String(n).padStart(2, '0');
  return `${eastern.getFullYear()}-${pad(eastern.getMonth() + 1)}-${pad(eastern.getDate())}`;
}

function daysSummary(daysOfWeek) {
  if (!Array.isArray(daysOfWeek) || daysOfWeek.length === 0) return 'No days selected';
  if (daysOfWeek.length === 7) return 'Every day';
  return DAYS.filter((d) => daysOfWeek.includes(d)).map((d) => DAY_LABELS[d]).join(', ');
}

function dateRangeSummary(lto) {
  const start = dateToYMD(lto.startDate);
  const end = dateToYMD(lto.endDate);
  if (start && end) return `${start} → ${end}`;
  if (start) return `From ${start}`;
  if (end) return `Through ${end}`;
  return 'No date window';
}

function ltoStyles() {
  return `
    <style>
      .lto-row { display:flex; gap:12px; align-items:center; padding:14px 16px; border:1px solid var(--border); border-radius:12px; margin-bottom:10px; background:var(--card); }
      .lto-row .lto-thumb { width:56px; height:56px; border-radius:8px; background:#15161a; border:1px solid var(--border); object-fit:cover; flex:0 0 auto; }
      .lto-row .lto-thumb-empty { display:flex; align-items:center; justify-content:center; color:var(--muted); font-size:0.7rem; text-transform:uppercase; letter-spacing:0.06em; }
      .lto-row-main { flex:1 1 auto; min-width:0; }
      .lto-row-main strong { color:var(--text); font-size:1rem; }
      .lto-meta { color:var(--muted); font-size:0.85rem; margin-top:3px; }
      .lto-meta-dot { color:#555; margin:0 4px; }
      .lto-tag { display:inline-block; padding:2px 8px; border-radius:8px; font-size:0.66rem; font-weight:700; text-transform:uppercase; letter-spacing:0.04em; margin-left:6px; }
      .lto-tag-active { background:rgba(34,197,94,0.18); color:#4ade80; }
      .lto-tag-inactive { background:rgba(150,150,150,0.18); color:#aaa; }
      .lto-section { background:var(--card); border:1px solid var(--border); border-radius:12px; padding:18px 18px; margin-bottom:14px; }
      .lto-section h2 { font-size:1.05rem; margin:0 0 12px; color:var(--accent); }
      .lto-section input[type="text"], .lto-section input[type="date"], .lto-section input[type="number"], .lto-section textarea {
        background:var(--bg-input, #15161a); color:var(--text); border:1px solid var(--border);
        padding:8px 10px; border-radius:8px; font-size:0.9rem; width:100%; box-sizing:border-box;
      }
      .lto-section textarea { min-height:74px; resize:vertical; }
      .lto-section label { font-size:0.74rem; color:var(--muted); text-transform:uppercase; letter-spacing:0.06em; display:block; margin-bottom:4px; }
      .lto-row-form { display:grid; grid-template-columns: 2fr 1fr 0.7fr auto; gap:8px; margin-bottom:8px; align-items:end; }
      @media (max-width:680px){ .lto-row-form { grid-template-columns: 1fr 1fr; } }
      .lto-day-grid { display:flex; flex-wrap:wrap; gap:8px; }
      .lto-day-grid label { display:flex; align-items:center; gap:6px; padding:6px 12px; border:1px solid var(--border); border-radius:999px; cursor:pointer; font-size:0.82rem; color:var(--text); text-transform:none; letter-spacing:normal; margin-bottom:0; }
      .lto-day-grid input { accent-color: var(--accent); }
      .lto-flash { padding:10px 14px; border-radius:8px; margin-bottom:14px; font-size:0.9rem; }
      .lto-flash.success { background:rgba(34,197,94,0.18); color:#4ade80; }
      .lto-flash.error { background:rgba(239,68,68,0.16); color:#f87171; }
      ${imageUploadWidgetCss()}
    </style>
  `;
}

function flashBlock(flashMsg) {
  if (!flashMsg) return '';
  return `<div class="lto-flash ${flashMsg.type === 'error' ? 'error' : 'success'}">${escHTML(flashMsg.text)}</div>`;
}

function ltosList({ ltos, locations, filters, user, flashMsg, canSeeMultipleLocations }) {
  const locationOptions = canSeeMultipleLocations
    ? ['', ...locations.map((l) => l.slug)].map((slug) => {
        const sel = filters.location === slug ? ' selected' : '';
        const loc = locations.find((l) => l.slug === slug);
        const label = slug === '' ? 'All locations' : (loc ? loc.name : slug);
        return `<option value="${escHTML(slug)}"${sel}>${escHTML(label)}</option>`;
      }).join('')
    : '';

  const rows = ltos.length === 0 ? `
    <div class="lto-row" style="justify-content:center; color:var(--muted);">
      <div>No LTOs yet. Create one with the button above.</div>
    </div>
  ` : ltos.map((l) => {
    const drinksLength = Array.isArray(l.drinks) ? l.drinks.length : 0;
    const thumb = l.image
      ? `<img class="lto-thumb" src="${escHTML(l.image)}" alt="" />`
      : `<div class="lto-thumb lto-thumb-empty">No image</div>`;
    return `
      <div class="lto-row">
        ${thumb}
        <div class="lto-row-main">
          <a href="/admin/ltos/${escHTML(l.id)}" style="color:var(--text); text-decoration:none; font-weight:600;">${escHTML(l.title)}</a>
          <span class="lto-tag ${l.isActive ? 'lto-tag-active' : 'lto-tag-inactive'}">${l.isActive ? 'Active' : 'Hidden'}</span>
          <div class="lto-meta">
            <span>${escHTML(l.location?.name || '')}</span>
            <span class="lto-meta-dot">•</span>
            <span>${escHTML(daysSummary(l.daysOfWeek))}</span>
            <span class="lto-meta-dot">•</span>
            <span>${escHTML(dateRangeSummary(l))}</span>
            <span class="lto-meta-dot">•</span>
            <span>${drinksLength} drink${drinksLength === 1 ? '' : 's'}</span>
          </div>
        </div>
        <div>
          <a href="/admin/ltos/${escHTML(l.id)}" class="btn btn-secondary btn-sm">Edit</a>
        </div>
      </div>
    `;
  }).join('');

  return adminLayout('LTOs', `
    ${ltoStyles()}
    <div class="page-header">
      <div>
        <div class="admin-kicker">Specials &middot; Limited time</div>
        <h1>Limited Time Offers</h1>
        <p class="page-subtitle">Layer a separate menu (image + drinks) on top of a location's daily specials, on whichever weekdays you choose.</p>
      </div>
      <div>
        <a href="/admin/specials" class="btn btn-secondary">&larr; Back to Specials</a>
        <a href="/admin/ltos/new${filters.location ? `?location=${encodeURIComponent(filters.location)}` : ''}" class="btn btn-primary" style="margin-left:8px;">+ New LTO</a>
      </div>
    </div>
    ${flashBlock(flashMsg)}

    <form method="GET" action="/admin/ltos" class="app-filter-bar" style="margin-bottom:14px; display:flex; gap:10px; align-items:flex-end;">
      ${canSeeMultipleLocations ? `
      <label style="font-size:0.74rem; color:var(--muted); text-transform:uppercase; letter-spacing:0.06em;">Location
        <select name="location" style="display:block; margin-top:4px; background:var(--bg-input, #15161a); color:var(--text); border:1px solid var(--border); padding:8px 10px; border-radius:8px;">${locationOptions}</select>
      </label>` : ''}
      <button type="submit" class="btn btn-secondary btn-sm">Filter</button>
      ${filters.location ? `<a href="/admin/ltos" class="btn btn-secondary btn-sm">Reset</a>` : ''}
    </form>

    ${rows}
  `, user);
}

function ltoEditor({ lto, locations, user, flashMsg, defaultLocationSlug, canPickLocation }) {
  const isNew = !lto;
  const idForPrefix = isNew ? 'new' : lto.id;
  const drinks = Array.isArray(lto?.drinks) ? lto.drinks : [];
  const drinkRows = drinks.map((d, i) => `
    <div class="lto-row-form" data-drink-row>
      <div>
        <label>Drink name</label>
        <input type="text" name="drink_name" value="${escHTML(d.name || '')}" />
      </div>
      <div>
        <label>Description (optional)</label>
        <input type="text" name="drink_description" value="${escHTML(d.description || '')}" />
      </div>
      <div>
        <label>Price (optional)</label>
        <input type="text" name="drink_price" value="${escHTML(d.price || '')}" placeholder="e.g. 14" />
      </div>
      <div>
        <button type="button" class="btn btn-secondary btn-sm" data-drink-remove>Remove</button>
      </div>
    </div>
  `).join('');

  const locationOptions = locations.map((l) => {
    const selected = (lto && lto.locationId === l.id) || (!lto && l.slug === defaultLocationSlug);
    return `<option value="${escHTML(l.id)}"${selected ? ' selected' : ''}>${escHTML(l.name)}</option>`;
  }).join('');

  const dayCheckboxes = DAYS.map((d) => {
    const checked = lto && Array.isArray(lto.daysOfWeek) && lto.daysOfWeek.includes(d);
    return `
      <label>
        <input type="checkbox" name="daysOfWeek" value="${d}" ${checked ? 'checked' : ''} />
        ${DAY_LABELS[d]}
      </label>
    `;
  }).join('');

  const heading = isNew ? 'New LTO' : `Edit: ${lto.title}`;

  return adminLayout(heading, `
    ${ltoStyles()}
    <div class="page-header">
      <div>
        <div class="admin-kicker">${isNew ? 'New' : 'Edit'} LTO</div>
        <h1>${escHTML(heading)}</h1>
      </div>
      <a href="/admin/ltos${lto && lto.location ? `?location=${escHTML(lto.location.slug)}` : ''}" class="btn btn-secondary">&larr; Back to list</a>
    </div>
    ${flashBlock(flashMsg)}

    <form method="POST" action="${isNew ? '/admin/ltos/new' : `/admin/ltos/${escHTML(lto.id)}`}" id="lto-form">
      <div class="lto-section">
        <h2>Basics</h2>
        <div style="display:grid; grid-template-columns:2fr 1fr; gap:12px;">
          <div>
            <label>Title</label>
            <input type="text" name="title" required value="${escHTML(lto?.title || '')}" placeholder="e.g. Saturday Tiki Pop-Up" />
          </div>
          ${canPickLocation ? `
          <div>
            <label>Location</label>
            <select name="locationId" required style="background:var(--bg-input, #15161a); color:var(--text); border:1px solid var(--border); padding:8px 10px; border-radius:8px; width:100%;">
              ${locationOptions}
            </select>
          </div>` : `<input type="hidden" name="locationId" value="${escHTML((lto && lto.locationId) || (locations[0] && locations[0].id) || '')}" />`}
        </div>
        <div style="margin-top:10px;">
          <label>Description (optional)</label>
          <textarea name="description" placeholder="Short blurb shown under the title.">${escHTML(lto?.description || '')}</textarea>
        </div>
        <label class="checkbox-card" style="margin-top:14px; display:inline-flex; align-items:center; gap:8px; padding:8px 12px; border:1px solid var(--border); border-radius:8px; text-transform:none; letter-spacing:normal; font-size:0.9rem; color:var(--text);">
          <input type="checkbox" name="isActive" ${(!lto || lto.isActive) ? 'checked' : ''} style="width:auto" />
          <span>Active &middot; show this LTO publicly when its days/dates apply</span>
        </label>
      </div>

      <div class="lto-section">
        <h2>Image (optional)</h2>
        ${imageUploadWidget({ name: 'image', prefix: `lto-${idForPrefix}`, value: lto?.image || '' })}
      </div>

      <div class="lto-section">
        <h2>Drinks</h2>
        <div id="drink-rows">${drinkRows}</div>
        <div style="margin-top:8px;">
          <button type="button" id="add-drink" class="btn btn-secondary btn-sm">+ Add drink</button>
        </div>
      </div>

      <div class="lto-section">
        <h2>When it shows</h2>
        <label>Days of week</label>
        <div class="lto-day-grid" style="margin-bottom:14px;">${dayCheckboxes}</div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
          <div>
            <label>Start date (optional)</label>
            <input type="date" name="startDate" value="${escHTML(dateToYMD(lto?.startDate))}" />
          </div>
          <div>
            <label>End date (optional)</label>
            <input type="date" name="endDate" value="${escHTML(dateToYMD(lto?.endDate))}" />
          </div>
        </div>
        <div style="color:var(--muted); font-size:0.8rem; margin-top:6px;">Leave both blank for an open-ended LTO (just controlled by days of week).</div>
      </div>

      <div class="sticky-actions" style="display:flex; justify-content:space-between; gap:10px;">
        <div>
          ${isNew ? '' : `
          <form method="POST" action="/admin/ltos/${escHTML(lto.id)}/delete" style="display:inline; margin:0;" onsubmit="return confirm('Delete this LTO? This cannot be undone.');">
            <button type="submit" class="btn btn-danger">Delete</button>
          </form>`}
        </div>
        <div>
          <a href="/admin/ltos${lto && lto.location ? `?location=${escHTML(lto.location.slug)}` : ''}" class="btn btn-secondary">Cancel</a>
          <button type="submit" form="lto-form" class="btn btn-primary" style="margin-left:8px;">${isNew ? 'Create LTO' : 'Save changes'}</button>
        </div>
      </div>
    </form>

    <script>
      (function(){
        var rowsEl = document.getElementById('drink-rows');
        var addBtn = document.getElementById('add-drink');
        function buildRow(){
          var row = document.createElement('div');
          row.className = 'lto-row-form';
          row.setAttribute('data-drink-row', '');
          row.innerHTML =
            '<div><label>Drink name</label><input type="text" name="drink_name" /></div>' +
            '<div><label>Description (optional)</label><input type="text" name="drink_description" /></div>' +
            '<div><label>Price (optional)</label><input type="text" name="drink_price" placeholder="e.g. 14" /></div>' +
            '<div><button type="button" class="btn btn-secondary btn-sm" data-drink-remove>Remove</button></div>';
          return row;
        }
        if (addBtn) addBtn.addEventListener('click', function(){
          rowsEl.appendChild(buildRow());
        });
        document.addEventListener('click', function(e){
          if (!e.target.matches('[data-drink-remove]')) return;
          var row = e.target.closest('[data-drink-row]');
          if (row) row.remove();
        });
      })();
      ${imageUploadWidgetScript()}
    </script>
  `, user);
}

module.exports = {
  ltosList,
  ltoEditor,
  DAYS,
};
