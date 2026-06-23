// Tests for the cross-location ABV sync planner (pure logic, no DB).
const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeName, effectiveAbv, planAbvSync } = require('../spiritAbvSync');

test('normalizeName ignores case, spacing, and punctuation', () => {
  assert.equal(normalizeName("Angel's Envy  Port-Finish"), 'angel s envy port finish');
  assert.equal(normalizeName('Buffalo Trace'), normalizeName('  buffalo   trace '));
  assert.equal(normalizeName('Lagavulin 16'), 'lagavulin 16');
  assert.equal(normalizeName(null), '');
});

test('effectiveAbv: catalog wins, then override, then null', () => {
  assert.equal(effectiveAbv({ productId: 'a', abv: 45 }, {}), 45);
  assert.equal(effectiveAbv({ productId: 'a', abv: null }, { a: 50 }), 50);
  assert.equal(effectiveAbv({ productId: 'a', abv: null }, {}), null);
  assert.equal(effectiveAbv({ productId: 'a', abv: '' }, { a: '' }), null);
});

test('fills only blank targets, matched by normalized name', () => {
  const source = {
    items: [
      { productId: 'c1', name: 'Buffalo Trace', abv: null },     // from override
      { productId: 'c2', name: "Angel's Envy", abv: 43.3 },       // from catalog
    ],
    overrides: { c1: 45 },
  };
  const targets = [{
    slug: 'greensboro', name: 'Greensboro',
    items: [
      { productId: 'g1', name: 'buffalo  trace', abv: null },     // blank -> fill 45
      { productId: 'g2', name: "Angel's Envy", abv: 43.3 },       // already has catalog abv -> skip
      { productId: 'g3', name: 'Pappy 23', abv: null },           // blank, no source match -> unmatched
    ],
    overrides: {},
  }];

  const plan = planAbvSync(source, targets);
  assert.equal(plan.sourceCount, 2);
  assert.equal(plan.totalFills, 1);
  const loc = plan.locations[0];
  assert.equal(loc.fills.length, 1);
  assert.deepEqual(
    { productId: loc.fills[0].productId, abv: loc.fills[0].abv },
    { productId: 'g1', abv: 45 },
  );
  assert.equal(loc.alreadySet, 1);
  assert.equal(loc.unmatched.length, 1);
  assert.equal(loc.unmatched[0].productId, 'g3');
});

test('does not overwrite an existing target override (fill-blanks policy)', () => {
  const source = { items: [{ productId: 'c1', name: 'Wild Turkey 101', abv: 50.5 }], overrides: {} };
  const targets = [{
    slug: 'raleigh', name: 'Raleigh',
    items: [{ productId: 'r1', name: 'Wild Turkey 101', abv: null }],
    overrides: { r1: 49 }, // already set via override -> not blank
  }];
  const plan = planAbvSync(source, targets);
  assert.equal(plan.totalFills, 0);
  assert.equal(plan.locations[0].alreadySet, 1);
});

test('flags source spirits that share a name but disagree on ABV', () => {
  const source = {
    items: [
      { productId: 'c1', name: 'Eagle Rare', abv: 45 },
      { productId: 'c2', name: 'eagle rare', abv: 50 }, // same normalized name, different abv
    ],
    overrides: {},
  };
  const plan = planAbvSync(source, []);
  assert.equal(plan.sourceCount, 1);            // first wins
  assert.equal(plan.sourceConflicts.length, 1); // but the disagreement is surfaced
});
