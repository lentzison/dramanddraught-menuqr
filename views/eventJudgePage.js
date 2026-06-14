// Public, token-gated judge scoring page for competition events.
// Mounted at /events/judge/:token. Judges pick their name from the roster,
// then score each finalist on the event's criteria. Mobile-first — judges are
// scoring on their phones at a live event.

const { escHTML } = require('./escapeHtml');
const { normalizeCriteria, normalizeJudges } = require('../eventJudging');

function shell(title, body) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="theme-color" content="#0f1012" />
  <meta name="robots" content="noindex" />
  <title>${escHTML(title)} — Dram &amp; Draught</title>
  <style>
    :root { --gold:#d4af37; --bg:#0f1012; --card:rgba(20,21,24,0.9); --line:rgba(212,175,55,0.2); }
    * { box-sizing:border-box; }
    body { margin:0; background:var(--bg); color:#f5f1e6; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif; line-height:1.5; }
    .jp-shell { max-width:680px; margin:0 auto; padding:20px 16px 96px; }
    .jp-kicker { color:var(--gold); font-size:0.72rem; font-weight:800; letter-spacing:0.1em; text-transform:uppercase; }
    .jp-title { font-size:1.6rem; margin:4px 0 2px; letter-spacing:0.01em; }
    .jp-sub { color:#a8acb3; font-size:0.9rem; margin:0 0 18px; }
    .jp-card { background:var(--card); border:1px solid var(--line); border-radius:14px; padding:18px 16px; margin-bottom:14px; }
    .jp-fin-name { font-size:1.2rem; font-weight:800; color:#f5f1e6; margin:0 0 2px; }
    .jp-fin-meta { color:#9aa0a8; font-size:0.85rem; margin:0 0 12px; }
    .jp-sub-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(150px,1fr)); gap:8px; margin:0 0 14px; }
    .jp-sub-field { background:#15161a; border:1px solid rgba(255,255,255,0.06); border-radius:8px; padding:8px 10px; font-size:0.84rem; }
    .jp-sub-field span { display:block; color:#c8b770; font-size:0.64rem; font-weight:800; letter-spacing:0.06em; text-transform:uppercase; margin-bottom:3px; }
    .jp-imgs { display:flex; gap:6px; flex-wrap:wrap; }
    .jp-imgs img { width:72px; height:72px; object-fit:cover; border-radius:6px; }
    .jp-crit { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:10px 0; border-top:1px solid rgba(255,255,255,0.07); }
    .jp-crit-label { font-size:0.95rem; }
    .jp-crit-max { color:#8d9299; font-size:0.78rem; }
    .jp-crit input { width:84px; background:#15161a; color:#f5f1e6; border:1px solid var(--line); border-radius:8px; padding:10px; font-size:16px; text-align:center; }
    .jp-notes { width:100%; margin-top:10px; background:#15161a; color:#f5f1e6; border:1px solid var(--line); border-radius:8px; padding:10px 12px; font-size:16px; font-family:inherit; min-height:60px; resize:vertical; }
    .jp-notes-label { display:block; font-size:0.72rem; text-transform:uppercase; letter-spacing:0.05em; color:#c8b770; margin:12px 0 4px; font-weight:700; }
    .jp-submit { position:sticky; bottom:0; display:block; width:100%; background:linear-gradient(180deg,#e8c87a,var(--gold) 64%,#b6892e); color:#15161a; border:none; border-radius:12px; padding:16px; font-size:1.05rem; font-weight:800; cursor:pointer; margin-top:8px; }
    .jp-judge-btn { display:block; width:100%; text-align:left; background:var(--card); border:1px solid var(--line); border-radius:12px; padding:16px; color:#f5f1e6; font-size:1.05rem; font-weight:700; text-decoration:none; margin-bottom:10px; }
    .jp-judge-btn:hover { border-color:var(--gold); }
    .jp-banner { border-radius:10px; padding:12px 14px; margin-bottom:16px; font-size:0.9rem; }
    .jp-banner.closed { background:rgba(220,80,80,0.12); border:1px solid rgba(220,80,80,0.4); color:#f4c5c5; }
    .jp-banner.ok { background:rgba(110,231,183,0.1); border:1px solid rgba(110,231,183,0.35); color:#b9f7cc; }
    .jp-switch { color:var(--gold); font-size:0.85rem; text-decoration:none; }
    .jp-done { color:#6ee7b7; font-size:0.78rem; font-weight:700; }
  </style>
</head>
<body><div class="jp-shell">${body}</div></body>
</html>`;
}

function notFoundPage() {
  return shell('Not found', `
    <div class="jp-card" style="text-align:center;">
      <h1 class="jp-title">Judging link not found</h1>
      <p class="jp-sub" style="margin:0;">This link is invalid or judging hasn't been set up for this event. Check with the event organizer.</p>
    </div>`);
}

// Judge picker — shown until a judge identifies themselves.
function judgePickerPage(event, { error } = {}) {
  const judges = normalizeJudges(event.judges);
  const buttons = judges.map(j =>
    `<a class="jp-judge-btn" href="?j=${encodeURIComponent(j.id)}">${escHTML(j.name)} &rarr;</a>`
  ).join('');
  return shell(`Judge — ${event.title}`, `
    <div class="jp-kicker">Cocktail judging</div>
    <h1 class="jp-title">${escHTML(event.title)}</h1>
    <p class="jp-sub">Who's judging? Tap your name to start scoring.</p>
    ${error ? `<div class="jp-banner closed">${escHTML(error)}</div>` : ''}
    ${event.judgingOpen ? '' : '<div class="jp-banner closed">Scoring isn\'t open yet. You can look, but you won\'t be able to submit until the organizer opens it.</div>'}
    ${buttons || '<div class="jp-card">No judges have been added for this event yet.</div>'}
  `);
}

// Scoring page for one identified judge across all finalists.
function judgeScoringPage(event, finalists, judge, { saved } = {}) {
  const criteria = normalizeCriteria(event.judgingCriteria);
  const customDefs = Array.isArray(event.customQuestions) ? event.customQuestions : [];
  const open = event.judgingOpen === true;

  const submissionSummary = (signup) => {
    const answers = signup.customAnswers || {};
    return customDefs.map((q) => {
      const v = answers[q.id];
      if (v == null || v === '') return '';
      if (q.type === 'images-multi' && Array.isArray(v)) {
        const imgs = v.filter(x => typeof x === 'string' && /^(data:image|https?:\/\/)/i.test(x));
        if (!imgs.length) return '';
        return `<div class="jp-sub-field" style="grid-column:1/-1;"><span>${escHTML(q.label)}</span><div class="jp-imgs">${imgs.map(src => `<a href="${escHTML(src)}" target="_blank" rel="noopener"><img src="${escHTML(src)}" alt="" /></a>`).join('')}</div></div>`;
      }
      if (q.type === 'image' && /^(data:image|https?:\/\/)/i.test(String(v))) {
        return `<div class="jp-sub-field" style="grid-column:1/-1;"><span>${escHTML(q.label)}</span><div class="jp-imgs"><a href="${escHTML(String(v))}" target="_blank" rel="noopener"><img src="${escHTML(String(v))}" alt="" /></a></div></div>`;
      }
      return `<div class="jp-sub-field"><span>${escHTML(q.label)}</span><div>${escHTML(String(v))}</div></div>`;
    }).filter(Boolean).join('');
  };

  const cards = finalists.map((s) => {
    const myCard = (Array.isArray(s.scorecards) ? s.scorecards : []).find(c => c && c.judgeId === judge.id);
    const myScores = (myCard && myCard.scores) || {};
    const scored = myCard && myCard.scores && Object.keys(myCard.scores).length > 0;
    const critInputs = criteria.map(c => {
      const val = typeof myScores[c.id] === 'number' ? myScores[c.id] : '';
      return `
        <div class="jp-crit">
          <div><div class="jp-crit-label">${escHTML(c.label)}</div><div class="jp-crit-max">out of ${c.max}</div></div>
          <input type="number" inputmode="decimal" min="0" max="${c.max}" step="0.5" name="score_${escHTML(s.id)}_${escHTML(c.id)}" value="${val === '' ? '' : escHTML(String(val))}" ${open ? '' : 'disabled'} />
        </div>`;
    }).join('');
    const sub = submissionSummary(s);
    return `
      <div class="jp-card">
        <div class="jp-fin-name">${escHTML(s.name || 'Finalist')} ${scored ? '<span class="jp-done">✓ scored</span>' : ''}</div>
        ${sub ? `<div class="jp-sub-grid">${sub}</div>` : ''}
        ${critInputs}
        <label class="jp-notes-label">Notes (optional)</label>
        <textarea class="jp-notes" name="notes_${escHTML(s.id)}" ${open ? '' : 'disabled'} placeholder="Anything you want recorded.">${escHTML(myCard && myCard.notes ? myCard.notes : '')}</textarea>
      </div>`;
  }).join('');

  return shell(`Judging — ${event.title}`, `
    <div class="jp-kicker">Cocktail judging</div>
    <h1 class="jp-title">${escHTML(event.title)}</h1>
    <p class="jp-sub">Scoring as <strong>${escHTML(judge.name)}</strong> · <a class="jp-switch" href="?">not you?</a></p>
    ${saved ? '<div class="jp-banner ok">Your scores were saved. You can change them and submit again any time while scoring is open.</div>' : ''}
    ${open ? '' : '<div class="jp-banner closed">Scoring is closed. Your previous scores (if any) are shown but can\'t be changed.</div>'}
    ${finalists.length === 0 ? '<div class="jp-card">No finalists have been selected yet. Check back once the organizer picks them.</div>' : `
      <form method="POST" action="/events/judge/${escHTML(event.judgeToken)}">
        <input type="hidden" name="judgeId" value="${escHTML(judge.id)}" />
        ${cards}
        ${open ? '<button type="submit" class="jp-submit">Save my scores</button>' : ''}
      </form>`}
  `);
}

module.exports = { shell, notFoundPage, judgePickerPage, judgeScoringPage };
