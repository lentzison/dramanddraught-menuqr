const { adminLayout } = require('./adminLayout');
const { escHTML } = require('./escapeHtml');

const DAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
const DAY_LABELS = { SUNDAY: 'Sunday', MONDAY: 'Monday', TUESDAY: 'Tuesday', WEDNESDAY: 'Wednesday', THURSDAY: 'Thursday', FRIDAY: 'Friday', SATURDAY: 'Saturday' };

function formatEventDate(value) {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function getEasternDay() {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  return DAYS[now.getDay()];
}

// dashboardData is an array of location summaries built by the route handler:
//   {
//     location: { id, slug, name, city },
//     todayTheme: { name, tagline, specialsCount } | null,
//     halfPriceCount: number,        // 0 if not configured for today
//     menuCategoryCount: number,
//     menuItemCount: number,
//     activeEventCount: number,
//     nextEvent: { id, slug, title, startDate, signupCount } | null,
//   }
function adminDashboard(dashboardData, user, flashMsg) {
  const todayDay = getEasternDay();
  const todayLabel = DAY_LABELS[todayDay];

  const cards = (dashboardData || []).map(d => {
    const loc = d.location;
    const theme = d.todayTheme;
    const next = d.nextEvent;
    return `
      <div class="dash-card">
        <div class="dash-card-head">
          <div>
            <div class="dash-loc-name">${escHTML(loc.name)}</div>
            <div class="dash-loc-city">${escHTML(loc.city || '')}</div>
          </div>
          <a href="/${escHTML(loc.slug)}" target="_blank" class="dash-view-public" title="Open public page in new tab">View ↗</a>
        </div>

        <div class="dash-row">
          <div class="dash-row-label">Today &middot; ${escHTML(todayLabel)}</div>
          <div class="dash-row-value">
            ${theme ? `
              <strong>${escHTML(theme.name)}</strong>
              <span class="dash-pill">${theme.specialsCount} special${theme.specialsCount === 1 ? '' : 's'}</span>
              ${d.halfPriceCount > 0 ? `<span class="dash-pill dash-pill-gold">${d.halfPriceCount} discounted spirit${d.halfPriceCount === 1 ? '' : 's'}</span>` : ''}
            ` : '<span class="dash-empty">No theme set</span>'}
          </div>
          <a class="dash-edit" href="/admin/specials/day/${todayDay}${theme ? '/location/' + escHTML(loc.slug) : ''}">Edit</a>
        </div>

        <div class="dash-row">
          <div class="dash-row-label">Food Menu</div>
          <div class="dash-row-value">
            ${d.menuItemCount > 0
              ? `<strong>${d.menuItemCount}</strong> item${d.menuItemCount === 1 ? '' : 's'} in <strong>${d.menuCategoryCount}</strong> categor${d.menuCategoryCount === 1 ? 'y' : 'ies'}`
              : '<span class="dash-empty">No items</span>'}
          </div>
          <a class="dash-edit" href="/admin/menu/${escHTML(loc.slug)}">Edit</a>
        </div>

        <div class="dash-row">
          <div class="dash-row-label">Events</div>
          <div class="dash-row-value">
            ${d.activeEventCount > 0
              ? `<strong>${d.activeEventCount}</strong> active${next ? ' &middot; next: <strong>' + escHTML(next.title) + '</strong> on ' + escHTML(formatEventDate(next.startDate)) : ''}`
              : '<span class="dash-empty">No active events</span>'}
          </div>
          <a class="dash-edit" href="/admin/events">Manage</a>
        </div>
      </div>
    `;
  }).join('');

  return adminLayout('Dashboard', `
    <style>
      .dash-head { margin-bottom: 18px; }
      .dash-head h1 { margin: 0 0 4px; }
      .dash-head p { color: #888; font-size: 0.92rem; margin: 0; }

      .dash-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
        gap: 16px;
      }
      .dash-card {
        background: #1a1a1a;
        border: 1px solid #2a2a2a;
        border-radius: 12px;
        padding: 18px 20px;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .dash-card-head {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 10px;
        padding-bottom: 10px;
        border-bottom: 1px solid #222;
      }
      .dash-loc-name {
        font-size: 1.1rem;
        font-weight: 700;
        color: #fff;
        line-height: 1.1;
      }
      .dash-loc-city {
        color: #888;
        font-size: 0.78rem;
        margin-top: 3px;
      }
      .dash-view-public {
        font-size: 0.78rem;
        color: #888;
        text-decoration: none;
        padding: 4px 10px;
        border: 1px solid #2a2a2a;
        border-radius: 6px;
        white-space: nowrap;
        transition: border-color 0.15s, color 0.15s;
      }
      .dash-view-public:hover { border-color: #d4af37; color: #d4af37; text-decoration: none; }

      .dash-row {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 6px 12px;
        align-items: start;
      }
      .dash-row-label {
        grid-column: 1 / -1;
        font-size: 0.68rem;
        font-weight: 800;
        color: #666;
        text-transform: uppercase;
        letter-spacing: 0.1em;
      }
      .dash-row-value {
        color: #ccc;
        font-size: 0.9rem;
        line-height: 1.45;
      }
      .dash-row-value strong { color: #fff; }
      .dash-empty { color: #555; font-style: italic; font-size: 0.85rem; }
      .dash-edit {
        align-self: end;
        font-size: 0.76rem;
        font-weight: 700;
        color: #d4af37;
        text-decoration: none;
        padding: 4px 12px;
        border: 1px solid rgba(212,175,55,0.35);
        border-radius: 6px;
        white-space: nowrap;
      }
      .dash-edit:hover { background: rgba(212,175,55,0.1); text-decoration: none; }

      .dash-pill {
        display: inline-block;
        background: #222;
        color: #aaa;
        font-size: 0.72rem;
        padding: 2px 8px;
        border-radius: 10px;
        margin-left: 6px;
      }
      .dash-pill-gold { background: rgba(212,175,55,0.18); color: #d4af37; }

      .dash-quick-links {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        margin-bottom: 18px;
      }
      .dash-quick-links a {
        padding: 8px 14px;
        background: #1a1a1a;
        border: 1px solid #2a2a2a;
        border-radius: 8px;
        color: #ccc;
        text-decoration: none;
        font-size: 0.85rem;
        font-weight: 600;
      }
      .dash-quick-links a:hover { border-color: #d4af37; color: #d4af37; text-decoration: none; }
    </style>

    <div class="dash-head">
      <h1>Dashboard</h1>
      <p>What's live across all locations right now. Click any card section to edit it.</p>
    </div>

    <div class="dash-quick-links">
      <a href="/admin/specials">All Specials</a>
      <a href="/admin/menu">All Menus</a>
      <a href="/admin/events">All Events</a>
      <a href="/admin/flights">Flights</a>
      <a href="/admin/analytics">Analytics</a>
      <a href="/admin/feedback">Feedback</a>
    </div>

    <div class="dash-grid">
      ${cards || '<p style="color:#666">No active locations. <a href="/admin/locations" style="color:#d4af37">Add one</a>.</p>'}
    </div>
  `, user, { pathname: '/admin', flashMsg });
}

module.exports = { adminDashboard };
