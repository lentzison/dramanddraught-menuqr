const { vintageThemeCss } = require('./publicTheme');
const { brandMarkCss, renderBrandMark } = require('./brandMark');
const { escHTML } = require('./escapeHtml');
const { eventStatus, formatEventDate, formatEventTime } = require('./eventPage');

function summarize(text, max = 180) {
  const str = String(text || '').trim().replace(/\s+/g, ' ');
  if (!str) return '';
  if (str.length <= max) return str;
  return str.slice(0, max - 1).trimEnd() + '…';
}

function eventCardMeta(event) {
  const signupCount = event.signupCount || 0;
  const status = eventStatus(event, signupCount);
  if (status.key === 'open') return { label: 'Signups Open', tone: 'open', cta: 'Sign Up' };
  if (status.key === 'upcoming') return { label: 'Opens Soon', tone: 'scheduled', cta: 'View Details' };
  if (status.key === 'full') return { label: 'Fully Booked', tone: 'full', cta: 'View Details' };
  if (status.key === 'closed') return { label: 'Signups Closed', tone: 'closed', cta: 'View Details' };
  if (status.key === 'cancelled') return { label: 'Cancelled', tone: 'cancelled', cta: 'View Details' };
  if (status.key === 'no-signups') return { label: 'Info Only', tone: 'info', cta: 'View Event' };
  return { label: 'Event', tone: 'neutral', cta: 'View Event' };
}

function renderEventCard(location, event) {
  const meta = eventCardMeta(event);
  const signupCount = event.signupCount || 0;
  const publicPath = `/${location.slug}/events/${event.slug}`;
  const blurb = summarize(event.description);

  return `
    <article class="evx-card evx-card-${escHTML(meta.tone)}">
      ${event.image ? `
        <a href="${escHTML(publicPath)}" class="evx-card-image-link">
          <img src="${escHTML(event.image)}" alt="${escHTML(event.title)}" class="evx-card-image" loading="lazy" />
        </a>
      ` : ''}
      <div class="evx-card-body">
        <div class="evx-card-top">
          <span class="evx-badge evx-badge-${escHTML(meta.tone)}">${escHTML(meta.label)}</span>
          <div class="evx-card-time">${escHTML(formatEventDate(event.startDate))} at ${escHTML(formatEventTime(event.startDate))}</div>
        </div>
        <h2 class="evx-card-title"><a href="${escHTML(publicPath)}">${escHTML(event.title)}</a></h2>
        ${blurb ? `<p class="evx-card-copy">${escHTML(blurb)}</p>` : ''}
        <div class="evx-card-meta">
          ${event.endDate ? `<span>Ends ${escHTML(formatEventTime(event.endDate))}</span>` : ''}
          ${event.signupsEnabled === false ? '<span>No signup form</span>' : ''}
        </div>
        <div class="evx-card-actions">
          <a href="${escHTML(publicPath)}" class="evx-card-link">${escHTML(meta.cta)}</a>
        </div>
      </div>
    </article>
  `;
}

