#!/usr/bin/env node
// Build a standalone, local-only HTML version of the Raleigh Neighborhood
// Art Pop-Up event page.
//
// Output:  ~/Desktop/art-popup-local/
//            ├─ index.html     <- the rendered event page (self-contained)
//            └─ images/        <- copied art-popup assets + logo
//
// Run:  node scripts/build-art-popup-static.js
//
// The HTML is produced by the exact same generateEventPage() used by the
// live app, so the design stays in lockstep. Asset URLs (/assets/...) are
// rewritten to ./images/ so the file works by double-clicking with no
// server. The signup form action is neutralized because there's no
// backend to POST to locally.

const fs = require('fs');
const path = require('path');
const os = require('os');
const { generateEventPage } = require('../views/eventPage');

// ── Event data ─────────────────────────────────────────────────────────
// Duplicated from scripts/seed-art-popup.js so this file is self-contained.
// Keep in sync if the canonical seed is updated.

const COCKTAILS = [
  { name: 'BRUSHSTROKE BUCCANEER', ingredients: 'Captain Morgan, pineapple, orange, lime, strawberry-lemon oleo, coconut cream, tiki bitters', vibe: 'bright, creamy, tropical' },
  { name: 'ESPRESSO EXPRESSIONISM', ingredients: 'Astral Reposado, Mr. Black, coffee, vanilla demerara', vibe: 'rich, roasted, smooth' },
  { name: 'RANGPUR IN AMBER', ingredients: 'Tanqueray Rangpur, lemon, honey, Russian honey bitters, soda', vibe: 'crisp, citrusy, refreshing' },
  { name: 'STUDIO SPRITZ', ingredients: 'Ketel One, grenadine, peach bitters, lemon, prosecco, soda', vibe: 'light, fruity, bubbly' },
];

function buildSections() {
  return [
    {
      id: 'ap-topbanner',
      type: 'topbanner',
      body: "We're looking for vendors",
      buttonLabel: 'Apply',
      buttonHref: '#apply',
    },
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
      id: 'ap-closing',
      type: 'text',
      bgStyle: 'gold',
      align: 'center',
      heading: "We're looking for vendors",
      body: "If you're an artist, maker, or creator, we want to see your work. Fill out the application and we'll be in touch if there's a spot for you.",
    },
    {
      id: 'ap-closing-btn',
      type: 'button',
      bgStyle: 'transparent',
      label: 'Click here to apply \u2192',
      url: '#apply',
      style: 'primary',
    },
    {
      id: 'ap-ack-parking',
      type: 'text',
      bgStyle: 'default',
      align: 'left',
      ackOnly: true,
      heading: 'Parking',
      body: "We don't have our own lot. Your options are street parking or the pay deck across from us next to the Casso. Easiest move: unload in front of Dram, then go park so you don't haul your work a block.",
    },
    {
      id: 'ap-ack-setup',
      type: 'text',
      bgStyle: 'default',
      align: 'left',
      ackOnly: true,
      heading: 'Setting up the day of',
      body: [
        'Load-in starts at 12 PM. Everyone needs to be in place by 1 PM so we can open the doors to guests at 2.',
        '',
        "The patio is covered, so you don't need a tent. It does get windy out there, so bring weights for your work and table cover if you end up outside. Indoor spots are available too.",
        '',
        'We have large tables you can use, or bring your own if you want more room. Either way bring your own table cover. Staff will help you set up when you arrive.',
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
        "We'll be in touch with more details once you've been accepted.",
        '',
        "We'll use the images you uploaded to hype you on our social accounts ahead of the event.",
      ].join('\n'),
    },
  ];
}

