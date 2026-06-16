// Seeds (or re-seeds) the Cary "Rooftop Tiki Throwdown" cocktail competition.
// Idempotent: re-running refreshes the page/copy/config without touching any
// applications already collected (those live in EventSignup).
//
// Run:  node scripts/seed-tiki-throwdown.js

const { PrismaClient } = require('@prisma/client');

const LOCATION_SLUG = 'cary';
const EVENT_SLUG = 'rooftop-tiki-throwdown';
const TITLE = 'Rooftop Tiki Throwdown';

// Eastern times (July = EDT, UTC-4).
// Competition: Tue July 7, 2026, 6:00–9:00 PM ET  → 22:00 / next-day 01:00 UTC.
const START = new Date(Date.UTC(2026, 6, 7, 22, 0, 0));
const END = new Date(Date.UTC(2026, 6, 8, 1, 0, 0));
// Applications close end of day June 30, 2026 (11:59 PM ET) → July 1 03:59 UTC.
const APPLY_CLOSE = new Date(Date.UTC(2026, 6, 1, 3, 59, 0));

const DESCRIPTION = [
  'A rooftop tiki cocktail competition at Dram & Draught Cary (Fenton) on Tuesday, July 7. Six bartenders go head to head on an original tiki cocktail built around the Pierre Ferrand / Maison Ferrand portfolio — and the winning drink is featured across all our locations for International Tiki Day.',
  '',
  'Open to any bartender 21+. Apply by June 30; the six finalists are announced July 1.',
].join('\n');

const CONFIRMATION_MESSAGE = [
  'Thanks for applying to the Rooftop Tiki Throwdown!',
  '',
  "Applying doesn't guarantee a spot. We review every application and select six bartenders to compete. Selected competitors and waitlisted applicants are notified by email on July 1.",
  '',
  'If you’re selected, you’ll confirm your spot, submit your final recipe and station needs, and compete live on the rooftop at Dram & Draught Cary (Fenton) on July 7.',
  '',
  'Questions? Reply to your confirmation email and we’ll help out.',
].join('\n');

// 100-point judging rubric (drives finalist scoring once judges are added).
const JUDGING_CRITERIA = [
  { id: 'taste', label: 'Taste & balance', max: 40 },
  { id: 'tiki', label: 'Tiki creativity & originality', max: 20 },
  { id: 'ferrand', label: 'Use of Pierre Ferrand / Maison Ferrand product', max: 15 },
  { id: 'ops', label: 'Operational fit for Dram & Draught', max: 15 },
  { id: 'presentation', label: 'Presentation, story & inspiration', max: 10 },
];

