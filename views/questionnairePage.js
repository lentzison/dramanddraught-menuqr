const { vintageThemeCss } = require('./publicTheme');
const { brandMarkCss, renderBrandMark } = require('./brandMark');
const { escHTML } = require('./escapeHtml');
const { QUESTIONS, APPLICANT_NOTICE, effectiveQuestionsForApplicant } = require('../hiring/knowledgeBase');

function pageShell(title, bodyHtml) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="theme-color" content="#0f1012" />
  <title>${escHTML(title)} — Dram &amp; Draught</title>
  <style>
    ${vintageThemeCss()}
    ${brandMarkCss()}
    .q-shell { max-width: 760px; margin: 0 auto; padding: 24px 18px 96px; }
    .q-head { margin-bottom: 18px; }
    .q-title { font-family: var(--brand-display, 'Mostra One', 'Futura', sans-serif); font-size: 1.75rem; line-height: 1.1; margin: 6px 0 4px; color: #f5f1e6; letter-spacing: 0.02em; }
    .q-sub { color: #a8acb3; font-size: 0.9rem; margin: 0 0 10px; }
    .q-card { background: rgba(20,21,24,0.85); border: 1px solid rgba(212,175,55,0.18); border-radius: 14px; padding: 22px 20px; margin-bottom: 18px; }
    .q-notice { color: #c8b770; font-size: 0.86rem; line-height: 1.5; white-space: pre-line; }
    .q-block { margin-bottom: 22px; }
    .q-label { display: block; font-size: 0.92rem; color: #f5f1e6; margin-bottom: 8px; font-weight: 600; line-height: 1.35; }
    .q-number { color: var(--gold); font-weight: 700; margin-right: 6px; }
    .q-required { color: #d4af37; font-size: 0.7rem; vertical-align: super; margin-left: 4px; }
    .q-textarea {
      width: 100%; box-sizing: border-box;
      background: #15161a; color: #f5f1e6;
      border: 1px solid rgba(212,175,55,0.25);
      border-radius: 8px; padding: 10px 12px;
      font-size: 0.95rem; font-family: inherit; line-height: 1.5;
      min-height: 90px; resize: vertical;
    }
    .q-textarea:focus { outline: 2px solid rgba(212,175,55,0.5); border-color: var(--gold); }
    .q-submit {
      display: block; width: 100%;
      background: linear-gradient(180deg, var(--accent-light, #e8c87a), var(--gold) 64%, #b6892e);
      color: #15161a; border: none; border-radius: 10px;
      padding: 14px 18px; font-size: 1rem; font-weight: 700; cursor: pointer;
      letter-spacing: 0.02em;
    }
    .q-submit:hover { filter: brightness(1.05); }
    .q-error {
      background: rgba(220,80,80,0.12);
      border: 1px solid rgba(220,80,80,0.4);
      color: #f4c5c5;
      border-radius: 8px; padding: 12px 14px; margin-bottom: 16px; font-size: 0.9rem;
    }
    .q-progress {
      color: #8d9299; font-size: 0.8rem; margin: 6px 0 18px;
      letter-spacing: 0.04em; text-transform: uppercase;
    }
    .q-done-card {
      text-align: center; padding: 36px 22px;
      background: rgba(20,21,24,0.85);
      border: 1px solid rgba(212,175,55,0.25);
      border-radius: 14px;
    }
    .q-done-card h1 { font-family: var(--brand-display, 'Mostra One', 'Futura', sans-serif); color: var(--gold); margin: 0 0 12px; letter-spacing: 0.02em; }
    .q-done-card p { color: #c8b770; line-height: 1.5; }
    .q-back-link { color: var(--gold); font-size: 0.85rem; text-decoration: none; }
    .q-back-link:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="q-shell">${bodyHtml}</div>
</body>
</html>`;
}

function generateQuestionnairePage({ application, locationName, locationSlug, prev = {}, errorMessage = null }) {
  // Show only the questions that apply to this applicant's role. Core
  // questions apply to everyone; role-specific questions only appear for
  // their tagged roles.
  const roleQuestions = effectiveQuestionsForApplicant(application);
  const fields = roleQuestions.map((q, idx) => {
    const value = prev[q.id] || '';
    return `
      <div class="q-block">
        <label class="q-label" for="${q.id}">
          <span class="q-number">${idx + 1}.</span>${escHTML(q.text)}<span class="q-required" title="Required">*</span>
        </label>
        <textarea class="q-textarea" name="${q.id}" id="${q.id}" required rows="3">${escHTML(value)}</textarea>
      </div>`;
  }).join('');

  const body = `
    <div class="q-head">
      ${renderBrandMark()}
      <h1 class="q-title">Hospitality questionnaire</h1>
      <p class="q-sub">For ${escHTML(application.name)} &middot; ${escHTML(locationName)}</p>
      <p class="q-progress">${roleQuestions.length} short-answer questions &middot; ~${Math.max(5, Math.round(roleQuestions.length * 0.7))} minutes</p>
    </div>

    <div class="q-card">
      <p class="q-notice">${escHTML(APPLICANT_NOTICE)}</p>
    </div>

    ${errorMessage ? `<div class="q-error">${escHTML(errorMessage)}</div>` : ''}

    <form method="POST" action="/apply/q/${escHTML(application.id)}" id="q-form">
      ${fields}
      <button type="submit" class="q-submit">Submit questionnaire</button>
    </form>

    <p style="margin-top:18px; text-align:center;">
      <a class="q-back-link" href="/${escHTML(locationSlug)}">&larr; Back to ${escHTML(locationName)}</a>
    </p>`;

  return pageShell('Hospitality questionnaire', body);
}

function generateQuestionnaireDonePage({ application, locationName, locationSlug }) {
  const body = `
    <div class="q-head">
      ${renderBrandMark()}
    </div>
    <div class="q-done-card">
      <h1>Thanks, ${escHTML((application.name || '').split(' ')[0] || 'friend')}!</h1>
      <p>Your application and questionnaire are in. A Dram &amp; Draught manager at ${escHTML(locationName)} will review your application and follow up with next steps.</p>
      <p style="margin-top:14px; color:#8d9299; font-size:0.85rem;">Reference: ${escHTML(application.id)}</p>
      <p style="margin-top:22px;"><a class="q-back-link" href="/${escHTML(locationSlug)}">&larr; Back to ${escHTML(locationName)}</a></p>
    </div>`;
  return pageShell('Questionnaire received', body);
}

function generateQuestionnaireExpiredPage({ locationName, locationSlug }) {
  const body = `
    <div class="q-head">
      ${renderBrandMark()}
    </div>
    <div class="q-done-card">
      <h1>Already submitted</h1>
      <p>This questionnaire has already been completed. If you need to update your answers, contact the ${escHTML(locationName)} team directly.</p>
      <p style="margin-top:22px;"><a class="q-back-link" href="/${escHTML(locationSlug)}">&larr; Back to ${escHTML(locationName)}</a></p>
    </div>`;
  return pageShell('Questionnaire already submitted', body);
}

module.exports = {
  generateQuestionnairePage,
  generateQuestionnaireDonePage,
  generateQuestionnaireExpiredPage,
};
