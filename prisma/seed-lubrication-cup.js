#!/usr/bin/env node
// One-off seed: create a "Lubrication Cup" event at each active location.
// Idempotent — skips locations where the event already exists.
//
// This replaces the old hardcoded views/lubricationCupPage.js with a real
// dynamic event built from page sections, so admins can edit it from
// /admin/events going forward.
//
// Usage (one-off):
//   DATABASE_URL=... node prisma/seed-lubrication-cup.js
//   # Or via docker exec on the running container.

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const EVENT_SLUG = 'lubrication-cup';

// Sections built to mirror the old hardcoded page, using the section types
// supported by the new event page builder (hero, text, details, schedule,
// faq, divider, button).
function buildSections(locationName) {
  return [
    {
      id: 's_hero',
      type: 'text',
      heading: 'Bartender Speed Competition',
      body:
        'The Registered Lubrication Cup is a head-to-head bartender showdown ' +
        'judged on speed, accuracy, taste, presentation, and station reset.\n\n' +
        'Eight bartenders compete in three rounds. One walks away as the cup holder.',
      align: 'center',
      bgStyle: 'gold',
    },
    {
      id: 's_details',
      type: 'details',
      title: 'Event Info',
      items: [
        { label: 'Where', value: `Dram & Draught ${locationName}` },
        { label: 'When', value: 'TBA — check back soon' },
        { label: 'Format', value: '8 bartenders, 3 rounds, head-to-head' },
        { label: 'Arrival', value: 'Competitors at 6:30 PM · Competition starts 7:00 PM' },
      ],
      bgStyle: 'default',
    },
    {
      id: 's_round1',
      type: 'text',
      heading: 'Round One — Quarterfinals',
      body:
        '8 bartenders compete head-to-head. Each builds 3 cocktails. 4 advance.\n\n' +
        'Manhattan · Dry Martini · Daiquiri · Cosmopolitan',
      align: 'left',
    },
    {
      id: 's_round2',
      type: 'text',
      heading: 'Round Two — Semifinals',
      body:
        '4 winners go head-to-head. One cocktail decides who advances.\n\n' +
        'Mai Tai',
      align: 'left',
    },
    {
      id: 's_final',
      type: 'text',
      heading: 'The Final — Championship',
      body:
        'The last 2 standing. The ultimate test of skill and composure.\n\n' +
        'Ramos Gin Fizz',
      align: 'left',
      bgStyle: 'gold',
    },
    {
      id: 's_judged',
      type: 'details',
      title: 'Judged On',
      items: [
        { label: 'Speed', value: 'How fast can you build under pressure?' },
        { label: 'Accuracy', value: 'Recipe execution to spec' },
        { label: 'Taste', value: 'Does it actually drink well?' },
        { label: 'Presentation', value: 'Garnish, glassware, finish' },
        { label: 'Station Reset', value: 'Cleanliness and reset between drinks' },
      ],
    },
    {
      id: 's_divider1',
      type: 'divider',
    },
    {
      id: 's_menu_intro',
      type: 'text',
      heading: 'Event Cocktail Menu',
      body: 'Available for guests throughout the evening — $10 each.',
      align: 'center',
    },
    {
      id: 's_menu',
      type: 'details',
      title: '',
      items: [
        { label: 'Manhattan', value: 'Yellowstone Bourbon, Sweet Vermouth, Angostura Bitters' },
        { label: 'Dry Martini', value: 'The Botanist Gin, Dry Vermouth, Lemon Twist or Olive' },
        { label: 'Daiquiri', value: 'Brugal Rum, Lime, Simple Syrup' },
        { label: 'Cosmopolitan', value: "Tito's Vodka, Cointreau, Cranberry, Lime" },
        { label: 'Mai Tai', value: 'Diplomático Rum, Cointreau, Lime, Orgeat' },
        { label: 'Gin Fizz', value: 'Drumshanbo Brazilian Pineapple Gin, Lemon, Simple Syrup, Soda' },
      ],
    },
    {
      id: 's_divider2',
      type: 'divider',
    },
    {
      id: 's_compete_intro',
      type: 'text',
      heading: 'Compete in the Lubrication Cup',
      body:
        "We're looking for 8 bartenders to compete.\n\n" +
        'Sign up below and we\'ll be in touch with those selected.',
      align: 'center',
      bgStyle: 'gold',
    },
  ];
}

const CUSTOM_QUESTIONS = [
  { id: 'q_bar', label: 'Where do you bartend?', type: 'text', required: true },
  { id: 'q_experience', label: 'Years bartending', type: 'text', required: true },
];

async function main() {
  const locations = await prisma.location.findMany({ where: { isActive: true } });
  console.log(`Found ${locations.length} active locations.`);

  let created = 0;
  let skipped = 0;
  for (const loc of locations) {
    const existing = await prisma.event.findFirst({
      where: { locationId: loc.id, slug: EVENT_SLUG },
    });
    if (existing) {
      console.log(`  [skip] ${loc.slug} — already has /events/${EVENT_SLUG}`);
      skipped++;
      continue;
    }

    // Default to a generic upcoming date — admin should edit this in /admin/events.
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() + 1);
    startDate.setHours(19, 0, 0, 0); // 7:00 PM

    await prisma.event.create({
      data: {
        locationId: loc.id,
        slug: EVENT_SLUG,
        title: 'Lubrication Cup',
        description: 'A bartender speed competition. Eight competitors, three rounds, one cup holder.',
        startDate,
        endDate: null,
        image: null,
        promoteFrom: null,
        promoteUntil: null,
        capacity: 8,
        signupsEnabled: true,
        collectEmail: true,
        collectPhone: true,
        collectPartySize: false,
        collectNotes: false,
        customQuestions: CUSTOM_QUESTIONS,
        sections: buildSections(loc.name),
        confirmationMessage:
          "Thanks for signing up for the Lubrication Cup! We'll review applications and reach out to those selected. Good luck!",
        notifyEmail: null,
        isActive: false, // Start inactive — admin should review and activate
        isCancelled: false,
      },
    });
    console.log(`  [create] ${loc.slug} — /events/${EVENT_SLUG}`);
    created++;
  }

  console.log(`Done. Created ${created}, skipped ${skipped}.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
