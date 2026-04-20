// Seeds (or re-seeds) the Greensboro "Dram & Draught Spring Neighborhood Market" event.
// Idempotent: safe to run multiple times. Re-running refreshes the event body
// so we can iterate on copy without losing any vendor applications already
// collected (applications live in EventSignup, which this script never touches).
//
// Run:  node scripts/seed-spring-vendor-showcase.js

const { PrismaClient } = require('@prisma/client');

const LOCATION_SLUG = 'greensboro';
const EVENT_SLUG = 'spring-neighborhood-market';
const NOTIFY_EMAIL = 'anna@dramanddraught.com';

// Eastern May 16, 2026 2:00pm → 6:00pm. May is always EDT (UTC-4), so wall
// 14:00 ET = 18:00 UTC; wall 18:00 ET = 22:00 UTC.
const START = new Date(Date.UTC(2026, 4, 16, 18, 0, 0));
const END = new Date(Date.UTC(2026, 4, 16, 22, 0, 0));

const TITLE = 'Spring Neighborhood Market';
const DESCRIPTION = [
  "Come sip and shop at our outdoor spring market. Local makers, artists, and craftspeople set up for the afternoon with jewelry, ceramics, prints, paintings, candles, small-batch food, plants, vintage, and more.",
  '',
  "Pull up, wander around, grab a drink, and take home something good. Every spring & summer cocktail is $2 off all day. No cover, no RSVP. Bring friends.",
].join('\n');

const CONFIRMATION_MESSAGE = [
  "Thanks for applying.",
  "",
  "Anna reads every application herself. You'll hear back by email (usually within a few days) with a yes or a no. If it's a yes, we'll send load-in details at the same time.",
  "",
  "Questions in the meantime: anna@dramanddraught.com.",
].join('\n');

// Eight spring / summer cocktails, in the order they appear on the menu.
// Rendered on the page as a "details" section per drink for a clean layout.
const COCKTAILS = [
  { name: 'PASTELITO PUNCH', abv: '18%', ingredients: 'Planteray 3 Star Rum, Coconut, Guava, Lime', vibe: 'Speaks softly, hits hard', creator: 'KB Barman' },
  { name: 'OCEAN PARK', abv: '11%', ingredients: 'Lunazul Blanco Tequila, Crème de Cacao White, Pineapple–Szechuan Peppercorn Cordial, Soda', vibe: 'Bright, beachy, effervescent', creator: 'Anna from Greensboro' },
  { name: 'QUEENS KNEES', abv: null, ingredients: 'Peach–Apricot Infused Gin, Honey, Lemon', vibe: 'Royal, honeyed, floral', creator: 'Griffin from Cary' },
  { name: 'CHERRY BOMB', abv: '13%', ingredients: 'London Dry Gin, Cointreau, Cherry–Lime Oleo, Cherry Bitters, Lime, Soda', vibe: 'Nostalgic · loud · refreshing', creator: 'Jamie from Raleigh' },
  { name: 'LA MERCED', abv: '16%', ingredients: 'Don Q Cristal Rum, Aguardiente Antioqueño, Guava, Chambord, Lemon, Sugar', vibe: 'Lush, tropical, bright', creator: 'Santiago from Greensboro' },
  { name: 'YAPPERS DELIGHT', abv: '8%', ingredients: 'Italicus Rosolio, Watermelon, Lime, Prosecco', vibe: 'Watermelon spritz with a lot to say', creator: 'Cole in Cary' },
  { name: 'GRASSPIN BERRIES', abv: '18%', ingredients: 'Lemongrass-Infused Gin, Cocchi Americano, Chambord, Blackberry–Vanilla Oleo', vibe: 'Lush, bright, soft berry', creator: 'Rhett from Raleigh' },
  { name: 'GROUP THERAPY', abv: '19%', ingredients: 'Goatz Rum, Pussers Rum, Passionfruit, Mango, Lime, Absinthe, Tropi-500 Bitters', vibe: 'Tropical fruit chaos', creator: 'Matt from Wilmington' },
];

