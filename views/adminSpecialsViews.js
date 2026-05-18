const { adminLayout } = require('./adminLayout');
const { imageUploadWidget, imageUploadWidgetCss, imageUploadWidgetScript } = require('./imageUploadWidget');
const { escHTML } = require('./escapeHtml');

const DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
const DAY_LABELS = { MONDAY: 'Monday', TUESDAY: 'Tuesday', WEDNESDAY: 'Wednesday', THURSDAY: 'Thursday', FRIDAY: 'Friday', SATURDAY: 'Saturday', SUNDAY: 'Sunday' };
const DAY_SHORT  = { MONDAY: 'Mon', TUESDAY: 'Tue', WEDNESDAY: 'Wed', THURSDAY: 'Thu', FRIDAY: 'Fri', SATURDAY: 'Sat', SUNDAY: 'Sun' };
const MONTHS = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// Preset badge chips offered when editing a special.
const BADGE_PRESETS = ['New', 'Staff Pick', 'LTO', 'While supplies last', 'Limited', 'Crowd Favorite'];

// Preset time-window chips. Free-text "Custom" still allowed.
const TIME_WINDOW_PRESETS = ['Until 7 PM', 'Until 8 PM', 'Happy hour', 'All night', '5–7 PM', 'Late night'];

function getTodayDayKey() {
  try {
    const d = new Date().toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'long' });
    return d.toUpperCase();
  } catch (e) {
    return new Date().toLocaleString('en-US', { weekday: 'long' }).toUpperCase();
  }
}

function escAttr(s) { return escHTML(String(s == null ? '' : s)); }

// All CSS used by the dashboard, day editor, special cards, and half-price picker.
// Uses global tokens from adminLayout.js (--surface, --gold-strong, --line, etc.).
function specialsStyles() {
  return `
    <style>
      /* ========== Shared primitives ========== */
      .sp-card {
        background: linear-gradient(180deg, rgba(255,255,255,0.035), rgba(255,255,255,0.01)), var(--surface);
        border: 1px solid var(--line);
        border-radius: var(--radius);
        padding: 18px 20px;
        margin-bottom: 14px;
      }
      .sp-card-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
      .sp-card-head h2 { margin: 0; font-size: 1rem; color: var(--gold-strong); text-transform: uppercase; letter-spacing: 0.06em; font-weight: 800; }
      .sp-card-head .aside { color: var(--text-muted); font-size: 0.82rem; }

      .sp-pill { display: inline-flex; align-items: center; padding: 3px 10px; border-radius: 999px; font-size: 0.7rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; }
      .sp-pill-gold     { background: rgba(240,199,102,0.18); color: var(--gold-strong); }
      .sp-pill-green    { background: rgba(98,210,143,0.18); color: #a4f4c2; }
      .sp-pill-amber    { background: rgba(242,166,90,0.18); color: var(--amber); }
      .sp-pill-muted    { background: rgba(255,255,255,0.05); color: var(--text-muted); }
      .sp-pill-copper   { background: rgba(185,120,75,0.18); color: #ddbb99; }

      /* ========== Hero header ========== */
      .sp-hero {
        display: grid; grid-template-columns: 1fr auto;
        gap: 18px 24px; align-items: start;
        background: linear-gradient(180deg, rgba(255,255,255,0.035), rgba(255,255,255,0.01)), var(--surface);
        border: 1px solid var(--line); border-radius: var(--radius);
        padding: 22px 26px; margin-bottom: 16px;
        position: relative; overflow: hidden;
      }
      .sp-hero::before {
        content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 4px;
        background: var(--gold-strong);
      }
      .sp-hero.has-theme-color::before { background: var(--theme-color, var(--gold-strong)); }
      .sp-hero-left { min-width: 0; padding-left: 6px; }
      .sp-hero h1 { font-size: clamp(1.5rem, 2.6vw, 2rem); line-height: 1.1; margin: 4px 0 8px; display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
      .sp-hero h1 .theme-swatch { width: 22px; height: 22px; border-radius: 50%; border: 2px solid rgba(255,255,255,0.2); display: inline-block; vertical-align: middle; }
      .sp-hero .meta-line { color: var(--text-muted); font-size: 0.92rem; }
      .sp-hero .meta-line .dot { color: var(--text-soft); margin: 0 6px; }
      .sp-hero-actions { display: flex; flex-direction: column; align-items: flex-end; gap: 8px; }
      .sp-hero-actions .row { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
      .sp-hero-tagline { color: var(--text); margin-top: 8px; font-style: italic; opacity: 0.85; }

      /* ========== Dashboard: stat strip ========== */
      .sp-stat-strip {
        display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
        gap: 10px; margin-bottom: 18px;
      }
      .sp-stat {
        background: rgba(255,255,255,0.045); border: 1px solid var(--line);
        border-radius: var(--radius); padding: 12px 14px;
      }
      .sp-stat strong {
        display: block; font-size: 1.5rem; line-height: 1;
        color: var(--gold-strong); font-weight: 800;
      }
      .sp-stat span {
        display: block; margin-top: 6px; color: var(--text-muted);
        font-size: 0.7rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.07em;
      }

      /* ========== Dashboard: segmented location tabs ========== */
      .sp-tabs { display: inline-flex; gap: 4px; padding: 4px; background: rgba(255,255,255,0.03); border: 1px solid var(--line); border-radius: var(--radius); margin-bottom: 18px; flex-wrap: wrap; }
      .sp-tabs a {
        display: inline-flex; align-items: center; padding: 7px 14px;
        border-radius: 6px; font-size: 0.86rem; font-weight: 700;
        color: var(--text-muted); text-decoration: none;
        transition: background 0.15s, color 0.15s;
      }
      .sp-tabs a:hover { color: var(--text); background: rgba(255,255,255,0.045); text-decoration: none; }
      .sp-tabs a.is-active { background: var(--gold-strong); color: #17110a; }

      /* ========== Dashboard: 7-day grid ========== */
      .sp-day-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
        gap: 14px;
      }
      .sp-day-card {
        position: relative; display: flex; flex-direction: column;
        padding: 16px 16px 14px 22px;
        background: linear-gradient(180deg, rgba(255,255,255,0.035), rgba(255,255,255,0.01)), var(--surface);
        border: 1px solid var(--line); border-radius: var(--radius);
        text-decoration: none; color: inherit; overflow: hidden;
        min-height: 150px;
        transition: transform 0.18s, border-color 0.18s, box-shadow 0.18s;
      }
      .sp-day-card:hover { transform: translateY(-2px); border-color: rgba(240,199,102,0.55); box-shadow: 0 10px 28px rgba(0,0,0,0.35); text-decoration: none; }
      .sp-day-card::before {
        content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 6px;
        background: var(--day-color, var(--gold-strong));
      }
      .sp-day-card.is-inactive { opacity: 0.55; }
      .sp-day-card.is-inactive::before { background: var(--text-soft); }
      .sp-day-card.is-today {
        border-color: var(--gold-strong);
        box-shadow: 0 0 0 1px var(--gold-strong) inset, 0 6px 20px rgba(240,199,102,0.1);
      }
      .sp-day-card-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 4px; }
      .sp-day-card-day {
        font-size: 0.72rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em;
        color: var(--text-muted);
      }
      .sp-day-card.is-today .sp-day-card-day { color: var(--gold-strong); }
      .sp-day-card-today-pip {
        font-size: 0.62rem; padding: 2px 7px; border-radius: 999px;
        background: var(--gold-strong); color: #17110a; font-weight: 800;
        text-transform: uppercase; letter-spacing: 0.07em;
      }
      .sp-day-card-theme {
        font-size: 1.08rem; font-weight: 800; color: var(--text); margin: 4px 0 8px;
        line-height: 1.25; word-break: break-word;
      }
      .sp-day-card-theme.is-empty { color: var(--text-muted); font-style: italic; font-weight: 600; }
      .sp-day-card-tagline { color: var(--text-muted); font-size: 0.82rem; line-height: 1.4; flex: 1 1 auto; margin-bottom: 8px; }
      .sp-day-card-foot {
        display: flex; flex-wrap: wrap; gap: 6px; align-items: center;
        margin-top: auto;
        padding-top: 8px; border-top: 1px solid var(--line-soft);
        font-size: 0.78rem; color: var(--text-muted);
      }
      .sp-day-card-foot .grow { flex: 1 1 auto; }

      /* ========== Day editor: 2-col layout ========== */
      .sp-grid {
        display: grid; grid-template-columns: minmax(0, 1fr) 340px;
        gap: 18px; align-items: start;
      }
      .sp-main { min-width: 0; }
      .sp-rail { position: sticky; top: 84px; display: flex; flex-direction: column; gap: 14px; }
      @media (max-width: 1080px) {
        .sp-grid { grid-template-columns: 1fr; }
        .sp-rail { position: static; }
      }

      /* ========== Specials list (cards) ========== */
      .sp-list { display: flex; flex-direction: column; gap: 10px; margin: 8px 0 6px; }
      .sp-item {
        position: relative;
        display: grid; grid-template-columns: 22px 60px 1fr auto;
        gap: 12px; align-items: center;
        background: rgba(255,255,255,0.025); border: 1px solid var(--line);
        border-radius: var(--radius); padding: 12px 14px 12px 10px;
        transition: border-color 0.15s, background 0.15s;
      }
      .sp-item.is-featured { border-color: rgba(240,199,102,0.5); background: linear-gradient(90deg, rgba(240,199,102,0.05), transparent 60%), rgba(255,255,255,0.025); }
      .sp-item.is-inactive { opacity: 0.55; }
      .sp-item.dragging { opacity: 0.6; transform: scale(0.99); }
      .sp-item:hover .sp-drag { color: var(--gold-strong); }
      .sp-drag {
        cursor: grab; user-select: none;
        color: var(--text-soft); font-size: 1.1rem; line-height: 1;
        text-align: center; padding: 6px 0;
        transition: color 0.15s;
      }
      .sp-drag:active { cursor: grabbing; }
      .sp-thumb {
        width: 60px; height: 60px; border-radius: 6px;
        background: rgba(255,255,255,0.04) center / cover no-repeat;
        border: 1px solid var(--line);
        display: flex; align-items: center; justify-content: center;
        color: var(--text-soft); font-size: 1.4rem;
      }
      .sp-thumb.has-img { background-image: var(--bg-img, none); }
      .sp-body { min-width: 0; }
      .sp-body-row1 {
        display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap;
        margin-bottom: 4px;
      }
      .sp-body-name { font-weight: 800; color: var(--text); font-size: 1rem; }
      .sp-body-price { color: var(--gold-strong); font-weight: 700; font-size: 0.92rem; }
      .sp-body-order-badge { color: var(--text-soft); font-size: 0.78rem; font-weight: 600; }
      .sp-body-desc { color: var(--text-muted); font-size: 0.86rem; line-height: 1.45; margin-bottom: 6px; }
      .sp-body-tags { display: flex; flex-wrap: wrap; gap: 5px; }
      .sp-actions { display: flex; gap: 4px; align-items: center; }
      .sp-actions .btn { min-height: 32px; padding: 5px 10px; font-size: 0.76rem; }
      .sp-actions .icon-btn {
        width: 32px; height: 32px; padding: 0;
        display: inline-flex; align-items: center; justify-content: center;
        background: transparent; border: 1px solid transparent;
        border-radius: 6px; color: var(--text-muted); cursor: pointer;
        font-size: 1rem; line-height: 1;
      }
      .sp-actions .icon-btn:hover { color: var(--text); background: rgba(255,255,255,0.05); border-color: var(--line); }
      .sp-actions .icon-btn.is-danger:hover { color: #ffb3b3; border-color: rgba(255,123,123,0.35); background: rgba(255,123,123,0.08); }
      .sp-actions .icon-btn.is-gold { color: var(--gold-strong); }
      .sp-bulk-cb { accent-color: var(--gold-strong); transform: translateY(1px); }

      /* Inline edit drawer (slides down inside a card) */
      .sp-edit-drawer {
        margin: -2px 0 12px;
        background: rgba(255,255,255,0.03);
        border: 1px solid var(--line); border-top: none;
        border-radius: 0 0 var(--radius) var(--radius);
        padding: 16px 18px;
        display: none;
      }
      .sp-edit-drawer.is-open { display: block; }
      .sp-item.has-open-edit { border-bottom-left-radius: 0; border-bottom-right-radius: 0; border-bottom-color: transparent; }

      /* ========== Form grouping ========== */
      .sp-form-grouped legend {
        font-size: 0.72rem; font-weight: 800; padding: 0 6px;
        color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.07em;
      }
      .sp-form-grouped fieldset {
        border: 1px dashed var(--line); border-radius: var(--radius);
        padding: 12px 14px; margin-bottom: 12px; background: rgba(255,255,255,0.015);
      }
      .sp-form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
      .sp-form-row.cols-3 { grid-template-columns: 1fr 1fr 1fr; }
      @media (max-width: 600px) { .sp-form-row, .sp-form-row.cols-3 { grid-template-columns: 1fr; } }
      .sp-form-block { margin-top: 12px; }
      .sp-form-block:first-child { margin-top: 0; }
      .sp-form-block label, .sp-form-row label {
        display: block; font-size: 0.74rem; color: var(--text-muted);
        text-transform: uppercase; letter-spacing: 0.06em; font-weight: 800;
        margin-bottom: 4px; margin-top: 0;
      }
      .sp-form-block input[type="text"], .sp-form-block input[type="number"], .sp-form-block input[type="email"],
      .sp-form-block input[type="url"], .sp-form-block select, .sp-form-block textarea,
      .sp-form-row input[type="text"], .sp-form-row input[type="number"], .sp-form-row input[type="email"],
      .sp-form-row input[type="url"], .sp-form-row select, .sp-form-row textarea {
        background: var(--bg-soft); color: var(--text); border: 1px solid var(--line);
        padding: 9px 11px; border-radius: var(--radius); font-size: 0.92rem; width: 100%;
        box-sizing: border-box; font-family: inherit;
      }
      .sp-form-block textarea { min-height: 70px; resize: vertical; }

      /* Toggle (styled checkbox) */
      .sp-toggle { display: inline-flex; align-items: center; gap: 8px; cursor: pointer; font-size: 0.9rem; color: var(--text); user-select: none; }
      .sp-toggle input { position: absolute; opacity: 0; pointer-events: none; }
      .sp-toggle .track {
        width: 38px; height: 22px; border-radius: 12px;
        background: rgba(255,255,255,0.1); border: 1px solid var(--line);
        position: relative; transition: background 0.18s, border-color 0.18s;
      }
      .sp-toggle .track::after {
        content: ''; position: absolute; top: 2px; left: 2px;
        width: 16px; height: 16px; border-radius: 50%;
        background: var(--text-muted); transition: transform 0.18s, background 0.18s;
      }
      .sp-toggle input:checked + .track { background: rgba(240,199,102,0.32); border-color: var(--gold-strong); }
      .sp-toggle input:checked + .track::after { transform: translateX(16px); background: var(--gold-strong); }
      .sp-toggle input:focus-visible + .track { outline: 3px solid rgba(143,183,255,0.45); outline-offset: 2px; }

      /* Chip picker (badges, time-window presets) */
      .sp-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
      .sp-chip {
        display: inline-flex; align-items: center; gap: 4px;
        padding: 4px 10px; border-radius: 999px;
        background: rgba(255,255,255,0.05); border: 1px solid var(--line);
        color: var(--text-muted); font-size: 0.78rem; font-weight: 700;
        cursor: pointer; font-family: inherit; transition: all 0.15s;
      }
      .sp-chip:hover { color: var(--text); border-color: rgba(240,199,102,0.4); }
      .sp-chip.is-on { background: rgba(240,199,102,0.18); color: var(--gold-strong); border-color: var(--gold-strong); }
      .sp-chip-clear { background: transparent; border-color: transparent; color: var(--text-soft); }
      .sp-chip-clear:hover { color: #ffb3b3; }

      /* Theme color picker (the swatch IS the button) */
      .sp-color-swatch {
        position: relative; display: inline-block;
        width: 42px; height: 42px; border-radius: 8px;
        border: 2px solid rgba(255,255,255,0.2);
        background: var(--gold-strong);
        overflow: hidden; cursor: pointer;
      }
      .sp-color-swatch input[type="color"] {
        position: absolute; inset: 0; opacity: 0; cursor: pointer; border: none;
      }
      .sp-color-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
      .sp-color-row .hex { color: var(--text-muted); font-family: 'SF Mono', Menlo, monospace; font-size: 0.86rem; }

      /* ========== Live preview rail ========== */
      .sp-preview-card {
        background: linear-gradient(180deg, rgba(255,255,255,0.035), rgba(255,255,255,0.01)), var(--surface);
        border: 1px solid var(--line); border-radius: var(--radius);
        padding: 14px 14px 18px;
      }
      .sp-preview-card .preview-head {
        display: flex; align-items: center; justify-content: space-between;
        margin-bottom: 10px;
      }
      .sp-preview-card .preview-head h2 {
        margin: 0; font-size: 0.78rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.07em; font-weight: 800;
      }
      .sp-preview-frame {
        background: #0d0d0d; border: 1px solid var(--line);
        border-radius: 10px; padding: 14px;
        max-height: 60vh; overflow-y: auto;
      }
      .sp-preview-frame .pv-day {
        font-size: 0.64rem; font-weight: 800; color: var(--text-muted);
        text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 6px;
      }
      .sp-preview-frame .pv-title { font-size: 1.05rem; font-weight: 800; color: var(--text); margin-bottom: 4px; }
      .sp-preview-frame .pv-tagline { color: var(--text-muted); font-size: 0.78rem; margin-bottom: 12px; font-style: italic; }
      .sp-preview-frame .pv-section { margin-top: 12px; }
      .sp-preview-frame .pv-section-head { color: var(--gold-strong); font-size: 0.62rem; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 800; margin-bottom: 6px; }
      .sp-preview-frame .pv-item {
        padding: 8px 10px; background: rgba(255,255,255,0.025);
        border-radius: 6px; margin-bottom: 6px; border: 1px solid transparent;
      }
      .sp-preview-frame .pv-item.is-featured { border-color: rgba(240,199,102,0.4); background: rgba(240,199,102,0.06); }
      .sp-preview-frame .pv-item-name { color: var(--text); font-weight: 700; font-size: 0.86rem; }
      .sp-preview-frame .pv-item-name .star { color: var(--gold-strong); margin-left: 4px; }
      .sp-preview-frame .pv-item-desc { color: var(--text-muted); font-size: 0.76rem; margin-top: 2px; line-height: 1.4; }
      .sp-preview-frame .pv-item-price { color: var(--gold-strong); font-weight: 700; font-size: 0.86rem; float: right; }
      .sp-preview-frame .pv-empty { color: var(--text-soft); font-style: italic; font-size: 0.82rem; padding: 18px 4px; text-align: center; }

      /* ========== Reorder save indicator ========== */
      .sp-reorder-status {
        display: inline-flex; align-items: center; gap: 6px;
        font-size: 0.78rem; color: var(--text-muted);
        opacity: 0; transition: opacity 0.2s;
      }
      .sp-reorder-status.is-visible { opacity: 1; }
      .sp-reorder-status.is-saving { color: var(--amber); }
      .sp-reorder-status.is-saved { color: #a4f4c2; }
      .sp-reorder-status.is-error { color: #ffb3b3; }

      /* ========== Floating bulk-action bar ========== */
      .sp-bulk-bar {
        position: sticky; bottom: 16px; z-index: 20;
        margin-top: 14px;
        display: none; align-items: center; gap: 10px; flex-wrap: wrap;
        padding: 12px 16px;
        background: linear-gradient(180deg, var(--surface-2), var(--surface));
        border: 1px solid var(--gold-strong); border-radius: var(--radius);
        box-shadow: 0 12px 32px rgba(0,0,0,0.45);
      }
      .sp-bulk-bar.is-visible { display: flex; }
      .sp-bulk-bar .count { color: var(--gold-strong); font-weight: 800; }
      .sp-bulk-bar select, .sp-bulk-bar input {
        background: var(--bg-soft); color: var(--text);
        border: 1px solid var(--line); padding: 6px 10px;
        border-radius: 6px; font-size: 0.86rem;
      }

      /* ========== Undo toast (soft delete) ========== */
      .sp-toast-stack { position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); z-index: 60; display: flex; flex-direction: column; gap: 8px; }
      .sp-toast {
        display: flex; align-items: center; gap: 12px;
        padding: 10px 14px 10px 16px;
        background: var(--surface-2); border: 1px solid var(--line);
        border-radius: var(--radius); box-shadow: var(--shadow);
        color: var(--text); font-size: 0.9rem; max-width: 460px;
      }
      .sp-toast button {
        background: transparent; border: 1px solid var(--line); color: var(--gold-strong);
        padding: 4px 10px; border-radius: 6px;
        font-size: 0.82rem; font-weight: 700; cursor: pointer;
      }
      .sp-toast button:hover { border-color: var(--gold-strong); background: rgba(240,199,102,0.1); }

      /* ========== Keyboard hint ========== */
      .sp-kbd { display: inline-block; padding: 1px 6px; border: 1px solid var(--line); border-bottom-width: 2px; border-radius: 4px; background: rgba(255,255,255,0.05); font-family: 'SF Mono', Menlo, monospace; font-size: 0.72rem; color: var(--text); }
      .sp-shortcut-hint { color: var(--text-muted); font-size: 0.78rem; margin-top: 8px; }

      /* ========== Print ========== */
      @media print {
        .sp-rail, .sp-actions, .sp-bulk-bar, .sp-shortcut-hint, .sp-toast-stack, .sp-hero-actions { display: none !important; }
        .sp-grid { grid-template-columns: 1fr; }
        .sp-card, .sp-hero, .sp-item, .sp-day-card { background: white !important; border: 1px solid #ccc !important; color: black !important; box-shadow: none !important; }
        h1, h2, h3, .sp-card-head h2 { color: black !important; }
        a { color: black !important; text-decoration: none !important; }
      }
    </style>
  `;
}

