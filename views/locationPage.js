const { getLinkButtons, getOpenState } = require('../helpers');
const { vintageThemeCss } = require('./publicTheme');
const { brandMarkCss, renderBrandMark } = require('./brandMark');
const { escHTML } = require('./escapeHtml');
const { eventStatus, formatEventDate, formatEventTime } = require('./eventPage');

function locationEventMeta(event) {
  const status = eventStatus(event, event.signupCount || 0);
  const isVendor = event.isVendorEvent === true;
  if (status.key === 'open') {
    return isVendor
      ? { label: 'Apply or Attend', tone: 'open', cta: 'View Event' }
      : { label: 'Signups Open', tone: 'open', cta: 'Sign Up' };
  }
  if (status.key === 'upcoming') return { label: 'Opens Soon', tone: 'scheduled', cta: 'View Details' };
  if (status.key === 'full') {
    return isVendor
      ? { label: 'Applications Closed', tone: 'full', cta: 'View Event' }
      : { label: 'Fully Booked', tone: 'full', cta: 'View Details' };
  }
  if (status.key === 'closed') {
    return isVendor
      ? { label: 'Applications Closed', tone: 'closed', cta: 'View Event' }
      : { label: 'Signups Closed', tone: 'closed', cta: 'View Details' };
  }
  if (status.key === 'no-signups') return { label: '', tone: 'neutral', cta: 'View Event' };
  return { label: 'Event', tone: 'neutral', cta: 'View Event' };
}

function renderUpcomingEvents(location, upcomingEvents) {
  if (!Array.isArray(upcomingEvents) || upcomingEvents.length === 0) return '';
  const cards = upcomingEvents.slice(0, 3).map((event, index) => {
    const meta = locationEventMeta(event);
    const href = `/${location.slug}/events/${event.slug}`;
    return `
      <article class="loc-event-card${index === 0 ? ' loc-event-card-featured' : ''}">
        ${event.image ? `<a href="${escHTML(href)}" class="loc-event-image-link"><img src="${escHTML(event.image)}" alt="${escHTML(event.title)}" class="loc-event-image" loading="lazy" /></a>` : ''}
        <div class="loc-event-body">
          <div class="loc-event-top">
            ${meta.label ? `<span class="loc-event-badge loc-event-badge-${escHTML(meta.tone)}">${escHTML(meta.label)}</span>` : ''}
            <span class="loc-event-date">${escHTML(formatEventDate(event.startDate))}</span>
          </div>
          <h3 class="loc-event-title"><a href="${escHTML(href)}">${escHTML(event.title)}</a></h3>
          <p class="loc-event-time">${escHTML(formatEventTime(event.startDate))}${event.endDate ? ' &middot; until ' + escHTML(formatEventTime(event.endDate)) : ''}</p>
          ${event.description ? `<p class="loc-event-copy">${escHTML(String(event.description).trim().replace(/\s+/g, ' ').slice(0, 150))}${String(event.description).trim().replace(/\s+/g, ' ').length > 150 ? '&hellip;' : ''}</p>` : ''}
        </div>
      </article>
    `;
  }).join('');

  return `
    <section class="loc-events container">
      <div class="loc-events-head">
        <div>
          <div class="loc-events-kicker">Upcoming Events</div>
        </div>
        <a href="/${escHTML(location.slug)}/events" class="loc-events-view-all">All Events</a>
      </div>
      <div class="loc-events-grid">${cards}</div>
    </section>
  `;
}

