const { adminLayout } = require('./adminLayout');

function escHTML(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatPrice(value) {
  if (value == null || value === '') return '';
  const num = typeof value === 'object' && value.toNumber ? value.toNumber() : Number(value);
  if (!Number.isFinite(num)) return '';
  // Show without .00 if whole dollar
  return num % 1 === 0 ? `$${num.toFixed(0)}` : `$${num.toFixed(2)}`;
}

function priceFormValue(value) {
  if (value == null || value === '') return '';
  const num = typeof value === 'object' && value.toNumber ? value.toNumber() : Number(value);
  if (!Number.isFinite(num)) return '';
  return num.toFixed(2).replace(/\.00$/, '');
}

// ─── Location grid (landing page for menu admin) ───
function menuLocationsList(locations, user, flashMsg) {
  const cards = locations.map(loc => {
    const count = loc._count?.menuCategories || 0;
    return `
      <a href="/admin/menu/${escHTML(loc.slug)}" class="menu-loc-card">
        <div class="menu-loc-name">${escHTML(loc.name)}</div>
        <div class="menu-loc-city">${escHTML(loc.city || '')}</div>
        <div class="menu-loc-count">${count} categor${count === 1 ? 'y' : 'ies'}</div>
      </a>
    `;
  }).join('');

  return adminLayout('Food Menu', `
    <style>
      .menu-loc-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(220px, 1fr)); gap:14px; margin-top:20px; }
      .menu-loc-card {
        display:block;
        background:#1a1a1a;
        border:1px solid #2a2a2a;
        border-radius:12px;
        padding:20px;
        text-decoration:none;
        color:inherit;
        transition:all 0.2s;
      }
      .menu-loc-card:hover { border-color:#d4af37; transform:translateY(-2px); text-decoration:none; }
      .menu-loc-name { font-size:1.05rem; font-weight:700; color:#fff; margin-bottom:3px; }
      .menu-loc-city { font-size:0.82rem; color:#888; margin-bottom:10px; }
      .menu-loc-count { font-size:0.78rem; color:#d4af37; font-weight:600; text-transform:uppercase; letter-spacing:0.08em; }
    </style>
    <h1>Food Menu</h1>
    <p style="color:#888; margin-bottom:8px">
      Manage food menu categories and items per location. This drives the snacks, appetizers, and any other
      food section on each location's public menu and home pages.
    </p>
    <p style="color:#666; font-size:0.85rem; margin-bottom:0">
      Each location has its own menu &mdash; you can create different categories and items for each.
    </p>
    <div class="menu-loc-grid">${cards || '<p style="color:#666">No active locations found.</p>'}</div>
  `, user, { pathname: '/admin/menu', flashMsg });
}

// ─── Per-location menu editor ───
function menuLocationEditor(location, categories, user, flashMsg) {
  const actionUrl = `/admin/menu/${escHTML(location.slug)}`;
  const categoryCount = categories.length;
  const totalItems = categories.reduce((sum, c) => sum + (c.items ? c.items.length : 0), 0);

  const categoryBlocks = categories.map((cat, catIdx) => {
    const itemRows = (cat.items || []).map((item, itemIdx) => {
      const isLast = itemIdx === cat.items.length - 1;
      return `
        <div class="mi-row${!item.isAvailable ? ' mi-unavailable' : ''}" id="mi-${item.id}">
          <div class="mi-main">
            ${item.image ? `<img src="${escHTML(item.image)}" alt="" class="mi-thumb" />` : '<div class="mi-thumb mi-thumb-empty">—</div>'}
            <div class="mi-info">
              <div class="mi-name-row">
                <span class="mi-name">${escHTML(item.name)}</span>
                ${item.price != null ? `<span class="mi-price">${escHTML(formatPrice(item.price))}</span>` : ''}
                ${item.isFeatured ? '<span class="mi-badge mi-badge-featured">★ Featured</span>' : ''}
                ${!item.isAvailable ? '<span class="mi-badge mi-badge-off">Unavailable</span>' : ''}
              </div>
              ${item.description ? `<div class="mi-desc">${escHTML(item.description)}</div>` : ''}
            </div>
          </div>
          <div class="mi-actions">
            <form method="POST" action="${actionUrl}" class="mi-inline">
              <input type="hidden" name="_action" value="moveItem" />
              <input type="hidden" name="itemId" value="${escHTML(item.id)}" />
              <button type="submit" name="direction" value="up" class="btn btn-secondary btn-sm"${itemIdx === 0 ? ' disabled' : ''}>↑</button>
              <button type="submit" name="direction" value="down" class="btn btn-secondary btn-sm"${isLast ? ' disabled' : ''}>↓</button>
            </form>
            <button type="button" class="btn btn-secondary btn-sm" onclick="toggleMenuEdit('mi-edit-${item.id}')">Edit</button>
            <form method="POST" action="${actionUrl}" class="mi-inline">
              <input type="hidden" name="_action" value="deleteItem" />
              <input type="hidden" name="itemId" value="${escHTML(item.id)}" />
              <button type="submit" class="btn btn-danger btn-sm" onclick="return confirm('Delete this item?')">Del</button>
            </form>
          </div>
          <div class="mi-edit" id="mi-edit-${item.id}" style="display:none">
            <form method="POST" action="${actionUrl}">
              <input type="hidden" name="_action" value="editItem" />
              <input type="hidden" name="itemId" value="${escHTML(item.id)}" />
              <div class="form-row">
                <div>
                  <label>Name</label>
                  <input type="text" name="name" value="${escHTML(item.name)}" required />
                </div>
                <div>
                  <label>Price</label>
                  <input type="text" name="price" value="${escHTML(priceFormValue(item.price))}" placeholder="10 or 10.50" />
                </div>
              </div>
              <label>Description</label>
              <input type="text" name="description" value="${escHTML(item.description || '')}" placeholder="Short description (optional)" />
              <label>Image URL</label>
              <input type="text" name="image" value="${escHTML(item.image || '')}" placeholder="https://..." />
              <div style="display:flex; gap:16px; margin-top:12px; flex-wrap:wrap">
                <label class="mi-check"><input type="checkbox" name="isAvailable" ${item.isAvailable ? 'checked' : ''} /> Available</label>
                <label class="mi-check"><input type="checkbox" name="isFeatured" ${item.isFeatured ? 'checked' : ''} /> Featured</label>
              </div>
              <div class="form-actions">
                <button type="submit" class="btn btn-primary btn-sm">Save Item</button>
                <button type="button" class="btn btn-secondary btn-sm" onclick="toggleMenuEdit('mi-edit-${item.id}')">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      `;
    }).join('');

    return `
      <div class="mc-card${!cat.isActive ? ' mc-inactive' : ''}">
        <div class="mc-header">
          <div class="mc-title">
            <span class="mc-name">${escHTML(cat.name)}</span>
            <span class="mc-meta">${(cat.items || []).length} item${(cat.items || []).length === 1 ? '' : 's'}</span>
            ${!cat.isActive ? '<span class="mi-badge mi-badge-off">Hidden</span>' : ''}
          </div>
          <div class="mc-header-actions">
            <form method="POST" action="${actionUrl}" class="mi-inline">
              <input type="hidden" name="_action" value="moveCategory" />
              <input type="hidden" name="categoryId" value="${escHTML(cat.id)}" />
              <button type="submit" name="direction" value="up" class="btn btn-secondary btn-sm"${catIdx === 0 ? ' disabled' : ''}>↑</button>
              <button type="submit" name="direction" value="down" class="btn btn-secondary btn-sm"${catIdx === categoryCount - 1 ? ' disabled' : ''}>↓</button>
            </form>
            <button type="button" class="btn btn-secondary btn-sm" onclick="toggleMenuEdit('mc-edit-${cat.id}')">Edit</button>
            <form method="POST" action="${actionUrl}" class="mi-inline">
              <input type="hidden" name="_action" value="deleteCategory" />
              <input type="hidden" name="categoryId" value="${escHTML(cat.id)}" />
              <button type="submit" class="btn btn-danger btn-sm" onclick="return confirm('Delete &quot;${escHTML(cat.name)}&quot; and all its items?')">Delete</button>
            </form>
          </div>
        </div>
        ${cat.description ? `<div class="mc-desc">${escHTML(cat.description)}</div>` : ''}

        <div class="mc-edit" id="mc-edit-${cat.id}" style="display:none">
          <form method="POST" action="${actionUrl}">
            <input type="hidden" name="_action" value="editCategory" />
            <input type="hidden" name="categoryId" value="${escHTML(cat.id)}" />
            <label>Category Name</label>
            <input type="text" name="name" value="${escHTML(cat.name)}" required />
            <label>Description</label>
            <input type="text" name="description" value="${escHTML(cat.description || '')}" placeholder="Optional short description shown under the heading" />
            <label class="mi-check" style="margin-top:12px"><input type="checkbox" name="isActive" ${cat.isActive ? 'checked' : ''} /> Active (show on public menu)</label>
            <div class="form-actions">
              <button type="submit" class="btn btn-primary btn-sm">Save Category</button>
              <button type="button" class="btn btn-secondary btn-sm" onclick="toggleMenuEdit('mc-edit-${cat.id}')">Cancel</button>
            </div>
          </form>
        </div>

        <div class="mc-items">
          ${itemRows || '<div class="mc-empty">No items yet. Add one below.</div>'}
        </div>

        <details class="mc-add">
          <summary>+ Add item to ${escHTML(cat.name)}</summary>
          <form method="POST" action="${actionUrl}" class="mc-add-form">
            <input type="hidden" name="_action" value="addItem" />
            <input type="hidden" name="categoryId" value="${escHTML(cat.id)}" />
            <div class="form-row">
              <div>
                <label>Name</label>
                <input type="text" name="name" required placeholder="e.g. Pimento Cheese" />
              </div>
              <div>
                <label>Price</label>
                <input type="text" name="price" placeholder="10 or 10.50" />
              </div>
            </div>
            <label>Description</label>
            <input type="text" name="description" placeholder="Short description (optional)" />
            <label>Image URL</label>
            <input type="text" name="image" placeholder="https://... (optional)" />
            <label class="mi-check" style="margin-top:12px"><input type="checkbox" name="isFeatured" /> Featured</label>
            <div class="form-actions">
              <button type="submit" class="btn btn-primary btn-sm">Add Item</button>
            </div>
          </form>
        </details>
      </div>
    `;
  }).join('');

  return adminLayout(`${location.name} Menu`, `
    <style>
      .menu-summary { display:flex; gap:20px; flex-wrap:wrap; margin:12px 0 20px; }
      .menu-stat { background:#1a1a1a; border:1px solid #2a2a2a; border-radius:10px; padding:12px 18px; }
      .menu-stat-num { font-size:1.4rem; font-weight:800; color:#d4af37; }
      .menu-stat-lbl { font-size:0.72rem; color:#888; text-transform:uppercase; letter-spacing:0.08em; margin-top:2px; }

      .mc-add-cat {
        background:#141414;
        border:2px dashed rgba(212,175,55,0.3);
        border-radius:12px;
        padding:18px;
        margin-bottom:20px;
      }
      .mc-add-cat h3 { margin:0 0 10px; color:#d4af37; font-size:0.78rem; text-transform:uppercase; letter-spacing:0.1em; }

      .mc-card {
        background:#1a1a1a;
        border:1px solid #2a2a2a;
        border-radius:12px;
        padding:18px;
        margin-bottom:16px;
      }
      .mc-card.mc-inactive { opacity:0.6; }
      .mc-header {
        display:flex;
        justify-content:space-between;
        align-items:flex-start;
        gap:12px;
        flex-wrap:wrap;
        margin-bottom:8px;
      }
      .mc-title { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
      .mc-name { font-size:1.15rem; font-weight:700; color:#fff; }
      .mc-meta { color:#888; font-size:0.82rem; }
      .mc-header-actions { display:flex; gap:6px; flex-wrap:wrap; }
      .mc-desc { color:#888; font-size:0.85rem; margin-bottom:12px; }

      .mc-edit { background:#111; border-left:3px solid #d4af37; border-radius:0 8px 8px 0; padding:14px; margin:10px 0; }
      .mc-items { display:flex; flex-direction:column; gap:8px; margin:12px 0; }
      .mc-empty { color:#555; font-style:italic; font-size:0.85rem; padding:12px; text-align:center; border:1px dashed #2a2a2a; border-radius:8px; }

      .mi-row {
        display:grid;
        grid-template-columns:1fr auto;
        gap:12px;
        align-items:center;
        padding:10px 12px;
        background:#111;
        border:1px solid #222;
        border-radius:8px;
      }
      .mi-row.mi-unavailable { opacity:0.55; }
      .mi-main { display:flex; align-items:center; gap:12px; min-width:0; }
      .mi-thumb { width:44px; height:44px; border-radius:6px; object-fit:cover; border:1px solid #333; flex-shrink:0; }
      .mi-thumb-empty { background:#0d0d0d; color:#444; display:flex; align-items:center; justify-content:center; font-size:1.1rem; }
      .mi-info { min-width:0; }
      .mi-name-row { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
      .mi-name { font-weight:600; color:#fff; }
      .mi-price { color:#d4af37; font-weight:700; font-size:0.92rem; }
      .mi-badge { display:inline-block; padding:2px 7px; border-radius:10px; font-size:0.68rem; font-weight:700; letter-spacing:0.02em; }
      .mi-badge-featured { background:rgba(212,175,55,0.18); color:#d4af37; }
      .mi-badge-off { background:rgba(239,68,68,0.15); color:#f87171; }
      .mi-desc { color:#999; font-size:0.82rem; margin-top:3px; }
      .mi-actions { display:flex; gap:6px; align-items:center; flex-wrap:wrap; }
      .mi-inline { display:inline-flex; gap:4px; margin:0; }
      .mi-check { display:flex; align-items:center; gap:6px; color:#ccc; font-size:0.88rem; margin:0; }
      .mi-check input[type="checkbox"] { width:auto; margin:0; }
      .mi-edit { grid-column:1 / -1; background:#0d0d0d; border-radius:8px; padding:14px; margin-top:4px; border-left:3px solid #d4af37; }

      .mc-add { margin-top:12px; }
      .mc-add summary {
        cursor:pointer;
        color:#888;
        font-size:0.82rem;
        padding:8px 12px;
        background:#141414;
        border:1px dashed #333;
        border-radius:8px;
        list-style:none;
        user-select:none;
      }
      .mc-add summary::-webkit-details-marker { display:none; }
      .mc-add summary:hover { color:#d4af37; border-color:rgba(212,175,55,0.4); }
      .mc-add[open] summary { color:#d4af37; border-color:#d4af37; border-style:solid; }
      .mc-add-form { background:#0d0d0d; border:1px solid #222; border-top:none; border-radius:0 0 8px 8px; padding:14px; margin-top:-1px; }

      @media (max-width: 768px) {
        .mi-row { grid-template-columns:1fr; }
        .mi-actions { justify-content:flex-start; }
      }
    </style>

    <div style="display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap; margin-bottom:10px">
      <h1 style="margin:0">${escHTML(location.name)} &mdash; Menu</h1>
      <div style="display:flex; gap:8px">
        <a href="/admin/menu" class="btn btn-secondary btn-sm">← All Locations</a>
        <a href="/${escHTML(location.slug)}/menu" class="btn btn-secondary btn-sm" target="_blank">View Public Menu ↗</a>
      </div>
    </div>

    <div class="menu-summary">
      <div class="menu-stat">
        <div class="menu-stat-num">${categoryCount}</div>
        <div class="menu-stat-lbl">Categor${categoryCount === 1 ? 'y' : 'ies'}</div>
      </div>
      <div class="menu-stat">
        <div class="menu-stat-num">${totalItems}</div>
        <div class="menu-stat-lbl">Total Items</div>
      </div>
    </div>

    <div class="mc-add-cat">
      <h3>Add New Category</h3>
      <form method="POST" action="${actionUrl}">
        <input type="hidden" name="_action" value="addCategory" />
        <div class="form-row">
          <div>
            <label>Category Name</label>
            <input type="text" name="name" required placeholder="e.g. Snacks, Appetizers, Small Plates" />
          </div>
        </div>
        <label>Description (optional)</label>
        <input type="text" name="description" placeholder="Short description shown under the heading" />
        <div class="form-actions">
          <button type="submit" class="btn btn-primary">Add Category</button>
        </div>
      </form>
    </div>

    ${categoryBlocks || '<div class="card" style="text-align:center; padding:40px; color:#666">No menu categories yet. Add one above to get started.</div>'}

    <script>
      function toggleMenuEdit(id) {
        var el = document.getElementById(id);
        if (!el) return;
        el.style.display = el.style.display === 'none' ? 'block' : 'none';
      }
    </script>
  `, user, { pathname: `/admin/menu/${location.slug}`, flashMsg });
}

module.exports = { menuLocationsList, menuLocationEditor };
