const { vintageThemeCss } = require('./publicTheme');
const { brandMarkCss, renderBrandMark } = require('./brandMark');
const { escHTML } = require('./escapeHtml');

// Public-facing "we're hiring" index page that lists every location currently
// hiring (Location.isHiring === true) with a primary CTA to its /{slug}/apply.
// One link (dramanddraught.com/hiring) the team can share anywhere.
function generateHiringIndexPage(allLocations) {
  const hiring = (allLocations || []).filter((l) => l && l.isHiring && l.isActive !== false);

  const cards = hiring.map((loc) => {
    const cityLine = [loc.city || '', loc.state || ''].filter(Boolean).join(', ');
    return `
      <a class="hi-card" href="/${escHTML(loc.slug)}/apply">
        <div class="hi-card-head">
          <h2 class="hi-loc-name">${escHTML(loc.name)}</h2>
          <span class="hi-now-hiring">Now hiring</span>
        </div>
        ${cityLine ? `<p class="hi-meta">${escHTML(cityLine)}${loc.zipCode ? ` ${escHTML(loc.zipCode)}` : ''}</p>` : ''}
        ${loc.address ? `<p class="hi-meta">${escHTML(loc.address)}</p>` : ''}
        <span class="hi-cta">Apply at ${escHTML(loc.name)} &rarr;</span>
      </a>`;
  }).join('');

  const empty = `
    <div class="hi-empty">
      <h2>Nothing open right now.</h2>
      <p>We're not actively hiring at any location at the moment. Check back soon — we add roles as our bars need them.</p>
      <p style="margin-top:14px;"><a class="hi-back" href="/">&larr; All Dram &amp; Draught locations</a></p>
    </div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="theme-color" content="#0f1012" />
  <title>We're Hiring — Dram &amp; Draught</title>
  <meta name="description" content="Open hospitality roles at Dram &amp; Draught locations across North Carolina. Pick your location to apply." />
  <style>
    ${vintageThemeCss()}
    ${brandMarkCss()}

    .hi-shell { max-width: 1080px; margin: 0 auto; padding: 28px 18px 64px; }

    .hi-hero {
      position: relative; overflow: hidden;
      text-align: center; padding: 40px 22px 34px;
      border: 1px solid var(--line); border-radius: 24px;
      background:
        linear-gradient(180deg, rgba(24, 25, 28, 0.97), rgba(7, 7, 8, 0.98)),
        radial-gradient(circle at top, rgba(255, 255, 255, 0.09), transparent 42%);
      box-shadow: 0 24px 58px var(--shadow), inset 0 0 0 1px rgba(255, 255, 255, 0.04);
      margin-bottom: 28px;
    }
    .hi-hero::after {
      content: '';
      position: absolute; inset: 0;
      background:
        radial-gradient(520px 220px at 70% 12%, rgba(255, 255, 255, 0.06), transparent 45%),
        radial-gradient(430px 180px at 18% 74%, rgba(111, 118, 127, 0.09), transparent 50%);
      pointer-events: none;
    }
    .hi-kicker {
      position: relative;
      display: inline-block;
      font-size: 0.72rem; letter-spacing: 0.18em; text-transform: uppercase;
      color: var(--gold); font-weight: 800;
      padding: 6px 14px; border: 1px solid rgba(212, 175, 55, 0.35);
      border-radius: 999px;
      background: rgba(212, 175, 55, 0.08);
      margin-bottom: 14px;
    }
    .hi-hero h1 {
      position: relative;
      font-family: var(--brand-serif, 'Cormorant Garamond', Georgia, serif);
      font-size: clamp(1.85rem, 4vw, 2.6rem);
      line-height: 1.1; color: var(--cream);
      margin: 0 0 10px;
      letter-spacing: 0.01em;
    }
    .hi-hero p {
      position: relative;
      color: #cfcabe; max-width: 620px; margin: 0 auto;
      line-height: 1.55; font-size: 1rem;
    }
    .hi-divider {
      position: relative;
      width: 140px; height: 2px; margin: 18px auto 4px;
      background: linear-gradient(90deg, transparent, var(--gold), transparent);
      opacity: 0.9; border-radius: 2px;
    }

    .hi-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 18px;
    }

    .hi-card {
      position: relative; overflow: hidden;
      display: flex; flex-direction: column; gap: 6px;
      padding: 22px 22px 76px;
      min-height: 220px;
      text-decoration: none; color: var(--text);
      background: linear-gradient(180deg, rgba(20, 21, 24, 0.94), rgba(9, 9, 10, 0.98));
      border: 1px solid var(--line); border-radius: 18px;
      box-shadow: 0 14px 30px rgba(0,0,0,0.28), inset 0 0 0 1px rgba(255,255,255,0.03);
      transition: transform 0.22s ease, border-color 0.22s ease, box-shadow 0.22s ease;
    }
    .hi-card:hover {
      transform: translateY(-4px);
      border-color: rgba(212, 175, 55, 0.45);
      box-shadow: 0 22px 42px rgba(0,0,0,0.34), inset 0 0 0 1px rgba(255,255,255,0.04);
      text-decoration: none;
    }
    .hi-card::before {
      content: '';
      position: absolute; top: 0; left: 0; right: 0; height: 3px;
      background: linear-gradient(90deg, transparent, var(--gold) 18%, rgba(255, 255, 255, 0.7) 50%, var(--gold) 82%, transparent);
      opacity: 0.92;
    }
    .hi-card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; margin-bottom: 4px; }
    .hi-loc-name {
      margin: 0;
      font-size: 1.3rem; color: var(--cream);
      text-transform: uppercase; letter-spacing: 0.08em; font-weight: 700;
    }
    .hi-now-hiring {
      flex: 0 0 auto;
      font-size: 0.64rem; font-weight: 800;
      text-transform: uppercase; letter-spacing: 0.1em;
      color: #0b0b0d;
      background: linear-gradient(180deg, #f4d272, var(--gold) 80%);
      padding: 4px 10px; border-radius: 999px;
      border: 1px solid rgba(255,255,255,0.18);
      white-space: nowrap;
    }
    .hi-meta { color: #c0bcbb; margin: 0; font-size: 0.9rem; line-height: 1.5; }
    .hi-cta {
      position: absolute; left: 22px; bottom: 22px;
      display: inline-block;
      background: linear-gradient(180deg, var(--accent-light, #f4d272), var(--gold) 64%, var(--amber, #b88e1c));
      color: var(--ink, #1a1410);
      padding: 9px 18px; border-radius: 999px;
      font-weight: 700; font-size: 0.85rem;
      letter-spacing: 0.04em;
      text-transform: uppercase; text-decoration: none;
      border: 1px solid rgba(255, 255, 255, 0.14);
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.38), 0 10px 18px rgba(0,0,0,0.22);
    }

    .hi-empty {
      text-align: center;
      padding: 36px 22px;
      border: 1px dashed rgba(255, 255, 255, 0.18);
      border-radius: 18px;
      background: rgba(255,255,255,0.025);
      max-width: 620px; margin: 0 auto;
    }
    .hi-empty h2 {
      font-family: var(--brand-serif, 'Cormorant Garamond', Georgia, serif);
      color: var(--gold); font-size: 1.5rem; margin: 0 0 10px;
    }
    .hi-empty p { color: #cfcabe; line-height: 1.55; margin: 0; }
    .hi-back { color: var(--gold); text-decoration: none; font-size: 0.92rem; }
    .hi-back:hover { text-decoration: underline; }

    .hi-foot {
      text-align: center; margin-top: 32px;
      color: #8d9299; font-size: 0.86rem;
    }
    .hi-foot a { color: var(--gold); }

    @media (max-width: 560px) {
      .hi-hero { padding: 30px 16px 26px; border-radius: 18px; }
      .hi-card { min-height: 200px; padding: 20px 18px 72px; }
      .hi-cta { left: 18px; bottom: 18px; padding: 9px 16px; font-size: 0.82rem; }
    }
  </style>
</head>
<body>
  <div class="hi-shell">
    <header class="hi-hero">
      ${renderBrandMark({ wrapper: 'div', className: 'hero-mark', note: '' })}
      <div class="hi-divider"></div>
      <span class="hi-kicker">We&rsquo;re Hiring</span>
      <h1>Join the team at Dram &amp; Draught</h1>
      <p>${hiring.length > 0
        ? `${hiring.length === 1 ? 'One location is' : `${hiring.length} locations are`} taking applications right now. Pick yours to apply &mdash; takes about ten minutes.`
        : 'Pick a location below to apply for a hospitality role.'}</p>
    </header>

    ${hiring.length > 0 ? `<div class="hi-grid">${cards}</div>` : empty}

    <p class="hi-foot">Not seeing your location? <a href="/">View all Dram &amp; Draught locations &rarr;</a></p>
  </div>
</body>
</html>`;
}

module.exports = { generateHiringIndexPage };