function generateLocationPage(location, allLocations = [], menuCategories = [], options = {}) {
  const upcomingEvents = Array.isArray(options.upcomingEvents) ? options.upcomingEvents : [];
  const quickLinks = [
    { label: "Today's Specials", url: `/${location.slug}/specials` },
    { label: 'On Draft', url: `/${location.slug}/draft` },
  ];
  if (options.hasEvents) {
    quickLinks.push({ label: 'Upcoming Events', url: `/${location.slug}/events` });
  }
  if (options.showFlightsButton) {
    quickLinks.push({ label: 'Spirit Flights', url: `/${location.slug}/flights` });
  }
  const dynamicLinks = getLinkButtons(location);
  const buttons = [...quickLinks, ...dynamicLinks].filter((link, index, arr) =>
    arr.findIndex((entry) => entry.url === link.url && entry.label === link.label) === index
  );
  const actionButtonClass = (link) => {
    const label = String(link && link.label ? link.label : '').toLowerCase();
    if (label.includes('special') || label.includes('draft')) return 'link-btn link-btn-primary';
    return 'link-btn';
  };
  const reviewEmail = String(location.email || 'cheers@dramanddraught.com').trim();
  const nearbyLocationCandidates = Array.isArray(allLocations)
    ? allLocations
      .map((loc) => {
        if (!loc || String(loc.slug || '').trim() === String(location.slug || '').trim()) return null;
        const lat = Number(loc.googleCoordinates && loc.googleCoordinates.lat);
        const lng = Number(loc.googleCoordinates && loc.googleCoordinates.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        return {
          slug: String(loc.slug || '').trim(),
          name: String(loc.name || '').trim(),
          lat,
          lng,
        };
      })
      .filter(Boolean)
    : [];

  const reviewConfig = {
    locationName: location.name || 'Dram & Draught',
    locationEmail: reviewEmail || 'cheers@dramanddraught.com',
    googleReviewUrl: String(location.googleReviewUrl || '').trim(),
    feedbackEndpoint: '/api/feedback',
    locationSlug: location.slug || '',
    locationResolution: {
      enabled: false,
      currentSlug: String(location.slug || '').trim(),
      maxDistanceMiles: 15,
      candidates: String(location.slug || '').toLowerCase() === 'durham'
        ? nearbyLocationCandidates.filter(c => c.slug === 'winston-salem')
        : [],
    },
  };

  const openState = getOpenState(location);
  const statusClass = openState.isOpen === true ? 'status-open' : openState.isOpen === false ? 'status-closed' : 'status-unknown';

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta name="theme-color" content="#0f1012">
      <title>Dram & Draught ${location.name} - Whiskey Bar & Cocktails</title>
      <style>
        ${vintageThemeCss()}
        ${brandMarkCss()}
        .hero {
          position: relative;
          overflow: hidden;
          padding: 34px 22px 34px;
          text-align: center;
          border-radius: 0 0 30px 30px;
          border: 1px solid var(--line);
          border-top: 0;
          margin: 0 auto;
          max-width: 1020px;
          background:
            linear-gradient(180deg, rgba(24, 25, 28, 0.97), rgba(7, 7, 8, 0.98)),
            radial-gradient(circle at top, rgba(255, 255, 255, 0.08), transparent 42%);
          box-shadow: 0 22px 58px var(--shadow), inset 0 0 0 1px rgba(255,255,255,0.04);
        }
        .hero::before {
          content: '';
          position: absolute;
          inset: 0;
          background:
            repeating-linear-gradient(90deg, rgba(255,255,255,0.03), rgba(255,255,255,0.03) 1px, transparent 1px, transparent 8px),
            repeating-linear-gradient(0deg, rgba(0,0,0,0.06), rgba(0,0,0,0.06) 1px, transparent 1px, transparent 10px);
          opacity: 0.28;
          pointer-events: none;
        }
        .hero::after {
          content: '';
          position: absolute;
          inset: 0;
          background:
            radial-gradient(520px 220px at 70% 12%, rgba(255,255,255,0.08), transparent 45%),
            radial-gradient(430px 180px at 18% 74%, rgba(111,118,127,0.12), transparent 50%);
          pointer-events: none;
          opacity: 0.9;
        }
        .hero-title {
          position: relative;
          width: min(78vw, 560px);
          margin: 0 auto 14px;
        }
        .hero-subtitle {
          position: relative;
          font-size: clamp(1.02rem, 3.8vw, 1.4rem);
          color: var(--cream);
          text-transform: uppercase;
          letter-spacing: 0.22em;
          font-weight: 700;
          margin-top: 2px;
        }
        .divider { position: relative; width: 156px; height: 2px; margin: 16px auto 12px; background: linear-gradient(90deg, transparent, var(--gold), transparent); opacity: 0.9; border-radius: 2px; }
        .hero-details {
          position: relative;
          max-width: 760px;
          margin: 14px auto 0;
        }
        .hero-details summary {
          list-style: none;
        }
        .hero-details summary::-webkit-details-marker {
          display: none;
        }
        .badge {
          display: inline-block;
          color: var(--cream);
          border: 1px solid var(--line);
          padding: 8px 14px;
          border-radius: 999px;
          letter-spacing: 0.16em;
          font-weight: 700;
          font-size: 0.72rem;
          text-transform: uppercase;
          background: linear-gradient(180deg, rgba(255,255,255,0.08), rgba(18,19,21,0.26));
          margin: 0 auto;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.05);
          cursor: pointer;
          user-select: none;
          transition: transform 0.18s ease, border-color 0.18s ease;
        }
        .badge:hover {
          transform: translateY(-1px);
          border-color: rgba(255, 255, 255, 0.22);
        }
        .badge::after {
          content: '+';
          font-size: 0.9rem;
          line-height: 1;
        }
        .hero-details[open] .badge::after {
          content: '−';
        }
        .container { position: relative; max-width: 980px; margin: 0 auto; padding: 28px 6px 30px; }
        .status-line {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          margin-top: 0;
          border: 1px solid rgba(255, 255, 255, 0.14);
          border-radius: 999px;
          padding: 8px 14px;
          font-size: 0.84rem;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          box-shadow: inset 0 0 0 1px rgba(255,255,255,0.04);
          background: rgba(255, 255, 255, 0.04);
        }
        .status-open { color: #dce7cf; border-color: rgba(90,102,82,0.45); background: rgba(90,102,82,0.2); }
        .status-closed { color: #ead4a7; border-color: rgba(210,170,103,0.34); background: rgba(210,170,103,0.12); }
        .status-unknown { color: var(--muted); border-color: rgba(255,255,255,0.12); background: rgba(255,255,255,0.03); }
        .rl-desc {
          color: var(--muted);
          max-width: 780px;
          margin: 14px auto 0;
          line-height: 1.65;
        }
        .rl-card {
          position: relative;
          background: linear-gradient(180deg, rgba(19, 20, 23, 0.88), rgba(9, 9, 10, 0.92));
          border: 1px solid var(--line);
          border-radius: 18px;
          padding: 24px 26px 22px;
          max-width: 760px;
          margin: 18px auto 0;
          color: #dedbd7;
          line-height: 1.65;
          text-align: left;
          box-shadow: 0 16px 34px rgba(0,0,0,0.35), inset 0 0 0 1px rgba(255,255,255,0.03);
        }
        .rl-card::before {
          content: '';
          position: absolute;
          inset: 12px;
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 10px;
          pointer-events: none;
        }
        .rl-card p { position: relative; margin: 0.45rem 0; font-size: 1rem; }
        .rl-strong { color: var(--gold); font-weight: 800; }
        .qr-actions {
          max-width: 760px;
          margin: 0 auto;
          padding-top: 18px;
          padding-bottom: 12px;
        }
        .linktree {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 12px;
        }
        .link-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          text-decoration: none;
          text-align: center;
          color: var(--ink);
          background: linear-gradient(180deg, var(--accent-light), var(--gold) 64%, var(--amber));
          padding: 18px 20px;
          border-radius: 14px;
          font-weight: 800;
          margin: 0;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.38), 0 12px 24px rgba(0,0,0,0.32);
          transition: transform .2s ease, filter .2s ease, box-shadow .2s ease;
          min-height: 78px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          text-transform: uppercase;
          letter-spacing: 0.06em;
          line-height: 1.35;
        }
        .link-btn-primary {
          min-height: 86px;
          font-size: 0.96rem;
        }
        .link-btn:hover { transform: translateY(-2px) scale(1.01); filter: saturate(1.08); box-shadow: 0 12px 28px rgba(0,0,0,0.6); }
        .link-btn:focus-visible { outline: 2px solid #f8e7a8; outline-offset: 2px; }
        .chip {
          background: rgba(255,255,255,0.05);
          color: #d7d9dd;
          border: 1px solid var(--line);
          padding: 6px 11px;
          border-radius: 8px;
          font-size: .85rem;
        }
        .chip a { color: inherit; text-decoration: none; }
        .stagger { animation: rise 0.45s ease both; }
        .stagger:nth-child(2) { animation-delay: 0.05s; }
        .stagger:nth-child(3) { animation-delay: 0.1s; }
        .stagger:nth-child(4) { animation-delay: 0.15s; }
        .review-cta {
          max-width: 760px;
          margin: 22px auto 2px;
          border: 1px solid var(--line);
          border-radius: 18px;
          background: linear-gradient(180deg, rgba(20, 21, 24, 0.95), rgba(9, 9, 10, 0.98));
          padding: 22px 18px 18px;
          text-align: center;
          box-shadow: 0 16px 32px rgba(0,0,0,0.28), inset 0 0 0 1px rgba(255,255,255,0.03);
        }
        .review-cta h3 {
          color: var(--gold);
          letter-spacing: 0.12em;
          text-transform: uppercase;
          margin-bottom: 8px;
          font-size: 0.92rem;
        }
        .review-copy {
          color: var(--muted);
          margin-bottom: 12px;
          line-height: 1.4;
          font-size: 0.93rem;
        }
        .feedback-optin {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          margin: 8px 0 12px;
          color: #c9ccd2;
          font-size: 0.83rem;
          line-height: 1.3;
          text-align: left;
          letter-spacing: 0.03em;
        }
        .feedback-optin input {
          margin-top: 2px;
          width: auto;
        }
        .feedback-optin span {
          flex: 1;
          text-transform: none;
        }
        .feedback-form {
          margin: 0 auto 8px;
          max-width: 640px;
          display: none;
        }
        .feedback-fields {
          margin-top: 6px;
          text-align: left;
        }
        .feedback-form input,
        .feedback-form textarea,
        .feedback-form button {
          width: 100%;
          border-radius: 8px;
          border: 1px solid rgba(255, 255, 255, 0.14);
          font-family: inherit;
          font-size: 0.95rem;
          box-sizing: border-box;
        }
        .feedback-form input,
        .feedback-form textarea {
          background: rgba(255, 255, 255, 0.05);
          color: var(--cream);
          padding: 10px 12px;
          margin-bottom: 8px;
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.02);
        }
        .feedback-form textarea {
          min-height: 120px;
          resize: vertical;
        }
        .feedback-form button {
          background: linear-gradient(180deg, var(--accent-light), var(--gold) 64%, var(--amber));
          color: var(--ink);
          border: 1px solid rgba(255, 255, 255, 0.12);
          padding: 12px;
          font-weight: 800;
          min-height: 48px;
          cursor: pointer;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.38), 0 10px 18px rgba(0,0,0,0.24);
        }
        .feedback-form button:disabled {
          opacity: 0.65;
          cursor: not-allowed;
        }
        .feedback-form label {
          display: block;
          text-align: left;
          color: #d3d5d9;
          font-size: 0.84rem;
          letter-spacing: 0.08em;
          margin: 0 0 6px;
          text-transform: uppercase;
        }
        .review-stars {
          display: flex;
          justify-content: center;
          gap: 8px;
          margin-bottom: 8px;
        }
        .review-star {
          appearance: none;
          border: 0;
          background: transparent;
          color: #666b73;
          font-size: 2rem;
          cursor: pointer;
          line-height: 1;
          transition: transform 0.15s ease, color 0.15s ease;
        }
        .review-star:hover,
        .review-star:focus-visible {
          color: var(--gold);
          transform: translateY(-1px) scale(1.08);
        }
        .review-star[aria-pressed="true"] {
          color: var(--gold);
        }
        .review-hint {
          color: var(--muted);
          font-size: 0.9rem;
          min-height: 1.4rem;
        }
        .review-success {
          color: #86efac;
        }
        .loc-content-flow {
          display: flex;
          flex-direction: column;
        }
        .qr-actions { order: 1; }
        .loc-events { order: 3; }
        .loc-menu-stack { order: 2; }
        .review-cta { order: 4; }
        .loc-events {
          max-width: 980px;
          padding-top: 16px;
        }
        .loc-events-head {
          display: flex;
          justify-content: space-between;
          align-items: end;
          gap: 12px;
          flex-wrap: wrap;
          margin-bottom: 14px;
        }
        .loc-events-kicker {
          color: var(--gold);
          font-size: 0.7rem;
          font-weight: 800;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          margin-bottom: 8px;
        }
        .loc-events-head h3 {
          margin: 0;
          color: var(--cream);
          font-family: 'Playfair Display', 'Iowan Old Style', Georgia, serif;
          font-size: 1.9rem;
        }
        .loc-events-head p {
          margin: 6px 0 0;
          color: var(--muted);
          line-height: 1.5;
        }
        .loc-events-view-all {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 44px;
          padding: 0 16px;
          border-radius: 999px;
          border: 1px solid rgba(210,170,103,0.26);
          color: var(--accent-light);
          text-decoration: none;
          font-size: 0.82rem;
          font-weight: 700;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          background: rgba(210,170,103,0.08);
        }
        .loc-events-view-all:hover { border-color: rgba(210,170,103,0.55); text-decoration: none; }
        .loc-events-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 14px;
        }
        .loc-event-card {
          overflow: hidden;
          border-radius: 18px;
          border: 1px solid var(--line);
          background: linear-gradient(180deg, rgba(20,21,24,0.96), rgba(9,9,10,0.99));
          box-shadow: 0 14px 30px rgba(0,0,0,0.22);
        }
        .loc-event-card-featured {
          background:
            linear-gradient(180deg, rgba(20,21,24,0.96), rgba(9,9,10,0.99)),
            radial-gradient(circle at top, rgba(210,170,103,0.10), transparent 58%);
        }
        .loc-event-image-link { display: block; }
        .loc-event-image {
          display: block;
          width: 100%;
          height: 180px;
          object-fit: cover;
          border-bottom: 1px solid var(--line);
        }
        .loc-event-body { padding: 16px; }
        .loc-event-top {
          display: flex;
          justify-content: space-between;
          gap: 10px;
          align-items: center;
          flex-wrap: wrap;
          margin-bottom: 10px;
        }
        .loc-event-badge {
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
        .loc-event-badge-open { background: rgba(34,197,94,0.18); color: #86efac; }
        .loc-event-badge-scheduled { background: rgba(96,165,250,0.18); color: #bfdbfe; }
        .loc-event-badge-full,
        .loc-event-badge-closed { background: rgba(251,146,60,0.18); color: #fdba74; }
        .loc-event-badge-info { background: rgba(210,170,103,0.16); color: var(--accent-light); }
        .loc-event-badge-neutral { background: rgba(148,163,184,0.18); color: #cbd5e1; }
        .loc-event-date {
          color: var(--muted);
          font-size: 0.78rem;
        }
        .loc-event-title {
          margin: 0 0 6px;
          font-size: 1.2rem;
          line-height: 1.1;
        }
        .loc-event-title a {
          color: var(--cream);
          text-decoration: none;
        }
        .loc-event-title a:hover { color: var(--gold); }
        .loc-event-time {
          color: var(--gold);
          font-size: 0.84rem;
          margin: 0 0 10px;
          letter-spacing: 0.04em;
        }
        .loc-event-copy {
          color: var(--muted);
          font-size: 0.86rem;
          line-height: 1.55;
          margin-bottom: 14px;
        }
        .loc-event-actions {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }
        .loc-event-capacity {
          color: var(--muted);
          font-size: 0.76rem;
        }
        .loc-event-link {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 42px;
          padding: 0 16px;
          border-radius: 12px;
          background: linear-gradient(180deg, var(--accent-light), var(--gold) 64%, var(--amber));
          color: var(--ink);
          text-decoration: none;
          font-size: 0.84rem;
          font-weight: 800;
          letter-spacing: 0.05em;
          text-transform: uppercase;
        }
        .loc-event-link:hover { text-decoration: none; filter: brightness(1.04); }
        .menu-section {
          max-width: 480px;
          margin: 18px auto 6px;
          background: linear-gradient(180deg, rgba(20,21,24,0.95), rgba(9,9,10,0.98));
          border: 1px solid var(--line);
          border-radius: 16px;
          padding: 20px 20px 14px;
          box-shadow: 0 10px 28px rgba(0,0,0,0.25);
        }
        .menu-section-hdr {
          color: var(--gold);
          font-size: 0.72rem;
          font-weight: 800;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          text-align: center;
          margin-bottom: 16px;
        }
        .menu-item {
          padding: 12px 0;
          border-top: 1px solid rgba(255,255,255,0.06);
        }
        .menu-item:first-child { border-top: none; padding-top: 0; }
        .menu-item:last-child { padding-bottom: 0; }
        .menu-item-top {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
        }
        .menu-item-name {
          font-weight: 700;
          color: var(--cream);
          font-size: 0.94rem;
        }
        .menu-item-desc {
          color: var(--muted);
          font-size: 0.8rem;
          line-height: 1.4;
          margin-top: 3px;
        }
        .menu-item-price {
          color: var(--gold);
          font-size: 0.88rem;
          font-weight: 700;
          white-space: nowrap;
          margin-left: 12px;
        }
        .promo-toast {
          position: fixed;
          bottom: 20px;
          left: 50%;
          transform: translateX(-50%) translateY(120px);
          z-index: 100;
          max-width: 360px;
          width: calc(100% - 32px);
          padding: 14px 18px;
          background: linear-gradient(135deg, rgba(28,26,22,0.97), rgba(14,13,11,0.98));
          border: 1px solid rgba(210,170,103,0.45);
          border-radius: 14px;
          box-shadow: 0 12px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(210,170,103,0.08);
          cursor: pointer;
          text-align: center;
          text-decoration: none;
          opacity: 0;
          transition: transform 0.5s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.5s ease;
          pointer-events: none;
        }
        .promo-toast.visible {
          transform: translateX(-50%) translateY(0);
          opacity: 1;
          pointer-events: auto;
        }
        .promo-toast.hiding {
          transform: translateX(-50%) translateY(120px);
          opacity: 0;
          pointer-events: none;
        }
        .promo-toast-headline {
          color: var(--gold);
          font-size: 0.92rem;
          font-weight: 800;
          margin-bottom: 3px;
        }
        .promo-toast-sub {
          color: var(--muted);
          font-size: 0.78rem;
          line-height: 1.4;
        }
        .promo-toast-dismiss {
          position: absolute;
          top: 6px;
          right: 10px;
          background: none;
          border: none;
          color: var(--muted);
          font-size: 1.1rem;
          cursor: pointer;
          padding: 2px 6px;
          line-height: 1;
        }
        @keyframes rise {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @media (max-width: 720px) {
          .hero {
            padding: 22px 14px 16px;
            border-radius: 0 0 24px 24px;
          }
          .hero-title {
            width: min(64vw, 320px);
            margin-bottom: 8px;
          }
          .hero-subtitle {
            font-size: 0.92rem;
            letter-spacing: 0.16em;
          }
          .divider {
            width: 112px;
            margin: 10px auto 10px;
          }
          .status-line {
            padding: 7px 10px;
            font-size: 0.72rem;
            letter-spacing: 0.06em;
            line-height: 1.25;
          }
          .hero-details {
            margin-top: 10px;
          }
          .badge {
            padding: 7px 11px;
            font-size: 0.62rem;
            letter-spacing: 0.12em;
          }
          .container {
            padding: 18px 10px 22px;
          }
          .rl-card {
            padding: 20px 18px 18px;
          }
          .qr-actions {
            order: 1;
            padding-top: 14px;
            padding-bottom: 10px;
          }
          .linktree {
            grid-template-columns: 1fr 1fr;
            gap: 10px;
          }
          .link-btn {
            min-height: 64px;
            padding: 13px 10px;
            border-radius: 14px;
            font-size: 0.78rem;
            line-height: 1.25;
          }
          .link-btn-primary {
            grid-column: 1 / -1;
            min-height: 76px;
            font-size: 0.93rem;
          }
          .loc-menu-stack { order: 2; }
          .loc-events { order: 3; padding-top: 6px; padding-bottom: 10px; }
          .loc-events-head {
            align-items: start;
            margin-bottom: 10px;
            padding: 0 10px;
          }
          .loc-events-view-all {
            min-height: 44px;
            padding: 0 15px;
            font-size: 0.8rem;
          }
          .loc-events-grid {
            grid-template-columns: 1fr;
            gap: 8px;
            padding: 0 10px;
          }
          .loc-event-card {
            border-radius: 12px;
            box-shadow: none;
          }
          .loc-event-card:nth-child(n+3) {
            display: none;
          }
          .loc-event-image-link {
            display: none;
          }
          .loc-event-body {
            padding: 12px;
          }
          .loc-event-top {
            margin-bottom: 5px;
            gap: 6px;
          }
          .loc-event-badge {
            min-height: 24px;
            padding: 0 8px;
            font-size: 0.62rem;
          }
          .loc-event-date {
            font-size: 0.72rem;
          }
          .loc-event-title {
            font-size: 1rem;
            margin-bottom: 4px;
          }
          .loc-event-time {
            font-size: 0.78rem;
            margin-bottom: 0;
          }
          .loc-event-copy {
            display: none;
          }
        }
      </style>
    </head>
    <body>
      <div class="hero">
        ${renderBrandMark({ wrapper: 'h1', className: 'hero-title' })}
        <h2 class="hero-subtitle">${location.name}</h2>
        <div class="divider"></div>
        ${openState.isOpen === null ? '' : `
        <div class="status-line ${statusClass}">
          ${openState.status}${openState.todayHours ? ` · ${openState.todayHours}` : ''}
        </div>
        `}
        <details class="hero-details">
          <summary class="badge">REGISTERED LUBRICATION</summary>
          <div class="rl-card">
            <p>Our first location was in an old gas station. Back then, a sign for "Registered Lubrication" meant you could count on quality products and good service. We liked that idea, so we kept the phrase. These days, it means great cocktails, whiskey how you like it, and service that knows how to take care of people.</p>
            <p class="rl-strong">Same promise of quality, just more fun.</p>
          </div>
        </details>
      </div>
      <main class="loc-content-flow">
        ${renderUpcomingEvents(location, upcomingEvents)}
        ${menuCategories.length > 0 ? `<div class="loc-menu-stack">${menuCategories.map(cat => `
        <div class="menu-section">
          <div class="menu-section-hdr">${escHTML(cat.name)}</div>
          ${(cat.items || []).map(item => `
          <div class="menu-item">
            <div class="menu-item-top">
              <span class="menu-item-name">${escHTML(item.name)}</span>
              ${item.price ? `<span class="menu-item-price">$${Number(item.price).toFixed(0)}</span>` : ''}
            </div>
            ${item.description ? `<div class="menu-item-desc">${escHTML(item.description)}</div>` : ''}
          </div>
          `).join('')}
        </div>
        `).join('')}</div>` : ''}
        <section class="qr-actions container" aria-label="Quick actions">
          <div class="linktree">
            ${buttons.map((l, i) => `<a class="${actionButtonClass(l)} stagger" href="${l.url}"${l.url.startsWith('/') ? '' : ' target="_blank" rel="noopener noreferrer"'} style="animation-delay:${Math.min(i * 0.04, 0.2)}s;"><span>${l.label}</span></a>`).join('')}
          </div>
        </section>
        <div class="review-cta">
        <h3>Rate your visit</h3>
        <p class="review-copy">
          Tap a star for a chance to win a <strong>$100 gift card</strong> (drawn monthly).
        </p>
        <div class="review-stars" role="radiogroup" aria-label="Guest rating">
          <button class="review-star" type="button" role="radio" aria-label="Rate 1 star" data-rating="1" aria-pressed="false">★</button>
          <button class="review-star" type="button" role="radio" aria-label="Rate 2 stars" data-rating="2" aria-pressed="false">★</button>
          <button class="review-star" type="button" role="radio" aria-label="Rate 3 stars" data-rating="3" aria-pressed="false">★</button>
          <button class="review-star" type="button" role="radio" aria-label="Rate 4 stars" data-rating="4" aria-pressed="false">★</button>
          <button class="review-star" type="button" role="radio" aria-label="Rate 5 stars" data-rating="5" aria-pressed="false">★</button>
        </div>
        <form id="feedback-form" class="feedback-form" action="/api/feedback" method="POST" autocomplete="on">
          <input type="hidden" id="feedback-rating" name="rating" value="" />
          <div class="feedback-fields">
            <label for="feedback-name">Name</label>
            <input id="feedback-name" name="name" type="text" placeholder="Guest name (optional)" />
            <label for="feedback-email">Email</label>
            <input id="feedback-email" name="email" type="email" placeholder="you@email.com (optional — needed for gift card drawing)" />
            <label for="feedback-message">Share your feedback</label>
            <textarea id="feedback-message" name="feedback" placeholder="What was great, and what can we improve?"></textarea>
            <label class="feedback-optin" for="feedback-giftcard-optin">
              <input id="feedback-giftcard-optin" name="giftCardOptIn" type="checkbox" checked />
              <span>Enter me for a chance to win a <strong>$100 gift card</strong> (drawn monthly).</span>
            </label>
            <label class="feedback-optin" for="feedback-newsletter-optin">
              <input id="feedback-newsletter-optin" name="newsletterOptIn" type="checkbox" />
              <span>Sign me up for the newsletter with special events, new releases, and tasting updates.</span>
            </label>
          </div>
          <button id="feedback-submit" type="submit">Send feedback</button>
        </form>
        <p id="review-hint" class="review-hint">Tap a star to share feedback.</p>
      </div>
      </main>
      <script>
        (function() {
          const config = ${JSON.stringify(reviewConfig)};
          const locationResolution = config.locationResolution || {};
          const stars = Array.from(document.querySelectorAll('.review-star'));
          const hint = document.getElementById('review-hint');
          const feedbackForm = document.getElementById('feedback-form');
          const feedbackNameInput = document.getElementById('feedback-name');
          const feedbackMessageInput = document.getElementById('feedback-message');
          const feedbackEmailInput = document.getElementById('feedback-email');
          const feedbackNewsletterInput = document.getElementById('feedback-newsletter-optin');
          const feedbackGiftCardInput = document.getElementById('feedback-giftcard-optin');
          const feedbackRatingInput = document.getElementById('feedback-rating');
          const feedbackSubmitButton = document.getElementById('feedback-submit');

          function milesBetween(lat1, lng1, lat2, lng2) {
            const radius = 3958.8;
            const dLat = ((lat2 - lat1) * Math.PI) / 180;
            const dLng = ((lng2 - lng1) * Math.PI) / 180;
            const lat1Rad = (lat1 * Math.PI) / 180;
            const lat2Rad = (lat2 * Math.PI) / 180;
            const a =
              Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1Rad) * Math.cos(lat2Rad) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            return radius * c;
          }

          function getStorageValue(key, fallback) {
            try {
              const value = window.localStorage.getItem(key);
              return value == null ? fallback : value;
            } catch {
              return fallback;
            }
          }

          function setStorageValue(key, value) {
            try {
              window.localStorage.setItem(key, value);
            } catch {
              // ignore
            }
          }

          function tryResolveNearbyLocation() {
            if (!locationResolution || locationResolution.enabled === false) return;
            if (!navigator.geolocation) return;
            const candidates = Array.isArray(locationResolution.candidates) ? locationResolution.candidates : [];
            if (candidates.length === 0) return;
            const currentSlug = String(locationResolution.currentSlug || '').toLowerCase();
            if (!currentSlug) return;
            const maxDistance = Number(locationResolution.maxDistanceMiles);
            if (!Number.isFinite(maxDistance) || maxDistance <= 0) return;
            const skip = /([?&])skipLocationRedirect=1(&|$)/.test(window.location.search);
            if (skip) return;
            const storageKey = 'dd_location_redirect_' + currentSlug;
            const now = Date.now();
            const last = Number(getStorageValue(storageKey, '0'));
            if (Number.isFinite(last) && last > now - (1000 * 60 * 60 * 6)) return;

            navigator.geolocation.getCurrentPosition(
              (position) => {
                const coords = position && position.coords ? position.coords : null;
                if (!coords) return;
                const userLat = Number(coords.latitude);
                const userLng = Number(coords.longitude);
                if (!Number.isFinite(userLat) || !Number.isFinite(userLng)) return;

                let nearest = null;
                for (const candidate of candidates) {
                  if (!candidate || !candidate.slug) continue;
                  const distance = milesBetween(userLat, userLng, Number(candidate.lat), Number(candidate.lng));
                  if (!Number.isFinite(distance)) continue;
                  if (!nearest || distance < nearest.distance) {
                    nearest = {
                      slug: String(candidate.slug),
                      name: String(candidate.name || candidate.slug),
                      distance,
                    };
                  }
                }
                if (!nearest || !nearest.slug) return;
                if (nearest.slug.toLowerCase() === currentSlug) return;
                if (!Number.isFinite(nearest.distance) || nearest.distance > maxDistance) return;

                setStorageValue(storageKey, String(now));
                const nextPath = '/' + nearest.slug;
                window.location.href = nextPath;
              },
              () => {},
              { enableHighAccuracy: true, timeout: 8000, maximumAge: 300000 },
            );
          }

          if (!stars.length || !hint) return;
          tryResolveNearbyLocation();

          function highlight(rating) {
            stars.forEach((btn) => {
              const value = Number(btn.getAttribute('data-rating') || '0');
              btn.setAttribute('aria-pressed', value <= rating ? 'true' : 'false');
            });
          }

          function setHint(message, isSuccess) {
            hint.textContent = message;
            hint.classList.toggle('review-success', Boolean(isSuccess));
          }

          function sanitize(value) {
            return String(value || '').trim();
          }

          function isLikelyValidEmail(value) {
            return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sanitize(value));
          }

          function setFieldRequired(requireEmail, requireFeedback) {
            if (feedbackEmailInput) feedbackEmailInput.required = Boolean(requireEmail);
            if (feedbackMessageInput) feedbackMessageInput.required = Boolean(requireFeedback);
          }

          function hideFeedbackForm() {
            if (!feedbackForm) return;
            feedbackForm.style.display = 'none';
            feedbackRatingInput.value = '';
            if (feedbackNameInput) feedbackNameInput.value = '';
            if (feedbackEmailInput) feedbackEmailInput.value = '';
            if (feedbackMessageInput) feedbackMessageInput.value = '';
            if (feedbackNewsletterInput) feedbackNewsletterInput.checked = false;
            setFieldRequired(false, false);
          }

          function showFeedbackForm(rating) {
            if (!feedbackForm) return;
            const isFiveStar = Number(rating || 0) === 5;
            feedbackForm.style.display = 'block';
            feedbackRatingInput.value = String(rating);
            if (feedbackMessageInput) {
              feedbackMessageInput.value = isFiveStar ? 'Guest gave a 5-star rating.' : '';
              feedbackMessageInput.placeholder = isFiveStar
                ? 'Tell us what you loved about your visit (optional for 5 stars).'
                : 'What was great, and what can we improve?';
            }
            setFieldRequired(false, false);
            setHint(isFiveStar
              ? 'You selected 5/5. Add your email for a chance to win the gift card.'
              : 'You selected ' + rating + '/5. Share any details you\\\'d like.');
          }

          function copyReviewTextToClipboard(reviewText) {
            var prepared = sanitize(reviewText);
            if (!prepared) return Promise.resolve(false);
            if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
              return navigator.clipboard.writeText(prepared)
                .then(function() {
                  return true;
                })
                .catch(function() {
                  return fallbackCopyToClipboard(prepared);
                });
            }
            return Promise.resolve(fallbackCopyToClipboard(prepared));
          }

          function fallbackCopyToClipboard(text) {
            try {
              var textarea = document.createElement('textarea');
              textarea.value = text;
              textarea.setAttribute('readonly', '');
              textarea.style.position = 'absolute';
              textarea.style.left = '-9999px';
              document.body.appendChild(textarea);
              textarea.focus();
              textarea.select();
              var success = document.execCommand('copy');
              document.body.removeChild(textarea);
              return success;
            } catch (err) {
              return false;
            }
          }

          function buildReviewText(rating, feedbackText) {
            return 'Review for ' + config.locationName + ' (' + rating + '/5):\\n\\n' + sanitize(feedbackText || 'Guest had a great visit.');
          }

          function offerGoogleReview(rating, feedbackText) {
            if (!config.googleReviewUrl) return;
            const reviewTextForGoogle = buildReviewText(rating, feedbackText);
            copyReviewTextToClipboard(reviewTextForGoogle).then(function(copied) {
              if (copied) {
                setHint('Opening Google review. Your review was copied so you can paste it there.', true);
              } else {
                setHint('Opening Google review. Please paste your review text manually.', true);
              }
              window.open(config.googleReviewUrl, '_blank', 'noopener,noreferrer');
            });
          }

          async function submitFeedback(payload, options) {
            const isFiveStar = payload.rating === 5;
            const feedbackPayload = {
              locationSlug: config.locationSlug,
              rating: Number(payload.rating || 0),
              name: sanitize(payload.name || ''),
              email: sanitize(payload.email || ''),
              feedback: sanitize(payload.feedback || ''),
              newsletterOptIn: Boolean(payload.newsletterOptIn),
              giftCardOptIn: Boolean(payload.giftCardOptIn),
            };

            if (!feedbackPayload.rating) {
              setHint('Please select a star first.');
              return;
            }

            if (feedbackPayload.email && !isLikelyValidEmail(feedbackPayload.email)) {
              setHint('Please enter a valid email or leave it blank.');
              return;
            }

            if (isFiveStar && !feedbackPayload.feedback) {
              feedbackPayload.feedback = 'Guest gave a 5-star rating.';
            }

            feedbackSubmitButton && (feedbackSubmitButton.disabled = true);
            setHint(options && options.hint ? options.hint : 'Sending your feedback...');
            try {
              const response = await fetch(config.feedbackEndpoint, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Accept: 'application/json',
                },
                body: JSON.stringify(feedbackPayload),
              });
              const data = await response.json().catch(() => ({}));
              if (!response.ok || !data.ok) {
                setHint(data.error || 'Could not send feedback right now. Please try again in a moment.');
                return;
              }

              if (feedbackForm) feedbackForm.style.display = 'none';

              var thankYou = 'Thank you! Your feedback has been shared with our team.';
              if (config.googleReviewUrl) {
                thankYou += ' <a href="' + config.googleReviewUrl + '" target="_blank" rel="noopener noreferrer" style="color:var(--gold); font-weight:700;">Leave us a Google review too &rarr;</a>';
              }
              hint.innerHTML = thankYou;
              hint.classList.add('review-success');

            } catch (err) {
              setHint('Something went wrong while sending your feedback. Please try again in a moment.');
            } finally {
              feedbackSubmitButton && (feedbackSubmitButton.disabled = false);
            }
          }

          stars.forEach((star) => {
            star.addEventListener('click', async () => {
              const rating = Number(star.getAttribute('data-rating') || '0');
              if (!Number.isFinite(rating)) return;
              highlight(rating);
              hideFeedbackForm();
              showFeedbackForm(rating);
            });
          });

          if (!feedbackForm || !feedbackSubmitButton || !feedbackMessageInput) return;
          feedbackForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            if (feedbackSubmitButton.disabled) return;
            const payload = {
              rating: Number(feedbackRatingInput && feedbackRatingInput.value ? feedbackRatingInput.value : 0),
              name: sanitize((feedbackNameInput && feedbackNameInput.value) || ''),
              email: sanitize((feedbackEmailInput && feedbackEmailInput.value) || ''),
              feedback: sanitize(feedbackMessageInput.value),
              newsletterOptIn: feedbackNewsletterInput && feedbackNewsletterInput.checked,
              giftCardOptIn: feedbackGiftCardInput && feedbackGiftCardInput.checked,
            };
            await submitFeedback(payload, {
              hint: 'Sending your feedback...',
            });
          });
        })();
      </script>

      <div class="promo-toast" id="promo-toast" role="alert">
        <button class="promo-toast-dismiss" id="promo-dismiss" aria-label="Dismiss">&times;</button>
        <div class="promo-toast-headline">Rate your visit for a chance to win a $100 gift card</div>
        <div class="promo-toast-sub">Tap here to leave a quick review &mdash; takes 30 seconds</div>
      </div>
      <script>
        (function() {
          var toast = document.getElementById('promo-toast');
          var dismiss = document.getElementById('promo-dismiss');
          var reviewSection = document.querySelector('.review-cta');
          if (!toast || !reviewSection) return;

          setTimeout(function() { toast.classList.add('visible'); }, 1800);

          setTimeout(function() {
            if (toast.classList.contains('visible') && !toast.classList.contains('hiding')) {
              toast.classList.add('hiding');
              toast.classList.remove('visible');
            }
          }, 9000);

          toast.addEventListener('click', function(e) {
            if (e.target === dismiss) return;
            toast.classList.add('hiding');
            toast.classList.remove('visible');
            reviewSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
          });

          dismiss.addEventListener('click', function(e) {
            e.stopPropagation();
            toast.classList.add('hiding');
            toast.classList.remove('visible');
          });
        })();
      </script>
    </body>
    </html>
  `;
}

module.exports = { generateLocationPage };
