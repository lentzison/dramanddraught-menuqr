// ─── Event page theme registry ───
// Single source of truth for the visual themes an admin can pick for an event's
// public page. The default (dark vintage) theme plus the two original
// hand-decorated themes (spring-market, art-gallery) keep their CSS inline in
// eventPage.js — here they exist only as picker metadata (css: null).
//
// New "palette" themes are fully data-driven: a compact spec is expanded into a
// complete `body.<class> { ... }` override block by paletteThemeCss(), mirroring
// the selector coverage of the original spring-market theme. That means a new
// theme is just a row of colors — no asset files, instant and reliable. The
// architecture stays open to richer decorated themes later (give an entry its
// own `css` string and skip the generator).

// ── color helpers ─────────────────────────────────────────────────────────
function hexToRgb(hex) {
  let h = String(hex || '').trim().replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  if (Number.isNaN(n) || h.length !== 6) return { r: 0, g: 0, b: 0 };
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgba(hex, a) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

// Perceived luminance (0–1). Used to choose readable text on accent buttons.
function luminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  const lin = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

// Pick a readable text color (near-black or near-white) for a given background.
function readableOn(hex) {
  return luminance(hex) > 0.5 ? '#15110c' : '#fdfaf4';
}

// ── palette → CSS generator ─────────────────────────────────────────────────
// p fields:
//   scheme: 'dark' | 'light'    (controls a few default tints)
//   accent, accent2             primary + secondary accent (hex)
//   bgA, bgB, bgMid?            page background gradient stops
//   text, steel, muted, smoke   text colors (headings, body, labels, faint)
//   panel, panelStrong          card surface gradient stops
//   font?                       optional font-family stack for the theme
//   bodyBgExtra?                optional decorative background layers (prepended)
function paletteThemeCss(cls, p) {
  const dark = p.scheme === 'dark';
  const line = p.line || (dark ? 'rgba(255,255,255,0.12)' : rgba(p.accent, 0.22));
  const lineStrong = p.lineStrong || (dark ? 'rgba(255,255,255,0.22)' : rgba(p.accent, 0.4));
  const shadow = p.shadow || (dark ? 'rgba(0,0,0,0.55)' : rgba(p.accent2, 0.22));
  const bgMid = p.bgMid || p.bgA;
  const font = p.font ? `\n          font-family: ${p.font};` : '';
  const accentLine = `linear-gradient(90deg, transparent, ${p.accent2}, ${p.accent}, transparent)`;
  const btnText = readableOn(p.accent2);
  const inputBg = p.inputBg || (dark ? 'rgba(255,255,255,0.045)' : '#ffffff');
  const inputFocusBg = p.inputFocusBg || (dark ? 'rgba(255,255,255,0.08)' : '#ffffff');
  const decoLayers = p.bodyBgExtra ? `${p.bodyBgExtra},\n            ` : '';

  return `
        /* ${cls} — generated palette theme */
        body.${cls} {
          --gold: ${p.accent};
          --amber: ${p.accent2};
          --accent-light: ${p.accentLight || p.text};
          --accent-soft: ${rgba(p.accent, 0.14)};
          --accent-soft-strong: ${rgba(p.accent, 0.22)};
          --text: ${p.text};
          --steel: ${p.steel};
          --muted: ${p.muted};
          --smoke: ${p.smoke};
          --bg-a: ${p.bgA};
          --bg-b: ${p.bgB};
          --panel: ${p.panel};
          --panel-strong: ${p.panelStrong};
          --line: ${line};
          --line-strong: ${lineStrong};
          --shadow: ${shadow};
          color-scheme: ${dark ? 'dark' : 'light'};
          color: ${p.text};${font}
          background:
            ${decoLayers}radial-gradient(900px 380px at 14% -8%, ${rgba(p.accent, dark ? 0.18 : 0.4)}, transparent 60%),
            radial-gradient(1080px 540px at 100% 0%, ${rgba(p.accent2, dark ? 0.16 : 0.34)}, transparent 58%),
            radial-gradient(760px 380px at 50% 112%, ${rgba(p.accent, dark ? 0.1 : 0.22)}, transparent 62%),
            linear-gradient(180deg, ${p.bgA} 0%, ${bgMid} 45%, ${p.bgB} 100%);
          background-attachment: fixed, fixed, fixed, fixed${p.bodyBgExtra ? ', fixed' : ''};
        }
        body.${cls} .ev-wrap { position: relative; z-index: 2; }

        body.${cls} .ev-hero {
          background:
            radial-gradient(circle at 18% 0%, ${rgba(p.accent, dark ? 0.28 : 0.45)}, transparent 55%),
            radial-gradient(circle at 85% 100%, ${rgba(p.accent2, dark ? 0.22 : 0.4)}, transparent 55%),
            linear-gradient(180deg, ${p.panel} 0%, ${p.panelStrong} 100%);
          border: 1px solid ${rgba(p.accent, dark ? 0.32 : 0.4)};
          box-shadow: 0 24px 60px ${shadow}, inset 0 0 0 1px ${rgba(dark ? '#ffffff' : '#ffffff', dark ? 0.05 : 0.5)};
        }
        body.${cls} .ev-hero::before {
          background: ${accentLine};
          opacity: 0.95;
          height: 2px;
          max-width: 440px;
        }
        body.${cls} .ev-hero-eyebrow,
        body.${cls} .ev-side-kicker { color: ${p.accent2}; }
        body.${cls} .ev-hero-title { color: ${p.text}; }
        body.${cls} .ev-hero-location { color: ${p.accent}; }
        body.${cls} .ev-hero-divider {
          background: linear-gradient(90deg, transparent, ${p.accent} 30%, ${p.accent2} 70%, transparent);
          opacity: 1;
          height: 2px;
        }
        body.${cls} .ev-back,
        body.${cls} .ev-all-events { color: ${p.muted}; }
        body.${cls} .ev-back:hover,
        body.${cls} .ev-all-events:hover { color: ${p.accent}; }

        body.${cls} .ev-details,
        body.${cls} .ev-side-card,
        body.${cls} .ev-sec-text,
        body.${cls} .ev-sec-details,
        body.${cls} .ev-sec-schedule,
        body.${cls} .ev-sec-faq {
          background: linear-gradient(180deg, ${p.panel}, ${p.panelStrong});
          border: 1px solid ${line};
          box-shadow: 0 10px 28px ${shadow};
        }
        body.${cls} .ev-sec-bg-gold {
          background:
            radial-gradient(circle at 20% 0%, ${rgba(p.accent2, 0.4)}, transparent 60%),
            linear-gradient(180deg, ${rgba(p.accent, 0.16)}, ${rgba(p.accent2, 0.14)}) !important;
          border-color: ${rgba(p.accent2, 0.4)} !important;
          box-shadow: 0 14px 32px ${rgba(p.accent2, 0.18)}, inset 0 0 0 1px ${rgba(dark ? '#ffffff' : '#ffffff', dark ? 0.04 : 0.5)} !important;
        }
        body.${cls} .ev-sec-bg-dark {
          background: linear-gradient(180deg, ${p.panelStrong}, ${p.panel}) !important;
          border-color: ${line} !important;
        }
        body.${cls} .ev-sec-heading::after,
        body.${cls} .ev-sec-details-title::after,
        body.${cls} .ev-sec-text .ev-sec-heading::after {
          background: linear-gradient(90deg, ${p.accent}, ${p.accent2});
          opacity: 1;
          width: 60px;
          height: 2px;
        }
        body.${cls} .ev-datetime-label,
        body.${cls} .ev-sec-details-label,
        body.${cls} .ev-form label { color: ${p.muted}; }
        body.${cls} .ev-datetime-value,
        body.${cls} .ev-sec-details-value,
        body.${cls} .ev-side-title { color: ${p.text}; }
        body.${cls} .ev-description,
        body.${cls} .ev-side-copy { color: ${p.steel}; }
        body.${cls} .ev-detail-chip {
          background: linear-gradient(135deg, ${rgba(p.accent, 0.18)}, ${rgba(p.accent2, 0.16)});
          border-color: ${rgba(p.accent, 0.35)};
          color: ${p.text};
        }
        body.${cls} .ev-form input,
        body.${cls} .ev-form textarea,
        body.${cls} .ev-form select {
          background: ${inputBg};
          border-color: ${line};
          color: ${p.text};
        }
        body.${cls} .ev-form input:focus,
        body.${cls} .ev-form textarea:focus,
        body.${cls} .ev-form select:focus {
          background: ${inputFocusBg};
          border-color: ${p.accent};
          box-shadow: 0 0 0 3px ${rgba(p.accent, 0.2)};
        }
        body.${cls} .ev-submit-btn {
          background: linear-gradient(135deg, ${p.accent} 0%, ${p.accent2} 100%);
          color: ${btnText};
          box-shadow: 0 14px 32px ${rgba(p.accent, 0.35)};
        }
        body.${cls} .ev-submit-btn:hover {
          filter: brightness(1.06) saturate(1.08);
          box-shadow: 0 18px 40px ${rgba(p.accent2, 0.4)};
        }
        body.${cls} .ev-side-link {
          background: linear-gradient(135deg, ${rgba(p.accent, 0.22)}, ${rgba(p.accent2, 0.18)});
          border-color: ${rgba(p.accent, 0.45)};
          color: ${p.text};
        }
        body.${cls} .ev-side-link:hover { border-color: ${p.accent2}; }
        body.${cls} .ev-side-link-muted {
          background: transparent;
          border-color: ${line};
          color: ${p.muted};
        }
        body.${cls} .ev-banner-img {
          border: ${dark ? `1px solid ${lineStrong}` : '4px solid #ffffff'};
          outline: ${dark ? 'none' : `1px solid ${rgba(p.accent, 0.35)}`};
          box-shadow: 0 16px 34px ${shadow};
        }
        body.${cls} .ev-sec-schedule-time { color: ${p.accent2}; }
        body.${cls} .ev-sec-faq-question::after { color: ${p.accent}; }
        body.${cls} .ev-sec-faq-question:hover { color: ${p.accent2}; }
        body.${cls} .ev-sec-divider {
          background: linear-gradient(90deg, transparent, ${rgba(p.accent, 0.6)}, ${rgba(p.accent2, 0.6)}, transparent);
          height: 2px;
        }

        /* Buttons whose accent background adapts via vars but had hardcoded
           text — re-pick a readable text color for this palette. */
        body.${cls} .ev-ticket-cta,
        body.${cls} .ev-topbanner-btn,
        body.${cls} .ev-modal-done { color: ${btnText}; }
        body.${cls} .ev-topbanner {
          background: linear-gradient(135deg, ${rgba(p.accent, 0.18)}, ${rgba(p.accent2, 0.12)});
          border-color: ${rgba(p.accent, 0.4)};
        }
        /* Cocktail-menu card is a hardcoded dark panel by default — flip it to
           the theme surface so it doesn't read as dark on light themes. */
        body.${cls} .ev-sec-cocktails {
          background: linear-gradient(180deg, ${p.panel}, ${p.panelStrong});
          border-color: ${line};
        }
        /* Terms / acknowledgment page (shown for ack-required events). The
           default submit button is a fixed art-deco style; re-skin to accent. */
        body.${cls} .et-eyebrow { color: ${p.accent2}; font-family: inherit; }
        body.${cls} .et-check { border-color: ${lineStrong}; color: ${p.text}; }
        body.${cls} .et-submit {
          background: linear-gradient(135deg, ${p.accent} 0%, ${p.accent2} 100%);
          color: ${btnText};
          border-color: transparent;
          box-shadow: 0 14px 32px ${rgba(p.accent, 0.35)};
          font-family: inherit;
          text-transform: uppercase;
        }
        body.${cls} .et-submit:hover {
          filter: brightness(1.06) saturate(1.08);
          transform: none;
          box-shadow: 0 18px 40px ${rgba(p.accent2, 0.4)};
        }
  `;
}

// ── theme definitions ───────────────────────────────────────────────────────
// Each entry: { key, label, description, group, bodyClass, swatch, palette?, css? }
//   swatch  → mini preview colors for the admin picker { bg, bg2, accent, accent2 }
//   palette → spec for paletteThemeCss (omitted for the 3 inline-CSS themes)
//   css     → set to a fixed string to bypass the generator (decorated themes)
const RAW_THEMES = [
  {
    key: 'default',
    label: 'Vintage Speakeasy',
    description: 'The signature dark, moody look — gold on near-black. Great default for any night out.',
    group: 'Signature',
    bodyClass: '',
    swatch: { bg: '#191a1d', bg2: '#040404', accent: '#d2aa67', accent2: '#8a5635' },
    palette: null, // default styling lives in publicTheme.js / eventPage.js base
  },
  {
    key: 'spring-market',
    label: 'Spring Market',
    description: 'Bright garden-party feel — cream, sage green and peach with floral accents.',
    group: 'Decorated',
    bodyClass: 'ev-vendor',
    swatch: { bg: '#fbf4e4', bg2: '#f1e0c7', accent: '#6f9061', accent2: '#d97a5e' },
    palette: null, // CSS lives inline in eventPage.js (decorated theme)
  },
  {
    key: 'art-gallery',
    label: 'Art Gallery',
    description: 'Playful gallery pop-up — purple damask, cream placards, paint-splash props.',
    group: 'Decorated',
    bodyClass: 'ev-art',
    swatch: { bg: '#d9a6d2', bg2: '#b577b0', accent: '#d14c2e', accent2: '#e7b83a' },
    palette: null, // CSS lives inline in eventPage.js (decorated theme)
  },

  // ── generated palette themes ──
  {
    key: 'midnight-neon',
    label: 'Neon Nightlife',
    description: 'Electric magenta + cyan on black. Built for DJ sets, dance parties and late nights.',
    group: 'Nightlife',
    bodyClass: 'ev-t-neon',
    swatch: { bg: '#0c0a18', bg2: '#05040a', accent: '#ff3db4', accent2: '#2de2ff' },
    palette: {
      scheme: 'dark',
      accent: '#ff3db4', accent2: '#2de2ff',
      bgA: '#100b1f', bgMid: '#0a0814', bgB: '#050409',
      text: '#f4f0ff', steel: '#cfc8e6', muted: '#9a93b8', smoke: '#6f6890',
      panel: '#16102a', panelStrong: '#100b1f',
      font: "'Trebuchet MS', 'Segoe UI', 'Helvetica Neue', sans-serif",
    },
  },
  {
    key: 'tropical-luau',
    label: 'Tropical Luau',
    description: 'Turquoise, coral and sand. Perfect for summer bashes, tiki nights and pool parties.',
    group: 'Seasonal',
    bodyClass: 'ev-t-tropical',
    swatch: { bg: '#e8fbf6', bg2: '#ffe6d2', accent: '#0fb5a6', accent2: '#ff7a59' },
    palette: {
      scheme: 'light',
      accent: '#0c9c8f', accent2: '#ff7a59',
      bgA: '#eafbf6', bgMid: '#fbf3e6', bgB: '#ffe6d2',
      text: '#123634', steel: '#2c5450', muted: '#5e7a76', smoke: '#8aa6a1',
      panel: '#ffffff', panelStrong: '#f3fbf8',
      font: "'Trebuchet MS', 'Avenir Next', 'Segoe UI', sans-serif",
    },
  },
  {
    key: 'festive-holiday',
    label: 'Holiday & Festive',
    description: 'Evergreen, cranberry and gold. Christmas parties, NYE and seasonal celebrations.',
    group: 'Seasonal',
    bodyClass: 'ev-t-holiday',
    swatch: { bg: '#0e2a20', bg2: '#07140f', accent: '#e0b54a', accent2: '#c0392b' },
    palette: {
      scheme: 'dark',
      accent: '#e6bd57', accent2: '#cf4436',
      bgA: '#103127', bgMid: '#0b211a', bgB: '#06120d',
      text: '#f6f1e4', steel: '#d8cfbb', muted: '#9bae9f', smoke: '#6f8475',
      panel: '#11271f', panelStrong: '#0c1d17',
      font: "'Iowan Old Style', 'Palatino Linotype', Georgia, serif",
    },
  },
  {
    key: 'spooky',
    label: 'Spooky',
    description: 'Pumpkin orange and arcane purple over black. Halloween bashes and costume nights.',
    group: 'Seasonal',
    bodyClass: 'ev-t-spooky',
    swatch: { bg: '#1a1020', bg2: '#0a060f', accent: '#ff7518', accent2: '#8a4fff' },
    palette: {
      scheme: 'dark',
      accent: '#ff7518', accent2: '#9a5cff',
      bgA: '#1a1226', bgMid: '#120b1c', bgB: '#08050d',
      text: '#f7efe4', steel: '#d6c9bd', muted: '#a496a8', smoke: '#7a6c84',
      panel: '#190f24', panelStrong: '#120b1a',
      font: "'Trebuchet MS', 'Segoe UI', sans-serif",
    },
  },
  {
    key: 'winter-frost',
    label: 'Winter Frost',
    description: 'Icy blue, silver and white. Winter galas, holiday brunches and snow-day events.',
    group: 'Seasonal',
    bodyClass: 'ev-t-frost',
    swatch: { bg: '#eef5fb', bg2: '#d3e4f3', accent: '#2f6fb0', accent2: '#7fa9cf' },
    palette: {
      scheme: 'light',
      accent: '#2f6fb0', accent2: '#6fa0c8',
      bgA: '#f0f6fc', bgMid: '#e2eef8', bgB: '#d3e4f3',
      text: '#16293c', steel: '#33485e', muted: '#5f7589', smoke: '#90a4b6',
      panel: '#ffffff', panelStrong: '#eef5fb',
      font: "'Avenir Next', 'Segoe UI', 'Helvetica Neue', sans-serif",
    },
  },
  {
    key: 'romance',
    label: 'Romance',
    description: 'Blush, rose and burgundy. Valentine’s, date nights, anniversaries and weddings.',
    group: 'Occasion',
    bodyClass: 'ev-t-romance',
    swatch: { bg: '#fdeef0', bg2: '#f6d9de', accent: '#c2415a', accent2: '#7a2e3e' },
    palette: {
      scheme: 'light',
      accent: '#c2415a', accent2: '#8c3346',
      bgA: '#fdeef1', bgMid: '#fbe2e6', bgB: '#f6d4da',
      text: '#3c1f27', steel: '#5c3540', muted: '#8a606b', smoke: '#b08a94',
      panel: '#fffafb', panelStrong: '#fdeef1',
      font: "'Iowan Old Style', 'Palatino Linotype', Georgia, serif",
    },
  },
  {
    key: 'game-day',
    label: 'Game Day',
    description: 'Bold athletic navy, red and gold. Watch parties, tournaments and sports nights.',
    group: 'Nightlife',
    bodyClass: 'ev-t-gameday',
    swatch: { bg: '#14233b', bg2: '#0a1426', accent: '#e23b3b', accent2: '#f0b429' },
    palette: {
      scheme: 'dark',
      accent: '#ef4444', accent2: '#f0b429',
      bgA: '#162741', bgMid: '#0f1d33', bgB: '#0a1322',
      text: '#f2f5fa', steel: '#cdd6e3', muted: '#94a3b8', smoke: '#6b7c91',
      panel: '#142540', panelStrong: '#0f1c33',
      font: "'Arial Black', 'Helvetica Neue', Arial, sans-serif",
    },
  },
  {
    key: 'rustic-harvest',
    label: 'Rustic Harvest',
    description: 'Burnt orange, brown and cream. Fall fests, Oktoberfest, harvest dinners and BBQs.',
    group: 'Seasonal',
    bodyClass: 'ev-t-harvest',
    swatch: { bg: '#f7ecd9', bg2: '#ecd3ad', accent: '#b5651d', accent2: '#7a5230' },
    palette: {
      scheme: 'light',
      accent: '#b5651d', accent2: '#8a5a2b',
      bgA: '#f8efdc', bgMid: '#f1e1c2', bgB: '#e8d2a8',
      text: '#3a2a18', steel: '#5a4226', muted: '#8a7048', smoke: '#ab9268',
      panel: '#fffaef', panelStrong: '#f6ead2',
      font: "'Iowan Old Style', 'Palatino Linotype', Georgia, serif",
    },
  },
];

const EVENT_THEMES = RAW_THEMES;
const THEME_BY_KEY = Object.fromEntries(EVENT_THEMES.map((t) => [t.key, t]));
const VALID_KEYS = new Set(EVENT_THEMES.map((t) => t.key).filter((k) => k !== 'default'));

// Normalize a submitted themeKey to a stored value. 'default'/''/unknown → null.
function normalizeThemeKey(value) {
  const v = String(value || '').trim();
  if (!v || v === 'default') return null;
  return VALID_KEYS.has(v) ? v : null;
}

// Resolve how an event should render. Preserves the historical fallback where a
// vendor event with no explicit themeKey uses the spring-market palette.
function resolveThemeRender(event, opts = {}) {
  const isVendor = !!opts.isVendor;
  const themeKey = (event && event.themeKey) || (isVendor ? 'spring-market' : null);
  const theme = THEME_BY_KEY[themeKey];
  return {
    themeKey,
    bodyClass: theme ? theme.bodyClass : '',
    isArt: themeKey === 'art-gallery',
  };
}

// All generated palette-theme CSS, injected once into each public event page's
// <style> block. The 3 inline-CSS themes contribute nothing here.
function eventThemesCss() {
  return EVENT_THEMES
    .filter((t) => t.palette)
    .map((t) => paletteThemeCss(t.bodyClass, t.palette))
    .join('\n');
}

// Friendly label for a stored themeKey (used in the admin list/cards).
function themeLabel(themeKey) {
  const t = THEME_BY_KEY[themeKey];
  return t ? t.label : (themeKey || 'Vintage Speakeasy');
}

module.exports = {
  EVENT_THEMES,
  THEME_BY_KEY,
  normalizeThemeKey,
  resolveThemeRender,
  eventThemesCss,
  themeLabel,
};
