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

const TITLE = 'Dram & Draught Spring Neighborhood Market';
const DESCRIPTION = [
  'Celebrate the season with us. We\'re opening our doors to local makers, brands, and creative partners for an afternoon of spring spirits, fresh food, and good company — and we\'d love to have you on the floor.',
  '',
  'To mark the occasion, every one of our brand-new spring & summer cocktails is $2 off all afternoon. Come pour with us.',
].join('\n');

const CONFIRMATION_MESSAGE = [
  "Thanks for applying to the Dram & Draught Spring Neighborhood Market.",
  "",
  "Anna and our Greensboro team review every application personally. We'll be in touch by email with a decision — usually within a few days. If you're confirmed, we'll send setup, load-in, and day-of details at the same time.",
  "",
  "Questions in the meantime? Reply to the confirmation email or write to anna@dramanddraught.com.",
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
  const sections = [
    {
      id: 'svs-intro',
      type: 'text',
      bgStyle: 'default',
      align: 'left',
      heading: 'Who this is for',
      body: [
        "We're looking for food makers, beverage brands, artists, florists, apparel lines, and anyone whose work fits the spring-social vibe. You'll get a table on the floor, exposure to our Greensboro regulars and walk-in traffic, and a spot on the printed event program.",
        '',
        "Vendors set up at 1:00 PM. Doors open to guests at 2:00 PM. We wrap at 6:00 PM.",
      ].join('\n'),
    },
    {
      id: 'svs-details',
      type: 'details',
      bgStyle: 'gold',
      title: 'The Details',
      items: [
        { label: 'When', value: 'Saturday, May 16, 2026 · 2:00 – 6:00 PM' },
        { label: 'Where', value: 'Dram & Draught Greensboro — 300 West Gate City Blvd' },
        { label: 'Vendor setup', value: '1:00 PM (1 hr before doors)' },
        { label: 'Spring cocktail deal', value: '$2 off every spring & summer cocktail, all afternoon' },
        { label: 'Cost to vendor', value: 'No table fee — just bring your best' },
      ],
    },
    // Consolidated cocktail menu — one compact two-column grid of all 8 drinks.
    {
      id: 'svs-menu',
      type: 'cocktailmenu',
      bgStyle: 'default',
      title: 'The Spring & Summer Menu',
      subtitle: 'Every cocktail below is $2 off for the full event',
      items: COCKTAILS.map(c => ({
        name: c.name,
        abv: c.abv,
        ingredients: c.ingredients,
        vibe: c.vibe,
        creator: c.creator,
      })),
    },
  ];

  sections.push({
    id: 'svs-faq',
    type: 'faq',
    bgStyle: 'default',
    title: 'Common Questions',
    items: [
      {
        question: 'What does a vendor table look like?',
        answer: "We provide a 6-ft table, a chair or two, and access to power if needed. Bring your own signage, samples, and card reader. Tablecloths encouraged — spring colors extra encouraged.",
      },
      {
        question: 'Do I need insurance?',
        answer: "If you're serving samples of food or beverage, please have proof of general liability insurance ready when you load in. For non-consumable vendors, no insurance is required.",
      },
      {
        question: 'How do applications get picked?',
        answer: "Anna and our Greensboro GM review every application. We prioritize local makers, quality of craft, and vendor mix so the floor has real variety. Everyone hears back — yes or no.",
      },
      {
        question: 'Can I sell from my table?',
        answer: "Absolutely. You keep 100% of sales. We just ask that you handle your own transactions and sales tax.",
      },
    ],
  });

  sections.push({
    id: 'svs-closing',
    type: 'text',
    bgStyle: 'gold',
    align: 'center',
    heading: 'Apply using the form →',
    body: "Tell us about your business in the form. The more specific you can be about what you'd bring to the floor, the easier it is for us to say yes.",
  });

  return sections;
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
