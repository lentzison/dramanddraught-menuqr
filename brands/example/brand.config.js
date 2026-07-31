// Brand config: Example Bar (placeholder second brand)
// ---------------------------------------------------------------------------
// This is a scaffold for the NEW bar. Every value below is a neutral
// placeholder — swap in the real name, colours, email domain, logo, and
// social handles, then run menuqr with BRAND=example and DATABASE_URL /
// BARTENDER_DB_URL pointed at this bar's OWN database.
//
// Keep the SHAPE identical to brands/dram/brand.config.js — only the values
// change. Anything you leave here renders as "Example Bar".
// ---------------------------------------------------------------------------

module.exports = {
  key: 'example',

  identity: {
    name: 'Example Bar',
    shortName: 'EB',
    tag: 'Your Tagline Here',
  },

  contact: {
    emailDomain: 'examplebar.com',
    systemCc: 'owner@examplebar.com',
    fromEmail: 'hello@examplebar.com',
    hiringEmail: 'jobs@examplebar.com',
    emailSignature: 'The Example Bar Team',
  },

  urls: {
    site: 'https://examplebar.com',
    menuqr: 'https://menuqr.examplebar.com',
    public: 'https://www.examplebar.com',
    bartender: 'https://bartender.examplebar.com',
  },

  social: {
    instagram: '@examplebar',
    facebook: '',
  },

  // Neutral slate/teal placeholder palette — replace with the new bar's colours.
  theme: {
    colors: {
      'bg-a': '#1b1e22',
      'bg-b': '#050607',
      panel: '#111417',
      'panel-soft': '#181c20',
      'panel-strong': '#0f1215',
      line: 'rgba(255, 255, 255, 0.12)',
      'line-strong': 'rgba(255, 255, 255, 0.22)',
      text: '#f2f4f5',
      muted: '#9aa2a8',
      gold: '#4fb8b0', // "accent" — teal placeholder
      amber: '#356b66',
      olive: '#4a5a55',
      steel: '#cdd4d6',
      smoke: '#6f767d',
      cream: '#ffffff',
      ink: '#080a0b',
      shadow: 'rgba(0, 0, 0, 0.62)',
      'accent-light': '#bfe9e5',
      'accent-soft': 'rgba(79, 184, 176, 0.14)',
      'accent-soft-strong': 'rgba(79, 184, 176, 0.22)',
      'accent-dark': 'rgba(53, 107, 102, 0.22)',
    },
    fonts: {
      displayFamily: 'Mostra One',
      displayStack:
        "'Mostra One', 'Futura', 'Avenir Next', 'Trade Gothic', 'Helvetica Neue', sans-serif",
      serifStack:
        '"Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, serif',
    },
  },

  assets: {
    // Drop the new bar's logo here (menuqr/assets/example-logo-white.png).
    logo: '/assets/example-logo-white.png',
    logoAlt: 'Example Bar',
    displayFontRegular: '/assets/fonts/MostraOne-Regular.ttf',
    displayFontBold: '/assets/fonts/MostraOne-Bold.ttf',
  },
};