// Application form. Name / Email / Phone are collected by the standard fields,
// so they're not repeated here. Stable ids so re-seeding keeps answers valid.
const CUSTOM_QUESTIONS = [
  // — Bartender info —
  { id: 'q_bar', label: 'Current bar / restaurant', type: 'text', required: true },
  { id: 'q_position', label: 'Position', type: 'text', required: true },
  { id: 'q_city', label: 'City', type: 'text', required: true },
  { id: 'q_instagram', label: 'Instagram handle', type: 'text', required: false },
  { id: 'q_age21', label: 'Are you 21 or older?', type: 'yesno', required: true },
  { id: 'q_available', label: 'Are you available to compete in person at Dram & Draught Cary (Fenton) on July 7?', type: 'yesno', required: true },
  { id: 'q_experience', label: 'How long have you been bartending?', type: 'text', required: true },
  { id: 'q_style', label: 'Describe your cocktail style in one sentence', type: 'text', required: true },
  { id: 'q_why', label: 'What makes you want to compete in this tiki competition?', type: 'textarea', required: true },
  // — Cocktail submission —
  { id: 'q_cocktail_name', label: 'Cocktail name', type: 'text', required: true },
  { id: 'q_ferrand_product', label: 'Which Pierre Ferrand / Maison Ferrand portfolio product are you featuring?', type: 'text', required: true },
  { id: 'q_ferrand_why', label: 'Why did you choose that product for this cocktail?', type: 'textarea', required: true },
  { id: 'q_recipe', label: 'Full cocktail recipe with exact measurements (total alcohol may not exceed 3 oz)', type: 'textarea', required: true },
  { id: 'q_method', label: 'Method', type: 'textarea', required: true },
  { id: 'q_glassware', label: 'Glassware', type: 'text', required: true },
  { id: 'q_garnish', label: 'Garnish', type: 'text', required: true },
  { id: 'q_inspiration', label: 'Short description or inspiration for the cocktail', type: 'textarea', required: true },
  { id: 'q_tiki', label: 'What makes this drink tiki?', type: 'textarea', required: true },
  { id: 'q_original', label: 'What makes this drink original?', type: 'textarea', required: true },
  { id: 'q_housemade', label: 'Any housemade ingredients (please label everything)', type: 'textarea', required: false },
  { id: 'q_allergens', label: 'Allergen information (disclose all allergens)', type: 'textarea', required: true },
  { id: 'q_equipment', label: 'Any special equipment, prep, garnish, or glassware requests?', type: 'textarea', required: false },
  // — Confirmation —
  { id: 'q_confirm', label: 'I understand that applying does not guarantee a spot, that selections are announced July 1, that I must be available to compete in person at Dram & Draught Cary (Fenton) on July 7 if selected, and that finalists make three cocktails in a 10-minute window.', type: 'yesno', required: true },
];