const EVENT = {
  id: 'local-preview',
  slug: 'neighborhood-art-popup',
  title: 'Neighborhood Art Pop-Up',
  description: [
    'For one afternoon, Dram & Draught Raleigh turns into a gallery. Local painters, printmakers, ceramicists, photographers, jewelers, and sculptors set up across the room and out on our covered patio with pieces you can actually take home.',
    '',
    'Browse, meet the makers, buy what you love. Our full bar is open the whole time, including four brand-new signature cocktails built for the afternoon (all $12).',
    '',
    'No cover, no RSVP, just walk in.',
  ].join('\n'),
  startDate: new Date(Date.UTC(2026, 4, 16, 18, 0, 0)),
  endDate: new Date(Date.UTC(2026, 4, 16, 22, 0, 0)),
  image: null,
  promoteFrom: null,
  promoteUntil: new Date(Date.UTC(2026, 4, 16, 18, 0, 0)),
  capacity: null,
  signupsEnabled: true,
  collectEmail: true,
  collectPhone: true,
  collectPartySize: false,
  collectNotes: true,
  customQuestions: [
    { id: 'q_artist_name', label: 'Artist Name', type: 'text', required: true },
    { id: 'q_artist_media', label: 'Artist Media (painting, photography, ceramics, jewelry, etc.)', type: 'text', required: true },
    { id: 'q_price_range', label: 'Price Range of Your Work', type: 'text', required: true },
    { id: 'q_instagram', label: 'Instagram Handle', type: 'text', required: false },
    { id: 'q_table', label: 'Would you like to use one of our tables?', type: 'yesno', required: true },
    {
      id: 'q_work',
      label: 'Images of your work',
      type: 'images-multi',
      required: false,
      max: 5,
      hint: 'Optional, but adding work samples seriously helps your application. Up to 5 images.',
    },
  ],
  sections: buildSections(),
  confirmationMessage: '',
  notifyEmail: null,
  isActive: true,
  isCancelled: false,
  isVendorEvent: true,
  themeKey: 'art-gallery',
};

const LOCATION = { slug: 'raleigh', name: 'Raleigh' };

// ── Build ──────────────────────────────────────────────────────────────

const OUT_DIR = path.join(os.homedir(), 'Desktop', 'art-popup-local');
const IMAGES_DIR = path.join(OUT_DIR, 'images');
const ASSETS_ROOT = path.join(__dirname, '..', 'assets');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyFile(src, dest) {
  fs.copyFileSync(src, dest);
}

function rewriteAssetPaths(html) {
  // /assets/artpopup/foo.png  → ./images/foo.png
  // /assets/dram-draught-logo-white.png → ./images/dram-draught-logo-white.png
  return html
    .replace(/\/assets\/artpopup\//g, './images/')
    .replace(/\/assets\/dram-draught-logo-white\.png/g, './images/dram-draught-logo-white.png');
}

function neutralizeForm(html) {
  // No backend here — make the form submit do nothing so a double-click works
  // without an ugly "cannot POST" error. Also add a small note.
  return html.replace(
    /<form method="POST" action="[^"]*\/signup" class="ev-form">/,
    '<form method="POST" action="#" onsubmit="event.preventDefault(); alert(\'Local preview — the form is not wired to a server. Open the live page on menuqr.dramanddraught.com to actually submit.\');" class="ev-form">',
  );
}

function main() {
  console.log(`Building art pop-up preview → ${OUT_DIR}`);

  ensureDir(OUT_DIR);
  ensureDir(IMAGES_DIR);

  // 1. Copy all art-popup images + the brand logo into ./images/
  const artImages = fs.readdirSync(path.join(ASSETS_ROOT, 'artpopup'))
    .filter((f) => /\.(png|jpe?g|webp|gif|svg)$/i.test(f));
  for (const name of artImages) {
    copyFile(path.join(ASSETS_ROOT, 'artpopup', name), path.join(IMAGES_DIR, name));
  }
  const logoName = 'dram-draught-logo-white.png';
  const logoSrc = path.join(ASSETS_ROOT, logoName);
  if (fs.existsSync(logoSrc)) {
    copyFile(logoSrc, path.join(IMAGES_DIR, logoName));
  }
  console.log(`  copied ${artImages.length + 1} image(s) → ${IMAGES_DIR}`);

  // 2. Render the event page HTML through the shared view function, then
  //    rewrite asset paths to be relative and neutralize the signup form.
  let html = generateEventPage(LOCATION, EVENT, 0);
  html = rewriteAssetPaths(html);
  html = neutralizeForm(html);

  // 3. Prepend a tiny banner at the very top so it's obvious this is a
  //    local preview file and not the live page.
  const previewBanner = `
    <div style="background:#1a1816; color:#e7b83a; padding:6px 14px; font-family:-apple-system,BlinkMacSystemFont,Inter,sans-serif; font-size:0.78rem; text-align:center; letter-spacing:0.04em;">
      Local preview — not the live site. Edit <code style="color:#fffaf0">index.html</code> to iterate.
    </div>
  `;
  html = html.replace('<body', '<body data-preview="true"').replace(
    /(<body[^>]*>)/,
    (m) => `${m}\n${previewBanner}`,
  );

  // 4. Write out index.html
  const outFile = path.join(OUT_DIR, 'index.html');
  fs.writeFileSync(outFile, html, 'utf8');
  console.log(`  wrote ${outFile}`);
  console.log('');
  console.log(`Open with:  open "${outFile}"`);
}

main();
