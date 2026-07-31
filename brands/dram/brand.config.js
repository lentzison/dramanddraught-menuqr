// Brand config: Dram & Draught
// ---------------------------------------------------------------------------
// This is the single source of truth for everything brand-specific in menuqr.
// Nothing else in the codebase should hardcode a brand name, colour, email
// domain, logo path, or social handle — it should read from getBrand() instead.
//
// To add a NEW bar: copy this folder to brands/<yourbrand>/, change the values,
// drop your logo + fonts into the assets referenced below, then run the app
// with BRAND=<yourbrand> pointed at that bar's own database.
// ---------------------------------------------------------------------------

module.exports = {
  key: 'dram',

  identity: {
    name: 'Dram & Draught',
    shortName: 'D&D',
    // Small-caps tag shown under the logo mark on public pages.
    tag: 'Neighborhood Whiskey Bars',
  },

  contact: {
    // Email domain used to build per-location addresses ({city}@<domain>).
    emailDomain: 'dramanddraught.com',
    // System addresses.
    systemCc: 'lentz@dramanddraught.com',
    fromEmail: 'cheers@dramanddraught.com',
    hiringEmail: 'hiring@dramanddraught.com',
    // Signature line used at the bottom of transactional / reply emails.
    emailSignature: 'The Dram & Draught Team',
  },

  urls: {
    // Public marketing site + sibling app origins. Env vars still win over
    // these when set (see brand.js), so a deployment can override per-host.
    site: 'https://dramanddraught.com',
    menuqr: 'https://menuqr.apps.dramanddraught.com',
    public: 'https://public.apps.dramanddraught.com',
    bartender: 'https://bartender.dramanddraught.com',
  },

  social: {
    instagram: '@dramanddraught',
    facebook: '', // per-location Facebook URLs live on each Location row
  },

  // Public microsite theme. These become the CSS :root variables emitted by
  // views/publicTheme.js — change them and the whole public side re-skins.
  theme: {
    colors: {
      'bg-a': '#191a1d',
      'bg-b': '#040404',
      panel: '#0f1012',
      'panel-soft': '#18191d',
      'panel-strong': '#111215',
      line: 'rgba(255, 255, 255, 0.12)',
      'line-strong': 'rgba(255, 255, 255, 0.22)',
      text: '#f3f1ee',
      muted: '#a7a3a0',
      gold: '#d2aa67',
      amber: '#8a5635',
      olive: '#5a6652',
      steel: '#d5d0c8',
      smoke: '#737780',
      cream: '#ffffff',
      ink: '#090909',
      shadow: 'rgba(0, 0, 0, 0.62)',
      'accent-light': '#f6e3c3',
      'accent-soft': 'rgba(210, 170, 103, 0.14)',
      'accent-soft-strong': 'rgba(210, 170, 103, 0.22)',
      'accent-dark': 'rgba(138, 86, 53, 0.22)',
    },
    fonts: {
      // Display face for headings + brand tags. The @font-face files are
      // referenced by assets.displayFont* below.
      displayFamily: 'Mostra One',
      displayStack:
        "'Mostra One', 'Futura', 'Avenir Next', 'Trade Gothic', 'Helvetica Neue', sans-serif",
      serifStack:
        '"Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, serif',
    },
  },

  assets: {
    // Paths are served from menuqr's /assets directory.
    logo: '/assets/dram-draught-logo-white.png',
    logoAlt: 'Dram & Draught',
    displayFontRegular: '/assets/fonts/MostraOne-Regular.ttf',
    displayFontBold: '/assets/fonts/MostraOne-Bold.ttf',
  },
};
