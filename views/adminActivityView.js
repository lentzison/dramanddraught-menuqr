const { adminLayout } = require('./adminLayout');
const { escHTML } = require('./escapeHtml');

const RESOURCE_LABELS = {
  event: 'Event',
  daily_special: 'Daily Special',
  day_theme: 'Day Theme',
  half_price: 'Discounted Spirits',
  menu_category: 'Menu Category',
  menu_item: 'Menu Item',
  location: 'Location',
};

const ACTION_COLORS = {
  create: { bg: 'rgba(34,197,94,0.15)', fg: '#4ade80' },
  duplicate: { bg: 'rgba(34,197,94,0.10)', fg: '#86efac' },
  update: { bg: 'rgba(96,165,250,0.15)', fg: '#93c5fd' },
  delete: { bg: 'rgba(239,68,68,0.15)', fg: '#f87171' },
  move: { bg: 'rgba(150,150,150,0.15)', fg: '#aaa' },
  save: { bg: 'rgba(96,165,250,0.15)', fg: '#93c5fd' },
};

function formatTime(value) {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const diffMs = now - d;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatTimeAbsolute(value) {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function adminActivityView(entries, filters, locations, user, flashMsg) {
  const rows = (entries || []).map(e => {
    const colors = ACTION_COLORS[e.action] || { bg: 'rgba(150,150,150,0.15)', fg: '#aaa' };
    const resLabel = RESOURCE_LABELS[e.resourceType] || e.resourceType;
    const userLabel = e.userName || e.userEmail || '<span style="color:#666">unknown</span>';
    return `
      <div class="act-row">
        <div class="act-time" title="${escHTML(formatTimeAbsolute(e.createdAt))}">${escHTML(formatTime(e.createdAt))}</div>
        <div class="act-badges">
          <span class="act-badge" style="background:${colors.bg}; color:${colors.fg}">${escHTML(e.action)}</span>
          <span class="act-resource">${escHTML(resLabel)}</span>
        </div>
        <div class="act-label">${e.resourceLabel ? escHTML(e.resourceLabel) : '<span style="color:#666">—</span>'}</div>
        <div class="act-loc">${e.locationSlug ? escHTML(e.locationSlug) : '<span style="color:#666">—</span>'}</div>
        <div class="act-user">${userLabel}</div>
      </div>
    `;
  }).join('');

  const locationOptions = (locations || []).map(l =>
    `<option value="${escHTML(l.slug)}"${filters.location === l.slug ? ' selected' : ''}>${escHTML(l.name)}</option>`
  ).join('');

  return adminLayout('Activity', `
    <style>
      .act-head { margin-bottom: 18px; }
      .act-head h1 { margin: 0 0 4px; }
      .act-head p { color: #888; font-size: 0.92rem; margin: 0; }

      .act-filters {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
        margin-bottom: 18px;
      }
      .act-filters select {
        padding: 8px 12px;
        background: #1a1a1d;
        color: #ccc;
        border: 1px solid #333;
        border-radius: 8px;
        font-size: 0.88rem;
      }

      .act-list {
        background: #1a1a1a;
        border: 1px solid #2a2a2a;
        border-radius: 12px;
        overflow: hidden;
      }
      .act-row {
        display: grid;
        grid-template-columns: 80px 220px 1fr 130px 160px;
        gap: 14px;
        align-items: center;
        padding: 12px 16px;
        border-bottom: 1px solid #222;
        font-size: 0.88rem;
      }
      .act-row:last-child { border-bottom: none; }
      .act-row:hover { background: #1f1f1f; }
      .act-time { color: #888; font-size: 0.82rem; white-space: nowrap; }
      .act-badges { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
      .act-badge {
        display: inline-block;
        padding: 3px 9px;
        border-radius: 10px;
        font-size: 0.7rem;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
      .act-resource { color: #888; font-size: 0.78rem; }
      .act-label { color: #fff; font-weight: 600; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .act-loc { color: #aaa; font-size: 0.82rem; text-transform: capitalize; }
      .act-user { color: #888; font-size: 0.82rem; }
      .act-empty { padding: 50px 20px; text-align: center; color: #666; }

      @media (max-width: 768px) {
        .act-row {
          grid-template-columns: 1fr;
          gap: 4px;
          padding: 14px 16px;
        }
        .act-time { order: 5; font-size: 0.76rem; }
      }
    </style>

    <div class="act-head">
      <h1>Activity</h1>
      <p>Recent admin changes across all locations. Useful for multi-admin teams to see who did what.</p>
    </div>

    <form method="GET" action="/admin/activity" class="act-filters">
      <select name="location" onchange="this.form.submit()">
        <option value="">All Locations</option>${locationOptions}
      </select>
      <select name="action" onchange="this.form.submit()">
        <option value="">All Actions</option>
        <option value="create"${filters.action === 'create' ? ' selected' : ''}>Created</option>
        <option value="update"${filters.action === 'update' ? ' selected' : ''}>Updated</option>
        <option value="delete"${filters.action === 'delete' ? ' selected' : ''}>Deleted</option>
        <option value="duplicate"${filters.action === 'duplicate' ? ' selected' : ''}>Duplicated</option>
      </select>
      <select name="resourceType" onchange="this.form.submit()">
        <option value="">All Types</option>
        <option value="event"${filters.resourceType === 'event' ? ' selected' : ''}>Events</option>
        <option value="daily_special"${filters.resourceType === 'daily_special' ? ' selected' : ''}>Daily Specials</option>
        <option value="day_theme"${filters.resourceType === 'day_theme' ? ' selected' : ''}>Day Themes</option>
        <option value="menu_category"${filters.resourceType === 'menu_category' ? ' selected' : ''}>Menu Categories</option>
        <option value="menu_item"${filters.resourceType === 'menu_item' ? ' selected' : ''}>Menu Items</option>
        <option value="half_price"${filters.resourceType === 'half_price' ? ' selected' : ''}>Discounted Spirits</option>
      </select>
    </form>

    <div class="act-list">
      ${rows || '<div class="act-empty"><p style="font-size:1rem; margin-bottom:6px">No activity yet</p><p style="font-size:0.85rem">Changes will show up here as you and your team work in the admin.</p></div>'}
    </div>
  `, user, { pathname: '/admin/activity', flashMsg });
}

module.exports = { adminActivityView };
