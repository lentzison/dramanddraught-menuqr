const { adminLayout } = require('./adminLayout');
const { escHTML } = require('./escapeHtml');

const STATUS_LABELS = {
  new: 'New',
  reviewing: 'Reviewing',
  interview_scheduled: 'Interview Scheduled',
  interviewed: 'Interviewed',
  offer_extended: 'Offer Extended',
  hired: 'Hired',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
};

const PIPELINE_ORDER = [
  'new', 'reviewing', 'interview_scheduled', 'interviewed', 'offer_extended', 'hired',
];
const TERMINAL_STATUSES = new Set(['hired', 'rejected', 'withdrawn']);

const POSITIONS = ['Bartender', 'Barback', 'Server', 'Host', 'Floor Manager', 'Other'];

const DAYS_LABELS = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };
const SHIFT_LABELS = { day: 'Day', evening: 'Evening', late: 'Late' };
const DAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

const CONTACT_METHOD_LABELS = {
  phone: 'phone call',
  text: 'text message',
  in_person: 'in person',
  email_manual: 'manual email',
  other: 'other',
};

// Same as escHTML but tolerates non-string inputs (null/undefined/numbers).
function escAttr(s) { return escHTML(String(s == null ? '' : s)); }

function statusBadge(status) {
  const label = STATUS_LABELS[status] || status;
  return `<span class="app-badge app-badge-${escHTML(status || 'new')}">${escHTML(label)}</span>`;
}

