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

// Reusable image upload fragment (file picker → base64 + URL fallback + preview).
// Used by image, hero, and two-column section types.
function imageUploadFragment(section, idPrefix) {
  const hasSrc = !!section?.src;
  return `
    <div class="sec-img-upload" data-prefix="${idPrefix}">
      <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" id="${idPrefix}-file" class="sec-img-file" />
      <div class="sec-img-hint">Click to choose a file (max ~500&#8239;KB), or paste a hosted image URL below.</div>
      <input type="text" id="${idPrefix}-url-input" placeholder="https://... (optional alternative)" class="sec-img-url-input" value="${hasSrc && /^https?:\/\//i.test(section.src) ? escHTML(section.src) : ''}" />
      <input type="hidden" id="${idPrefix}-src" name="src" value="${hasSrc ? escHTML(section.src) : ''}" />
      <div class="sec-img-preview-wrap">
        <img id="${idPrefix}-preview" class="sec-img-preview" src="${hasSrc ? escHTML(section.src) : ''}" alt="" style="${hasSrc ? '' : 'display:none'}" />
        ${hasSrc ? `<button type="button" class="btn btn-secondary btn-sm sec-img-clear" data-prefix="${idPrefix}">Remove image</button>` : ''}
      </div>
    </div>
  `;
}

