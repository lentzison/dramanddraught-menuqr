const { adminLayout } = require('./adminLayout');

function escHTML(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Format a date as local datetime-local input value ("YYYY-MM-DDTHH:MM")
function toDateTimeLocal(value) {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return '';
  // Use Eastern time for display/editing since that's the business timezone
  const eastern = new Date(d.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const pad = n => String(n).padStart(2, '0');
  return `${eastern.getFullYear()}-${pad(eastern.getMonth() + 1)}-${pad(eastern.getDate())}T${pad(eastern.getHours())}:${pad(eastern.getMinutes())}`;
}

function formatFriendlyDate(value) {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function eventStatusBadge(event) {
  if (event.isCancelled) return '<span class="ev-badge ev-badge-cancelled">Cancelled</span>';
  if (!event.isActive) return '<span class="ev-badge ev-badge-inactive">Hidden</span>';

  const now = new Date();
  const start = event.startDate ? new Date(event.startDate) : null;
  const promoteFrom = event.promoteFrom ? new Date(event.promoteFrom) : null;
  const promoteUntil = event.promoteUntil ? new Date(event.promoteUntil) : (start || null);

  if (start && now > start) return '<span class="ev-badge ev-badge-past">Past</span>';
  if (promoteFrom && now < promoteFrom) return '<span class="ev-badge ev-badge-scheduled">Upcoming</span>';
  if (promoteUntil && now > promoteUntil) return '<span class="ev-badge ev-badge-closed">Signups Closed</span>';
  return '<span class="ev-badge ev-badge-live">Live</span>';
}

// ─── Events list ───
function eventsList(events, user, flashMsg) {
  const rows = events.map(ev => {
    const signupCount = ev._count?.signups || 0;
    const capacityText = ev.capacity ? `${signupCount} / ${ev.capacity}` : `${signupCount}`;
    const locName = ev.location?.name || '';
    const locSlug = ev.location?.slug || '';
    const publicPath = locSlug && ev.slug ? `/${locSlug}/events/${ev.slug}` : '';
    return `
      <div class="ev-row">
        <div class="ev-row-main">
          <div class="ev-row-title">
            <a href="/admin/events/${escHTML(ev.id)}" class="ev-row-link">${escHTML(ev.title)}</a>
            ${eventStatusBadge(ev)}
          </div>
          <div class="ev-row-meta">
            <span>${escHTML(locName)}</span>
            <span>•</span>
            <span>${escHTML(formatFriendlyDate(ev.startDate))}</span>
          </div>
        </div>
        <div class="ev-row-stats">
          <div class="ev-signup-count">
            <span class="ev-signup-num">${capacityText}</span>
            <span class="ev-signup-lbl">signups</span>
          </div>
          <div class="ev-row-actions">
            <a href="/admin/events/${escHTML(ev.id)}/signups" class="btn btn-secondary btn-sm">View Signups</a>
            <a href="/admin/events/${escHTML(ev.id)}" class="btn btn-secondary btn-sm">Edit</a>
            ${publicPath ? `<a href="${escHTML(publicPath)}" class="btn btn-secondary btn-sm" target="_blank">View ↗</a>` : ''}
          </div>
        </div>
      </div>
    `;
  }).join('');

  return adminLayout('Events', `
    <style>
      .ev-header-row { display:flex; justify-content:space-between; align-items:center; margin-bottom:18px; flex-wrap:wrap; gap:12px; }
      .ev-empty { text-align:center; padding:60px 20px; color:#666; }
      .ev-empty-icon { font-size:2.5rem; opacity:0.3; margin-bottom:8px; }

      .ev-row {
        display:flex;
        justify-content:space-between;
        align-items:center;
        gap:16px;
        padding:16px 18px;
        background:#1a1a1a;
        border:1px solid #2a2a2a;
        border-radius:10px;
        margin-bottom:10px;
        flex-wrap:wrap;
      }
      .ev-row:hover { border-color:#3a3a3a; }
      .ev-row-main { flex:1; min-width:240px; }
      .ev-row-title { display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin-bottom:4px; }
      .ev-row-link { font-size:1.05rem; font-weight:700; color:#fff; text-decoration:none; }
      .ev-row-link:hover { color:#d4af37; text-decoration:none; }
      .ev-row-meta { color:#888; font-size:0.85rem; display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
      .ev-row-meta span { white-space:nowrap; }

      .ev-row-stats { display:flex; align-items:center; gap:16px; flex-wrap:wrap; }
      .ev-signup-count { text-align:right; min-width:80px; }
      .ev-signup-num { display:block; font-size:1.4rem; font-weight:800; color:#d4af37; line-height:1; }
      .ev-signup-lbl { display:block; font-size:0.68rem; color:#888; text-transform:uppercase; letter-spacing:0.08em; margin-top:3px; }
      .ev-row-actions { display:flex; gap:6px; flex-wrap:wrap; }

      .ev-badge { display:inline-block; padding:3px 9px; border-radius:10px; font-size:0.68rem; font-weight:700; text-transform:uppercase; letter-spacing:0.04em; }
      .ev-badge-live { background:rgba(34,197,94,0.18); color:#4ade80; }
      .ev-badge-scheduled { background:rgba(96,165,250,0.18); color:#93c5fd; }
      .ev-badge-closed { background:rgba(251,146,60,0.18); color:#fdba74; }
      .ev-badge-past { background:rgba(150,150,150,0.15); color:#999; }
      .ev-badge-cancelled { background:rgba(239,68,68,0.18); color:#f87171; }
      .ev-badge-inactive { background:rgba(150,150,150,0.15); color:#888; }
    </style>

    <div class="ev-header-row">
      <div>
        <h1 style="margin:0">Events</h1>
        <p style="color:#888; margin:4px 0 0; font-size:0.9rem">Create signup pages for events like Lubrication Cup, tastings, and private parties.</p>
      </div>
      <a href="/admin/events/new" class="btn btn-primary">+ New Event</a>
    </div>

    ${events.length === 0 ? `
      <div class="ev-empty">
        <div class="ev-empty-icon">◎</div>
        <p style="font-size:1rem; color:#888; margin-bottom:4px">No events yet</p>
        <p style="font-size:0.85rem">Click &ldquo;New Event&rdquo; above to create your first one.</p>
      </div>
    ` : rows}
  `, user, { pathname: '/admin/events', flashMsg });
}

// ─── Event editor (create or edit) ───
function eventEditor(event, locations, user, flashMsg, signupCount = 0) {
  const isNew = !event;
  const title = isNew ? 'New Event' : 'Edit Event';
  const actionUrl = isNew ? '/admin/events/new' : `/admin/events/${escHTML(event.id)}`;

  const locationOptions = locations.map(l => {
    const selected = !isNew && event.locationId === l.id ? ' selected' : '';
    return `<option value="${escHTML(l.id)}"${selected}>${escHTML(l.name)}</option>`;
  }).join('');

  const customQuestions = (!isNew && Array.isArray(event.customQuestions)) ? event.customQuestions : [];
  const customQuestionRows = customQuestions.map((q, i) => `
    <div class="cq-row" data-cq-idx="${i}">
      <div class="cq-row-grid">
        <div>
          <label>Question</label>
          <input type="text" name="custom_label" value="${escHTML(q.label)}" placeholder="e.g. T-shirt size" />
        </div>
        <div>
          <label>Type</label>
          <select name="custom_type">
            <option value="text"${q.type === 'text' ? ' selected' : ''}>Short text</option>
            <option value="textarea"${q.type === 'textarea' ? ' selected' : ''}>Long text</option>
            <option value="number"${q.type === 'number' ? ' selected' : ''}>Number</option>
            <option value="yesno"${q.type === 'yesno' ? ' selected' : ''}>Yes / No</option>
          </select>
        </div>
        <div class="cq-required-col">
          <label>&nbsp;</label>
          <label class="ev-check"><input type="checkbox" name="custom_required_${i}" ${q.required ? 'checked' : ''} /> Required</label>
        </div>
        <div class="cq-del-col">
          <label>&nbsp;</label>
          <button type="button" class="btn btn-danger btn-sm cq-remove">Remove</button>
        </div>
      </div>
    </div>
  `).join('');

  // Public URL preview (shown when editing)
  let publicUrlBlock = '';
  if (!isNew) {
    const locSlug = event.location?.slug || '';
    const publicUrl = locSlug && event.slug ? `/${locSlug}/events/${event.slug}` : '';
    publicUrlBlock = `
      <div class="ev-public-url">
        <div class="ev-public-url-label">Share link</div>
        <div class="ev-public-url-row">
          <input type="text" id="ev-share-url" readonly value="${escHTML(publicUrl ? (typeof window === 'undefined' ? publicUrl : '') : publicUrl)}" />
          <button type="button" id="ev-copy-url" class="btn btn-primary btn-sm">Copy</button>
          ${publicUrl ? `<a href="${escHTML(publicUrl)}" target="_blank" class="btn btn-secondary btn-sm">Open ↗</a>` : ''}
        </div>
        <div class="ev-public-url-hint">Paste this link in your social posts and emails. Traffic will be tracked in Analytics.</div>
      </div>
    `;
  }

  return adminLayout(title, `
    <style>
      .ev-editor-head { display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap; margin-bottom:18px; }
      .ev-editor-head .ev-back { color:#888; font-size:0.85rem; text-decoration:none; }
      .ev-editor-head .ev-back:hover { color:#d4af37; }

      .ev-public-url {
        background:rgba(96,165,250,0.08);
        border:1px solid rgba(96,165,250,0.25);
        border-radius:10px;
        padding:14px 16px;
        margin-bottom:20px;
      }
      .ev-public-url-label { font-size:0.72rem; color:#93c5fd; font-weight:700; text-transform:uppercase; letter-spacing:0.08em; margin-bottom:8px; }
      .ev-public-url-row { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
      .ev-public-url-row input { flex:1; min-width:260px; background:#0d0d0d; color:#d4af37; font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; font-size:0.85rem; }
      .ev-public-url-hint { color:#888; font-size:0.78rem; margin-top:8px; }

      .ev-section {
        background:#1a1a1a;
        border:1px solid #2a2a2a;
        border-radius:12px;
        padding:20px 22px;
        margin-bottom:16px;
      }
      .ev-section h2 {
        color:#d4af37;
        font-size:0.78rem;
        text-transform:uppercase;
        letter-spacing:0.1em;
        margin:0 0 4px;
        font-weight:700;
      }
      .ev-section .ev-section-hint {
        color:#888;
        font-size:0.82rem;
        margin-bottom:14px;
      }

      .ev-check { display:flex; align-items:center; gap:8px; color:#ccc; font-size:0.9rem; margin:0; padding:10px 0; cursor:pointer; }
      .ev-check input[type="checkbox"] { width:auto; margin:0; }

      .ev-field-grid {
        display:grid;
        grid-template-columns:1fr 1fr;
        gap:14px;
      }

      .ev-standard-fields {
        display:grid;
        grid-template-columns:1fr 1fr;
        gap:4px 20px;
        background:#111;
        padding:12px 16px;
        border-radius:8px;
        border:1px solid #222;
      }

      .cq-list { margin-bottom:14px; }
      .cq-row {
        background:#111;
        border:1px solid #222;
        border-radius:8px;
        padding:14px;
        margin-bottom:10px;
      }
      .cq-row-grid {
        display:grid;
        grid-template-columns:2fr 1fr auto auto;
        gap:10px;
        align-items:flex-end;
      }
      .cq-row-grid label { margin-top:0; }
      .cq-required-col { display:flex; align-items:flex-end; }
      .cq-required-col .ev-check { padding:10px 4px; }
      .cq-del-col { display:flex; align-items:flex-end; }

      .ev-delete-section {
        background:rgba(239,68,68,0.05);
        border:1px solid rgba(239,68,68,0.2);
        border-radius:10px;
        padding:16px 18px;
        margin-top:24px;
      }
      .ev-delete-section h3 { color:#f87171; font-size:0.85rem; text-transform:uppercase; letter-spacing:0.08em; margin:0 0 6px; }
      .ev-delete-section p { color:#888; font-size:0.82rem; margin:0 0 12px; }

      @media (max-width:768px) {
        .ev-field-grid { grid-template-columns:1fr; }
        .ev-standard-fields { grid-template-columns:1fr; }
        .cq-row-grid { grid-template-columns:1fr; }
        .cq-required-col, .cq-del-col { align-items:flex-start; }
      }
    </style>

    <div class="ev-editor-head">
      <div>
        <a href="/admin/events" class="ev-back">← Back to events</a>
        <h1 style="margin:4px 0 0">${escHTML(title)}</h1>
      </div>
      ${!isNew && signupCount > 0 ? `<a href="/admin/events/${escHTML(event.id)}/signups" class="btn btn-primary">View ${signupCount} Signup${signupCount === 1 ? '' : 's'}</a>` : ''}
    </div>

    ${publicUrlBlock}

    <form method="POST" action="${actionUrl}" id="ev-form">
      <!-- ─── Basics ─── -->
      <div class="ev-section">
        <h2>Event Details</h2>
        <p class="ev-section-hint">What is the event called and where is it happening?</p>

        <label for="ev-title">Event Name <span style="color:#f87171">*</span></label>
        <input type="text" id="ev-title" name="title" required value="${escHTML(event?.title || '')}" placeholder="e.g. Lubrication Cup 2026" />

        <div class="ev-field-grid">
          <div>
            <label for="ev-location">Location <span style="color:#f87171">*</span></label>
            <select id="ev-location" name="locationId" required ${!isNew ? 'disabled' : ''}>
              ${locationOptions}
            </select>
            ${!isNew ? `<input type="hidden" name="locationId" value="${escHTML(event.locationId)}" />` : ''}
          </div>
          <div>
            <label for="ev-slug">URL Slug <span style="color:#888; font-weight:400; font-size:0.8rem">(optional — auto-generated from name)</span></label>
            <input type="text" id="ev-slug" name="slug" value="${escHTML(event?.slug || '')}" placeholder="lubrication-cup" pattern="[a-z0-9-]*" />
          </div>
        </div>

        <label for="ev-description">Description</label>
        <textarea id="ev-description" name="description" rows="4" placeholder="Tell people what the event is about, what to expect, what to bring...">${escHTML(event?.description || '')}</textarea>

        <label for="ev-image">Banner Image URL <span style="color:#888; font-weight:400; font-size:0.8rem">(optional)</span></label>
        <input type="text" id="ev-image" name="image" value="${escHTML(event?.image || '')}" placeholder="https://..." />
      </div>

      <!-- ─── Dates ─── -->
      <div class="ev-section">
        <h2>When</h2>
        <p class="ev-section-hint">When does the event happen and when should the signup page be visible?</p>

        <div class="ev-field-grid">
          <div>
            <label for="ev-start">Event Date &amp; Time <span style="color:#f87171">*</span></label>
            <input type="datetime-local" id="ev-start" name="startDate" required value="${escHTML(toDateTimeLocal(event?.startDate))}" />
          </div>
          <div>
            <label for="ev-end">End Time <span style="color:#888; font-weight:400; font-size:0.8rem">(optional)</span></label>
            <input type="datetime-local" id="ev-end" name="endDate" value="${escHTML(toDateTimeLocal(event?.endDate))}" />
          </div>
        </div>

        <div class="ev-field-grid" style="margin-top:14px">
          <div>
            <label for="ev-promote-from">Start Promoting <span style="color:#888; font-weight:400; font-size:0.8rem">(optional &mdash; defaults to now)</span></label>
            <input type="datetime-local" id="ev-promote-from" name="promoteFrom" value="${escHTML(toDateTimeLocal(event?.promoteFrom))}" />
          </div>
          <div>
            <label for="ev-promote-until">Stop Accepting Signups <span style="color:#888; font-weight:400; font-size:0.8rem">(optional &mdash; defaults to event start)</span></label>
            <input type="datetime-local" id="ev-promote-until" name="promoteUntil" value="${escHTML(toDateTimeLocal(event?.promoteUntil))}" />
          </div>
        </div>
      </div>

      <!-- ─── Signup form config ─── -->
      <div class="ev-section">
        <h2>Signup Form</h2>
        <p class="ev-section-hint">What do you want to ask people who sign up? Name is always required.</p>

        <label style="margin-bottom:8px">Standard Fields</label>
        <div class="ev-standard-fields">
          <label class="ev-check"><input type="checkbox" name="collectEmail" ${!event || event.collectEmail ? 'checked' : ''} /> Email address</label>
          <label class="ev-check"><input type="checkbox" name="collectPhone" ${!event || event.collectPhone ? 'checked' : ''} /> Phone number</label>
          <label class="ev-check"><input type="checkbox" name="collectPartySize" ${event?.collectPartySize ? 'checked' : ''} /> Party size (how many people)</label>
          <label class="ev-check"><input type="checkbox" name="collectNotes" ${event?.collectNotes ? 'checked' : ''} /> Notes or special requests</label>
        </div>

        <label style="margin-top:18px; margin-bottom:6px">Custom Questions</label>
        <p style="color:#888; font-size:0.8rem; margin-bottom:10px">
          Add your own questions, like &ldquo;T-shirt size&rdquo; or &ldquo;Experience level&rdquo;.
        </p>
        <div id="cq-list" class="cq-list">${customQuestionRows}</div>
        <button type="button" id="cq-add" class="btn btn-secondary btn-sm">+ Add Custom Question</button>
      </div>

      <!-- ─── Capacity / post-signup ─── -->
      <div class="ev-section">
        <h2>Signup Settings</h2>
        <p class="ev-section-hint">Optional limits and what to show after someone signs up.</p>

        <div class="ev-field-grid">
          <div>
            <label for="ev-capacity">Max Signups <span style="color:#888; font-weight:400; font-size:0.8rem">(leave blank for no limit)</span></label>
            <input type="number" id="ev-capacity" name="capacity" min="1" value="${escHTML(event?.capacity || '')}" placeholder="e.g. 50" />
          </div>
          <div>
            <label for="ev-notify">Notification Email <span style="color:#888; font-weight:400; font-size:0.8rem">(optional)</span></label>
            <input type="email" id="ev-notify" name="notifyEmail" value="${escHTML(event?.notifyEmail || '')}" placeholder="Get emailed when someone signs up" />
          </div>
        </div>

        <label for="ev-confirm">Confirmation Message <span style="color:#888; font-weight:400; font-size:0.8rem">(shown after signup)</span></label>
        <textarea id="ev-confirm" name="confirmationMessage" rows="3" placeholder="Thanks for signing up! We'll see you at the event. Check your email for details.">${escHTML(event?.confirmationMessage || '')}</textarea>
      </div>

      <!-- ─── State toggles ─── -->
      <div class="ev-section">
        <h2>Visibility</h2>
        <p class="ev-section-hint">Control whether the event signup page is available to guests.</p>

        <label class="ev-check"><input type="checkbox" name="isActive" ${!event || event.isActive ? 'checked' : ''} /> <strong>Active</strong> &mdash; page is live and accepting signups (within the promotion window)</label>
        ${!isNew ? `<label class="ev-check"><input type="checkbox" name="isCancelled" ${event.isCancelled ? 'checked' : ''} /> <strong>Cancelled</strong> &mdash; show a cancellation notice instead of the signup form</label>` : ''}
      </div>

      <div class="form-actions">
        <button type="submit" class="btn btn-primary">${isNew ? 'Create Event' : 'Save Changes'}</button>
        <a href="/admin/events" class="btn btn-secondary">Cancel</a>
      </div>
    </form>

    ${!isNew ? `
      <div class="ev-delete-section">
        <h3>Delete this event</h3>
        <p>This permanently removes the event and all its signups. This cannot be undone.</p>
        <form method="POST" action="${actionUrl}" onsubmit="return confirm('Really delete this event and all ${signupCount} signup${signupCount === 1 ? '' : 's'}? This cannot be undone.')">
          <input type="hidden" name="_action" value="delete" />
          <button type="submit" class="btn btn-danger">Delete Event</button>
        </form>
      </div>
    ` : ''}

    <script>
      (function() {
        // Set share URL using current host
        var shareInput = document.getElementById('ev-share-url');
        if (shareInput && shareInput.value && !shareInput.value.startsWith('http')) {
          shareInput.value = window.location.origin + shareInput.value;
        }
        var copyBtn = document.getElementById('ev-copy-url');
        if (copyBtn && shareInput) {
          copyBtn.addEventListener('click', function() {
            shareInput.select();
            try { navigator.clipboard.writeText(shareInput.value); } catch (e) { document.execCommand('copy'); }
            var orig = copyBtn.textContent;
            copyBtn.textContent = '✓ Copied!';
            setTimeout(function() { copyBtn.textContent = orig; }, 1500);
          });
        }

        // Custom question add/remove
        var cqList = document.getElementById('cq-list');
        var cqAdd = document.getElementById('cq-add');
        var cqIdx = ${customQuestions.length};
        function buildCqRow(i) {
          var row = document.createElement('div');
          row.className = 'cq-row';
          row.setAttribute('data-cq-idx', i);
          row.innerHTML =
            '<div class="cq-row-grid">' +
              '<div><label>Question</label><input type="text" name="custom_label" placeholder="e.g. T-shirt size" /></div>' +
              '<div><label>Type</label><select name="custom_type">' +
                '<option value="text">Short text</option>' +
                '<option value="textarea">Long text</option>' +
                '<option value="number">Number</option>' +
                '<option value="yesno">Yes / No</option>' +
              '</select></div>' +
              '<div class="cq-required-col"><label>&nbsp;</label><label class="ev-check"><input type="checkbox" name="custom_required_' + i + '" /> Required</label></div>' +
              '<div class="cq-del-col"><label>&nbsp;</label><button type="button" class="btn btn-danger btn-sm cq-remove">Remove</button></div>' +
            '</div>';
          return row;
        }
        if (cqAdd && cqList) {
          cqAdd.addEventListener('click', function() {
            cqList.appendChild(buildCqRow(cqIdx));
            cqIdx++;
          });
        }
        document.addEventListener('click', function(e) {
          if (e.target && e.target.classList && e.target.classList.contains('cq-remove')) {
            var row = e.target.closest('.cq-row');
            if (row) row.remove();
          }
        });

        // Auto-fill slug from title if slug field is empty (only when creating)
        var titleEl = document.getElementById('ev-title');
        var slugEl = document.getElementById('ev-slug');
        if (titleEl && slugEl && ${isNew ? 'true' : 'false'}) {
          var userEditedSlug = false;
          slugEl.addEventListener('input', function() { userEditedSlug = true; });
          titleEl.addEventListener('input', function() {
            if (!userEditedSlug) {
              slugEl.value = titleEl.value.toLowerCase().replace(/[^a-z0-9\\s-]/g, '').trim().replace(/\\s+/g, '-').slice(0, 60);
            }
          });
        }
      })();
    </script>
  `, user, { pathname: isNew ? '/admin/events/new' : `/admin/events/${event.id}`, flashMsg });
}

// ─── Signups viewer ───
function eventSignupsView(event, signups, user, flashMsg) {
  const customDefs = Array.isArray(event.customQuestions) ? event.customQuestions : [];

  const rows = signups.map(s => {
    const answers = s.customAnswers || {};
    const customCells = customDefs.map(q => `<td>${escHTML(answers[q.id] == null ? '' : String(answers[q.id]))}</td>`).join('');
    return `
      <tr>
        <td style="white-space:nowrap">${escHTML(formatFriendlyDate(s.createdAt))}</td>
        <td><strong>${escHTML(s.name || '')}</strong></td>
        <td>${s.email ? `<a href="mailto:${escHTML(s.email)}">${escHTML(s.email)}</a>` : '<span style="color:#555">—</span>'}</td>
        <td>${s.phone ? `<a href="tel:${escHTML(s.phone)}">${escHTML(s.phone)}</a>` : '<span style="color:#555">—</span>'}</td>
        ${event.collectPartySize ? `<td>${s.partySize || '<span style="color:#555">—</span>'}</td>` : ''}
        ${event.collectNotes ? `<td>${escHTML(s.notes || '')}</td>` : ''}
        ${customCells}
        <td>
          <form method="POST" action="/admin/events/${escHTML(event.id)}/signups" onsubmit="return confirm('Remove this signup?')" style="margin:0">
            <input type="hidden" name="_action" value="deleteSignup" />
            <input type="hidden" name="signupId" value="${escHTML(s.id)}" />
            <button type="submit" class="btn btn-danger btn-sm">Remove</button>
          </form>
        </td>
      </tr>
    `;
  }).join('');

  const headers = [
    '<th>Signed Up</th>',
    '<th>Name</th>',
    '<th>Email</th>',
    '<th>Phone</th>',
    event.collectPartySize ? '<th>Party</th>' : '',
    event.collectNotes ? '<th>Notes</th>' : '',
    ...customDefs.map(q => `<th>${escHTML(q.label)}</th>`),
    '<th></th>',
  ].filter(Boolean).join('');

  const capacityText = event.capacity ? ` / ${event.capacity}` : '';

  return adminLayout(`${event.title} Signups`, `
    <style>
      .evs-head { display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap; align-items:center; margin-bottom:18px; }
      .evs-back { color:#888; font-size:0.85rem; text-decoration:none; }
      .evs-back:hover { color:#d4af37; }
      .evs-stats { display:flex; gap:20px; margin-bottom:20px; flex-wrap:wrap; }
      .evs-stat { background:#1a1a1a; border:1px solid #2a2a2a; border-radius:10px; padding:14px 20px; }
      .evs-stat-num { font-size:1.6rem; font-weight:800; color:#d4af37; line-height:1; }
      .evs-stat-lbl { font-size:0.72rem; color:#888; text-transform:uppercase; letter-spacing:0.08em; margin-top:6px; }
      .evs-table-wrap { background:#1a1a1a; border:1px solid #2a2a2a; border-radius:12px; overflow-x:auto; }
      .evs-table { width:100%; border-collapse:collapse; font-size:0.88rem; }
      .evs-table th { background:#111; color:#888; text-align:left; padding:10px 14px; border-bottom:1px solid #2a2a2a; font-size:0.72rem; text-transform:uppercase; letter-spacing:0.06em; font-weight:700; }
      .evs-table td { padding:12px 14px; border-bottom:1px solid #1f1f1f; color:#ccc; vertical-align:top; }
      .evs-table tr:last-child td { border-bottom:none; }
      .evs-empty { padding:40px; text-align:center; color:#666; }
    </style>

    <div class="evs-head">
      <div>
        <a href="/admin/events" class="evs-back">← All events</a>
        <h1 style="margin:4px 0 0">${escHTML(event.title)}</h1>
        <p style="color:#888; margin:4px 0 0; font-size:0.85rem">
          ${escHTML(event.location?.name || '')} &middot; ${escHTML(formatFriendlyDate(event.startDate))}
        </p>
      </div>
      <div style="display:flex; gap:8px; flex-wrap:wrap">
        <a href="/admin/events/${escHTML(event.id)}" class="btn btn-secondary">Edit Event</a>
        ${signups.length > 0 ? `<a href="/admin/events/${escHTML(event.id)}/signups/export" class="btn btn-primary">Export CSV</a>` : ''}
      </div>
    </div>

    <div class="evs-stats">
      <div class="evs-stat">
        <div class="evs-stat-num">${signups.length}${escHTML(capacityText)}</div>
        <div class="evs-stat-lbl">Total Signups</div>
      </div>
      ${event.collectPartySize ? `
        <div class="evs-stat">
          <div class="evs-stat-num">${signups.reduce((sum, s) => sum + (s.partySize || 1), 0)}</div>
          <div class="evs-stat-lbl">Total Guests</div>
        </div>
      ` : ''}
    </div>

    ${signups.length === 0 ? `
      <div class="evs-table-wrap">
        <div class="evs-empty">
          <p style="font-size:1rem; margin-bottom:6px">No signups yet</p>
          <p style="font-size:0.82rem">Share the event link to start collecting signups.</p>
        </div>
      </div>
    ` : `
      <div class="evs-table-wrap">
        <table class="evs-table">
          <thead><tr>${headers}</tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `}
  `, user, { pathname: `/admin/events/${event.id}/signups`, flashMsg });
}

module.exports = { eventsList, eventEditor, eventSignupsView };
