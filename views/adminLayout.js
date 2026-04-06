const FLASH_LABELS = {
  saved: 'Changes saved.',
  created: 'Created successfully.',
  deleted: 'Deleted successfully.',
  reordered: 'Order updated.',
  error: 'Something went wrong.',
};

function escFlash(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function adminLayout(title, content, user, options = {}) {
  const userName = user ? (user.firstName || user.email || 'Admin') : '';
  const pathname = options.pathname || '';
  const flashRaw = options.flashMsg || '';
  // flashMsg can be either:
  //   - a short key ("saved", "error", "deleted", etc.) → looked up in FLASH_LABELS
  //   - "key|detail text" → key looked up, detail appended ("Couldn't save: <detail>")
  //   - "error|free text" → "Couldn't save: free text"
  let flashKey = flashRaw;
  let flashDetail = '';
  if (typeof flashRaw === 'string' && flashRaw.includes('|')) {
    [flashKey, ...flashDetail] = flashRaw.split('|');
    flashDetail = flashDetail.join('|');
  }
  const flashLabel = FLASH_LABELS[flashKey] || flashKey || '';
  const isError = flashKey === 'error';
  const flashText = flashDetail
    ? (isError ? `${flashLabel} ${flashDetail}` : `${flashLabel} ${flashDetail}`)
    : flashLabel;

  function navClass(href) {
    if (!pathname) return '';
    if (pathname === href) return ' class="active"';
    if (href !== '/admin/locations' && pathname.startsWith(href + '/')) return ' class="active"';
    if (href === '/admin/locations' && pathname.startsWith('/admin/locations')) return ' class="active"';
    return '';
  }

  const flashHtml = flashLabel
    ? `<div class="alert ${isError ? 'alert-error' : 'alert-success'}" id="admin-flash" role="status">
        <span class="alert-text">${escFlash(flashText)}</span>
        <button type="button" class="alert-close" aria-label="Dismiss" onclick="document.getElementById('admin-flash').remove()">&times;</button>
      </div>`
    : '';

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${title} - Dram &amp; Draught Admin</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background: #0f0f0f;
          color: #e0e0e0;
          min-height: 100vh;
        }
        a { color: #d4af37; text-decoration: none; }
        a:hover { text-decoration: underline; }
        .admin-nav {
          background: #1a1a1a;
          border-bottom: 1px solid #2a2a2a;
          padding: 12px 24px;
          display: flex;
          align-items: center;
          gap: 24px;
          flex-wrap: wrap;
        }
        .admin-nav .brand {
          font-weight: 800;
          font-size: 1.1rem;
          background: linear-gradient(135deg, #d4af37, #b87333);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          margin-right: 16px;
        }
        .admin-nav a {
          color: #999;
          font-weight: 600;
          font-size: 0.9rem;
          padding: 6px 12px;
          border-radius: 6px;
          transition: background 0.2s, color 0.2s;
        }
        .admin-nav a:hover { background: #222; color: #d4af37; text-decoration: none; }
        .admin-nav a.active { color: #d4af37; background: rgba(212,175,55,0.1); }
        .nav-spacer { flex: 1; }
        .nav-user { color: #666; font-size: 0.85rem; }
        .admin-content { max-width: 1100px; margin: 0 auto; padding: 30px 24px; }
        h1 { font-size: 1.8rem; margin-bottom: 20px; color: #fff; }
        h2 { font-size: 1.3rem; margin: 20px 0 12px; color: #d4af37; }
        h3 { font-size: 1.1rem; margin: 16px 0 8px; color: #ccc; }
        .card {
          background: #1a1a1a;
          border: 1px solid #2a2a2a;
          border-radius: 12px;
          padding: 20px;
          margin-bottom: 16px;
        }
        .grid-7 {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
          gap: 12px;
        }
        .day-card {
          background: #1a1a1a;
          border: 1px solid #2a2a2a;
          border-radius: 10px;
          padding: 16px;
          text-align: center;
          transition: border-color 0.2s;
        }
        .day-card:hover { border-color: #d4af37; }
        .day-card .day-name { font-weight: 700; color: #fff; font-size: 0.9rem; margin-bottom: 4px; }
        .day-card .theme-name { color: #d4af37; font-size: 0.85rem; margin-bottom: 8px; }
        .day-card .specials-count { color: #666; font-size: 0.8rem; }
        table { width: 100%; border-collapse: collapse; margin: 12px 0; }
        th { text-align: left; color: #999; font-size: 0.85rem; padding: 8px 12px; border-bottom: 1px solid #2a2a2a; }
        td { padding: 10px 12px; border-bottom: 1px solid #1f1f1f; color: #ccc; }
        tr:hover td { background: #151515; }
        .btn {
          display: inline-block;
          padding: 8px 16px;
          border-radius: 8px;
          font-weight: 600;
          font-size: 0.9rem;
          cursor: pointer;
          border: none;
          text-decoration: none;
          transition: filter 0.2s;
        }
        .btn:hover { filter: brightness(1.1); text-decoration: none; }
        .btn-primary { background: linear-gradient(135deg, #d4af37, #b87333); color: #111; }
        .btn-secondary { background: #2a2a2a; color: #ccc; }
        .btn-danger { background: #8b2020; color: #fff; }
        .btn-sm { padding: 5px 10px; font-size: 0.8rem; }
        form label {
          display: block;
          color: #999;
          font-size: 0.85rem;
          font-weight: 600;
          margin-bottom: 4px;
          margin-top: 12px;
        }
        form input[type="text"], form input[type="number"], form input[type="email"],
        form input[type="password"], form input[type="url"], form input[type="tel"],
        form input[type="time"], form textarea, form select {
          width: 100%;
          padding: 10px 12px;
          background: #111;
          border: 1px solid #2a2a2a;
          border-radius: 8px;
          color: #e0e0e0;
          font-size: 0.95rem;
          font-family: inherit;
        }
        form input:focus, form textarea:focus, form select:focus {
          outline: none;
          border-color: #d4af37;
        }
        form textarea { min-height: 80px; resize: vertical; }
        .form-row { display: flex; gap: 12px; }
        .form-row > * { flex: 1; }
        .form-actions { margin-top: 20px; display: flex; gap: 10px; }
        .alert {
          padding: 12px 16px;
          border-radius: 8px;
          margin-bottom: 16px;
          display: flex;
          align-items: center;
          gap: 12px;
          animation: alert-in 0.2s ease-out;
        }
        .alert .alert-text { flex: 1; line-height: 1.4; }
        .alert .alert-close {
          background: transparent;
          border: none;
          color: inherit;
          font-size: 1.4rem;
          line-height: 1;
          padding: 4px 6px;
          cursor: pointer;
          opacity: 0.6;
          font-family: inherit;
        }
        .alert .alert-close:hover { opacity: 1; }
        .alert.alert-fading { opacity: 0; transform: translateY(-4px); transition: opacity 0.4s, transform 0.4s; }
        @keyframes alert-in { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
        .alert-success { background: rgba(34,197,94,0.15); color: #4ade80; border: 1px solid rgba(34,197,94,0.3); }
        .alert-error { background: rgba(239,68,68,0.15); color: #f87171; border: 1px solid rgba(239,68,68,0.3); }
        .specials-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-bottom: 14px;
        }
        .special-item {
          display: grid;
          grid-template-columns: 28px minmax(0, 1fr) auto;
          gap: 12px;
          padding: 10px;
          background: #111;
          border-radius: 8px;
          margin-bottom: 8px;
          align-items: center;
        }
        .special-item.dragging { opacity: 0.6; }
        .special-item .drag-handle {
          cursor: grab;
          color: #666;
          font-size: 16px;
          line-height: 1;
          user-select: none;
          text-align: center;
          letter-spacing: -2px;
          padding-top: 2px;
        }
        .special-select { display: flex; align-items: center; gap: 6px; color: #999; font-size: 0.8rem; }
        .special-select input[type="checkbox"] { width: auto; }
        .special-controls { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; margin: 4px 0 16px; }
        .special-controls .count { color: #888; font-size: 0.85rem; }
        .special-item .name { flex: 1; font-weight: 600; color: #fff; }
        .special-item .name .muted { color: #666; font-size: 0.8rem; font-weight: 500; }
        .special-item .price { color: #d4af37; font-weight: 700; }
        .special-item .desc { color: #888; font-size: 0.85rem; }
        .special-main { min-width: 0; }
        .special-main .name { margin-bottom: 4px; }
        .special-meta { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
        .special-thumb { width: 40px; height: 40px; border-radius: 6px; object-fit: cover; border: 1px solid #333; }
        .inline-form { display: flex; gap: 4px; align-items: center; }
        .inline-form select,
        .inline-form input[type="number"] { width: auto; min-width: 80px; }
        .inline-form input[type="number"] { background: #0f0f0f; }
        .btn-disabled { opacity: 0.45; cursor: not-allowed; }
        .tag { display: inline-block; padding: 3px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 600; }
        .tag-active { background: rgba(34,197,94,0.2); color: #4ade80; }
        .tag-inactive { background: rgba(239,68,68,0.2); color: #f87171; }
        .empty-state { text-align: center; color: #666; padding: 40px; }
        .edit-form-inline {
          background: #1a1a1a;
          border-left: 3px solid #d4af37;
          border-radius: 0 8px 8px 0;
          padding: 16px;
          margin: 0 0 10px 40px;
        }
        .add-special-box {
          border: 2px dashed rgba(212,175,55,0.3);
          border-radius: 12px;
          padding: 20px;
          margin-bottom: 20px;
        }
        .image-preview { max-width: 120px; max-height: 80px; border-radius: 6px; margin-top: 6px; border: 1px solid #333; }
        .hours-row {
          display: grid;
          grid-template-columns: 90px 1fr auto 1fr auto;
          gap: 8px;
          align-items: center;
          padding: 6px 0;
          border-bottom: 1px solid #1f1f1f;
        }
        .hours-row:last-child { border-bottom: none; }
        .hours-row .day-label { font-weight: 600; color: #ccc; font-size: 0.9rem; }
        .hours-row .to-label { color: #666; text-align: center; font-size: 0.85rem; }
        .hours-row input[type="time"] { width: 100%; }
        .hours-row label { margin: 0; display: flex; align-items: center; gap: 6px; font-size: 0.8rem; }
        .hours-row label input[type="checkbox"] { width: auto; margin: 0; }
        .link-row {
          display: grid;
          grid-template-columns: 1fr 2fr auto;
          gap: 8px;
          align-items: center;
          margin-bottom: 8px;
        }
        .link-row input { margin: 0; }
        @media (max-width: 768px) {
          .grid-7 { grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); }
          .form-row { flex-direction: column; }
          .special-item { grid-template-columns: minmax(0, 1fr) auto; }
          .special-item .drag-handle { display: none; }
          .special-meta { align-items: flex-start; }
          .edit-form-inline { margin-left: 0; }
          .admin-nav { gap: 8px; }
          .hours-row { grid-template-columns: 70px 1fr auto 1fr auto; gap: 4px; }
          .link-row { grid-template-columns: 1fr; }
        }
      </style>
    </head>
    <body>
      <nav class="admin-nav">
        <span class="brand">D&amp;D Admin</span>
        <a href="/admin/locations"${navClass('/admin/locations')}>Locations</a>
        <a href="/admin/specials"${navClass('/admin/specials')}>Daily Specials</a>
        <a href="/admin/menu"${navClass('/admin/menu')}>Food Menu</a>
        <a href="/admin/events"${navClass('/admin/events')}>Events</a>
        <a href="/admin/flights"${navClass('/admin/flights')}>Flights</a>
        <a href="/admin/feedback"${navClass('/admin/feedback')}>Feedback</a>
        <a href="/admin/analytics"${navClass('/admin/analytics')}>Analytics</a>
        <span class="nav-spacer"></span>
        ${user ? `<span class="nav-user">${userName}</span><a href="/admin/logout">Logout</a>` : ''}
      </nav>
      <div class="admin-content">
        ${flashHtml}
        ${content}
      </div>
      ${flashHtml ? `<script>
        (function() {
          var el = document.getElementById('admin-flash');
          if (!el) return;
          // Auto-dismiss success messages after 6 seconds; errors stay until clicked.
          if (!el.classList.contains('alert-error')) {
            setTimeout(function() {
              el.classList.add('alert-fading');
              setTimeout(function() { if (el.parentNode) el.remove(); }, 500);
            }, 6000);
          }
        })();
      </script>` : ''}
      <script>
        // Session keepalive: ping every 5 minutes while the admin tab is open
        // so an active editor never silently times out mid-edit.
        (function() {
          if (window.__adminPingStarted) return;
          window.__adminPingStarted = true;
          function ping() {
            if (document.hidden) return;
            fetch('/admin/_ping', { credentials: 'same-origin' }).catch(function() {});
          }
          setInterval(ping, 5 * 60 * 1000);
          // Also ping when the tab regains focus
          document.addEventListener('visibilitychange', function() {
            if (!document.hidden) ping();
          });
        })();

        // localStorage draft auto-save for forms with data-autosave="<key>".
        // Restores any saved values on load and clears them on submit.
        (function() {
          if (window.__adminAutosaveStarted) return;
          window.__adminAutosaveStarted = true;
          var STORAGE_PREFIX = 'admin-draft:';

          function snapshot(form) {
            var data = {};
            Array.from(form.elements).forEach(function(el) {
              if (!el.name || el.type === 'file' || el.type === 'submit' || el.type === 'button') return;
              if (el.type === 'checkbox') data[el.name] = el.checked;
              else if (el.type === 'radio') { if (el.checked) data[el.name] = el.value; }
              else data[el.name] = el.value;
            });
            return data;
          }
          function restore(form, data) {
            if (!data) return;
            Array.from(form.elements).forEach(function(el) {
              if (!el.name || !(el.name in data)) return;
              if (el.type === 'checkbox') el.checked = !!data[el.name];
              else if (el.type === 'radio') el.checked = (el.value === data[el.name]);
              else el.value = data[el.name];
            });
          }
          function showRestoredBanner(form, savedAt) {
            if (form.querySelector('.draft-banner')) return;
            var banner = document.createElement('div');
            banner.className = 'draft-banner';
            banner.style.cssText = 'background:rgba(96,165,250,0.12); border:1px solid rgba(96,165,250,0.35); color:#93c5fd; padding:10px 14px; border-radius:8px; margin-bottom:14px; font-size:0.85rem; display:flex; align-items:center; gap:10px;';
            var ago = Math.round((Date.now() - savedAt) / 60000);
            banner.innerHTML = '<span>Restored an unsaved draft from ' + (ago < 1 ? 'just now' : ago + ' min ago') + '.</span>' +
              '<button type="button" style="margin-left:auto; background:transparent; border:1px solid rgba(96,165,250,0.5); color:#93c5fd; padding:4px 10px; border-radius:6px; cursor:pointer; font-size:0.78rem;">Discard draft</button>';
            banner.querySelector('button').addEventListener('click', function() {
              var key = form.getAttribute('data-autosave');
              localStorage.removeItem(STORAGE_PREFIX + key);
              location.reload();
            });
            form.insertBefore(banner, form.firstChild);
          }

          document.querySelectorAll('form[data-autosave]').forEach(function(form) {
            var key = form.getAttribute('data-autosave');
            if (!key) return;
            var storageKey = STORAGE_PREFIX + key;
            // Restore on load
            try {
              var raw = localStorage.getItem(storageKey);
              if (raw) {
                var saved = JSON.parse(raw);
                if (saved && saved.data && saved.savedAt) {
                  restore(form, saved.data);
                  showRestoredBanner(form, saved.savedAt);
                }
              }
            } catch (e) { /* ignore */ }
            // Save on input (debounced)
            var saveTimer = null;
            form.addEventListener('input', function() {
              clearTimeout(saveTimer);
              saveTimer = setTimeout(function() {
                try {
                  localStorage.setItem(storageKey, JSON.stringify({ data: snapshot(form), savedAt: Date.now() }));
                } catch (e) { /* localStorage full or disabled */ }
              }, 800);
            });
            // Clear on successful submit
            form.addEventListener('submit', function() {
              try { localStorage.removeItem(storageKey); } catch (e) {}
            });
          });
        })();
      </script>
    </body>
    </html>
  `;
}

function loginPage(error) {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Login - Dram &amp; Draught Admin</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background: #0f0f0f;
          color: #e0e0e0;
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .login-box {
          background: #1a1a1a;
          border: 1px solid #2a2a2a;
          border-radius: 16px;
          padding: 40px;
          width: 100%;
          max-width: 400px;
          margin: 20px;
        }
        .login-box h1 {
          text-align: center;
          font-size: 2rem;
          margin-bottom: 4px;
          background: linear-gradient(135deg, #d4af37, #b87333);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .login-box .subtitle {
          text-align: center;
          color: #666;
          margin-bottom: 24px;
          font-size: 0.9rem;
        }
        .login-box label {
          display: block;
          color: #999;
          font-size: 0.85rem;
          font-weight: 600;
          margin-bottom: 4px;
          margin-top: 14px;
        }
        .login-box input {
          width: 100%;
          padding: 12px;
          background: #111;
          border: 1px solid #2a2a2a;
          border-radius: 8px;
          color: #e0e0e0;
          font-size: 1rem;
        }
        .login-box input:focus { outline: none; border-color: #d4af37; }
        .login-box button {
          width: 100%;
          margin-top: 20px;
          padding: 12px;
          background: linear-gradient(135deg, #d4af37, #b87333);
          color: #111;
          border: none;
          border-radius: 8px;
          font-weight: 700;
          font-size: 1rem;
          cursor: pointer;
        }
        .login-box button:hover { filter: brightness(1.1); }
        .error { background: rgba(239,68,68,0.15); color: #f87171; border: 1px solid rgba(239,68,68,0.3); padding: 10px; border-radius: 8px; margin-bottom: 12px; text-align: center; font-size: 0.9rem; }
      </style>
    </head>
    <body>
      <div class="login-box">
        <h1>Dram &amp; Draught</h1>
        <p class="subtitle">Admin</p>
        ${error ? `<div class="error">${error}</div>` : ''}
        <form method="POST" action="/admin/login">
          <label>Email</label>
          <input type="email" name="email" required autocomplete="email" />
          <label>Password</label>
          <input type="password" name="password" required autocomplete="current-password" />
          <button type="submit">Sign In</button>
        </form>
      </div>
    </body>
    </html>
  `;
}

module.exports = { adminLayout, loginPage };
