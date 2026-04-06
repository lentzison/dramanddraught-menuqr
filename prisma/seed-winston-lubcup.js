#!/usr/bin/env node
// Re-seed only Winston-Salem's Lubrication Cup as an active event with signups.
// Idempotent — replaces any existing winston-salem/lubrication-cup event.

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const SLUG = 'lubrication-cup';
const LOCATION_SLUG = 'winston-salem';

const SECTIONS = [
  {
    id: 's_intro',
    type: 'text',
    heading: 'Bartender Speed Competition',
    body:
      'Eight bartenders, three rounds, head-to-head. Judged on speed, accuracy, taste, presentation, and station reset.\n\n' +
      'One walks away as the cup holder.',
    align: 'center',
    bgStyle: 'gold',
  },
  {
    id: 's_round1',
    type: 'text',
    heading: 'Round One — Quarterfinals',
    body: '8 bartenders, head-to-head. Each builds 3 cocktails. 4 advance.\n\nManhattan · Dry Martini · Daiquiri · Cosmopolitan',
    align: 'left',
  },
  {
    id: 's_round2',
    type: 'text',
    heading: 'Round Two — Semifinals',
    body: '4 winners go head-to-head. One cocktail decides who advances.\n\nMai Tai',
    align: 'left',
  },
  {
    id: 's_final',
    type: 'text',
    heading: 'The Final — Championship',
    body: 'The last 2 standing. The ultimate test of skill and composure.\n\nRamos Gin Fizz',
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
  { id: 's_div1', type: 'divider' },
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
  { id: 's_div2', type: 'divider' },
  {
    id: 's_compete',
    type: 'text',
    heading: 'Compete in the Lubrication Cup',
    body:
      "We're looking for 8 bartenders to compete.\n\n" +
      'Competitors arrive at 6:30 PM. Competition starts at 7:00 PM. Sign up below and we will be in touch with those selected.',
    align: 'center',
    bgStyle: 'gold',
  },
];

const CUSTOM_QUESTIONS = [
  { id: 'q_bar', label: 'Where do you bartend?', type: 'text', required: true },
  { id: 'q_experience', label: 'Years bartending', type: 'text', required: true },
];

async function main() {
  const loc = await prisma.location.findFirst({ where: { slug: LOCATION_SLUG, isActive: true } });
  if (!loc) { console.error(`Location ${LOCATION_SLUG} not found.`); process.exit(1); }

  // Remove any existing event with this slug at this location
  await prisma.event.deleteMany({ where: { locationId: loc.id, slug: SLUG } });

  // Default to a date next month at 7pm — admin should edit
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() + 1);
  startDate.setHours(19, 0, 0, 0);

  const created = await prisma.event.create({
    data: {
      locationId: loc.id,
      slug: SLUG,
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
      sections: SECTIONS,
      confirmationMessage:
        "Thanks for signing up for the Lubrication Cup! We'll review applications and reach out to those selected. Good luck!",
      notifyEmail: null,
      isActive: true,
      isCancelled: false,
    },
  });
  console.log(`Created ${LOCATION_SLUG}/events/${SLUG} (id: ${created.id}, signupsEnabled: ${created.signupsEnabled}, isActive: ${created.isActive})`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
