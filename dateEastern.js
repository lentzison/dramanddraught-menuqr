// Shared Eastern-timezone date helpers. The business operates on Eastern wall
// time, but the server runs in UTC, so anywhere we turn a human-entered local
// time into a stored timestamp we must convert Eastern → UTC explicitly. Using
// `new Date("YYYY-MM-DDTHH:MM")` would interpret the string in the SERVER's
// timezone (UTC in production) and shift everything by 4–5 hours.
//
// Extracted from routes/adminEvents.js so recurring-event date generation
// (recurrence.js) stays in lockstep with manually-entered event dates.

// Eastern Time UTC offset (in minutes) for a calendar date: -240 (EDT, summer)
// or -300 (EST, winter), handling DST automatically.
function getEasternOffsetMinutes(year, month, day) {
  const probe = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  const formatted = probe.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    timeZoneName: 'short',
  });
  return formatted.endsWith('EDT') ? -240 : -300;
}

// Build the UTC Date for a given Eastern wall-clock moment.
function easternWallClockToUtc(year, month, day, hour, minute) {
  const offsetMin = getEasternOffsetMinutes(year, month, day);
  // UTC = Eastern wall - offset (offset is negative for Eastern).
  const utcMs = Date.UTC(year, month - 1, day, hour, minute, 0) - offsetMin * 60 * 1000;
  const d = new Date(utcMs);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Parse a `datetime-local` input ("YYYY-MM-DDTHH:MM", no timezone) as an Eastern
// wall-clock time and return the corresponding UTC Date.
function parseDateTimeLocal(value) {
  if (!value) return null;
  const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return null;
  const [year, month, day, hour, minute] = m.slice(1).map((n) => parseInt(n, 10));
  if ([year, month, day, hour, minute].some((n) => Number.isNaN(n))) return null;
  return easternWallClockToUtc(year, month, day, hour, minute);
}

// The Eastern calendar date (year/month/day/weekday) for a UTC instant. Used by
// recurrence stepping so "every Friday" is computed in the location's timezone.
function easternParts(date) {
  const d = date instanceof Date ? date : new Date(date);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
  }).formatToParts(d);
  const get = (t) => parts.find((p) => p.type === t)?.value;
  const wdMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    y: parseInt(get('year'), 10),
    m: parseInt(get('month'), 10),
    d: parseInt(get('day'), 10),
    weekday: wdMap[get('weekday')],
  };
}

// Parse a date-only string ("YYYY-MM-DD") as an Eastern calendar date and return
// the UTC Date for NOON Eastern of that day. Noon avoids DST midnight edges, and
// every override date is stored/compared at this same canonical instant so exact
// equality matching works.
function parseOverrideDate(value) {
  if (!value) return null;
  const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const [year, month, day] = m.slice(1).map((n) => parseInt(n, 10));
  if ([year, month, day].some((n) => Number.isNaN(n))) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const utc = easternWallClockToUtc(year, month, day, 12, 0);
  if (!utc) return null;
  // Reject rolled-over dates (e.g. Feb 31): the stored instant must map back to
  // the same Eastern calendar date that was entered.
  const parts = easternParts(utc);
  if (parts.y !== year || parts.m !== month || parts.d !== day) return null;
  return utc;
}

// The canonical override instant (noon Eastern, in UTC) for the Eastern calendar
// date that a given UTC instant falls on. Used to match "today" against stored
// override dates.
function easternDateNoonUtc(date) {
  const { y, m, d } = easternParts(date);
  return easternWallClockToUtc(y, m, d, 12, 0);
}

// The noon-Eastern (UTC) instant for the next occurrence of a target weekday
// (0=Sun..6=Sat) on/after `fromDate`: returns today's date when it already is
// that weekday, otherwise the upcoming one within 7 days. Computed in Eastern
// calendar terms so DST never shifts the resulting day.
function upcomingWeekdayNoonUtc(targetWeekday, fromDate = new Date()) {
  if (typeof targetWeekday !== 'number' || targetWeekday < 0 || targetWeekday > 6) return null;
  const { y, m, d, weekday } = easternParts(fromDate);
  const delta = (targetWeekday - weekday + 7) % 7;
  return easternWallClockToUtc(y, m, d + delta, 12, 0);
}

module.exports = { getEasternOffsetMinutes, easternWallClockToUtc, parseDateTimeLocal, easternParts, parseOverrideDate, easternDateNoonUtc, upcomingWeekdayNoonUtc };