function buildCategoryOptions(selected, options = []) {
  const merged = ['cocktail', 'beer', 'wine', 'whiskey', 'food', 'other']
    .concat((options || []).map((value) => String(value || '').trim().toLowerCase()))
    .filter(Boolean);

  const seen = new Set();
  const unique = [];
  for (const value of merged) {
    if (seen.has(value)) continue;
    seen.add(value);
    unique.push(value);
  }

  return ['']
    .concat(unique)
    .map((value) => {
      const selectedAttr = value === selected ? ' selected' : '';
      const label = value ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : 'None';
      return `<option value="${value}"${selectedAttr}>${label}</option>`;
    })
    .join('');
}

// ─── Half-Price Spirit Picker ───
function renderHalfPricePicker(day, theme, actionUrl, spiritCatalog, spiritCategories) {
  const config = theme.halfPriceConfig || {};
  const categories = (spiritCategories && spiritCategories.categories) || [];
  const catalog = spiritCatalog || [];

  const savedCategories = config.categories || [];
  const savedPicks = config.picks || [];
  const savedPickSet = new Set(savedPicks.map(String));
  const priceMin = config.priceMin != null ? config.priceMin : '';
  const priceMax = config.priceMax != null ? config.priceMax : '';

  const WHISKEY_DEFAULTS = ['Bourbon', 'Rye Whiskey', 'Tennessee Whiskey', 'American Whiskey', 'Canadian Whisky', 'Irish Whiskey', 'Blended Scotch', 'Single Malt Scotch', 'Japanese Whisky', 'Whiskey', 'Flavored Whiskey', 'International Whiskey'];
  const AGAVE_DEFAULTS = ['Tequila', 'Mezcal'];

  // Day-based suggestion for first-time setup only; not enforced
  const isWednesday = day === 'WEDNESDAY';
  const isThursday = day === 'THURSDAY';
  const suggestedLabel = isWednesday ? 'Whiskey' : (isThursday ? 'Agave Spirits' : 'Spirits');
  const suggestedCats = isWednesday ? WHISKEY_DEFAULTS : (isThursday ? AGAVE_DEFAULTS : []);

  // Determine active categories: saved config, or day suggestions on first load
  const hasExistingConfig = Object.keys(config).length > 0;
  const activeCategories = hasExistingConfig ? savedCategories : suggestedCats;

  // Label and discount: config-driven with sensible defaults
  const savedLabel = typeof config.label === 'string' && config.label ? config.label : suggestedLabel;
  const savedDiscount = typeof config.discount === 'number' && config.discount > 0 ? config.discount : 50;

  // Group catalog by category for pill counts and table rendering
  const grouped = {};
  catalog.forEach(s => {
    const cat = s.primaryCategory || 'Uncategorized';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(s);
  });
  const sortedCats = Object.keys(grouped).sort();

  // Build category pill HTML (pills are for categories present in the catalog, with count badges)
  const catalogCatSet = new Set(sortedCats);
  const pillList = categories.filter(c => catalogCatSet.has(c));
  // Add any catalog categories that weren't in the master list (fallback)
  sortedCats.forEach(c => { if (!pillList.includes(c)) pillList.push(c); });
  const categoryPills = pillList.map(cat => {
    const active = activeCategories.includes(cat);
    const count = grouped[cat] ? grouped[cat].length : 0;
    return `<button type="button" class="hp-pill${active ? ' hp-pill-active' : ''}" data-hp-cat="${escHTML(cat)}">
      <span class="hp-pill-label">${escHTML(cat)}</span>
      <span class="hp-pill-count">${count}</span>
    </button>`;
  }).join('');

  // Build table rows grouped by category
  let tableRows = '';
  for (const cat of sortedCats) {
    const spirits = grouped[cat];
    const selectedInGroup = spirits.filter(s => savedPickSet.has(String(s.productId))).length;
    tableRows += `<tr class="hp-group-header" data-hp-group="${escHTML(cat)}">
      <td colspan="4">
        <div class="hp-group-header-inner">
          <div class="hp-group-title">
            <span class="hp-group-label">${escHTML(cat)}</span>
            <span class="hp-group-count">${spirits.length}</span>
            <span class="hp-group-selected" data-hp-gsel="${escHTML(cat)}">${selectedInGroup > 0 ? `${selectedInGroup} selected` : ''}</span>
          </div>
          <div class="hp-group-actions">
            <button type="button" class="hp-grp-btn hp-grp-selall" data-hp-grpact="${escHTML(cat)}">Select all</button>
            <button type="button" class="hp-grp-btn hp-grp-selnone" data-hp-grpclr="${escHTML(cat)}">Clear</button>
          </div>
        </div>
      </td>
    </tr>`;
    for (const s of spirits) {
      const checked = savedPickSet.has(String(s.productId)) ? ' checked' : '';
      const halfPrice = s.oneOzPrice ? (s.oneOzPrice / 2).toFixed(0) : '';
      tableRows += `<tr class="hp-row${checked ? ' hp-row-picked' : ''}" data-hp-id="${escHTML(s.productId)}" data-hp-cat="${escHTML(s.primaryCategory || '')}" data-hp-name="${escHTML(s.name.toLowerCase())}" data-hp-price="${s.oneOzPrice || ''}" tabindex="0">
        <td class="hp-cell-cb"><input type="checkbox" class="hp-spirit-cb" value="${escHTML(s.productId)}"${checked} aria-label="Select ${escHTML(s.name)}" /></td>
        <td class="hp-cell-name">${escHTML(s.name)}</td>
        <td class="hp-cell-price">${s.oneOzPrice ? `$${s.oneOzPrice}` : '<span class="hp-na">—</span>'}</td>
        <td class="hp-cell-half">${s.oneOzPrice ? `$${halfPrice}` : ''}</td>
      </tr>`;
    }
  }

  const catalogJSON = JSON.stringify(catalog.map(s => ({
    id: s.productId,
    name: s.name,
    cat: s.primaryCategory,
    price: s.oneOzPrice,
  })));

  const emptyCatalog = catalog.length === 0;

  return `
    <div class="card hp-picker" id="hp-picker">
      <style>
        /* Half-price picker — uses global tokens from adminLayout.js */
        .hp-picker {
          background: linear-gradient(180deg, rgba(255,255,255,0.035), rgba(255,255,255,0.01)), var(--surface);
          border: 1px solid var(--line); padding: 0; border-radius: var(--radius);
        }
        .hp-picker .hp-head {
          padding: 20px 24px;
          background: linear-gradient(135deg, rgba(240,199,102,0.08), rgba(185,120,75,0.04));
          border-bottom: 1px solid var(--line);
          border-radius: var(--radius) var(--radius) 0 0;
        }
        .hp-picker .hp-head h2 { margin: 0 0 4px; font-size: 1.1rem; color: var(--gold-strong); text-transform: uppercase; letter-spacing: 0.06em; font-weight: 800; }
        .hp-picker .hp-head p { color: var(--text-muted); font-size: 0.88rem; margin: 0; }

        .hp-picker .hp-section { padding: 20px 24px; border-bottom: 1px solid var(--line-soft); }
        .hp-picker .hp-section:last-of-type { border-bottom: none; }
        .hp-picker .hp-section-label {
          display: block; font-size: 0.72rem; font-weight: 800;
          color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.08em;
          margin-bottom: 14px;
        }

        /* Sticky summary bar */
        .hp-picker .hp-summary {
          position: sticky; top: 80px; z-index: 5;
          margin: 16px 24px 0; padding: 14px 18px;
          background: linear-gradient(135deg, var(--surface-2), var(--surface));
          border: 1px solid var(--line); border-radius: var(--radius);
          display: flex; align-items: center; gap: 16px; flex-wrap: wrap;
          box-shadow: var(--shadow);
        }
        .hp-picker .hp-summary-stat { display: flex; align-items: baseline; gap: 6px; }
        .hp-picker .hp-summary-num {
          font-size: 1.5rem; font-weight: 800;
          background: linear-gradient(135deg, var(--gold-strong), var(--copper));
          -webkit-background-clip: text; -webkit-text-fill-color: transparent;
        }
        .hp-picker .hp-summary-lbl { color: var(--text-muted); font-size: 0.85rem; }
        .hp-picker .hp-summary-sep { width: 1px; height: 24px; background: var(--line); }
        .hp-picker .hp-summary-discount {
          background: rgba(240,199,102,0.15); color: var(--gold-strong);
          padding: 6px 12px; border-radius: 999px;
          font-weight: 800; font-size: 0.82rem; text-transform: uppercase; letter-spacing: 0.06em;
        }
        .hp-picker .hp-dirty-badge {
          display: none; align-items: center; gap: 6px;
          background: rgba(242,166,90,0.15); color: var(--amber);
          padding: 5px 10px; border-radius: 999px;
          font-size: 0.76rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em;
        }
        .hp-picker .hp-dirty-badge.is-dirty { display: inline-flex; }
        .hp-picker .hp-dirty-dot { width: 6px; height: 6px; background: var(--amber); border-radius: 50%; animation: hp-pulse 1.6s ease-in-out infinite; }
        @keyframes hp-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        .hp-picker .hp-summary-actions { margin-left: auto; display: flex; gap: 8px; align-items: center; }

        /* Display + preview */
        .hp-picker .hp-display-row { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; align-items: start; }
        .hp-picker .hp-display-fields label { margin-top: 0; }
        .hp-picker .hp-display-fields .form-row { margin-top: 12px; }
        .hp-picker .hp-preview {
          background: rgba(255,255,255,0.025); border: 1px solid var(--line);
          border-radius: var(--radius); padding: 16px 18px;
        }
        .hp-picker .hp-preview-hint {
          font-size: 0.68rem; font-weight: 800;
          color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.1em;
          margin-bottom: 10px;
        }
        .hp-picker .hp-preview-title { font-size: 1.05rem; font-weight: 800; color: var(--gold-strong); margin-bottom: 4px; }
        .hp-picker .hp-preview-sub { color: var(--text-muted); font-size: 0.82rem; margin-bottom: 12px; }
        .hp-picker .hp-preview-ex {
          display: flex; justify-content: space-between; align-items: center;
          padding: 8px 10px; background: rgba(0,0,0,0.25);
          border-radius: 6px; font-size: 0.85rem;
        }
        .hp-picker .hp-preview-ex-name { color: var(--text); font-weight: 500; }
        .hp-picker .hp-preview-ex-prices { display: flex; gap: 8px; align-items: baseline; }
        .hp-picker .hp-preview-ex-prices s { color: var(--text-soft); font-size: 0.78rem; }
        .hp-picker .hp-preview-ex-prices strong { color: var(--gold-strong); font-size: 0.95rem; }
        .hp-picker .hp-preview-empty { color: var(--text-soft); font-size: 0.82rem; font-style: italic; }

        /* Pills */
        .hp-picker .hp-pills { display: flex; flex-wrap: wrap; gap: 6px; }
        .hp-picker .hp-pill {
          background: rgba(255,255,255,0.04); border: 1px solid var(--line);
          color: var(--text-muted); padding: 6px 10px 6px 12px;
          border-radius: 999px; font-size: 0.82rem; cursor: pointer;
          transition: all 0.15s; display: inline-flex; align-items: center; gap: 6px;
          font-family: inherit;
        }
        .hp-picker .hp-pill:hover { border-color: rgba(240,199,102,0.5); color: var(--gold-strong); }
        .hp-picker .hp-pill-count {
          background: rgba(255,255,255,0.05); color: var(--text-muted);
          padding: 1px 7px; border-radius: 10px; font-size: 0.72rem; font-weight: 700;
        }
        .hp-picker .hp-pill-active { background: rgba(240,199,102,0.15); border-color: var(--gold-strong); color: var(--gold-strong); font-weight: 700; }
        .hp-picker .hp-pill-active .hp-pill-count { background: rgba(240,199,102,0.25); color: var(--gold-strong); }

        /* Filter row */
        .hp-picker .hp-filter-grid { display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 12px; margin-bottom: 14px; }
        .hp-picker .hp-filter-grid label { margin-top: 0; }
        .hp-picker .hp-search-input {
          background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23b9aea0' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><circle cx='11' cy='11' r='8'/><line x1='21' y1='21' x2='16.65' y2='16.65'/></svg>");
          background-repeat: no-repeat; background-position: 12px center; padding-left: 36px !important;
        }

        /* Action toolbar */
        .hp-picker .hp-toolbar {
          display: flex; align-items: center; gap: 10px; padding: 10px 14px;
          background: rgba(255,255,255,0.025); border: 1px solid var(--line);
          border-radius: var(--radius) var(--radius) 0 0; border-bottom: none; flex-wrap: wrap;
        }
        .hp-picker .hp-toolbar .hp-bulk-btn {
          background: rgba(255,255,255,0.05); border: 1px solid var(--line); color: var(--text);
          padding: 5px 11px; border-radius: 6px; font-size: 0.78rem; cursor: pointer;
          font-family: inherit; transition: all 0.15s;
        }
        .hp-picker .hp-toolbar .hp-bulk-btn:hover { border-color: var(--gold-strong); color: var(--gold-strong); }
        .hp-picker .hp-view-btns { display: inline-flex; background: rgba(0,0,0,0.2); border: 1px solid var(--line); border-radius: 6px; overflow: hidden; }
        .hp-picker .hp-view-btn {
          background: transparent; border: none; color: var(--text-muted);
          padding: 5px 12px; font-size: 0.78rem; cursor: pointer; font-family: inherit; transition: all 0.15s;
        }
        .hp-picker .hp-view-btn:not(:last-child) { border-right: 1px solid var(--line); }
        .hp-picker .hp-view-btn:hover { color: var(--gold-strong); }
        .hp-picker .hp-view-btn.hp-vb-active { background: rgba(240,199,102,0.15); color: var(--gold-strong); font-weight: 700; }
        .hp-picker .hp-counts { margin-left: auto; color: var(--text-muted); font-size: 0.82rem; white-space: nowrap; }
        .hp-picker .hp-counts strong { color: var(--gold-strong); font-weight: 800; }

        /* Table */
        .hp-picker .hp-table-wrap {
          max-height: 60vh; overflow-y: auto;
          border: 1px solid var(--line); border-top: none;
          border-radius: 0 0 var(--radius) var(--radius);
          background: rgba(0,0,0,0.2);
        }
        .hp-picker .hp-table { width: 100%; border-collapse: collapse; }
        .hp-picker .hp-group-header td {
          padding: 0; background: rgba(255,255,255,0.04); border-bottom: 1px solid var(--line);
          position: sticky; top: 0; z-index: 1;
        }
        .hp-picker .hp-group-header-inner {
          display: flex; align-items: center; justify-content: space-between;
          padding: 10px 14px; gap: 10px;
        }
        .hp-picker .hp-group-title { display: flex; align-items: center; gap: 8px; }
        .hp-picker .hp-group-label { font-weight: 800; color: var(--gold-strong); font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.06em; }
        .hp-picker .hp-group-count { color: var(--text-muted); font-size: 0.74rem; background: rgba(255,255,255,0.05); padding: 2px 8px; border-radius: 10px; font-weight: 700; }
        .hp-picker .hp-group-selected { color: #a4f4c2; font-size: 0.74rem; font-weight: 700; }
        .hp-picker .hp-group-actions { display: flex; gap: 4px; }
        .hp-picker .hp-grp-btn {
          background: transparent; border: 1px solid var(--line); color: var(--text-muted);
          padding: 3px 9px; border-radius: 4px; font-size: 0.72rem; cursor: pointer;
          font-family: inherit; transition: all 0.15s;
        }
        .hp-picker .hp-grp-btn:hover { border-color: var(--gold-strong); color: var(--gold-strong); }

        .hp-picker .hp-row { cursor: pointer; transition: background 0.1s; }
        .hp-picker .hp-row:focus { outline: 2px solid rgba(143,183,255,0.5); outline-offset: -2px; }
        .hp-picker .hp-row td {
          padding: 9px 14px; border-bottom: 1px solid var(--line-soft);
          font-size: 0.88rem; color: var(--text);
        }
        .hp-picker .hp-row:hover td { background: rgba(255,255,255,0.025); }
        .hp-picker .hp-row-picked {
          background: linear-gradient(90deg, rgba(98,210,143,0.08), transparent 60%);
          box-shadow: inset 3px 0 0 #62d28f;
        }
        .hp-picker .hp-row-picked .hp-cell-name { color: #a4f4c2; }
        .hp-picker .hp-cell-cb { width: 36px; text-align: center; }
        .hp-picker .hp-cell-cb input[type="checkbox"] {
          width: 16px; height: 16px; accent-color: var(--gold-strong); cursor: pointer;
        }
        .hp-picker .hp-cell-name { font-weight: 500; }
        .hp-picker .hp-cell-price { color: var(--text-muted); font-size: 0.85rem; text-align: right; white-space: nowrap; }
        .hp-picker .hp-cell-half { color: var(--gold-strong); font-weight: 800; font-size: 0.9rem; text-align: right; white-space: nowrap; }
        .hp-picker .hp-na { color: var(--text-soft); }
        .hp-picker .hp-row-hidden { display: none; }

        .hp-picker .hp-empty { text-align: center; padding: 40px 20px; color: var(--text-soft); }
        .hp-picker .hp-empty-icon { font-size: 2rem; opacity: 0.4; margin-bottom: 8px; }
        .hp-picker .hp-empty-title { color: var(--text-muted); font-weight: 700; margin-bottom: 4px; }
        .hp-picker .hp-empty-sub { font-size: 0.85rem; }

        @media (max-width: 768px) {
          .hp-picker .hp-display-row { grid-template-columns: 1fr; }
          .hp-picker .hp-filter-grid { grid-template-columns: 1fr; }
          .hp-picker .hp-summary { margin: 12px 16px 0; padding: 12px; }
          .hp-picker .hp-summary-actions { margin-left: 0; width: 100%; }
          .hp-picker .hp-head, .hp-picker .hp-section { padding: 16px; }
          .hp-picker .hp-group-header-inner { flex-direction: column; align-items: flex-start; gap: 6px; }
          .hp-picker .hp-counts { margin-left: 0; width: 100%; }
        }
      </style>

      <div class="hp-head">
        <h2>Discounted Spirits</h2>
        <p>Pick which spirits guests see on this day's specials page at a discount.</p>
      </div>

      <!-- Sticky summary bar -->
      <div class="hp-summary">
        <div class="hp-summary-stat">
          <span class="hp-summary-num" id="hp-summary-count">0</span>
          <span class="hp-summary-lbl">of ${catalog.length} selected</span>
        </div>
        <div class="hp-summary-sep"></div>
        <div class="hp-summary-discount" id="hp-summary-discount">${savedDiscount}% off</div>
        <span class="hp-dirty-badge" id="hp-dirty-badge">
          <span class="hp-dirty-dot"></span> Unsaved changes
        </span>
        <div class="hp-summary-actions">
          <form method="POST" action="${actionUrl}" id="hp-save-form" style="margin:0">
            <input type="hidden" name="_action" value="saveHalfPrice" />
            <input type="hidden" name="halfPriceConfig" id="hp-config-json" value="${escHTML(JSON.stringify(config))}" />
            <button type="submit" class="btn btn-primary">Save Selection</button>
          </form>
        </div>
      </div>

      <!-- Section: How guests see it -->
      <div class="hp-section">
        <span class="hp-section-label">How guests see it</span>
        <div class="hp-display-row">
          <div class="hp-display-fields">
            <label for="hp-label">Section Title</label>
            <input type="text" id="hp-label" value="${escHTML(savedLabel)}" placeholder="e.g. Whiskey, Agave Spirits" />
            <div class="form-row">
              <div>
                <label for="hp-discount">Discount %</label>
                <input type="number" id="hp-discount" value="${escHTML(String(savedDiscount))}" min="1" max="99" step="1" />
              </div>
              <div>
                <label>&nbsp;</label>
                <div style="color:#666; font-size:0.8rem; padding-top:12px">Applies to all selected spirits</div>
              </div>
            </div>
          </div>
          <div class="hp-preview">
            <div class="hp-preview-hint">Live Preview</div>
            <div class="hp-preview-title" id="hp-preview-title">Half-Price Whiskey</div>
            <div class="hp-preview-sub" id="hp-preview-sub">50% off select spirits &mdash; tonight only</div>
            <div class="hp-preview-ex" id="hp-preview-ex">
              <span class="hp-preview-empty">Select spirits below to see a price example</span>
            </div>
          </div>
        </div>
      </div>

      ${emptyCatalog ? `
      <div class="hp-section">
        <div class="hp-empty">
          <div class="hp-empty-icon">◌</div>
          <div class="hp-empty-title">No spirits loaded</div>
          <div class="hp-empty-sub">The bartender database didn't return any spirits for this location.</div>
        </div>
      </div>
      ` : `
      <!-- Section: Filter -->
      <div class="hp-section">
        <span class="hp-section-label">Find spirits</span>
        <div class="hp-filter-grid">
          <div>
            <label for="hp-search">Search</label>
            <input type="text" id="hp-search" class="hp-search-input" placeholder="Search spirits by name..." />
          </div>
          <div>
            <label for="hp-priceMin">Min $/oz</label>
            <input type="number" id="hp-priceMin" value="${escHTML(String(priceMin))}" min="0" step="1" placeholder="0" />
          </div>
          <div>
            <label for="hp-priceMax">Max $/oz</label>
            <input type="number" id="hp-priceMax" value="${escHTML(String(priceMax))}" min="0" step="1" placeholder="any" />
          </div>
        </div>
        <label style="display:block; margin-bottom:8px; color:#888; font-size:0.82rem">Categories <span style="color:#555">&mdash; click to filter the list below</span></label>
        <div class="hp-pills" id="hp-pills">
          ${categoryPills || '<span style="color:#666">No categories loaded</span>'}
        </div>
      </div>

      <!-- Section: Pick -->
      <div class="hp-section">
        <span class="hp-section-label">Select spirits</span>
        <div class="hp-toolbar">
          <button type="button" class="hp-bulk-btn" id="hp-select-all">Select all shown</button>
          <button type="button" class="hp-bulk-btn" id="hp-deselect-all">Clear shown</button>
          <div class="hp-view-btns">
            <button type="button" class="hp-view-btn hp-vb-active" data-hp-view="all">All</button>
            <button type="button" class="hp-view-btn" data-hp-view="selected">Selected</button>
            <button type="button" class="hp-view-btn" data-hp-view="unselected">Unselected</button>
          </div>
          <span class="hp-counts" id="hp-counts">&mdash;</span>
        </div>
        <div class="hp-table-wrap">
          <table class="hp-table" id="hp-table">
            <tbody>${tableRows}</tbody>
          </table>
        </div>
      </div>
      `}
    </div>

    <script>
    (function() {
      var catalog = ${catalogJSON};
      var configInput = document.getElementById('hp-config-json');
      var pills = document.querySelectorAll('#hp-picker .hp-pill');
      var rows = document.querySelectorAll('#hp-picker .hp-row');
      var groupHeaders = document.querySelectorAll('#hp-picker .hp-group-header');
      var priceMinEl = document.getElementById('hp-priceMin');
      var priceMaxEl = document.getElementById('hp-priceMax');
      var searchEl = document.getElementById('hp-search');
      var selectAllBtn = document.getElementById('hp-select-all');
      var deselectAllBtn = document.getElementById('hp-deselect-all');
      var countsEl = document.getElementById('hp-counts');
      var labelEl = document.getElementById('hp-label');
      var discountEl = document.getElementById('hp-discount');
      var dirtyBadge = document.getElementById('hp-dirty-badge');
      var summaryCount = document.getElementById('hp-summary-count');
      var summaryDiscount = document.getElementById('hp-summary-discount');
      var previewTitle = document.getElementById('hp-preview-title');
      var previewSub = document.getElementById('hp-preview-sub');
      var previewEx = document.getElementById('hp-preview-ex');
      var saveForm = document.getElementById('hp-save-form');
      var initialSnapshot = null;
      var viewMode = 'all';
      var saving = false;

      function getDiscount() {
        var d = discountEl && discountEl.value ? parseInt(discountEl.value, 10) : 50;
        if (isNaN(d) || d <= 0 || d >= 100) d = 50;
        return d;
      }
      function getLabel() {
        return labelEl && labelEl.value.trim() ? labelEl.value.trim() : 'Spirits';
      }
      function recomputePriceCells() {
        var disc = getDiscount();
        rows.forEach(function(row) {
          var price = row.getAttribute('data-hp-price');
          var cell = row.querySelector('.hp-cell-half');
          if (!cell) return;
          if (!price) { cell.textContent = ''; return; }
          var p = parseFloat(price);
          if (isNaN(p)) { cell.textContent = ''; return; }
          cell.textContent = '$' + (p * (100 - disc) / 100).toFixed(0);
        });
      }
      function updatePreview() {
        var disc = getDiscount();
        var lbl = getLabel();
        if (previewTitle) previewTitle.textContent = disc === 50 ? ('Half-Price ' + lbl) : (disc + '% Off ' + lbl);
        if (previewSub) previewSub.textContent = disc + '% off select spirits \u2014 tonight only';
        if (summaryDiscount) summaryDiscount.textContent = disc + '% off';

        if (previewEx) {
          // Find first selected spirit with a price, or fall back to first visible with a price
          var exSpirit = null;
          for (var i = 0; i < rows.length; i++) {
            var cb = rows[i].querySelector('.hp-spirit-cb');
            var priceAttr = rows[i].getAttribute('data-hp-price');
            if (cb && cb.checked && priceAttr) {
              exSpirit = {
                name: rows[i].querySelector('.hp-cell-name').textContent,
                price: parseFloat(priceAttr)
              };
              break;
            }
          }
          if (exSpirit) {
            var discounted = (exSpirit.price * (100 - disc) / 100).toFixed(0);
            previewEx.innerHTML =
              '<span class="hp-preview-ex-name">' + exSpirit.name + '</span>' +
              '<span class="hp-preview-ex-prices"><s>$' + exSpirit.price + '</s> <strong>$' + discounted + '</strong></span>';
          } else {
            previewEx.innerHTML = '<span class="hp-preview-empty">Select spirits below to see a price example</span>';
          }
        }
      }
      function markDirty() {
        if (!dirtyBadge || initialSnapshot === null) return;
        if (configInput && configInput.value !== initialSnapshot) {
          dirtyBadge.classList.add('is-dirty');
        } else {
          dirtyBadge.classList.remove('is-dirty');
        }
      }

      // --- View mode (All / Selected / Unselected) ---
      document.querySelectorAll('#hp-picker .hp-view-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
          document.querySelectorAll('#hp-picker .hp-view-btn').forEach(function(b) { b.classList.remove('hp-vb-active'); });
          btn.classList.add('hp-vb-active');
          viewMode = btn.getAttribute('data-hp-view');
          applyFilters();
        });
      });

      // --- Category pills: filter view only ---
      pills.forEach(function(pill) {
        pill.addEventListener('click', function() {
          pill.classList.toggle('hp-pill-active');
          applyFilters();
        });
      });

      // --- Per-group select all / deselect all (only visible rows) ---
      document.querySelectorAll('#hp-picker .hp-grp-selall').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
          e.stopPropagation();
          var cat = btn.getAttribute('data-hp-grpact');
          rows.forEach(function(row) {
            if (row.getAttribute('data-hp-cat') === cat && !row.classList.contains('hp-row-hidden')) {
              var cb = row.querySelector('.hp-spirit-cb');
              if (cb) { cb.checked = true; row.classList.add('hp-row-picked'); }
            }
          });
          updateCounts(); buildConfig(); applyFilters();
        });
      });
      document.querySelectorAll('#hp-picker .hp-grp-selnone').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
          e.stopPropagation();
          var cat = btn.getAttribute('data-hp-grpclr');
          rows.forEach(function(row) {
            if (row.getAttribute('data-hp-cat') === cat && !row.classList.contains('hp-row-hidden')) {
              var cb = row.querySelector('.hp-spirit-cb');
              if (cb) { cb.checked = false; row.classList.remove('hp-row-picked'); }
            }
          });
          updateCounts(); buildConfig(); applyFilters();
        });
      });

      function getActiveCategories() {
        return Array.from(document.querySelectorAll('#hp-picker .hp-pill-active')).map(function(p) { return p.getAttribute('data-hp-cat'); });
      }

      // --- Filtering ---
      function applyFilters() {
        var activeCats = getActiveCategories();
        var minP = priceMinEl && priceMinEl.value ? parseFloat(priceMinEl.value) : null;
        var maxP = priceMaxEl && priceMaxEl.value ? parseFloat(priceMaxEl.value) : null;
        var q = searchEl ? (searchEl.value || '').toLowerCase().trim() : '';

        var visibleByGroup = {};
        var selectedByGroup = {};
        rows.forEach(function(row) {
          var cat = row.getAttribute('data-hp-cat');
          var name = row.getAttribute('data-hp-name');
          var price = row.getAttribute('data-hp-price') ? parseFloat(row.getAttribute('data-hp-price')) : null;
          var cb = row.querySelector('.hp-spirit-cb');
          var isChecked = cb && cb.checked;

          var catOk = activeCats.length === 0 || activeCats.indexOf(cat) !== -1;
          var priceOk = true;
          if (minP !== null && (price === null || price < minP)) priceOk = false;
          if (maxP !== null && (price === null || price > maxP)) priceOk = false;
          var searchOk = !q || name.indexOf(q) !== -1;

          var filterPass = catOk && priceOk && searchOk;
          var viewPass = true;
          if (viewMode === 'selected' && !isChecked) viewPass = false;
          if (viewMode === 'unselected' && isChecked) viewPass = false;

          var visible = filterPass && viewPass;
          if (visible) {
            row.classList.remove('hp-row-hidden');
            visibleByGroup[cat] = (visibleByGroup[cat] || 0) + 1;
          } else {
            row.classList.add('hp-row-hidden');
          }
          if (isChecked) selectedByGroup[cat] = (selectedByGroup[cat] || 0) + 1;
        });

        groupHeaders.forEach(function(hdr) {
          var g = hdr.getAttribute('data-hp-group');
          var cnt = visibleByGroup[g] || 0;
          var sel = selectedByGroup[g] || 0;
          if (cnt > 0) {
            hdr.classList.remove('hp-row-hidden');
            var countSpan = hdr.querySelector('.hp-group-count');
            if (countSpan) countSpan.textContent = cnt;
            var selSpan = hdr.querySelector('.hp-group-selected');
            if (selSpan) selSpan.textContent = sel > 0 ? sel + ' selected' : '';
          } else {
            hdr.classList.add('hp-row-hidden');
          }
        });

        updateCounts();
        buildConfig();
      }

      // --- Counts ---
      function updateCounts() {
        var visibleCount = 0;
        var pickedCount = 0;
        rows.forEach(function(row) {
          if (!row.classList.contains('hp-row-hidden')) visibleCount++;
          var cb = row.querySelector('.hp-spirit-cb');
          if (cb && cb.checked) pickedCount++;
        });
        if (countsEl) countsEl.innerHTML = '<strong>' + visibleCount + '</strong> shown \u00b7 <strong>' + pickedCount + '</strong> picked';
        if (summaryCount) summaryCount.textContent = pickedCount;
      }

      // --- Select all / deselect visible spirits only ---
      if (selectAllBtn) selectAllBtn.addEventListener('click', function() {
        rows.forEach(function(row) {
          if (row.classList.contains('hp-row-hidden')) return;
          var cb = row.querySelector('.hp-spirit-cb');
          if (cb) { cb.checked = true; row.classList.add('hp-row-picked'); }
        });
        updateCounts(); buildConfig(); updatePreview();
      });
      if (deselectAllBtn) deselectAllBtn.addEventListener('click', function() {
        rows.forEach(function(row) {
          if (row.classList.contains('hp-row-hidden')) return;
          var cb = row.querySelector('.hp-spirit-cb');
          if (cb) { cb.checked = false; row.classList.remove('hp-row-picked'); }
        });
        updateCounts(); buildConfig(); updatePreview();
      });

      // --- Build config JSON ---
      function buildConfig() {
        var config = {};
        if (labelEl && labelEl.value.trim()) config.label = labelEl.value.trim();
        config.discount = getDiscount();
        config.categories = getActiveCategories();
        if (priceMinEl && priceMinEl.value) config.priceMin = parseFloat(priceMinEl.value);
        if (priceMaxEl && priceMaxEl.value) config.priceMax = parseFloat(priceMaxEl.value);
        var picks = [];
        rows.forEach(function(row) {
          var cb = row.querySelector('.hp-spirit-cb');
          if (!cb) return;
          if (cb.checked) picks.push(cb.value);
        });
        config.picks = picks;
        if (configInput) configInput.value = JSON.stringify(config);
        markDirty();
      }

      // --- Row click to toggle ---
      rows.forEach(function(row) {
        var cb = row.querySelector('.hp-spirit-cb');
        row.addEventListener('click', function(e) {
          if (e.target === cb) return; // let checkbox handle itself
          if (cb) {
            cb.checked = !cb.checked;
            cb.dispatchEvent(new Event('change', { bubbles: true }));
          }
        });
        row.addEventListener('keydown', function(e) {
          if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            if (cb) {
              cb.checked = !cb.checked;
              cb.dispatchEvent(new Event('change', { bubbles: true }));
            }
          }
        });
        if (cb) cb.addEventListener('change', function() {
          if (cb.checked) row.classList.add('hp-row-picked');
          else row.classList.remove('hp-row-picked');
          updateCounts(); buildConfig(); updatePreview();
        });
      });

      // --- Event listeners ---
      if (priceMinEl) priceMinEl.addEventListener('input', applyFilters);
      if (priceMaxEl) priceMaxEl.addEventListener('input', applyFilters);
      if (searchEl) searchEl.addEventListener('input', applyFilters);
      if (labelEl) labelEl.addEventListener('input', function() { updatePreview(); buildConfig(); });
      if (discountEl) discountEl.addEventListener('input', function() { recomputePriceCells(); updatePreview(); buildConfig(); });

      // Cmd/Ctrl+S to save
      document.addEventListener('keydown', function(e) {
        if ((e.metaKey || e.ctrlKey) && e.key === 's') {
          var picker = document.getElementById('hp-picker');
          if (picker && saveForm) {
            e.preventDefault();
            saving = true;
            saveForm.submit();
          }
        }
      });

      // Warn on navigation if there are unsaved changes
      window.addEventListener('beforeunload', function(e) {
        if (!saving && dirtyBadge && dirtyBadge.classList.contains('is-dirty')) {
          e.preventDefault();
          e.returnValue = '';
        }
      });
      if (saveForm) saveForm.addEventListener('submit', function() { saving = true; });

      // Init
      recomputePriceCells();
      applyFilters();
      updatePreview();
      if (configInput) initialSnapshot = configInput.value;
    })();
    </script>
  `;
}

