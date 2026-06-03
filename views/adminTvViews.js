const { adminLayout } = require('./adminLayout');
const { escHTML } = require('./escapeHtml');
const { TV_MODULE_TYPES, TV_MODULE_LABELS } = require('./tvModules');
const { imageUploadWidget, imageUploadWidgetCss, imageUploadWidgetScript } = require('./imageUploadWidget');

function attr(value) {
  return String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function moduleCount(board) {
  return Array.isArray(board.modules) ? board.modules.filter((m) => m && m.type).length : 0;
}

function moduleSummary(board) {
  const mods = Array.isArray(board.modules) ? board.modules.filter((m) => m && m.type) : [];
  if (!mods.length) return 'No modules yet';
  return mods.map((m) => (m.title && m.title.trim()) ? m.title.trim() : (TV_MODULE_LABELS[m.type] || m.type)).join(' · ');
}

function tvBoardsList({ boards, locations, filters, user, flashMsg, canSeeMultipleLocations }) {
  const locationOptions = canSeeMultipleLocations
    ? ['', ...locations.map((l) => l.slug)].map((slug) => {
        const sel = filters.location === slug ? ' selected' : '';
        const loc = locations.find((l) => l.slug === slug);
        const label = slug === '' ? 'All locations' : (loc ? loc.name : slug);
        return `<option value="${escHTML(slug)}"${sel}>${escHTML(label)}</option>`;
      }).join('')
    : '';

  const rows = boards.length
    ? boards.map((b) => {
        const displayUrl = `/${escHTML(b.location ? b.location.slug : '')}/tv/${escHTML(b.slug)}`;
        return `<div class="admin-row">
          <div class="admin-row-main">
            <div class="admin-row-title"><a href="/admin/tv/${escHTML(b.id)}">${escHTML(b.name)}</a></div>
            <div class="admin-row-meta">
              <span class="tag ${b.isActive ? 'tag-active' : 'tag-inactive'}">${b.isActive ? 'Active' : 'Hidden'}</span>
              ${b.location ? `<span>${escHTML(b.location.name)}</span>` : ''}
              <span>${moduleCount(b)} module${moduleCount(b) === 1 ? '' : 's'}</span>
              <span>· every ${escHTML(b.rotateSeconds)}s</span>
            </div>
            <div class="admin-row-meta" style="color:var(--text-soft)">${escHTML(moduleSummary(b))}</div>
          </div>
          <div class="admin-row-actions">
            <a class="btn btn-secondary btn-sm" href="${displayUrl}" target="_blank" rel="noopener">Open TV &nearr;</a>
            <a class="btn btn-secondary btn-sm" href="/admin/tv/${escHTML(b.id)}">Edit</a>
            <form method="POST" action="/admin/tv/${escHTML(b.id)}/delete" onsubmit="return confirm('Delete this board? This cannot be undone.')">
              <button type="submit" class="btn btn-danger btn-sm">Delete</button>
            </form>
          </div>
        </div>`;
      }).join('')
    : `<div class="empty-state"><strong>No TV boards yet</strong>Create a board, add modules, then open it full-screen on a TV.</div>`;

  return adminLayout('TV Boards', `
    <div class="page-header">
      <div>
        <div class="admin-kicker">Digital Signage</div>
        <h1>TV Boards</h1>
        <p class="page-subtitle">Build a digital menu board for your in-house TVs — add modules like specials, what's on draft, upcoming events, and bartender's picks, then open the board full-screen on the TV's browser.</p>
      </div>
      <div class="page-actions">
        <a href="/admin/tv/new" class="btn btn-primary">+ New board</a>
      </div>
    </div>
    ${canSeeMultipleLocations ? `
    <form method="GET" class="admin-filter-bar">
      <label style="margin:0">Location
        <select name="location" onchange="this.form.submit()">${locationOptions}</select>
      </label>
      <noscript><button class="btn btn-secondary btn-sm" type="submit">Filter</button></noscript>
    </form>` : ''}
    <div class="admin-list">${rows}</div>
  `, user, { pathname: '/admin/tv', flashMsg });
}

function tvBoardEditor({ board, locations, user, flashMsg, defaultLocationSlug, canPickLocation }) {
  const isNew = !board;
  const heading = isNew ? 'New TV Board' : `Edit · ${board.name}`;
  const actionUrl = isNew ? '/admin/tv/new' : `/admin/tv/${board.id}`;
  const initialModules = isNew ? [] : (Array.isArray(board.modules) ? board.modules : []);

  const locationOptions = locations.map((l) => {
    const selected = (board && board.locationId === l.id) || (!board && l.slug === defaultLocationSlug);
    return `<option value="${escHTML(l.id)}"${selected ? ' selected' : ''}>${escHTML(l.name)}</option>`;
  }).join('');

  const displayUrl = (!isNew && board.location) ? `/${board.location.slug}/tv/${board.slug}` : '';

  // Type metadata exposed to the client editor.
  const typeMetaJson = JSON.stringify(TV_MODULE_TYPES.map((t) => ({ type: t.type, label: t.label, desc: t.desc, curated: !!t.curated })));
  const modulesJson = JSON.stringify(initialModules);

  return adminLayout(heading, `
    <div class="page-header">
      <div>
        <div class="admin-kicker">${isNew ? 'New' : 'Edit'} board</div>
        <h1 style="margin:0">${escHTML(isNew ? 'New TV Board' : board.name)}</h1>
        ${displayUrl ? `<p class="page-subtitle">Display URL: <a href="${escHTML(displayUrl)}" target="_blank" rel="noopener">${escHTML(displayUrl)}</a> — open this on the TV's browser.</p>` : ''}
      </div>
      <div class="page-actions">
        ${displayUrl ? `<a href="${escHTML(displayUrl)}" target="_blank" rel="noopener" class="btn btn-secondary">Open TV &nearr;</a>` : ''}
        <a href="/admin/tv" class="btn btn-secondary">&larr; Back</a>
      </div>
    </div>

    <form method="POST" action="${actionUrl}" id="tv-board-form">
      <div class="card">
        <div class="form-row">
          <div>
            <label for="b-name">Board name</label>
            <input type="text" id="b-name" name="name" maxlength="80" required placeholder="e.g. Main Bar TV" value="${attr(board ? board.name : '')}" />
          </div>
          <div>
            <label for="b-slug">URL slug <span style="font-weight:400;color:var(--text-soft)">(optional)</span></label>
            <input type="text" id="b-slug" name="slug" maxlength="60" placeholder="auto from name" pattern="[a-z0-9-]*" value="${attr(board ? board.slug : '')}" />
            <div class="field-help">Lowercase letters, numbers, dashes. Leave blank to generate from the name.</div>
          </div>
        </div>
        <div class="form-row">
          ${canPickLocation ? `<div>
            <label for="b-location">Location</label>
            <select id="b-location" name="locationId">${locationOptions}</select>
          </div>` : `<input type="hidden" name="locationId" value="${attr(locations[0] ? locations[0].id : '')}" />`}
          <div>
            <label for="b-rotate">Seconds per slide</label>
            <input type="number" id="b-rotate" name="rotateSeconds" min="4" max="120" value="${attr(board ? board.rotateSeconds : 15)}" />
            <div class="field-help">Default time each rotating module is shown. Individual modules can override this.</div>
          </div>
        </div>
        <div style="margin-top:14px">
          <label>Logo <span style="font-weight:400;color:var(--text-soft)">(optional)</span></label>
          <div class="field-help" style="margin-top:0;margin-bottom:8px">Shown at the top of the side rail in place of the text wordmark. Upload a transparent PNG for best results.</div>
          ${imageUploadWidget({ name: 'logo', prefix: 'tv-logo', value: board ? board.logo : '' })}
        </div>
        <label class="checkbox-card" style="margin-top:14px">
          <input type="checkbox" name="isActive" ${(!board || board.isActive) ? 'checked' : ''} />
          <span><strong>Active</strong> — board is reachable and shows on the TV. Uncheck to hide it.</span>
        </label>
      </div>

      <div class="section-head">
        <div>
          <h2>Modules</h2>
          <p>Add the panels this board cycles through. Pin one module to keep it always visible in the side rail (hybrid layout).</p>
        </div>
        <div class="page-actions">
          <select id="tv-add-type" aria-label="Module type"></select>
          <button type="button" class="btn btn-secondary" id="tv-add-btn">+ Add module</button>
        </div>
      </div>

      <div id="tv-modules"></div>
      <input type="hidden" name="modulesJson" id="tv-modules-json" />

      <div class="sticky-actions">
        <button type="submit" class="btn btn-primary">${isNew ? 'Create board' : 'Save changes'}</button>
        <a href="/admin/tv" class="btn btn-secondary">Cancel</a>
      </div>
    </form>

    <style>
      .tvm { border:1px solid var(--line); border-radius:var(--radius); background:rgba(255,255,255,0.025); margin-bottom:12px; }
      .tvm-head { display:flex; align-items:center; gap:10px; padding:12px 14px; border-bottom:1px solid rgba(255,255,255,0.07); flex-wrap:wrap; }
      .tvm-type { font-weight:850; color:var(--gold-strong); font-size:0.95rem; }
      .tvm-badge { font-size:0.7rem; font-weight:800; text-transform:uppercase; letter-spacing:0.06em; color:var(--text-soft); }
      .tvm-spacer { flex:1; }
      .tvm-pin { display:inline-flex; align-items:center; gap:6px; color:var(--text-muted); font-size:0.82rem; font-weight:700; }
      .tvm-pin input { width:auto; margin:0; }
      .tvm-body { padding:14px; }
      .tvm-grid { display:grid; grid-template-columns:1fr 140px; gap:12px; }
      .tvm-pick { display:grid; grid-template-columns:1fr 1fr 120px 90px auto; gap:8px; align-items:center; margin-bottom:8px; }
      .tvm-icon-btn { min-height:34px; padding:6px 10px; }
      .tvm-empty { color:var(--text-soft); padding:24px; text-align:center; border:1px dashed var(--line); border-radius:var(--radius); }
      @media (max-width:768px){ .tvm-grid{grid-template-columns:1fr} .tvm-pick{grid-template-columns:1fr 1fr} }
      ${imageUploadWidgetCss()}
    </style>

    <script>
      window.__TV_TYPES__ = ${typeMetaJson};
      window.__TV_MODULES__ = ${modulesJson};
    </script>
    <script src="/assets/tv-board-editor.js?v=2"></script>
    <script>
      (function(){ if (window.initTvBoardEditor) window.initTvBoardEditor(); })();
      ${imageUploadWidgetScript()}
    </script>
  `, user, { pathname: '/admin/tv', flashMsg });
}

module.exports = { tvBoardsList, tvBoardEditor };