// Render the inline edit form for a single section, by type. Used both for
// existing sections (when expanded) and the "add new section" panel.
function renderSectionEditFields(section, idPrefix) {
  const type = section?.type || 'text';
  if (type === 'text') {
    const align = section?.align || 'left';
    return `
      <label for="${idPrefix}-heading">Heading <span style="color:#888; font-weight:400; font-size:0.78rem">(optional)</span></label>
      <input type="text" id="${idPrefix}-heading" name="heading" value="${escHTML(section?.heading || '')}" placeholder="e.g. About the Event" />
      <label for="${idPrefix}-body">Body Text</label>
      <textarea id="${idPrefix}-body" name="body" rows="5" placeholder="What guests should know. Plain text or one paragraph per blank line.">${escHTML(section?.body || '')}</textarea>
      <label>Text Alignment</label>
      <div style="display:flex; gap:14px;">
        <label class="ev-check"><input type="radio" name="align" value="left" ${align === 'left' ? 'checked' : ''} /> Left</label>
        <label class="ev-check"><input type="radio" name="align" value="center" ${align === 'center' ? 'checked' : ''} /> Center</label>
        <label class="ev-check"><input type="radio" name="align" value="right" ${align === 'right' ? 'checked' : ''} /> Right</label>
      </div>
      ${bgStylePicker(section, idPrefix)}
    `;
  }
  if (type === 'image') {
    return `
      <label>Image</label>
      ${imageUploadFragment(section, idPrefix)}
      <label for="${idPrefix}-caption">Caption <span style="color:#888; font-weight:400; font-size:0.78rem">(optional)</span></label>
      <input type="text" id="${idPrefix}-caption" name="caption" value="${escHTML(section?.caption || '')}" placeholder="Shown beneath the image" />
      <label for="${idPrefix}-alt">Alt Text <span style="color:#888; font-weight:400; font-size:0.78rem">(for accessibility)</span></label>
      <input type="text" id="${idPrefix}-alt" name="alt" value="${escHTML(section?.alt || '')}" placeholder="Describe the image briefly" />
    `;
  }
  if (type === 'details') {
    const items = Array.isArray(section?.items) && section.items.length > 0 ? section.items : [{ label: '', value: '' }];
    const rows = items.map(it => `
      <div class="sec-detail-row">
        <input type="text" name="detail_label" value="${escHTML(it.label || '')}" placeholder="e.g. Date" />
        <input type="text" name="detail_value" value="${escHTML(it.value || '')}" placeholder="e.g. Saturday, October 15" />
        <button type="button" class="btn btn-secondary btn-sm sec-detail-remove">×</button>
      </div>
    `).join('');
    return `
      <label for="${idPrefix}-title">Title <span style="color:#888; font-weight:400; font-size:0.78rem">(optional)</span></label>
      <input type="text" id="${idPrefix}-title" name="title" value="${escHTML(section?.title || '')}" placeholder="e.g. Event Info" />
      <label>Details</label>
      <div class="sec-detail-list" id="${idPrefix}-details">${rows}</div>
      <button type="button" class="btn btn-secondary btn-sm sec-detail-add" data-target="${idPrefix}-details">+ Add Row</button>
      ${bgStylePicker(section, idPrefix)}
    `;
  }
  if (type === 'button') {
    const style = section?.style || 'primary';
    return `
      <label for="${idPrefix}-label">Button Label <span style="color:#f87171">*</span></label>
      <input type="text" id="${idPrefix}-label" name="label" value="${escHTML(section?.label || '')}" placeholder="e.g. Get Tickets" required />
      <label for="${idPrefix}-url">Link URL <span style="color:#f87171">*</span></label>
      <input type="url" id="${idPrefix}-url" name="url" value="${escHTML(section?.url || '')}" placeholder="https://eventbrite.com/..." required />
      <label>Style</label>
      <div style="display:flex; gap:14px;">
        <label class="ev-check"><input type="radio" name="style" value="primary" ${style === 'primary' ? 'checked' : ''} /> Primary (gold, prominent)</label>
        <label class="ev-check"><input type="radio" name="style" value="secondary" ${style === 'secondary' ? 'checked' : ''} /> Secondary (outline)</label>
      </div>
      ${bgStylePicker(section, idPrefix)}
    `;
  }
  if (type === 'video') {
    return `
      <label for="${idPrefix}-url">Video URL <span style="color:#f87171">*</span></label>
      <input type="url" id="${idPrefix}-url" name="url" value="${escHTML(section?.url || '')}" placeholder="https://youtube.com/watch?v=... or https://vimeo.com/..." required />
      <div style="color:#888; font-size:0.78rem; margin-top:4px;">YouTube, Vimeo, and other common video URLs work. Will be embedded automatically.</div>
      <label for="${idPrefix}-caption">Caption <span style="color:#888; font-weight:400; font-size:0.78rem">(optional)</span></label>
      <input type="text" id="${idPrefix}-caption" name="caption" value="${escHTML(section?.caption || '')}" placeholder="Shown beneath the video" />
      ${bgStylePicker(section, idPrefix)}
    `;
  }
  if (type === 'divider') {
    return `<p style="color:#888; font-size:0.85rem; margin-top:8px;">A simple horizontal divider. No options needed.</p>`;
  }

  if (type === 'hero') {
    return `
      <label>Background Image <span style="color:#f87171">*</span></label>
      ${imageUploadFragment(section, idPrefix)}
      <label for="${idPrefix}-eyebrow">Eyebrow <span style="color:#888; font-weight:400; font-size:0.78rem">(small label above title)</span></label>
      <input type="text" id="${idPrefix}-eyebrow" name="eyebrow" value="${escHTML(section?.eyebrow || '')}" placeholder="e.g. PRESENTING" />
      <label for="${idPrefix}-title">Title</label>
      <input type="text" id="${idPrefix}-title" name="title" value="${escHTML(section?.title || '')}" placeholder="e.g. Lubrication Cup 2026" />
      <label for="${idPrefix}-subtitle">Subtitle <span style="color:#888; font-weight:400; font-size:0.78rem">(optional)</span></label>
      <input type="text" id="${idPrefix}-subtitle" name="subtitle" value="${escHTML(section?.subtitle || '')}" placeholder="e.g. The cocktail competition that crowns the city's best" />
    `;
  }
  if (type === 'twocol') {
    const pos = section?.imagePosition || 'left';
    return `
      <label>Image <span style="color:#f87171">*</span></label>
      ${imageUploadFragment(section, idPrefix)}
      <label for="${idPrefix}-alt">Alt Text <span style="color:#888; font-weight:400; font-size:0.78rem">(for accessibility)</span></label>
      <input type="text" id="${idPrefix}-alt" name="alt" value="${escHTML(section?.alt || '')}" placeholder="Describe the image briefly" />
      <label>Image Position</label>
      <div style="display:flex; gap:14px;">
        <label class="ev-check"><input type="radio" name="imagePosition" value="left" ${pos === 'left' ? 'checked' : ''} /> Image on left</label>
        <label class="ev-check"><input type="radio" name="imagePosition" value="right" ${pos === 'right' ? 'checked' : ''} /> Image on right</label>
      </div>
      <label for="${idPrefix}-heading">Heading <span style="color:#888; font-weight:400; font-size:0.78rem">(optional)</span></label>
      <input type="text" id="${idPrefix}-heading" name="heading" value="${escHTML(section?.heading || '')}" placeholder="e.g. About the Cup" />
      <label for="${idPrefix}-body">Body Text</label>
      <textarea id="${idPrefix}-body" name="body" rows="6" placeholder="The story alongside the image. Plain text or one paragraph per blank line.">${escHTML(section?.body || '')}</textarea>
      ${bgStylePicker(section, idPrefix)}
    `;
  }
  if (type === 'schedule') {
    const items = Array.isArray(section?.items) && section.items.length > 0 ? section.items : [{ time: '', title: '', description: '' }];
    const rows = items.map(it => `
      <div class="sec-sched-row">
        <input type="text" name="sched_time" value="${escHTML(it.time || '')}" placeholder="7:00 PM" />
        <input type="text" name="sched_title" value="${escHTML(it.title || '')}" placeholder="What happens" />
        <input type="text" name="sched_desc" value="${escHTML(it.description || '')}" placeholder="Optional details" />
        <button type="button" class="btn btn-secondary btn-sm sec-sched-remove">×</button>
      </div>
    `).join('');
    return `
      <label for="${idPrefix}-title">Title <span style="color:#888; font-weight:400; font-size:0.78rem">(optional)</span></label>
      <input type="text" id="${idPrefix}-title" name="title" value="${escHTML(section?.title || '')}" placeholder="e.g. Schedule of Events" />
      <label>Schedule Items</label>
      <div class="sec-sched-list" id="${idPrefix}-sched">${rows}</div>
      <button type="button" class="btn btn-secondary btn-sm sec-sched-add" data-target="${idPrefix}-sched">+ Add Time Slot</button>
      ${bgStylePicker(section, idPrefix)}
    `;
  }
  if (type === 'faq') {
    const items = Array.isArray(section?.items) && section.items.length > 0 ? section.items : [{ question: '', answer: '' }];
    const rows = items.map(it => `
      <div class="sec-faq-row">
        <input type="text" name="faq_question" value="${escHTML(it.question || '')}" placeholder="Question (e.g. How do I sign up?)" />
        <textarea name="faq_answer" rows="2" placeholder="Answer">${escHTML(it.answer || '')}</textarea>
        <button type="button" class="btn btn-secondary btn-sm sec-faq-remove">×</button>
      </div>
    `).join('');
    return `
      <label for="${idPrefix}-title">Title <span style="color:#888; font-weight:400; font-size:0.78rem">(optional)</span></label>
      <input type="text" id="${idPrefix}-title" name="title" value="${escHTML(section?.title || '')}" placeholder="e.g. Frequently Asked Questions" />
      <label>Questions</label>
      <div class="sec-faq-list" id="${idPrefix}-faq">${rows}</div>
      <button type="button" class="btn btn-secondary btn-sm sec-faq-add" data-target="${idPrefix}-faq">+ Add Question</button>
      ${bgStylePicker(section, idPrefix)}
    `;
  }

  return `<p style="color:#888;">Unknown section type</p>`;
}