function buildSections() {
  const t = (id, heading, body, bgStyle = 'default') => ({ id, type: 'text', bgStyle, align: 'left', heading, body: body.join('\n') });
  return [
    {
      id: 'tiki-about', type: 'text', bgStyle: 'gold', align: 'left',
      heading: 'About the Throwdown',
      body: [
        'Dram & Draught is throwing a rooftop tiki cocktail competition at our Cary location in Fenton on Tuesday, July 7. Six bartenders go head to head to create an original tiki-inspired cocktail built around the Pierre Ferrand / Maison Ferrand portfolio — and the winning drink will be featured across all of our locations for International Tiki Day.',
        '',
        'The competition is open to any bartender 21 or older. Guests are welcome to come out, cheer on their favorite competitor, take photos, and enjoy the rooftop. To keep things fair for everyone behind the bar, winners are chosen by our judging panel alone.',
      ].join('\n'),
    },
    {
      id: 'tiki-details', type: 'details', bgStyle: 'default', title: 'The Details',
      items: [
        { label: 'What', value: 'Live rooftop tiki cocktail competition' },
        { label: 'When', value: 'Tuesday, July 7, 2026' },
        { label: 'Where', value: 'Dram & Draught Cary · Fenton (rooftop)' },
        { label: 'Apply by', value: 'End of day, Tuesday, June 30' },
        { label: 'Finalists announced', value: 'Wednesday, July 1' },
        { label: 'Who can enter', value: 'Any bartender 21 or older — one application each' },
        { label: 'The field', value: 'Six bartenders, chosen from applications' },
        { label: 'Judging', value: 'Three-judge panel, 100-point scale' },
      ],
    },
    t('tiki-apply', 'How to Apply', [
      'Spots are limited and bartenders need to apply to compete. Here’s how it works:',
      '',
      '• Applications close at the end of the day on June 30.',
      '• Six bartenders are selected to compete in the live rooftop final on July 7.',
      '• Selected competitors and waitlisted applicants are notified on July 1.',
      '• Each bartender may submit one application.',
      '• Applicants must be available to compete in person at Dram & Draught Cary in Fenton on July 7.',
      '',
      'Applying does not guarantee a spot. Finalists are chosen on the strength of their cocktail concept and originality, their use of the featured portfolio, how well the drink fits the tiki theme, whether it’s realistic to serve, and overall fit for the competition. If a selected competitor can’t make it, the spot may be offered to someone on the waitlist.',
    ]),
    {
      id: 'tiki-prizes', type: 'details', bgStyle: 'gold', title: 'Prizes',
      items: [
        { label: 'First place', value: 'A $200 Visa gift card. The winning cocktail is featured at every Dram & Draught location for International Tiki Day, and the winning bartender earns $1 for every qualifying featured cocktail sold during the promotional period.' },
        { label: 'Second place', value: 'A $100 Visa gift card.' },
      ],
    },
    t('tiki-cocktail-reqs', 'Cocktail Requirements', [
      'Every entry should be an original, tiki-inspired recipe that uses at least one approved Pierre Ferrand / Maison Ferrand product. We’re looking for drinks that are creative, flavorful, and great-looking — but also realistic to serve. The winning cocktail has to be practical enough to run at all of our locations for International Tiki Day.',
      '',
      '• Must be an original, tiki-inspired recipe.',
      '• Must use at least one approved Pierre Ferrand / Maison Ferrand portfolio product.',
      '• Total alcohol may not exceed 3 oz.',
      '• Your submission must include exact measurements, method, glassware, garnish, prep notes, and allergen information.',
    ]),
    t('tiki-setup', 'Ingredients & Setup', [
      'Dram & Draught provides the featured competition spirits and will do its best to accommodate approved day-of needs.',
      '',
      '• You may bring your own syrups, juices, spices, bitters, garnishes, and non-alcoholic modifiers.',
      '• All housemade ingredients must be clearly labeled, and all allergens must be disclosed.',
      '• List any special equipment, garnish, glassware, or prep needs in your application — we’ll review requests ahead of time and confirm what we can accommodate.',
      '• Dram & Draught reserves the right to decline any ingredient, preparation, garnish, or presentation that can’t be served legally, safely, or realistically during the event.',
    ]),
    t('tiki-format', 'Competition Format', [
      'The competition runs live on the rooftop at Dram & Draught Cary in Fenton on July 7. Six bartenders compete in front of a three-judge panel, with the running order drawn at random.',
      '',
      'Each competitor gets 10 minutes total to build, present, and tell the story of their cocktail, and must make three drinks — one for each judge. During your time, walk the judges through the inspiration behind the drink, why you chose your featured Pierre Ferrand / Maison Ferrand product, and how it fits the tiki theme.',
      '',
      'You may prep ingredients ahead of time, but the cocktail has to be finished live during your window. Once the event starts, no major recipe changes are allowed unless the organizer approves them.',
    ]),
    {
      id: 'tiki-judging', type: 'details', bgStyle: 'dark', title: 'How Drinks Are Judged (100 points)',
      items: [
        { label: 'Taste & balance', value: '40 points' },
        { label: 'Tiki creativity & originality', value: '20 points' },
        { label: 'Use of Pierre Ferrand / Maison Ferrand product', value: '15 points' },
        { label: 'Operational fit for Dram & Draught', value: '15 points' },
        { label: 'Presentation, story & inspiration', value: '10 points' },
        { label: 'Tiebreakers', value: 'Higher taste & balance score wins first; operational fit is the second tiebreaker. Winners are chosen by the judging panel only — crowd response doesn’t decide the outcome.' },
      ],
    },
    t('tiki-selected', 'If You’re Selected', [
      'Finalists have a few things to take care of before competition day:',
      '',
      '• Confirm your participation after you’re notified on July 1.',
      '• Submit your final recipe, prep list, and station needs by the requested deadline.',
      '• Arrive on time for check-in, setup, and the competition briefing on July 7.',
      '',
      'If a finalist can’t attend or doesn’t confirm by the deadline, their spot may be offered to a waitlisted applicant.',
    ]),
    {
      id: 'tiki-faq', type: 'faq', bgStyle: 'default', title: 'FAQ',
      items: [
        { question: 'Can Dram & Draught bartenders enter?', answer: 'Yes — Dram & Draught bartenders are welcome to apply, compete, and win.' },
        { question: 'Can I bring my own ingredients?', answer: 'Yes. You may bring syrups, juices, spices, bitters, garnishes, and non-alcoholic modifiers. We provide the featured competition spirits. Label all housemade ingredients and disclose every allergen.' },
        { question: 'How is the winner decided?', answer: 'By the three-judge panel only, on a 100-point scale. Guests are encouraged to cheer, but crowd response doesn’t decide the outcome.' },
        { question: 'What does the winner get?', answer: 'A $200 Visa gift card, the winning cocktail featured at every Dram & Draught location for International Tiki Day, and $1 for every qualifying featured cocktail sold during the promotion. Second place gets a $100 Visa gift card.' },
        { question: 'Are there judging conflict-of-interest rules?', answer: 'Yes. To avoid conflicts of interest, a judge may not score a competitor they directly manage, are dating, live with, or have a financial relationship with.' },
      ],
    },
    t('tiki-fineprint', 'The Fine Print', [
      'Photo & promotion rights: By entering, competitors give Dram & Draught permission to use their name, likeness, bar affiliation, cocktail name, recipe, and any photos or video from the event for marketing, social media, our website, email, menu promotion, and International Tiki Day promotion. We may photograph and film the event, and guests may appear in event photos or crowd shots.',
      '',
      'The winning cocktail feature: The first-place cocktail is featured at participating Dram & Draught locations for International Tiki Day, and the winning bartender earns $1 for every qualifying featured cocktail sold during the official promotional period. A qualifying sale is a featured cocktail rung up through the Dram & Draught POS during the promotion — comps, voids, refunds, staff drinks, test drinks, and zero-dollar items don’t count. Payment is based on POS sales reports and paid within 14 days after the promotion ends. We may make small adjustments to the winning cocktail for batching, service speed, ingredient availability, cost, or consistency; the winning bartender is still credited.',
      '',
      'Safety & service: Dram & Draught reserves the right to refuse service to any guest. Competitors and guests must follow all Dram & Draught house rules. Over-service, unsafe behavior, harassment, or disrespect toward competitors, judges, staff, or guests may result in removal from the event.',
    ], 'dark'),
  ];
}

