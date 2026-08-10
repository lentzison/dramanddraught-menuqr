const { getBrand } = require('../brand');

function vintageThemeCss() {
  const brand = getBrand();
  const { colors, fonts } = brand.theme;
  // Emit the palette from the active brand config so the whole public side
  // re-skins by editing brands/<brand>/brand.config.js — no CSS edits needed.
  const rootVars = Object.entries(colors)
    .map(([name, value]) => `          --${name}: ${value};`)
    .join('\n');

  return `
        /* Display face for hero titles, brand tags, and public section labels.
           Loaded from the active brand's asset paths. font-display:swap keeps
           the page legible if the font is slow to arrive. */
        @font-face {
          font-family: '${fonts.displayFamily}';
          font-style: normal;
          font-weight: 400;
          font-display: swap;
          src: url('${brand.assets.displayFontRegular}') format('truetype');
        }
        @font-face {
          font-family: '${fonts.displayFamily}';
          font-style: normal;
          font-weight: 700;
          font-display: swap;
          src: url('${brand.assets.displayFontBold}') format('truetype');
        }

        * { margin: 0; padding: 0; box-sizing: border-box; }
        :root {
${rootVars}
          /* Display face for headings + brand tags. Fall back to a sturdy
             geometric stack if the display font hasn't arrived yet. */
          --brand-display: ${fonts.displayStack};
          --brand-serif: ${fonts.serifStack};
        }

        /* Default public-side headings use the Mostra display face. Letter
           spacing is widened on small caps tags via the .brand-mark-tag /
           kicker rules elsewhere. */
        h1, h2, h3,
        .hero-title,
        .apply-title,
        .q-title,
        .hi-hero h1 {
          font-family: var(--brand-display);
          letter-spacing: 0.01em;
        }
        /* Small-caps section labels, kickers, and the homepage location
           marquee use Mostra — the geometric Art Deco letterforms shine
           at letter-spaced uppercase labels. Buttons and body-size metadata
           stay on the body serif (Mostra is too heavy at CTA sizes; .q-
           progress is body-size metadata, not a label). */
        .apply-section-title,
        .hi-kicker,
        .hi-now-hiring,
        .pv-day,
        .pv-section-head,
        .location-name,
        .badge {
          font-family: var(--brand-display);
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        body {
          position: relative;
          overflow-x: hidden;
          font-family: var(--brand-serif);
          color: var(--text);
          color-scheme: dark;
          background:
            radial-gradient(960px 420px at 14% -8%, rgba(255, 255, 255, 0.1), transparent 60%),
            radial-gradient(1080px 540px at 100% 0%, rgba(111, 118, 127, 0.14), transparent 58%),
            radial-gradient(760px 380px at 50% 120%, rgba(210, 170, 103, 0.08), transparent 62%),
            linear-gradient(180deg, var(--bg-a) 0%, #0d0e10 38%, var(--bg-b) 100%);
          min-height: 100vh;
          padding: 0 14px 32px;
          animation: fadeIn .45s ease-out;
        }
        body::before {
          content: '';
          position: fixed;
          inset: 0;
          z-index: 0;
          pointer-events: none;
          background:
            linear-gradient(rgba(255, 255, 255, 0.018), rgba(255, 255, 255, 0.018)),
            repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.02), rgba(255, 255, 255, 0.02) 1px, transparent 1px, transparent 6px),
            repeating-linear-gradient(0deg, rgba(0, 0, 0, 0.04), rgba(0, 0, 0, 0.04) 1px, transparent 1px, transparent 8px);
          mix-blend-mode: soft-light;
          opacity: 0.38;
        }
        body::after {
          content: '';
          position: fixed;
          inset: 0;
          z-index: 0;
          pointer-events: none;
          background:
            radial-gradient(circle at center, transparent 42%, rgba(6, 4, 3, 0.18) 100%),
            linear-gradient(180deg, rgba(0, 0, 0, 0.06), transparent 18%, transparent 82%, rgba(0, 0, 0, 0.18));
          opacity: 0.9;
        }
        body > * {
          position: relative;
          z-index: 1;
        }
        a { color: inherit; }
        .surface-card {
          position: relative;
          overflow: hidden;
          background: linear-gradient(180deg, rgba(20, 21, 24, 0.95), rgba(9, 9, 10, 0.98));
          border: 1px solid var(--line);
          border-radius: 16px;
          box-shadow: 0 16px 34px rgba(0, 0, 0, 0.3), inset 0 0 0 1px rgba(255, 255, 255, 0.03);
        }
        .surface-card::before {
          content: '';
          position: absolute;
          inset: 10px;
          border-radius: 10px;
          border: 1px solid rgba(255, 255, 255, 0.05);
          pointer-events: none;
        }
        .section-kicker {
          color: var(--gold);
          font-size: 0.75rem;
          font-weight: 800;
          letter-spacing: 0.18em;
          text-transform: uppercase;
        }
        .section-rule {
          width: 132px;
          height: 1px;
          margin: 16px auto 0;
          background: linear-gradient(90deg, transparent, rgba(210, 170, 103, 0.9), transparent);
          opacity: 0.9;
        }
        ::selection {
          background: rgba(210, 170, 103, 0.24);
          color: #ffffff;
        }
        @media (max-width: 640px) {
          body {
            padding: 0 10px 26px;
          }
        }
      `;
}

module.exports = { vintageThemeCss };