function sectionPreviewSummary(section) {
  if (!section) return '';
  const type = section.type || 'text';
  if (type === 'text') {
    if (section.heading) return escHTML(section.heading);
    if (section.body) return escHTML(section.body.slice(0, 80) + (section.body.length > 80 ? '…' : ''));
    return '<em style="color:#666">Empty text</em>';
  }
  if (type === 'image') {
    return section.caption ? escHTML(section.caption) : '<em style="color:#666">Image</em>';
  }
  if (type === 'details') {
    const count = Array.isArray(section.items) ? section.items.length : 0;
    return `${section.title ? escHTML(section.title) + ' · ' : ''}${count} row${count === 1 ? '' : 's'}`;
  }
  if (type === 'button') {
    return `${escHTML(section.label || 'Button')} → ${escHTML((section.url || '').slice(0, 60))}`;
  }
  if (type === 'video') {
    return escHTML((section.url || '').slice(0, 60));
  }
  if (type === 'divider') {
    return '<em style="color:#666">— divider —</em>';
  }
  if (type === 'hero') {
    return section.title ? escHTML(section.title) : '<em style="color:#666">Hero banner</em>';
  }
  if (type === 'twocol') {
    if (section.heading) return escHTML(section.heading) + ' (image ' + (section.imagePosition || 'left') + ')';
    return '<em style="color:#666">Two-column block</em>';
  }
  if (type === 'schedule') {
    const count = Array.isArray(section.items) ? section.items.length : 0;
    return `${section.title ? escHTML(section.title) + ' · ' : ''}${count} item${count === 1 ? '' : 's'}`;
  }
  if (type === 'faq') {
    const count = Array.isArray(section.items) ? section.items.length : 0;
    return `${section.title ? escHTML(section.title) + ' · ' : ''}${count} question${count === 1 ? '' : 's'}`;
  }
  return '';
}

