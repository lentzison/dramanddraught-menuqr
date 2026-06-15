const test = require('node:test');
const assert = require('node:assert/strict');
const { eventBaseName, eventIdentityKey, effectiveGroupKey } = require('../eventGrouping');

const D = '2026-06-19T15:00:00Z';

test('eventBaseName strips the "at Dram & Draught <venue>" suffix', () => {
  assert.equal(eventBaseName('FIFA World Cup Watch Party at Dram & Draught Greensboro'), 'FIFA World Cup Watch Party');
  assert.equal(eventBaseName('Maker’s Mark Cocktail Hour at Dram & Draught Wilmington'), 'Maker’s Mark Cocktail Hour');
  assert.equal(eventBaseName('Trivia Night - Dram and Draught Charlotte'), 'Trivia Night');
  assert.equal(eventBaseName('Just A Normal Title'), 'Just A Normal Title');
});

test('same event at different venues yields the same identity', () => {
  const a = eventIdentityKey('FIFA World Cup Watch Party at Dram & Draught Greensboro', D);
  const b = eventIdentityKey('FIFA World Cup Watch Party at Dram & Draught Winston', D);
  const c = eventIdentityKey('FIFA World Cup Watch Party at Dram & Draught Charlotte', D);
  assert.equal(a, b);
  assert.equal(b, c);
  assert.equal(a, 'fifa-world-cup-watch-party@2026-06-19');
});

test('Maker’s Mark example groups across venues', () => {
  const w = eventIdentityKey('Maker’s Mark Cocktail Hour at Dram & Draught Wilmington', D);
  const c = eventIdentityKey('Maker’s Mark Cocktail Hour at Dram & Draught Charlotte', D);
  assert.equal(w, c);
});

test('different events do not collide; different dates split', () => {
  assert.notEqual(
    eventIdentityKey('FIFA World Cup Watch Party at Dram & Draught Greensboro', D),
    eventIdentityKey('Maker’s Mark Cocktail Hour at Dram & Draught Greensboro', D),
  );
  assert.notEqual(
    eventIdentityKey('Trivia Night', '2026-06-19T00:00:00Z'),
    eventIdentityKey('Trivia Night', '2026-06-26T00:00:00Z'),
  );
});

test('effectiveGroupKey: manual override wins, src: ignored in favor of identity', () => {
  const id = eventIdentityKey('FIFA at Dram & Draught Greensboro', D);
  assert.equal(effectiveGroupKey({ title: 'FIFA at Dram & Draught Greensboro', startDate: D, groupKey: 'src:42' }), id);
  assert.equal(effectiveGroupKey({ title: 'FIFA at Dram & Draught Greensboro', startDate: D, groupKey: 'my-manual-group' }), 'my-manual-group');
  assert.equal(effectiveGroupKey({ title: 'FIFA at Dram & Draught Greensboro', startDate: D, groupKey: null }), id);
});