function generateEventsIndexPage(location, upcomingEvents = [], recentEvents = []) {
  const upcomingCards = upcomingEvents.map((event) => renderEventCard(location, event)).join('');
  const recentCards = recentEvents.map((event) => renderEventCard(location, event)).join('');

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta name="theme-color" content="#0f1012">
      <title>${escHTML(location.name)} Events - Dram &amp; Draught</title>
      <style>
        ${vintageThemeCss()}
        ${brandMarkCss()}
        body {
          background:
            radial-gradient(900px 420px at 8% -8%, rgba(255,255,255,0.05), transparent 60%),
            radial-gradient(980px 460px at 100% 0%, rgba(210,170,103,0.10), transparent 58%),
            linear-gradient(180deg, var(--bg-a), var(--bg-b));
          color: var(--text);
          min-height: 100vh;
          font-family: Inter, -apple-system, BlinkMacSystemFont, sans-serif;
        }
        .evx-wrap {
          max-width: 1100px;
          margin: 0 auto;
          padding: 0 18px 72px;
        }
        .evx-nav {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
          padding: 16px 0 12px;
        }
        .evx-nav a {
          color: var(--muted);
          text-decoration: none;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          font-size: 0.78rem;
          font-weight: 700;
        }
        .evx-nav a:hover { color: var(--gold); }
        .evx-hero {
          position: relative;
          overflow: hidden;
          border: 1px solid var(--line);
          border-top: 0;
          border-radius: 0 0 30px 30px;
          padding: 40px 24px 34px;
          text-align: center;
          background:
            linear-gradient(180deg, rgba(24,25,28,0.97), rgba(7,7,8,0.98)),
            radial-gradient(circle at top, rgba(210,170,103,0.16), transparent 58%);
          box-shadow: 0 22px 58px var(--shadow), inset 0 0 0 1px rgba(255,255,255,0.04);
          margin-bottom: 26px;
        }
        .evx-hero .brand-mark { max-width: 280px; margin: 4px auto 20px; }
        .evx-kicker {
          color: var(--gold);
          font-size: 0.72rem;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.22em;
          margin-bottom: 10px;
        }
        .evx-title {
          font-family: 'Playfair Display', 'Iowan Old Style', Georgia, serif;
          font-size: clamp(2.2rem, 6vw, 3.4rem);
          line-height: 1;
          margin: 0 0 12px;
        }
        .evx-subtitle {
          max-width: 720px;
          margin: 0 auto;
          color: var(--steel);
          line-height: 1.65;
          font-size: 1rem;
        }
        .evx-section-head {
          display: flex;
          justify-content: space-between;
          align-items: end;
          gap: 12px;
          flex-wrap: wrap;
          margin: 26px 0 14px;
        }
        .evx-section-kicker {
          color: var(--gold);
          text-transform: uppercase;
          letter-spacing: 0.16em;
          font-size: 0.68rem;
          font-weight: 800;
          margin-bottom: 8px;
        }
        .evx-section-head h2 {
          margin: 0;
          font-family: 'Playfair Display', 'Iowan Old Style', Georgia, serif;
          font-size: 1.8rem;
        }
        .evx-section-head p {
          margin: 4px 0 0;
          color: var(--muted);
        }
        .evx-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 18px;
        }
        .evx-card {
          overflow: hidden;
          border-radius: 20px;
          border: 1px solid var(--line);
          background: linear-gradient(180deg, rgba(24,25,28,0.95), rgba(12,13,15,0.98));
          box-shadow: 0 18px 34px rgba(0,0,0,0.28);
        }
        .evx-card-image-link { display: block; }
        .evx-card-image {
          display: block;
          width: 100%;
          height: 220px;
          object-fit: cover;
          border-bottom: 1px solid var(--line);
        }
        .evx-card-body {
          padding: 18px 18px 20px;
        }
        .evx-card-top {
          display: flex;
          justify-content: space-between;
          align-items: start;
          gap: 10px;
          flex-wrap: wrap;
          margin-bottom: 14px;
        }
        .evx-badge {
          display: inline-flex;
          align-items: center;
          min-height: 28px;
          padding: 0 10px;
          border-radius: 999px;
          font-size: 0.7rem;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .evx-badge-open { background: rgba(34,197,94,0.18); color: #86efac; }
        .evx-badge-scheduled { background: rgba(96,165,250,0.18); color: #bfdbfe; }
        .evx-badge-full { background: rgba(251,146,60,0.18); color: #fdba74; }
        .evx-badge-closed { background: rgba(251,146,60,0.18); color: #fdba74; }
        .evx-badge-cancelled { background: rgba(239,68,68,0.18); color: #fca5a5; }
        .evx-badge-info { background: rgba(210,170,103,0.16); color: var(--accent-light); }
        .evx-badge-neutral { background: rgba(148,163,184,0.18); color: #cbd5e1; }
        .evx-card-time {
          color: var(--muted);
          font-size: 0.8rem;
          line-height: 1.4;
        }
        .evx-card-title {
          margin: 0 0 10px;
          font-family: 'Playfair Display', 'Iowan Old Style', Georgia, serif;
          font-size: 1.55rem;
          line-height: 1.06;
        }
        .evx-card-title a {
          color: var(--text);
          text-decoration: none;
        }
        .evx-card-title a:hover { color: var(--gold); }
        .evx-card-copy {
          color: var(--steel);
          line-height: 1.65;
          font-size: 0.95rem;
          margin-bottom: 16px;
        }
        .evx-card-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-bottom: 18px;
        }
        .evx-card-meta span {
          display: inline-flex;
          align-items: center;
          min-height: 28px;
          padding: 0 10px;
          border-radius: 999px;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.06);
          color: var(--muted);
          font-size: 0.76rem;
        }
        .evx-card-actions {
          display: flex;
          justify-content: flex-start;
        }
        .evx-card-link {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 46px;
          padding: 0 18px;
          border-radius: 12px;
          background: linear-gradient(135deg, var(--gold), var(--amber));
          color: #0c0c0c;
          text-decoration: none;
          font-weight: 800;
          letter-spacing: 0.04em;
        }
        .evx-card-link:hover { filter: brightness(1.06); text-decoration: none; }
        .evx-empty {
          border: 1px dashed rgba(255,255,255,0.12);
          border-radius: 18px;
          padding: 28px 24px;
          text-align: center;
          color: var(--muted);
          background: rgba(255,255,255,0.02);
        }
        @media (max-width: 640px) {
          .evx-wrap { padding: 0 14px 56px; }
          .evx-hero { padding: 28px 18px 24px; border-radius: 0 0 24px 24px; }
          .evx-card-image { height: 190px; }
          .evx-card-body { padding: 16px; }
        }
      </style>
    </head>
    <body>
      <div class="evx-wrap">
        <div class="evx-nav">
          <a href="/${escHTML(location.slug)}">← Back to ${escHTML(location.name)}</a>
          <a href="/${escHTML(location.slug)}/specials">Today's Specials</a>
        </div>

        <section class="evx-hero">
          ${renderBrandMark()}
          <div class="evx-kicker">${escHTML(location.name)}</div>
          <h1 class="evx-title">Events</h1>
          <p class="evx-subtitle">Find upcoming tastings, parties, competitions, and featured nights. Each event page has the latest details, timing, and signup status.</p>
        </section>

        <section>
          <div class="evx-section-head">
            <div>
              <div class="evx-section-kicker">Upcoming</div>
              <h2>What's coming up</h2>
              <p>${upcomingEvents.length > 0 ? `${upcomingEvents.length} live ${upcomingEvents.length === 1 ? 'event' : 'events'} available now.` : 'No upcoming events are live right now.'}</p>
            </div>
          </div>
          ${upcomingCards ? `<div class="evx-grid">${upcomingCards}</div>` : `
            <div class="evx-empty">
              <p>No upcoming events are posted yet.</p>
              <p>Check back soon or head to <a href="/${escHTML(location.slug)}" style="color:var(--gold)">the location page</a> for specials and current offerings.</p>
            </div>
          `}
        </section>

        ${recentCards ? `
          <section>
            <div class="evx-section-head">
              <div>
                <div class="evx-section-kicker">Recent</div>
                <h2>Previously posted</h2>
                <p>Past events stay here for context, photos, and reference.</p>
              </div>
            </div>
            <div class="evx-grid">${recentCards}</div>
          </section>
        ` : ''}
      </div>
    </body>
    </html>
  `;
}

module.exports = { generateEventsIndexPage };
