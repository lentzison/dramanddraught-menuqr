'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { parseOverrideDate, easternDateNoonUtc, easternParts } = require('../dateEastern');

// Map the same weekday index convention used by the createOverride validator.
const WD_TO_DAY = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];

test('parseOverrideDate rejects bad input', () => {
  assert.strictEqual(parseOverrideDate(''), null);
  assert.strictEqual(parseOverrideDate('not-a-date'), null);
  assert.strictEqual(parseOverrideDate('2026-13-40'), null);
  assert.strictEqual(parseOverrideDate(null), null);
});

test('an override date matches any Eastern instant on that calendar day (EDT/summer)', () => {
  // 2026-07-08 is a Wednesday (the day after the July 7 Tiki event).
  const stored = parseOverrideDate('2026-07-08');
  assert.ok(stored instanceof Date);

  // Midnight Eastern that day = 04:00 UTC (EDT, UTC-4).
  const justAfterMidnightET = new Date(Date.UTC(2026, 6, 8, 4, 5, 0));
  // 11:59 PM Eastern that day = 03:59 UTC the next calendar day in UTC.
  const lateNightET = new Date(Date.UTC(2026, 6, 9, 3, 59, 0));

  assert.strictEqual(easternDateNoonUtc(justAfterMidnightET).getTime(), stored.getTime());
  assert.strictEqual(easternDateNoonUtc(lateNightET).getTime(), stored.getTime());
});

test('an override date matches the right day in winter too (EST)', () => {
  // 2026-01-07 is a Wednesday.
  const stored = parseOverrideDate('2026-01-07');
  // 1:00 PM EST = 18:00 UTC that day.
  const middayET = new Date(Date.UTC(2026, 0, 7, 18, 0, 0));
  assert.strictEqual(easternDateNoonUtc(middayET).getTime(), stored.getTime());
  // The instant must NOT match the neighbouring day.
  const nextDay = new Date(Date.UTC(2026, 0, 8, 18, 0, 0));
  assert.notStrictEqual(easternDateNoonUtc(nextDay).getTime(), stored.getTime());
});

test('a UTC instant that is still "yesterday" in Eastern maps to the Eastern day', () => {
  // 2026-07-09 01:00 UTC is still 2026-07-08 21:00 in Eastern (EDT).
  const stored = parseOverrideDate('2026-07-08');
  const lateUtc = new Date(Date.UTC(2026, 6, 9, 1, 0, 0));
  assert.strictEqual(easternDateNoonUtc(lateUtc).getTime(), stored.getTime());
});

test('weekday derived from an override date is correct (validator basis)', () => {
  assert.strictEqual(WD_TO_DAY[easternParts(parseOverrideDate('2026-07-08')).weekday], 'WEDNESDAY');
  assert.strictEqual(WD_TO_DAY[easternParts(parseOverrideDate('2026-07-07')).weekday], 'TUESDAY');
  assert.strictEqual(WD_TO_DAY[easternParts(parseOverrideDate('2026-07-10')).weekday], 'FRIDAY');
});
