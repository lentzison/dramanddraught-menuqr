// Cross-location ABV sync (pure logic, no DB).
//
// Each location carries the same liquors under DIFFERENT Bartender productIds,
// and an ABV override (SpiritNote.abv) is keyed by productId — so an ABV set at
// one location does not reach the same bottle elsewhere. This matches spirits
// across locations BY NAME and proposes filling a target's ABV from a source
// location (e.g. Cary), but only where the target currently has none.
//
// Policy (chosen): fill blanks only — never overwrite an ABV that already
// exists (catalog value or an existing override). Match: normalized-exact name
// (case / spacing / punctuation insensitive), no category requirement.

// Lowercase, strip punctuation/symbols to spaces, collapse runs. "Angel's Envy
// Port-Finish" and "angels envy port finish" normalize to the same key.
function normalizeName(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

// Effective ABV for an item: the read-only catalog value wins, else the
// menuqr-side override, else null (blank). Returns a finite number or null.
function effectiveAbv(item, overrides = {}) {
  const cat = item && item.abv;
  if (cat != null && cat !== '') { const n = Number.parseFloat(cat); if (Number.isFinite(n)) return n; }
  const o = overrides[String(item && item.productId)];
  if (o != null && o !== '') { const n = Number.parseFloat(o); if (Number.isFinite(n)) return n; }
  return null;
}

// source: { items: [{productId,name,abv,...}], overrides: {productId: abv} }
// targets: [{ slug, name, items, overrides }]
// Returns a plan describing, per target location, which blank spirits would be
// filled (and from which source name), plus what was skipped or unmatched.
function planAbvSync(source, targets = []) {
  // normalizedName -> { abv, name } from the source location's spirits that have
  // an ABV. First spirit wins; a later duplicate with a DIFFERENT abv is flagged.
  const sourceMap = new Map();
  const sourceConflicts = [];
  for (const it of (source && source.items) || []) {
    const abv = effectiveAbv(it, (source && source.overrides) || {});
    if (abv == null) continue;
    const key = normalizeName(it.name);
    if (!key) continue;
    const existing = sourceMap.get(key);
    if (!existing) sourceMap.set(key, { abv, name: it.name });
    else if (existing.abv !== abv) sourceConflicts.push({ name: it.name, abv, otherAbv: existing.abv });
  }

  const locations = (targets || []).map((t) => {
    const fills = [];      // blank + name-matched -> will set
    const unmatched = [];  // blank, no source match -> left alone
    let alreadySet = 0;    // not blank -> skipped (fill-blanks policy)
    for (const it of t.items || []) {
      if (effectiveAbv(it, t.overrides || {}) != null) { alreadySet += 1; continue; }
      const m = sourceMap.get(normalizeName(it.name));
      if (m) fills.push({ productId: String(it.productId), name: it.name || '', abv: m.abv, sourceName: m.name });
      else unmatched.push({ productId: String(it.productId), name: it.name || '' });
    }
    return { slug: t.slug, name: t.name, fills, unmatched, alreadySet };
  });

  const totalFills = locations.reduce((n, l) => n + l.fills.length, 0);
  return { sourceCount: sourceMap.size, sourceConflicts, locations, totalFills };
}

module.exports = { normalizeName, effectiveAbv, planAbvSync };
