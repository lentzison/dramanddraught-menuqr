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
    <a href="/admin/locations/${escHTML(loc.slug)}" class="admin-card-link">
      <div class="admin-card-title">${escHTML(loc.name)}</div>
      <div class="admin-card-meta">${escHTML(loc.city)}, ${escHTML(loc.state)}${loc.address ? `<br>${escHTML(loc.address)}` : ''}</div>
      <div class="admin-card-footer">
        <span class="tag ${loc.isActive ? 'tag-active' : 'tag-inactive'}">${loc.isActive ? 'Active' : 'Inactive'}</span>
        <span>Edit details</span>
      </div>
    </a>
  `).join('');

  return adminLayout('Locations', `
    <div class="page-header">
      <div>
        <div class="admin-kicker">Public location pages</div>
        <h1>Locations</h1>
        <p class="page-subtitle">Manage public location details, hours, contact information, and link buttons.</p>
      </div>
    </div>
    ${locations.length === 0 ? '<div class="empty-state"><strong>No locations yet</strong><a href="/admin/seed">Seed default locations</a></div>' : `
      <div class="admin-grid">${cards}</div>
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
    <div class="page-header">
      <div>
        <h1>Edit ${escHTML(loc.name)}</h1>
        <p class="page-subtitle">Keep the public location page accurate for guests.</p>
      </div>
      <div class="page-actions">
        <a href="/admin/locations" class="btn btn-secondary">All Locations</a>
        ${loc.isActive
          ? `<a href="/${escHTML(loc.slug)}" target="_blank" class="btn btn-secondary">View Public Page</a>`
          : `<span class="btn btn-secondary" style="opacity:0.55;cursor:not-allowed" title="This location is inactive and not visible publicly. Toggle 'Active' on to publish.">View Public Page (inactive)</span>`}
      </div>
    </div>

    <form method="POST" action="/admin/locations/${escHTML(loc.slug)}" data-autosave="location-${escHTML(loc.slug)}">
      <section class="form-section">
        <div class="form-section-head">
          <div>
            <h2>Basics</h2>
            <p>Name, address, and contact details shown on the public page.</p>
          </div>
        </div>
        <div class="form-section-body">
          <div class="form-row">
            <div>
              <label>Name</label>
              <input type="text" name="name" value="${escHTML(loc.name)}" required />
            </div>
            <div>
              <label>Public URL</label>
              <div class="field-readonly" style="padding:10px 12px;border:1px dashed var(--border,#444);border-radius:6px;background:rgba(255,255,255,0.03);font-family:monospace;font-size:0.9rem;color:var(--text)">/${escHTML(loc.slug)}</div>
              <div class="field-help">URL slug is permanent. Contact engineering if it needs to change.</div>
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
      </section>

      <section class="form-section">
        <div class="form-section-head">
          <div>
            <h2>Social Media</h2>
            <p>Full URLs to this location's social profiles. Each one becomes a button on the public location page.</p>
          </div>
        </div>
        <div class="form-section-body">
          <div class="form-row">
            <div>
              <label>Facebook URL</label>
              <input type="url" name="facebook" value="${escHTML(loc.facebook || '')}" placeholder="https://facebook.com/..." />
            </div>
            <div>
              <label>Instagram URL</label>
              <input type="url" name="instagram" value="${escHTML(loc.instagram || '')}" placeholder="https://instagram.com/..." />
            </div>
            <div>
              <label>Twitter / X URL</label>
              <input type="url" name="twitter" value="${escHTML(loc.twitter || '')}" placeholder="https://x.com/..." />
            </div>
          </div>
        </div>
      </section>

      <section class="form-section">
        <div class="form-section-head">
          <div>
            <h2>Hours</h2>
            <p>Set open and close times for each day, or mark the day closed.</p>
          </div>
        </div>
        <div class="form-section-body">${hoursRows}</div>
      </section>

      <section class="form-section">
        <div class="form-section-head">
          <div>
            <h2>Link Buttons</h2>
            <p>Extra buttons for things like reservations, ordering, or promos. Menu, Spirit List, Call, and social buttons render automatically from the fields above — don't re-add them here.</p>
          </div>
        </div>
        <div class="form-section-body">
          <div id="linksContainer">
            ${linkRows || '<div class="empty-state"><strong>No custom links yet.</strong> Add one when this location needs an extra public button (e.g. reservations, online ordering).</div>'}
          </div>
          <button type="button" class="btn btn-secondary btn-sm" style="margin-top:8px" onclick="addLinkRow()">Add Link</button>
        </div>
      </section>

      <section class="form-section">
        <div class="form-section-head">
          <div>
            <h2>Features & Publishing</h2>
            <p>Short feature bullets and whether this location should appear publicly.</p>
          </div>
        </div>
        <div class="form-section-body">
          <label>Features (comma-separated)</label>
          <input type="text" name="features" value="${escHTML((loc.features || []).join(', '))}" placeholder="e.g. 300+ Whiskeys, Craft Cocktails, NC Draft Beer" />

          <label class="checkbox-card" style="margin-top:16px">
            <input type="checkbox" name="isActive" ${loc.isActive ? 'checked' : ''} style="width:auto" />
            <span><strong style="display:block;color:var(--text)">Active</strong><span class="field-help" style="display:block;margin:2px 0 0">Show this location on public QR pages and admin workflows.</span></span>
          </label>

          <label class="checkbox-card" style="margin-top:12px">
            <input type="checkbox" name="isHiring" ${loc.isHiring ? 'checked' : ''} style="width:auto" />
            <span><strong style="display:block;color:var(--text)">Currently hiring</strong><span class="field-help" style="display:block;margin:2px 0 0">Shows a "We're Hiring" badge on the public location page and accepts applications at /${escHTML(loc.slug || '')}/apply.</span></span>
          </label>
        </div>
      </section>

      <input type="hidden" name="linkCount" id="linkCountField" value="${links.length}" />

      <div class="sticky-actions">
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
