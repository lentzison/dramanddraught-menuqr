const { adminLayout } = require('./adminLayout');
const { escHTML } = require('./escapeHtml');

const WEEK_DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DAY_LABELS = {
  monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday',
  thursday: 'Thursday', friday: 'Friday', saturday: 'Saturday', sunday: 'Sunday',
};

function parseTimeRange(rangeStr) {
  // "4:00 PM - 12:00 AM" -> { open: "16:00", close: "00:00" }
  if (!rangeStr || typeof rangeStr !== 'string') return { open: '', close: '', closed: true };
  const trimmed = rangeStr.trim().toLowerCase();
  if (trimmed === 'closed' || !trimmed) return { open: '', close: '', closed: true };

  const parts = rangeStr.split(/\s*[-–—]\s*/);
  if (parts.length < 2) return { open: '', close: '', closed: false };

  return {
    open: to24h(parts[0].trim()),
    close: to24h(parts[1].trim()),
    closed: false,
  };
}

function to24h(timeStr) {
  // "4:00 PM" -> "16:00", "12:00 AM" -> "00:00"
  if (!timeStr) return '';
  const match = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return timeStr; // already in 24h or unrecognized
  let hours = parseInt(match[1], 10);
  const minutes = match[2];
  const period = match[3].toUpperCase();
  if (period === 'PM' && hours !== 12) hours += 12;
  if (period === 'AM' && hours === 12) hours = 0;
  return `${String(hours).padStart(2, '0')}:${minutes}`;
}

// ─── Locations List ───
function locationsList(locations, user, flashMsg) {
  const cards = locations.map(loc => `
    <a href="/admin/locations/${escHTML(loc.slug)}" class="day-card" style="text-decoration:none">
      <div class="day-name">${escHTML(loc.name)}</div>
      <div class="theme-name">${escHTML(loc.city)}, ${escHTML(loc.state)}</div>
      <div class="specials-count">${escHTML(loc.address || '')}</div>
      <span class="tag ${loc.isActive ? 'tag-active' : 'tag-inactive'}">${loc.isActive ? 'Active' : 'Inactive'}</span>
    </a>
  `).join('');

  return adminLayout('Locations', `
    <h1>Locations</h1>
    <p style="color:#888; margin-bottom:20px">Manage location details, hours, and link buttons.</p>
    ${locations.length === 0 ? '<div class="empty-state">No locations yet. <a href="/admin/seed">Seed default locations</a></div>' : `
      <div class="grid-7">${cards}</div>
    `}
  `, user, { pathname: '/admin/locations', flashMsg });
}

