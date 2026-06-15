// Cross-location event grouping by identity.
//
// Imported events are titled per-venue ("FIFA World Cup Watch Party at Dram &
// Draught Greensboro") and each venue is a separate source event with its own
// id — so grouping by source id fails to group the same event across venues,
// and grouping by raw title fails too (the venue is baked in). Instead we group
// by a computed IDENTITY: the base name (venue suffix stripped) + the date.
// That groups the same event across locations regardless of import order or
// source, and naturally keeps different dates (recurring runs) in separate
// groups. A manual Event.groupKey overrides the computed identity.

// Strip the "at Dram & Draught <venue>" (and similar) suffix to get the bare
// event name used for grouping and for the group label.
function eventBaseName(title) {
  const original = String(title || '').trim();
  let s = original;
  // "... at Dram & Draught Greensboro"  /  "... - Dram and Draught Winston"
  s = s.replace(/\s*(?:[-–—|@:]|\bat\b|\bwith\b)?\s*dram\s*(?:&|and|&amp;)?\s*draught\b.*$/i, '');
  s = s.trim().replace(/[\s\-–—|:]+$/, '').trim();
  return s || original;
}

// Stable identity key: base-name slug + ISO date (YYYY-MM-DD). Null when the
// title yields no usable base.
function eventIdentityKey(title, startDate) {
  const base = eventBaseName(title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!base) return null;
  let dateKey = 'nodate';
  if (startDate) {
    const d = new Date(startDate);
    if (!Number.isNaN(d.getTime())) dateKey = d.toISOString().slice(0, 10);
  }
  return `${base}@${dateKey}`;
}

// The key an event actually groups under: a real manual groupKey if present,
// otherwise the computed identity. Legacy auto keys ("src:<id>") are ignored in
// favor of identity so previously-imported events regroup correctly.
function effectiveGroupKey(event) {
  const gk = event && event.groupKey ? String(event.groupKey).trim() : '';
  if (gk && !gk.startsWith('src:')) return gk;
  return eventIdentityKey(event && event.title, event && event.startDate);
}

module.exports = { eventBaseName, eventIdentityKey, effectiveGroupKey };
