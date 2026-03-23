function vintageThemeCss() {
  return `
        * { margin: 0; padding: 0; box-sizing: border-box; }
        :root {
          --bg-a: #17181a;
          --bg-b: #040404;
          --panel: #101114;
          --panel-soft: #1a1b1f;
          --line: rgba(255, 255, 255, 0.12);
          --text: #f3f1ee;
          --muted: #a7a3a0;
          --gold: #f2f3f5;
          --amber: #6f767f;
          --olive: #4b5158;
          --cream: #ffffff;
          --ink: #090909;
          --shadow: rgba(0, 0, 0, 0.62);
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
          background:
            radial-gradient(960px 420px at 14% -8%, rgba(255, 255, 255, 0.08), transparent 60%),
            radial-gradient(1040px 520px at 100% 0%, rgba(111, 118, 127, 0.12), transparent 58%),
            linear-gradient(180deg, var(--bg-a) 0%, #0d0e10 38%, var(--bg-b) 100%);
          min-height: 100vh;
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
          background: radial-gradient(circle at center, transparent 42%, rgba(6, 4, 3, 0.18) 100%);
          opacity: 0.9;
        }
        body > * {
          position: relative;
          z-index: 1;
        }
        a { color: inherit; }
        ::selection {
          background: rgba(255, 255, 255, 0.22);
          color: #ffffff;
        }
      `;
}

module.exports = { vintageThemeCss };
