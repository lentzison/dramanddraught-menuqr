// Tests for the competition-judging aggregation logic.
const test = require('node:test');
const assert = require('node:assert/strict');
const j = require('../eventJudging');

test('normalizeCriteria drops blanks, clamps max, keeps ids', () => {
  const out = j.normalizeCriteria([
    { id: 'taste', label: 'Taste', max: 10 },
    { label: '   ', max: 5 },          // blank label dropped
    { label: 'Presentation', max: 0 }, // bad max → default 10
    { label: 'Creativity', max: 999 }, // clamped to 100
  ]);
  assert.equal(out.length, 3);
  assert.equal(out[0].id, 'taste');
  assert.equal(out[1].max, 10);
  assert.equal(out[2].max, 100);
});

test('normalizeJudges drops blanks and assigns ids', () => {
  const out = j.normalizeJudges([{ name: 'Carrie' }, { name: '' }, { id: 'x', name: 'Lentz' }]);
  assert.equal(out.length, 2);
  assert.ok(out[0].id);
  assert.equal(out[1].id, 'x');
});

test('clampScore snaps to 0.5 and bounds to [0,max]; blanks → null', () => {
  assert.equal(j.clampScore('7.3', 10), 7.5);
  assert.equal(j.clampScore(12, 10), 10);
  assert.equal(j.clampScore(-2, 10), 0);
  assert.equal(j.clampScore('', 10), null);
  assert.equal(j.clampScore(null, 10), null);
  assert.equal(j.clampScore('abc', 10), null);
});

test('makeJudgeToken is url-safe and unique-ish', () => {
  const a = j.makeJudgeToken();
  const b = j.makeJudgeToken();
  assert.notEqual(a, b);
  assert.match(a, /^[A-Za-z0-9_-]+$/);
});

const EVENT = {
  judgingCriteria: [
    { id: 'taste', label: 'Taste', max: 10 },
    { id: 'pres', label: 'Presentation', max: 5 },
  ],
  judges: [
    { id: 'j1', name: 'Carrie' },
    { id: 'j2', name: 'Lentz' },
    { id: 'j3', name: 'Sam' },
  ],
};

test('aggregateResults ranks by average judge total and breaks ties', () => {
  const finalists = [
    { name: 'Alice', scorecards: [
      { judgeId: 'j1', scores: { taste: 9, pres: 4 } },   // 13
      { judgeId: 'j2', scores: { taste: 8, pres: 5 } },   // 13
    ] }, // avg 13
    { name: 'Bob', scorecards: [
      { judgeId: 'j1', scores: { taste: 6, pres: 3 } },   // 9
    ] }, // avg 9
    { name: 'Cara', scorecards: [
      { judgeId: 'j1', scores: { taste: 10, pres: 5 } },  // 15
      { judgeId: 'j2', scores: { taste: 9, pres: 5 } },   // 14
      { judgeId: 'j3', scores: { taste: 10, pres: 4 } },  // 14
    ] }, // avg 14.33
    { name: 'Dan', scorecards: [] }, // unscored
  ];
  const { rows } = j.aggregateResults(EVENT, finalists);
  assert.deepEqual(rows.map(r => r.signup.name), ['Cara', 'Alice', 'Bob', 'Dan']);
  assert.equal(rows[0].rank, 1);
  assert.equal(rows[1].rank, 2);
  assert.equal(rows[2].rank, 3);
  assert.equal(rows[3].rank, null); // unscored finalists are unranked
  assert.equal(rows[3].judgesScored, 0);
  assert.ok(Math.abs(rows[0].averageTotal - 14.3333) < 0.01);
});

test('aggregateResults computes per-criterion averages and judge completeness', () => {
  const finalists = [
    { name: 'Alice', scorecards: [
      { judgeId: 'j1', scores: { taste: 8, pres: 4 } },
      { judgeId: 'j2', scores: { taste: 6, pres: 2 } },
    ] },
  ];
  const { rows } = j.aggregateResults(EVENT, finalists);
  assert.equal(rows[0].perCriterionAvg.taste, 7); // (8+6)/2
  assert.equal(rows[0].perCriterionAvg.pres, 3);  // (4+2)/2
  assert.equal(rows[0].judgesScored, 2);
});

test('aggregateResults tolerates scorecards from removed judges and partial scores', () => {
  const finalists = [
    { name: 'Alice', scorecards: [
      { judgeId: 'ghost', scores: { taste: 9, pres: 5 } }, // judge no longer in roster
      { judgeId: 'j1', scores: { taste: 7 } },             // partial (pres missing)
    ] },
  ];
  const { rows } = j.aggregateResults(EVENT, finalists);
  // Still aggregates; partial card contributes its filled score.
  assert.equal(rows[0].judgesScored, 2);
  assert.equal(rows[0].perCriterionAvg.taste, 8); // (9+7)/2
  assert.equal(rows[0].perCriterionAvg.pres, 5);  // only ghost scored pres
  const ghostCard = rows[0].judgeCards.find(c => c.judge.id === 'ghost');
  assert.equal(ghostCard.judge.name, '(former judge)');
});

test('maxPossibleTotal sums criterion maxes', () => {
  assert.equal(j.maxPossibleTotal(EVENT.judgingCriteria), 15);
  assert.equal(j.maxPossibleTotal([]), 0);
});