// ─── 7-Day Grid Dashboard ───
// Optional opts:
//   - locationSlug: if set, day cards link to that location's override editor and the
//     intro text reflects single-location editing.
//   - locationName: friendly name to show in the heading.
//   - locationOptions: when provided, renders a row of location tabs at the top.
function specialsDashboard(themes, user, flashMsg, opts = {}) {
  const themeMap = {};
  themes.forEach(t => { themeMap[t.dayOfWeek] = t; });

  const locationSlug = opts.locationSlug || '';
  const locationName = opts.locationName || '';
  const locSegment = locationSlug ? `/location/${locationSlug}` : '';
  const today = getTodayDayKey();

  // Stat strip totals
  let totalSpecials = 0;
  let activeThemes = 0;
  let featuredItems = 0;
  let daysWithSpecials = 0;
  themes.forEach((t) => {
    if (t.isActive) activeThemes += 1;
    const specials = t.specials || [];
    if (specials.length) daysWithSpecials += 1;
    totalSpecials += specials.length;
    featuredItems += specials.filter(s => s.isFeatured).length;
  });

  const stats = `
    <div class="sp-stat-strip">
      <div class="sp-stat"><strong>${activeThemes}</strong><span>Active themes</span></div>
      <div class="sp-stat"><strong>${totalSpecials}</strong><span>Specials this week</span></div>
      <div class="sp-stat"><strong>${featuredItems}</strong><span>Featured items</span></div>
      <div class="sp-stat"><strong>${daysWithSpecials}/7</strong><span>Days with content</span></div>
    </div>`;

  // Location tabs (segmented)
  const locationTabs = (opts.locationOptions && opts.locationOptions.length >= 1) ? `
    <div class="sp-tabs" role="tablist" aria-label="Location">
      <a href="/admin/specials" class="${!locationSlug ? 'is-active' : ''}" role="tab" aria-selected="${!locationSlug}">Company default</a>
      ${opts.locationOptions.map(l => `<a href="/admin/specials?location=${escAttr(l.slug)}" class="${l.slug === locationSlug ? 'is-active' : ''}" role="tab" aria-selected="${l.slug === locationSlug}">${escHTML(l.name)}</a>`).join('')}
    </div>` : '';

  // Day cards
  const grid = DAYS.map(day => {
    const theme = themeMap[day];
    const specials = theme && theme.specials ? theme.specials : [];
    const featured = specials.filter(s => s.isFeatured).length;
    const isToday = day === today;
    const isInactive = theme && !theme.isActive;
    const color = (theme && theme.themeColor) ? theme.themeColor : '';
    const styleVar = color ? `style="--day-color: ${escAttr(color)};"` : '';
    const cls = ['sp-day-card', isToday ? 'is-today' : '', isInactive ? 'is-inactive' : ''].filter(Boolean).join(' ');

    const themeLine = theme
      ? `<div class="sp-day-card-theme">${escHTML(theme.name)}</div>`
      : `<div class="sp-day-card-theme is-empty">No theme set</div>`;

    const taglineLine = theme && theme.tagline
      ? `<div class="sp-day-card-tagline">${escHTML(theme.tagline)}</div>`
      : '';

    const countPill = specials.length
      ? `<span class="sp-pill sp-pill-muted">${specials.length} special${specials.length === 1 ? '' : 's'}</span>`
      : `<span class="sp-pill sp-pill-amber">Empty</span>`;
    const featuredPill = featured > 0 ? `<span class="sp-pill sp-pill-gold">★ ${featured} featured</span>` : '';
    const inactivePill = isInactive ? `<span class="sp-pill sp-pill-muted">Inactive</span>` : '';

    return `
      <a href="/admin/specials/day/${day}${locSegment}" class="${cls}" ${styleVar}>
        <div class="sp-day-card-head">
          <span class="sp-day-card-day">${DAY_LABELS[day]}</span>
          ${isToday ? '<span class="sp-day-card-today-pip">Today</span>' : ''}
        </div>
        ${themeLine}
        ${taglineLine}
        <div class="sp-day-card-foot">
          ${countPill}
          ${featuredPill}
          ${inactivePill}
          <span class="grow"></span>
          <span aria-hidden="true">→</span>
        </div>
      </a>`;
  }).join('');

  const heading = locationSlug && locationName
    ? `Daily Specials — ${escHTML(locationName)}`
    : 'Daily Specials';

  const subtitle = locationSlug
    ? `Override the company default for ${escHTML(locationName || 'this location')} only where inventory, pricing, or promos differ.`
    : 'Company default schedule. Each location can override any day from its own tab.';

  return adminLayout('Daily Specials', `
    ${specialsStyles()}

    <div class="sp-hero">
      <div class="sp-hero-left">
        <div class="admin-kicker">Weekly programming</div>
        <h1>${heading}</h1>
        <div class="meta-line">${subtitle}</div>
      </div>
      <div class="sp-hero-actions">
        <div class="row">
          <a href="/admin/ltos${locationSlug ? `?location=${escAttr(locationSlug)}` : ''}" class="btn btn-secondary">Manage LTOs</a>
          ${locationSlug ? `<a href="/${escAttr(locationSlug)}/specials?day=${today}" target="_blank" rel="noopener" class="btn btn-primary">View public page →</a>` : ''}
        </div>
      </div>
    </div>

    ${stats}

    ${locationTabs}

    <div class="sp-day-grid">${grid}</div>
  `, user, { pathname: '/admin/specials', flashMsg });
}

