const { isCompanyWide } = require('../auth');

const FLASH_LABELS = {
  saved: 'Changes saved.',
  created: 'Created successfully.',
  deleted: 'Deleted successfully.',
  reordered: 'Order updated.',
  error: 'Something went wrong.',
};

// Brand name is configurable via the BRAND_NAME env var so a future
// rebrand or white-label deployment doesn't require code changes.
const BRAND_NAME = process.env.BRAND_NAME || 'Dram & Draught';
const BRAND_NAME_SHORT = process.env.BRAND_NAME_SHORT || 'D&D QR Manager';

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
      <title>${title} - ${BRAND_NAME} Admin</title>
      <style>
        :root {
          --bg: #101113;
          --bg-soft: #15171b;
          --surface: #1b1e22;
          --surface-2: #23272d;
          --surface-3: #2c3138;
          --line: #343a43;
          --line-soft: rgba(255,255,255,0.08);
          --text: #f6f1e7;
          --text-muted: #b9aea0;
          --text-soft: #8f98a3;
          --gold: #d6ad4b;
          --gold-strong: #f0c766;
          --copper: #b9784b;
          --blue: #8fb7ff;
          --green: #62d28f;
          --red: #ff7b7b;
          --amber: #f2a65a;
          --shadow: 0 18px 44px rgba(0,0,0,0.26);
          --radius: 8px;
        }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background:
            radial-gradient(circle at top left, rgba(143,183,255,0.08), transparent 34rem),
            linear-gradient(180deg, #16191d 0%, var(--bg) 360px);
          color: var(--text);
          min-height: 100vh;
          line-height: 1.5;
        }
        a { color: var(--gold-strong); text-decoration: none; }
        a:hover { text-decoration: underline; }
        .skip-link {
          position: fixed;
          left: 14px;
          top: 10px;
          z-index: 100;
          transform: translateY(-160%);
          background: var(--gold-strong);
          color: #14110b;
          border-radius: var(--radius);
          padding: 8px 12px;
          font-weight: 800;
          text-decoration: none;
          transition: transform 0.16s;
        }
        .skip-link:focus { transform: translateY(0); outline: none; }
        .admin-nav {
          position: sticky;
          top: 0;
          z-index: 50;
          background: rgba(16,17,19,0.92);
          border-bottom: 1px solid var(--line-soft);
          backdrop-filter: blur(16px);
        }
        .admin-nav-inner {
          max-width: 1280px;
          margin: 0 auto;
          padding: 12px 24px;
          display: flex;
          align-items: center;
          gap: 14px;
          min-height: 64px;
        }
        .admin-nav .brand {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          font-weight: 800;
          font-size: 1.1rem;
          color: var(--text);
          margin-right: 4px;
          white-space: nowrap;
          text-decoration: none;
        }
        .admin-nav-toggle {
          display: none;
          align-items: center;
          justify-content: center;
          gap: 7px;
          min-height: 40px;
          padding: 8px 11px;
          border: 1px solid var(--line);
          border-radius: var(--radius);
          background: rgba(255,255,255,0.055);
          color: var(--text);
          font: inherit;
          font-size: 0.85rem;
          font-weight: 800;
          cursor: pointer;
        }
        .admin-nav-toggle-icon {
          display: inline-flex;
          flex-direction: column;
          gap: 4px;
        }
        .admin-nav-toggle-icon span {
          display: block;
          width: 16px;
          height: 2px;
          border-radius: 2px;
          background: currentColor;
        }
        .admin-nav-links {
          display: flex;
          align-items: center;
          gap: 5px;
          min-width: 0;
          overflow-x: auto;
          scrollbar-width: none;
        }
        .admin-nav-links::-webkit-scrollbar { display: none; }
        .admin-nav-actions {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-left: auto;
          white-space: nowrap;
        }
        .admin-nav a {
          color: var(--text-muted);
          font-weight: 600;
          font-size: 0.86rem;
          padding: 8px 11px;
          border-radius: var(--radius);
          transition: background 0.18s, color 0.18s, border-color 0.18s;
          border: 1px solid transparent;
          text-decoration: none;
        }
        .admin-nav a:hover { background: rgba(255,255,255,0.06); color: var(--text); text-decoration: none; }
        .admin-nav a:focus-visible,
        .btn:focus-visible,
        button:focus-visible,
        summary:focus-visible {
          outline: 3px solid rgba(143,183,255,0.45);
          outline-offset: 2px;
        }
        .admin-nav a.active {
          color: var(--gold-strong);
          background: rgba(214,173,75,0.13);
          border-color: rgba(214,173,75,0.22);
        }
        .nav-spacer { flex: 1; }
        .nav-user {
          color: var(--text-soft);
          font-size: 0.82rem;
          max-width: 180px;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .admin-content { max-width: 1240px; margin: 0 auto; padding: 32px 24px 52px; }
        h1 { font-size: clamp(1.55rem, 2.6vw, 2.15rem); line-height: 1.08; margin-bottom: 18px; color: var(--text); letter-spacing: 0; }
        h2 { font-size: 1.08rem; margin: 20px 0 12px; color: var(--gold-strong); letter-spacing: 0; }
        h3 { font-size: 1rem; margin: 16px 0 8px; color: var(--text); }
        p { color: inherit; }
        .admin-kicker {
          color: var(--gold-strong);
          font-size: 0.75rem;
          font-weight: 850;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          margin-bottom: 6px;
        }
        .page-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 18px;
          margin-bottom: 22px;
        }
        .page-header h1 { margin: 0; }
        .page-subtitle {
          color: var(--text-muted);
          font-size: 0.95rem;
          margin-top: 7px;
          max-width: 760px;
        }
        .page-actions, .admin-tabs {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          align-items: center;
        }
        .section-note {
          color: var(--text-muted);
          font-size: 0.88rem;
          margin: -2px 0 14px;
        }
        .section-head {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          gap: 14px;
          margin: 24px 0 12px;
        }
        .section-head h2 { margin: 0; }
        .section-head p { margin-top: 4px; color: var(--text-muted); font-size: 0.88rem; }
        .card,
        .form-section {
          background: linear-gradient(180deg, rgba(255,255,255,0.035), rgba(255,255,255,0.015)), var(--surface);
          border: 1px solid var(--line);
          border-radius: var(--radius);
          padding: 22px;
          margin-bottom: 18px;
          box-shadow: 0 1px 0 rgba(255,255,255,0.03) inset;
        }
        .form-section { padding: 0; overflow: hidden; }
        .form-section-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
          padding: 18px 20px;
          border-bottom: 1px solid rgba(255,255,255,0.07);
          background: rgba(255,255,255,0.025);
        }
        .form-section-head h2 {
          margin: 0;
          color: var(--text);
          font-size: 1rem;
        }
        .form-section-head p {
          color: var(--text-muted);
          font-size: 0.86rem;
          margin-top: 4px;
          max-width: 680px;
        }
        .form-section-body { padding: 20px; }
        .admin-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
          gap: 14px;
        }
        .admin-grid-wide {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
          gap: 16px;
        }
        .admin-stat-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
          gap: 10px;
          margin-bottom: 20px;
        }
        .admin-stat {
          background: rgba(255,255,255,0.045);
          border: 1px solid var(--line);
          border-radius: var(--radius);
          padding: 14px 16px;
        }
        .admin-stat strong {
          display: block;
          color: var(--gold-strong);
          font-size: 1.5rem;
          line-height: 1;
        }
        .admin-stat span {
          display: block;
          color: var(--text-muted);
          font-size: 0.72rem;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          margin-top: 6px;
        }
        .admin-card-link {
          display: flex;
          flex-direction: column;
          gap: 8px;
          min-height: 150px;
          padding: 18px;
          border: 1px solid var(--line);
          border-radius: var(--radius);
          background: linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.015)), var(--surface);
          color: inherit;
          text-decoration: none;
          transition: border-color 0.16s, transform 0.16s, background 0.16s;
        }
        .admin-card-link:hover {
          border-color: rgba(214,173,75,0.52);
          transform: translateY(-1px);
          background: linear-gradient(180deg, rgba(214,173,75,0.075), rgba(255,255,255,0.02)), var(--surface);
          text-decoration: none;
        }
        .admin-card-title {
          color: var(--text);
          font-size: 1.03rem;
          font-weight: 850;
          line-height: 1.2;
        }
        .admin-card-meta {
          color: var(--text-muted);
          font-size: 0.84rem;
          line-height: 1.4;
        }
        .admin-card-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          margin-top: auto;
          color: var(--text-soft);
          font-size: 0.78rem;
          font-weight: 750;
        }
        .admin-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .admin-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 16px;
          padding: 16px 18px;
          background: linear-gradient(180deg, rgba(255,255,255,0.035), rgba(255,255,255,0.015)), var(--surface);
          border: 1px solid var(--line);
          border-radius: var(--radius);
        }
        .admin-row-main { flex: 1; min-width: 0; }
        .admin-row-title {
          color: var(--text);
          font-size: 1rem;
          font-weight: 850;
          line-height: 1.25;
        }
        .admin-row-title a {
          color: inherit;
          text-decoration: none;
        }
        .admin-row-title a:hover { color: var(--gold-strong); text-decoration: none; }
        .admin-row-meta {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
          color: var(--text-muted);
          font-size: 0.82rem;
          margin-top: 4px;
        }
        .admin-row-actions {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 6px;
          flex-wrap: wrap;
        }
        .admin-filter-bar {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
          margin-bottom: 20px;
          padding: 12px;
          border: 1px solid var(--line);
          border-radius: var(--radius);
          background: rgba(0,0,0,0.12);
        }
        .admin-filter-bar select,
        .admin-filter-bar input {
          width: auto;
          min-width: 160px;
        }
        .segmented {
          display: inline-flex;
          gap: 4px;
          padding: 3px;
          border: 1px solid var(--line);
          border-radius: var(--radius);
          background: rgba(255,255,255,0.035);
        }
        .segmented a,
        .segmented button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 34px;
          padding: 7px 12px;
          border-radius: 6px;
          border: 0;
          color: var(--text-muted);
          background: transparent;
          text-decoration: none;
          font-size: 0.82rem;
          font-weight: 800;
          cursor: pointer;
          font-family: inherit;
        }
        .segmented a.active,
        .segmented button.active {
          color: #17110a;
          background: var(--gold-strong);
        }
        .admin-help {
          padding: 14px 16px;
          border: 1px solid rgba(143,183,255,0.22);
          border-radius: var(--radius);
          background: rgba(143,183,255,0.075);
          color: var(--text-muted);
          font-size: 0.88rem;
          line-height: 1.5;
          margin-bottom: 18px;
        }
        .admin-help strong { color: var(--text); }
        .sticky-actions {
          position: sticky;
          bottom: 0;
          z-index: 30;
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          align-items: center;
          margin-top: 22px;
          padding: 14px 0 0;
          background: linear-gradient(180deg, rgba(16,17,19,0), var(--bg) 35%);
        }
        .grid-7 {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
          gap: 14px;
        }
        .day-card {
          background: linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.015)), var(--surface);
          border: 1px solid var(--line);
          border-radius: var(--radius);
          padding: 18px;
          text-align: left;
          transition: border-color 0.18s, transform 0.18s, background 0.18s;
          min-height: 132px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
        }
        .day-card:hover { border-color: rgba(214,173,75,0.52); transform: translateY(-1px); text-decoration: none; }
        .day-card .day-name { font-weight: 800; color: var(--text); font-size: 0.9rem; margin-bottom: 6px; }
        .day-card .theme-name { color: var(--gold-strong); font-size: 0.9rem; line-height: 1.3; margin-bottom: 9px; }
        .day-card .specials-count { color: var(--text-soft); font-size: 0.8rem; }
        table {
          width: 100%;
          border-collapse: separate;
          border-spacing: 0;
          margin: 12px 0;
          background: var(--surface);
          border: 1px solid var(--line);
          border-radius: var(--radius);
          overflow: hidden;
        }
        th {
          text-align: left;
          color: var(--text-muted);
          font-size: 0.76rem;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          padding: 11px 13px;
          border-bottom: 1px solid var(--line);
          background: rgba(255,255,255,0.03);
        }
        td { padding: 12px 13px; border-bottom: 1px solid rgba(255,255,255,0.055); color: #ded6ca; vertical-align: middle; }
        tr:last-child td { border-bottom: none; }
        tr:hover td { background: rgba(255,255,255,0.025); }
        .btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          min-height: 40px;
          padding: 9px 16px;
          border-radius: var(--radius);
          font-weight: 750;
          font-size: 0.9rem;
          cursor: pointer;
          border: 1px solid transparent;
          text-decoration: none;
          transition: background 0.18s, border-color 0.18s, color 0.18s, transform 0.18s;
          font-family: inherit;
          line-height: 1.1;
          white-space: nowrap;
        }
        .btn:hover { transform: translateY(-1px); text-decoration: none; }
        .btn:disabled, .btn-disabled { opacity: 0.45; cursor: not-allowed; transform: none; }
        .btn-primary { background: linear-gradient(135deg, var(--gold-strong), var(--copper)); color: #17110a; border-color: rgba(255,255,255,0.14); }
        .btn-secondary { background: rgba(255,255,255,0.055); color: var(--text); border-color: var(--line); }
        .btn-secondary:hover { border-color: rgba(214,173,75,0.45); color: var(--gold-strong); background: rgba(214,173,75,0.08); }
        .btn-danger { background: rgba(255,123,123,0.12); color: #ffd6d6; border-color: rgba(255,123,123,0.35); }
        .btn-success { background: rgba(98,210,143,0.14); color: #d8ffe5; border-color: rgba(98,210,143,0.36); }
        .btn-sm { min-height: 34px; padding: 7px 11px; font-size: 0.8rem; }
        form label {
          display: block;
          color: var(--text-muted);
          font-size: 0.82rem;
          font-weight: 700;
          margin-bottom: 6px;
          margin-top: 14px;
        }
        form input[type="text"], form input[type="number"], form input[type="email"],
        form input[type="password"], form input[type="url"], form input[type="tel"],
        form input[type="time"], form input[type="date"], form input[type="datetime-local"], form textarea, form select {
          width: 100%;
          min-height: 42px;
          padding: 10px 12px;
          background: #121417;
          border: 1px solid var(--line);
          border-radius: var(--radius);
          color: var(--text);
          font-size: 0.95rem;
          font-family: inherit;
          transition: border-color 0.16s, box-shadow 0.16s, background 0.16s;
        }
        form input:focus, form textarea:focus, form select:focus {
          outline: none;
          border-color: var(--gold);
          box-shadow: 0 0 0 3px rgba(214,173,75,0.16);
          background: #16191d;
        }
        form input::placeholder, form textarea::placeholder { color: #756c61; }
        input[type="checkbox"], input[type="radio"] { accent-color: var(--gold); }
        form input[type="color"] { border-color: var(--line) !important; border-radius: var(--radius); background: #12110f; }
        form textarea { min-height: 80px; resize: vertical; }
        .field-help {
          color: var(--text-soft);
          font-size: 0.78rem;
          margin-top: 5px;
          line-height: 1.4;
        }
        .checkbox-card {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          padding: 12px;
          border: 1px solid var(--line);
          border-radius: var(--radius);
          background: rgba(255,255,255,0.035);
        }
        .checkbox-card input { margin-top: 3px; }
        .form-row { display: flex; gap: 12px; }
        .form-row > * { flex: 1; }
        .form-actions { margin-top: 22px; display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
        .alert {
          padding: 12px 16px;
          border-radius: var(--radius);
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
        .alert-success { background: rgba(98,210,143,0.13); color: #b9f7cc; border: 1px solid rgba(98,210,143,0.32); }
        .alert-error { background: rgba(255,123,123,0.13); color: #ffd6d6; border: 1px solid rgba(255,123,123,0.32); }
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
          background: #15130f;
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: var(--radius);
          margin-bottom: 8px;
          align-items: center;
        }
        .special-item.dragging { opacity: 0.6; }
        .special-item .drag-handle {
          cursor: grab;
          color: var(--text-soft);
          font-size: 16px;
          line-height: 1;
          user-select: none;
          text-align: center;
          letter-spacing: -2px;
          padding-top: 2px;
        }
        .special-select { display: flex; align-items: center; gap: 6px; color: var(--text-muted); font-size: 0.8rem; }
        .special-select input[type="checkbox"] { width: auto; }
        .special-controls { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; margin: 4px 0 16px; }
        .special-controls .count { color: var(--text-soft); font-size: 0.85rem; }
        .special-item .name { flex: 1; font-weight: 700; color: var(--text); }
        .special-item .name .muted { color: var(--text-soft); font-size: 0.8rem; font-weight: 500; }
        .special-item .price { color: var(--gold-strong); font-weight: 800; }
        .special-item .desc { color: var(--text-muted); font-size: 0.85rem; }
        .special-main { min-width: 0; }
        .special-main .name { margin-bottom: 4px; }
        .special-meta { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
        .special-thumb { width: 42px; height: 42px; border-radius: 6px; object-fit: cover; border: 1px solid var(--line); }
        .inline-form { display: flex; gap: 4px; align-items: center; }
        .inline-form select,
        .inline-form input[type="number"] { width: auto; min-width: 80px; }
        .inline-form input[type="number"] { background: #12110f; }
        .tag { display: inline-flex; align-items: center; padding: 4px 9px; border-radius: 999px; font-size: 0.72rem; font-weight: 800; line-height: 1; }
        .tag-active { background: rgba(98,210,143,0.16); color: #b9f7cc; }
        .tag-inactive { background: rgba(255,123,123,0.16); color: #ffd6d6; }
        .tag-warning { background: rgba(242,166,90,0.16); color: #ffd9ad; }
        .tag-info { background: rgba(143,183,255,0.16); color: #c7dcff; }
        .empty-state {
          text-align: center;
          color: var(--text-soft);
          padding: 44px 24px;
          border: 1px dashed var(--line);
          border-radius: var(--radius);
          background: rgba(255,255,255,0.025);
        }
        .empty-state strong {
          display: block;
          color: var(--text);
          font-size: 1rem;
          margin-bottom: 4px;
        }
        .edit-form-inline {
          background: #15130f;
          border: 1px solid var(--line);
          border-left: 3px solid var(--gold);
          border-radius: var(--radius);
          padding: 16px;
          margin: 0 0 10px 40px;
        }
        .add-special-box {
          border: 1px dashed rgba(214,173,75,0.36);
          background: rgba(214,173,75,0.045);
          border-radius: var(--radius);
          padding: 20px;
          margin-bottom: 20px;
        }
        .image-preview { max-width: 120px; max-height: 80px; border-radius: 6px; margin-top: 6px; border: 1px solid var(--line); }
        .hours-row {
          display: grid;
          grid-template-columns: 90px 1fr auto 1fr auto;
          gap: 8px;
          align-items: center;
          padding: 6px 0;
          border-bottom: 1px solid rgba(255,255,255,0.06);
        }
        .hours-row:last-child { border-bottom: none; }
        .hours-row .day-label { font-weight: 700; color: var(--text); font-size: 0.9rem; }
        .hours-row .to-label { color: var(--text-soft); text-align: center; font-size: 0.85rem; }
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
          .page-header { flex-direction: column; }
          .section-head { align-items: flex-start; flex-direction: column; }
          .page-actions { width: 100%; }
          .page-actions .btn { flex: 1 1 auto; }
          .form-row { flex-direction: column; }
          .admin-grid-wide { grid-template-columns: 1fr; }
          .admin-row { align-items: stretch; flex-direction: column; }
          .admin-row-actions { justify-content: flex-start; }
          .admin-row-actions .btn,
          .admin-row-actions form { flex: 1 1 auto; }
          .admin-filter-bar { align-items: stretch; flex-direction: column; }
          .admin-filter-bar select,
          .admin-filter-bar input,
          .admin-filter-bar .btn,
          .admin-filter-bar .segmented { width: 100%; }
          .segmented a,
          .segmented button { flex: 1; }
          .form-section-head { flex-direction: column; }
          .special-item { grid-template-columns: minmax(0, 1fr); }
          .special-item .drag-handle { display: none; }
          .special-meta { align-items: stretch; flex-direction: row; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
          .special-meta .btn,
          .special-meta button,
          .special-meta form { flex: 1 1 auto; }
          .special-meta button.btn-sm { padding: 10px 12px; font-size: 0.85rem; min-height: 40px; }
          .edit-form-inline { margin-left: 0; padding: 16px 14px; }
          .admin-nav-inner {
            align-items: center;
            flex-direction: row;
            flex-wrap: wrap;
            gap: 8px;
            padding: 10px 14px;
          }
          .admin-nav .brand { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
          .admin-nav-toggle { display: inline-flex; }
          .admin-nav-links,
          .admin-nav-actions {
            display: none;
            width: 100%;
            margin-left: 0;
            padding-top: 8px;
            border-top: 1px solid rgba(255,255,255,0.08);
          }
          .admin-nav.is-open .admin-nav-links,
          .admin-nav.is-open .admin-nav-actions { display: flex; }
          .admin-nav-links {
            flex-direction: column;
            align-items: stretch;
            gap: 4px;
            overflow: visible;
          }
          .admin-nav-actions { justify-content: space-between; }
          .admin-nav a { padding: 10px 11px; font-size: 0.9rem; }
          .admin-nav-links a { width: 100%; }
          .admin-content { padding: 22px 14px 38px; }
          .hours-row { grid-template-columns: 70px 1fr auto 1fr auto; gap: 4px; }
          .link-row { grid-template-columns: 1fr; }
          /* Bigger tap targets for all small buttons in admin */
          .btn-sm { padding: 9px 14px; font-size: 0.85rem; min-height: 38px; min-width: 38px; }
          /* Inline forms (reorder buttons, etc.) should wrap nicely */
          .inline-form { flex-wrap: wrap; gap: 6px; }
          .inline-form .btn-sm { min-height: 38px; min-width: 38px; }
          /* Stack header rows that have a title + action button */
          h1 { font-size: 1.5rem; }
          h2 { font-size: 1.1rem; }
        }
        @media (max-width: 480px) {
          .admin-nav-inner { padding: 8px 10px; }
          .admin-nav .brand { font-size: 1rem; margin-right: 0; }
          .admin-nav-toggle { padding: 8px 10px; }
          .admin-content { padding: 14px 10px; }
          .card { padding: 14px; }
          .hours-row { grid-template-columns: 1fr 1fr; }
          .hours-row .day-label { grid-column: 1 / -1; }
          .hours-row .to-label { display: none; }
        }
      </style>
    </head>
    <body>
      <a class="skip-link" href="#admin-main">Skip to admin content</a>
      <nav class="admin-nav" aria-label="Admin navigation" id="admin-nav">
        <div class="admin-nav-inner">
          <a class="brand" href="/admin">${BRAND_NAME_SHORT}</a>
          <button type="button" class="admin-nav-toggle" id="admin-nav-toggle" aria-expanded="false" aria-controls="admin-nav-links">
            <span class="admin-nav-toggle-icon" aria-hidden="true"><span></span><span></span><span></span></span>
            Menu
          </button>
          <div class="admin-nav-links" id="admin-nav-links">
            <a href="/admin"${pathname === '/admin' || pathname === '/admin/dashboard' ? ' class="active"' : ''}>Dashboard</a>
            ${isCompanyWide(user) ? `<a href="/admin/locations"${navClass('/admin/locations')}>Locations</a>` : ''}
            <a href="/admin/specials"${navClass('/admin/specials')}>Specials</a>
            <a href="/admin/menu"${navClass('/admin/menu')}>Menu</a>
            <a href="/admin/events"${navClass('/admin/events')}>Events</a>
            <a href="/admin/tv"${navClass('/admin/tv')}>TVs</a>
            <a href="/admin/applicants"${navClass('/admin/applicants')}>Applicants</a>
            <a href="/admin/feedback"${navClass('/admin/feedback')}>Feedback</a>
            <a href="/admin/analytics"${navClass('/admin/analytics')}>Analytics</a>
            ${isCompanyWide(user) ? `<a href="/admin/activity"${navClass('/admin/activity')}>Activity</a>` : ''}
          </div>
          ${user ? `<div class="admin-nav-actions">
            <a href="/admin/sso/launch?target=bartender" title="Open Bartender app" style="display:inline-flex;align-items:center;gap:4px;">🍸 Bartender</a>
            ${(user.roles && Array.isArray(user.roles.supportRoles) && user.roles.supportRoles.length > 0) ? '<a href="/admin/sso/launch?target=public" title="Open Marketing & Web (Bar Support)">🌐 Marketing</a>' : ''}
            <span class="nav-user" title="${escFlash(userName)}">${escFlash(userName)}</span><a href="/admin/logout">Logout</a></div>` : ''}
        </div>
      </nav>
      <main class="admin-content" id="admin-main" tabindex="-1">
        ${flashHtml}
        ${content}
      </main>
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
        (function() {
          var nav = document.getElementById('admin-nav');
          var btn = document.getElementById('admin-nav-toggle');
          if (!nav || !btn) return;
          btn.addEventListener('click', function() {
            var open = nav.classList.toggle('is-open');
            btn.setAttribute('aria-expanded', open ? 'true' : 'false');
          });
        })();

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
          // Non-clobbering restore: only fill fields that are currently EMPTY,
          // so a saved draft never overwrites server-prefilled values (e.g. an
          // imported event). Returns how many fields were actually restored —
          // the banner only shows when that's > 0. Checkboxes/radios are left
          // as the server rendered them.
          function restore(form, data) {
            if (!data) return 0;
            var restored = 0;
            Array.from(form.elements).forEach(function(el) {
              if (!el.name || !(el.name in data)) return;
              if (el.type === 'checkbox' || el.type === 'radio' || el.type === 'hidden') return;
              if (el.value && String(el.value).trim()) return; // don't clobber existing/prefilled
              var v = data[el.name];
              if (v != null && String(v).trim()) { el.value = v; restored++; }
            });
            return restored;
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
            // Restore on load — ignore stale drafts (>24h) and only show the
            // banner when something was actually restored into an empty field.
            try {
              var raw = localStorage.getItem(storageKey);
              if (raw) {
                var saved = JSON.parse(raw);
                var tooOld = saved && saved.savedAt && (Date.now() - saved.savedAt > 24 * 60 * 60 * 1000);
                if (tooOld) {
                  localStorage.removeItem(storageKey);
                } else if (saved && saved.data && saved.savedAt) {
                  var n = restore(form, saved.data);
                  if (n > 0) showRestoredBanner(form, saved.savedAt);
                  else localStorage.removeItem(storageKey); // nothing to restore (form prefilled) — clear it
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
      <title>Login - ${BRAND_NAME} Admin</title>
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
        <h1>${BRAND_NAME}</h1>
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
