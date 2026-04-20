// Seeds (or re-seeds) the Raleigh "Neighborhood Art Pop-Up" event.
// Idempotent: re-running refreshes the page body without touching the
// artist applications (those live in EventSignup).
//
// Run:  node scripts/seed-art-popup.js

const { PrismaClient } = require('@prisma/client');

const LOCATION_SLUG = 'raleigh';
const EVENT_SLUG = 'neighborhood-art-popup';
const NOTIFY_EMAIL = 'jamie@dramanddraught.com';

// Eastern May 16, 2026 2:00pm → 6:00pm. May is always EDT (UTC-4).
const START = new Date(Date.UTC(2026, 4, 16, 18, 0, 0));
const END = new Date(Date.UTC(2026, 4, 16, 22, 0, 0));

const TITLE = 'Neighborhood Art Pop-Up';
const DESCRIPTION = [
  "Browse unique pieces from local artists while you sip one of our signature cocktails. One afternoon, one room (and a patio), all Raleigh makers.",
  '',
  "Pull up, wander around, meet the artists, and take something home. No cover, no RSVP. Bring friends.",
].join('\n');

const CONFIRMATION_MESSAGE = [
  "Thanks for applying.",
  "",
  "We'll send invites to accepted artists as slots open up. If you're in, you'll get an email from jamie@dramanddraught.com with next steps: the $10 lock-in fee to reserve your spot, 5 photos of your work so we can boost you on social, and day-of setup details.",
  "",
  "Questions: jamie@dramanddraught.com.",
].join('\n');

const COCKTAILS = [
  {
    name: 'BRUSHSTROKE BUCCANEER',
    ingredients: 'Captain Morgan, pineapple, orange, lime, strawberry-lemon oleo, coconut cream, tiki bitters',
    vibe: 'bright, creamy, tropical',
  },
  {
    name: 'ESPRESSO EXPRESSIONISM',
    ingredients: 'Astral Reposado, Mr. Black, coffee, vanilla demerara',
    vibe: 'rich, roasted, smooth',
  },
  {
    name: 'RANGPUR IN AMBER',
    ingredients: 'Tanqueray Rangpur, lemon, honey, Russian honey bitters, soda',
    vibe: 'crisp, citrusy, refreshing',
  },
  {
    name: 'STUDIO SPRITZ',
    ingredients: 'Ketel One, grenadine, peach bitters, lemon, prosecco, soda',
    vibe: 'light, fruity, bubbly',
  },
];

function buildSections() {
  return [
    // ── Public promotional content ────────────────────────────────────────
    {
      id: 'ap-details',
      type: 'details',
      bgStyle: 'default',
      title: 'The Details',
      items: [
        { label: 'When', value: 'Saturday, May 16, 2026 · 2 to 6 PM' },
        { label: 'Where', value: 'Dram & Draught Raleigh · 1 Glenwood Ave, Suite 101' },
        { label: 'Setting', value: 'Indoor + covered patio, first come first serve' },
        { label: 'Cover', value: 'No cover, no RSVP' },
      ],
    },
    {
      id: 'ap-menu',
      type: 'cocktailmenu',
      bgStyle: 'default',
      title: 'Signature Cocktails',
      subtitle: 'All cocktails $12',
      items: COCKTAILS,
    },
    {
      id: 'ap-artist-callout',
      type: 'text',
      bgStyle: 'gold',
      align: 'center',
      stackedImages: [
        '/assets/artpopup/artist.png',
        '/assets/artpopup/wanted.png',
      ],
      body: [
        "We're still taking applications. Painting, illustration, photography, printmaking, ceramics, jewelry, sculpture, collage, digital, whatever you make.",
        '',
        "Fill out the form to apply.",
      ].join('\n'),
    },

    // ── Post-submit acknowledgment (only shown on the terms page) ────────
    {
      id: 'ap-ack-parking',
      type: 'text',
      bgStyle: 'default',
      align: 'left',
      ackOnly: true,
      heading: 'Parking',
      body: [
        "We don't have our own lot. Your options are street parking or the pay deck across from us next to the Casso. Easiest move: unload in front of Dram, then go park so you don't haul your work a block.",
      ].join('\n'),
    },
    {
      id: 'ap-ack-setup',
      type: 'text',
      bgStyle: 'default',
      align: 'left',
      ackOnly: true,
      heading: 'Setting up the day of',
      body: [
        "Load-in starts at 12 PM. Everyone needs to be in place by 1 PM so we can open the doors to guests at 2.",
        '',
        "The patio is covered, so you don't need a tent. It does get windy out there, so bring weights for your work and table cover if you end up outside. Indoor spots are available too.",
        '',
        "We have large tables you can use, or bring your own if you want more room. Either way bring your own table cover. Staff will help you set up when you arrive.",
      ].join('\n'),
    },
    {
      id: 'ap-ack-lockin',
      type: 'text',
      bgStyle: 'default',
      align: 'left',
      ackOnly: true,
      heading: 'After you\u2019re accepted',
      body: [
        "Once Jamie sends your invite, you'll email jamie@dramanddraught.com with:",
        '',
        "1) A $10 lock-in fee to reserve your spot.",
        "2) Five photos of your work so we can hype you on our social accounts.",
        '',
        "Full day-of details will come in that invite email.",
      ].join('\n'),
    },
  ];
}

// Fields collected on the application form. Stable ids so re-seeding doesn't
// invalidate existing submissions.
const CUSTOM_QUESTIONS = [
  { id: 'q_artist_name', label: 'Artist Name', type: 'text', required: true },
  { id: 'q_artist_media', label: 'Artist Media (painting, photography, ceramics, jewelry, etc.)', type: 'text', required: true },
  { id: 'q_price_range', label: 'Price Range of Your Work', type: 'text', required: true },
  { id: 'q_instagram', label: 'Instagram Handle', type: 'text', required: false },
  { id: 'q_table', label: 'Would you like to use one of our tables?', type: 'yesno', required: true },
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
      promoteUntil: START,
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
      themeKey: 'art-gallery',
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
