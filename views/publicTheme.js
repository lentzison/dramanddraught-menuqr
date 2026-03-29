function vintageThemeCss() {
  return `
        * { margin: 0; padding: 0; box-sizing: border-box; }
        :root {
          --bg-a: #191a1d;
          --bg-b: #040404;
          --panel: #0f1012;
          --panel-soft: #18191d;
          --panel-strong: #111215;
          --line: rgba(255, 255, 255, 0.12);
          --line-strong: rgba(255, 255, 255, 0.22);
          --text: #f3f1ee;
          --muted: #a7a3a0;
          --gold: #d2aa67;
          --amber: #8a5635;
          --olive: #5a6652;
          --steel: #d5d0c8;
          --smoke: #737780;
          --cream: #ffffff;
          --ink: #090909;
          --shadow: rgba(0, 0, 0, 0.62);
          --accent-light: #f6e3c3;
          --accent-soft: rgba(210, 170, 103, 0.14);
          --accent-soft-strong: rgba(210, 170, 103, 0.22);
          --accent-dark: rgba(138, 86, 53, 0.22);
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        body {
          position: relative;
          overflow-x: hidden;
          font-family: "Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, serif;
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