// Sections (rich page content). Stable ids so re-seeding doesn't churn order.
function buildSections() {
  return [
    {
      id: 'svs-details',
      type: 'details',
      bgStyle: 'gold',
      title: 'The Details',
      items: [
        { label: 'When', value: 'Saturday, May 16, 2026 · 2 – 6 PM' },
        { label: 'Where', value: 'Dram & Draught Greensboro · 300 West Gate City Blvd' },
        { label: 'Load-in', value: '1:00 PM · doors at 2:00 PM' },
        { label: 'Cocktail deal', value: '$2 off every spring & summer cocktail, all afternoon' },
        { label: 'Table fee', value: 'Free. You keep 100% of sales' },
      ],
    },
    {
      id: 'svs-vendor-pitch',
      type: 'text',
      bgStyle: 'gold',
      align: 'left',
      heading: 'Want to vend?',
      body: [
        "We're still taking applications. No table fee, keep 100% of what you sell.",
        '',
        "Bring jewelry, ceramics, prints, paintings, vintage, candles, food, plants, leatherwork, or anything else you make. Fill out the form to apply.",
      ].join('\n'),
    },
    {
      id: 'svs-setup',
      type: 'text',
      bgStyle: 'default',
      align: 'left',
      heading: 'What vendors should bring',
      body: [
        "The market is fully outdoors, so plan your setup for the weather. Bring your own table and your own tent or pop-up. If you need us to provide a table, say so in the form and we'll sort it out.",
        '',
        "Power: if you need an outlet at your spot, tell us in the form. We can't guarantee it if we don't know ahead of time.",
        '',
        "Selling food or drink samples? Please have proof of general liability insurance with you at load-in.",
      ].join('\n'),
    },
    {
      id: 'svs-menu',
      type: 'cocktailmenu',
      bgStyle: 'default',
      title: 'The Spring & Summer Menu',
      subtitle: 'All $2 off during the market',
      items: COCKTAILS.map(c => ({
        name: c.name,
        ingredients: c.ingredients,
        vibe: c.vibe,
      })),
    },
  ];
}

// Custom questions collected on the application form. Stable ids so re-seeding
// doesn't invalidate existing application answers.
const CUSTOM_QUESTIONS = [
  { id: 'q_business_name', label: 'Business / Brand Name', type: 'text', required: true },
  { id: 'q_business_type', label: 'What kind of vendor are you? (food, beverage, art, floral, apparel, other…)', type: 'text', required: true },
  { id: 'q_website', label: 'Website or Instagram', type: 'text', required: false },
  { id: 'q_bringing', label: 'What would you bring to the floor? (a few sentences is fine)', type: 'textarea', required: true },
  { id: 'q_power', label: 'Will you need access to power?', type: 'yesno', required: false },
];

async function main() {
  const prisma = new PrismaClient();
  try {
    const location = await prisma.location.findFirst({ where: { slug: LOCATION_SLUG } });
    if (!location) throw new Error(`Location not found: ${LOCATION_SLUG}`);

    const data = {
      locationId: location.id,
      slug: EVENT_SLUG,
      title: TITLE,
      description: DESCRIPTION,
      startDate: START,
      endDate: END,
      promoteFrom: null,
      promoteUntil: START, // stop accepting applications when the event starts
      capacity: null,
      signupsEnabled: true,
      collectEmail: true,
      collectPhone: true,
      collectPartySize: false,
      collectNotes: true,
      customQuestions: CUSTOM_QUESTIONS,
      sections: buildSections(),
      confirmationMessage: CONFIRMATION_MESSAGE,
      notifyEmail: NOTIFY_EMAIL,
      isActive: true,
      isCancelled: false,
      isVendorEvent: true,
    };

    const existing = await prisma.event.findFirst({
      where: { locationId: location.id, slug: EVENT_SLUG },
      select: { id: true },
    });

    let event;
    if (existing) {
      event = await prisma.event.update({ where: { id: existing.id }, data });
      console.log(`Updated event: ${event.title} (${event.id})`);
    } else {
      event = await prisma.event.create({ data });
      console.log(`Created event: ${event.title} (${event.id})`);
    }
    console.log(`Public URL: /${location.slug}/events/${event.slug}`);
    console.log(`Admin URL:  /admin/events/${event.id}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