// ─── Special form (shared between Add and Edit) ───
function renderSpecialForm({ s, day, actionUrl, mode, categoryOptions }) {
  const isEdit = mode === 'edit' && s;
  const prefix = isEdit ? `sp-img-${s.id}` : `sp-add-${day}`;
  const value = isEdit ? s : { name: '', price: '', description: '', detailText: '', section: '', badges: '', timeWindow: '', category: '', displayOrder: 0, imageUrl: '', isFeatured: false, isActive: true };
  const action = isEdit ? 'editSpecial' : 'addSpecial';
  const submitLabel = isEdit ? 'Save changes' : 'Add special';

  const badgesValue = String(value.badges || '');
  const activeBadgeSet = new Set(badgesValue.split(',').map(s => s.trim()).filter(Boolean));
  const presetChips = BADGE_PRESETS.map(b => {
    const on = activeBadgeSet.has(b);
    return `<button type="button" class="sp-chip ${on ? 'is-on' : ''}" data-chip-badge="${escAttr(b)}">${escHTML(b)}</button>`;
  }).join('');

  const twValue = String(value.timeWindow || '');
  const timeChips = TIME_WINDOW_PRESETS.map(t => {
    const on = twValue === t;
    return `<button type="button" class="sp-chip ${on ? 'is-on' : ''}" data-chip-time="${escAttr(t)}">${escHTML(t)}</button>`;
  }).join('');
  const clearTimeChip = twValue ? `<button type="button" class="sp-chip sp-chip-clear" data-chip-time-clear="1">Clear</button>` : '';

  const featuredChecked = value.isFeatured ? 'checked' : '';

  return `
    <form method="POST" action="${actionUrl}" class="sp-form-grouped" data-special-form="${isEdit ? 'edit-' + escAttr(s.id) : 'add'}">
      <input type="hidden" name="_action" value="${action}" />
      ${isEdit ? `<input type="hidden" name="specialId" value="${escAttr(s.id)}" />` : ''}

      <fieldset>
        <legend>Basics</legend>
        <div class="sp-form-row">
          <div><label>Name</label><input type="text" name="specialName" value="${escAttr(value.name)}" required placeholder="e.g. Well Cocktails" /></div>
          <div><label>Section</label><input type="text" name="specialSection" value="${escAttr(value.section)}" placeholder="e.g. $8 Cocktails" /></div>
        </div>
        <div class="sp-form-block">
          <label>Description</label>
          <input type="text" name="specialDescription" value="${escAttr(value.description)}" placeholder="Short, scannable description" />
        </div>
        <div class="sp-form-block">
          <label>Detail text</label>
          <textarea name="specialDetailText" placeholder="Longer sell copy / tasting notes">${escHTML(value.detailText || '')}</textarea>
        </div>
      </fieldset>

      <fieldset>
        <legend>Pricing &amp; timing</legend>
        <div class="sp-form-row">
          <div><label>Price</label><input type="text" name="specialPrice" value="${escAttr(value.price)}" placeholder="e.g. $5, 50% off" /></div>
          <div><label>Category</label><select name="specialCategory">${buildCategoryOptions(value.category, categoryOptions)}</select></div>
        </div>
        <div class="sp-form-block">
          <label>Time window</label>
          <input type="text" name="specialTimeWindow" value="${escAttr(twValue)}" placeholder="e.g. Until 7 PM" data-time-input />
          <div class="sp-chips">${timeChips}${clearTimeChip}</div>
        </div>
      </fieldset>

      <fieldset>
        <legend>Visuals</legend>
        <div class="sp-form-block">
          <label>Image</label>
          ${imageUploadWidget({ name: 'specialImageUrl', prefix: prefix, value: value.imageUrl || '' })}
        </div>
        <div class="sp-form-block">
          <label>Badges</label>
          <input type="text" name="specialBadges" value="${escAttr(badgesValue)}" placeholder="Comma-separated, e.g. New, Staff Pick" data-badge-input />
          <div class="sp-chips">${presetChips}</div>
        </div>
        <div class="sp-form-block">
          <label class="sp-toggle">
            <input type="checkbox" name="specialFeatured" ${featuredChecked} />
            <span class="track"></span>
            <span>Featured (gold highlight on public page)</span>
          </label>
        </div>
      </fieldset>

      <fieldset>
        <legend>Display</legend>
        <div class="sp-form-block">
          <label>Order</label>
          <input type="number" name="specialOrder" value="${Number.isFinite(value.displayOrder) ? value.displayOrder : 0}" />
        </div>
      </fieldset>

      <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:14px;">
        ${isEdit ? `<button type="button" class="btn btn-secondary btn-sm" data-cancel-edit="${escAttr(s.id)}">Cancel</button>` : ''}
        <button type="submit" class="btn btn-primary ${isEdit ? 'btn-sm' : ''}">${submitLabel}</button>
      </div>
    </form>`;
}

