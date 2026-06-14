// Shared logic for the competition-judging layer on events.
//
// Pure functions only (no DB, no I/O) so they can be unit-tested and reused by
// both the admin leaderboard and the public judge page. The persistence shape:
//   Event.judgingCriteria = [{ id, label, max }]
//   Event.judges          = [{ id, name }]
//   EventSignup.scorecards = [{ judgeId, scores: { critId: number }, notes, at }]

const crypto = require('crypto');

const MAX_CRITERIA = 12;
const MAX_JUDGES = 20;
const DEFAULT_CRITERION_MAX = 10;

function slugId(prefix) {
  return prefix + '_' + crypto.randomBytes(4).toString('hex');
}

// A judge link token: URL-safe, unguessable.
function makeJudgeToken() {
  return crypto.randomBytes(18).toString('base64url');
}

// Normalize criteria coming from the editor form or the DB into a clean
// [{ id, label, max }] array. Drops blank labels; clamps max to 1..100.
function normalizeCriteria(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const c of raw) {
    if (!c || typeof c !== 'object') continue;
    const label = String(c.label == null ? '' : c.label).trim().slice(0, 80);
    if (!label) continue;
    let max = Number(c.max);
    if (!Number.isFinite(max) || max <= 0) max = DEFAULT_CRITERION_MAX;
    max = Math.min(100, Math.max(1, Math.round(max)));
    out.push({ id: String(c.id || '').trim() || slugId('c'), label, max });
    if (out.length >= MAX_CRITERIA) break;
  }
  return out;
}

// Normalize the judge roster into [{ id, name }]. Drops blank names.
function normalizeJudges(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const j of raw) {
    if (!j || typeof j !== 'object') continue;
    const name = String(j.name == null ? '' : j.name).trim().slice(0, 80);
    if (!name) continue;
    out.push({ id: String(j.id || '').trim() || slugId('j'), name });
    if (out.length >= MAX_JUDGES) break;
  }
  return out;
}

// Total possible points across all criteria — the denominator for a perfect
// card. Returns 0 when there are no criteria.
function maxPossibleTotal(criteria) {
  return normalizeCriteria(criteria).reduce((sum, c) => sum + c.max, 0);
}

// Clamp one raw score to [0, criterion.max], snapped to 0.5. Non-numeric → null
// (meaning "not scored"), so a judge leaving a field blank is distinct from a 0.
function clampScore(value, max) {
  if (value === '' || value == null) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const snapped = Math.round(n * 2) / 2;
  return Math.min(max, Math.max(0, snapped));
}

// Sum one judge's scorecard across the criteria (missing scores count as 0 for
// the total, but completeness tracks how many were actually filled).
function scorecardTotal(scores, criteria) {
  const crit = normalizeCriteria(criteria);
  let total = 0;
  let filled = 0;
  for (const c of crit) {
    const v = scores && typeof scores[c.id] === 'number' ? scores[c.id] : null;
    if (v != null) { total += v; filled++; }
  }
  return { total, filled, of: crit.length };
}

// Aggregate finalists into a ranked leaderboard.
//   finalists: EventSignup rows where isFinalist is true.
// Returns rows sorted by average judge total (desc), each with:
//   { signup, judgeCards: [{judge, total, filled, notes, scored}],
//     judgesScored, averageTotal, perCriterionAvg: {critId: avg}, rank }
function aggregateResults(event, finalists) {
  const criteria = normalizeCriteria(event && event.judgingCriteria);
  const judges = normalizeJudges(event && event.judges);
  const judgeById = new Map(judges.map((j) => [j.id, j]));

  const rows = (finalists || []).map((signup) => {
    const cards = Array.isArray(signup.scorecards) ? signup.scorecards : [];
    const judgeCards = [];
    const perCriterionSums = {};
    const perCriterionCounts = {};
    let totalSum = 0;
    let judgesScored = 0;

    for (const card of cards) {
      if (!card || typeof card !== 'object') continue;
      const judge = judgeById.get(card.judgeId) || { id: card.judgeId, name: '(former judge)' };
      const { total, filled, of } = scorecardTotal(card.scores, criteria);
      const scored = filled > 0;
      if (scored) {
        totalSum += total;
        judgesScored++;
        for (const c of criteria) {
          const v = card.scores && typeof card.scores[c.id] === 'number' ? card.scores[c.id] : null;
          if (v != null) {
            perCriterionSums[c.id] = (perCriterionSums[c.id] || 0) + v;
            perCriterionCounts[c.id] = (perCriterionCounts[c.id] || 0) + 1;
          }
        }
      }
      judgeCards.push({ judge, total, filled, of, notes: card.notes || '', scored });
    }

    const averageTotal = judgesScored > 0 ? totalSum / judgesScored : 0;
    const perCriterionAvg = {};
    for (const c of criteria) {
      perCriterionAvg[c.id] = perCriterionCounts[c.id] ? perCriterionSums[c.id] / perCriterionCounts[c.id] : null;
    }
    return { signup, judgeCards, judgesScored, averageTotal, perCriterionAvg };
  });

  // Rank by average total desc; ties broken by number of judges scored, then name.
  rows.sort((a, b) => {
    if (b.averageTotal !== a.averageTotal) return b.averageTotal - a.averageTotal;
    if (b.judgesScored !== a.judgesScored) return b.judgesScored - a.judgesScored;
    return String(a.signup.name || '').localeCompare(String(b.signup.name || ''));
  });
  // Dense rank, sharing rank on exact average ties (only among scored rows).
  let rank = 0;
  let prevAvg = null;
  rows.forEach((row, i) => {
    if (row.judgesScored === 0) { row.rank = null; return; }
    if (prevAvg === null || row.averageTotal !== prevAvg) { rank = i + 1; prevAvg = row.averageTotal; }
    row.rank = rank;
  });
  return { criteria, judges, rows };
}

module.exports = {
  MAX_CRITERIA,
  MAX_JUDGES,
  DEFAULT_CRITERION_MAX,
  makeJudgeToken,
  normalizeCriteria,
  normalizeJudges,
  maxPossibleTotal,
  clampScore,
  scorecardTotal,
  aggregateResults,
};
