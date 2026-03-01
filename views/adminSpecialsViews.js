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

// ─── 7-Day Grid Dashboard ───
function specialsDashboard(themes, user) {
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
  `, user);
}

// ─── Day Theme Editor ───
function dayThemeEditor(day, theme, specials, locations, locationSlug, user, message, categoryOptions = []) {
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
      <div class="drag-handle" aria-label="Drag to reorder">⋮⋮</div>
      <label class="special-select">
        <input type="checkbox" name="specialIds" value="${s.id}" form="bulkCategoryForm" />
        Select
      </label>
      <div class="special-main">
        <div class="name">${escHTML(s.name)} <span class="muted">#${i + 1}</span></div>
        ${s.description ? `<div class="desc">${escHTML(s.description)}</div>` : ''}
        ${s.section ? `<div class="desc" style="color:#b87333">Section: ${escHTML(s.section)}</div>` : ''}
        ${s.badges ? `<div class="desc">${escHTML(s.badges).split(',').map(b => `<span class="tag" style="background:rgba(212,175,55,0.15); color:#d4af37; margin-right:4px">${b.trim()}</span>`).join('')}</div>` : ''}
      </div>
      <div class="special-meta">
        <div class="special-order-row">
          <div class="order-label">${s.price ? `<span class="price">${escHTML(s.price)}</span>` : ''}</div>
          <form method="POST" action="${actionUrl}" class="inline-form">
            <input type="hidden" name="_action" value="moveSpecial" />
            <input type="hidden" name="specialId" value="${s.id}" />
            <button type="submit" name="direction" value="up" class="btn btn-secondary btn-sm${i === 0 ? ' btn-disabled' : ''}" ${i === 0 ? 'disabled' : ''}>↑</button>
            <button type="submit" name="direction" value="down" class="btn btn-secondary btn-sm${i === specials.length - 1 ? ' btn-disabled' : ''}" ${i === specials.length - 1 ? 'disabled' : ''}>↓</button>
          </form>
        </div>
        <form method="POST" action="${actionUrl}" class="inline-form order-jump">
          <input type="hidden" name="_action" value="setSpecialOrder" />
          <input type="hidden" name="specialId" value="${s.id}" />
          <input type="number" name="specialOrderValue" value="${s.displayOrder}" min="0" max="${Math.max(0, (specials || []).length - 1)}" />
          <button type="submit" class="btn btn-secondary btn-sm">Move</button>
        </form>
        <form method="POST" action="${actionUrl}" class="inline-form">
          <input type="hidden" name="_action" value="setSpecialCategory" />
          <input type="hidden" name="specialId" value="${s.id}" />
          <select name="specialCategory">${buildCategoryOptions(s.category, categoryOptions)}</select>
          <button type="submit" class="btn btn-secondary btn-sm">Set Category</button>
        </form>
        <div style="display:flex; gap:4px; align-items:center; flex-wrap:wrap">
          ${s.isFeatured ? '<span class="tag" style="background:rgba(212,175,55,0.3); color:#d4af37">★</span>' : ''}
          ${s.category ? `<span class="tag" style="background:rgba(212,175,55,0.15); color:#d4af37">${escHTML(s.category)}</span>` : ''}
          <button type="button" class="btn btn-secondary btn-sm" onclick="toggleEdit('${s.id}')">Edit</button>
          <form method="POST" action="${actionUrl}" style="display:inline">
            <input type="hidden" name="_action" value="deleteSpecial" />
            <input type="hidden" name="specialId" value="${s.id}" />
            <button type="submit" class="btn btn-danger btn-sm" onclick="return confirm('Delete this special?')">Delete</button>
          </form>
        </div>
      </div>
    </div>
    <div class="edit-form" id="edit-${s.id}" style="display:none; background:#1a1a1a; border:1px solid #333; border-radius:8px; padding:16px; margin-bottom:10px">
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
        <li>Mark them as <strong>Active</strong> — they'll appear on the public page automatically</li>
      </ol>
      <p style="color:#888; font-size:0.85rem">The public specials page pulls bottles directly from the dashboard each week. No changes needed here.</p>
    </div>
    ` : ''}

    ${theme ? `
    <div class="card">
      <h2>Specials</h2>
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
      ` : '<p class="empty-state">No specials yet. Add one below.</p>'}

      <h3>Add Special</h3>
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
        <label style="display:flex; align-items:center; gap:8px; margin-top:8px">
          <input type="checkbox" name="specialFeatured" style="width:auto" />
          <span>Featured (gold highlight)</span>
        </label>
        <div class="form-actions">
          <button type="submit" class="btn btn-primary">Add Special</button>
        </div>
      </form>
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
            const checkbox = item.querySelector('input[type=\"checkbox\"][form=\"bulkCategoryForm\"]');
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

          item.querySelector('.special-select input[type=\"checkbox\"]').addEventListener('change', refreshSpecialOrderState);
        });
      }

      function toggleEdit(id) {
        var el = document.getElementById('edit-' + id);
        if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
      }

      initializeSpecialDragAndDrop();
      refreshSpecialOrderState();
    </script>
  `, user);
}

// ─── Flights List ───
function flightsList(flights, user) {
  const rows = flights.map(f => `
    <tr>
      <td><a href="/admin/flights/${f.id}">${escHTML(f.theme)}</a></td>
      <td>${MONTHS[f.month]} ${f.year}</td>
      <td>${escHTML(f.price || 'Not set')}</td>
      <td>${f.pours.length} pour${f.pours.length !== 1 ? 's' : ''}</td>
      <td><span class="tag ${f.isActive ? 'tag-active' : 'tag-inactive'}">${f.isActive ? 'Active' : 'Inactive'}</span></td>
      <td><a href="/admin/flights/${f.id}" class="btn btn-secondary btn-sm">Edit</a></td>
    </tr>
  `).join('');

  return adminLayout('Flight Nights', `
    <h1>Friday Flight Nights</h1>
    <p style="color:#888; margin-bottom:16px">Monthly rotating 3-pour tasting flights for Friday nights.</p>
    <a href="/admin/flights/new" class="btn btn-primary" style="margin-bottom:16px">New Flight</a>
    ${flights.length === 0 ? '<div class="empty-state">No flights yet. Create one to get started.</div>' : `
      <table>
        <thead><tr><th>Theme</th><th>Month</th><th>Price</th><th>Pours</th><th>Status</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `}
  `, user);
}

// ─── Flight Editor ───
function flightEditor(flight, isNew, user, message) {
  const pours = flight ? flight.pours.sort((a,b) => a.displayOrder - b.displayOrder) : [];
  const now = new Date();
  const defaultMonth = flight ? flight.month : now.getMonth() + 1;
  const defaultYear = flight ? flight.year : now.getFullYear();

  const pourFields = [0, 1, 2].map(i => {
    const p = pours[i] || {};
    return `
      <div class="card">
        <h3>Pour ${i + 1}</h3>
        <label>Spirit Name</label>
        <input type="text" name="pour${i}_name" value="${escHTML(p.spiritName)}" ${i === 0 ? 'required' : ''} placeholder="e.g. Westward American Single Malt" />
        <label>Pour Size</label>
        <input type="text" name="pour${i}_size" value="${escHTML(p.pourSize)}" placeholder="e.g. 1 oz" />
        <label>Description</label>
        <input type="text" name="pour${i}_desc" value="${escHTML(p.description)}" placeholder="e.g. Portland, Oregon" />
        <label>Tasting Notes</label>
        <textarea name="pour${i}_notes" placeholder="e.g. Rich malt, dark fruit, baking spice">${escHTML(p.tastingNotes)}</textarea>
      </div>
    `;
  }).join('');

  const monthOptions = Array.from({length: 12}, (_, i) => `<option value="${i+1}" ${defaultMonth === i+1 ? 'selected' : ''}>${MONTHS[i+1]}</option>`).join('');
  const yearOptions = Array.from({length: 3}, (_, i) => {
    const y = now.getFullYear() + i - 1;
    return `<option value="${y}" ${defaultYear === y ? 'selected' : ''}>${y}</option>`;
  }).join('');

  return adminLayout(isNew ? 'New Flight' : 'Edit Flight', `
    <h1>${isNew ? 'Create Flight' : 'Edit Flight'}</h1>
    ${message ? `<div class="alert ${message.type === 'error' ? 'alert-error' : 'alert-success'}">${message.text}</div>` : ''}
    <form method="POST" action="/admin/flights/${isNew ? 'new' : flight.id}">
      <div class="card">
        <h2>Flight Details</h2>
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
      <h2>Pours (3 tastings)</h2>
      ${pourFields}
      <div class="form-actions">
        <button type="submit" class="btn btn-primary">${isNew ? 'Create Flight' : 'Save Changes'}</button>
        ${!isNew ? `<button type="submit" name="_action" value="delete" class="btn btn-danger" onclick="return confirm('Delete this flight?')">Delete Flight</button>` : ''}
        <a href="/admin/flights" class="btn btn-secondary">Cancel</a>
      </div>
    </form>
  `, user);
}

// ─── Bottles List ───
function bottlesList(bottles, user) {
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
  `, user);
}

// ─── Bottle Editor ───
function bottleEditor(bottle, isNew, user, message) {
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
  `, user);
}

module.exports = { specialsDashboard, dayThemeEditor, flightsList, flightEditor, bottlesList, bottleEditor, DAYS, DAY_LABELS, MONTHS };