// ─── Single special row (card + inline edit drawer) ───
function renderSpecialCard(s, i, total, actionUrl, day, categoryOptions) {
  const featured = !!s.isFeatured;
  const inactive = s.isActive === false;
  const cls = ['sp-item', featured ? 'is-featured' : '', inactive ? 'is-inactive' : ''].filter(Boolean).join(' ');
  const thumbStyle = s.imageUrl ? `style="--bg-img: url('${escAttr(s.imageUrl)}');"` : '';
  const thumbClass = s.imageUrl ? 'sp-thumb has-img' : 'sp-thumb';

  const badgeList = String(s.badges || '').split(',').map(b => b.trim()).filter(Boolean);

  const tags = [
    featured ? '<span class="sp-pill sp-pill-gold">★ Featured</span>' : '',
    s.category ? `<span class="sp-pill sp-pill-muted">${escHTML(s.category)}</span>` : '',
    s.section ? `<span class="sp-pill sp-pill-copper">${escHTML(s.section)}</span>` : '',
    s.timeWindow ? `<span class="sp-pill sp-pill-amber">⏱ ${escHTML(s.timeWindow)}</span>` : '',
    ...badgeList.map(b => `<span class="sp-pill sp-pill-gold">${escHTML(b)}</span>`),
  ].filter(Boolean).join('');

  return `
    <div class="${cls}" id="special-${escAttr(s.id)}" data-special-id="${escAttr(s.id)}" data-special-name="${escAttr(s.name)}" draggable="true">
      <div class="sp-drag" title="Drag to reorder" aria-label="Drag to reorder">⋮⋮</div>
      <div class="${thumbClass}" ${thumbStyle}>${s.imageUrl ? '' : '<span aria-hidden="true">🍸</span>'}</div>
      <div class="sp-body">
        <div class="sp-body-row1">
          <label class="sp-toggle" title="Select for bulk actions" style="margin-right:6px;">
            <input type="checkbox" class="sp-bulk-cb" data-bulk-cb value="${escAttr(s.id)}" />
          </label>
          <span class="sp-body-name">${escHTML(s.name)}</span>
          ${s.price ? `<span class="sp-body-price">${escHTML(s.price)}</span>` : ''}
          <span class="sp-body-order-badge" data-order-badge>#${i + 1}</span>
        </div>
        ${s.description ? `<div class="sp-body-desc">${escHTML(s.description)}</div>` : ''}
        ${tags ? `<div class="sp-body-tags">${tags}</div>` : ''}
      </div>
      <div class="sp-actions">
        <button type="button" class="icon-btn" data-toggle-edit="${escAttr(s.id)}" title="Edit" aria-label="Edit">✎</button>
        <form method="POST" action="${actionUrl}" style="margin:0;">
          <input type="hidden" name="_action" value="duplicateSpecial" />
          <input type="hidden" name="specialId" value="${escAttr(s.id)}" />
          <button type="submit" class="icon-btn" title="Duplicate" aria-label="Duplicate">⧉</button>
        </form>
        <button type="button" class="icon-btn is-danger" data-soft-delete="${escAttr(s.id)}" data-name="${escAttr(s.name)}" title="Delete" aria-label="Delete">✕</button>
      </div>
    </div>
    <div class="sp-edit-drawer" id="edit-${escAttr(s.id)}">
      ${renderSpecialForm({ s, day, actionUrl, mode: 'edit', categoryOptions })}
    </div>`;
}