function formatFriendly(value) {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

function formatDateOnly(value) {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

function toDateTimeLocal(value) {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return '';
  const eastern = new Date(d.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const pad = n => String(n).padStart(2, '0');
  return `${eastern.getFullYear()}-${pad(eastern.getMonth() + 1)}-${pad(eastern.getDate())}T${pad(eastern.getHours())}:${pad(eastern.getMinutes())}`;
}

function applicantStyles() {
  return `
    <style>
      /* === Status & recommendation badges === */
      .app-badge { display:inline-block; padding:4px 10px; border-radius:999px; font-size:0.7rem; font-weight:800; text-transform:uppercase; letter-spacing:0.05em; }
      .app-badge-lg { padding:6px 14px; font-size:0.78rem; }
      .app-badge-new              { background:rgba(143,183,255,0.16); color:#a8c6ff; }
      .app-badge-reviewing        { background:rgba(168,85,247,0.18); color:#c4b5fd; }
      .app-badge-interview_scheduled { background:rgba(242,166,90,0.18); color:#f5be86; }
      .app-badge-interviewed      { background:rgba(98,210,143,0.18); color:#8eeab0; }
      .app-badge-offer_extended   { background:rgba(240,199,102,0.20); color:var(--gold-strong); }
      .app-badge-hired            { background:rgba(98,210,143,0.22); color:#a4f4c2; }
      .app-badge-rejected         { background:rgba(255,123,123,0.18); color:#ffb3b3; }
      .app-badge-withdrawn        { background:rgba(185,174,160,0.15); color:var(--text-muted); }

      .ai-rec-badge { display:inline-block; padding:4px 10px; border-radius:999px; font-size:0.7rem; font-weight:800; text-transform:uppercase; letter-spacing:0.05em; margin-left:6px; }
      .ai-rec-recommend, .ai-rec-recommend_interview       { background:rgba(98,210,143,0.22); color:#a4f4c2; }
      .ai-rec-dont_recommend, .ai-rec-needs_human_review   { background:rgba(242,166,90,0.18); color:var(--amber); }
      .ai-rec-does_not_meet_role_requirements              { background:rgba(255,123,123,0.18); color:#ffb3b3; }
      .ai-rec-pending         { background:rgba(143,183,255,0.16); color:#a8c6ff; }
      .ai-rec-error           { background:rgba(255,123,123,0.18); color:#ffb3b3; }
      .ai-review-badge { display:inline-block; padding:4px 10px; border-radius:999px; font-size:0.7rem; font-weight:800; text-transform:uppercase; letter-spacing:0.05em; margin-left:6px; background:rgba(242,166,90,0.18); color:var(--amber); }

      /* === Applicants list (used by /admin/applicants) === */
      .app-row { display:flex; align-items:center; gap:14px; padding:14px 16px; border:1px solid var(--line); border-radius:var(--radius); margin-bottom:10px; background: linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01)), var(--surface); }
      .app-row:hover { border-color:rgba(214,173,75,0.38); }
      .app-row a.app-name { color:var(--text); font-weight:700; text-decoration:none; }
      .app-row a.app-name:hover { color:var(--gold-strong); }
      .app-meta { color:var(--text-muted); font-size:0.85rem; margin-top:3px; }
      .app-meta-dot { color:var(--text-soft); margin:0 4px; }
      .app-row-main { flex:1 1 auto; min-width:0; }
      .app-row-actions { flex:0 0 auto; }
      .app-filter-bar { display:flex; flex-wrap:wrap; gap:10px; margin-bottom:14px; align-items:flex-end; }
      .app-filter-bar select, .app-filter-bar input[type="search"] {
        background: var(--bg-soft); color:var(--text); border:1px solid var(--line);
        padding:8px 10px; border-radius:var(--radius); font-size:0.9rem;
      }
      .app-filter-bar label { display:flex; flex-direction:column; gap:4px; font-size:0.72rem; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.06em; font-weight:800; }

      /* === Flash messages === */
      .app-flash { padding:11px 16px; border-radius:var(--radius); margin-bottom:16px; font-size:0.92rem; font-weight:600; }
      .app-flash.success { background:rgba(98,210,143,0.16); color:#a4f4c2; border:1px solid rgba(98,210,143,0.32); }
      .app-flash.error   { background:rgba(255,123,123,0.14); color:#ffb3b3; border:1px solid rgba(255,123,123,0.32); }

      /* === Detail page: hero / header === */
      .ap-hero {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 18px 24px;
        align-items: start;
        background: linear-gradient(180deg, rgba(255,255,255,0.035), rgba(255,255,255,0.01)), var(--surface);
        border: 1px solid var(--line);
        border-radius: var(--radius);
        padding: 22px 26px;
        margin-bottom: 16px;
      }
      .ap-hero-left { min-width: 0; }
      .ap-hero h1 { font-size: clamp(1.6rem, 2.6vw, 2.1rem); line-height: 1.1; margin: 4px 0 8px; }
      .ap-hero .ap-meta-line { color: var(--text-muted); font-size: 0.92rem; }
      .ap-hero .ap-meta-line .dot { color: var(--text-soft); margin: 0 6px; }
      .ap-hero-actions { display: flex; flex-direction: column; align-items: flex-end; gap: 8px; }
      .ap-hero-actions .ap-action-row { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
      .ap-hero-status-line { display: flex; align-items: center; gap: 10px; margin-top: 6px; flex-wrap: wrap; }

      /* === Dropdown menu (Change status) === */
      .ap-menu { position: relative; }
      .ap-menu summary { list-style: none; cursor: pointer; }
      .ap-menu summary::-webkit-details-marker { display: none; }
      .ap-menu-panel {
        position: absolute; right: 0; top: calc(100% + 6px); z-index: 30;
        background: var(--surface-2); border: 1px solid var(--line);
        border-radius: var(--radius); box-shadow: var(--shadow);
        min-width: 220px; padding: 6px;
      }
      .ap-menu-panel form { margin: 0; }
      .ap-menu-panel button {
        display: block; width: 100%; text-align: left;
        padding: 9px 12px; border-radius: 6px;
        background: transparent; color: var(--text); border: none;
        font-size: 0.88rem; font-weight: 600; cursor: pointer;
      }
      .ap-menu-panel button:hover { background: rgba(255,255,255,0.06); }
      .ap-menu-panel button.is-current { color: var(--text-muted); cursor: default; }
      .ap-menu-panel button.is-current:hover { background: transparent; }
      .ap-menu-panel button.is-danger { color: #ffb3b3; }
      .ap-menu-panel hr { border: none; border-top: 1px solid var(--line); margin: 4px 0; }

      /* === Pipeline stepper === */
      .ap-stepper {
        background: linear-gradient(180deg, rgba(255,255,255,0.035), rgba(255,255,255,0.01)), var(--surface);
        border: 1px solid var(--line);
        border-radius: var(--radius);
        padding: 18px 22px;
        margin-bottom: 18px;
      }
      .ap-stepper-track {
        display: grid;
        grid-template-columns: repeat(5, 1fr);
        gap: 0;
        position: relative;
      }
      .ap-step {
        display: flex; flex-direction: column; align-items: center; gap: 8px;
        position: relative; padding: 0 4px;
        text-align: center;
      }
      .ap-step::after {
        content: ''; position: absolute; top: 14px; left: calc(50% + 18px); right: calc(-50% + 18px);
        height: 2px; background: var(--line); z-index: 0;
      }
      .ap-step:last-child::after { display: none; }
      .ap-step.is-done::after { background: rgba(98,210,143,0.45); }
      .ap-step-dot {
        width: 30px; height: 30px; border-radius: 50%;
        background: var(--surface-2); border: 2px solid var(--line);
        display: inline-flex; align-items: center; justify-content: center;
        font-size: 0.78rem; font-weight: 800; color: var(--text-muted);
        z-index: 1; position: relative;
      }
      .ap-step.is-done .ap-step-dot { background: rgba(98,210,143,0.18); border-color: rgba(98,210,143,0.5); color: #a4f4c2; }
      .ap-step.is-current .ap-step-dot { background: var(--gold-strong); border-color: var(--gold-strong); color: #1a1207; box-shadow: 0 0 0 4px rgba(240,199,102,0.18); }
      .ap-step-label {
        font-size: 0.78rem; font-weight: 700; color: var(--text-muted);
        text-transform: uppercase; letter-spacing: 0.04em;
      }
      .ap-step.is-current .ap-step-label { color: var(--gold-strong); }
      .ap-step.is-done .ap-step-label { color: var(--text); }
      .ap-stepper-footer {
        margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--line-soft);
        display: flex; flex-wrap: wrap; gap: 12px; align-items: center;
        color: var(--text-muted); font-size: 0.82rem;
      }
      .ap-stepper-footer .terminal-note { color: var(--amber); font-weight: 700; }
      .ap-stepper-footer .terminal-note.is-positive { color: #a4f4c2; }
      .ap-stepper-footer .terminal-note.is-negative { color: #ffb3b3; }
      .ap-decision-note { margin-top: 8px; padding: 10px 12px; background: rgba(255,255,255,0.03); border-left: 3px solid var(--gold-strong); border-radius: 4px; color: var(--text); font-size: 0.9rem; }
      .ap-decision-note strong { color: var(--gold-strong); margin-right: 6px; }

      /* === Two-column layout === */
      .ap-grid {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 320px;
        gap: 18px;
        align-items: start;
      }
      .ap-main { min-width: 0; }
      .ap-rail { position: sticky; top: 84px; display: flex; flex-direction: column; gap: 14px; }
      @media (max-width: 980px) {
        .ap-grid { grid-template-columns: 1fr; }
        .ap-rail { position: static; }
      }

      /* === Generic detail card === */
      .ap-card {
        background: linear-gradient(180deg, rgba(255,255,255,0.035), rgba(255,255,255,0.01)), var(--surface);
        border: 1px solid var(--line);
        border-radius: var(--radius);
        padding: 18px 20px;
        margin-bottom: 14px;
      }
      .ap-card-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
      .ap-card-head h2 { margin: 0; font-size: 1rem; color: var(--gold-strong); text-transform: uppercase; letter-spacing: 0.06em; font-weight: 800; }
      .ap-card-head .ap-card-aside { color: var(--text-muted); font-size: 0.82rem; }

      /* === Contact rail card === */
      .ap-contact { display: grid; grid-template-columns: 1fr; gap: 0; }
      .ap-contact-row {
        display: grid; grid-template-columns: 70px 1fr auto;
        align-items: center; gap: 8px;
        padding: 8px 0; border-bottom: 1px solid var(--line-soft);
      }
      .ap-contact-row:last-child { border-bottom: none; }
      .ap-contact-row .lbl { color: var(--text-muted); font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.06em; font-weight: 800; }
      .ap-contact-row .val { color: var(--text); font-size: 0.92rem; word-break: break-word; min-width: 0; }
      .ap-contact-row .val a { color: var(--text); }
      .ap-contact-row .val a:hover { color: var(--gold-strong); }
      .ap-copy {
        flex: 0 0 auto;
        background: rgba(255,255,255,0.05); border: 1px solid var(--line);
        color: var(--text-muted); cursor: pointer;
        font-size: 0.7rem; font-weight: 700;
        padding: 4px 8px; border-radius: 6px;
        text-transform: uppercase; letter-spacing: 0.05em;
      }
      .ap-copy:hover { color: var(--gold-strong); border-color: rgba(214,173,75,0.4); }
      .ap-copy.is-copied { color: #a4f4c2; border-color: rgba(98,210,143,0.5); }

      /* === Availability heat grid === */
      .ap-avail-grid {
        display: grid; grid-template-columns: 36px repeat(3, 1fr); gap: 4px;
      }
      .ap-avail-cell {
        font-size: 0.66rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;
        color: var(--text-muted); padding: 6px 0; text-align: center;
        background: rgba(255,255,255,0.03); border-radius: 4px;
        min-height: 22px;
      }
      .ap-avail-cell.is-day { color: var(--text); background: transparent; text-align: left; padding-left: 4px; align-self: center; }
      .ap-avail-cell.is-head { background: transparent; color: var(--text-muted); font-size: 0.62rem; }
      .ap-avail-cell.is-on { background: rgba(240,199,102,0.32); color: #1a1207; }
      .ap-avail-cell.is-weekend.is-on { background: rgba(98,210,143,0.32); color: #0a2415; }

      /* === Narrative blocks === */
      .ap-narrative { display: flex; flex-direction: column; gap: 14px; }
      .ap-narrative-block { padding: 12px 14px; background: rgba(255,255,255,0.025); border-left: 3px solid var(--line); border-radius: 4px; }
      .ap-narrative-block.is-thin { border-left-color: var(--amber); }
      .ap-narrative-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 6px; }
      .ap-narrative-head .lbl { color: var(--gold-strong); font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.06em; font-weight: 800; }
      .ap-narrative-head .ap-wc { color: var(--text-muted); font-size: 0.72rem; }
      .ap-narrative-head .ap-wc.is-thin { color: var(--amber); font-weight: 700; }
      .ap-narrative-block .body { color: var(--text); line-height: 1.55; white-space: pre-wrap; font-size: 0.94rem; }
      .ap-narrative-block.is-empty .body { color: var(--text-muted); font-style: italic; }

      /* === Interview timeline === */
      .ap-timeline { position: relative; padding-left: 28px; }
      .ap-timeline::before {
        content: ''; position: absolute; left: 11px; top: 4px; bottom: 4px;
        width: 2px; background: var(--line);
      }
      .ap-timeline-empty { color: var(--text-muted); font-style: italic; padding: 12px 0; }
      .ap-tl-item { position: relative; margin-bottom: 16px; }
      .ap-tl-item:last-child { margin-bottom: 0; }
      .ap-tl-dot {
        position: absolute; left: -22px; top: 6px;
        width: 14px; height: 14px; border-radius: 50%;
        background: var(--gold-strong); border: 2px solid var(--surface);
        box-shadow: 0 0 0 2px var(--line);
      }
      .ap-tl-item.is-cancelled .ap-tl-dot { background: var(--text-soft); }
      .ap-tl-item.is-completed .ap-tl-dot { background: #62d28f; }
      .ap-tl-card {
        background: rgba(255,255,255,0.03); border: 1px solid var(--line);
        border-radius: var(--radius); padding: 12px 14px;
      }
      .ap-tl-item.is-cancelled .ap-tl-card { opacity: 0.65; }
      .ap-tl-head { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; margin-bottom: 6px; }
      .ap-tl-head .when { color: var(--text); font-weight: 700; font-size: 0.96rem; }
      .ap-tl-head .pill { font-size: 0.66rem; padding: 2px 8px; border-radius: 999px; background: rgba(255,255,255,0.06); color: var(--text-muted); font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; }
      .ap-tl-head .pill.is-scheduled { background: rgba(240,199,102,0.18); color: var(--gold-strong); }
      .ap-tl-head .pill.is-cancelled { background: rgba(255,123,123,0.15); color: #ffb3b3; }
      .ap-tl-head .pill.is-completed { background: rgba(98,210,143,0.18); color: #a4f4c2; }
      .ap-tl-meta { color: var(--text-muted); font-size: 0.84rem; }
      .ap-tl-meta + .ap-tl-meta { margin-top: 3px; }
      .ap-tl-foot { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 8px; color: var(--text-soft); font-size: 0.76rem; }
      .ap-tl-foot .ap-tl-foot-item { display: inline-flex; align-items: center; gap: 4px; }
      .ap-tl-cancel-toggle {
        margin-top: 8px;
      }
      .ap-tl-cancel-toggle > summary {
        list-style: none; cursor: pointer; color: #ffb3b3; font-size: 0.82rem; font-weight: 700;
        display: inline-flex; align-items: center; gap: 4px;
      }
      .ap-tl-cancel-toggle > summary::-webkit-details-marker { display: none; }
      .ap-tl-cancel-toggle > summary::before { content: '＋'; opacity: 0.7; }
      .ap-tl-cancel-toggle[open] > summary::before { content: '−'; }
      .ap-tl-cancel-toggle > .body { margin-top: 10px; padding-top: 10px; border-top: 1px dashed var(--line); }

      /* === Schedule form (collapsible) === */
      .ap-schedule-toggle {
        margin-top: 14px;
      }
      .ap-schedule-toggle > summary {
        list-style: none; cursor: pointer;
        display: inline-flex; align-items: center; gap: 6px;
        background: linear-gradient(135deg, var(--gold-strong), var(--copper));
        color: #17110a;
        padding: 9px 16px; border-radius: var(--radius);
        font-weight: 750; font-size: 0.9rem;
        border: 1px solid rgba(255,255,255,0.14);
        transition: transform 0.18s;
      }
      .ap-schedule-toggle > summary::-webkit-details-marker { display: none; }
      .ap-schedule-toggle > summary:hover { transform: translateY(-1px); }
      .ap-schedule-toggle[open] > summary { background: rgba(255,255,255,0.055); color: var(--text); border-color: var(--line); }
      .ap-schedule-toggle > .body { margin-top: 14px; }

      /* === Generic form-row used inside cards === */
      .ap-form-row { display:grid; grid-template-columns: 1fr 1fr; gap:12px; }
      @media (max-width:560px){ .ap-form-row { grid-template-columns: 1fr; } }
      .ap-form-block + .ap-form-block { margin-top: 12px; }
      .ap-form-block label { display:block; font-size:0.74rem; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.06em; margin-bottom:4px; font-weight: 800; }
      .ap-form-block input, .ap-form-block select, .ap-form-block textarea {
        background: var(--bg-soft); color:var(--text); border:1px solid var(--line);
        padding:9px 11px; border-radius:var(--radius); font-size:0.92rem; width:100%; box-sizing:border-box;
        font-family: inherit;
      }
      .ap-form-block textarea { min-height:74px; resize:vertical; }

      .ap-skip-email {
        margin-top: 14px; padding: 12px 14px;
        border: 1px dashed var(--line); border-radius: var(--radius);
        background: rgba(255,255,255,0.02);
      }
      .ap-skip-email legend { font-size: 0.74rem; font-weight: 800; padding: 0 6px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.06em; }
      .ap-skip-email label.toggle { display: flex; align-items: center; gap: 8px; font-size: 0.9rem; color: var(--text); cursor: pointer; }
      .ap-skip-email .body { display: none; margin-top: 12px; }
      .ap-skip-email[data-open="1"] .body { display: block; }

      /* === Notes (autosave) === */
      .ap-notes { display: flex; flex-direction: column; gap: 8px; }
      .ap-notes textarea { background: var(--bg-soft); color: var(--text); border: 1px solid var(--line); border-radius: var(--radius); padding: 10px 12px; font-family: inherit; font-size: 0.9rem; min-height: 120px; resize: vertical; }
      .ap-notes-status { font-size: 0.74rem; color: var(--text-muted); min-height: 1em; }
      .ap-notes-status.is-saving { color: var(--amber); }
      .ap-notes-status.is-saved { color: #a4f4c2; }
      .ap-notes-status.is-error { color: #ffb3b3; }

      /* === Resume === */
      .ap-resume { display: flex; align-items: center; gap: 10px; }
      .ap-resume .ap-resume-empty { color: var(--text-muted); font-style: italic; }

      /* === AI verdict hero === */
      .ai-verdict {
        display:grid; grid-template-columns: auto auto 1fr; align-items:center; gap:18px;
        padding:18px 22px; border-radius: var(--radius); margin-bottom:14px;
        border:1px solid var(--line); background: linear-gradient(180deg, rgba(255,255,255,0.035), rgba(255,255,255,0.01)), var(--surface);
        border-left-width: 4px;
      }
      .ai-verdict.is-recommend { border-left-color: #62d28f; }
      .ai-verdict.is-dont_recommend { border-left-color: var(--line); }
      .ai-verdict.is-pending { border-left-color: var(--blue); }
      .ai-verdict.is-error { border-left-color: var(--red); }
      .ai-verdict-pill {
        display:inline-flex; align-items:center; gap:8px;
        padding:8px 16px; border-radius:999px; font-weight:800;
        text-transform:uppercase; letter-spacing:0.06em; font-size:0.78rem; white-space: nowrap;
      }
      .ai-verdict-pill.is-recommend       { background:rgba(98,210,143,0.22); color:#a4f4c2; }
      .ai-verdict-pill.is-dont_recommend  { background:rgba(185,174,160,0.16); color:var(--text-muted); }
      .ai-verdict-pill.is-pending         { background:rgba(143,183,255,0.16); color:#a8c6ff; }
      .ai-verdict-pill.is-error           { background:rgba(255,123,123,0.18); color:#ffb3b3; }
      .ai-verdict-score { font-size:1.8rem; font-weight:800; color:var(--text); line-height:1; text-align:center; }
      .ai-verdict-score small { display:block; font-size:0.6rem; font-weight:800; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.07em; margin-top:4px; }
      .ai-verdict-summary { color:var(--text); font-size:0.96rem; line-height:1.5; min-width:240px; }
      .ai-verdict-confidence { color:var(--text-muted); font-size:0.74rem; text-transform:uppercase; letter-spacing:0.06em; font-weight: 800; margin-top: 6px; }
      @media (max-width: 640px) {
        .ai-verdict { grid-template-columns: 1fr; gap: 12px; }
      }

      /* === AI watchouts / followups / categories === */
      .ai-watchout { background:rgba(242,166,90,0.10); border:1px solid rgba(242,166,90,0.40); border-radius: var(--radius); padding:14px 18px; margin-bottom:14px; }
      .ai-watchout h3 { margin:0 0 8px; color: var(--amber); font-size:0.92rem; text-transform: uppercase; letter-spacing: 0.06em; font-weight: 800; }
      .ai-watchout ul { margin:0; padding-left:22px; line-height:1.55; }
      .ai-watchout li { margin-bottom:4px; color: var(--text); }
      .ai-watchout-error { background:rgba(255,123,123,0.12); border-color:rgba(255,123,123,0.40); }
      .ai-watchout-error h3 { color:#ffb3b3; }
      .ai-watchout-error li { color: var(--text); }

      .ai-followups { background: linear-gradient(180deg, rgba(255,255,255,0.035), rgba(255,255,255,0.01)), var(--surface); border:1px solid var(--line); border-radius: var(--radius); padding:14px 18px; margin-bottom:14px; }
      .ai-followups h3 { margin:0 0 10px; color: var(--gold-strong); font-size:0.92rem; text-transform: uppercase; letter-spacing: 0.06em; font-weight: 800; }
      .ai-followups ol { margin:0; padding-left:22px; line-height:1.55; }
      .ai-followups li { margin-bottom:6px; color:var(--text); font-size:0.94rem; }

      .ai-cats { background: linear-gradient(180deg, rgba(255,255,255,0.035), rgba(255,255,255,0.01)), var(--surface); border:1px solid var(--line); border-radius: var(--radius); padding:14px 18px; margin-bottom:14px; }
      .ai-cats h3 { margin:0 0 10px; color: var(--gold-strong); font-size:0.92rem; text-transform: uppercase; letter-spacing: 0.06em; font-weight: 800; }
      .ai-cat-row { display:flex; align-items:center; gap:12px; padding:8px 0; border-bottom:1px solid var(--line-soft); }
      .ai-cat-row:last-child { border-bottom:none; }
      .ai-cat-row .label { flex:0 0 180px; color:var(--text); font-weight:600; font-size:0.92rem; }
      .ai-cat-row .meter {
        flex:1 1 auto; height:8px; border-radius:4px;
        background:rgba(255,255,255,0.06); overflow:hidden; min-width:80px;
      }
      .ai-cat-row .meter > span { display:block; height:100%; background:linear-gradient(90deg, #62d28f, var(--gold-strong)); }
      .ai-cat-row .num { flex:0 0 46px; text-align:right; color:var(--text); font-weight:700; font-size:0.95rem; }
      .ai-cat-row .num small { color:var(--text-muted); font-weight:500; font-size:0.7rem; margin-left:4px; }
      .ai-cat-detail { padding:6px 0 8px 14px; border-left:2px solid rgba(240,199,102,0.25); margin:4px 0 12px 0; }
      .ai-cat-detail .why { color:var(--text-muted); font-size:0.86rem; line-height:1.5; margin-bottom:8px; }
      .ai-cat-detail h4 { margin:8px 0 4px; font-size:0.7rem; color: var(--gold-strong); text-transform:uppercase; letter-spacing:0.06em; font-weight: 800; }
      .ai-cat-detail ul { margin:0 0 6px; padding-left:18px; }
      .ai-cat-detail li { font-size:0.86rem; line-height:1.45; margin-bottom:3px; color:var(--text); }
      .ai-cat-detail .concerns li { color:#ffb3b3; }
      .ai-cat-source { display: flex; align-items: center; gap: 8px; padding: 0 0 8px 0; font-size: 0.74rem; color: var(--text-muted); flex-wrap: wrap; }
      .ai-cat-qid { display: inline-block; padding: 1px 7px; border: 1px solid var(--line); border-radius: 999px; background: rgba(255,255,255,0.04); color: var(--text-muted); font-family: 'SF Mono', Menlo, monospace; font-size: 0.7rem; letter-spacing: 0.03em; }
      .ai-cat-conf { color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.07em; font-weight: 700; font-size: 0.7rem; }
      .ai-cat-quote { margin: 4px 0 8px; padding: 8px 12px; border-left: 3px solid var(--gold-strong); background: rgba(255,255,255,0.025); border-radius: 0 6px 6px 0; color: var(--text); font-size: 0.86rem; line-height: 1.5; font-style: italic; }
      .ai-cat-quote-concern { border-left-color: var(--amber); }
      .ai-cat-followup { padding: 8px 12px; background: rgba(143,183,255,0.06); border-left: 3px solid var(--blue); border-radius: 0 6px 6px 0; color: var(--text); font-size: 0.86rem; line-height: 1.5; }
      details.ai-cat-toggle > summary { cursor:pointer; color: var(--gold-strong); font-size:0.78rem; padding:6px 0; list-style:none; }
      details.ai-cat-toggle > summary::-webkit-details-marker { display:none; }
      details.ai-cat-toggle > summary::before { content:'▸ '; }
      details.ai-cat-toggle[open] > summary::before { content:'▾ '; }

      details.ai-collapse { background: linear-gradient(180deg, rgba(255,255,255,0.035), rgba(255,255,255,0.01)), var(--surface); border:1px solid var(--line); border-radius: var(--radius); padding:14px 18px; margin-bottom:14px; }
      details.ai-collapse > summary { cursor:pointer; color:var(--text); font-weight:700; font-size:0.94rem; list-style:none; }
      details.ai-collapse > summary::-webkit-details-marker { display:none; }
      details.ai-collapse > summary::before { content:'▸ '; color: var(--gold-strong); }
      details.ai-collapse[open] > summary::before { content:'▾ '; color: var(--gold-strong); }
      details.ai-collapse[open] > summary { padding-bottom:10px; border-bottom:1px solid var(--line-soft); margin-bottom:14px; }
      details.ai-collapse .answer-q { color:var(--text-muted); font-size:0.74rem; text-transform:uppercase; letter-spacing:0.06em; font-weight: 800; margin:14px 0 4px; }
      details.ai-collapse .answer-q:first-of-type { margin-top:0; }
      details.ai-collapse .answer-a { color:var(--text); font-size:0.92rem; line-height:1.55; white-space:pre-wrap; }

      .ai-meta { color:var(--text-muted); font-size:0.74rem; margin-top:6px; padding:4px 2px; line-height: 1.5; }

      /* === Onboarding card (hired-only, right rail) === */
      .ap-onb-status {
        padding: 12px 14px; border-radius: var(--radius);
        background: rgba(255,255,255,0.025); border: 1px solid var(--line);
        color: var(--text); font-size: 0.92rem; line-height: 1.45;
      }
      .ap-onb-status strong { color: var(--text); display: block; margin-bottom: 4px; }
      .ap-onb-status .ap-onb-sub { color: var(--text-muted); font-size: 0.82rem; }
      .ap-onb-status.is-good { border-color: rgba(98,210,143,0.45); background: rgba(98,210,143,0.08); }
      .ap-onb-status.is-good strong { color: #a4f4c2; }
      .ap-onb-status.is-warn { border-color: rgba(242,166,90,0.45); background: rgba(242,166,90,0.08); }
      .ap-onb-status.is-warn strong { color: var(--amber); }
      .ap-onb-status.is-pending { border-color: rgba(143,183,255,0.45); background: rgba(143,183,255,0.06); }
      .ap-onb-status.is-pending strong { color: #a8c6ff; }

      /* === Keyboard shortcut hint === */
      .ap-kbd { display:inline-block; padding: 1px 6px; border:1px solid var(--line); border-bottom-width: 2px; border-radius: 4px; background: rgba(255,255,255,0.05); font-family: 'SF Mono', Menlo, monospace; font-size: 0.72rem; color: var(--text); }
      .ap-shortcut-hint { color: var(--text-muted); font-size: 0.78rem; margin-top: 8px; }

      /* ============================================================ */
      /* ====== Applicants LIST page (/admin/applicants) ============== */
      /* ============================================================ */

      .al-hero {
        display: grid; grid-template-columns: 1fr auto;
        gap: 18px 24px; align-items: start;
        background: linear-gradient(180deg, rgba(255,255,255,0.035), rgba(255,255,255,0.01)), var(--surface);
        border: 1px solid var(--line); border-radius: var(--radius);
        padding: 22px 26px; margin-bottom: 16px;
      }
      .al-hero h1 { font-size: clamp(1.5rem, 2.6vw, 2rem); line-height: 1.1; margin: 4px 0 8px; }
      .al-hero .meta-line { color: var(--text-muted); font-size: 0.92rem; }
      .al-hero-actions { display: flex; flex-direction: column; align-items: flex-end; gap: 8px; }
      .al-hero-actions .row { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }

      /* === Status chip rail (replaces stat tiles + status dropdown) === */
      .al-chip-rail { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
      .al-chip {
        display: inline-flex; align-items: center; gap: 8px;
        padding: 8px 14px; border-radius: 999px;
        background: rgba(255,255,255,0.045); border: 1px solid var(--line);
        color: var(--text-muted); font-size: 0.86rem; font-weight: 700;
        cursor: pointer; text-decoration: none; transition: all 0.15s;
      }
      .al-chip:hover { color: var(--text); border-color: rgba(240,199,102,0.4); text-decoration: none; }
      .al-chip .count {
        font-size: 0.72rem; font-weight: 800;
        padding: 1px 8px; border-radius: 999px;
        background: rgba(255,255,255,0.06); color: var(--text-muted);
      }
      .al-chip.is-active {
        background: var(--gold-strong); color: #17110a;
        border-color: var(--gold-strong);
      }
      .al-chip.is-active .count { background: rgba(0,0,0,0.18); color: #17110a; }
      .al-chip.is-toggle.is-active { background: rgba(240,199,102,0.22); color: var(--gold-strong); border-color: var(--gold-strong); }
      .al-chip.is-toggle.is-active .count { background: rgba(240,199,102,0.18); color: var(--gold-strong); }
      .al-chip.is-danger.is-active { background: rgba(242,166,90,0.22); color: var(--amber); border-color: var(--amber); }
      .al-chip.is-archive { color: var(--text-soft); opacity: 0.7; }
      .al-chip.is-archive:hover { color: var(--text-muted); opacity: 1; }
      .al-chip.is-archive.is-active { background: rgba(255,123,123,0.18); color: #ffb3b3; border-color: rgba(255,123,123,0.4); opacity: 1; }

      /* === Toolbar (search + sort + group + more filters) === */
      .al-toolbar {
        display: grid; grid-template-columns: 1fr auto auto auto;
        gap: 10px; align-items: center;
        margin: 12px 0 6px;
      }
      @media (max-width: 760px) {
        .al-toolbar { grid-template-columns: 1fr 1fr; }
      }
      .al-search {
        position: relative;
      }
      .al-search input {
        width: 100%; box-sizing: border-box;
        background: var(--bg-soft); color: var(--text);
        border: 1px solid var(--line); border-radius: var(--radius);
        padding: 9px 12px 9px 36px; font-size: 0.92rem; font-family: inherit;
        background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23b9aea0' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><circle cx='11' cy='11' r='8'/><line x1='21' y1='21' x2='16.65' y2='16.65'/></svg>");
        background-repeat: no-repeat; background-position: 12px center;
      }
      .al-select {
        background: var(--bg-soft); color: var(--text);
        border: 1px solid var(--line); border-radius: var(--radius);
        padding: 9px 12px; font-size: 0.86rem; font-family: inherit;
      }
      .al-select-label {
        display: inline-flex; align-items: center; gap: 6px;
        color: var(--text-muted); font-size: 0.72rem; font-weight: 800;
        text-transform: uppercase; letter-spacing: 0.06em;
      }
      details.al-more {
        background: rgba(255,255,255,0.025); border: 1px solid var(--line);
        border-radius: var(--radius); padding: 4px 12px;
        margin-bottom: 14px;
      }
      details.al-more > summary {
        list-style: none; cursor: pointer; padding: 8px 0;
        color: var(--text-muted); font-size: 0.84rem; font-weight: 700;
        display: inline-flex; align-items: center; gap: 6px;
      }
      details.al-more > summary::-webkit-details-marker { display: none; }
      details.al-more > summary::before { content: '＋'; opacity: 0.6; }
      details.al-more[open] > summary::before { content: '−'; }
      details.al-more[open] > summary { color: var(--gold-strong); }
      details.al-more > .body {
        display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 12px; padding: 8px 0 14px;
      }
      details.al-more label { font-size: 0.72rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.06em; font-weight: 800; display: block; margin-bottom: 4px; }
      details.al-more select { width: 100%; }

      /* === List + groups === */
      .al-list { display: flex; flex-direction: column; gap: 10px; }
      .al-result-meta { color: var(--text-muted); font-size: 0.82rem; margin-bottom: 8px; }
      .al-result-meta strong { color: var(--text); }

      .al-group-header {
        display: flex; align-items: baseline; gap: 10px;
        margin: 18px 0 8px;
        padding-bottom: 6px;
        border-bottom: 1px solid var(--line-soft);
      }
      .al-group-header:first-child { margin-top: 4px; }
      .al-group-header h2 {
        margin: 0; font-size: 0.84rem; color: var(--gold-strong);
        text-transform: uppercase; letter-spacing: 0.07em; font-weight: 800;
      }
      .al-group-header .count { color: var(--text-muted); font-size: 0.78rem; font-weight: 700; }

      /* === Applicant card row === */
      .al-card {
        position: relative;
        display: grid;
        grid-template-columns: 28px 1fr 200px auto;
        gap: 14px; align-items: center;
        padding: 12px 16px 12px 14px;
        background: linear-gradient(180deg, rgba(255,255,255,0.035), rgba(255,255,255,0.01)), var(--surface);
        border: 1px solid var(--line); border-radius: var(--radius);
        text-decoration: none; color: var(--text);
        transition: border-color 0.18s, transform 0.18s, box-shadow 0.18s;
      }
      .al-card:hover {
        border-color: rgba(240,199,102,0.45);
        transform: translateY(-1px);
        box-shadow: 0 10px 22px rgba(0,0,0,0.28);
        text-decoration: none;
      }
      .al-card::before {
        content: '';
        position: absolute; left: 0; top: 8px; bottom: 8px; width: 4px;
        background: var(--ribbon, var(--line)); border-radius: 4px;
      }
      .al-card[data-ribbon="recommend"],
      .al-card[data-ribbon="recommend_interview"]   { --ribbon: #62d28f; }
      .al-card[data-ribbon="review"],
      .al-card[data-ribbon="needs_human_review"]    { --ribbon: var(--amber); }
      .al-card[data-ribbon="pending"]               { --ribbon: var(--blue); }
      .al-card[data-ribbon="dont_recommend"]        { --ribbon: var(--line); }
      .al-card[data-ribbon="does_not_meet_role_requirements"] { --ribbon: var(--red); }
      .al-card[data-ribbon="error"]                 { --ribbon: var(--red); }
      .al-card[data-ribbon="hired"]                 { --ribbon: #62d28f; }
      .al-card[data-ribbon="rejected"]              { --ribbon: var(--red); }
      .al-card[data-ribbon="withdrawn"]             { --ribbon: var(--text-soft); }
      .al-card.is-focused { box-shadow: 0 0 0 2px var(--gold-strong) inset; border-color: var(--gold-strong); }
      .al-card.is-selected { border-color: var(--gold-strong); background: linear-gradient(180deg, rgba(240,199,102,0.05), rgba(240,199,102,0.02)), var(--surface); }

      .al-card-cb {
        display: inline-flex; align-items: center; justify-content: center;
        padding-left: 6px;
      }
      .al-card-cb input { accent-color: var(--gold-strong); width: 16px; height: 16px; cursor: pointer; }

      .al-avatar {
        width: 44px; height: 44px; border-radius: 50%;
        background: linear-gradient(135deg, var(--surface-2), var(--surface-3));
        border: 1px solid var(--line);
        display: inline-flex; align-items: center; justify-content: center;
        color: var(--gold-strong); font-weight: 800; font-size: 0.92rem;
        text-transform: uppercase; letter-spacing: 0.04em;
      }

      .al-card-body { min-width: 0; }
      .al-card-row1 {
        display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap;
        margin-bottom: 4px;
      }
      .al-card-name { font-weight: 800; color: var(--text); font-size: 1.02rem; }
      .al-card-meta {
        color: var(--text-muted); font-size: 0.84rem;
        display: flex; gap: 6px; align-items: center; flex-wrap: wrap;
      }
      .al-card-meta .dot { color: var(--text-soft); margin: 0 2px; }

      .al-score {
        display: flex; flex-direction: column; gap: 4px; min-width: 0;
      }
      .al-score-line {
        display: flex; align-items: baseline; gap: 6px;
        font-size: 0.86rem;
      }
      .al-score-num { font-weight: 800; color: var(--text); font-size: 1.02rem; }
      .al-score-of { color: var(--text-muted); font-size: 0.74rem; }
      .al-score-conf { color: var(--text-muted); font-size: 0.74rem; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 700; margin-left: auto; }
      .al-score-bar {
        position: relative;
        height: 6px; border-radius: 3px;
        background: rgba(255,255,255,0.06); overflow: hidden;
      }
      .al-score-bar > span {
        display: block; height: 100%;
        background: linear-gradient(90deg, #62d28f, var(--gold-strong));
      }
      .al-score-pending { color: var(--text-muted); font-size: 0.82rem; font-style: italic; }

      .al-card-actions {
        display: flex; gap: 4px;
        opacity: 0; transition: opacity 0.18s;
      }
      .al-card:hover .al-card-actions,
      .al-card:focus-within .al-card-actions { opacity: 1; }
      .al-card-actions .icon-btn {
        width: 32px; height: 32px; padding: 0;
        display: inline-flex; align-items: center; justify-content: center;
        background: rgba(255,255,255,0.05); border: 1px solid var(--line);
        border-radius: 6px; color: var(--text); cursor: pointer;
        font-size: 1rem; line-height: 1; text-decoration: none;
      }
      .al-card-actions .icon-btn:hover { background: rgba(255,255,255,0.08); border-color: var(--gold-strong); color: var(--gold-strong); }
      .al-card-actions .icon-btn.is-success:hover { color: #a4f4c2; border-color: rgba(98,210,143,0.5); background: rgba(98,210,143,0.1); }
      .al-card-actions .icon-btn.is-danger:hover  { color: #ffb3b3; border-color: rgba(255,123,123,0.5); background: rgba(255,123,123,0.1); }

      @media (max-width: 760px) {
        .al-card { grid-template-columns: 22px 1fr; row-gap: 6px; }
        .al-score { grid-column: 1 / -1; }
        .al-card-actions { grid-column: 1 / -1; justify-content: flex-end; opacity: 1; }
      }

      /* === Reject modal === */
      .al-modal-overlay {
        position: fixed; inset: 0; z-index: 100;
        display: none; align-items: center; justify-content: center;
        background: rgba(0,0,0,0.55);
        backdrop-filter: blur(2px);
      }
      .al-modal-overlay.is-open { display: flex; }
      .al-modal {
        width: min(520px, 92vw); max-height: 90vh; overflow-y: auto;
        background: linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01)), var(--surface-2);
        border: 1px solid var(--line); border-radius: var(--radius);
        box-shadow: 0 24px 60px rgba(0,0,0,0.55);
        padding: 22px 24px;
      }
      .al-modal h3 {
        margin: 0 0 6px;
        font-size: 1.1rem; color: var(--text);
      }
      .al-modal .al-modal-sub { color: var(--text-muted); font-size: 0.86rem; margin: 0 0 14px; }
      .al-modal label { display: block; font-size: 0.74rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.06em; font-weight: 800; margin-bottom: 4px; margin-top: 14px; }
      .al-modal textarea, .al-modal input[type="text"] {
        width: 100%; box-sizing: border-box;
        background: var(--bg-soft); color: var(--text);
        border: 1px solid var(--line); border-radius: var(--radius);
        padding: 9px 11px; font-size: 0.92rem; font-family: inherit;
      }
      .al-modal textarea { min-height: 80px; resize: vertical; }
      .al-modal .al-modal-row {
        display: flex; align-items: center; gap: 8px;
        padding: 10px 12px; margin-top: 12px;
        background: rgba(255,255,255,0.03); border: 1px solid var(--line); border-radius: 6px;
        color: var(--text); font-size: 0.88rem;
      }
      .al-modal .al-modal-row input[type="checkbox"] { accent-color: var(--gold-strong); }
      .al-modal .al-modal-note {
        margin-top: 12px; padding: 10px 12px;
        background: rgba(242,166,90,0.08); border-left: 3px solid var(--amber); border-radius: 4px;
        color: var(--text); font-size: 0.82rem; line-height: 1.5;
      }
      .al-modal .al-modal-actions {
        display: flex; justify-content: flex-end; gap: 10px;
        margin-top: 18px;
      }

      /* === Floating bulk action bar === */
      .al-bulk-bar {
        position: sticky; bottom: 16px; z-index: 25;
        margin-top: 14px;
        display: none; align-items: center; gap: 10px; flex-wrap: wrap;
        padding: 12px 16px;
        background: linear-gradient(180deg, var(--surface-2), var(--surface));
        border: 1px solid var(--gold-strong); border-radius: var(--radius);
        box-shadow: 0 12px 32px rgba(0,0,0,0.45);
      }
      .al-bulk-bar.is-visible { display: flex; }
      .al-bulk-bar .count { color: var(--gold-strong); font-weight: 800; }
      .al-bulk-bar select {
        background: var(--bg-soft); color: var(--text);
        border: 1px solid var(--line); padding: 6px 10px;
        border-radius: 6px; font-size: 0.86rem;
      }

      /* === Empty state === */
      .al-empty {
        text-align: center;
        padding: 36px 22px;
        border: 1px dashed rgba(255, 255, 255, 0.18);
        border-radius: var(--radius);
        background: rgba(255,255,255,0.02);
        color: var(--text-muted); line-height: 1.55;
      }
      .al-empty strong { color: var(--text); display: block; margin-bottom: 6px; font-size: 1.02rem; }

      /* === Saved views === */
      .al-saved {
        display: flex; flex-wrap: wrap; gap: 8px;
        margin: 6px 0 18px;
        align-items: center;
        font-size: 0.82rem;
        color: var(--text-muted);
      }
      .al-saved .lbl { font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; font-size: 0.7rem; }
      .al-saved a {
        display: inline-flex; align-items: center; gap: 4px;
        padding: 5px 11px; border-radius: 999px;
        background: rgba(255,255,255,0.04); border: 1px solid var(--line);
        color: var(--text); font-size: 0.8rem; font-weight: 700; text-decoration: none;
      }
      .al-saved a:hover { border-color: var(--gold-strong); color: var(--gold-strong); }

      /* === Print styles === */
      @media print {
        body { background: white !important; color: black !important; }
        .admin-nav, .ap-hero-actions, .ap-tl-cancel-toggle, .ap-schedule-toggle, .ap-menu, .ap-copy, .ap-shortcut-hint, .ap-notes form button, form { color: black !important; }
        .ap-stepper, .ap-card, .ap-hero, .ai-verdict, .ai-followups, .ai-cats, .ai-watchout, details.ai-collapse {
          background: white !important; border: 1px solid #ccc !important; color: black !important; box-shadow: none !important;
        }
        details, details.ai-collapse, details.ai-cat-toggle { display: block; }
        details > summary { display: none; }
        .ap-rail { position: static; }
        .ap-grid { grid-template-columns: 1fr; }
        .ap-tl-cancel-toggle, .ap-schedule-toggle { display: none; }
        h1, h2, h3, h4, .ap-card-head h2, .ap-narrative-head .lbl { color: black !important; }
        .app-badge, .ai-rec-badge, .ai-verdict-pill, .pill { color: #333 !important; background: #eee !important; border: 1px solid #ccc !important; }
        a { color: black !important; text-decoration: none !important; }
      }
    </style>
  `;
}

function aiRecBadge(application) {
  // Accepts the whole application so we can distinguish "no quiz yet" from
  // "quiz in, AI still running".
  const ev = application && application.aiEvaluation;
  const hasQuiz = application && application.questionnaire;
  if (!ev) {
    if (!hasQuiz) {
      const invited = application && application.questionnaireInviteSentAt;
      const label = invited ? 'Quiz not done — reminded' : 'Quiz not done';
      return `<span class="ai-rec-badge ai-rec-pending">${escHTML(label)}</span>`;
    }
    return '<span class="ai-rec-badge ai-rec-pending">Quiz in — evaluating</span>';
  }
  if (ev.errorDetail) return '<span class="ai-rec-badge ai-rec-error">Screening error</span>';
  const bucket = verdictBucketForApplication(application) || verdictBucketFor(ev.recommendation);
  const label = VERDICT_LABELS[bucket] || bucket;
  return `<span class="ai-rec-badge ai-rec-${escHTML(bucket)}">${escHTML(label)}</span>`;
}

// Three manager-facing verdicts. Internal model recommendations map to:
//   strong_callback / callback  → recommend_interview (when no flags or gaps)
//   maybe / hold (with human-review flag or borderline)  → needs_human_review
//   maybe / hold (with hard role-requirement gap)  → does_not_meet_role_requirements
//
// The eval row may carry the precomputed `verdictBucket` from a v4 evaluation;
// if so, trust it. Older rows fall back to the legacy bucket derivation so the
// detail page still renders without re-running the screener.
function verdictBucketFor(rec) {
  return rec === 'strong_callback' || rec === 'callback' ? 'recommend' : 'dont_recommend';
}

function verdictBucketForApplication(application) {
  const ev = application && application.aiEvaluation;
  if (!ev) return null;
  // Trust the v4 precomputed bucket if it's present.
  if (ev.verdictBucket && VERDICT_LABELS[ev.verdictBucket]) return ev.verdictBucket;
  // Legacy fallback: map the old two-bucket result to the new vocabulary.
  if (ev.humanReviewRequired) return 'needs_human_review';
  if (ev.recommendation === 'strong_callback' || ev.recommendation === 'callback') return 'recommend_interview';
  return 'needs_human_review';
}

const VERDICT_LABELS = {
  recommend_interview:           'Recommend interview',
  needs_human_review:            'Needs human review',
  does_not_meet_role_requirements: 'Does not meet role requirements',
  // Legacy two-state values stay defined so old evaluations still render.
  recommend:      'Recommend interview',
  dont_recommend: 'Needs human review',
};

const VERDICT_HEADLINES = {
  strong_callback: 'Strong fit — bring them in.',
  callback: 'Worth bringing in.',
  maybe: 'Mixed signals — would not interview without more info.',
  hold: 'Skip — answers do not meet the bar.',
};

function aiEvaluationPanel(application) {
  const ev = application.aiEvaluation;
  if (!ev) {
    if (!application.questionnaire) {
      const inviteNote = application.questionnaireInviteSentAt
        ? ` Reminder email sent on ${escHTML(formatFriendly(application.questionnaireInviteSentAt))}.`
        : '';
      return `
        <div class="ai-verdict is-pending">
          <span class="ai-verdict-pill is-pending">Awaiting questionnaire</span>
          <span></span>
          <div class="ai-verdict-summary">The applicant has not yet completed the hospitality questionnaire. Screening runs automatically once they submit it.${inviteNote}</div>
        </div>`;
    }
    return `
      <div class="ai-verdict is-pending">
        <span class="ai-verdict-pill is-pending">Evaluating…</span>
        <span></span>
        <div class="ai-verdict-summary">Questionnaire submitted; screening is still in flight. Refresh in a moment.</div>
      </div>`;
  }

  if (ev.errorDetail) {
    return `
      <div class="ai-watchout ai-watchout-error">
        <h3>Screening could not complete</h3>
        <p style="margin:0; color:#f4c5c5;">${escHTML(ev.errorDetail)}</p>
        <p style="margin:8px 0 12px; color:var(--muted); font-size:0.82rem;">Review the questionnaire answers below and make a decision manually, or retry now if the underlying issue is fixed.</p>
        <form method="POST" action="/admin/applicants/${escHTML(application.id)}/retry-screening" style="margin:0;" onsubmit="return confirm('Re-run screening for this applicant? This will use API credits.');">
          <button type="submit" class="btn btn-secondary btn-sm">Retry screening</button>
        </form>
      </div>`;
  }

  const rec = ev.recommendation || 'hold';
  const scoreLabel = typeof ev.weightedScore === 'number' ? ev.weightedScore.toFixed(1) : '—';
  const confidenceLabel = ev.confidence ? ev.confidence.charAt(0).toUpperCase() + ev.confidence.slice(1) : '—';
  const headline = VERDICT_HEADLINES[rec] || '';
  const summary = ev.candidateSummary || ev.overallRationale || headline;

  const reviewReasons = Array.isArray(ev.humanReviewReasons) ? ev.humanReviewReasons : [];
  const concerns = Array.isArray(ev.jobRelatedConcerns) ? ev.jobRelatedConcerns : [];
  const followUps = Array.isArray(ev.suggestedInterviewQuestions) ? ev.suggestedInterviewQuestions : [];
  const categoryScores = Array.isArray(ev.categoryScores) ? ev.categoryScores : [];

  // Verdict card — the one line a GM needs to read
  const bucket = verdictBucketForApplication(application) || verdictBucketFor(rec);
  const verdict = `
    <div class="ai-verdict is-${escHTML(bucket)}">
      <div>
        <span class="ai-verdict-pill is-${escHTML(bucket)}">${escHTML(VERDICT_LABELS[bucket] || bucket)}</span>
        <div class="ai-verdict-confidence">Confidence: ${escHTML(confidenceLabel)}</div>
      </div>
      <div class="ai-verdict-score">${escHTML(scoreLabel)}<small>Score / 5</small></div>
      <div class="ai-verdict-summary">${summary ? escHTML(summary) : ''}</div>
    </div>`;

  // Watch outs — only render when there's something the GM needs to know
  const watchoutItems = [];
  if (ev.humanReviewRequired && reviewReasons.length) {
    for (const r of reviewReasons) watchoutItems.push(escHTML(r));
  } else if (ev.humanReviewRequired) {
    watchoutItems.push('Manager review required before any decision.');
  }
  for (const c of concerns) watchoutItems.push(escHTML(c));
  const watchouts = watchoutItems.length ? `
    <div class="ai-watchout">
      <h3>Watch outs</h3>
      <ul>${watchoutItems.map((t) => `<li>${t}</li>`).join('')}</ul>
    </div>` : '';

  // Interview follow-ups — front and center
  const followupsBlock = followUps.length ? `
    <div class="ai-followups">
      <h3>For your interview — ask these</h3>
      <ol>${followUps.map((q) => `<li>${escHTML(q)}</li>`).join('')}</ol>
    </div>` : '';

  // Category breakdown — compact list with a click-to-expand for evidence
  const categoryRows = categoryScores.map((cat) => {
    const score = typeof cat.score === 'number' ? cat.score : 0;
    const meterPct = Math.max(0, Math.min(100, score * 20));
    const ev2 = Array.isArray(cat.evidence) ? cat.evidence : [];
    const con = Array.isArray(cat.concerns) ? cat.concerns : [];
    // v4 evidence fields (may be absent on older evaluations).
    const supportingIds = Array.isArray(cat.supportingAnswerIds) ? cat.supportingAnswerIds : [];
    const strongest = cat.strongestEvidence ? String(cat.strongestEvidence) : '';
    const concernEv = cat.concernEvidence ? String(cat.concernEvidence) : '';
    const perConf = cat.perCategoryConfidence ? String(cat.perCategoryConfidence) : '';
    const followUp = cat.followUpQuestion ? String(cat.followUpQuestion) : '';
    const hasDetail = (cat.rationale && cat.rationale.length) || ev2.length || con.length || strongest || concernEv || followUp;
    const sourceLine = supportingIds.length
      ? `<div class="ai-cat-source">Source: ${supportingIds.map((s) => `<span class="ai-cat-qid">${escHTML(s)}</span>`).join(' ')}${perConf ? ` &middot; <span class="ai-cat-conf">${escHTML(perConf)} confidence</span>` : ''}</div>`
      : '';
    const row = `
      <div class="ai-cat-row">
        <div class="label">${escHTML(formatCategoryLabel(cat.category))}</div>
        <div class="meter"><span style="width:${meterPct}%"></span></div>
        <div class="num">${score || '—'}<small>/5</small></div>
      </div>
      ${sourceLine}`;
    if (!hasDetail) return row;
    return `
      ${row}
      <details class="ai-cat-toggle">
        <summary>Why this score &middot; evidence</summary>
        <div class="ai-cat-detail">
          ${cat.rationale ? `<div class="why">${escHTML(cat.rationale)}</div>` : ''}
          ${strongest ? `<h4>Strongest evidence</h4><blockquote class="ai-cat-quote">${escHTML(strongest)}</blockquote>` : ''}
          ${ev2.length ? `<h4>Evidence excerpts</h4><ul>${ev2.map((e) => `<li>${escHTML(e)}</li>`).join('')}</ul>` : ''}
          ${concernEv ? `<h4>Concern evidence</h4><blockquote class="ai-cat-quote ai-cat-quote-concern">${escHTML(concernEv)}</blockquote>` : ''}
          ${con.length ? `<h4>Concerns</h4><ul class="concerns">${con.map((c) => `<li>${escHTML(c)}</li>`).join('')}</ul>` : ''}
          ${followUp ? `<h4>Suggested interview follow-up</h4><div class="ai-cat-followup">${escHTML(followUp)}</div>` : ''}
        </div>
      </details>`;
  }).join('');

  const categories = categoryRows ? `
    <div class="ai-cats">
      <h3>Category scores</h3>
      ${categoryRows}
    </div>` : '';

  const meta = `
    <div class="ai-meta">
      Reminder: this screening is advisory only. Manager review required before any callback.
      ${ev.possibleBetterRoleFit ? ` &middot; Possible better fit: ${escHTML(ev.possibleBetterRoleFit)}` : ''}
    </div>`;

  return `${verdict}${watchouts}${followupsBlock}${categories}${meta}`;
}

const CATEGORY_LABEL_MAP = {
  speak_up: 'Speak Up',
  be_reliable: 'Be Reliable',
  support_each_other: 'Support Each Other',
  keep_moving_forward: 'Keep Moving Forward',
  own_guest_experience: 'Own the Guest Experience',
};
function formatCategoryLabel(key) {
  return CATEGORY_LABEL_MAP[key] || (key || '').replace(/_/g, ' ');
}

function questionnaireAnswersPanel(application) {
  const q = application.questionnaire;
  if (!q || !q.answers) return '';
  const { QUESTIONS, questionsForVersion, effectiveQuestionsForApplicant } = require('../hiring/knowledgeBase');
  // Pick the question set that was in force when this questionnaire was
  // submitted. For the current version, also filter to the applicant's
  // role (role-specific questions only appear for tagged roles).
  const versioned = questionsForVersion(q.version);
  const questions = versioned === QUESTIONS ? effectiveQuestionsForApplicant(application) : versioned;
  // Catch any orphaned answers whose IDs aren't in the resolved question set
  // (e.g. mixed-version edge cases). Render them at the end so nothing is lost.
  const knownIds = new Set(questions.map((qq) => qq.id));
  const orphanIds = Object.keys(q.answers || {}).filter((k) => !knownIds.has(k));

  const blocks = questions.map((qq, idx) => {
    const a = q.answers[qq.id] || '(no answer)';
    return `
      <div class="answer-q">Q${idx + 1}. ${escHTML(qq.text)}</div>
      <div class="answer-a">${escHTML(a)}</div>`;
  }).join('') + orphanIds.map((id) => {
    return `
      <div class="answer-q" style="color:var(--text-soft);">Other (${escHTML(id)})</div>
      <div class="answer-a">${escHTML(q.answers[id] || '')}</div>`;
  }).join('');

  const versionTag = q.version ? `<span style="color:var(--text-soft); font-weight:400; font-size:0.74rem; margin-left:6px;">${escHTML(q.version)}</span>` : '';
  return `
    <details class="ai-collapse">
      <summary>Show all ${questions.length} questionnaire answers <span style="color:var(--muted); font-weight:400; font-size:0.78rem;">&middot; submitted ${escHTML(formatFriendly(q.submittedAt))}</span>${versionTag}</summary>
      ${blocks}
    </details>`;
}

// Initials for an avatar circle.
function initialsOf(name) {
  if (!name) return '?';
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Decide which color ribbon the card should show. Terminal statuses (hired,
// rejected, withdrawn) override the recommendation since the decision is final.
function ribbonKey(a) {
  if (a.status === 'hired') return 'hired';
  if (a.status === 'rejected') return 'rejected';
  if (a.status === 'withdrawn') return 'withdrawn';
  const ev = a.aiEvaluation;
  if (!ev) return 'pending';
  if (ev.errorDetail) return 'error';
  // v4: trust the precomputed verdictBucket; fall back for legacy rows.
  const bucket = verdictBucketForApplication(a);
  if (bucket) return bucket;
  if (ev.humanReviewRequired) return 'needs_human_review';
  return verdictBucketFor(ev.recommendation);
}

// Short, friendly "applied {N} {unit} ago" — saves horizontal space vs. the
// full friendly timestamp in the existing helper.
function timeAgo(value) {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return '';
  const sec = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

// Build a URL with the current filters merged with overrides. Used to make the
// chip rail "toggle" the corresponding param without losing the other filters.
function buildListUrl(filters, overrides) {
  const merged = { ...filters, ...overrides };
  const params = new URLSearchParams();
  Object.entries(merged).forEach(([k, v]) => {
    if (v == null || v === '' || v === 'none' || (k === 'sort' && v === 'newest')) return;
    // Map view-side keys to URL keys
    const urlKey = k === 'aiRec' ? 'ai_rec'
      : k === 'hasInterview' ? 'has_interview'
      : k;
    params.set(urlKey, String(v));
  });
  const qs = params.toString();
  return qs ? `/admin/applicants?${qs}` : '/admin/applicants';
}

function renderApplicantCard(a) {
  const ribbon = ribbonKey(a);
  const locName = a.location?.name || '';
  const positionLabel = a.position === 'Other' && a.positionOther
    ? `${a.position} (${a.positionOther})`
    : (a.position || '—');

  const ev = a.aiEvaluation;
  const score = ev && typeof ev.weightedScore === 'number' ? ev.weightedScore : null;
  const scoreHtml = score != null ? `
    <div class="al-score-line">
      <span class="al-score-num">${score.toFixed(1)}</span>
      <span class="al-score-of">/ 5</span>
      ${ev.confidence ? `<span class="al-score-conf">${escHTML(ev.confidence)}</span>` : ''}
    </div>
    <div class="al-score-bar"><span style="width:${Math.max(0, Math.min(100, score * 20))}%;"></span></div>
  ` : `<div class="al-score-pending">${ev && ev.errorDetail ? 'Screening error' : (a.questionnaire ? 'Evaluating…' : 'Quiz pending')}</div>`;

  // The advance-to-next status, if any (mirrors NEXT_STEP on the detail page).
  const next = NEXT_STEP[a.status];

  return `
    <div class="al-card" data-ribbon="${escAttr(ribbon)}" data-applicant-id="${escAttr(a.id)}" data-applicant-name="${escAttr(a.name)}" data-status="${escAttr(a.status)}" tabindex="-1">
      <label class="al-card-cb" title="Select" onclick="event.stopPropagation();">
        <input type="checkbox" data-bulk-cb value="${escAttr(a.id)}" />
      </label>
      <a class="al-card-body" href="/admin/applicants/${escAttr(a.id)}" data-card-link>
        <div class="al-card-row1">
          <span class="al-card-name">${escHTML(a.name)}</span>
          ${statusBadge(a.status)}
          ${aiRecBadge(a)}
          ${ev && ev.humanReviewRequired ? '<span class="ai-review-badge">Needs review</span>' : ''}
        </div>
        <div class="al-card-meta">
          <span>${escHTML(positionLabel)}</span>
          ${locName ? `<span class="dot">•</span><span>${escHTML(locName)}</span>` : ''}
          <span class="dot">•</span>
          <span title="${escAttr(formatFriendly(a.createdAt))}">Applied ${escHTML(timeAgo(a.createdAt))}</span>
          ${(a._count && a._count.interviews > 0) ? `<span class="dot">•</span><span>${a._count.interviews} interview${a._count.interviews === 1 ? '' : 's'}</span>` : ''}
        </div>
      </a>
      <div class="al-score">${scoreHtml}</div>
      <div class="al-card-actions">
        ${next && next.status ? `
          <form method="POST" action="/admin/applicants/${escAttr(a.id)}/status" style="margin:0;" onsubmit="return confirm('Move ${escAttr(a.name)} to ${escAttr(STATUS_LABELS[next.status])}?')">
            <input type="hidden" name="status" value="${escAttr(next.status)}" />
            <button type="submit" class="icon-btn is-success" title="${escAttr(next.label)}" aria-label="${escAttr(next.label)}">→</button>
          </form>` : ''}
        ${!TERMINAL_STATUSES.has(a.status) ? `
          <button type="button" class="icon-btn is-danger" data-open-reject="${escAttr(a.id)}" data-name="${escAttr(a.name)}" data-interviews="${a._count && a._count.interviews ? a._count.interviews : 0}" title="Reject" aria-label="Reject">✕</button>
        ` : ''}
        <a class="icon-btn" href="/admin/applicants/${escAttr(a.id)}" title="Open" aria-label="Open">↗</a>
      </div>
    </div>`;
}

// Shared modal for rejection — used by list page and detail page. Stays hidden
// until JS sets data-mode + populates fields. Always submits to a single
// endpoint; the JS handler fans the request out for bulk operations.
function rejectModalHtml() {
  return `
    <div class="al-modal-overlay" id="alRejectOverlay" aria-hidden="true">
      <div class="al-modal" role="dialog" aria-modal="true" aria-labelledby="alRejectTitle">
        <h3 id="alRejectTitle">Reject applicant</h3>
        <p class="al-modal-sub" id="alRejectSub">This will move them to Rejected.</p>

        <label for="alRejectReason">Reason (optional, saved to internal notes)</label>
        <textarea id="alRejectReason" placeholder="e.g. Availability didn't match the role, or experience gap on bartending"></textarea>

        <div class="al-modal-row" id="alRejectInterviewsRow" style="display:none;">
          <span aria-hidden="true">⛌</span>
          <span><strong id="alRejectInterviewCount">0</strong> scheduled interview<span id="alRejectInterviewPlural">s</span> will be auto-cancelled.</span>
        </div>

        <div class="al-modal-row">
          <input type="checkbox" id="alRejectSendEmail" />
          <label for="alRejectSendEmail" style="margin:0; text-transform:none; letter-spacing:0; font-size:0.88rem; color:var(--text); font-weight:600;">
            Send a polite rejection email to the candidate
          </label>
        </div>

        <div class="al-modal-note">
          Rejection is reversible — open the applicant later and use "Change status" to put them back in the pipeline. Cancelled interviews don't come back automatically though.
        </div>

        <div class="al-modal-actions">
          <button type="button" class="btn btn-secondary" id="alRejectCancel">Cancel</button>
          <button type="button" class="btn btn-danger" id="alRejectConfirm">Reject</button>
        </div>
      </div>
    </div>`;
}

// Shared client-side script that wires up the reject modal. Returns a string
// suitable for inclusion inside a <script> tag.
function rejectModalScript() {
  return `
    (function () {
      var overlay = document.getElementById('alRejectOverlay');
      if (!overlay) return;
      var sub = document.getElementById('alRejectSub');
      var reason = document.getElementById('alRejectReason');
      var sendEmail = document.getElementById('alRejectSendEmail');
      var ivRow = document.getElementById('alRejectInterviewsRow');
      var ivCount = document.getElementById('alRejectInterviewCount');
      var ivPlural = document.getElementById('alRejectInterviewPlural');
      var confirmBtn = document.getElementById('alRejectConfirm');
      var cancelBtn = document.getElementById('alRejectCancel');
      var pending = { ids: [], names: [], interviews: 0 };

      function open(opts) {
        pending = opts || { ids: [], names: [], interviews: 0 };
        var n = pending.ids.length;
        if (n === 1) {
          sub.textContent = 'Move ' + (pending.names[0] || 'this applicant') + ' to Rejected.';
        } else {
          sub.textContent = 'Move ' + n + ' applicants to Rejected.';
        }
        reason.value = '';
        sendEmail.checked = false;
        if (pending.interviews > 0) {
          ivRow.style.display = '';
          ivCount.textContent = pending.interviews;
          ivPlural.textContent = pending.interviews === 1 ? '' : 's';
        } else {
          ivRow.style.display = 'none';
        }
        overlay.classList.add('is-open');
        overlay.setAttribute('aria-hidden', 'false');
        setTimeout(function () { reason.focus(); }, 50);
        confirmBtn.disabled = false;
        confirmBtn.textContent = n > 1 ? ('Reject ' + n) : 'Reject';
      }
      function close() {
        overlay.classList.remove('is-open');
        overlay.setAttribute('aria-hidden', 'true');
      }
      window.__openRejectModal = open;
      window.__closeRejectModal = close;

      // List-page card buttons.
      document.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-open-reject]');
        if (!btn) return;
        e.preventDefault();
        open({
          ids: [btn.getAttribute('data-open-reject')],
          names: [btn.getAttribute('data-name') || ''],
          interviews: parseInt(btn.getAttribute('data-interviews') || '0', 10) || 0,
        });
      });

      cancelBtn.addEventListener('click', close);
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) close();
      });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && overlay.classList.contains('is-open')) close();
      });

      confirmBtn.addEventListener('click', function () {
        if (!pending.ids.length) return close();
        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Rejecting…';
        var note = reason.value.trim();
        var doEmail = sendEmail.checked ? '1' : '';
        Promise.all(pending.ids.map(function (id) {
          var body = new URLSearchParams();
          body.set('status', 'rejected');
          if (note) body.set('note', note);
          if (doEmail) body.set('sendEmail', '1');
          return fetch('/admin/applicants/' + encodeURIComponent(id) + '/status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString(),
            credentials: 'same-origin',
            redirect: 'manual',
          }).catch(function () { return null; });
        })).then(function () {
          window.location.reload();
        });
      });
    })();
  `;
}

function applicantsList({ applications, locations, filters, counts, user, flashMsg, canSeeMultipleLocations, pendingInviteCount = 0, failedScreeningCount = 0 }) {
  // Normalize the filters object so chip-building can read consistent keys.
  const f = {
    status: filters.status || '',
    position: filters.position || '',
    location: filters.location || '',
    q: filters.q || '',
    aiRec: filters.aiRec || '',
    review: filters.review || '',
    hasInterview: filters.hasInterview || '',
    sort: filters.sort || 'newest',
    group: filters.group || 'none',
  };

  const positionOptions = ['', ...POSITIONS].map((p) => {
    const sel = f.position === p ? ' selected' : '';
    const label = p === '' ? 'All positions' : p;
    return `<option value="${escAttr(p)}"${sel}>${escHTML(label)}</option>`;
  }).join('');

  const locationOptions = canSeeMultipleLocations
    ? ['', ...locations.map(l => l.slug)].map((slug) => {
        const sel = f.location === slug ? ' selected' : '';
        const loc = locations.find(l => l.slug === slug);
        const label = slug === '' ? 'All locations' : (loc ? loc.name : slug);
        return `<option value="${escAttr(slug)}"${sel}>${escHTML(label)}</option>`;
      }).join('')
    : '';

  // Status chip rail. The "All" chip clears status; others toggle into the URL.
  // "All" by default means active pipeline (excludes rejected + withdrawn).
  // Click the Rejected / Withdrawn chips at the end to surface archived rows.
  const totalApplicants = Object.values(counts).reduce((a, b) => a + b, 0);
  const activeApplicants = totalApplicants - (counts.rejected || 0) - (counts.withdrawn || 0);
  const STATUS_CHIPS = [
    { key: '',                    label: 'Active',      count: activeApplicants },
    { key: 'new',                 label: 'New',         count: counts.new },
    { key: 'reviewing',           label: 'Reviewing',   count: counts.reviewing },
    { key: 'interview_scheduled', label: 'Interview',   count: counts.interview_scheduled },
    { key: 'offer_extended',      label: 'Offer',       count: counts.offer_extended || 0 },
    { key: 'hired',               label: 'Hired',       count: counts.hired },
    { key: 'rejected',            label: 'Rejected',    count: counts.rejected || 0, muted: true },
    { key: 'withdrawn',           label: 'Withdrawn',   count: counts.withdrawn || 0, muted: true },
  ];
  const statusChips = STATUS_CHIPS.map(c => {
    const active = f.status === c.key;
    const href = buildListUrl(f, { status: c.key });
    // Don't render an archived chip if there are no rows in it — avoids
    // surfacing a 0-count Rejected pill on a fresh install.
    if (c.muted && !active && (c.count || 0) === 0) return '';
    const cls = ['al-chip', active ? 'is-active' : '', c.muted ? 'is-archive' : ''].filter(Boolean).join(' ');
    return `<a class="${cls}" href="${escAttr(href)}">${escHTML(c.label)}<span class="count">${c.count}</span></a>`;
  }).join('');

  // Quick toggle chips
  const toggles = [
    { key: 'aiRec',        on: 'recommend', off: '',  label: '★ Recommend only', cls: 'is-toggle' },
    { key: 'review',       on: '1',         off: '',  label: '⚠ Needs review',   cls: 'is-toggle is-danger' },
    { key: 'hasInterview', on: '1',         off: '',  label: 'Has interview',    cls: 'is-toggle' },
  ];
  const toggleChips = toggles.map(t => {
    const active = f[t.key] === t.on;
    const href = buildListUrl(f, { [t.key]: active ? t.off : t.on });
    return `<a class="al-chip ${t.cls} ${active ? 'is-active' : ''}" href="${escAttr(href)}">${escHTML(t.label)}</a>`;
  }).join('');

  // Sort options
  const SORT_OPTIONS = [
    { value: 'newest',     label: 'Newest first' },
    { value: 'oldest',     label: 'Oldest first' },
    { value: 'score_desc', label: 'Score: high → low' },
    { value: 'score_asc',  label: 'Score: low → high' },
    { value: 'name_asc',   label: 'Name A → Z' },
  ];
  const sortOptionsHtml = SORT_OPTIONS.map(o => `<option value="${escAttr(o.value)}" ${f.sort === o.value ? 'selected' : ''}>${escHTML(o.label)}</option>`).join('');

  const GROUP_OPTIONS = [
    { value: 'none',     label: 'No grouping' },
    { value: 'status',   label: 'By status' },
    { value: 'position', label: 'By position' },
    { value: 'location', label: 'By location' },
  ];
  const groupOptionsHtml = GROUP_OPTIONS.map(o => `<option value="${escAttr(o.value)}" ${f.group === o.value ? 'selected' : ''}>${escHTML(o.label)}</option>`).join('');

  // Group the applications client-side (server already sorted them).
  let listBody;
  if (applications.length === 0) {
    const hasAnyFilter = !!(f.status || f.position || f.location || f.q || f.aiRec || f.review === '1' || f.hasInterview === '1');
    listBody = `
      <div class="al-empty">
        <strong>${hasAnyFilter ? 'No applicants match.' : 'No applicants yet.'}</strong>
        ${hasAnyFilter
          ? `<div>Try clearing some filters. <a href="/admin/applicants" style="color:var(--gold-strong); text-decoration:none;">Reset all →</a></div>`
          : '<div>Share the apply link to start hearing from people. Apply forms live at <code>/{location}/apply</code>.</div>'}
      </div>`;
  } else if (f.group === 'none') {
    listBody = `<div class="al-list">${applications.map(renderApplicantCard).join('')}</div>`;
  } else {
    // Group keys per dimension
    const keyFn = f.group === 'status'
      ? (a) => a.status || 'unknown'
      : f.group === 'position'
      ? (a) => (a.position && a.position !== 'Other' ? a.position : (a.positionOther || 'Other'))
      : (a) => (a.location?.name || 'Unassigned');

    const labelFn = f.group === 'status'
      ? (k) => STATUS_LABELS[k] || k
      : (k) => k;

    // Preserve the route-determined order: iterate apps, dedupe-preserving keys.
    const seen = new Set();
    const orderedKeys = [];
    const buckets = new Map();
    applications.forEach((a) => {
      const k = keyFn(a);
      if (!seen.has(k)) { seen.add(k); orderedKeys.push(k); buckets.set(k, []); }
      buckets.get(k).push(a);
    });

    listBody = orderedKeys.map((k) => {
      const items = buckets.get(k);
      return `
        <div class="al-group">
          <div class="al-group-header">
            <h2>${escHTML(labelFn(k))}</h2>
            <span class="count">${items.length}</span>
          </div>
          <div class="al-list">${items.map(renderApplicantCard).join('')}</div>
        </div>`;
    }).join('');
  }

  const flash = flashMsg ? `<div class="app-flash ${flashMsg.type === 'error' ? 'error' : 'success'}">${escHTML(flashMsg.text)}</div>` : '';

  // Saved view shortcuts — encoded querystrings.
  const savedViews = [
    { label: '★ Open recommends', href: buildListUrl({}, { aiRec: 'recommend', status: '' }) },
    { label: '⚠ Needs your review', href: buildListUrl({}, { review: '1' }) },
    { label: 'Bartender pipeline', href: buildListUrl({}, { position: 'Bartender' }) },
  ];
  const savedViewsHtml = savedViews.map(v => `<a href="${escAttr(v.href)}">${escHTML(v.label)}</a>`).join('');

  return adminLayout('Applicants', `
    ${applicantStyles()}

    <div class="al-hero">
      <div class="al-hero-left">
        <div class="admin-kicker">Hiring</div>
        <h1>Applicants</h1>
        <div class="meta-line">${totalApplicants} total · review applications, schedule interviews, move candidates through the pipeline.</div>
      </div>
      <div class="al-hero-actions">
        <div class="row">
          ${pendingInviteCount > 0 ? `
            <form method="POST" action="/admin/applicants/send-questionnaire-invites" style="margin:0;" onsubmit="return confirm('Email ${pendingInviteCount} applicant${pendingInviteCount === 1 ? '' : 's'} the questionnaire link?');">
              <button type="submit" class="btn btn-primary">Email ${pendingInviteCount} the quiz link</button>
            </form>` : ''}
          ${failedScreeningCount > 0 ? `
            <form method="POST" action="/admin/applicants/retry-failed-screenings" style="margin:0;" onsubmit="return confirm('Re-run screening for ${failedScreeningCount} applicant${failedScreeningCount === 1 ? '' : 's'}? This will use API credits.');">
              <button type="submit" class="btn btn-secondary">Retry ${failedScreeningCount} failed</button>
            </form>` : ''}
          <a href="/admin/applicants/hiring-config" class="btn btn-secondary">Screening config</a>
        </div>
        ${pendingInviteCount === 0 && failedScreeningCount === 0 ? '<span class="app-meta" style="font-size:0.78rem;">All caught up.</span>' : ''}
      </div>
    </div>

    ${flash}

    <div class="al-saved">
      <span class="lbl">Quick:</span>
      ${savedViewsHtml}
    </div>

    <div class="al-chip-rail">${statusChips}</div>
    <div class="al-chip-rail">${toggleChips}</div>

    <form method="GET" action="/admin/applicants" class="al-toolbar" id="alToolbar">
      <input type="hidden" name="status" value="${escAttr(f.status)}" />
      <input type="hidden" name="ai_rec" value="${escAttr(f.aiRec)}" />
      <input type="hidden" name="review" value="${escAttr(f.review)}" />
      <input type="hidden" name="has_interview" value="${escAttr(f.hasInterview)}" />
      ${f.position ? `<input type="hidden" name="position" value="${escAttr(f.position)}" />` : ''}
      ${f.location ? `<input type="hidden" name="location" value="${escAttr(f.location)}" />` : ''}

      <div class="al-search">
        <input type="search" name="q" id="alSearch" placeholder="Search name or email…" value="${escAttr(f.q)}" />
      </div>
      <span class="al-select-label">Sort
        <select class="al-select" name="sort" onchange="this.form.submit();">${sortOptionsHtml}</select>
      </span>
      <span class="al-select-label">Group
        <select class="al-select" name="group" onchange="this.form.submit();">${groupOptionsHtml}</select>
      </span>
      <button type="submit" class="btn btn-secondary btn-sm">Search</button>
    </form>

    <details class="al-more" ${(f.position || f.location) ? 'open' : ''}>
      <summary>More filters</summary>
      <form method="GET" action="/admin/applicants" class="body">
        <input type="hidden" name="status" value="${escAttr(f.status)}" />
        <input type="hidden" name="ai_rec" value="${escAttr(f.aiRec)}" />
        <input type="hidden" name="review" value="${escAttr(f.review)}" />
        <input type="hidden" name="has_interview" value="${escAttr(f.hasInterview)}" />
        <input type="hidden" name="sort" value="${escAttr(f.sort)}" />
        <input type="hidden" name="group" value="${escAttr(f.group)}" />
        <input type="hidden" name="q" value="${escAttr(f.q)}" />
        ${canSeeMultipleLocations ? `
        <div>
          <label>Location</label>
          <select class="al-select" name="location" onchange="this.form.submit();">${locationOptions}</select>
        </div>` : ''}
        <div>
          <label>Position</label>
          <select class="al-select" name="position" onchange="this.form.submit();">${positionOptions}</select>
        </div>
        <div style="display:flex; align-items:flex-end;">
          <a class="btn btn-secondary btn-sm" href="/admin/applicants">Reset all filters</a>
        </div>
      </form>
    </details>

    <div class="al-result-meta">Showing <strong>${applications.length}</strong> of ${totalApplicants}${applications.length === 200 ? ' (capped — narrow filters to see older results)' : ''}</div>

    ${listBody}

    <div class="al-bulk-bar" id="alBulkBar" aria-live="polite">
      <span class="count" data-bulk-count>0 selected</span>
      <span style="color:var(--text-muted);">|</span>
      <label style="font-size:0.78rem; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.06em;">Action</label>
      <select id="alBulkAction">
        <option value="advance:reviewing">Move to Reviewing</option>
        <option value="advance:interviewed">Mark interviewed</option>
        <option value="advance:offer_extended">Extend offer</option>
        <option value="advance:hired">Mark hired</option>
        <option value="reject">Reject (with optional email)</option>
      </select>
      <button type="button" class="btn btn-primary btn-sm" id="alBulkApply">Apply to N</button>
      <button type="button" class="btn btn-secondary btn-sm" id="alBulkClear">Clear</button>
    </div>

    ${rejectModalHtml()}

    <script>
      (function () {
        // ---------- Bulk select ----------
        var bar = document.getElementById('alBulkBar');
        var countEl = document.querySelector('[data-bulk-count]');
        var applyBtn = document.getElementById('alBulkApply');
        var clearBtn = document.getElementById('alBulkClear');
        var actionSel = document.getElementById('alBulkAction');

        function checked() { return Array.from(document.querySelectorAll('[data-bulk-cb]:checked')); }
        function refresh() {
          var n = checked().length;
          if (!bar) return;
          if (n > 0) {
            bar.classList.add('is-visible');
            countEl.textContent = n + ' selected';
            applyBtn.textContent = 'Apply to ' + n;
          } else {
            bar.classList.remove('is-visible');
          }
          // Toggle is-selected on the parent card for visual highlight.
          document.querySelectorAll('[data-bulk-cb]').forEach(function (cb) {
            var card = cb.closest('.al-card');
            if (card) card.classList.toggle('is-selected', cb.checked);
          });
        }
        document.addEventListener('change', function (e) {
          if (e.target && e.target.matches && e.target.matches('[data-bulk-cb]')) refresh();
        });
        if (clearBtn) clearBtn.addEventListener('click', function () {
          document.querySelectorAll('[data-bulk-cb]:checked').forEach(function (cb) { cb.checked = false; });
          refresh();
        });
        if (applyBtn) applyBtn.addEventListener('click', function () {
          var rows = checked();
          var ids = rows.map(function (cb) { return cb.value; });
          if (!ids.length) return;
          var value = actionSel.value || '';

          // Reject action goes through the shared modal so the user can pick a
          // reason and toggle the rejection email.
          if (value === 'reject') {
            var names = rows.map(function (cb) {
              var card = cb.closest('.al-card');
              return card ? (card.getAttribute('data-applicant-name') || '') : '';
            });
            var interviews = rows.reduce(function (sum, cb) {
              var card = cb.closest('.al-card');
              var iv = card ? parseInt(card.getAttribute('data-interviews') || '0', 10) : 0;
              return sum + (iv || 0);
            }, 0);
            if (typeof window.__openRejectModal === 'function') {
              window.__openRejectModal({ ids: ids, names: names, interviews: interviews });
            }
            return;
          }

          var parts = value.split(':');
          if (parts[0] !== 'advance' || !parts[1]) return;
          var status = parts[1];
          var label = actionSel.options[actionSel.selectedIndex].textContent.trim();
          if (!confirm(label + ' for ' + ids.length + ' applicant' + (ids.length === 1 ? '' : 's') + '?')) return;
          // POST sequentially to existing /admin/applicants/:id/status. Fire-and-forget;
          // then full-page reload to refresh the list with updated state.
          applyBtn.disabled = true;
          applyBtn.textContent = 'Working…';
          Promise.all(ids.map(function (id) {
            var body = new URLSearchParams();
            body.set('status', status);
            return fetch('/admin/applicants/' + encodeURIComponent(id) + '/status', {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: body.toString(),
              credentials: 'same-origin',
              redirect: 'manual',
            }).catch(function () { return null; });
          })).then(function () { window.location.reload(); });
        });

        // ---------- Keyboard nav ----------
        var cards = function () { return Array.from(document.querySelectorAll('.al-card')); };
        var focusedIdx = -1;
        function focusCard(idx) {
          var list = cards();
          if (!list.length) return;
          if (focusedIdx >= 0 && list[focusedIdx]) list[focusedIdx].classList.remove('is-focused');
          focusedIdx = Math.max(0, Math.min(list.length - 1, idx));
          var card = list[focusedIdx];
          card.classList.add('is-focused');
          card.focus({ preventScroll: false });
          card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
        document.addEventListener('keydown', function (e) {
          var tag = (e.target && e.target.tagName) || '';
          if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target && e.target.isContentEditable)) {
            if (e.key === 'Escape' && tag === 'INPUT' && e.target.id === 'alSearch') { e.target.blur(); }
            return;
          }
          if (e.metaKey || e.ctrlKey || e.altKey) return;
          var k = e.key.toLowerCase();
          if (k === 'j') { e.preventDefault(); focusCard(focusedIdx + 1); }
          else if (k === 'k') { e.preventDefault(); focusCard(Math.max(0, focusedIdx - 1)); }
          else if (k === 'enter') {
            var list = cards();
            if (focusedIdx >= 0 && list[focusedIdx]) {
              var link = list[focusedIdx].querySelector('[data-card-link]');
              if (link) { e.preventDefault(); window.location.href = link.getAttribute('href'); }
            }
          } else if (k === '/') {
            var s = document.getElementById('alSearch');
            if (s) { e.preventDefault(); s.focus(); s.select(); }
          } else if (k === 'a' || k === 'r') {
            var list2 = cards();
            if (focusedIdx < 0 || !list2[focusedIdx]) return;
            var actions = list2[focusedIdx].querySelector('.al-card-actions');
            if (!actions) return;
            var btn = k === 'a' ? actions.querySelector('.is-success') : actions.querySelector('.is-danger');
            if (btn) { e.preventDefault(); btn.click(); }
          }
        });
      })();

      ${rejectModalScript()}
    </script>
  `, user);
}

// Steps shown in the pipeline stepper. "hired" is the implicit final state — shown
// only on the stepper-footer terminal note (or via the change-status menu).
const STEPPER_STEPS = [
  { key: 'new', label: 'New' },
  { key: 'reviewing', label: 'Reviewing' },
  { key: 'interview_scheduled', label: 'Interview' },
  { key: 'interviewed', label: 'Interviewed' },
  { key: 'offer_extended', label: 'Offer' },
];

// Map current status → next linear step (label shown on the primary advance button).
// `null` means there's no auto-advance — terminal status or requires manual scheduling.
const NEXT_STEP = {
  new: { status: 'reviewing', label: 'Move to Reviewing' },
  reviewing: { status: null, label: 'Schedule interview', scrollTo: 'schedule-interview' },
  interview_scheduled: { status: 'interviewed', label: 'Mark interviewed' },
  interviewed: { status: 'offer_extended', label: 'Extend offer' },
  offer_extended: { status: 'hired', label: 'Mark hired' },
  hired: null,
  rejected: null,
  withdrawn: null,
};

function renderStepper(application) {
  const current = application.status;
  const currentIdx = STEPPER_STEPS.findIndex(s => s.key === current);
  const isTerminal = TERMINAL_STATUSES.has(current);
  // For 'hired', treat the whole row as complete.
  const stepsHtml = STEPPER_STEPS.map((step, idx) => {
    let cls = '';
    if (current === 'hired') {
      cls = idx === STEPPER_STEPS.length - 1 ? 'is-done is-current' : 'is-done';
    } else if (isTerminal) {
      // For rejected / withdrawn, fade everything; mark the step they last reached as current.
      cls = idx < currentIdx ? 'is-done' : '';
    } else if (currentIdx === -1) {
      cls = '';
    } else if (idx < currentIdx) {
      cls = 'is-done';
    } else if (idx === currentIdx) {
      cls = 'is-current';
    }
    return `
      <div class="ap-step ${cls}">
        <span class="ap-step-dot">${cls.includes('is-done') && !cls.includes('is-current') ? '✓' : (idx + 1)}</span>
        <span class="ap-step-label">${escHTML(step.label)}</span>
      </div>`;
  }).join('');

  let terminalNote = '';
  if (current === 'hired') terminalNote = '<span class="terminal-note is-positive">Hired ★</span>';
  else if (current === 'rejected') terminalNote = '<span class="terminal-note is-negative">Rejected</span>';
  else if (current === 'withdrawn') terminalNote = '<span class="terminal-note">Withdrawn</span>';

  const decisionLine = application.decisionBy
    ? `Last moved by <strong style="color:var(--text);">${escHTML(application.decisionBy)}</strong> on ${escHTML(formatFriendly(application.decisionAt))}`
    : 'No status changes yet';

  return `
    <div class="ap-stepper">
      <div class="ap-stepper-track">${stepsHtml}</div>
      <div class="ap-stepper-footer">
        ${terminalNote}
        <span>${decisionLine}</span>
      </div>
      ${application.decisionNote ? `<div class="ap-decision-note"><strong>Note:</strong>${escHTML(application.decisionNote)}</div>` : ''}
    </div>`;
}

function renderHeroActions(application, interviews) {
  const next = NEXT_STEP[application.status];
  const scheduledInterviewCount = (interviews || []).filter(i => i.status === 'scheduled').length;
  const allOptions = [
    ...STEPPER_STEPS.map(s => s.key),
    'hired',
    'rejected',
    'withdrawn',
  ];

  let primary = '';
  if (next) {
    if (next.status) {
      primary = `
        <form method="POST" action="/admin/applicants/${escHTML(application.id)}/status" style="margin:0;">
          <input type="hidden" name="status" value="${escHTML(next.status)}" />
          <button type="submit" class="btn btn-primary" id="ap-advance-btn">${escHTML(next.label)} →</button>
        </form>`;
    } else if (next.scrollTo) {
      primary = `<a href="#${escHTML(next.scrollTo)}" class="btn btn-primary" id="ap-advance-btn">${escHTML(next.label)} →</a>`;
    }
  }

  const menuOptions = allOptions.map((opt) => {
    const isCurrent = opt === application.status;
    const isDanger = opt === 'rejected' || opt === 'withdrawn';
    const label = STATUS_LABELS[opt] || opt;
    if (isCurrent) {
      return `<button type="button" class="is-current" disabled>${escHTML(label)} (current)</button>`;
    }
    // "Rejected" routes through the shared reject modal so the user can pick a
    // reason + toggle the rejection email; everything else POSTs directly.
    if (opt === 'rejected') {
      return `
        <button type="button" class="is-danger"
                data-open-reject="${escHTML(application.id)}"
                data-name="${escHTML(application.name)}"
                data-interviews="${scheduledInterviewCount}">${escHTML(label)}…</button>`;
    }
    return `
      <form method="POST" action="/admin/applicants/${escHTML(application.id)}/status">
        <input type="hidden" name="status" value="${escHTML(opt)}" />
        <button type="submit" class="${isDanger ? 'is-danger' : ''}">${escHTML(label)}</button>
      </form>`;
  }).join('<hr />');

  return `
    <div class="ap-hero-actions">
      <div class="ap-action-row">
        ${primary}
        <details class="ap-menu">
          <summary class="btn btn-secondary">Change status ▾</summary>
          <div class="ap-menu-panel">${menuOptions}</div>
        </details>
      </div>
      <a href="/admin/applicants" class="btn btn-secondary btn-sm">&larr; All applicants</a>
    </div>`;
}

function renderAvailability(availability) {
  if (!availability || typeof availability !== 'object') {
    return '<p class="app-meta">No availability provided.</p>';
  }
  const shiftKeys = Object.keys(SHIFT_LABELS);
  // Header row: empty corner cell + shift labels.
  const headerCells = [
    `<span class="ap-avail-cell is-head" aria-hidden="true"></span>`,
    ...shiftKeys.map(s => `<span class="ap-avail-cell is-head">${escHTML(SHIFT_LABELS[s])}</span>`),
  ].join('');
  const bodyCells = DAY_ORDER.map((d) => {
    const shifts = availability[d];
    const isWeekend = d === 'fri' || d === 'sat';
    const rowCells = [
      `<span class="ap-avail-cell is-day">${escHTML(DAYS_LABELS[d])}</span>`,
      ...shiftKeys.map((s) => {
        const has = Array.isArray(shifts) && shifts.includes(s);
        const cls = ['ap-avail-cell', has ? 'is-on' : '', isWeekend ? 'is-weekend' : ''].filter(Boolean).join(' ');
        return `<span class="${cls}" title="${escHTML(DAYS_LABELS[d])} · ${escHTML(SHIFT_LABELS[s])}${has ? '' : ' (unavailable)'}">${has ? '●' : '·'}</span>`;
      }),
    ].join('');
    return rowCells;
  }).join('');
  return `<div class="ap-avail-grid">${headerCells}${bodyCells}</div>`;
}

function renderInterview(interview) {
  const typeLabel = interview.type === 'phone' ? 'Phone' : interview.type === 'video' ? 'Video' : 'In person';
  const contactLabel = interview.contactMethod ? CONTACT_METHOD_LABELS[interview.contactMethod] || interview.contactMethod : null;
  const stateClass = interview.status === 'cancelled' ? 'is-cancelled'
    : interview.status === 'completed' ? 'is-completed'
    : 'is-scheduled';
  const statePill = interview.status === 'cancelled' ? '<span class="pill is-cancelled">Cancelled</span>'
    : interview.status === 'completed' ? '<span class="pill is-completed">Completed</span>'
    : interview.status === 'no_show' ? '<span class="pill is-cancelled">No-show</span>'
    : '<span class="pill is-scheduled">Scheduled</span>';

  const emailStatus = interview.confirmationSentAt
    ? '✉️ Confirmation sent'
    : (contactLabel ? `📞 Contacted via ${escHTML(contactLabel)}` : '✉️ No email sent');

  return `
    <div class="ap-tl-item ${stateClass}">
      <span class="ap-tl-dot"></span>
      <div class="ap-tl-card">
        <div class="ap-tl-head">
          <span class="when">${escHTML(formatFriendly(interview.scheduledAt))}</span>
          ${statePill}
          <span class="pill">${escHTML(typeLabel)} · ${interview.durationMinutes}m</span>
        </div>
        ${interview.locationDetail ? `<div class="ap-tl-meta"><strong style="color:var(--text);">Where:</strong> ${escHTML(interview.locationDetail)}</div>` : ''}
        ${interview.interviewerEmail ? `<div class="ap-tl-meta"><strong style="color:var(--text);">Interviewer:</strong> ${escHTML(interview.interviewerEmail)}</div>` : ''}
        ${interview.candidateNote ? `<div class="ap-tl-meta"><strong style="color:var(--text);">Note to candidate:</strong> ${escHTML(interview.candidateNote)}</div>` : ''}
        ${contactLabel && interview.contactNote ? `<div class="ap-tl-meta"><strong style="color:var(--text);">Contact note:</strong> ${escHTML(interview.contactNote)}</div>` : ''}
        ${interview.cancellationReason ? `<div class="ap-tl-meta"><strong style="color:#ffb3b3;">Cancelled:</strong> ${escHTML(interview.cancellationReason)}</div>` : ''}

        <div class="ap-tl-foot">
          <span class="ap-tl-foot-item">${emailStatus}</span>
          <span>·</span>
          <span class="ap-tl-foot-item">${interview.reminderSent24h ? '✓' : '○'} 24h reminder</span>
          <span>·</span>
          <span class="ap-tl-foot-item">${interview.reminderSent1h ? '✓' : '○'} 1h reminder</span>
        </div>

        ${interview.status === 'scheduled' ? `
        <details class="ap-tl-cancel-toggle">
          <summary>Cancel this interview</summary>
          <div class="body">
            <form method="POST" action="/admin/applicants/interviews/${escHTML(interview.id)}/cancel" onsubmit="return confirm(this.querySelector('input[name=skipEmail]')?.checked ? 'Cancel this interview without emailing the candidate?' : 'Cancel this interview? An email will be sent to the candidate.')">
              <div class="ap-form-block">
                <label>Reason (shown to candidate if emailed)</label>
                <input type="text" name="reason" placeholder="e.g. Manager unavailable, need to reschedule" />
              </div>
              <fieldset class="ap-skip-email" data-skip-email>
                <legend>Already let them know?</legend>
                <label class="toggle">
                  <input type="checkbox" name="skipEmail" value="1" data-skip-email-toggle />
                  <span>Don't email — I already told them.</span>
                </label>
                <div class="body">
                  <div class="ap-form-row">
                    <div class="ap-form-block">
                      <label>How</label>
                      <select name="contactMethod">
                        <option value="phone">Phone call</option>
                        <option value="text">Text message</option>
                        <option value="in_person">In person</option>
                        <option value="email_manual">Email (sent manually)</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                    <div class="ap-form-block">
                      <label>Note (optional)</label>
                      <input type="text" name="contactNote" placeholder="Called at 3pm, said no hard feelings." />
                    </div>
                  </div>
                </div>
              </fieldset>
              <div style="margin-top:12px; text-align:right;">
                <button type="submit" class="btn btn-danger btn-sm">Cancel interview</button>
              </div>
            </form>
          </div>
        </details>` : ''}
      </div>
    </div>`;
}

function wordCount(s) {
  if (!s || typeof s !== 'string') return 0;
  return s.trim().split(/\s+/).filter(Boolean).length;
}

function renderNarrative(label, value) {
  const empty = !value || !value.trim();
  const wc = wordCount(value);
  const thin = !empty && wc < 12;
  const cls = ['ap-narrative-block', empty ? 'is-empty' : '', thin ? 'is-thin' : ''].filter(Boolean).join(' ');
  const wcCls = ['ap-wc', thin ? 'is-thin' : ''].filter(Boolean).join(' ');
  return `
    <div class="${cls}">
      <div class="ap-narrative-head">
        <span class="lbl">${escHTML(label)}</span>
        <span class="${wcCls}">${empty ? 'no answer' : `${wc} word${wc === 1 ? '' : 's'}${thin ? ' · brief' : ''}`}</span>
      </div>
      <div class="body">${empty ? '—' : escHTML(value)}</div>
    </div>`;
}

// Onboarding card for hired applicants — sits in the right rail when the
// pipeline state is "hired". Shows the dashboard-invite state and lets the
// admin send / resend / pick a different role.
function renderOnboardingCard(application, dashboardInviteStatus, roleOptions) {
  if (application.status !== 'hired') return '';
  const inviteSent = !!application.dashboardInviteSentAt;
  const liveStatus = (dashboardInviteStatus && dashboardInviteStatus.status) || null;
  const usedAt = dashboardInviteStatus && dashboardInviteStatus.usedAt;
  const viewedAt = dashboardInviteStatus && dashboardInviteStatus.viewedAt;
  const expiresAt = dashboardInviteStatus && dashboardInviteStatus.expiresAt;
  const isExpired = liveStatus === 'EXPIRED' || (expiresAt && new Date(expiresAt) < new Date());
  const isCompleted = liveStatus === 'COMPLETED' || !!usedAt;

  // Roles: prefer prior pick on this application, else the implicit map.
  const defaultRole = application.dashboardInviteRole || '';
  const roles = (roleOptions || []).map(o => `<option value="${escAttr(o.value)}" ${defaultRole === o.value ? 'selected' : ''}>${escHTML(o.label)}</option>`).join('');

  let statusBlock = '';
  if (isCompleted) {
    statusBlock = `
      <div class="ap-onb-status is-good">
        <strong>✓ Account activated${usedAt ? ` on ${escHTML(formatFriendly(usedAt))}` : ''}.</strong>
        <div class="ap-onb-sub">They're set up in the Bartender Dashboard.</div>
      </div>`;
  } else if (isExpired) {
    statusBlock = `
      <div class="ap-onb-status is-warn">
        <strong>⚠ Invite expired.</strong>
        <div class="ap-onb-sub">Click "Resend invite" below to issue a fresh link.</div>
      </div>`;
  } else if (inviteSent) {
    statusBlock = `
      <div class="ap-onb-status is-pending">
        <strong>✉ Invite sent ${escHTML(formatFriendly(application.dashboardInviteSentAt))}.</strong>
        <div class="ap-onb-sub">${viewedAt ? `Opened ${escHTML(formatFriendly(viewedAt))} — they haven't finished signing up yet.` : "Waiting for them to open the link."}</div>
      </div>`;
  } else {
    statusBlock = `
      <div class="ap-onb-status">
        <strong>Not invited yet.</strong>
        <div class="ap-onb-sub">Send them a Bartender Dashboard registration link.</div>
      </div>`;
  }

  const submitLabel = !inviteSent
    ? 'Send dashboard invite'
    : (isExpired ? 'Resend invite' : 'Resend invite');

  return `
    <div class="ap-card" id="onboarding">
      <div class="ap-card-head">
        <h2>Onboarding</h2>
        ${inviteSent ? `<a class="ap-card-aside" href="https://bartender-app.apps.dramanddraught.com" target="_blank" rel="noopener" style="color: var(--text-muted); text-decoration: none;">Bartender ↗</a>` : ''}
      </div>
      ${statusBlock}

      <form method="POST" action="/admin/applicants/${escHTML(application.id)}/onboarding-invite" style="margin-top:12px;" onsubmit="return confirm('${inviteSent ? 'Resend' : 'Send'} the dashboard invite to ${escAttr(application.email || application.name)}?');">
        <label style="display:block; font-size:0.72rem; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.06em; font-weight:800; margin-bottom:6px;">Role</label>
        <select name="role" style="width:100%; background:var(--bg-soft); color:var(--text); border:1px solid var(--line); padding:9px 11px; border-radius:var(--radius); font-size:0.92rem; font-family:inherit;">
          <option value="">(use position default)</option>
          ${roles}
        </select>
        <div style="margin-top:12px; text-align:right;">
          <button type="submit" class="btn btn-primary btn-sm">${escHTML(submitLabel)}</button>
        </div>
      </form>
    </div>`;
}

function applicantDetail({ application, interviews, user, flashMsg, dashboardInviteStatus, dashboardRoleOptions }) {
  const flash = flashMsg ? `<div class="app-flash ${flashMsg.type === 'error' ? 'error' : 'success'}">${escHTML(flashMsg.text)}</div>` : '';
  const locName = application.location?.name || '';
  const positionLabel = application.position === 'Other' && application.positionOther
    ? `${application.position} (${application.positionOther})`
    : application.position;

  // Last contacted: most recent interview that has a contactMethod OR a confirmationSentAt.
  const lastContact = (interviews || []).reduce((acc, iv) => {
    if (iv.contactMethod || iv.confirmationSentAt) {
      const stamp = iv.contactMethod ? iv.createdAt : iv.confirmationSentAt;
      if (!acc || new Date(stamp) > new Date(acc.stamp)) {
        return {
          method: iv.contactMethod ? (CONTACT_METHOD_LABELS[iv.contactMethod] || iv.contactMethod) : 'email confirmation',
          stamp,
        };
      }
    }
    return acc;
  }, null);

  const resumeBlock = application.resumeFileName
    ? `<a class="btn btn-secondary btn-sm" href="/admin/applicants/${escHTML(application.id)}/resume" target="_blank">Download resume</a>
       <span class="app-meta" style="font-size:0.78rem;">${escHTML(application.resumeFileName)}</span>`
    : '<span class="ap-resume-empty">No resume attached</span>';

  // Contact rail card
  const contactCard = `
    <div class="ap-card" style="margin-bottom:0;">
      <div class="ap-card-head"><h2>Contact</h2></div>
      <div class="ap-contact">
        <div class="ap-contact-row">
          <span class="lbl">Email</span>
          <span class="val"><a href="mailto:${escHTML(application.email)}">${escHTML(application.email)}</a></span>
          <button type="button" class="ap-copy" data-copy="${escHTML(application.email)}">Copy</button>
        </div>
        <div class="ap-contact-row">
          <span class="lbl">Phone</span>
          <span class="val">${application.phone ? `<a href="tel:${escHTML(application.phone)}">${escHTML(application.phone)}</a>` : '—'}</span>
          ${application.phone ? `<button type="button" class="ap-copy" data-copy="${escHTML(application.phone)}">Copy</button>` : '<span></span>'}
        </div>
        <div class="ap-contact-row">
          <span class="lbl">21+</span>
          <span class="val">${application.age21 ? 'Yes' : 'No'}</span>
          <span></span>
        </div>
        <div class="ap-contact-row">
          <span class="lbl">Starts</span>
          <span class="val">${escHTML(formatDateOnly(application.earliestStart) || '—')}</span>
          <span></span>
        </div>
        <div class="ap-contact-row">
          <span class="lbl">Years exp</span>
          <span class="val">${application.yearsExperience != null ? application.yearsExperience : '—'}</span>
          <span></span>
        </div>
        ${application.referredBy ? `
        <div class="ap-contact-row">
          <span class="lbl">Referred</span>
          <span class="val">${escHTML(application.referredBy)}</span>
          <span></span>
        </div>` : ''}
        ${application.certifications ? `
        <div class="ap-contact-row">
          <span class="lbl">Certs</span>
          <span class="val">${escHTML(application.certifications)}</span>
          <span></span>
        </div>` : ''}
        ${lastContact ? `
        <div class="ap-contact-row">
          <span class="lbl">Last contact</span>
          <span class="val">${escHTML(lastContact.method)} · ${escHTML(formatFriendly(lastContact.stamp))}</span>
          <span></span>
        </div>` : ''}
      </div>
    </div>`;

  const availabilityCard = `
    <div class="ap-card" style="margin-bottom:0;">
      <div class="ap-card-head"><h2>Availability</h2></div>
      ${renderAvailability(application.availability)}
    </div>`;

  const resumeCard = `
    <div class="ap-card" style="margin-bottom:0;">
      <div class="ap-card-head"><h2>Resume</h2></div>
      <div class="ap-resume">${resumeBlock}</div>
    </div>`;

  const notesCard = `
    <div class="ap-card" style="margin-bottom:0;">
      <div class="ap-card-head">
        <h2>Internal notes</h2>
        <span class="ap-card-aside ap-notes-status" data-notes-status></span>
      </div>
      <form class="ap-notes" data-notes-form action="/admin/applicants/${escHTML(application.id)}/notes" method="POST">
        <textarea name="internalNotes" placeholder="Private notes — autosaves as you type." data-notes-input>${escHTML(application.internalNotes || '')}</textarea>
        <noscript><div style="text-align:right;"><button type="submit" class="btn btn-secondary btn-sm">Save notes</button></div></noscript>
      </form>
    </div>`;

  // Narrative blocks (left column)
  const narrativeCard = `
    <div class="ap-card">
      <div class="ap-card-head"><h2>Narrative</h2></div>
      <div class="ap-narrative">
        ${renderNarrative('Most recent employers', application.priorEmployers)}
        ${renderNarrative('Spirit knowledge / specialties', application.spiritKnowledge)}
        ${renderNarrative('Why D&D?', application.whyDD)}
      </div>
    </div>`;

  // Interview timeline + collapsible schedule form
  const interviewItems = (interviews || []).length === 0
    ? '<div class="ap-timeline-empty">No interviews scheduled yet.</div>'
    : interviews.map(renderInterview).join('');

  const interviewsCard = `
    <div class="ap-card" id="schedule-interview">
      <div class="ap-card-head"><h2>Interviews</h2></div>
      <div class="ap-timeline">${interviewItems}</div>

      <details class="ap-schedule-toggle">
        <summary>+ Schedule new interview</summary>
        <div class="body">
          <form method="POST" action="/admin/applicants/${escHTML(application.id)}/interviews">
            <div class="ap-form-row">
              <div class="ap-form-block">
                <label>Date &amp; time (Eastern)</label>
                <input type="datetime-local" name="scheduledAt" required />
              </div>
              <div class="ap-form-block">
                <label>Duration (minutes)</label>
                <input type="number" name="durationMinutes" min="15" max="240" value="30" />
              </div>
            </div>
            <div class="ap-form-row" style="margin-top:12px;">
              <div class="ap-form-block">
                <label>Type</label>
                <select name="type">
                  <option value="in_person">In person</option>
                  <option value="phone">Phone</option>
                  <option value="video">Video</option>
                </select>
              </div>
              <div class="ap-form-block">
                <label>Interviewer email</label>
                <input type="email" name="interviewerEmail" placeholder="${escHTML(user?.email || '')}" />
              </div>
            </div>
            <div class="ap-form-block" style="margin-top:12px;">
              <label>Where / link (address, phone number, or meeting URL)</label>
              <input type="text" name="locationDetail" placeholder="486 N Patterson Ave  •  https://meet.google.com/...  •  (919) 555-0123" />
            </div>
            <div class="ap-form-block" style="margin-top:12px;">
              <label>Note shown to candidate (optional)</label>
              <textarea name="candidateNote" placeholder="Anything they should bring or know."></textarea>
            </div>

            <fieldset class="ap-skip-email" data-skip-email>
              <legend>Already reached out?</legend>
              <label class="toggle">
                <input type="checkbox" name="skipEmail" value="1" data-skip-email-toggle />
                <span>Don't email the candidate — I already contacted them directly.</span>
              </label>
              <div class="body">
                <div class="ap-form-row">
                  <div class="ap-form-block">
                    <label>How did you reach them?</label>
                    <select name="contactMethod">
                      <option value="phone">Phone call</option>
                      <option value="text">Text message</option>
                      <option value="in_person">In person</option>
                      <option value="email_manual">Email (sent manually)</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                </div>
                <div class="ap-form-block" style="margin-top:12px;">
                  <label>What was said / when (optional)</label>
                  <textarea name="contactNote" placeholder="Called at 2:15 PM, confirmed Thursday 4pm, asked about parking."></textarea>
                </div>
              </div>
            </fieldset>

            <div style="margin-top:14px; text-align:right;">
              <button type="submit" class="btn btn-primary">Schedule interview</button>
            </div>
          </form>
        </div>
      </details>
    </div>`;

  return adminLayout(`Applicant — ${application.name}`, `
    ${applicantStyles()}

    <div class="ap-hero">
      <div class="ap-hero-left">
        <div class="admin-kicker">Applicant</div>
        <h1>${escHTML(application.name)}</h1>
        <div class="ap-meta-line">
          <span>${escHTML(positionLabel || '—')}</span>
          <span class="dot">•</span>
          <span>${escHTML(locName || '—')}</span>
          <span class="dot">•</span>
          <span>Applied ${escHTML(formatFriendly(application.createdAt))}</span>
        </div>
        <div class="ap-hero-status-line">
          <span class="app-badge app-badge-lg app-badge-${escHTML(application.status || 'new')}">${escHTML(STATUS_LABELS[application.status] || application.status)}</span>
          ${aiRecBadge(application)}
          ${application.aiEvaluation && application.aiEvaluation.humanReviewRequired ? '<span class="ai-review-badge">Human review</span>' : ''}
        </div>
        <div class="ap-shortcut-hint">
          Shortcuts: <span class="ap-kbd">A</span> advance · <span class="ap-kbd">R</span> reject · <span class="ap-kbd">N</span> focus notes · <span class="ap-kbd">/</span> back to list
        </div>
      </div>
      ${renderHeroActions(application, interviews)}
    </div>

    ${flash}

    ${renderStepper(application)}

    <div class="ap-grid">
      <div class="ap-main">
        ${aiEvaluationPanel(application)}
        ${questionnaireAnswersPanel(application)}
        ${narrativeCard}
        ${interviewsCard}
      </div>
      <aside class="ap-rail">
        ${renderOnboardingCard(application, dashboardInviteStatus, dashboardRoleOptions)}
        ${contactCard}
        ${availabilityCard}
        ${resumeCard}
        ${notesCard}
      </aside>
    </div>

    <script>
      (function () {
        var ROOT = document;

        // ---- Skip-email fieldset toggle (works for any data-skip-email block) ----
        ROOT.querySelectorAll('[data-skip-email-toggle]').forEach(function (cb) {
          var fs = cb.closest('[data-skip-email]');
          if (!fs) return;
          var sync = function () { fs.setAttribute('data-open', cb.checked ? '1' : '0'); };
          cb.addEventListener('change', sync);
          sync();
        });

        // ---- Copy buttons (email / phone) ----
        ROOT.querySelectorAll('.ap-copy').forEach(function (btn) {
          btn.addEventListener('click', function () {
            var val = btn.getAttribute('data-copy') || '';
            var original = btn.textContent;
            var done = function () {
              btn.textContent = 'Copied!';
              btn.classList.add('is-copied');
              setTimeout(function () { btn.textContent = original; btn.classList.remove('is-copied'); }, 1400);
            };
            if (navigator.clipboard && navigator.clipboard.writeText) {
              navigator.clipboard.writeText(val).then(done, function () {});
            } else {
              try {
                var t = document.createElement('textarea');
                t.value = val; document.body.appendChild(t); t.select(); document.execCommand('copy');
                document.body.removeChild(t); done();
              } catch (e) {}
            }
          });
        });

        // ---- Internal notes autosave (debounced, posts form-encoded body) ----
        var notesForm = ROOT.querySelector('[data-notes-form]');
        var notesInput = ROOT.querySelector('[data-notes-input]');
        var notesStatus = ROOT.querySelector('[data-notes-status]');
        if (notesForm && notesInput) {
          var lastSaved = notesInput.value;
          var timer = null;
          var setStatus = function (text, cls) {
            if (!notesStatus) return;
            notesStatus.textContent = text;
            notesStatus.classList.remove('is-saving', 'is-saved', 'is-error');
            if (cls) notesStatus.classList.add(cls);
          };
          var save = function () {
            var val = notesInput.value;
            if (val === lastSaved) return;
            setStatus('Saving…', 'is-saving');
            var body = new URLSearchParams();
            body.set('internalNotes', val);
            fetch(notesForm.action, {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: body.toString(),
              credentials: 'same-origin',
              redirect: 'manual',
            }).then(function () {
              lastSaved = val;
              setStatus('Saved ✓', 'is-saved');
              setTimeout(function () { if (notesStatus.textContent === 'Saved ✓') setStatus('', null); }, 2500);
            }).catch(function () {
              setStatus('Save failed', 'is-error');
            });
          };
          notesInput.addEventListener('input', function () {
            if (timer) clearTimeout(timer);
            setStatus('Editing…', 'is-saving');
            timer = setTimeout(save, 800);
          });
          notesInput.addEventListener('blur', function () {
            if (timer) { clearTimeout(timer); timer = null; }
            save();
          });
        }

        // ---- Keyboard shortcuts ----
        ROOT.addEventListener('keydown', function (e) {
          var tag = (e.target && e.target.tagName) || '';
          if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target && e.target.isContentEditable)) return;
          if (e.metaKey || e.ctrlKey || e.altKey) return;
          var key = e.key.toLowerCase();
          if (key === 'a') {
            var advance = document.getElementById('ap-advance-btn');
            if (advance) { e.preventDefault(); advance.click(); }
          } else if (key === 'r') {
            // Open the shared reject modal — the data-open-reject button in
            // the change-status menu owns the applicant id + name.
            var rejectBtn = document.querySelector('.ap-menu-panel [data-open-reject]');
            if (rejectBtn) { e.preventDefault(); rejectBtn.click(); }
          } else if (key === 'n') {
            if (notesInput) { e.preventDefault(); notesInput.focus(); notesInput.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
          } else if (key === '/') {
            e.preventDefault();
            window.location.href = '/admin/applicants';
          }
        });

        // ---- Close change-status menu when clicking outside ----
        var menu = ROOT.querySelector('details.ap-menu');
        if (menu) {
          document.addEventListener('click', function (e) {
            if (menu.open && !menu.contains(e.target)) menu.removeAttribute('open');
          });
        }
      })();

      ${rejectModalScript()}
    </script>

    ${rejectModalHtml()}
  `, user);
}

function hiringConfigPage({ user }) {
  const kb = require('../hiring/knowledgeBase');
  const ai = require('../hiring/aiEvaluation');

  const versionRows = [
    ['Model', ai.MODEL],
    ['Knowledge base version', kb.KNOWLEDGE_BASE_VERSION],
    ['Prompt version', kb.PROMPT_VERSION],
    ['Questionnaire version', kb.QUESTIONNAIRE_VERSION],
    ['Rubric version', kb.RUBRIC_VERSION],
  ].map(([label, value]) => `
    <tr>
      <td style="padding:8px 14px; color:var(--muted); width:220px;">${escHTML(label)}</td>
      <td style="padding:8px 14px; color:var(--text); font-family: 'SF Mono', Menlo, monospace; font-size:0.85rem;">${escHTML(value)}</td>
    </tr>`).join('');

  const roleColumns = ['bartender', 'barback', 'server', 'door', 'lead_shift_lead', 'other'];
  const weightHeader = `<th style="padding:8px 14px; text-align:left; color:var(--accent);">Category</th>` +
    roleColumns.map((r) => `<th style="padding:8px 14px; text-align:center; color:var(--accent);">${escHTML(kb.ROLE_LABELS[r] || r)}</th>`).join('');
  const weightRows = kb.CATEGORIES.map((cat) => {
    const cells = roleColumns.map((r) => {
      const w = kb.weightsForRole(r)[cat] || 0;
      return `<td style="padding:8px 14px; text-align:center; color:var(--text);">${w}</td>`;
    }).join('');
    return `<tr><td style="padding:8px 14px; color:var(--muted);">${escHTML(kb.CATEGORY_LABELS[cat] || cat)}</td>${cells}</tr>`;
  }).join('');

  const questionRows = kb.QUESTIONS.map((q) => {
    const cats = (q.scoringCategories || []).map((c) => escHTML(kb.CATEGORY_LABELS[c] || c)).join(', ') || '<span style="color:var(--text-soft);">not scored</span>';
    const roles = Array.isArray(q.appliesToRoles) && q.appliesToRoles.length
      ? `<span style="color:var(--gold-strong); font-size:0.72rem; font-weight:800; text-transform:uppercase; letter-spacing:0.06em;">${q.appliesToRoles.map((r) => escHTML(kb.ROLE_LABELS[r] || r)).join(' · ')}</span>`
      : '<span style="color:var(--text-soft); font-size:0.72rem;">all roles</span>';
    return `
    <tr>
      <td style="padding:8px 12px; text-align:center; color:var(--muted); width:40px;">${q.order}</td>
      <td style="padding:8px 12px; color:var(--text); font-size:0.92rem;">${escHTML(q.text)}<div style="margin-top:4px;">${roles}</div></td>
      <td style="padding:8px 12px; color:var(--muted); font-size:0.78rem;">${cats}</td>
    </tr>`;
  }).join('');

  return adminLayout('Hiring config', `
    <div class="page-header">
      <div>
        <div class="admin-kicker">Hiring</div>
        <h1>Screening configuration</h1>
        <p class="page-subtitle">Read-only view of the knowledge base, role weights, and questionnaire that drive screening recommendations. Edits live in <code>hiring/knowledgeBase.js</code>; bump the version stamps when you change anything.</p>
      </div>
      <a href="/admin/applicants" class="btn btn-secondary">&larr; Back to applicants</a>
    </div>

    <div class="app-section">
      <h2>Versions</h2>
      <table style="width:100%; border-collapse:collapse;">${versionRows}</table>
    </div>

    <div class="app-section">
      <h2>Role weights</h2>
      <p class="app-meta" style="margin-bottom:10px;">Each row sums to 100. These are code-authoritative; the screener's claimed weights are ignored when recomputing the weighted score.</p>
      <div style="overflow-x:auto;">
        <table style="width:100%; border-collapse:collapse; font-size:0.9rem;">
          <thead><tr>${weightHeader}</tr></thead>
          <tbody>${weightRows}</tbody>
        </table>
      </div>
    </div>

    <div class="app-section">
      <h2>How the verdict is calculated</h2>
      <p style="color:var(--text); line-height:1.55; margin:0 0 12px;">Each applicant gets one of three manager-facing verdicts:</p>
      <ul style="line-height:1.7; color:var(--text); padding-left:20px; margin:0 0 14px;">
        <li><strong style="color:#a4f4c2;">Recommend interview</strong> — weighted score ≥ 3.7, every category ≥ 3.0, every role-specific minimum met, no hard deal-breaker, no human-review trigger.</li>
        <li><strong style="color:var(--amber);">Needs human review</strong> — borderline scores, role-minimum miss, protected info disclosed, generic-answer pattern, "Unsure" on legal eligibility, conflicting signals. Most edge cases land here.</li>
        <li><strong style="color:#ffb3b3;">Does not meet role requirements</strong> — job-related role-requirement gaps only: confirmed cannot work the role's required shifts, confirmed not legally eligible for the role, or the applicant disqualifies themselves.</li>
      </ul>
      <h3 style="margin:14px 0 6px; font-size:0.95rem; color:var(--accent);">Hard role-requirement gaps (route to "Does not meet role requirements")</h3>
      <ul style="line-height:1.55; color:var(--text); padding-left:20px; margin:0 0 14px;">
        <li>Bartender applicant answers <strong>No</strong> to legal alcohol-service eligibility (Unsure → human review).</li>
        <li>Structured availability grid does not cover the role's required shifts — bartender / barback need at least one Friday or Saturday evening + a late close; server needs at least one weekend evening; door needs a Friday or Saturday late close; lead needs a weekend evening.</li>
        <li>Applicant explicitly states they cannot work the role's required shifts.</li>
      </ul>
      <h3 style="margin:14px 0 6px; font-size:0.95rem; color:var(--accent);">Human-review triggers</h3>
      <ul style="line-height:1.55; color:var(--text); padding-left:20px; margin:0 0 14px;">
        <li>Any single category scores below 2.0.</li>
        <li>Final weighted score is within ±0.15 of the recommend threshold (borderline).</li>
        <li>A role-specific category minimum is missed (e.g. bartender Own-Guest-Experience below 3.25).</li>
        <li>Earliest start date is more than 60 days out (computed server-side; the screener no longer estimates dates).</li>
        <li>Availability free-text is ambiguous ("depends", "flexible" with no specifics).</li>
        <li>Two or more answers contradict each other.</li>
        <li>Applicant mentions a current or former employee by name.</li>
        <li>Applicant discloses protected or sensitive information.</li>
        <li>Most answers in a category read polished but generic / template-like (follow-up trigger, NOT a penalty — some strong candidates use writing help).</li>
        <li>Bartender applicant answers "Unsure" on legal eligibility.</li>
      </ul>
      <h3 style="margin:14px 0 6px; font-size:0.95rem; color:var(--accent);">Short-answer floor</h3>
      <p style="margin:0 0 14px; color:var(--text); line-height:1.55;">Any answer under 15 characters (excluding the availability question) cannot evidence a category score above 2. If a category's mapped questions are majority short-answered, the category is capped at 2 deterministically.</p>
      <h3 style="margin:14px 0 6px; font-size:0.95rem; color:var(--accent);">Generic answer cap</h3>
      <p style="margin:0 0 14px; color:var(--text); line-height:1.55;">An answer that uses only generic intent language without a specific action, tradeoff, example, or observable behavior cannot support a category score above 3 — regardless of length. Polished and vague is not specific.</p>
      <h3 style="margin:14px 0 6px; font-size:0.95rem; color:var(--accent);">Evidence caps</h3>
      <ul style="line-height:1.55; color:var(--text); padding-left:20px; margin:0 0 14px;">
        <li>Cap at <strong>3.5</strong> if a category has no specific past example anywhere in its mapped answers.</li>
        <li>Cap at <strong>3.0</strong> if a majority of the mapped answers for a category land in the generic-cap pattern above.</li>
        <li>Contradictions on availability, role interest, or escalation judgement → flag for human review and cap the affected categories at 3.0 until reviewed.</li>
      </ul>
      <p class="app-meta" style="margin:0;">Every category score must cite at least one supporting answer ID and a quoted evidence excerpt — these show up in the detail page when you expand "Why this score". Managers always make the final call; the system never auto-rejects an applicant.</p>
    </div>

    <div class="app-section">
      <h2>Questionnaire (${kb.QUESTIONS.length} questions, role-filtered for each applicant)</h2>
      <div style="overflow-x:auto;">
        <table style="width:100%; border-collapse:collapse; font-size:0.88rem;">
          <thead>
            <tr>
              <th style="padding:8px 12px; text-align:center; color:var(--accent);">#</th>
              <th style="padding:8px 12px; text-align:left; color:var(--accent);">Question</th>
              <th style="padding:8px 12px; text-align:left; color:var(--accent);">Scoring categories</th>
            </tr>
          </thead>
          <tbody>${questionRows}</tbody>
        </table>
      </div>
    </div>

    <div class="app-section">
      <h2>Knowledge base text</h2>
      <p class="app-meta" style="margin-bottom:10px;">This is the full text passed to Claude in every evaluation's system prompt (prompt-cached for cost).</p>
      <pre style="white-space:pre-wrap; background:rgba(255,255,255,0.03); border:1px solid var(--border); border-radius:8px; padding:14px 16px; font-size:0.85rem; line-height:1.55; color:var(--text); max-height:520px; overflow-y:auto;">${escHTML(kb.KNOWLEDGE_BASE)}</pre>
    </div>
  `, user);
}

module.exports = {
  STATUS_LABELS,
  PIPELINE_ORDER,
  TERMINAL_STATUSES,
  applicantsList,
  applicantDetail,
  hiringConfigPage,
};