// ─── Location Editor ───
function locationEditor(location, user, flashMsg) {
  const loc = location;
  const hours = (loc.hours && typeof loc.hours === 'object') ? loc.hours : {};
  const links = Array.isArray(loc.links) ? loc.links : [];

  const hoursRows = WEEK_DAYS.map(day => {
    const parsed = parseTimeRange(hours[day]);
    return `
      <div class="hours-row">
        <span class="day-label">${DAY_LABELS[day]}</span>
        <input type="time" name="hours_${day}_open" value="${escHTML(parsed.open)}" ${parsed.closed ? 'disabled' : ''} />
        <span class="to-label">to</span>
        <input type="time" name="hours_${day}_close" value="${escHTML(parsed.close)}" ${parsed.closed ? 'disabled' : ''} />
        <label>
          <input type="checkbox" name="hours_${day}_closed" ${parsed.closed ? 'checked' : ''}
            onchange="var r=this.closest('.hours-row'); var inputs=r.querySelectorAll('input[type=time]'); inputs.forEach(function(i){i.disabled=this.checked}.bind(this))" />
          Closed
        </label>
      </div>
    `;
  }).join('');

  const linkRows = links.map((link, i) => `
    <div class="link-row" data-link-index="${i}">
      <input type="text" name="link_label_${i}" value="${escHTML(link.label)}" placeholder="Label" />
      <input type="url" name="link_url_${i}" value="${escHTML(link.url)}" placeholder="https://..." />
      <button type="button" class="btn btn-danger btn-sm" onclick="this.closest('.link-row').remove()">Remove</button>
    </div>
  `).join('');

  return adminLayout(`Edit ${escHTML(loc.name)}`, `
    <h1>Edit ${escHTML(loc.name)}</h1>
    <p style="margin-bottom:20px"><a href="/admin/locations">&larr; Back to Locations</a> &nbsp; <a href="/${escHTML(loc.slug)}" target="_blank">View public page</a></p>

    <form method="POST" action="/admin/locations/${escHTML(loc.slug)}">
      <div class="card">
        <h2>Basic Info</h2>
        <div class="form-row">
          <div>
            <label>Name</label>
            <input type="text" name="name" value="${escHTML(loc.name)}" required />
          </div>
          <div>
            <label>Slug</label>
            <input type="text" name="slug" value="${escHTML(loc.slug)}" disabled />
          </div>
        </div>
        <label>Address</label>
        <input type="text" name="address" value="${escHTML(loc.address)}" />
        <div class="form-row">
          <div>
            <label>City</label>
            <input type="text" name="city" value="${escHTML(loc.city)}" required />
          </div>
          <div>
            <label>State</label>
            <input type="text" name="state" value="${escHTML(loc.state)}" required />
          </div>
          <div>
            <label>Zip</label>
            <input type="text" name="zipCode" value="${escHTML(loc.zipCode)}" />
          </div>
        </div>
        <div class="form-row">
          <div>
            <label>Phone</label>
            <input type="tel" name="phone" value="${escHTML(loc.phone)}" />
          </div>
          <div>
            <label>Email</label>
            <input type="email" name="email" value="${escHTML(loc.email)}" />
          </div>
        </div>
        <label>Special Text</label>
        <input type="text" name="specialText" value="${escHTML(loc.specialText)}" placeholder="e.g. 300+ Whiskeys | Craft Cocktails" />
        <label>Menu URL</label>
        <input type="url" name="menuUrl" value="${escHTML(loc.menuUrl)}" placeholder="https://..." />
      </div>

      <div class="card">
        <h2>Hours</h2>
        <p style="color:#888; font-size:0.85rem; margin-bottom:12px">Set open and close times for each day, or mark as Closed.</p>
        ${hoursRows}
      </div>

      <div class="card">
        <h2>Link Buttons</h2>
        <p style="color:#888; font-size:0.85rem; margin-bottom:12px">Linktree-style buttons shown on the location page.</p>
        <div id="linksContainer">
          ${linkRows}
        </div>
        <button type="button" class="btn btn-secondary btn-sm" style="margin-top:8px" onclick="addLinkRow()">+ Add Link</button>
      </div>

      <div class="card">
        <h2>Features</h2>
        <label>Features (comma-separated)</label>
        <input type="text" name="features" value="${escHTML((loc.features || []).join(', '))}" placeholder="e.g. 300+ Whiskeys, Craft Cocktails, NC Draft Beer" />
      </div>

      <div style="margin-top:12px">
        <label style="display:flex; align-items:center; gap:8px">
          <input type="checkbox" name="isActive" ${loc.isActive ? 'checked' : ''} style="width:auto" />
          <span>Active</span>
        </label>
      </div>

      <input type="hidden" name="linkCount" id="linkCountField" value="${links.length}" />

      <div class="form-actions">
        <button type="submit" class="btn btn-primary">Save Location</button>
        <a href="/admin/locations" class="btn btn-secondary">Cancel</a>
      </div>
    </form>

    <script>
      var linkCounter = ${links.length};
      function addLinkRow() {
        var container = document.getElementById('linksContainer');
        var idx = linkCounter++;
        var row = document.createElement('div');
        row.className = 'link-row';
        row.dataset.linkIndex = idx;
        row.innerHTML = '<input type="text" name="link_label_' + idx + '" placeholder="Label" />'
          + '<input type="url" name="link_url_' + idx + '" placeholder="https://..." />'
          + '<button type="button" class="btn btn-danger btn-sm" onclick="this.closest(\\'.link-row\\').remove()">Remove</button>';
        container.appendChild(row);
        document.getElementById('linkCountField').value = linkCounter;
      }
    </script>
  `, user, { pathname: '/admin/locations', flashMsg });
}

module.exports = { locationsList, locationEditor };