// ─── Live preview rail (mini guest-facing render) ───
function renderLivePreview(day, theme, specials) {
  if (!theme) {
    return `<div class="sp-preview-card">
      <div class="preview-head"><h2>Live preview</h2></div>
      <div class="sp-preview-frame">
        <div class="pv-empty">Save a theme to see what guests will see.</div>
      </div>
    </div>`;
  }
  const themeColor = theme.themeColor || '#f0c766';

  // Group specials by section, keep display order within each group.
  const groups = [];
  const map = new Map();
  (specials || []).filter(s => s.isActive !== false).forEach((s) => {
    const sec = (s.section || '').trim() || 'Specials';
    if (!map.has(sec)) {
      const g = { name: sec, items: [] };
      map.set(sec, g);
      groups.push(g);
    }
    map.get(sec).items.push(s);
  });

  const groupHtml = groups.length === 0
    ? '<div class="pv-empty">No specials yet.</div>'
    : groups.map(g => `
      <div class="pv-section">
        <div class="pv-section-head" style="color:${escAttr(themeColor)};">${escHTML(g.name)}</div>
        ${g.items.map(it => `
          <div class="pv-item ${it.isFeatured ? 'is-featured' : ''}">
            ${it.price ? `<span class="pv-item-price">${escHTML(it.price)}</span>` : ''}
            <div class="pv-item-name">${escHTML(it.name)}${it.isFeatured ? '<span class="star">★</span>' : ''}</div>
            ${it.description ? `<div class="pv-item-desc">${escHTML(it.description)}</div>` : ''}
          </div>
        `).join('')}
      </div>`).join('');

  return `
    <div class="sp-preview-card">
      <div class="preview-head">
        <h2>Live preview</h2>
        <span class="aside" style="color:var(--text-muted); font-size:0.72rem;">how guests see it</span>
      </div>
      <div class="sp-preview-frame">
        <div class="pv-day">${DAY_LABELS[day] || day}</div>
        <div class="pv-title" style="color:${escAttr(themeColor)};">${escHTML(theme.name)}</div>
        ${theme.tagline ? `<div class="pv-tagline">${escHTML(theme.tagline)}</div>` : ''}
        ${groupHtml}
      </div>
    </div>`;
}

// ─── Day Theme Editor ───
function dayThemeEditor(day, theme, specials, locations, locationSlug, user, message, categoryOptions = [], flashMsg, spiritCatalog = [], spiritCategories = {}, halfPriceTheme = null, opts = {}) {
  const isOverride = !!locationSlug;
  const loc = locationSlug ? locations.find(l => l.slug === locationSlug) : null;
  const showCompanyDefault = opts.showCompanyDefault !== false;
  const today = getTodayDayKey();
  const isToday = day === today;

  const actionUrl = `/admin/specials/day/${day}${isOverride ? `/location/${locationSlug}` : ''}`;
  const themeColor = theme && theme.themeColor ? theme.themeColor : '#f0c766';
  const heroStyle = theme && theme.themeColor ? `style="--theme-color: ${escAttr(themeColor)};"` : '';

  // Public-page URL — only meaningful when we have a location context.
  const publicUrl = locationSlug ? `/${escAttr(locationSlug)}/specials?day=${day}` : '';

  // Override tabs (segmented)
  const overrideTabs = locations.length > 0 ? `
    <div class="sp-tabs" role="tablist" aria-label="Location override">
      ${showCompanyDefault ? `<a href="/admin/specials/day/${day}" class="${!isOverride ? 'is-active' : ''}" role="tab" aria-selected="${!isOverride}">Company default</a>` : ''}
      ${locations.map(l => `<a href="/admin/specials/day/${day}/location/${l.slug}" class="${locationSlug === l.slug ? 'is-active' : ''}" role="tab" aria-selected="${locationSlug === l.slug}">${escHTML(l.name)}</a>`).join('')}
    </div>
  ` : '';

  // ===== Theme card =====
  const themeCard = `
    <div class="sp-card">
      <div class="sp-card-head">
        <h2>Theme details</h2>
        <span class="aside">${isOverride ? 'Override for this location' : 'Company default — shown on every location'}</span>
      </div>
      <form method="POST" action="${actionUrl}" data-autosave="special-theme-${day}${isOverride ? '-' + escAttr(locationSlug) : '-default'}">
        <input type="hidden" name="_action" value="saveTheme" />
        <div class="sp-form-row">
          <div><label>Theme name</label><input type="text" name="name" value="${escAttr(theme ? theme.name : '')}" required placeholder="e.g. Industry Night" /></div>
          <div><label>Tagline</label><input type="text" name="tagline" value="${escAttr(theme ? theme.tagline : '')}" placeholder="e.g. We take care of our own" /></div>
        </div>
        <div class="sp-form-block">
          <label>Description</label>
          <textarea name="description" placeholder="Optional longer description">${escHTML(theme && theme.description ? theme.description : '')}</textarea>
        </div>
        <div class="sp-form-block">
          <label>Theme color <span style="font-weight:600; color:var(--text-soft); text-transform:none; letter-spacing:0;">(tints the public page header)</span></label>
          <div class="sp-color-row">
            <div class="sp-color-swatch" style="background:${escAttr(themeColor)};" data-color-swatch>
              <input type="color" name="themeColor" value="${escAttr(themeColor)}" data-color-input />
            </div>
            <span class="hex" data-color-hex>${escHTML(themeColor)}</span>
          </div>
        </div>
        <div class="sp-form-block">
          <label class="sp-toggle">
            <input type="checkbox" name="isActive" ${!theme || theme.isActive ? 'checked' : ''} />
            <span class="track"></span>
            <span>${theme ? 'Active' : 'Active on save'}</span>
          </label>
        </div>
        <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:14px;">
          ${theme ? `<button type="submit" name="_action" value="deleteTheme" class="btn btn-danger" onclick="return confirm('Delete this theme and all its specials? This cannot be undone.')">Delete theme</button>` : ''}
          <button type="submit" class="btn btn-primary">Save theme</button>
        </div>
      </form>
    </div>`;

  // ===== Sunday bottles helper card =====
  const sundayBottlesCard = (day === 'SUNDAY' && theme) ? `
    <div class="sp-card">
      <div class="sp-card-head"><h2>Break-even bottles</h2><span class="aside">Managed in Bartender Dashboard</span></div>
      <p style="color:var(--text-muted); line-height:1.55; margin:0 0 10px;">Sunday bottles are managed through the <strong style="color:var(--text);">Bartender Dashboard</strong>. To update this week's bottles:</p>
      <ol style="color:var(--text); line-height:1.7; padding-left:20px; margin:0 0 12px;">
        <li>Log in to the <a href="https://bartender.apps.dramanddraught.com" target="_blank" rel="noopener" style="color:var(--gold-strong);">Bartender Dashboard</a></li>
        <li>Go to <strong>Break Even Bottles</strong> in the sidebar</li>
        <li>Select the location and set this week's bottles</li>
        <li>Mark them as <strong>Active</strong> — they'll appear on the public page automatically</li>
      </ol>
    </div>` : '';

  // ===== Specials list + add-special panel =====
  const specialsListHtml = theme ? (specials || []).map((s, i) => renderSpecialCard(s, i, (specials || []).length, actionUrl, day, categoryOptions)).join('') : '';

  const featuredCount = (specials || []).filter(s => s.isFeatured).length;
  const activeCount = (specials || []).filter(s => s.isActive !== false).length;

  const specialsCard = theme ? `
    <div class="sp-card">
      <div class="sp-card-head">
        <h2>Specials</h2>
        <span class="aside">
          <span class="sp-pill sp-pill-muted">${(specials || []).length} total</span>
          ${featuredCount ? `<span class="sp-pill sp-pill-gold" style="margin-left:6px;">★ ${featuredCount} featured</span>` : ''}
          <span class="sp-reorder-status" data-reorder-status></span>
        </span>
      </div>

      ${specialsListHtml ? `
        <div id="specialsList" class="sp-list" data-action-url="${escAttr(actionUrl)}">${specialsListHtml}</div>
      ` : `<div class="sp-list" id="specialsList" data-action-url="${escAttr(actionUrl)}"><p style="color:var(--text-muted); font-style:italic; padding:14px 4px;">No specials yet. Add one below.</p></div>`}

      <!-- Hidden forms used by JS for autosave reorder + bulk actions -->
      <form id="reorderForm" method="POST" action="${actionUrl}" style="display:none;">
        <input type="hidden" name="_action" value="reorderSpecials" />
        <input type="hidden" name="specialOrderPayload" id="specialOrderPayload" value="" />
      </form>
      <form id="bulkCategoryForm" method="POST" action="${actionUrl}" style="display:none;">
        <input type="hidden" name="_action" value="setSpecialCategoryBulk" />
        <input type="hidden" name="specialCategory" id="bulkCategoryValue" value="" />
      </form>

      <details class="sp-card" style="margin-top:14px; background: rgba(255,255,255,0.025);" data-add-panel>
        <summary style="cursor:pointer; list-style:none; padding:4px 0; font-weight:800; color:var(--gold-strong); display:inline-flex; align-items:center; gap:6px;">
          <span aria-hidden="true">＋</span> Add a new special
        </summary>
        <div style="margin-top:12px;">
          ${renderSpecialForm({ s: null, day, actionUrl, mode: 'add', categoryOptions })}
        </div>
      </details>
    </div>` : '';

  // ===== Bulk action floating bar =====
  const bulkBarHtml = `
    <div class="sp-bulk-bar" id="spBulkBar">
      <span class="count" data-bulk-count>0 selected</span>
      <span style="color:var(--text-muted);">|</span>
      <label style="font-size:0.78rem; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.06em;">Apply category</label>
      <select id="bulkCategorySelect">${buildCategoryOptions('', categoryOptions)}</select>
      <button type="button" class="btn btn-primary btn-sm" id="bulkCategoryApply">Apply</button>
      <button type="button" class="btn btn-secondary btn-sm" id="bulkClear">Clear selection</button>
    </div>`;

  // ===== Right rail =====
  const halfPriceBlock = isOverride && (halfPriceTheme || theme) ? renderHalfPricePicker(day, halfPriceTheme || theme, actionUrl, spiritCatalog, spiritCategories) : '';
  const halfPriceHint = !isOverride ? `
    <div class="sp-card" style="background: rgba(240,199,102,0.06); border-color: rgba(240,199,102,0.25);">
      <div class="sp-card-head"><h2>Discounted spirits</h2></div>
      <p style="color:var(--text-muted); line-height:1.55; margin:0;">
        Configured per location (inventory and pricing differ). Pick a location tab above to set up half-price spirits for this day.
      </p>
    </div>` : '';

  const statsCard = theme ? `
    <div class="sp-card">
      <div class="sp-card-head"><h2>This day</h2></div>
      <div class="sp-stat-strip" style="margin-bottom:0;">
        <div class="sp-stat"><strong>${(specials || []).length}</strong><span>Specials</span></div>
        <div class="sp-stat"><strong>${activeCount}</strong><span>Active</span></div>
        <div class="sp-stat"><strong>${featuredCount}</strong><span>Featured</span></div>
      </div>
    </div>` : '';

  // ===== Hero =====
  const heroHtml = `
    <div class="sp-hero ${theme && theme.themeColor ? 'has-theme-color' : ''}" ${heroStyle}>
      <div class="sp-hero-left">
        <div class="admin-kicker">${isOverride && loc ? escHTML(loc.name) : 'Company default'}${isToday ? ' · Today' : ''}</div>
        <h1>
          ${theme && theme.themeColor ? `<span class="theme-swatch" style="background:${escAttr(themeColor)};" aria-hidden="true"></span>` : ''}
          ${DAY_LABELS[day]}${theme ? ` — ${escHTML(theme.name)}` : ' — No theme yet'}
        </h1>
        ${theme && theme.tagline ? `<div class="sp-hero-tagline">“${escHTML(theme.tagline)}”</div>` : ''}
        <div class="meta-line" style="margin-top:8px;">
          ${theme ? (theme.isActive ? '<span class="sp-pill sp-pill-green">Active</span>' : '<span class="sp-pill sp-pill-muted">Inactive</span>') : '<span class="sp-pill sp-pill-amber">Needs setup</span>'}
          <span class="dot">·</span>
          <span>${(specials || []).length} special${(specials || []).length === 1 ? '' : 's'}</span>
          ${featuredCount ? `<span class="dot">·</span><span>★ ${featuredCount} featured</span>` : ''}
        </div>
        <div class="sp-shortcut-hint">
          Shortcuts: <span class="sp-kbd">N</span> add special · <span class="sp-kbd">/</span> back to week
        </div>
      </div>
      <div class="sp-hero-actions">
        <div class="row">
          <a href="/admin/specials${locationSlug ? `?location=${escAttr(locationSlug)}` : ''}" class="btn btn-secondary">← Weekly view</a>
          ${publicUrl ? `<a href="${publicUrl}" target="_blank" rel="noopener" class="btn btn-primary">View public page →</a>` : ''}
        </div>
      </div>
    </div>`;

  // ===== Final assembly =====
  return adminLayout(`${DAY_LABELS[day]} Theme`, `
    ${specialsStyles()}
    ${heroHtml}
    ${message ? `<div class="alert ${message.type === 'error' ? 'alert-error' : 'alert-success'}">${escHTML(message.text)}</div>` : ''}
    ${overrideTabs}

    <div class="sp-grid">
      <div class="sp-main">
        ${themeCard}
        ${specialsCard}
        ${halfPriceBlock}
        ${sundayBottlesCard}
      </div>
      <aside class="sp-rail">
        ${statsCard}
        ${renderLivePreview(day, theme, specials)}
        ${halfPriceHint}
      </aside>
    </div>

    ${bulkBarHtml}
    <div class="sp-toast-stack" id="spToastStack" aria-live="polite"></div>

    <script>
      (function () {
        var listEl = document.getElementById('specialsList');
        var reorderForm = document.getElementById('reorderForm');
        var orderPayloadEl = document.getElementById('specialOrderPayload');
        var reorderStatusEl = document.querySelector('[data-reorder-status]');
        var bulkBar = document.getElementById('spBulkBar');
        var bulkCountEl = document.querySelector('[data-bulk-count]');
        var bulkClearBtn = document.getElementById('bulkClear');
        var bulkApplyBtn = document.getElementById('bulkCategoryApply');
        var bulkCategorySelect = document.getElementById('bulkCategorySelect');
        var bulkCategoryForm = document.getElementById('bulkCategoryForm');
        var bulkCategoryHidden = document.getElementById('bulkCategoryValue');
        var actionUrl = listEl ? listEl.getAttribute('data-action-url') : '';

        // ---------- helpers ----------
        function setReorderStatus(text, cls) {
          if (!reorderStatusEl) return;
          reorderStatusEl.textContent = text;
          reorderStatusEl.className = 'sp-reorder-status is-visible ' + (cls || '');
          if (!text) reorderStatusEl.className = 'sp-reorder-status';
        }
        function refreshOrderBadges() {
          if (!listEl) return;
          var items = Array.from(listEl.querySelectorAll('.sp-item'));
          items.forEach(function (item, idx) {
            var badge = item.querySelector('[data-order-badge]');
            if (badge) badge.textContent = '#' + (idx + 1);
          });
          if (orderPayloadEl) {
            orderPayloadEl.value = JSON.stringify(items.map(function (i) { return i.getAttribute('data-special-id'); }).filter(Boolean));
          }
        }
        function autosaveReorder() {
          if (!reorderForm || !orderPayloadEl || !actionUrl) return;
          setReorderStatus('Saving order…', 'is-saving');
          var body = new URLSearchParams();
          body.set('_action', 'reorderSpecials');
          body.set('specialOrderPayload', orderPayloadEl.value);
          fetch(reorderForm.action, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString(),
            credentials: 'same-origin',
            redirect: 'manual',
          }).then(function () {
            setReorderStatus('Order saved ✓', 'is-saved');
            setTimeout(function () { setReorderStatus('', ''); }, 1800);
          }).catch(function () {
            setReorderStatus('Save failed — refresh', 'is-error');
          });
        }

        // ---------- drag and drop ----------
        if (listEl) {
          var dragged = null;
          listEl.addEventListener('dragstart', function (e) {
            var card = e.target.closest('.sp-item');
            if (!card) return;
            dragged = card;
            card.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
            try { e.dataTransfer.setData('text/plain', card.getAttribute('data-special-id') || ''); } catch (_) {}
          });
          listEl.addEventListener('dragend', function (e) {
            var card = e.target.closest('.sp-item');
            if (card) card.classList.remove('dragging');
            if (dragged) {
              refreshOrderBadges();
              autosaveReorder();
              dragged = null;
            }
          });
          listEl.addEventListener('dragover', function (e) {
            if (!dragged) return;
            var target = e.target.closest('.sp-item');
            if (!target || target === dragged) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            var bounds = target.getBoundingClientRect();
            var below = (e.clientY - bounds.top) > bounds.height / 2;
            listEl.insertBefore(dragged, below ? target.nextSibling : target);
          });
        }
        refreshOrderBadges();

        // ---------- inline edit drawer toggle ----------
        document.addEventListener('click', function (e) {
          var toggle = e.target.closest('[data-toggle-edit]');
          if (toggle) {
            var id = toggle.getAttribute('data-toggle-edit');
            var drawer = document.getElementById('edit-' + id);
            var card = document.getElementById('special-' + id);
            if (drawer) {
              var open = !drawer.classList.contains('is-open');
              drawer.classList.toggle('is-open', open);
              if (card) card.classList.toggle('has-open-edit', open);
            }
            return;
          }
          var cancel = e.target.closest('[data-cancel-edit]');
          if (cancel) {
            var cid = cancel.getAttribute('data-cancel-edit');
            var dr = document.getElementById('edit-' + cid);
            var c = document.getElementById('special-' + cid);
            if (dr) dr.classList.remove('is-open');
            if (c) c.classList.remove('has-open-edit');
            return;
          }
        });

        // ---------- chip pickers (badges, time-window) ----------
        document.addEventListener('click', function (e) {
          var badgeChip = e.target.closest('[data-chip-badge]');
          if (badgeChip) {
            var form = badgeChip.closest('form');
            var input = form ? form.querySelector('[data-badge-input]') : null;
            if (!input) return;
            var label = badgeChip.getAttribute('data-chip-badge');
            var arr = input.value.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
            var idx = arr.indexOf(label);
            if (idx >= 0) arr.splice(idx, 1); else arr.push(label);
            input.value = arr.join(', ');
            badgeChip.classList.toggle('is-on');
            return;
          }
          var timeChip = e.target.closest('[data-chip-time]');
          if (timeChip) {
            var form2 = timeChip.closest('form');
            var ti = form2 ? form2.querySelector('[data-time-input]') : null;
            if (!ti) return;
            var current = ti.value.trim();
            var label2 = timeChip.getAttribute('data-chip-time');
            ti.value = (current === label2) ? '' : label2;
            form2.querySelectorAll('[data-chip-time]').forEach(function (c) { c.classList.toggle('is-on', c === timeChip && ti.value === label2); });
            return;
          }
          var timeClear = e.target.closest('[data-chip-time-clear]');
          if (timeClear) {
            var form3 = timeClear.closest('form');
            var ti2 = form3 ? form3.querySelector('[data-time-input]') : null;
            if (ti2) ti2.value = '';
            if (form3) form3.querySelectorAll('[data-chip-time]').forEach(function (c) { c.classList.remove('is-on'); });
            return;
          }
        });

        // ---------- theme color swatch hex display ----------
        document.querySelectorAll('[data-color-input]').forEach(function (input) {
          var swatch = input.closest('[data-color-swatch]');
          var hex = input.closest('form').querySelector('[data-color-hex]');
          input.addEventListener('input', function () {
            if (swatch) swatch.style.background = input.value;
            if (hex) hex.textContent = input.value;
          });
        });

        // ---------- bulk selection ----------
        function refreshBulkBar() {
          var checked = Array.from(document.querySelectorAll('[data-bulk-cb]:checked'));
          if (!bulkCountEl || !bulkBar) return;
          if (checked.length > 0) {
            bulkBar.classList.add('is-visible');
            bulkCountEl.textContent = checked.length + ' selected';
          } else {
            bulkBar.classList.remove('is-visible');
          }
        }
        document.addEventListener('change', function (e) {
          if (e.target.matches && e.target.matches('[data-bulk-cb]')) refreshBulkBar();
        });
        if (bulkClearBtn) bulkClearBtn.addEventListener('click', function () {
          document.querySelectorAll('[data-bulk-cb]:checked').forEach(function (cb) { cb.checked = false; });
          refreshBulkBar();
        });
        if (bulkApplyBtn) bulkApplyBtn.addEventListener('click', function () {
          if (!bulkCategoryForm || !bulkCategoryHidden || !bulkCategorySelect) return;
          bulkCategoryHidden.value = bulkCategorySelect.value;
          Array.from(bulkCategoryForm.querySelectorAll('input[name="specialIds"]')).forEach(function (n) { n.remove(); });
          var checked = Array.from(document.querySelectorAll('[data-bulk-cb]:checked'));
          if (!checked.length) return;
          checked.forEach(function (cb) {
            var h = document.createElement('input');
            h.type = 'hidden';
            h.name = 'specialIds';
            h.value = cb.value;
            bulkCategoryForm.appendChild(h);
          });
          bulkCategoryForm.submit();
        });

        // ---------- soft delete with undo toast ----------
        function showToast(message, onUndo, holdMs) {
          var stack = document.getElementById('spToastStack');
          if (!stack) return null;
          var toast = document.createElement('div');
          toast.className = 'sp-toast';
          var span = document.createElement('span');
          span.textContent = message;
          toast.appendChild(span);
          var btn = document.createElement('button');
          btn.type = 'button';
          btn.textContent = 'Undo';
          toast.appendChild(btn);
          stack.appendChild(toast);
          var commit = setTimeout(function () {
            if (toast.parentNode) toast.parentNode.removeChild(toast);
          }, holdMs || 5500);
          btn.addEventListener('click', function () {
            clearTimeout(commit);
            if (toast.parentNode) toast.parentNode.removeChild(toast);
            if (typeof onUndo === 'function') onUndo();
          });
          return toast;
        }

        document.addEventListener('click', function (e) {
          var del = e.target.closest('[data-soft-delete]');
          if (!del) return;
          var id = del.getAttribute('data-soft-delete');
          var name = del.getAttribute('data-name') || 'this special';
          var card = document.getElementById('special-' + id);
          var drawer = document.getElementById('edit-' + id);
          if (!card || !actionUrl) return;
          card.style.display = 'none';
          if (drawer) drawer.style.display = 'none';
          refreshOrderBadges();
          var undone = false;
          showToast('Deleted "' + name + '"', function undo() {
            undone = true;
            card.style.display = '';
            if (drawer) drawer.style.display = '';
            refreshOrderBadges();
          });
          setTimeout(function () {
            if (undone) return;
            var body = new URLSearchParams();
            body.set('_action', 'deleteSpecial');
            body.set('specialId', id);
            fetch(actionUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: body.toString(),
              credentials: 'same-origin',
              redirect: 'manual',
            }).then(function () {
              if (card.parentNode) card.parentNode.removeChild(card);
              if (drawer && drawer.parentNode) drawer.parentNode.removeChild(drawer);
            }).catch(function () {
              card.style.display = '';
              if (drawer) drawer.style.display = '';
              setReorderStatus('Delete failed — refresh', 'is-error');
            });
          }, 5400);
        });

        // ---------- keyboard shortcuts ----------
        document.addEventListener('keydown', function (e) {
          var tag = (e.target && e.target.tagName) || '';
          if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target && e.target.isContentEditable)) return;
          if (e.metaKey || e.ctrlKey || e.altKey) return;
          var k = e.key.toLowerCase();
          if (k === 'n') {
            var panel = document.querySelector('[data-add-panel]');
            if (panel) {
              e.preventDefault();
              panel.open = true;
              var first = panel.querySelector('input[name="specialName"]');
              if (first) first.focus();
            }
          } else if (k === '/') {
            e.preventDefault();
            window.location.href = '/admin/specials';
          }
        });

        ${imageUploadWidgetScript()}
      })();
    </script>
    <style>${imageUploadWidgetCss()}</style>
  `, user, { pathname: '/admin/specials', flashMsg });
}

