function vintageThemeCss() {
  return `
        * { margin: 0; padding: 0; box-sizing: border-box; }
        :root {
          --bg-a: #352218;
          --bg-b: #150d09;
          --panel: #25180f;
          --panel-soft: #342318;
          --line: rgba(198, 155, 84, 0.34);
          --text: #f0e2c7;
          --muted: #ccb693;
          --gold: #c69b54;
          --amber: #8b5230;
          --olive: #46513c;
          --cream: #f5e8cc;
          --ink: #20140d;
          --shadow: rgba(10, 6, 4, 0.52);
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
            radial-gradient(960px 420px at 14% -8%, rgba(198, 155, 84, 0.16), transparent 60%),
            radial-gradient(1040px 520px at 100% 0%, rgba(70, 81, 60, 0.15), transparent 58%),
            linear-gradient(180deg, var(--bg-a) 0%, #24160e 38%, var(--bg-b) 100%);
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
            linear-gradient(rgba(255, 247, 232, 0.02), rgba(255, 247, 232, 0.02)),
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
          background: rgba(198, 155, 84, 0.28);
          color: #fff7e8;
        }
      `;
}

module.exports = { vintageThemeCss };