function sectionTypeIcon(type) {
  return ({
    text: 'T',
    image: '📷',
    details: '⋮',
    button: '▶',
    video: '►',
    divider: '—',
    hero: '★',
    twocol: '⊞',
    schedule: '⏱',
    faq: '?',
  })[type] || '?';
}

// Background style picker fragment — used by section types that support theming
function bgStylePicker(section, idPrefix) {
  const current = section?.bgStyle || 'default';
  const options = [
    { key: 'default', label: 'Default' },
    { key: 'gold', label: 'Gold Highlight' },
    { key: 'dark', label: 'Dark Card' },
    { key: 'transparent', label: 'No Background' },
  ];
  return `
    <label for="${idPrefix}-bg">Background Style</label>
    <select id="${idPrefix}-bg" name="bgStyle">
      ${options.map(o => `<option value="${o.key}"${current === o.key ? ' selected' : ''}>${o.label}</option>`).join('')}
    </select>
  `;
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

// ─── Page sections editor (rich content for the public event page) ───
function renderSectionsCard(event, actionUrl) {
  const sections = Array.isArray(event.sections) ? event.sections : [];
  const totalCount = sections.length;

  const sectionRows = sections.map((s, idx) => {
    const isFirst = idx === 0;
    const isLast = idx === totalCount - 1;
    const editPrefix = `sec-edit-${s.id}`;
    return `
      <div class="sec-row" id="sec-${s.id}">
        <div class="sec-row-summary">
          <span class="sec-row-icon">${sectionTypeIcon(s.type)}</span>
          <div class="sec-row-info">
            <div class="sec-row-type">${escHTML((s.type || '').toUpperCase())}</div>
            <div class="sec-row-preview">${sectionPreviewSummary(s)}</div>
          </div>
          <div class="sec-row-actions">
            <form method="POST" action="${actionUrl}" class="sec-inline">
              <input type="hidden" name="_action" value="moveSection" />
              <input type="hidden" name="sectionId" value="${escHTML(s.id)}" />
              <button type="submit" name="direction" value="up" class="btn btn-secondary btn-sm"${isFirst ? ' disabled' : ''}>↑</button>
              <button type="submit" name="direction" value="down" class="btn btn-secondary btn-sm"${isLast ? ' disabled' : ''}>↓</button>
            </form>
            <button type="button" class="btn btn-secondary btn-sm" onclick="toggleSecEdit('${editPrefix}')">Edit</button>
            <form method="POST" action="${actionUrl}" class="sec-inline" onsubmit="return confirm('Delete this section?')">
              <input type="hidden" name="_action" value="deleteSection" />
              <input type="hidden" name="sectionId" value="${escHTML(s.id)}" />
              <button type="submit" class="btn btn-danger btn-sm">Del</button>
            </form>
          </div>
        </div>
        <div class="sec-row-edit" id="${editPrefix}" style="display:none">
          <form method="POST" action="${actionUrl}" enctype="application/x-www-form-urlencoded">
            <input type="hidden" name="_action" value="editSection" />
            <input type="hidden" name="sectionId" value="${escHTML(s.id)}" />
            <input type="hidden" name="type" value="${escHTML(s.type)}" />
            ${renderSectionEditFields(s, editPrefix)}
            <div class="form-actions">
              <button type="submit" class="btn btn-primary btn-sm">Save Section</button>
              <button type="button" class="btn btn-secondary btn-sm" onclick="toggleSecEdit('${editPrefix}')">Cancel</button>
            </div>
          </form>
        </div>
      </div>
    `;
  }).join('');

  // Build "add new section" panel — type buttons that reveal a typed form
  const ALL_TYPES = ['hero', 'text', 'twocol', 'image', 'details', 'schedule', 'faq', 'button', 'video', 'divider'];
  const addPanels = ALL_TYPES.map(t => {
    const stub = { type: t };
    if (t === 'details') stub.items = [{ label: '', value: '' }];
    if (t === 'schedule') stub.items = [{ time: '', title: '', description: '' }];
    if (t === 'faq') stub.items = [{ question: '', answer: '' }];
    return `
      <div class="sec-add-panel" id="sec-add-${t}" style="display:none">
        <form method="POST" action="${actionUrl}">
          <input type="hidden" name="_action" value="addSection" />
          <input type="hidden" name="type" value="${t}" />
          ${renderSectionEditFields(stub, `sec-new-${t}`)}
          <div class="form-actions">
            <button type="submit" class="btn btn-primary btn-sm">Add ${t.charAt(0).toUpperCase() + t.slice(1)} Section</button>
            <button type="button" class="btn btn-secondary btn-sm" onclick="hideAddPanel('${t}')">Cancel</button>
          </div>
        </form>
      </div>
    `;
  }).join('');

  return `
    <div class="ev-section ev-sections-card" id="sections">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px; flex-wrap:wrap; margin-bottom:4px">
        <div>
          <h2>Page Sections</h2>
          <p class="ev-section-hint">Build out the event page with text, images, details, buttons, and videos. Sections show up in order on the public page below the event details.</p>
        </div>
      </div>

      ${sectionRows || '<div class="sec-empty">No sections yet. Add your first one below.</div>'}

      <div class="sec-add-bar">
        <span style="color:#888; font-size:0.85rem; margin-right:6px">+ Add section:</span>
        <button type="button" class="btn btn-secondary btn-sm" onclick="showAddPanel('hero')">Hero Banner</button>
        <button type="button" class="btn btn-secondary btn-sm" onclick="showAddPanel('text')">Text</button>
        <button type="button" class="btn btn-secondary btn-sm" onclick="showAddPanel('twocol')">Two-Column</button>
        <button type="button" class="btn btn-secondary btn-sm" onclick="showAddPanel('image')">Image</button>
        <button type="button" class="btn btn-secondary btn-sm" onclick="showAddPanel('details')">Details</button>
        <button type="button" class="btn btn-secondary btn-sm" onclick="showAddPanel('schedule')">Schedule</button>
        <button type="button" class="btn btn-secondary btn-sm" onclick="showAddPanel('faq')">FAQ</button>
        <button type="button" class="btn btn-secondary btn-sm" onclick="showAddPanel('button')">Button / Link</button>
        <button type="button" class="btn btn-secondary btn-sm" onclick="showAddPanel('video')">Video</button>
        <button type="button" class="btn btn-secondary btn-sm" onclick="showAddPanel('divider')">Divider</button>
      </div>

      ${addPanels}
    </div>

    <style>
      .ev-sections-card .sec-row {
        background:#111;
        border:1px solid #222;
        border-radius:10px;
        margin-bottom:10px;
      }
      .ev-sections-card .sec-row-summary {
        display:flex;
        align-items:center;
        gap:12px;
        padding:12px 14px;
      }
      .ev-sections-card .sec-row-icon {
        width:34px; height:34px;
        background:#1a1a1a;
        border-radius:8px;
        display:flex; align-items:center; justify-content:center;
        color:#d4af37; font-weight:800; font-size:1rem;
        flex-shrink:0;
      }
      .ev-sections-card .sec-row-info { flex:1; min-width:0; }
      .ev-sections-card .sec-row-type { color:#d4af37; font-size:0.7rem; font-weight:800; text-transform:uppercase; letter-spacing:0.08em; margin-bottom:2px; }
      .ev-sections-card .sec-row-preview { color:#bbb; font-size:0.88rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .ev-sections-card .sec-row-actions { display:flex; gap:5px; align-items:center; flex-wrap:wrap; }
      .ev-sections-card .sec-inline { display:inline-flex; gap:4px; margin:0; }
      .ev-sections-card .sec-row-edit {
        background:#0d0d0d;
        border-top:1px solid #222;
        border-radius:0 0 10px 10px;
        padding:14px 16px;
      }
      .ev-sections-card .sec-add-bar {
        display:flex;
        flex-wrap:wrap;
        gap:6px;
        padding:14px 0 0;
        margin-top:12px;
        border-top:1px dashed #2a2a2a;
        align-items:center;
      }
      .ev-sections-card .sec-add-panel {
        background:#0d0d0d;
        border:1px solid rgba(212,175,55,0.3);
        border-radius:10px;
        padding:16px;
        margin-top:12px;
      }
      .ev-sections-card .sec-empty {
        background:#111;
        border:1px dashed #2a2a2a;
        border-radius:10px;
        padding:24px 14px;
        text-align:center;
        color:#666;
        font-size:0.88rem;
      }
      .ev-sections-card .sec-detail-list { margin-bottom:10px; }
      .ev-sections-card .sec-detail-row {
        display:grid;
        grid-template-columns:1fr 2fr auto;
        gap:8px;
        margin-bottom:6px;
        align-items:center;
      }
      .ev-sections-card .sec-detail-row input { margin:0 !important; }
      .ev-sections-card .sec-detail-remove,
      .ev-sections-card .sec-sched-remove,
      .ev-sections-card .sec-faq-remove {
        background:transparent;
        border:1px solid #444;
        color:#888;
        border-radius:6px;
        padding:6px 12px;
        cursor:pointer;
        font-size:0.9rem;
      }
      .ev-sections-card .sec-detail-remove:hover,
      .ev-sections-card .sec-sched-remove:hover,
      .ev-sections-card .sec-faq-remove:hover { border-color:#f87171; color:#f87171; }

      .ev-sections-card .sec-sched-list,
      .ev-sections-card .sec-faq-list { margin-bottom:10px; }
      .ev-sections-card .sec-sched-row {
        display:grid;
        grid-template-columns:90px 1.2fr 1.5fr auto;
        gap:8px;
        margin-bottom:6px;
        align-items:center;
      }
      .ev-sections-card .sec-sched-row input { margin:0 !important; }
      .ev-sections-card .sec-faq-row {
        display:grid;
        grid-template-columns:1fr auto;
        grid-template-areas: "q q" "a x";
        gap:6px 8px;
        margin-bottom:10px;
        padding:10px;
        background:#0a0a0a;
        border-radius:6px;
        border:1px solid #1a1a1a;
      }
      .ev-sections-card .sec-faq-row input[name="faq_question"] { grid-area:q; margin:0 !important; }
      .ev-sections-card .sec-faq-row textarea { grid-area:a; margin:0 !important; }
      .ev-sections-card .sec-faq-row .sec-faq-remove { grid-area:x; align-self:start; }
      @media (max-width:768px) {
        .ev-sections-card .sec-sched-row { grid-template-columns:1fr; }
      }
    </style>

    <script>
      function toggleSecEdit(id) {
        var el = document.getElementById(id);
        if (!el) return;
        el.style.display = el.style.display === 'none' ? 'block' : 'none';
      }
      var SEC_TYPES = ['hero','text','twocol','image','details','schedule','faq','button','video','divider'];
      function showAddPanel(t) {
        SEC_TYPES.forEach(function(x) {
          var p = document.getElementById('sec-add-' + x);
          if (p) p.style.display = (x === t) ? 'block' : 'none';
        });
      }
      function hideAddPanel(t) {
        var p = document.getElementById('sec-add-' + t);
        if (p) p.style.display = 'none';
      }

      // (Image upload handlers live in the main editor script — work for both
      // banner image and section images via global event delegation.)

      // Details rows: add and remove
      document.addEventListener('click', function(e) {
        if (e.target.classList && e.target.classList.contains('sec-detail-add')) {
          var targetId = e.target.getAttribute('data-target');
          var list = document.getElementById(targetId);
          if (!list) return;
          var row = document.createElement('div');
          row.className = 'sec-detail-row';
          row.innerHTML =
            '<input type="text" name="detail_label" placeholder="e.g. Date" />' +
            '<input type="text" name="detail_value" placeholder="e.g. Saturday, October 15" />' +
            '<button type="button" class="btn btn-secondary btn-sm sec-detail-remove">×</button>';
          list.appendChild(row);
        }
        if (e.target.classList && e.target.classList.contains('sec-detail-remove')) {
          var row = e.target.closest('.sec-detail-row');
          if (row) row.remove();
        }
      });

      // Schedule rows: add and remove
      document.addEventListener('click', function(e) {
        if (e.target.classList && e.target.classList.contains('sec-sched-add')) {
          var targetId = e.target.getAttribute('data-target');
          var list = document.getElementById(targetId);
          if (!list) return;
          var row = document.createElement('div');
          row.className = 'sec-sched-row';
          row.innerHTML =
            '<input type="text" name="sched_time" placeholder="7:00 PM" />' +
            '<input type="text" name="sched_title" placeholder="What happens" />' +
            '<input type="text" name="sched_desc" placeholder="Optional details" />' +
            '<button type="button" class="btn btn-secondary btn-sm sec-sched-remove">×</button>';
          list.appendChild(row);
        }
        if (e.target.classList && e.target.classList.contains('sec-sched-remove')) {
          var row = e.target.closest('.sec-sched-row');
          if (row) row.remove();
        }
      });

      // FAQ rows: add and remove
      document.addEventListener('click', function(e) {
        if (e.target.classList && e.target.classList.contains('sec-faq-add')) {
          var targetId = e.target.getAttribute('data-target');
          var list = document.getElementById(targetId);
          if (!list) return;
          var row = document.createElement('div');
          row.className = 'sec-faq-row';
          row.innerHTML =
            '<input type="text" name="faq_question" placeholder="Question" />' +
            '<textarea name="faq_answer" rows="2" placeholder="Answer"></textarea>' +
            '<button type="button" class="btn btn-secondary btn-sm sec-faq-remove">×</button>';
          list.appendChild(row);
        }
        if (e.target.classList && e.target.classList.contains('sec-faq-remove')) {
          var row = e.target.closest('.sec-faq-row');
          if (row) row.remove();
        }
      });

      // If URL has #sections, scroll there after page load
      if (window.location.hash === '#sections') {
        setTimeout(function() {
          var el = document.getElementById('sections');
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
      }
    </script>
  `;
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

      /* Reusable image upload widget — used by banner and section images */
      .sec-img-upload {
        background:#0d0d0d;
        border:1px solid #222;
        border-radius:8px;
        padding:14px;
        margin-bottom:8px;
      }
      .sec-img-hint { color:#888; font-size:0.78rem; margin:6px 0 8px; }
      .sec-img-url-input { margin-bottom:10px !important; }
      .sec-img-preview-wrap { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
      .sec-img-preview { max-width:240px; max-height:160px; border-radius:6px; border:1px solid #333; }

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

        <label>Banner Image <span style="color:#888; font-weight:400; font-size:0.8rem">(optional &mdash; shown above the event details)</span></label>
        ${(() => {
          const hasSrc = !!event?.image;
          return `
        <div class="sec-img-upload" data-prefix="ev-banner">
          <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" id="ev-banner-file" class="sec-img-file" />
          <div class="sec-img-hint">Click to choose a file (max ~500&#8239;KB), or paste a hosted image URL below.</div>
          <input type="text" id="ev-banner-url-input" placeholder="https://... (optional alternative)" class="sec-img-url-input" value="${hasSrc && /^https?:\/\//i.test(event.image) ? escHTML(event.image) : ''}" />
          <input type="hidden" id="ev-banner-src" name="image" value="${hasSrc ? escHTML(event.image) : ''}" />
          <div class="sec-img-preview-wrap">
            <img id="ev-banner-preview" class="sec-img-preview" src="${hasSrc ? escHTML(event.image) : ''}" alt="" style="${hasSrc ? '' : 'display:none'}" />
            ${hasSrc ? `<button type="button" class="btn btn-secondary btn-sm sec-img-clear" data-prefix="ev-banner">Remove image</button>` : ''}
          </div>
        </div>`;
        })()}
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
        <p class="ev-section-hint">For events that collect signups (registrations, RSVPs, ticket holds). Turn this off for info-only events that don't need a form.</p>

        <label class="ev-check" style="border:1px solid #2a2a2a; background:#111; padding:12px 14px; border-radius:8px; margin-bottom:14px">
          <input type="checkbox" name="signupsEnabled" ${!event || event.signupsEnabled !== false ? 'checked' : ''} />
          <strong>Show signup form on the public page</strong>
        </label>

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

    ${!isNew ? renderSectionsCard(event, actionUrl) : ''}

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

        // ─── Image upload widget (used by banner AND section images) ───
        // File picker → base64 data URL
        document.addEventListener('change', function(e) {
          if (!e.target.classList || !e.target.classList.contains('sec-img-file')) return;
          var input = e.target;
          var prefix = input.id.replace(/-file$/, '');
          var srcInput = document.getElementById(prefix + '-src');
          var preview = document.getElementById(prefix + '-preview');
          var urlInput = document.getElementById(prefix + '-url-input');
          var file = input.files && input.files[0];
          if (!file) return;
          if (file.size > 750 * 1024) {
            alert('Image is too large. Max ~500 KB. Try compressing the image, or paste a hosted URL instead.');
            input.value = '';
            return;
          }
          var reader = new FileReader();
          reader.onload = function() {
            if (srcInput) srcInput.value = reader.result;
            if (preview) { preview.src = reader.result; preview.style.display = ''; }
            if (urlInput) urlInput.value = '';
          };
          reader.readAsDataURL(file);
        });
        // URL input → set the hidden src field + preview
        document.addEventListener('input', function(e) {
          if (!e.target.classList || !e.target.classList.contains('sec-img-url-input')) return;
          var input = e.target;
          var prefix = input.id.replace(/-url-input$/, '');
          var srcInput = document.getElementById(prefix + '-src');
          var preview = document.getElementById(prefix + '-preview');
          var url = (input.value || '').trim();
          if (srcInput) srcInput.value = url;
          if (preview) {
            if (/^https?:\\/\\//i.test(url)) { preview.src = url; preview.style.display = ''; }
            else { preview.style.display = 'none'; }
          }
        });
        // Remove image button
        document.addEventListener('click', function(e) {
          if (!e.target.classList || !e.target.classList.contains('sec-img-clear')) return;
          var prefix = e.target.getAttribute('data-prefix');
          var srcInput = document.getElementById(prefix + '-src');
          var preview = document.getElementById(prefix + '-preview');
          var urlInput = document.getElementById(prefix + '-url-input');
          var fileInput = document.getElementById(prefix + '-file');
          if (srcInput) srcInput.value = '';
          if (preview) { preview.src = ''; preview.style.display = 'none'; }
          if (urlInput) urlInput.value = '';
          if (fileInput) fileInput.value = '';
        });
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