function buildFlightNewUrl(month, year, locationSlug = '', copyFromId = '') {
  const params = new URLSearchParams();
  if (month) params.set('month', String(month));
  if (year) params.set('year', String(year));
  if (locationSlug) params.set('location', String(locationSlug));
  if (copyFromId) params.set('copyFrom', String(copyFromId));
  const query = params.toString();
  return `/admin/flights/new${query ? `?${query}` : ''}`;
}

function getFlightScopeLabel(flight) {
  return flight && flight.location ? flight.location.name : 'Company Default';
}

function getFlightScopeSlug(flight) {
  return flight && flight.location ? String(flight.location.slug || '') : '';
}

// ─── Flights List ───
function flightsList(flights, locations, user, flashMsg) {
  const groups = new Map();
  (flights || []).forEach((flight) => {
    const key = `${flight.year}-${flight.month}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(flight);
  });

  const rows = Array.from(groups.values()).map((entries) => {
    const variants = [...entries];
    const sample = variants[0];
    const companyDefault = variants.find((entry) => !entry.locationId) || null;
    const overrides = variants.filter((entry) => !!entry.locationId);
    const manageTarget = companyDefault || overrides[0] || null;
    const missingLocations = (locations || []).filter((location) => !overrides.some((entry) => entry.locationId === location.id));

    const defaultCell = companyDefault
      ? `
        <div><a href="/admin/flights/${companyDefault.id}">${escHTML(companyDefault.theme)}</a></div>
        <div style="color:#888; font-size:0.9rem; margin-top:4px">
          ${escHTML(companyDefault.price || 'Price not set')} • ${companyDefault.pours.length} pour${companyDefault.pours.length !== 1 ? 's' : ''}
          <span class="tag ${companyDefault.isActive ? 'tag-active' : 'tag-inactive'}" style="margin-left:8px">${companyDefault.isActive ? 'Active' : 'Inactive'}</span>
        </div>
      `
      : `
        <div style="color:#888">No company default yet.</div>
        <div style="margin-top:8px">
          <a href="${buildFlightNewUrl(sample.month, sample.year, '', manageTarget ? manageTarget.id : '')}" class="btn btn-secondary btn-sm">Create Shared Default</a>
        </div>
      `;

    const overridesCell = overrides.length > 0
      ? `
        <div style="display:flex; gap:8px; flex-wrap:wrap">
          ${overrides.map((entry) => `
            <a href="/admin/flights/${entry.id}" class="btn btn-secondary btn-sm">${escHTML(getFlightScopeLabel(entry))}</a>
          `).join('')}
        </div>
        ${companyDefault && missingLocations.length > 0 ? `
          <div style="color:#888; font-size:0.85rem; margin-top:8px">
            ${missingLocations.length} location${missingLocations.length !== 1 ? 's' : ''} still use the company default.
          </div>
        ` : ''}
      `
      : `
        <div style="color:#888">No location overrides. All locations use the company default.</div>
        ${companyDefault && missingLocations.length > 0 ? `
          <div style="margin-top:8px; display:flex; gap:8px; flex-wrap:wrap">
            ${missingLocations.slice(0, 3).map((location) => `
              <a href="${buildFlightNewUrl(sample.month, sample.year, location.slug, companyDefault.id)}" class="btn btn-secondary btn-sm">Override ${escHTML(location.name)}</a>
            `).join('')}
            ${missingLocations.length > 3 ? `<span style="color:#888; font-size:0.85rem">+${missingLocations.length - 3} more in editor</span>` : ''}
          </div>
        ` : ''}
      `;

    return `
      <tr>
        <td>${MONTHS[sample.month]} ${sample.year}</td>
        <td>${defaultCell}</td>
        <td>${overridesCell}</td>
        <td>${manageTarget ? `<a href="/admin/flights/${manageTarget.id}" class="btn btn-secondary btn-sm">Manage</a>` : `<a href="${buildFlightNewUrl(sample.month, sample.year)}" class="btn btn-secondary btn-sm">Create</a>`}</td>
      </tr>
    `;
  }).join('');

  return adminLayout('Flights', `
    <div class="page-header">
      <div>
        <div class="admin-kicker">Monthly flight builder</div>
        <h1>Tasting Flights</h1>
        <p class="page-subtitle">Set a company default for the month, then create location overrides only when a bar needs a different lineup.</p>
      </div>
      <a href="/admin/flights/new" class="btn btn-primary">New Flight</a>
    </div>
    ${flights.length === 0 ? '<div class="empty-state">No flights yet. Create one to get started.</div>' : `
      <table>
        <thead><tr><th>Month</th><th>Company Default</th><th>Location Overrides</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `}
  `, user, { pathname: '/admin/flights', flashMsg });
}

// ─── Flight Editor ───
function flightEditor(flight, isNew, user, message, flashMsg, options = {}) {
  const locations = options.locations || [];
  const relatedFlights = options.relatedFlights || [];
  const selectedLocationSlug = options.selectedLocationSlug || getFlightScopeSlug(flight);
  const selectedLocation = selectedLocationSlug ? locations.find((location) => location.slug === selectedLocationSlug) : null;
  const pours = flight && Array.isArray(flight.pours) ? [...flight.pours].sort((a, b) => a.displayOrder - b.displayOrder) : [];
  const now = new Date();
  const defaultMonth = flight ? flight.month : now.getMonth() + 1;
  const defaultYear = flight ? flight.year : now.getFullYear();
  const companyDefault = relatedFlights.find((entry) => !entry.locationId) || null;
  const currentScopeSlug = selectedLocation ? selectedLocation.slug : getFlightScopeSlug(flight);
  const isOverride = !!currentScopeSlug;
  const copySource = options.copySource || null;
  const copySourceId = isNew ? (copySource ? copySource.id : '') : (flight ? flight.id : '');

  const monthOptions = Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}" ${defaultMonth === i + 1 ? 'selected' : ''}>${MONTHS[i + 1]}</option>`).join('');
  const yearOptions = Array.from({ length: 3 }, (_, i) => {
    const y = now.getFullYear() + i - 1;
    return `<option value="${y}" ${defaultYear === y ? 'selected' : ''}>${y}</option>`;
  }).join('');

  const scopeOptions = [
    `<option value=""${!selectedLocation ? ' selected' : ''}>Company Default</option>`,
    ...locations.map((location) => `<option value="${escHTML(location.slug)}"${selectedLocation && selectedLocation.slug === location.slug ? ' selected' : ''}>${escHTML(location.name)}</option>`),
  ].join('');

  const tabs = locations.length > 0 ? `
    <div style="margin-bottom:20px; display:flex; gap:8px; flex-wrap:wrap">
      <a href="${companyDefault ? `/admin/flights/${companyDefault.id}` : buildFlightNewUrl(defaultMonth, defaultYear, '', copySourceId)}" class="btn ${!currentScopeSlug ? 'btn-primary' : 'btn-secondary'} btn-sm">Company Default${companyDefault ? '' : ' +'}</a>
      ${locations.map((location) => {
        const existing = relatedFlights.find((entry) => getFlightScopeSlug(entry) === location.slug) || null;
        const href = existing ? `/admin/flights/${existing.id}` : buildFlightNewUrl(defaultMonth, defaultYear, location.slug, copySourceId || (companyDefault ? companyDefault.id : ''));
        const label = `${escHTML(location.name)}${existing ? '' : ' +'}`;
        return `<a href="${href}" class="btn ${currentScopeSlug === location.slug ? 'btn-primary' : 'btn-secondary'} btn-sm">${label}</a>`;
      }).join('')}
    </div>
    <p style="color:#888; font-size:0.85rem; margin-top:-8px; margin-bottom:16px">Tabs marked with <strong>+</strong> create a copy for that location so you can swap a product without changing everyone else.</p>
  ` : '';

  const scopeSummary = selectedLocation
    ? `This override only affects ${escHTML(selectedLocation.name)}. Delete it any time to fall back to the company default.`
    : 'This is the shared flight for every location that does not have its own override.';

  const copyNote = copySource
    ? `
      <div class="card" style="background:rgba(212,175,55,0.08); border:1px solid rgba(212,175,55,0.18)">
        <strong>Prefilled from ${escHTML(getFlightScopeLabel(copySource))}.</strong>
        <div style="color:#888; margin-top:6px">You can change pours, price, or description before saving this ${selectedLocation ? 'location override' : 'company default'}.</div>
      </div>
    `
    : '';

  const scopeField = isNew ? `
    <label>Applies To</label>
    <select name="locationSlug">${scopeOptions}</select>
    <p style="color:#888; font-size:0.85rem; margin-top:8px">Use Company Default when most locations share the same flight. Create a location override only when one bar needs different pours.</p>
  ` : `
    <label>Applies To</label>
    <div style="margin-top:8px">
      <span class="tag" style="background:rgba(212,175,55,0.15); color:#d4af37">${escHTML(selectedLocation ? selectedLocation.name : 'Company Default')}</span>
    </div>
    <p style="color:#888; font-size:0.85rem; margin-top:8px">${scopeSummary}</p>
  `;

  const pourFields = [0, 1, 2].map((i) => {
    const p = pours[i] || {};
    return `
      <div class="card">
        <h3>Pour ${i + 1}</h3>
        <label>Name</label>
        <input type="text" name="pour${i}_name" value="${escHTML(p.spiritName)}" ${i === 0 ? 'required' : ''} placeholder="e.g. Westward Single Malt, Pinot Grigio, Espresso Martini" />
        <label>Pour Size</label>
        <input type="text" name="pour${i}_size" value="${escHTML(p.pourSize)}" placeholder="e.g. 1 oz" />
        <label>Description</label>
        <input type="text" name="pour${i}_desc" value="${escHTML(p.description)}" placeholder="e.g. Portland, Oregon — or grape varietal, cocktail style" />
      </div>
    `;
  }).join('');

  const deleteLabel = isOverride ? 'Delete Override' : 'Delete Flight';
  const deleteConfirm = isOverride
    ? 'Delete this override and fall back to the company default for this location?'
    : 'Delete this flight?';

  return adminLayout(isNew ? 'New Flight' : 'Edit Flight', `
    <div class="page-header">
      <div>
        <div class="admin-kicker">${isOverride ? 'Location override' : 'Company default'}</div>
        <h1>${isNew ? 'Create Flight' : 'Edit Flight'}</h1>
        <p class="page-subtitle">${scopeSummary}</p>
      </div>
      <div class="page-actions">
        <a href="/admin/flights" class="btn btn-secondary">All Flights</a>
      </div>
    </div>
    ${message ? `<div class="alert ${message.type === 'error' ? 'alert-error' : 'alert-success'}">${message.text}</div>` : ''}
    ${tabs}
    ${copyNote}
    <form method="POST" action="/admin/flights/${isNew ? 'new' : flight.id}">
      <section class="form-section">
        <div class="form-section-head">
          <div>
            <h2>Flight Details</h2>
            <p>Choose where this flight applies, the public theme, month, year, and price.</p>
          </div>
        </div>
        <div class="form-section-body">
        ${scopeField}
        <label>Theme</label>
        <input type="text" name="theme" value="${escHTML(flight ? flight.theme : '')}" required placeholder="e.g. American Single Malts" />
        <label>Description</label>
        <textarea name="description" placeholder="Optional description of the flight theme">${escHTML(flight ? flight.description : '')}</textarea>
        <div class="form-row">
          <div>
            <label>Month</label>
            <select name="month">${monthOptions}</select>
          </div>
          <div>
            <label>Year</label>
            <select name="year">${yearOptions}</select>
          </div>
          <div>
            <label>Price</label>
            <input type="text" name="price" value="${escHTML(flight ? flight.price : '$15')}" placeholder="e.g. $15" />
          </div>
        </div>
        <label style="display:flex; align-items:center; gap:8px; margin-top:16px">
          <input type="checkbox" name="isActive" ${!flight || flight.isActive ? 'checked' : ''} style="width:auto" />
          <span>Active</span>
        </label>
        </div>
      </section>
      <div class="section-head">
        <div>
          <h2>Pours</h2>
          <p>Add up to three pours. The first pour is required.</p>
        </div>
      </div>
      ${pourFields}
      <div class="sticky-actions">
        <button type="submit" class="btn btn-primary">${isNew ? 'Create Flight' : 'Save Changes'}</button>
        ${!isNew ? `<button type="submit" name="_action" value="delete" class="btn btn-danger" onclick="return confirm('${deleteConfirm}')">${deleteLabel}</button>` : ''}
        <a href="/admin/flights" class="btn btn-secondary">Cancel</a>
      </div>
    </form>
  `, user, { pathname: '/admin/flights', flashMsg });
}

// ─── Bottles List ───
function bottlesList(bottles, user, flashMsg) {
  const rows = bottles.map(b => `
    <tr>
      <td><a href="/admin/bottles/${b.id}">${escHTML(b.name)}</a></td>
      <td>${MONTHS[b.month]} ${b.year}</td>
      <td>${escHTML(b.category || '-')}</td>
      <td style="color:#d4af37; font-weight:700">${escHTML(b.costPrice)}</td>
      <td style="color:#666; text-decoration:line-through">${escHTML(b.regularPrice || '-')}</td>
      <td><span class="tag ${b.isActive ? 'tag-active' : 'tag-inactive'}">${b.isActive ? 'Active' : 'Inactive'}</span></td>
      <td><a href="/admin/bottles/${b.id}" class="btn btn-secondary btn-sm">Edit</a></td>
    </tr>
  `).join('');

  return adminLayout('Sunday Bottles', `
    <div class="page-header">
      <div>
        <div class="admin-kicker">Sunday specials</div>
        <h1>Sunday Break Even Bottles</h1>
        <p class="page-subtitle">Featured bottles sold at cost on Sundays.</p>
      </div>
      <a href="/admin/bottles/new" class="btn btn-primary">New Bottle</a>
    </div>
    ${bottles.length === 0 ? '<div class="empty-state">No bottles yet. Add one to get started.</div>' : `
      <table>
        <thead><tr><th>Name</th><th>Month</th><th>Category</th><th>Cost Price</th><th>Regular</th><th>Status</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `}
  `, user, { pathname: '/admin/bottles', flashMsg });
}

// ─── Bottle Editor ───
function bottleEditor(bottle, isNew, user, message, flashMsg) {
  const now = new Date();
  const defaultMonth = bottle ? bottle.month : now.getMonth() + 1;
  const defaultYear = bottle ? bottle.year : now.getFullYear();

  const monthOptions = Array.from({length: 12}, (_, i) => `<option value="${i+1}" ${defaultMonth === i+1 ? 'selected' : ''}>${MONTHS[i+1]}</option>`).join('');
  const yearOptions = Array.from({length: 3}, (_, i) => {
    const y = now.getFullYear() + i - 1;
    return `<option value="${y}" ${defaultYear === y ? 'selected' : ''}>${y}</option>`;
  }).join('');

  const catOptions = ['', 'bourbon', 'scotch', 'rye', 'irish', 'japanese', 'rum', 'tequila', 'mezcal', 'gin', 'vodka', 'other'].map(c =>
    `<option value="${c}" ${(bottle && bottle.category === c) ? 'selected' : ''}>${c ? c.charAt(0).toUpperCase() + c.slice(1) : 'None'}</option>`
  ).join('');

  return adminLayout(isNew ? 'New Bottle' : 'Edit Bottle', `
    <div class="page-header">
      <div>
        <div class="admin-kicker">Break even bottle</div>
        <h1>${isNew ? 'Add Bottle' : 'Edit Bottle'}</h1>
        <p class="page-subtitle">Set the bottle, cost price, month, and publishing status.</p>
      </div>
      <div class="page-actions"><a href="/admin/bottles" class="btn btn-secondary">All Bottles</a></div>
    </div>
    ${message ? `<div class="alert ${message.type === 'error' ? 'alert-error' : 'alert-success'}">${message.text}</div>` : ''}
    <form method="POST" action="/admin/bottles/${isNew ? 'new' : bottle.id}">
      <section class="form-section">
        <div class="form-section-head">
          <div>
            <h2>Bottle Details</h2>
            <p>Guests see active bottles for the selected month on the Sunday specials page.</p>
          </div>
        </div>
        <div class="form-section-body">
        <label>Bottle Name</label>
        <input type="text" name="name" value="${escHTML(bottle ? bottle.name : '')}" required placeholder="e.g. Buffalo Trace Bourbon" />
        <label>Description</label>
        <textarea name="description" placeholder="Optional description">${escHTML(bottle ? bottle.description : '')}</textarea>
        <div class="form-row">
          <div>
            <label>Cost Price (Break Even)</label>
            <input type="text" name="costPrice" value="${escHTML(bottle ? bottle.costPrice : '')}" required placeholder="e.g. $25" />
          </div>
          <div>
            <label>Regular Price</label>
            <input type="text" name="regularPrice" value="${escHTML(bottle ? bottle.regularPrice : '')}" placeholder="e.g. $45" />
          </div>
        </div>
        <div class="form-row">
          <div>
            <label>Month</label>
            <select name="month">${monthOptions}</select>
          </div>
          <div>
            <label>Year</label>
            <select name="year">${yearOptions}</select>
          </div>
          <div>
            <label>Category</label>
            <select name="category">${catOptions}</select>
          </div>
        </div>
        <div class="form-row">
          <div>
            <label>Display Order</label>
            <input type="number" name="displayOrder" value="${bottle ? bottle.displayOrder : 0}" />
          </div>
        </div>
        <label style="display:flex; align-items:center; gap:8px; margin-top:16px">
          <input type="checkbox" name="isActive" ${!bottle || bottle.isActive ? 'checked' : ''} style="width:auto" />
          <span>Active</span>
        </label>
        </div>
      </section>
      <div class="sticky-actions">
        <button type="submit" class="btn btn-primary">${isNew ? 'Add Bottle' : 'Save Changes'}</button>
        ${!isNew ? `<button type="submit" name="_action" value="delete" class="btn btn-danger" onclick="return confirm('Delete this bottle?')">Delete</button>` : ''}
        <a href="/admin/bottles" class="btn btn-secondary">Cancel</a>
      </div>
    </form>
  `, user, { pathname: '/admin/bottles', flashMsg });
}

module.exports = { specialsDashboard, dayThemeEditor, flightsList, flightEditor, bottlesList, bottleEditor, DAYS, DAY_LABELS, MONTHS };
