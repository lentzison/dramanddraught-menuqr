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
      .app-badge { display:inline-block; padding:3px 9px; border-radius:10px; font-size:0.68rem; font-weight:700; text-transform:uppercase; letter-spacing:0.04em; }
      .app-badge-new              { background:rgba(96,165,250,0.18); color:#93c5fd; }
      .app-badge-reviewing        { background:rgba(168,85,247,0.18); color:#c4b5fd; }
      .app-badge-interview_scheduled { background:rgba(251,191,36,0.18); color:#fcd34d; }
      .app-badge-interviewed      { background:rgba(45,212,191,0.18); color:#5eead4; }
      .app-badge-offer_extended   { background:rgba(212,175,55,0.22); color:#f5d76e; }
      .app-badge-hired            { background:rgba(34,197,94,0.22); color:#4ade80; }
      .app-badge-rejected         { background:rgba(239,68,68,0.18); color:#f87171; }
      .app-badge-withdrawn        { background:rgba(150,150,150,0.18); color:#aaa; }
      .app-row { display:flex; align-items:center; gap:14px; padding:14px 16px; border:1px solid var(--border); border-radius:12px; margin-bottom:10px; background:var(--card); }
      .app-row:hover { border-color:rgba(214,173,75,0.38); }
      .app-row a.app-name { color:var(--text); font-weight:600; text-decoration:none; }
      .app-row a.app-name:hover { color:var(--accent); }
      .app-meta { color:var(--muted); font-size:0.85rem; margin-top:3px; }
      .app-meta-dot { color:#555; margin:0 4px; }
      .app-row-main { flex:1 1 auto; min-width:0; }
      .app-row-actions { flex:0 0 auto; }
      .app-filter-bar { display:flex; flex-wrap:wrap; gap:10px; margin-bottom:14px; align-items:flex-end; }
      .app-filter-bar select, .app-filter-bar input[type="search"] {
        background:var(--bg-input, #15161a); color:var(--text); border:1px solid var(--border);
        padding:8px 10px; border-radius:8px; font-size:0.9rem;
      }
      .app-filter-bar label { display:flex; flex-direction:column; gap:4px; font-size:0.75rem; color:var(--muted); text-transform:uppercase; letter-spacing:0.05em; }
      .app-pipeline { display:flex; flex-wrap:wrap; gap:6px; margin: 8px 0 18px; }
      .app-pipeline form { display:inline-block; margin:0; }
      .app-pipeline button {
        background:var(--card); color:var(--text); border:1px solid var(--border);
        padding:7px 12px; border-radius:999px; font-size:0.78rem; font-weight:600; cursor:pointer;
      }
      .app-pipeline button.is-current { background:var(--accent); color:#1a1410; border-color:var(--accent); }
      .app-pipeline button.is-terminal { border-color:rgba(239,68,68,0.4); }
      .app-pipeline button.is-terminal-positive { border-color:rgba(34,197,94,0.4); }
      .app-pipeline button:hover { border-color:rgba(214,173,75,0.55); }
      .app-grid { display:grid; grid-template-columns: 1fr 1fr; gap:10px 22px; }
      @media (max-width: 760px) { .app-grid { grid-template-columns: 1fr; } }
      .app-field { display:flex; flex-direction:column; gap:3px; }
      .app-field span { font-size:0.7rem; color:var(--muted); text-transform:uppercase; letter-spacing:0.06em; }
      .app-field strong { color:var(--text); font-weight:600; }
      .app-field.is-wide { grid-column: 1 / -1; }
      .app-prose { white-space:pre-wrap; line-height:1.5; }
      .app-availability table { border-collapse:collapse; font-size:0.85rem; }
      .app-availability th, .app-availability td {
        border:1px solid var(--border); padding:5px 9px; text-align:center; color:var(--muted);
      }
      .app-availability th { background:rgba(255,255,255,0.04); color:var(--text); font-weight:600; }
      .app-availability td.has { background:rgba(212,175,55,0.18); color:var(--accent); font-weight:700; }
      .app-section { background:var(--card); border:1px solid var(--border); border-radius:12px; padding:18px 18px; margin-bottom:14px; }
      .app-section h2 { font-size:1.05rem; margin:0 0 12px; color:var(--accent); }
      .app-section .form-row { display:grid; grid-template-columns: 1fr 1fr; gap:12px; }
      @media (max-width:560px){ .app-section .form-row { grid-template-columns: 1fr; } }
      .app-section input, .app-section select, .app-section textarea {
        background:var(--bg-input, #15161a); color:var(--text); border:1px solid var(--border);
        padding:8px 10px; border-radius:8px; font-size:0.9rem; width:100%; box-sizing:border-box;
      }
      .app-section textarea { min-height:74px; resize:vertical; }
      .app-section label { font-size:0.74rem; color:var(--muted); text-transform:uppercase; letter-spacing:0.06em; display:block; margin-bottom:4px; }
      .app-interview-card { border:1px solid var(--border); border-radius:10px; padding:12px 14px; margin-bottom:10px; }
      .app-interview-card.app-interview-cancelled { opacity:0.6; }
      .app-interview-meta { color:var(--muted); font-size:0.85rem; }
      .app-flash { padding:10px 14px; border-radius:8px; margin-bottom:14px; font-size:0.9rem; }
      .app-flash.success { background:rgba(34,197,94,0.18); color:#4ade80; }
      .app-flash.error { background:rgba(239,68,68,0.16); color:#f87171; }
    </style>
  `;
}

function applicantsList({ applications, locations, filters, counts, user, flashMsg, canSeeMultipleLocations }) {
  const positionOptions = ['', ...POSITIONS].map((p) => {
    const sel = filters.position === p ? ' selected' : '';
    const label = p === '' ? 'All positions' : p;
    return `<option value="${escHTML(p)}"${sel}>${escHTML(label)}</option>`;
  }).join('');

  const statusOptions = ['', ...Object.keys(STATUS_LABELS)].map((s) => {
    const sel = filters.status === s ? ' selected' : '';
    const label = s === '' ? 'All statuses' : STATUS_LABELS[s];
    return `<option value="${escHTML(s)}"${sel}>${escHTML(label)}</option>`;
  }).join('');

  const locationOptions = canSeeMultipleLocations
    ? ['', ...locations.map(l => l.slug)].map((slug) => {
        const sel = filters.location === slug ? ' selected' : '';
        const loc = locations.find(l => l.slug === slug);
        const label = slug === '' ? 'All locations' : (loc ? loc.name : slug);
        return `<option value="${escHTML(slug)}"${sel}>${escHTML(label)}</option>`;
      }).join('')
    : '';

  const rows = applications.length === 0 ? `
    <div class="app-row" style="justify-content:center; color:var(--muted);">
      <div>No applications match those filters.</div>
    </div>
  ` : applications.map(a => {
    const locName = a.location?.name || '';
    return `
      <div class="app-row">
        <div class="app-row-main">
          <a class="app-name" href="/admin/applicants/${escHTML(a.id)}">${escHTML(a.name)}</a>
          <span style="margin-left:8px;">${statusBadge(a.status)}</span>
          <div class="app-meta">
            <span>${escHTML(a.position || '')}${a.position === 'Other' && a.positionOther ? ` (${escHTML(a.positionOther)})` : ''}</span>
            <span class="app-meta-dot">•</span>
            <span>${escHTML(locName)}</span>
            <span class="app-meta-dot">•</span>
            <span>Applied ${escHTML(formatFriendly(a.createdAt))}</span>
            ${a.email ? `<span class="app-meta-dot">•</span><span>${escHTML(a.email)}</span>` : ''}
          </div>
        </div>
        <div class="app-row-actions">
          <a class="btn btn-secondary btn-sm" href="/admin/applicants/${escHTML(a.id)}">Open</a>
        </div>
      </div>
    `;
  }).join('');

  const flash = flashMsg ? `<div class="app-flash ${flashMsg.type === 'error' ? 'error' : 'success'}">${escHTML(flashMsg.text)}</div>` : '';

  return adminLayout('Applicants', `
    ${applicantStyles()}
    <div class="page-header">
      <div>
        <div class="admin-kicker">Hiring</div>
        <h1>Applicants</h1>
        <p class="page-subtitle">Review applications, schedule interviews, and move candidates through the pipeline.</p>
      </div>
    </div>
    ${flash}

    <div class="admin-stat-grid">
      <div class="admin-stat"><strong>${counts.new}</strong><span>New</span></div>
      <div class="admin-stat"><strong>${counts.reviewing}</strong><span>Reviewing</span></div>
      <div class="admin-stat"><strong>${counts.interview_scheduled}</strong><span>Interviews scheduled</span></div>
      <div class="admin-stat"><strong>${counts.hired}</strong><span>Hired (all-time)</span></div>
    </div>

    <form method="GET" action="/admin/applicants" class="app-filter-bar">
      ${canSeeMultipleLocations ? `
      <label>Location
        <select name="location">${locationOptions}</select>
      </label>` : ''}
      <label>Status
        <select name="status">${statusOptions}</select>
      </label>
      <label>Position
        <select name="position">${positionOptions}</select>
      </label>
      <label>Search
        <input type="search" name="q" placeholder="Name or email" value="${escHTML(filters.q || '')}" />
      </label>
      <button type="submit" class="btn btn-primary btn-sm">Filter</button>
      <a href="/admin/applicants" class="btn btn-secondary btn-sm">Reset</a>
    </form>

    ${rows}
  `, user);
}

function pipelineButton(application, target, kind) {
  const isCurrent = application.status === target;
  const cls = ['', isCurrent ? 'is-current' : '', kind === 'positive' ? 'is-terminal-positive' : kind === 'negative' ? 'is-terminal' : ''].filter(Boolean).join(' ');
  return `
    <form method="POST" action="/admin/applicants/${escHTML(application.id)}/status">
      <input type="hidden" name="status" value="${escHTML(target)}" />
      <button type="submit" class="${cls}" ${isCurrent ? 'disabled' : ''}>${escHTML(STATUS_LABELS[target])}</button>
    </form>
  `;
}

function renderAvailability(availability) {
  if (!availability || typeof availability !== 'object') return '<p class="app-meta">No availability provided.</p>';
  const headRow = `<tr><th></th>${Object.keys(SHIFT_LABELS).map(s => `<th>${escHTML(SHIFT_LABELS[s])}</th>`).join('')}</tr>`;
  const rows = DAY_ORDER.map((d) => {
    const shifts = availability[d];
    const cells = Object.keys(SHIFT_LABELS).map((s) => {
      const has = Array.isArray(shifts) && shifts.includes(s);
      return `<td class="${has ? 'has' : ''}">${has ? '✓' : ''}</td>`;
    }).join('');
    return `<tr><th>${escHTML(DAYS_LABELS[d])}</th>${cells}</tr>`;
  }).join('');
  return `<div class="app-availability"><table>${headRow}${rows}</table></div>`;
}

function renderInterview(interview) {
  const statusClass = interview.status === 'cancelled' ? 'app-interview-cancelled' : '';
  const typeLabel = interview.type === 'phone' ? 'Phone' : interview.type === 'video' ? 'Video' : 'In person';
  return `
    <div class="app-interview-card ${statusClass}">
      <strong>${escHTML(formatFriendly(interview.scheduledAt))}</strong>
      <span class="app-meta"> &middot; ${escHTML(typeLabel)} &middot; ${interview.durationMinutes} min &middot; ${escHTML(interview.status)}</span>
      ${interview.locationDetail ? `<div class="app-meta">Where/how: ${escHTML(interview.locationDetail)}</div>` : ''}
      ${interview.interviewerEmail ? `<div class="app-meta">Interviewer: ${escHTML(interview.interviewerEmail)}</div>` : ''}
      ${interview.candidateNote ? `<div class="app-meta">Note to candidate: ${escHTML(interview.candidateNote)}</div>` : ''}
      ${interview.cancellationReason ? `<div class="app-meta">Cancelled: ${escHTML(interview.cancellationReason)}</div>` : ''}
      <div class="app-meta" style="margin-top:6px;">
        ${interview.reminderSent24h ? '24h reminder sent' : '24h reminder pending'} &middot;
        ${interview.reminderSent1h ? '1h reminder sent' : '1h reminder pending'}
      </div>
      ${interview.status === 'scheduled' ? `
        <form method="POST" action="/admin/applicants/interviews/${escHTML(interview.id)}/cancel" style="margin-top:8px;" onsubmit="return confirm('Cancel this interview? An email will be sent to the candidate.')">
          <input type="text" name="reason" placeholder="Reason (shown to candidate)" style="width:240px; margin-right:8px;" />
          <button type="submit" class="btn btn-secondary btn-sm">Cancel interview</button>
        </form>
      ` : ''}
    </div>
  `;
}

function applicantDetail({ application, interviews, user, flashMsg }) {
  const flash = flashMsg ? `<div class="app-flash ${flashMsg.type === 'error' ? 'error' : 'success'}">${escHTML(flashMsg.text)}</div>` : '';
  const locName = application.location?.name || '';
  const positionLabel = application.position === 'Other' && application.positionOther
    ? `${application.position} (${application.positionOther})`
    : application.position;

  // Pipeline buttons. Always include the terminal ones at the end.
  const pipelineHtml = [
    ...PIPELINE_ORDER.map(s => pipelineButton(application, s, s === 'hired' ? 'positive' : 'neutral')),
    pipelineButton(application, 'rejected', 'negative'),
    pipelineButton(application, 'withdrawn', 'negative'),
  ].join('');

  const resumeBlock = application.resumeFileName
    ? `<a class="btn btn-secondary btn-sm" href="/admin/applicants/${escHTML(application.id)}/resume" target="_blank">Download resume (${escHTML(application.resumeFileName)})</a>`
    : '<span class="app-meta">No resume attached</span>';

  return adminLayout(`Applicant — ${application.name}`, `
    ${applicantStyles()}
    <div class="page-header">
      <div>
        <div class="admin-kicker">Applicant</div>
        <h1>${escHTML(application.name)}</h1>
        <p class="page-subtitle">${escHTML(positionLabel || '')} &middot; ${escHTML(locName)} &middot; Applied ${escHTML(formatFriendly(application.createdAt))}</p>
      </div>
      <a href="/admin/applicants" class="btn btn-secondary">&larr; Back to list</a>
    </div>
    ${flash}

    <div class="app-section">
      <h2>Pipeline</h2>
      <div>${statusBadge(application.status)} ${application.decisionBy ? `<span class="app-meta">last changed by ${escHTML(application.decisionBy)} on ${escHTML(formatFriendly(application.decisionAt))}</span>` : ''}</div>
      <div class="app-pipeline">${pipelineHtml}</div>
      ${application.decisionNote ? `<div class="app-meta"><strong>Note on last decision:</strong> ${escHTML(application.decisionNote)}</div>` : ''}
    </div>

    <div class="app-section">
      <h2>Contact &amp; basics</h2>
      <div class="app-grid">
        <div class="app-field"><span>Email</span><strong><a href="mailto:${escHTML(application.email)}">${escHTML(application.email)}</a></strong></div>
        <div class="app-field"><span>Phone</span><strong>${application.phone ? `<a href="tel:${escHTML(application.phone)}">${escHTML(application.phone)}</a>` : '—'}</strong></div>
        <div class="app-field"><span>21+</span><strong>${application.age21 ? 'Yes' : 'No'}</strong></div>
        <div class="app-field"><span>Earliest start</span><strong>${escHTML(formatDateOnly(application.earliestStart) || '—')}</strong></div>
        <div class="app-field"><span>Years experience</span><strong>${application.yearsExperience != null ? application.yearsExperience : '—'}</strong></div>
        <div class="app-field"><span>Referred by</span><strong>${escHTML(application.referredBy || '—')}</strong></div>
        <div class="app-field is-wide"><span>Certifications</span><strong>${escHTML(application.certifications || '—')}</strong></div>
      </div>
    </div>

    <div class="app-section">
      <h2>Availability</h2>
      ${renderAvailability(application.availability)}
    </div>

    <div class="app-section">
      <h2>Experience &amp; narrative</h2>
      <div class="app-field is-wide" style="margin-bottom:10px;">
        <span>Most recent employers</span>
        <strong class="app-prose">${escHTML(application.priorEmployers || '—')}</strong>
      </div>
      <div class="app-field is-wide" style="margin-bottom:10px;">
        <span>Spirit knowledge / specialties</span>
        <strong class="app-prose">${escHTML(application.spiritKnowledge || '—')}</strong>
      </div>
      <div class="app-field is-wide">
        <span>Why D&amp;D?</span>
        <strong class="app-prose">${escHTML(application.whyDD || '—')}</strong>
      </div>
    </div>

    <div class="app-section">
      <h2>Resume</h2>
      ${resumeBlock}
    </div>

    <div class="app-section">
      <h2>Interviews</h2>
      ${(interviews || []).length === 0 ? '<p class="app-meta">No interviews scheduled yet.</p>' : interviews.map(renderInterview).join('')}

      <h3 style="font-size:0.95rem; color:var(--text); margin:18px 0 8px;">Schedule a new interview</h3>
      <form method="POST" action="/admin/applicants/${escHTML(application.id)}/interviews">
        <div class="form-row">
          <div>
            <label>Date &amp; time (Eastern)</label>
            <input type="datetime-local" name="scheduledAt" required />
          </div>
          <div>
            <label>Duration (minutes)</label>
            <input type="number" name="durationMinutes" min="15" max="240" value="30" />
          </div>
        </div>
        <div class="form-row" style="margin-top:10px;">
          <div>
            <label>Type</label>
            <select name="type">
              <option value="in_person">In person</option>
              <option value="phone">Phone</option>
              <option value="video">Video</option>
            </select>
          </div>
          <div>
            <label>Interviewer email</label>
            <input type="email" name="interviewerEmail" placeholder="${escHTML(user?.email || '')}" />
          </div>
        </div>
        <div style="margin-top:10px;">
          <label>Where / link (address, phone number, or meeting URL)</label>
          <input type="text" name="locationDetail" placeholder="486 N Patterson Ave, Winston-Salem  •  https://meet.google.com/...  •  (919) 555-0123" />
        </div>
        <div style="margin-top:10px;">
          <label>Note shown to candidate (optional)</label>
          <textarea name="candidateNote" placeholder="Anything they should bring or know."></textarea>
        </div>
        <div style="margin-top:14px; text-align:right;">
          <button type="submit" class="btn btn-primary">Schedule &amp; email candidate</button>
        </div>
      </form>
    </div>

    <div class="app-section">
      <h2>Internal notes</h2>
      <form method="POST" action="/admin/applicants/${escHTML(application.id)}/notes">
        <textarea name="internalNotes" style="min-height:100px;">${escHTML(application.internalNotes || '')}</textarea>
        <div style="margin-top:10px; text-align:right;">
          <button type="submit" class="btn btn-secondary btn-sm">Save notes</button>
        </div>
      </form>
    </div>
  `, user);
}

module.exports = {
  STATUS_LABELS,
  PIPELINE_ORDER,
  TERMINAL_STATUSES,
  applicantsList,
  applicantDetail,
};
