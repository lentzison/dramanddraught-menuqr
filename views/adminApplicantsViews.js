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

      /* AI screening — cleaned-up, GM-friendly layout */
      .ai-card { border-radius:12px; padding:18px 20px; margin-bottom:14px; }
      .ai-verdict { display:flex; flex-wrap:wrap; align-items:center; gap:14px; padding:18px 22px; border-radius:12px; margin-bottom:14px; border:1px solid var(--border); background:var(--card); }
      .ai-verdict-pill {
        display:inline-flex; align-items:center; gap:8px;
        padding:8px 16px; border-radius:999px; font-weight:800;
        text-transform:uppercase; letter-spacing:0.06em; font-size:0.82rem;
      }
      .ai-verdict-pill.is-recommend       { background:rgba(34,197,94,0.22); color:#4ade80; }
      .ai-verdict-pill.is-dont_recommend  { background:rgba(150,150,150,0.20); color:#bbb; }
      .ai-verdict-pill.is-pending         { background:rgba(96,165,250,0.18); color:#93c5fd; }
      .ai-verdict-pill.is-error           { background:rgba(239,68,68,0.18); color:#f87171; }
      .ai-verdict-score { font-size:1.6rem; font-weight:800; color:var(--text); }
      .ai-verdict-score small { display:block; font-size:0.62rem; font-weight:600; color:var(--muted); text-transform:uppercase; letter-spacing:0.06em; margin-top:2px; }
      .ai-verdict-summary { flex:1 1 320px; color:var(--text); font-size:0.98rem; line-height:1.45; min-width:240px; }
      .ai-verdict-confidence { color:var(--muted); font-size:0.78rem; text-transform:uppercase; letter-spacing:0.05em; }

      .ai-watchout { background:rgba(212,175,55,0.10); border:1px solid rgba(212,175,55,0.40); border-radius:12px; padding:14px 18px; margin-bottom:14px; }
      .ai-watchout h3 { margin:0 0 8px; color:#f5d76e; font-size:0.95rem; }
      .ai-watchout ul { margin:0; padding-left:22px; line-height:1.55; }
      .ai-watchout li { margin-bottom:4px; color:#f5e9c0; }
      .ai-watchout-error { background:rgba(239,68,68,0.12); border-color:rgba(239,68,68,0.40); }
      .ai-watchout-error h3 { color:#fca5a5; }
      .ai-watchout-error li { color:#f4c5c5; }

      .ai-followups { background:var(--card); border:1px solid var(--border); border-radius:12px; padding:14px 18px; margin-bottom:14px; }
      .ai-followups h3 { margin:0 0 10px; color:var(--accent); font-size:0.95rem; }
      .ai-followups ol { margin:0; padding-left:22px; line-height:1.5; }
      .ai-followups li { margin-bottom:6px; color:var(--text); font-size:0.94rem; }

      .ai-cats { background:var(--card); border:1px solid var(--border); border-radius:12px; padding:14px 18px; margin-bottom:14px; }
      .ai-cats h3 { margin:0 0 10px; color:var(--accent); font-size:0.95rem; }
      .ai-cat-row { display:flex; align-items:center; gap:12px; padding:8px 0; border-bottom:1px solid var(--border); }
      .ai-cat-row:last-child { border-bottom:none; }
      .ai-cat-row .label { flex:0 0 180px; color:var(--text); font-weight:600; font-size:0.92rem; }
      .ai-cat-row .meter {
        flex:1 1 auto; height:8px; border-radius:4px;
        background:rgba(255,255,255,0.06); overflow:hidden; min-width:80px;
      }
      .ai-cat-row .meter > span { display:block; height:100%; background:linear-gradient(90deg, #4ade80, #d4af37); }
      .ai-cat-row .num { flex:0 0 46px; text-align:right; color:var(--text); font-weight:700; font-size:0.95rem; }
      .ai-cat-row .num small { color:var(--muted); font-weight:500; font-size:0.7rem; margin-left:4px; }
      .ai-cat-detail { padding:6px 0 8px 14px; border-left:2px solid rgba(212,175,55,0.25); margin:4px 0 12px 0; }
      .ai-cat-detail .why { color:var(--muted); font-size:0.86rem; line-height:1.5; margin-bottom:8px; }
      .ai-cat-detail h4 { margin:8px 0 4px; font-size:0.74rem; color:var(--accent); text-transform:uppercase; letter-spacing:0.06em; }
      .ai-cat-detail ul { margin:0 0 6px; padding-left:18px; }
      .ai-cat-detail li { font-size:0.86rem; line-height:1.45; margin-bottom:3px; color:var(--text); }
      .ai-cat-detail .concerns li { color:#f4c5c5; }
      details.ai-cat-toggle > summary { cursor:pointer; color:var(--accent); font-size:0.78rem; padding:6px 0; list-style:none; }
      details.ai-cat-toggle > summary::-webkit-details-marker { display:none; }
      details.ai-cat-toggle > summary::before { content:'▸ '; }
      details.ai-cat-toggle[open] > summary::before { content:'▾ '; }

      details.ai-collapse { background:var(--card); border:1px solid var(--border); border-radius:12px; padding:14px 18px; margin-bottom:14px; }
      details.ai-collapse > summary { cursor:pointer; color:var(--text); font-weight:600; font-size:0.95rem; list-style:none; }
      details.ai-collapse > summary::-webkit-details-marker { display:none; }
      details.ai-collapse > summary::before { content:'▸ '; color:var(--accent); }
      details.ai-collapse[open] > summary::before { content:'▾ '; color:var(--accent); }
      details.ai-collapse[open] > summary { padding-bottom:10px; border-bottom:1px solid var(--border); margin-bottom:14px; }
      details.ai-collapse .answer-q { color:var(--muted); font-size:0.78rem; text-transform:uppercase; letter-spacing:0.05em; margin:14px 0 4px; }
      details.ai-collapse .answer-q:first-of-type { margin-top:0; }
      details.ai-collapse .answer-a { color:var(--text); font-size:0.92rem; line-height:1.55; white-space:pre-wrap; }

      .ai-meta { color:var(--muted); font-size:0.72rem; margin-top:8px; padding:8px 14px; }
      .ai-rec-badge { display:inline-block; padding:3px 9px; border-radius:10px; font-size:0.68rem; font-weight:700; text-transform:uppercase; letter-spacing:0.04em; margin-left:6px; }
      .ai-rec-recommend       { background:rgba(34,197,94,0.22); color:#4ade80; }
      .ai-rec-dont_recommend  { background:rgba(150,150,150,0.20); color:#bbb; }
      .ai-rec-pending         { background:rgba(96,165,250,0.18); color:#93c5fd; }
      .ai-rec-error           { background:rgba(239,68,68,0.18); color:#f87171; }
      .ai-review-badge { display:inline-block; padding:3px 9px; border-radius:10px; font-size:0.68rem; font-weight:700; text-transform:uppercase; letter-spacing:0.04em; margin-left:6px; background:rgba(212,175,55,0.22); color:#f5d76e; }
    </style>
  `;
}

function aiRecBadge(aiEvaluation) {
  if (!aiEvaluation) return '<span class="ai-rec-badge ai-rec-pending">AI pending</span>';
  if (aiEvaluation.errorDetail) return '<span class="ai-rec-badge ai-rec-error">AI error</span>';
  const bucket = verdictBucketFor(aiEvaluation.recommendation);
  const label = VERDICT_LABELS[bucket];
  return `<span class="ai-rec-badge ai-rec-${escHTML(bucket)}">${escHTML(label)}</span>`;
}

// Underlying recommendations collapse to two manager-facing verdicts.
// `recommend` covers strong_callback + callback; `dont_recommend` covers maybe + hold.
function verdictBucketFor(rec) {
  return rec === 'strong_callback' || rec === 'callback' ? 'recommend' : 'dont_recommend';
}

const VERDICT_LABELS = {
  recommend: 'Recommend for interview',
  dont_recommend: 'Don’t recommend',
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
        <div class="ai-verdict">
          <span class="ai-verdict-pill is-pending">Awaiting questionnaire</span>
          <div class="ai-verdict-summary">The applicant has not yet completed the hospitality questionnaire. AI evaluation runs automatically once they submit it.${inviteNote}</div>
        </div>`;
    }
    return `
      <div class="ai-verdict">
        <span class="ai-verdict-pill is-pending">Evaluating…</span>
        <div class="ai-verdict-summary">Questionnaire submitted; AI evaluation is still in flight. Refresh in a moment.</div>
      </div>`;
  }

  if (ev.errorDetail) {
    return `
      <div class="ai-watchout ai-watchout-error">
        <h3>AI screening could not complete</h3>
        <p style="margin:0; color:#f4c5c5;">${escHTML(ev.errorDetail)}</p>
        <p style="margin:8px 0 0; color:var(--muted); font-size:0.82rem;">Review the questionnaire answers below and make a decision manually.</p>
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
  const bucket = verdictBucketFor(rec);
  const verdict = `
    <div class="ai-verdict">
      <span class="ai-verdict-pill is-${escHTML(bucket)}">${escHTML(VERDICT_LABELS[bucket])}</span>
      <div class="ai-verdict-score">${escHTML(scoreLabel)}<small>Score / 5</small></div>
      <div class="ai-verdict-confidence">Confidence: ${escHTML(confidenceLabel)}</div>
      ${summary ? `<div class="ai-verdict-summary">${escHTML(summary)}</div>` : ''}
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
    const hasDetail = (cat.rationale && cat.rationale.length) || ev2.length || con.length;
    const row = `
      <div class="ai-cat-row">
        <div class="label">${escHTML(formatCategoryLabel(cat.category))}</div>
        <div class="meter"><span style="width:${meterPct}%"></span></div>
        <div class="num">${score || '—'}<small>/5</small></div>
      </div>`;
    if (!hasDetail) return row;
    return `
      ${row}
      <details class="ai-cat-toggle">
        <summary>Why this score &middot; evidence</summary>
        <div class="ai-cat-detail">
          ${cat.rationale ? `<div class="why">${escHTML(cat.rationale)}</div>` : ''}
          ${ev2.length ? `<h4>Evidence</h4><ul>${ev2.map((e) => `<li>${escHTML(e)}</li>`).join('')}</ul>` : ''}
          ${con.length ? `<h4>Concerns</h4><ul class="concerns">${con.map((c) => `<li>${escHTML(c)}</li>`).join('')}</ul>` : ''}
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
      Reminder: AI does not make final hiring decisions. Manager review required before any callback.
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
  const { QUESTIONS } = require('../hiring/knowledgeBase');
  const blocks = QUESTIONS.map((qq) => {
    const a = q.answers[qq.id] || '(no answer)';
    return `
      <div class="answer-q">Q${qq.order}. ${escHTML(qq.text)}</div>
      <div class="answer-a">${escHTML(a)}</div>`;
  }).join('');
  return `
    <details class="ai-collapse">
      <summary>Show all 20 questionnaire answers <span style="color:var(--muted); font-weight:400; font-size:0.78rem;">&middot; submitted ${escHTML(formatFriendly(q.submittedAt))}</span></summary>
      ${blocks}
    </details>`;
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
          ${aiRecBadge(a.aiEvaluation)}
          ${a.aiEvaluation && a.aiEvaluation.humanReviewRequired ? '<span class="ai-review-badge">Human review</span>' : ''}
          <div class="app-meta">
            <span>${escHTML(a.position || '')}${a.position === 'Other' && a.positionOther ? ` (${escHTML(a.positionOther)})` : ''}</span>
            <span class="app-meta-dot">•</span>
            <span>${escHTML(locName)}</span>
            <span class="app-meta-dot">•</span>
            <span>Applied ${escHTML(formatFriendly(a.createdAt))}</span>
            ${a.email ? `<span class="app-meta-dot">•</span><span>${escHTML(a.email)}</span>` : ''}
            ${a.aiEvaluation && typeof a.aiEvaluation.weightedScore === 'number' ? `<span class="app-meta-dot">•</span><span>AI score ${a.aiEvaluation.weightedScore.toFixed(2)} (${escHTML(a.aiEvaluation.confidence || '')})</span>` : ''}
          </div>
        </div>
        <div class="app-row-actions">
          <a class="btn btn-secondary btn-sm" href="/admin/applicants/${escHTML(a.id)}">Open</a>
        </div>
      </div>
    `;
  }).join('');

  const AI_REC_OPTIONS = [
    { value: '', label: 'All AI verdicts' },
    { value: 'recommend', label: 'Recommend for interview' },
    { value: 'dont_recommend', label: 'Don’t recommend' },
  ];
  const aiRecOptionsHtml = AI_REC_OPTIONS.map((o) => {
    const sel = filters.aiRec === o.value ? ' selected' : '';
    return `<option value="${escHTML(o.value)}"${sel}>${escHTML(o.label)}</option>`;
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
      <a href="/admin/applicants/hiring-config" class="btn btn-secondary">Screening config &amp; KB</a>
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
      <label>AI rec
        <select name="ai_rec">${aiRecOptionsHtml}</select>
      </label>
      <label style="display:flex;align-items:flex-end;gap:6px;">
        <input type="checkbox" name="review" value="1"${filters.review === '1' ? ' checked' : ''} />
        Needs human review
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

    ${aiEvaluationPanel(application)}
    ${questionnaireAnswersPanel(application)}

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

  const questionRows = kb.QUESTIONS.map((q) => `
    <tr>
      <td style="padding:8px 12px; text-align:center; color:var(--muted); width:40px;">${q.order}</td>
      <td style="padding:8px 12px; color:var(--text); font-size:0.92rem;">${escHTML(q.text)}</td>
      <td style="padding:8px 12px; color:var(--muted); font-size:0.78rem;">${q.scoringCategories.map((c) => escHTML(kb.CATEGORY_LABELS[c] || c)).join(', ')}</td>
    </tr>`).join('');

  return adminLayout('Hiring config', `
    <div class="page-header">
      <div>
        <div class="admin-kicker">Hiring</div>
        <h1>Screening configuration</h1>
        <p class="page-subtitle">Read-only view of the knowledge base, role weights, and questionnaire that drive AI recommendations. Edits live in <code>hiring/knowledgeBase.js</code>; bump the version stamps when you change anything.</p>
      </div>
      <a href="/admin/applicants" class="btn btn-secondary">&larr; Back to applicants</a>
    </div>

    <div class="app-section">
      <h2>Versions</h2>
      <table style="width:100%; border-collapse:collapse;">${versionRows}</table>
    </div>

    <div class="app-section">
      <h2>Role weights</h2>
      <p class="app-meta" style="margin-bottom:10px;">Each row sums to 100. These are code-authoritative; the AI's claimed weights are ignored when recomputing the weighted score.</p>
      <div style="overflow-x:auto;">
        <table style="width:100%; border-collapse:collapse; font-size:0.9rem;">
          <thead><tr>${weightHeader}</tr></thead>
          <tbody>${weightRows}</tbody>
        </table>
      </div>
    </div>

    <div class="app-section">
      <h2>How the verdict is calculated</h2>
      <p style="color:var(--text); line-height:1.55; margin:0 0 12px;">Each applicant gets one of two verdicts:</p>
      <ul style="line-height:1.7; color:var(--text); padding-left:20px; margin:0 0 14px;">
        <li><strong style="color:#4ade80;">Recommend for interview</strong> — weighted score &ge; 3.7 and no category below 3.0.</li>
        <li><strong style="color:#bbb;">Don’t recommend</strong> — weighted score &lt; 3.7, any category below 2.5, or a serious concern (availability, eligibility).</li>
      </ul>
      <p class="app-meta" style="margin:0;">Internally the rubric still tracks four buckets (strong callback / callback / maybe / hold) for analytics. Managers see only the two-state verdict. Managers always make the final call — the system never auto-rejects an applicant.</p>
    </div>

    <div class="app-section">
      <h2>20-question questionnaire</h2>
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
