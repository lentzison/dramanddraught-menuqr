// Winston-Salem Monday specials: Industry Night + the six Lubrication Cup
// cocktails at $10.
//
// The public /specials lookup prefers a location-scoped theme over the
// company-wide default, so once we create a Winston Monday theme it
// becomes the only thing Winston sees for that day. To avoid dropping
// the existing Industry Night specials, this script copies them from the
// company-wide Monday theme (locationId = null) into the Winston theme
// and then APPENDS the six Lubrication Cup cocktails in a new section.
//
// Idempotent. Re-running wipes the theme's DailySpecials and rebuilds
// the combined list from the current company-wide default.
//
// Run:  node scripts/seed-winston-monday-lubrication.js

const { PrismaClient } = require('@prisma/client');

const LOCATION_SLUG = 'winston-salem';
const DAY = 'MONDAY';

// Section label the added cocktails render under on the specials page.
const LUB_SECTION = '$10 Lubrication Cup Classics';

// Exactly the six drinks featured across Rounds 1, 2, and the Final of the
// Lubrication Cup. Order matches competition flow (quarterfinals → final).
const LUB_COCKTAILS = [
  { name: 'Manhattan',    description: 'Yellowstone Bourbon, Sweet Vermouth, Angostura Bitters' },
  { name: 'Dry Martini',  description: 'The Botanist Gin, Dry Vermouth, Lemon Twist or Olive' },
  { name: 'Daiquiri',     description: 'Brugal Rum, Lime, Simple Syrup' },
  { name: 'Cosmopolitan', description: "Tito's Vodka, Cointreau, Cranberry, Lime" },
  { name: 'Mai Tai',      description: 'Diplomático Rum, Cointreau, Lime, Orgeat' },
  { name: 'Gin Fizz',     description: 'Drumshanbo Brazilian Pineapple Gin, Lemon, Simple Syrup, Soda' },
];

async function main() {
  const prisma = new PrismaClient();
  try {
    const location = await prisma.location.findFirst({ where: { slug: LOCATION_SLUG } });
    if (!location) throw new Error(`Location not found: ${LOCATION_SLUG}`);

    // Read the company-wide Monday theme + its specials so Winston inherits
    // everything Industry Night usually shows.
    const defaultTheme = await prisma.dayTheme.findFirst({
      where: { dayOfWeek: DAY, locationId: null },
      include: { specials: { where: { isActive: true }, orderBy: { displayOrder: 'asc' } } },
    });
    if (!defaultTheme) {
      throw new Error('No company-wide Monday theme found. Seed it first.');
    }
    console.log(`Copying ${defaultTheme.specials.length} specials from "${defaultTheme.name}" (default Monday).`);

    const themeData = {
      dayOfWeek: DAY,
      locationId: location.id,
      name: defaultTheme.name,
      tagline: defaultTheme.tagline,
      description: defaultTheme.description,
      themeColor: defaultTheme.themeColor,
      halfPriceConfig: defaultTheme.halfPriceConfig || undefined,
      isActive: true,
    };

    const existing = await prisma.dayTheme.findFirst({
      where: { dayOfWeek: DAY, locationId: location.id },
      select: { id: true },
    });

    let theme;
    if (existing) {
      theme = await prisma.dayTheme.update({ where: { id: existing.id }, data: themeData });
      await prisma.dailySpecial.deleteMany({ where: { dayThemeId: theme.id } });
      console.log(`Updated DayTheme for Winston-Salem Monday (${theme.id})`);
    } else {
      theme = await prisma.dayTheme.create({ data: themeData });
      console.log(`Created DayTheme for Winston-Salem Monday (${theme.id})`);
    }

    // 1. Lead with the Lubrication Cup cocktails so they appear at the top.
    for (const [idx, c] of LUB_COCKTAILS.entries()) {
      await prisma.dailySpecial.create({
        data: {
          dayThemeId: theme.id,
          name: c.name,
          description: c.description,
          price: '$10',
          category: 'cocktail',
          section: LUB_SECTION,
          displayOrder: idx,
          isFeatured: idx === 0,
          isActive: true,
        },
      });
    }

    // 2. Follow with the default Industry Night specials (shift displayOrder
    //    so they fall below the Cup rows without reordering among themselves).
    const offset = LUB_COCKTAILS.length;
    for (const s of defaultTheme.specials) {
      await prisma.dailySpecial.create({
        data: {
          dayThemeId: theme.id,
          name: s.name,
          description: s.description,
          price: s.price,
          imageUrl: s.imageUrl,
          category: s.category,
          displayOrder: offset + s.displayOrder,
          section: s.section,
          detailText: s.detailText,
          badges: s.badges,
          timeWindow: s.timeWindow,
          isFeatured: s.isFeatured,
          isActive: true,
        },
      });
    }

    console.log(`  copied ${defaultTheme.specials.length} Industry Night specials + appended ${LUB_COCKTAILS.length} Lubrication Cup cocktails.`);
    console.log(`Public URL: /${LOCATION_SLUG}/specials (Monday)`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
