const { adminLayout } = require('./adminLayout');
const { escHTML } = require('./escapeHtml');

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

function richTextToolbar(targetId) {
  return `
    <div class="rich-toolbar" data-target="${escHTML(targetId)}">
      <button type="button" class="rt-btn" data-action="bold">Bold</button>
      <button type="button" class="rt-btn" data-action="italic">Italic</button>
      <button type="button" class="rt-btn" data-action="bullet">Bullet</button>
      <button type="button" class="rt-btn" data-action="link">Link</button>
      <span class="rt-help">Use **bold**, *italic*, bullets, and pasted URLs.</span>
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
      ${richTextToolbar(`${idPrefix}-body`)}
      <textarea id="${idPrefix}-body" class="rich-textarea" name="body" rows="5" placeholder="What guests should know. Use bullets, pasted links, or [link text](https://example.com).">${escHTML(section?.body || '')}</textarea>
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
      ${richTextToolbar(`${idPrefix}-body`)}
      <textarea id="${idPrefix}-body" class="rich-textarea" name="body" rows="6" placeholder="The story alongside the image. Use bullets, pasted links, or [link text](https://example.com).">${escHTML(section?.body || '')}</textarea>
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
        <textarea name="faq_answer" class="rich-textarea" rows="2" placeholder="Answer">${escHTML(it.answer || '')}</textarea>
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
  const counts = events.reduce((acc, ev) => {
    if (ev.isCancelled) acc.cancelled += 1;
    else if (!ev.isActive) acc.hidden += 1;
    else if (ev.startDate && new Date(ev.startDate) < new Date()) acc.past += 1;
    else acc.live += 1;
    acc.signups += ev._count?.signups || 0;
    return acc;
  }, { live: 0, hidden: 0, past: 0, cancelled: 0, signups: 0 });
  const rows = events.map(ev => {
    const signupCount = ev._count?.signups || 0;
    const capacityText = ev.capacity ? `${signupCount} / ${ev.capacity}` : `${signupCount}`;
    const locName = ev.location?.name || '';
    const locSlug = ev.location?.slug || '';
    const publicPath = locSlug && ev.slug ? `/${locSlug}/events/${ev.slug}` : '';
    return `
      <div class="admin-row ev-row">
        <div class="admin-row-main">
          <div class="admin-row-title">
            <a href="/admin/events/${escHTML(ev.id)}">${escHTML(ev.title)}</a>
            ${eventStatusBadge(ev)}
          </div>
          <div class="admin-row-meta">
            <span>${escHTML(locName)}</span>
            <span>•</span>
            <span>${escHTML(formatFriendlyDate(ev.startDate))}</span>
            <span>•</span>
            <span>${capacityText} signup${signupCount === 1 ? '' : 's'}</span>
          </div>
        </div>
        <div class="admin-row-actions">
            <a href="/admin/events/${escHTML(ev.id)}/signups" class="btn btn-secondary btn-sm">View Signups</a>
            <a href="/admin/events/${escHTML(ev.id)}" class="btn btn-secondary btn-sm">Edit</a>
            <form method="POST" action="/admin/events/${escHTML(ev.id)}" style="display:inline; margin:0;">
              <input type="hidden" name="_action" value="duplicate" />
              <button type="submit" class="btn btn-secondary btn-sm" title="Make a copy of this event">Copy</button>
            </form>
            ${publicPath ? `<a href="${escHTML(publicPath)}" class="btn btn-secondary btn-sm" target="_blank">Public Page</a>` : ''}
        </div>
      </div>
    `;
  }).join('');

  return adminLayout('Events', `
    <style>
      .ev-empty { text-align:center; padding:60px 20px; color:#666; }
      .ev-empty-icon { font-size:2.5rem; opacity:0.3; margin-bottom:8px; }
      .ev-row:hover { border-color:rgba(214,173,75,0.38); }

      .ev-badge { display:inline-block; padding:3px 9px; border-radius:10px; font-size:0.68rem; font-weight:700; text-transform:uppercase; letter-spacing:0.04em; }
      .ev-badge-live { background:rgba(34,197,94,0.18); color:#4ade80; }
      .ev-badge-scheduled { background:rgba(96,165,250,0.18); color:#93c5fd; }
      .ev-badge-closed { background:rgba(251,146,60,0.18); color:#fdba74; }
      .ev-badge-past { background:rgba(150,150,150,0.15); color:#999; }
      .ev-badge-cancelled { background:rgba(239,68,68,0.18); color:#f87171; }
      .ev-badge-inactive { background:rgba(150,150,150,0.15); color:#888; }
    </style>

    <div class="page-header">
      <div>
        <div class="admin-kicker">Event pages</div>
        <h1>Events</h1>
        <p class="page-subtitle">Create public signup pages, manage RSVPs, and build event landing pages.</p>
      </div>
      <a href="/admin/events/new" class="btn btn-primary">+ New Event</a>
    </div>

    <div class="admin-stat-grid">
      <div class="admin-stat"><strong>${counts.live}</strong><span>Live / Upcoming</span></div>
      <div class="admin-stat"><strong>${counts.signups}</strong><span>Total Signups</span></div>
      <div class="admin-stat"><strong>${counts.hidden}</strong><span>Hidden</span></div>
      <div class="admin-stat"><strong>${counts.past}</strong><span>Past</span></div>
    </div>

    ${events.length === 0 ? `
      <div class="ev-empty">
        <div class="ev-empty-icon">◎</div>
        <p style="font-size:1rem; color:#888; margin-bottom:4px">No events yet</p>
        <p style="font-size:0.85rem">Click &ldquo;New Event&rdquo; above to create your first one.</p>
      </div>
    ` : `<div class="admin-list">${rows}</div>`}
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
              <button type="submit" name="direction" value="top" class="btn btn-secondary btn-sm"${isFirst ? ' disabled' : ''}>⇡</button>
              <button type="submit" name="direction" value="up" class="btn btn-secondary btn-sm"${isFirst ? ' disabled' : ''}>↑</button>
              <button type="submit" name="direction" value="down" class="btn btn-secondary btn-sm"${isLast ? ' disabled' : ''}>↓</button>
              <button type="submit" name="direction" value="bottom" class="btn btn-secondary btn-sm"${isLast ? ' disabled' : ''}>⇣</button>
            </form>
            <form method="POST" action="${actionUrl}" class="sec-inline">
              <input type="hidden" name="_action" value="duplicateSection" />
              <input type="hidden" name="sectionId" value="${escHTML(s.id)}" />
              <button type="submit" class="btn btn-secondary btn-sm">Copy</button>
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
            '<textarea name="faq_answer" class="rich-textarea" rows="2" placeholder="Answer"></textarea>' +
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
            <option value="image"${q.type === 'image' ? ' selected' : ''}>Image upload</option>
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

  // Public URL preview (shown when editing) — with quick source-tag buttons
  // so each social post gets a properly tagged share link.
  let publicUrlBlock = '';
  if (!isNew) {
    const locSlug = event.location?.slug || '';
    const publicUrl = locSlug && event.slug ? `/${locSlug}/events/${event.slug}` : '';
    publicUrlBlock = `
      <div class="ev-public-url" id="ev-public-url" hidden>
        <div class="ev-public-url-label">Share link</div>
        <div class="ev-public-url-row">
          <input type="text" id="ev-share-url" data-base="${escHTML(publicUrl)}" readonly value="${escHTML(publicUrl)}" />
          <button type="button" id="ev-copy-url" class="btn btn-primary btn-sm">Copy</button>
          ${publicUrl ? `<a id="ev-open-url" href="${escHTML(publicUrl)}" target="_blank" class="btn btn-secondary btn-sm">Preview ↗</a>` : ''}
        </div>
        <div class="ev-public-url-hint">
          Pick where you're sharing this link below. Each option adds a tag so Analytics can show you exactly which channel brought people in.
        </div>
        <div class="ev-share-buttons">
          <button type="button" class="ev-share-btn" data-src="">No tag</button>
          <button type="button" class="ev-share-btn" data-src="instagram">Instagram</button>
          <button type="button" class="ev-share-btn" data-src="facebook">Facebook</button>
          <button type="button" class="ev-share-btn" data-src="tiktok">TikTok</button>
          <button type="button" class="ev-share-btn" data-src="website">Website</button>
          <button type="button" class="ev-share-btn" data-src="email">Email</button>
          <button type="button" class="ev-share-btn" data-src="sms">SMS</button>
          <button type="button" class="ev-share-btn" data-src="qr">QR Code</button>
        </div>
        <div id="ev-share-status" class="ev-share-status"></div>
      </div>
    `;
  }

  const editorJumpNav = `
    <nav class="ev-jump-nav" aria-label="Event editor sections">
      <a href="#event-details">Details</a>
      <a href="#event-when">When</a>
      <a href="#event-signups">Signups</a>
      ${!isNew ? '<a href="#sections">Page Builder</a>' : ''}
    </nav>
  `;
  const statusBadgeHtml = isNew
    ? '<span class="ev-badge ev-badge-scheduled">New Draft</span>'
    : eventStatusBadge(event);
  const signupsLinkHtml = !isNew
    ? `<a href="/admin/events/${escHTML(event.id)}/signups" class="ev-meta-link">${signupCount} ${signupCount === 1 ? 'signup' : 'signups'} →</a>`
    : '<span class="ev-meta-muted">Not saved yet</span>';
  const headerToggles = !isNew
    ? `
      <label class="ev-pill-toggle"><input type="checkbox" name="isActive" form="ev-form" ${event.isActive ? 'checked' : ''} /><span>Active</span></label>
      <label class="ev-pill-toggle ev-pill-toggle-danger"><input type="checkbox" name="isCancelled" form="ev-form" ${event.isCancelled ? 'checked' : ''} /><span>Cancelled</span></label>
    `
    : `
      <label class="ev-pill-toggle"><input type="checkbox" name="isActive" form="ev-form" checked /><span>Active</span></label>
    `;

  return adminLayout(title, `
    <style>
      .ev-editor-head {
        display:flex;
        flex-direction:column;
        gap:10px;
        padding:16px 18px;
        margin-bottom:16px;
        background:linear-gradient(180deg, rgba(255,255,255,0.035), rgba(255,255,255,0.015)), var(--surface);
        border:1px solid var(--line);
        border-radius:var(--radius);
      }
      .ev-editor-head .ev-back { color:var(--text-muted); font-size:0.8rem; text-decoration:none; }
      .ev-editor-head .ev-back:hover { color:var(--gold-strong); }
      .ev-editor-head h1 { margin:2px 0 0; font-size:1.3rem; }
      .ev-header-row {
        display:flex;
        align-items:center;
        gap:12px;
        flex-wrap:wrap;
      }
      .ev-header-row-top { justify-content:space-between; }
      .ev-header-row-meta {
        padding-top:10px;
        border-top:1px solid rgba(255,255,255,0.07);
        font-size:0.85rem;
        color:#bbb;
      }
      .ev-header-toggles { display:flex; gap:8px; flex-wrap:wrap; }
      .ev-pill-toggle {
        display:inline-flex;
        align-items:center;
        gap:6px;
        padding:7px 12px;
        border:1px solid var(--line);
        border-radius:999px;
        background:#121417;
        font-size:0.78rem;
        font-weight:700;
        color:#999;
        cursor:pointer;
        margin:0;
      }
      .ev-pill-toggle input { width:auto; margin:0; accent-color:#4ade80; }
      .ev-pill-toggle:has(input:checked) {
        color:#4ade80;
        border-color:rgba(74,222,128,0.45);
        background:rgba(74,222,128,0.1);
      }
      .ev-pill-toggle-danger:has(input:checked) {
        color:#f87171;
        border-color:rgba(248,113,113,0.45);
        background:rgba(248,113,113,0.1);
      }
      .ev-meta-link {
        color:#93c5fd;
        text-decoration:none;
        font-weight:600;
        font-size:0.85rem;
        background:none;
        border:none;
        padding:0;
        cursor:pointer;
        font-family:inherit;
      }
      .ev-meta-link:hover { color:#d4af37; }
      .ev-meta-muted { color:#666; font-size:0.85rem; }
      .ev-header-actions { display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-left:auto; }

      .ev-jump-nav {
        display:flex;
        gap:8px;
        flex-wrap:wrap;
        margin-bottom:14px;
        position:sticky;
        top:0;
        z-index:20;
        padding:10px 0;
        background:rgba(16,17,19,0.92);
        border-bottom:1px solid var(--line-soft);
      }
      .ev-jump-nav a {
        display:inline-flex;
        align-items:center;
        min-height:34px;
        padding:0 12px;
        border-radius:999px;
        border:1px solid var(--line);
        color:var(--text-muted);
        text-decoration:none;
        font-size:0.78rem;
        font-weight:700;
        letter-spacing:0.04em;
        background:#121417;
      }
      .ev-jump-nav a:hover { color:var(--gold-strong); border-color:rgba(214,173,75,0.35); }

      .ev-public-url {
        background:rgba(96,165,250,0.08);
        border:1px solid rgba(96,165,250,0.25);
        border-radius:10px;
        padding:14px 16px;
        margin-bottom:20px;
      }
      .ev-public-url[hidden] { display:none; }
      .ev-public-url-label { font-size:0.72rem; color:#93c5fd; font-weight:700; text-transform:uppercase; letter-spacing:0.08em; margin-bottom:8px; }
      .ev-public-url-row { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
      .ev-public-url-row input { flex:1; min-width:260px; background:#0d0f12; color:var(--gold-strong); font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; font-size:0.85rem; }
      .ev-public-url-hint { color:#888; font-size:0.78rem; margin-top:10px; }
      .ev-share-buttons { display:flex; gap:6px; flex-wrap:wrap; margin-top:10px; }
      .ev-share-btn {
        background:#1a1a1d;
        border:1px solid #333;
        color:#ccc;
        padding:7px 14px;
        border-radius:18px;
        font-size:0.78rem;
        font-weight:600;
        cursor:pointer;
        font-family:inherit;
        transition: all 0.15s;
      }
      .ev-share-btn:hover { border-color:#93c5fd; color:#93c5fd; }
      .ev-share-btn.ev-share-btn-active { background:rgba(96,165,250,0.18); border-color:#60a5fa; color:#93c5fd; }
      .ev-share-status { color:#4ade80; font-size:0.8rem; margin-top:8px; min-height:1.2em; }

      .ev-section {
        background:linear-gradient(180deg, rgba(255,255,255,0.035), rgba(255,255,255,0.015)), var(--surface);
        border:1px solid var(--line);
        border-radius:var(--radius);
        padding:20px;
        margin-bottom:16px;
      }
      .ev-section h2 {
        color:var(--text);
        font-size:1.02rem;
        margin:0 0 4px;
        font-weight:850;
      }
      .ev-section .ev-section-hint {
        color:var(--text-muted);
        font-size:0.82rem;
        margin-bottom:14px;
      }
      .rich-toolbar {
        display:flex;
        align-items:center;
        gap:8px;
        flex-wrap:wrap;
        padding:10px;
        margin:6px 0 0;
        background:#0d0f12;
        border:1px solid rgba(255,255,255,0.08);
        border-bottom:0;
        border-radius:8px 8px 0 0;
      }
      .rt-btn {
        min-height:34px;
        border:1px solid rgba(214,173,75,0.35);
        border-radius:7px;
        background:rgba(214,173,75,0.08);
        color:var(--gold-strong);
        font:inherit;
        font-size:0.82rem;
        font-weight:800;
        cursor:pointer;
        padding:7px 10px;
      }
      .rt-btn:hover,
      .rt-btn:focus {
        border-color:var(--gold-strong);
        background:rgba(214,173,75,0.16);
        outline:none;
      }
      .rt-help {
        color:var(--text-muted);
        font-size:0.78rem;
        line-height:1.35;
      }
      .rich-textarea {
        min-height:120px;
        border-top-left-radius:0 !important;
        border-top-right-radius:0 !important;
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
        background:#121417;
        padding:12px 16px;
        border-radius:8px;
        border:1px solid rgba(255,255,255,0.07);
      }

      .cq-list { margin-bottom:14px; }
      .cq-row {
        background:#121417;
        border:1px solid rgba(255,255,255,0.07);
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
        background:#0d0f12;
        border:1px solid var(--line);
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
        .ev-jump-nav { position:static; }
        .ev-header-actions { width:100%; justify-content:space-between; }
        .rich-toolbar { align-items:flex-start; }
        .rt-help { flex-basis:100%; }
      }
    </style>

    <div class="ev-editor-head">
      <div class="ev-header-row ev-header-row-top">
        <div>
          <a href="/admin/events" class="ev-back">← Back to events</a>
          <h1>${escHTML(title)}</h1>
        </div>
        <div class="ev-header-actions">
          <div class="ev-header-toggles">${headerToggles}</div>
          <button type="submit" form="ev-form" class="btn btn-primary">${isNew ? 'Create Event' : 'Save'}</button>
        </div>
      </div>
      <div class="ev-header-row ev-header-row-meta">
        ${statusBadgeHtml}
        ${signupsLinkHtml}
        ${!isNew ? '<button type="button" id="ev-share-toggle" class="ev-meta-link">Share ↗</button>' : ''}
      </div>
    </div>

    ${publicUrlBlock}
    ${editorJumpNav}

    <form method="POST" action="${actionUrl}" id="ev-form" data-autosave="event-${escHTML(event?.id || 'new')}">
      <!-- ─── Basics ─── -->
      <div class="ev-section" id="event-details">
        <h2>Event Details</h2>
        <p class="ev-section-hint">What guests see first: title, location, URL slug, description, and banner image.</p>

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
        ${richTextToolbar('ev-description')}
        <textarea id="ev-description" class="rich-textarea" name="description" rows="6" placeholder="Tell people what the event is about. Use bullets, pasted links, or [link text](https://example.com).">${escHTML(event?.description || '')}</textarea>

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
      <div class="ev-section" id="event-when">
        <h2>When</h2>
        <p class="ev-section-hint">Set the event time and the promotion/signup window.</p>

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

      <!-- ─── Signups (form + settings combined) ─── -->
      <div class="ev-section" id="event-signups">
        <h2>Signups</h2>
        <p class="ev-section-hint">Configure the form, limits, questions, and confirmation message. Turn the form off for info-only events.</p>

        <label class="ev-check checkbox-card" style="margin-bottom:14px">
          <input type="checkbox" name="signupsEnabled" ${!event || event.signupsEnabled !== false ? 'checked' : ''} />
          <strong>Show signup form on the public page</strong>
        </label>

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

        <label style="margin-top:18px; margin-bottom:8px">Standard Fields</label>
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

        <label for="ev-confirm" style="margin-top:18px">Confirmation Message <span style="color:#888; font-weight:400; font-size:0.8rem">(shown after signup)</span></label>
        ${richTextToolbar('ev-confirm')}
        <textarea id="ev-confirm" class="rich-textarea" name="confirmationMessage" rows="4" placeholder="Thanks for signing up! Use bullets, pasted links, or [link text](https://example.com).">${escHTML(event?.confirmationMessage || '')}</textarea>
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
        // Share link with source-tag buttons:
        //   - clicking a tag updates the share URL with ?src=<tag>
        //   - the Copy button copies whatever's currently in the URL field
        //   - the Open ↗ link opens the current URL
        var shareInput = document.getElementById('ev-share-url');
        var copyBtn = document.getElementById('ev-copy-url');
        var openLink = document.getElementById('ev-open-url');
        var status = document.getElementById('ev-share-status');
        var basePath = shareInput ? shareInput.getAttribute('data-base') : '';
        var origin = window.location.origin;
        var currentSrc = '';

        function buildUrl(src) {
          if (!basePath) return '';
          var url = origin + basePath;
          if (src) url += '?src=' + encodeURIComponent(src);
          return url;
        }
        function applySrc(src) {
          currentSrc = src || '';
          if (shareInput) shareInput.value = buildUrl(currentSrc);
          if (openLink) openLink.href = buildUrl(currentSrc);
          // Update active button styling
          document.querySelectorAll('.ev-share-btn').forEach(function(b) {
            if (b.getAttribute('data-src') === currentSrc) b.classList.add('ev-share-btn-active');
            else b.classList.remove('ev-share-btn-active');
          });
        }
        function copyUrl() {
          if (!shareInput) return;
          shareInput.select();
          try { navigator.clipboard.writeText(shareInput.value); }
          catch (e) { document.execCommand('copy'); }
          if (status) {
            status.textContent = currentSrc
              ? '\u2713 Copied! Tagged as ' + currentSrc + '.'
              : '\u2713 Copied! (no source tag)';
            setTimeout(function() { status.textContent = ''; }, 2500);
          }
        }

        if (shareInput) {
          // Initialize URL with the absolute origin so it's copy-ready
          applySrc('');
        }
        // Share panel toggle (button in header expands/collapses the share box)
        var shareToggle = document.getElementById('ev-share-toggle');
        var sharePanel = document.getElementById('ev-public-url');
        if (shareToggle && sharePanel) {
          shareToggle.addEventListener('click', function() {
            var open = !sharePanel.hasAttribute('hidden');
            if (open) {
              sharePanel.setAttribute('hidden', '');
            } else {
              sharePanel.removeAttribute('hidden');
              sharePanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
          });
        }
        if (copyBtn) copyBtn.addEventListener('click', copyUrl);
        document.querySelectorAll('.ev-share-btn').forEach(function(btn) {
          btn.addEventListener('click', function() {
            applySrc(btn.getAttribute('data-src') || '');
            copyUrl();
          });
        });

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
                '<option value="image">Image upload</option>' +
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

        // Rich text helper buttons for event descriptions and content sections.
        function replaceTextareaRange(textarea, text, selectStart, selectEnd) {
          var start = textarea.selectionStart || 0;
          var end = textarea.selectionEnd || start;
          textarea.value = textarea.value.slice(0, start) + text + textarea.value.slice(end);
          var nextStart = typeof selectStart === 'number' ? start + selectStart : start + text.length;
          var nextEnd = typeof selectEnd === 'number' ? start + selectEnd : nextStart;
          textarea.focus();
          textarea.setSelectionRange(nextStart, nextEnd);
          textarea.dispatchEvent(new Event('input', { bubbles: true }));
        }
        function applyTextWrap(textarea, before, after, fallback) {
          var start = textarea.selectionStart || 0;
          var end = textarea.selectionEnd || start;
          var selected = textarea.value.slice(start, end) || fallback;
          replaceTextareaRange(textarea, before + selected + after, before.length, before.length + selected.length);
        }
        function applyBullets(textarea) {
          var start = textarea.selectionStart || 0;
          var end = textarea.selectionEnd || start;
          var selected = textarea.value.slice(start, end);
          if (!selected) {
            replaceTextareaRange(textarea, '• ', 2, 2);
            return;
          }
          var lines = selected.split('\\n').map(function(line) {
            if (!line.trim()) return line;
            if (/^\\s*(?:[-*•])\\s+/.test(line)) return line;
            return line.replace(/^(\\s*)/, '$1• ');
          });
          replaceTextareaRange(textarea, lines.join('\\n'));
        }
        function normalizeLinkUrl(url) {
          var trimmed = (url || '').trim();
          if (!trimmed) return '';
          if (/^(https?:\\/\\/|mailto:|tel:)/i.test(trimmed)) return trimmed;
          return 'https://' + trimmed;
        }
        document.addEventListener('click', function(e) {
          if (!e.target.classList || !e.target.classList.contains('rt-btn')) return;
          var toolbar = e.target.closest('.rich-toolbar');
          var targetId = toolbar ? toolbar.getAttribute('data-target') : '';
          var textarea = targetId ? document.getElementById(targetId) : null;
          if (!textarea) return;
          var action = e.target.getAttribute('data-action');
          if (action === 'bold') {
            applyTextWrap(textarea, '**', '**', 'important text');
          } else if (action === 'italic') {
            applyTextWrap(textarea, '*', '*', 'emphasized text');
          } else if (action === 'bullet') {
            applyBullets(textarea);
          } else if (action === 'link') {
            var start = textarea.selectionStart || 0;
            var end = textarea.selectionEnd || start;
            var selected = textarea.value.slice(start, end).trim();
            var url = normalizeLinkUrl(prompt('Paste the link URL') || '');
            if (!url) {
              textarea.focus();
              return;
            }
            var label = selected || prompt('Link text', url) || url;
            replaceTextareaRange(textarea, '[' + label + '](' + url + ')', 1, 1 + label.length);
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
  const isVendor = event.isVendorEvent === true;

  const statusBadge = (status) => {
    const s = String(status || 'approved');
    if (s === 'pending') return '<span class="evs-badge evs-badge-pending">Pending</span>';
    if (s === 'rejected') return '<span class="evs-badge evs-badge-rejected">Rejected</span>';
    return '<span class="evs-badge evs-badge-approved">Approved</span>';
  };

  const rows = signups.map(s => {
    const answers = s.customAnswers || {};
    const searchText = [
      s.name || '',
      s.email || '',
      s.phone || '',
      s.notes || '',
      s.status || '',
      ...customDefs.map(q => {
        if (q.type === 'image') return '';
        return answers[q.id] == null ? '' : answers[q.id];
      }),
    ].join(' ').toLowerCase();
    const customFields = customDefs.map(q => {
      const raw = answers[q.id];
      if (raw == null || raw === '') {
        return `<div class="evs-field"><span>${escHTML(q.label)}</span><strong class="evs-muted">—</strong></div>`;
      }
      // images-multi: stored as an array of data URLs. Render a row of
      // thumbnails, each clickable to open full-size in a new tab.
      if (q.type === 'images-multi' && Array.isArray(raw)) {
        const imgs = raw.filter(x => typeof x === 'string' && /^(data:image|https?:\/\/)/i.test(x));
        if (imgs.length === 0) return `<div class="evs-field"><span>${escHTML(q.label)}</span><strong class="evs-muted">—</strong></div>`;
        return `<div class="evs-field evs-field-wide"><span>${escHTML(q.label)}</span><div class="evs-images">${imgs.map(src => `<a href="${escHTML(src)}" target="_blank" rel="noopener"><img src="${escHTML(src)}" alt="${escHTML(q.label)}" /></a>`).join('')}</div></div>`;
      }
      // Single-image questions
      if (q.type === 'image' && /^(data:image|https?:\/\/)/i.test(String(raw))) {
        return `<div class="evs-field evs-field-wide"><span>${escHTML(q.label)}</span><div class="evs-images"><a href="${escHTML(raw)}" target="_blank" rel="noopener"><img src="${escHTML(raw)}" alt="${escHTML(q.label)}" /></a></div></div>`;
      }
      return `<div class="evs-field"><span>${escHTML(q.label)}</span><strong>${escHTML(String(raw))}</strong></div>`;
    }).join('');

    // Vendor events get approve/reject controls instead of just a Remove button.
    // Pending rows show the decision buttons; already-decided rows show who + when + remove.
    let actionPanel;
    if (isVendor) {
      const status = String(s.status || 'pending');
      if (status === 'pending') {
        actionPanel = `
          <div class="evs-actions evs-actions-pending">
            <div class="evs-actions-title">Pending review</div>
            <a class="btn btn-success" href="/admin/events/${escHTML(event.id)}/signups?decision=approve&signupId=${encodeURIComponent(s.id)}">Approve</a>
            <a class="btn btn-danger" href="/admin/events/${escHTML(event.id)}/signups?decision=reject&signupId=${encodeURIComponent(s.id)}">Reject</a>
          </div>
        `;
      } else {
        const who = s.approvedBy ? `<div class="evs-who">${escHTML(s.approvedBy)}</div>` : '';
        const when = s.approvedAt ? `<div class="evs-when">${escHTML(formatFriendlyDate(s.approvedAt))}</div>` : '';
        const reason = s.rejectionReason ? `<div class="evs-reason" title="Rejection note">“${escHTML(s.rejectionReason)}”</div>` : '';
        actionPanel = `
          <div class="evs-actions">
            <div class="evs-actions-title">${status === 'approved' ? 'Approved' : 'Rejected'}</div>
            ${who}${when}${reason}
            <form method="POST" action="/admin/events/${escHTML(event.id)}/signups" onsubmit="return confirm('Remove this signup?')">
              <input type="hidden" name="_action" value="deleteSignup" />
              <input type="hidden" name="signupId" value="${escHTML(s.id)}" />
              <button type="submit" class="btn btn-secondary btn-sm">Remove</button>
            </form>
          </div>
        `;
      }
    } else {
      actionPanel = `
        <div class="evs-actions">
          <div class="evs-actions-title">Manage signup</div>
          <form method="POST" action="/admin/events/${escHTML(event.id)}/signups" onsubmit="return confirm('Remove this signup?')">
            <input type="hidden" name="_action" value="deleteSignup" />
            <input type="hidden" name="signupId" value="${escHTML(s.id)}" />
            <button type="submit" class="btn btn-danger btn-sm">Remove</button>
          </form>
        </div>
      `;
    }

    return `
      <article class="evs-card" data-search="${escHTML(searchText)}" data-status="${escHTML(s.status || 'approved')}">
        <div class="evs-card-main">
          <div class="evs-card-head">
            <div>
              <div class="evs-name">${escHTML(s.name || 'Unnamed signup')}</div>
              <div class="evs-sub">Signed up ${escHTML(formatFriendlyDate(s.createdAt))}</div>
            </div>
            ${isVendor ? statusBadge(s.status) : ''}
          </div>
          <div class="evs-field-grid">
            <div class="evs-field"><span>Email</span><strong>${s.email ? `<a href="mailto:${escHTML(s.email)}">${escHTML(s.email)}</a>` : '<span class="evs-muted">—</span>'}</strong></div>
            <div class="evs-field"><span>Phone</span><strong>${s.phone ? `<a href="tel:${escHTML(s.phone)}">${escHTML(s.phone)}</a>` : '<span class="evs-muted">—</span>'}</strong></div>
            ${event.collectPartySize ? `<div class="evs-field"><span>Party Size</span><strong>${s.partySize || '<span class="evs-muted">—</span>'}</strong></div>` : ''}
            ${event.collectNotes ? `<div class="evs-field evs-field-wide"><span>Notes</span><strong>${s.notes ? escHTML(s.notes) : '<span class="evs-muted">—</span>'}</strong></div>` : ''}
            ${customFields}
          </div>
        </div>
        ${actionPanel}
      </article>
    `;
  }).join('');

  // Count vendor signups by status for the stats row.
  const pendingCount = isVendor ? signups.filter(s => s.status === 'pending').length : 0;
  const approvedCount = isVendor ? signups.filter(s => s.status === 'approved').length : 0;
  const rejectedCount = isVendor ? signups.filter(s => s.status === 'rejected').length : 0;

  const capacityText = event.capacity ? ` / ${event.capacity}` : '';
  const remainingSpots = event.capacity ? Math.max(event.capacity - signups.length, 0) : null;
  const totalGuests = event.collectPartySize ? signups.reduce((sum, s) => sum + (s.partySize || 1), 0) : null;

  return adminLayout(`${event.title} Signups`, `
    <style>
      .evs-back { color:#888; font-size:0.85rem; text-decoration:none; }
      .evs-back:hover { color:#d4af37; }
      .evs-toolbar { display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap; margin-bottom:16px; }
      .evs-search {
        min-width:260px;
        max-width:420px;
        width:100%;
        background:#121417;
        border:1px solid var(--line);
        border-radius:10px;
        padding:12px 14px;
        color:#eee;
      }
      .evs-filter-note { color:#888; font-size:0.82rem; }
      .evs-empty { padding:40px; text-align:center; color:#666; }
      .evs-empty[hidden] { display:none; }
      .evs-card-list { display:flex; flex-direction:column; gap:12px; }
      .evs-card {
        display:grid;
        grid-template-columns:minmax(0, 1fr) 190px;
        gap:16px;
        align-items:start;
        background:linear-gradient(180deg, rgba(255,255,255,0.035), rgba(255,255,255,0.015)), var(--surface);
        border:1px solid var(--line);
        border-radius:var(--radius);
        padding:16px;
      }
      .evs-card[hidden] { display:none; }
      .evs-card-main { min-width:0; }
      .evs-card-head {
        display:flex;
        align-items:flex-start;
        justify-content:space-between;
        gap:12px;
        padding-bottom:12px;
        margin-bottom:12px;
        border-bottom:1px solid rgba(255,255,255,0.07);
      }
      .evs-name { color:var(--text); font-size:1.06rem; font-weight:850; line-height:1.2; }
      .evs-sub { color:var(--text-muted); font-size:0.8rem; margin-top:3px; }
      .evs-field-grid {
        display:grid;
        grid-template-columns:repeat(2, minmax(0, 1fr));
        gap:10px;
      }
      .evs-field {
        min-width:0;
        padding:10px 12px;
        background:#121417;
        border:1px solid rgba(255,255,255,0.06);
        border-radius:8px;
      }
      .evs-field-wide { grid-column:1 / -1; }
      .evs-field span {
        display:block;
        color:var(--text-soft);
        font-size:0.68rem;
        font-weight:850;
        letter-spacing:0.07em;
        text-transform:uppercase;
        margin-bottom:4px;
      }
      .evs-field strong {
        display:block;
        color:#ded6ca;
        font-size:0.88rem;
        line-height:1.4;
        overflow-wrap:anywhere;
      }
      .evs-muted { color:#68717d !important; font-weight:650; }
      .evs-images { display:flex; gap:6px; flex-wrap:wrap; }
      .evs-images img {
        width:72px;
        height:72px;
        object-fit:cover;
        border-radius:6px;
        border:1px solid var(--line);
        display:block;
      }
      .evs-badge { display:inline-block; padding:4px 10px; border-radius:999px; font-size:0.7rem; font-weight:700; letter-spacing:0.04em; text-transform:uppercase; white-space:nowrap; }
      .evs-badge-pending { background:rgba(251,191,36,0.12); color:#fcd34d; border:1px solid rgba(251,191,36,0.35); }
      .evs-badge-approved { background:rgba(138,168,122,0.14); color:#b9d1a8; border:1px solid rgba(138,168,122,0.4); }
      .evs-badge-rejected { background:rgba(239,68,68,0.1); color:#fca5a5; border:1px solid rgba(239,68,68,0.3); }
      .evs-filter-tabs { display:flex; gap:6px; flex-wrap:wrap; margin-bottom:16px; }
      .evs-filter-tab { background:#121417; border:1px solid var(--line); color:var(--text-muted); padding:8px 14px; border-radius:999px; font-size:0.8rem; font-weight:700; cursor:pointer; letter-spacing:0.04em; }
      .evs-filter-tab.active { background:var(--gold-strong); color:#111; border-color:var(--gold-strong); }
      .evs-filter-tab:hover { color:#eee; }
      .evs-filter-tab.active:hover { color:#111; }
      .evs-who { color:#aaa; font-size:0.75rem; }
      .evs-when { color:#666; font-size:0.72rem; }
      .evs-reason { color:#fca5a5; font-size:0.78rem; font-style:italic; margin-top:4px; max-width:220px; }
      .evs-actions {
        position:sticky;
        top:88px;
        display:flex;
        flex-direction:column;
        gap:8px;
        padding:12px;
        background:rgba(0,0,0,0.18);
        border:1px solid rgba(255,255,255,0.08);
        border-radius:var(--radius);
      }
      .evs-actions-title {
        color:var(--text-muted);
        font-size:0.72rem;
        font-weight:850;
        text-transform:uppercase;
        letter-spacing:0.08em;
      }
      .evs-actions form { margin:0; }
      .evs-actions .btn { width:100%; }
      .evs-actions-pending {
        border-color:rgba(251,191,36,0.28);
        background:rgba(251,191,36,0.055);
      }
      .btn-success { background:#567a46; color:#fff; border:1px solid #6b9057; }
      .btn-success:hover { background:#6b9057; }
      @media (max-width: 840px) {
        .evs-card { grid-template-columns:1fr; }
        .evs-actions {
          position:static;
          order:-1;
          display:grid;
          grid-template-columns:1fr 1fr;
          align-items:center;
        }
        .evs-actions-title { grid-column:1 / -1; }
      }
      @media (max-width: 560px) {
        .evs-toolbar { align-items:stretch; flex-direction:column; }
        .evs-search { min-width:0; max-width:none; }
        .evs-card { padding:12px; }
        .evs-card-head { flex-direction:column; }
        .evs-field-grid { grid-template-columns:1fr; }
        .evs-actions { grid-template-columns:1fr; }
        .evs-filter-tabs { display:grid; grid-template-columns:1fr 1fr; }
        .evs-filter-tab { width:100%; }
      }
    </style>

    <div class="page-header">
      <div>
        <a href="/admin/events" class="evs-back">← All events</a>
        <div class="admin-kicker" style="margin-top:8px">Signups</div>
        <h1 style="margin:4px 0 0">${escHTML(event.title)}</h1>
        <p class="page-subtitle">
          ${escHTML(event.location?.name || '')} &middot; ${escHTML(formatFriendlyDate(event.startDate))}
        </p>
      </div>
      <div style="display:flex; gap:8px; flex-wrap:wrap">
        <a href="/admin/events/${escHTML(event.id)}" class="btn btn-secondary">Edit Event</a>
        ${signups.length > 0 ? `<a href="/admin/events/${escHTML(event.id)}/signups/export" class="btn btn-primary">Export CSV</a>` : ''}
      </div>
    </div>

    <div class="admin-stat-grid">
      <div class="admin-stat">
        <strong>${signups.length}${escHTML(capacityText)}</strong>
        <span>${isVendor ? 'Total Applications' : 'Total Signups'}</span>
      </div>
      ${isVendor ? `
        <div class="admin-stat">
          <strong style="color:#fcd34d">${pendingCount}</strong>
          <span>Pending Review</span>
        </div>
        <div class="admin-stat">
          <strong style="color:#b9d1a8">${approvedCount}</strong>
          <span>Approved</span>
        </div>
        <div class="admin-stat">
          <strong style="color:#fca5a5">${rejectedCount}</strong>
          <span>Rejected</span>
        </div>
      ` : ''}
      ${totalGuests != null ? `
        <div class="admin-stat">
          <strong>${totalGuests}</strong>
          <span>Total Guests</span>
        </div>
      ` : ''}
      ${remainingSpots != null ? `
        <div class="admin-stat">
          <strong>${remainingSpots}</strong>
          <span>${remainingSpots === 0 ? 'Event Full' : 'Spots Remaining'}</span>
        </div>
      ` : ''}
    </div>

    ${isVendor && signups.length > 0 ? `
      <div class="evs-filter-tabs" id="evs-filter-tabs">
        <button type="button" class="evs-filter-tab active" data-filter="all">All (${signups.length})</button>
        <button type="button" class="evs-filter-tab" data-filter="pending">Pending (${pendingCount})</button>
        <button type="button" class="evs-filter-tab" data-filter="approved">Approved (${approvedCount})</button>
        <button type="button" class="evs-filter-tab" data-filter="rejected">Rejected (${rejectedCount})</button>
      </div>
    ` : ''}

    ${signups.length > 0 ? `
      <div class="evs-toolbar">
        <input type="search" id="evs-search" class="evs-search" placeholder="Search by name, email, phone, notes, or answers" />
        <div id="evs-filter-note" class="evs-filter-note">Showing all ${signups.length} ${isVendor ? 'applications' : 'signups'}</div>
      </div>
    ` : ''}

    ${signups.length === 0 ? `
      <div class="card">
        <div class="evs-empty">
          <p style="font-size:1rem; margin-bottom:6px">No signups yet</p>
          <p style="font-size:0.82rem">Share the event link to start collecting signups.</p>
        </div>
      </div>
    ` : `
      <div class="evs-card-list" id="evs-rows">${rows}</div>
    `}
    <script>
      (function() {
        var search = document.getElementById('evs-search');
        var note = document.getElementById('evs-filter-note');
        var tabs = Array.from(document.querySelectorAll('#evs-filter-tabs .evs-filter-tab'));
        var rows = Array.from(document.querySelectorAll('#evs-rows .evs-card'));
        var noun = ${isVendor ? "'applications'" : "'signups'"};
        if (rows.length === 0) return;
        var currentFilter = 'all';

        function applyFilters() {
          var query = search ? String(search.value || '').trim().toLowerCase() : '';
          var visible = 0;
          rows.forEach(function(row) {
            var haystack = row.getAttribute('data-search') || '';
            var status = row.getAttribute('data-status') || 'approved';
            var matchesSearch = !query || haystack.indexOf(query) !== -1;
            var matchesFilter = currentFilter === 'all' || status === currentFilter;
            var match = matchesSearch && matchesFilter;
            row.hidden = !match;
            if (match) visible++;
          });
          if (note) {
            var isFiltered = query || currentFilter !== 'all';
            note.textContent = isFiltered
              ? 'Showing ' + visible + ' of ' + rows.length + ' ' + noun
              : 'Showing all ' + rows.length + ' ' + noun;
          }
        }

        if (search) search.addEventListener('input', applyFilters);
        tabs.forEach(function(tab) {
          tab.addEventListener('click', function() {
            tabs.forEach(function(t) { t.classList.remove('active'); });
            tab.classList.add('active');
            currentFilter = tab.getAttribute('data-filter') || 'all';
            applyFilters();
          });
        });
      })();
    </script>
  `, user, { pathname: `/admin/events/${event.id}/signups`, flashMsg });
}

function eventSignupDecisionView(event, signup, decision, email, user, flashMsg) {
  const isApprove = decision === 'approve';
  const title = isApprove ? 'Approve Vendor Application' : 'Reject Vendor Application';
  const actionLabel = isApprove ? 'Approve and Send Email' : 'Reject and Send Email';
  const actionClass = isApprove ? 'btn-success' : 'btn-danger';
  const reasonField = !isApprove ? `
    <div class="decision-field">
      <label for="rejectionReason">Saved rejection note</label>
      <textarea id="rejectionReason" name="rejectionReason" rows="3" placeholder="Optional. This is saved on the application record.">${escHTML(signup.rejectionReason || '')}</textarea>
    </div>
  ` : '';
  const applicantDetails = [
    signup.email ? `<div><span>Email</span><strong><a href="mailto:${escHTML(signup.email)}">${escHTML(signup.email)}</a></strong></div>` : '',
    signup.phone ? `<div><span>Phone</span><strong>${escHTML(signup.phone)}</strong></div>` : '',
    signup.partySize ? `<div><span>Party Size</span><strong>${escHTML(signup.partySize)}</strong></div>` : '',
    signup.notes ? `<div class="wide"><span>Notes</span><strong>${escHTML(signup.notes)}</strong></div>` : '',
  ].filter(Boolean).join('');

  return adminLayout(title, `
    <style>
      .decision-wrap { max-width:980px; margin:0 auto; }
      .decision-back { color:#888; font-size:0.85rem; text-decoration:none; }
      .decision-back:hover { color:#d4af37; }
      .decision-card { background:#111; border:1px solid var(--line); border-radius:14px; padding:18px; margin-top:16px; }
      .decision-grid { display:grid; grid-template-columns:0.9fr 1.4fr; gap:18px; align-items:start; }
      .decision-summary { background:#17191d; border:1px solid #2a2d33; border-radius:12px; padding:14px; }
      .decision-summary h2 { margin:0 0 6px; color:#fff; font-size:1.1rem; }
      .decision-summary p { margin:0 0 14px; color:#9ca3af; line-height:1.45; font-size:0.9rem; }
      .decision-facts { display:grid; gap:8px; }
      .decision-facts div { background:#101114; border:1px solid #262a30; border-radius:8px; padding:9px; }
      .decision-facts div.wide { grid-column:1 / -1; }
      .decision-facts span, .decision-field label { display:block; color:#8b949e; font-size:0.72rem; text-transform:uppercase; letter-spacing:0.08em; margin-bottom:5px; font-weight:700; }
      .decision-facts strong { color:#e5e7eb; font-size:0.9rem; word-break:break-word; }
      .decision-form { display:grid; gap:12px; }
      .decision-field input, .decision-field textarea {
        width:100%; background:#0d0f12; color:#f3f4f6; border:1px solid #30343b; border-radius:10px;
        padding:11px 12px; font:inherit; line-height:1.45;
      }
      .decision-field textarea { resize:vertical; min-height:220px; }
      #rejectionReason { min-height:90px; }
      .decision-send-note { color:#9ca3af; font-size:0.84rem; line-height:1.45; margin:0; }
      .decision-actions { display:flex; gap:10px; flex-wrap:wrap; align-items:center; justify-content:flex-end; }
      @media(max-width:780px) {
        .decision-grid { grid-template-columns:1fr; }
        .decision-card { padding:14px; }
        .decision-actions { justify-content:stretch; }
        .decision-actions .btn { width:100%; text-align:center; }
      }
    </style>
    <div class="decision-wrap">
      <a class="decision-back" href="/admin/events/${escHTML(event.id)}/signups">&larr; Back to applications</a>
      <div class="page-header">
        <div>
          <div class="admin-kicker">Vendor decision</div>
          <h1>${escHTML(title)}</h1>
          <p class="page-subtitle">Review and edit the email before the status changes. It will be sent from ${escHTML(user.email || 'the approving admin')} and CC lentz@dramanddraught.com.</p>
        </div>
      </div>
      <div class="decision-card">
        <div class="decision-grid">
          <aside class="decision-summary">
            <h2>${escHTML(signup.name || 'Unnamed applicant')}</h2>
            <p>${escHTML(event.title)} at ${escHTML(event.location?.name || 'Dram & Draught')}</p>
            <div class="decision-facts">${applicantDetails || '<div><span>Details</span><strong>No contact details provided.</strong></div>'}</div>
          </aside>
          <form class="decision-form" method="POST" action="/admin/events/${escHTML(event.id)}/signups">
            <input type="hidden" name="_action" value="sendDecision" />
            <input type="hidden" name="signupId" value="${escHTML(signup.id)}" />
            <input type="hidden" name="decision" value="${escHTML(decision)}" />
            <div class="decision-field">
              <label for="emailSubject">Subject</label>
              <input id="emailSubject" name="emailSubject" value="${escHTML(email.subject || '')}" required />
            </div>
            <div class="decision-field">
              <label for="emailBody">Email body</label>
              <textarea id="emailBody" name="emailBody" required>${escHTML(email.body || '')}</textarea>
            </div>
            ${reasonField}
            <p class="decision-send-note">Nothing is approved or rejected until this email is sent. Add load-in notes, next steps, or any other instructions here.</p>
            <div class="decision-actions">
              <a class="btn btn-secondary" href="/admin/events/${escHTML(event.id)}/signups">Cancel</a>
              <button type="submit" class="btn ${actionClass}">${actionLabel}</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `, user, { pathname: `/admin/events/${event.id}/signups`, flashMsg });
}

module.exports = { eventsList, eventEditor, eventSignupsView, eventSignupDecisionView };
