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
  const rows = dashboardData || [];
  const totals = rows.reduce((acc, d) => {
    acc.locations += 1;
    acc.specials += d.todayTheme ? (d.todayTheme.specialsCount || 0) : 0;
    acc.menuItems += d.menuItemCount || 0;
    acc.events += d.activeEventCount || 0;
    if (!d.todayTheme) acc.missingThemes += 1;
    if (!d.menuItemCount) acc.emptyMenus += 1;
    return acc;
  }, { locations: 0, specials: 0, menuItems: 0, events: 0, missingThemes: 0, emptyMenus: 0 });
  const allSet = totals.locations > 0 && totals.missingThemes === 0 && totals.emptyMenus === 0;
  const attentionItems = [
    totals.missingThemes ? {
      href: '/admin/specials',
      label: `${totals.missingThemes} location${totals.missingThemes === 1 ? '' : 's'} missing today's theme`,
      detail: 'Guests may see an incomplete daily specials page.',
    } : null,
    totals.emptyMenus ? {
      href: '/admin/menu',
      label: `${totals.emptyMenus} location${totals.emptyMenus === 1 ? '' : 's'} with no food menu items`,
      detail: 'Add at least one category and item so the QR menu is useful.',
    } : null,
  ].filter(Boolean);
  const quickLinks = [
    { href: '/admin/specials', title: 'Update Specials', detail: 'Daily themes, specials, discounted spirits', action: 'Edit specials' },
    { href: '/admin/menu', title: 'Edit Food Menu', detail: 'Categories, items, prices, photos', action: 'Edit menu' },
    { href: '/admin/events', title: 'Manage Events', detail: 'Landing pages, RSVPs, vendor signups', action: 'Open events' },
    { href: '/admin/analytics', title: 'Check Analytics', detail: 'Traffic, QR scans, source breakdowns', action: 'View analytics' },
    { href: '/admin/feedback', title: 'Review Feedback', detail: 'Guest comments and newsletter opt-ins', action: 'Open feedback' },
  ].filter(Boolean);
  const attentionHtml = attentionItems.length ? attentionItems.map(item => `
    <a class="dash-attention-card" href="${item.href}">
      <span class="dash-attention-mark">!</span>
      <span>
        <strong>${escHTML(item.label)}</strong>
        <small>${escHTML(item.detail)}</small>
      </span>
    </a>
  `).join('') : `
    <div class="dash-all-clear">
      <span class="dash-all-clear-mark">OK</span>
      <span>
        <strong>${totals.locations ? 'Today looks ready' : 'No active locations yet'}</strong>
        <small>${totals.locations ? 'No missing daily themes or empty menus were found.' : 'Add or activate a location to start managing QR pages.'}</small>
      </span>
    </div>
  `;
  const quickLinksHtml = quickLinks.map(link => `
    <a href="${link.href}" class="dash-action-card">
      <span>
        <strong>${escHTML(link.title)}</strong>
        <small>${escHTML(link.detail)}</small>
      </span>
      <em>${escHTML(link.action)}</em>
    </a>
  `).join('');

  const cards = rows.map(d => {
    const loc = d.location;
    const theme = d.todayTheme;
    const next = d.nextEvent;
    const themeStatus = theme ? `${theme.specialsCount} special${theme.specialsCount === 1 ? '' : 's'}` : 'Needs setup';
    const menuStatus = d.menuItemCount > 0 ? `${d.menuItemCount} item${d.menuItemCount === 1 ? '' : 's'}` : 'Needs setup';
    return `
      <section class="dash-card">
        <div class="dash-card-head">
          <div>
            <div class="dash-loc-name">${escHTML(loc.name)}</div>
            <div class="dash-loc-city">${escHTML(loc.city || '')}</div>
          </div>
          <a href="/${escHTML(loc.slug)}" target="_blank" class="dash-view-public" title="Open public page in new tab">Public Page</a>
        </div>

        <div class="dash-row${theme ? '' : ' dash-row-attention'}">
          <div class="dash-row-label">
            <span>Today - ${escHTML(todayLabel)}</span>
            <span class="dash-row-status">${escHTML(themeStatus)}</span>
          </div>
          <div class="dash-row-value">
            ${theme ? `
              <strong>${escHTML(theme.name)}</strong>
              <span class="dash-pill">${theme.specialsCount} special${theme.specialsCount === 1 ? '' : 's'}</span>
              ${d.halfPriceCount > 0 ? `<span class="dash-pill dash-pill-gold">${d.halfPriceCount} discounted spirit${d.halfPriceCount === 1 ? '' : 's'}</span>` : ''}
            ` : '<span class="dash-empty">No theme set</span>'}
          </div>
          <a class="dash-edit" href="/admin/specials/day/${todayDay}${theme ? '/location/' + escHTML(loc.slug) : ''}">Edit</a>
        </div>

        <div class="dash-row${d.menuItemCount > 0 ? '' : ' dash-row-attention'}">
          <div class="dash-row-label">
            <span>Food Menu</span>
            <span class="dash-row-status">${escHTML(menuStatus)}</span>
          </div>
          <div class="dash-row-value">
            ${d.menuItemCount > 0
              ? `<strong>${d.menuItemCount}</strong> item${d.menuItemCount === 1 ? '' : 's'} in <strong>${d.menuCategoryCount}</strong> categor${d.menuCategoryCount === 1 ? 'y' : 'ies'}`
              : '<span class="dash-empty">No items</span>'}
          </div>
          <a class="dash-edit" href="/admin/menu/${escHTML(loc.slug)}">Edit</a>
        </div>

        <div class="dash-row">
          <div class="dash-row-label">
            <span>Events</span>
            <span class="dash-row-status">${d.activeEventCount} upcoming</span>
          </div>
          <div class="dash-row-value">
            ${d.activeEventCount > 0
              ? `<strong>${d.activeEventCount}</strong> active${next ? ' &middot; next: <strong>' + escHTML(next.title) + '</strong> on ' + escHTML(formatEventDate(next.startDate)) : ''}`
              : '<span class="dash-empty">No active events</span>'}
          </div>
          <a class="dash-edit" href="/admin/events">Manage</a>
        </div>
      </section>
    `;
  }).join('');

  return adminLayout('Dashboard', `
    <style>
      .dash-overview {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 12px;
        margin-bottom: 18px;
      }
      .dash-stat {
        background: linear-gradient(180deg, rgba(255,255,255,0.045), rgba(255,255,255,0.015)), var(--surface);
        border: 1px solid var(--line);
        border-radius: var(--radius);
        padding: 16px;
      }
      .dash-stat-num { color: var(--gold-strong); font-size: 1.55rem; font-weight: 850; line-height: 1; }
      .dash-stat-label { color: var(--text-muted); font-size: 0.78rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; margin-top: 6px; }
      .dash-alert-strip {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
        margin-bottom: 20px;
      }
      .dash-alert {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 9px 12px;
        border-radius: var(--radius);
        background: rgba(242,166,90,0.12);
        border: 1px solid rgba(242,166,90,0.28);
        color: #ffd9ad;
        font-size: 0.85rem;
        font-weight: 650;
      }
      .dash-command-grid {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(300px, 0.75fr);
        gap: 16px;
        margin-bottom: 22px;
      }
      .dash-command-panel {
        background: linear-gradient(180deg, rgba(143,183,255,0.08), rgba(255,255,255,0.018)), var(--surface);
        border: 1px solid rgba(143,183,255,0.22);
        border-radius: var(--radius);
        padding: 18px;
      }
      .dash-command-panel h2,
      .dash-attention-panel h2 {
        color: var(--text);
        margin: 0 0 5px;
        font-size: 1.05rem;
      }
      .dash-command-panel p,
      .dash-attention-panel p {
        color: var(--text-muted);
        font-size: 0.9rem;
        margin-bottom: 14px;
      }
      .dash-action-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
      }
      .dash-action-card,
      .dash-attention-card,
      .dash-all-clear {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        min-height: 76px;
        border: 1px solid var(--line);
        border-radius: var(--radius);
        background: rgba(0,0,0,0.16);
        padding: 13px;
        text-decoration: none;
      }
      .dash-action-card strong,
      .dash-attention-card strong,
      .dash-all-clear strong {
        display: block;
        color: var(--text);
        line-height: 1.2;
      }
      .dash-action-card small,
      .dash-attention-card small,
      .dash-all-clear small {
        display: block;
        color: var(--text-soft);
        font-size: 0.78rem;
        line-height: 1.35;
        margin-top: 4px;
      }
      .dash-action-card em {
        color: var(--gold-strong);
        font-style: normal;
        font-size: 0.78rem;
        font-weight: 850;
        white-space: nowrap;
      }
      .dash-action-card:hover,
      .dash-attention-card:hover {
        border-color: rgba(214,173,75,0.48);
        background: rgba(214,173,75,0.06);
        text-decoration: none;
      }
      .dash-attention-panel {
        background: linear-gradient(180deg, rgba(242,166,90,0.08), rgba(255,255,255,0.018)), var(--surface);
        border: 1px solid rgba(242,166,90,0.22);
        border-radius: var(--radius);
        padding: 18px;
      }
      .dash-attention-list {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .dash-attention-card {
        justify-content: flex-start;
        color: inherit;
      }
      .dash-attention-mark,
      .dash-all-clear-mark {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 34px;
        height: 34px;
        border-radius: 50%;
        flex: 0 0 34px;
        font-size: 0.76rem;
        font-weight: 900;
      }
      .dash-attention-mark {
        background: rgba(242,166,90,0.18);
        color: #ffd9ad;
        border: 1px solid rgba(242,166,90,0.35);
      }
      .dash-all-clear {
        justify-content: flex-start;
      }
      .dash-all-clear-mark {
        background: rgba(98,210,143,0.16);
        color: #b9f7cc;
        border: 1px solid rgba(98,210,143,0.34);
      }

      .dash-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
        gap: 16px;
      }
      .dash-card {
        background: linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.015)), var(--surface);
        border: 1px solid var(--line);
        border-radius: var(--radius);
        padding: 18px;
        display: flex;
        flex-direction: column;
        gap: 12px;
        box-shadow: 0 1px 0 rgba(255,255,255,0.03) inset;
      }
      .dash-card-head {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 10px;
        padding-bottom: 12px;
        border-bottom: 1px solid rgba(255,255,255,0.07);
      }
      .dash-loc-name {
        font-size: 1.1rem;
        font-weight: 800;
        color: var(--text);
        line-height: 1.1;
      }
      .dash-loc-city {
        color: var(--text-muted);
        font-size: 0.78rem;
        margin-top: 3px;
      }
      .dash-view-public {
        font-size: 0.78rem;
        color: var(--text-muted);
        text-decoration: none;
        padding: 6px 10px;
        border: 1px solid var(--line);
        border-radius: var(--radius);
        white-space: nowrap;
        transition: border-color 0.15s, color 0.15s;
      }
      .dash-view-public:hover { border-color: var(--gold); color: var(--gold-strong); text-decoration: none; }

      .dash-row {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 6px 12px;
        align-items: start;
        padding: 12px;
        border: 1px solid rgba(255,255,255,0.06);
        border-radius: var(--radius);
        background: rgba(0,0,0,0.12);
      }
      .dash-row-attention {
        border-color: rgba(242,166,90,0.28);
        background: rgba(242,166,90,0.06);
      }
      .dash-row-label {
        grid-column: 1 / -1;
        display: flex;
        justify-content: space-between;
        gap: 10px;
        font-size: 0.68rem;
        font-weight: 800;
        color: var(--text-soft);
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }
      .dash-row-status {
        color: var(--text-muted);
        letter-spacing: 0.04em;
        text-align: right;
      }
      .dash-row-value {
        color: #ded6ca;
        font-size: 0.9rem;
        line-height: 1.45;
      }
      .dash-row-value strong { color: var(--text); }
      .dash-empty { color: var(--amber); font-size: 0.85rem; }
      .dash-edit {
        align-self: end;
        font-size: 0.78rem;
        font-weight: 800;
        color: var(--gold-strong);
        text-decoration: none;
        padding: 6px 12px;
        border: 1px solid rgba(214,173,75,0.38);
        border-radius: var(--radius);
        white-space: nowrap;
      }
      .dash-edit:hover { background: rgba(214,173,75,0.1); text-decoration: none; }

      .dash-pill {
        display: inline-block;
        background: rgba(255,255,255,0.07);
        color: var(--text-muted);
        font-size: 0.72rem;
        padding: 2px 8px;
        border-radius: 10px;
        margin-left: 6px;
      }
      .dash-pill-gold { background: rgba(214,173,75,0.18); color: var(--gold-strong); }

      @media (max-width: 768px) {
        .dash-overview { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .dash-command-grid { grid-template-columns: 1fr; }
        .dash-action-grid { grid-template-columns: 1fr; }
        .dash-grid { grid-template-columns: 1fr; }
      }
      @media (max-width: 520px) {
        .dash-overview { grid-template-columns: 1fr; }
        .dash-row { grid-template-columns: 1fr; }
        .dash-edit { width: 100%; text-align: center; }
        .dash-action-card { align-items: flex-start; flex-direction: column; }
      }
    </style>

    <div class="page-header">
      <div>
        <div class="admin-kicker">Today in admin</div>
        <h1>Admin Dashboard</h1>
        <p class="page-subtitle">Start here to see what needs attention, then jump straight into the page you need to update.</p>
      </div>
    </div>

    <div class="dash-overview">
      <div class="dash-stat"><div class="dash-stat-num">${totals.locations}</div><div class="dash-stat-label">Locations</div></div>
      <div class="dash-stat"><div class="dash-stat-num">${totals.specials}</div><div class="dash-stat-label">Today’s Specials</div></div>
      <div class="dash-stat"><div class="dash-stat-num">${totals.menuItems}</div><div class="dash-stat-label">Menu Items</div></div>
      <div class="dash-stat"><div class="dash-stat-num">${totals.events}</div><div class="dash-stat-label">Upcoming Events</div></div>
    </div>

    <div class="dash-command-grid">
      <section class="dash-command-panel">
        <h2>Common tasks</h2>
        <p>Use these shortcuts for the work managers do most often.</p>
        <div class="dash-action-grid">${quickLinksHtml}</div>
      </section>
      <section class="dash-attention-panel">
        <h2>${allSet ? 'Ready to publish' : 'Needs attention'}</h2>
        <p>${allSet ? 'The main guest-facing basics are in place for today.' : 'Fix these first so public QR pages are easy for guests to understand.'}</p>
        <div class="dash-attention-list">${attentionHtml}</div>
      </section>
    </div>

    <div class="section-head">
      <div>
        <h2>Location Status</h2>
        <p>Each location card shows today's specials, menu readiness, events, and public page link.</p>
      </div>
    </div>
    <div class="dash-grid">
      ${cards || '<div class="empty-state"><strong>No active locations</strong><a href="/admin/locations">Add or activate a location</a> to start managing QR pages.</div>'}
    </div>
  `, user, { pathname: '/admin', flashMsg });
}

module.exports = { adminDashboard };
