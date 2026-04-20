// Winston-Salem Monday specials: the six Lubrication Cup cocktails at $10.
//
// Creates (or refreshes) a Winston-scoped DayTheme for MONDAY that holds
// just these six classics. The public /specials lookup tries the
// location-scoped theme first and falls back to the company-wide Monday
// theme, so this override only affects the Winston QR code menu — every
// other location keeps Industry Night.
//
// Idempotent. Re-running wipes the theme's DailySpecials and reinserts.
//
// Run:  node scripts/seed-winston-monday-lubrication.js

const { PrismaClient } = require('@prisma/client');

const LOCATION_SLUG = 'winston-salem';
const DAY = 'MONDAY';

const THEME = {
  name: 'Lubrication Cup Classics',
  tagline: 'The six cocktails that decide the cup',
  description: 'All cocktails $10, all night.',
};

// Exactly the six drinks featured across Rounds 1, 2, and the Final of the
// Lubrication Cup. Order matches competition flow (quarterfinals → final).
const COCKTAILS = [
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

    const themeData = {
      dayOfWeek: DAY,
      locationId: location.id,
      name: THEME.name,
      tagline: THEME.tagline,
      description: THEME.description,
      isActive: true,
    };

    const existing = await prisma.dayTheme.findFirst({
      where: { dayOfWeek: DAY, locationId: location.id },
      select: { id: true },
    });

    let theme;
    if (existing) {
      theme = await prisma.dayTheme.update({ where: { id: existing.id }, data: themeData });
      // Wipe existing specials on this theme so we reinsert cleanly.
      await prisma.dailySpecial.deleteMany({ where: { dayThemeId: theme.id } });
      console.log(`Updated DayTheme for Winston-Salem Monday (${theme.id})`);
    } else {
      theme = await prisma.dayTheme.create({ data: themeData });
      console.log(`Created DayTheme for Winston-Salem Monday (${theme.id})`);
    }

    for (const [idx, c] of COCKTAILS.entries()) {
      await prisma.dailySpecial.create({
        data: {
          dayThemeId: theme.id,
          name: c.name,
          description: c.description,
          price: '$10',
          category: 'cocktail',
          section: '$10 Classic Cocktails',
          displayOrder: idx,
          isFeatured: idx === 0, // Manhattan gets the gold border as the lead-off
          isActive: true,
        },
      });
    }
    console.log(`  seeded ${COCKTAILS.length} cocktails.`);
    console.log(`Public URL: /${LOCATION_SLUG}/specials (Monday)`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
