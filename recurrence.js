// Recurring-event date math. Pure (no Prisma). Generates the next N occurrence
// dates from a recurrence rule, computed in Eastern wall-clock time so "every
// Friday at 6pm" lands at 6pm Eastern across DST boundaries — matching how
// manually-entered event dates are stored (see dateEastern.js).

const { easternWallClockToUtc, easternParts } = require('./dateEastern');

const FREQUENCIES = new Set(['weekly', 'monthly']);
const WEEK_OF_MONTH = new Set([1, 2, 3, 4, 5, -1]); // -1 = last

// Coerce a raw rule (from the form or DB JSON) into a clean, validated shape, or
// null if it isn't a usable recurrence.
function normalizeRecurrenceRule(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const frequency = String(raw.frequency || '').toLowerCase();
  if (!FREQUENCIES.has(frequency)) return null;

  let interval = parseInt(raw.interval, 10);
  if (!(interval >= 1)) interval = 1;
  if (interval > 52) interval = 52;

  let weekday = parseInt(raw.weekday, 10);
  if (!(weekday >= 0 && weekday <= 6)) weekday = 5; // default Friday

  const time = /^\d{1,2}:\d{2}$/.test(String(raw.time || '')) ? String(raw.time) : '18:00';

  let durationMinutes = parseInt(raw.durationMinutes, 10);
  if (!(durationMinutes > 0)) durationMinutes = null;
  if (durationMinutes && durationMinutes > 24 * 60) durationMinutes = 24 * 60;

  let weekOfMonth = parseInt(raw.weekOfMonth, 10);
  if (!WEEK_OF_MONTH.has(weekOfMonth)) weekOfMonth = 1;

  const until = raw.until ? new Date(raw.until) : null;
  const untilValid = until && !Number.isNaN(until.getTime()) ? until : null;

  let count = parseInt(raw.count, 10);
  if (!(count >= 1)) count = null;
  if (count && count > 260) count = 260;

  const rule = { frequency, interval, weekday, time, durationMinutes, until: untilValid ? untilValid.toISOString() : null, count };
  if (frequency === 'monthly') rule.weekOfMonth = weekOfMonth;
  return rule;
}

function parseHourMinute(time) {
  const m = String(time).match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return { hour: 18, minute: 0 };
  return { hour: Math.min(23, parseInt(m[1], 10)), minute: Math.min(59, parseInt(m[2], 10)) };
}

// Add `days` to a civil {y,m,d} using a noon-UTC anchor (DST-safe arithmetic).
function addCivilDays({ y, m, d }, days) {
  const dt = new Date(Date.UTC(y, m - 1, d, 12) + days * 86400000);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

function civilWeekday({ y, m, d }) {
  return new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay();
}

// Date of the Nth (1-5, or -1=last) given weekday within month (y, m).
function nthWeekdayOfMonth(y, m, weekday, nth) {
  if (nth === -1) {
    // Walk back from the last day of the month.
    const lastDay = new Date(Date.UTC(y, m, 0, 12)).getUTCDate();
    let civil = { y, m, d: lastDay };
    while (civilWeekday(civil) !== weekday) civil = addCivilDays(civil, -1);
    return civil;
  }
  let civil = { y, m, d: 1 };
  while (civilWeekday(civil) !== weekday) civil = addCivilDays(civil, 1);
  civil = addCivilDays(civil, (nth - 1) * 7);
  return civil.m === m ? civil : null; // nth week may not exist (e.g. 5th)
}

function buildOccurrence(rule, civil) {
  const { hour, minute } = parseHourMinute(rule.time);
  const startDate = easternWallClockToUtc(civil.y, civil.m, civil.d, hour, minute);
  if (!startDate) return null;
  const endDate = rule.durationMinutes
    ? new Date(startDate.getTime() + rule.durationMinutes * 60000)
    : null;
  return { startDate, endDate };
}

/**
 * Generate the next `n` occurrences strictly AFTER `from`.
 * `count` is NOT applied here (the caller knows how many already exist) — only
 * the `until` date bound is enforced.
 * @returns {Array<{startDate: Date, endDate: Date|null}>}
 */
function generateOccurrences(rule, from, n) {
  const r = normalizeRecurrenceRule(rule);
  if (!r || !(n > 0)) return [];
  const fromMs = (from instanceof Date ? from : new Date(from)).getTime();
  const untilMs = r.until ? new Date(r.until).getTime() : null;
  const out = [];

  if (r.frequency === 'weekly') {
    // Find the first candidate date on the target weekday, on/after `from`'s
    // Eastern date, then step by interval weeks.
    let civil = easternParts(from);
    let delta = (r.weekday - civil.weekday + 7) % 7;
    civil = addCivilDays(civil, delta);
    let guard = 0;
    while (out.length < n && guard < 600) {
      guard++;
      const occ = buildOccurrence(r, civil);
      if (occ && occ.startDate.getTime() > fromMs) {
        if (untilMs && occ.startDate.getTime() > untilMs) break;
        out.push(occ);
      }
      civil = addCivilDays(civil, r.interval * 7);
    }
    return out;
  }

  // monthly: the Nth weekday of every `interval` months.
  let parts = easternParts(from);
  let { y, m } = parts;
  let guard = 0;
  while (out.length < n && guard < 600) {
    guard++;
    const civil = nthWeekdayOfMonth(y, m, r.weekday, r.weekOfMonth);
    if (civil) {
      const occ = buildOccurrence(r, civil);
      if (occ && occ.startDate.getTime() > fromMs) {
        if (untilMs && occ.startDate.getTime() > untilMs) break;
        out.push(occ);
      }
    }
    // advance interval months
    m += r.interval;
    while (m > 12) { m -= 12; y += 1; }
  }
  return out;
}

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const NTH_NAMES = { 1: 'first', 2: 'second', 3: 'third', 4: 'fourth', 5: 'fifth', '-1': 'last' };

// Human-readable summary for admin UI / emails.
function describeRecurrence(rule) {
  const r = normalizeRecurrenceRule(rule);
  if (!r) return '';
  const wd = WEEKDAY_NAMES[r.weekday];
  let base;
  if (r.frequency === 'weekly') {
    base = r.interval === 1 ? `Every ${wd}` : `Every ${r.interval} weeks on ${wd}`;
  } else {
    const nth = NTH_NAMES[String(r.weekOfMonth)] || 'first';
    base = r.interval === 1 ? `The ${nth} ${wd} of every month` : `The ${nth} ${wd} every ${r.interval} months`;
  }
  base += ` at ${r.time}`;
  if (r.until) base += ` until ${new Date(r.until).toLocaleDateString('en-US', { timeZone: 'America/New_York' })}`;
  else if (r.count) base += ` (${r.count} dates)`;
  return base;
}

module.exports = { normalizeRecurrenceRule, generateOccurrences, describeRecurrence };
