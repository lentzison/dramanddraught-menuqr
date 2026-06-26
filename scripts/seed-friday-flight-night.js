// Seeds the "Friday Flight Night" special — a Whiskey Mini Cocktail Flight
// (Old Fashioned · Manhattan · Boulevardier) for $18 — onto the recurring
// FRIDAY day-theme at Greensboro, Winston-Salem, and Charlotte.
//
// Idempotent: safe to run repeatedly. Re-running updates the flight special in
// place (matched by name) rather than creating duplicates.
//
// IMPORTANT — preserves inherited specials:
//   The public specials page (routes/public.js:loadLocationSpecials) shows a
//   location's OWN Friday specials only when it has at least one; otherwise it
//   inherits the company-default (locationId = null) Friday specials. Adding
//   this location-specific special therefore detaches the location from that
//   inheritance. To avoid silently dropping whatever those menus show today,
//   this script first CLONES the company-default Friday specials into the
//   location theme (when the location has none of its own), then appends the
//   flight. After this runs, each location's Friday specials are managed
//   independently of the company default.
//
// Run:  node scripts/seed-friday-flight-night.js
//   (run on the server / wherever DATABASE_URL points at the live DB)

const { PrismaClient } = require('@prisma/client');

const LOCATION_SLUGS = ['greensboro', 'winston-salem', 'charlotte'];
const DAY = 'FRIDAY';

// Default name/tagline used ONLY when a location has no recurring Friday theme
// yet. Existing themes are left untouched (we only attach the special).
const THEME_DEFAULTS = {
  name: 'Friday Flight Night',
  tagline: 'Whiskey flights, $18',
};

// The special itself. Matched by `name` for idempotency — edit copy here and
// re-run to update in place across all three locations.
const FLIGHT_SPECIAL = {
  name: 'Whiskey Mini Cocktail Flight',
  description: 'Old Fashioned · Manhattan · Boulevardier',
  price: '$18',
  section: 'Friday Flight Night',
  detailText: 'Three whiskey classics in mini-pour size — sip them side by side.',
  category: 'cocktail',
  badges: null,
  timeWindow: null,
  isFeatured: true,
};

async function ensureFridayTheme(prisma, location) {
  const where = { dayOfWeek: DAY, locationId: location.id, overrideDate: null };
  let theme = await prisma.dayTheme.findFirst({ where });
  if (theme) return theme;
  theme = await prisma.dayTheme.create({
    data: {
      dayOfWeek: DAY,
      locationId: location.id,
      overrideDate: null,
      name: THEME_DEFAULTS.name,
      tagline: THEME_DEFAULTS.tagline,
      isActive: true,
    },
  });
  console.log(`  created Friday theme "${theme.name}"`);
  return theme;
}

// Copy company-default Friday specials into the location theme so the menu does
// not lose its currently-inherited content. No-op if the location already has
// its own specials, or if there is no company-default Friday theme.
async function preserveInheritedSpecials(prisma, locationTheme) {
  const own = await prisma.dailySpecial.findMany({
    where: { dayThemeId: locationTheme.id, isActive: true },
  });
  if (own.length > 0) return; // location manages its own Friday already

  const defaultTheme = await prisma.dayTheme.findFirst({
    where: { dayOfWeek: DAY, locationId: null, overrideDate: null, isActive: true },
    include: { specials: { where: { isActive: true }, orderBy: { displayOrder: 'asc' } } },
  });
  const inherited = defaultTheme ? defaultTheme.specials : [];
  if (!inherited.length) return;

  for (const s of inherited) {
    await prisma.dailySpecial.create({
      data: {
        dayThemeId: locationTheme.id,
        name: s.name,
        description: s.description,
        price: s.price,
        imageUrl: s.imageUrl,
        category: s.category,
        displayOrder: s.displayOrder,
        section: s.section,
        detailText: s.detailText,
        badges: s.badges,
        timeWindow: s.timeWindow,
        isFeatured: s.isFeatured,
        isActive: true,
      },
    });
  }
  console.log(`  cloned ${inherited.length} inherited company-default special(s) to preserve current menu`);
}

async function upsertFlightSpecial(prisma, theme) {
  const existing = await prisma.dailySpecial.findFirst({
    where: { dayThemeId: theme.id, name: FLIGHT_SPECIAL.name },
  });
  if (existing) {
    await prisma.dailySpecial.update({
      where: { id: existing.id },
      data: { ...FLIGHT_SPECIAL, isActive: true },
    });
    console.log(`  updated special "${FLIGHT_SPECIAL.name}" (${existing.id})`);
    return;
  }
  const maxOrder = await prisma.dailySpecial.findFirst({
    where: { dayThemeId: theme.id },
    orderBy: { displayOrder: 'desc' },
    select: { displayOrder: true },
  });
  const created = await prisma.dailySpecial.create({
    data: {
      dayThemeId: theme.id,
      ...FLIGHT_SPECIAL,
      displayOrder: maxOrder ? maxOrder.displayOrder + 1 : 0,
      isActive: true,
    },
  });
  console.log(`  created special "${FLIGHT_SPECIAL.name}" (${created.id})`);
}

async function main() {
  const prisma = new PrismaClient();
  try {
    for (const slug of LOCATION_SLUGS) {
      const location = await prisma.location.findFirst({ where: { slug } });
      if (!location) {
        console.warn(`! Location not found, skipping: ${slug}`);
        continue;
      }
      console.log(`\n${location.name} (${slug}):`);
      const theme = await ensureFridayTheme(prisma, location);
      await preserveInheritedSpecials(prisma, theme);
      await upsertFlightSpecial(prisma, theme);
      console.log(`  → /${slug}/specials (Friday)`);
    }
    console.log('\nDone.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