async function main() {
  const prisma = new PrismaClient();
  try {
    let location = await prisma.location.findFirst({ where: { slug: LOCATION_SLUG } });
    if (!location) {
      location = await prisma.location.findFirst({ where: { name: { contains: 'Cary', mode: 'insensitive' } } });
    }
    if (!location) throw new Error(`Cary location not found (looked for slug "${LOCATION_SLUG}" and name containing "Cary").`);

    const data = {
      locationId: location.id,
      slug: EVENT_SLUG,
      title: TITLE,
      description: DESCRIPTION,
      startDate: START,
      endDate: END,
      promoteFrom: null,
      promoteUntil: APPLY_CLOSE, // applications close end of day June 30
      capacity: null, // applications aren't capped; six finalists are selected
      signupsEnabled: true,
      collectEmail: true,
      collectPhone: true,
      collectPartySize: false,
      collectNotes: false,
      // Competition entrant flow: routes applications to an approval queue and
      // unlocks finalist selection + judging.
      signupType: 'participant',
      isVendorEvent: false,
      customQuestions: CUSTOM_QUESTIONS,
      sections: buildSections(),
      confirmationMessage: CONFIRMATION_MESSAGE,
      isActive: true,
      isCancelled: false,
      // Judging: criteria + a six-finalist target. Add the three judges in the
      // editor to generate the shareable judge link.
      judgingCriteria: JUDGING_CRITERIA,
      finalistTarget: 6,
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
    console.log(`Location:   ${location.name} (${location.slug})`);
    console.log(`Public URL: /${location.slug}/events/${event.slug}`);
    console.log(`Admin URL:  /admin/events/${event.id}`);
    console.log('Next: open the event → Signups tab → add your 3 judges to generate the judge link; add a rooftop/tiki banner image under Appearance if you want one.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
