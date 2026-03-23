const { vintageThemeCss } = require('./publicTheme');

function generateHomepage(locs) {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Dram & Draught - Locations in North Carolina</title>
      <style>
        ${vintageThemeCss()}
        .hero {
          position: relative;
          overflow: hidden;
          color: var(--cream);
          text-align: center;
          padding: 62px 20px 48px;
          border-radius: 0 0 26px 26px;
          border: 1px solid var(--line);
          border-top: 0;
          border-bottom-color: rgba(255, 255, 255, 0.12);
          box-shadow: 0 18px 48px var(--shadow), inset 0 0 0 1px rgba(255, 255, 255, 0.04);
          background:
            linear-gradient(180deg, rgba(24, 25, 28, 0.97), rgba(7, 7, 8, 0.98)),
            radial-gradient(circle at top, rgba(255, 255, 255, 0.08), transparent 42%);
          margin: 0 auto;
          max-width: 980px;
          animation: fadeIn .45s ease-out;
        }
        .hero::before {
          content: '';
          position: absolute;
          inset: 0;
          background:
            repeating-linear-gradient(90deg, rgba(255, 250, 240, 0.03), rgba(255, 250, 240, 0.03) 1px, transparent 1px, transparent 8px),
            repeating-linear-gradient(0deg, rgba(0, 0, 0, 0.06), rgba(0, 0, 0, 0.06) 1px, transparent 1px, transparent 10px);
          opacity: 0.28;
          pointer-events: none;
        }
        .hero::after {
          content: '';
          position: absolute;
          inset: 0;
          background:
            radial-gradient(520px 220px at 70% 12%, rgba(255, 255, 255, 0.08), transparent 45%),
            radial-gradient(430px 180px at 18% 74%, rgba(111, 118, 127, 0.12), transparent 50%);
          opacity: 0.9;
          pointer-events: none;
        }
        .hero h1 {
          position: relative;
          font-size: clamp(2.2rem, 8vw, 3.4rem);
          margin-bottom: 10px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          background: linear-gradient(180deg, #ffffff, #d0d4da 68%, #737a84 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          text-shadow: 0 1px 0 rgba(0,0,0,0.25);
        }
        .hero-title { position: relative; }
        .divider {
          position: relative;
          width: 140px;
          height: 2px;
          margin: 14px auto;
          background: linear-gradient(90deg, transparent, var(--gold), transparent);
          opacity: 0.95;
          border-radius: 2px;
        }
        .badge {
          position: relative;
          display: inline-block;
          color: var(--cream);
          border: 1px solid var(--line);
          padding: 7px 13px;
          border-radius: 6px;
          letter-spacing: 0.16em;
          font-weight: 700;
          font-size: 0.76em;
          text-transform: uppercase;
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.08), rgba(18, 19, 21, 0.26));
          margin-top: 8px;
          margin-bottom: 12px;
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.05);
        }
        .rl-card {
          position: relative;
          background: linear-gradient(180deg, rgba(19, 20, 23, 0.88), rgba(9, 9, 10, 0.92));
          border: 1px solid var(--line);
          border-radius: 12px;
          padding: 18px 18px 16px;
          max-width: 900px;
          margin: 0 auto;
          color: #dedbd7;
          line-height: 1.65;
          box-shadow: 0 12px 30px rgba(0,0,0,0.35), inset 0 0 0 1px rgba(255,255,255,0.03);
          animation: fadeIn .45s ease-out .08s both;
        }
        .rl-card p { margin: 0.4rem 0; }
        .rl-strong { color: var(--gold); font-weight: 700; }
        .container {
          max-width: 1200px;
          margin: 0 auto;
          padding: 42px 20px 54px;
        }
        .location-controls {
          max-width: 980px;
          margin: 0 auto 22px;
          text-align: center;
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
        }
        .location-controls p {
          color: var(--muted);
          margin-bottom: 0;
          font-size: 0.94rem;
          letter-spacing: 0.03em;
        }
        .location-controls button {
          background: linear-gradient(180deg, #ffffff, #bcc1c8 64%, #727983);
          color: var(--ink);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 8px;
          padding: 10px 16px;
          font-family: inherit;
          font-weight: 700;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          cursor: pointer;
          transition: transform 0.2s ease, filter 0.2s ease, box-shadow 0.2s ease;
          min-height: 40px;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.38), 0 10px 18px rgba(0,0,0,0.22);
        }
        .location-controls button:hover {
          transform: translateY(-2px);
          filter: brightness(1.04);
        }
        .location-controls button:disabled {
          opacity: 0.55;
          cursor: not-allowed;
          transform: none;
          filter: none;
        }
        .locations-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: 25px;
          margin-top: 28px;
        }
        .location-card {
          position: relative;
          overflow: hidden;
          border: 1px solid var(--line);
          border-radius: 10px;
          padding: 24px;
          background: linear-gradient(180deg, rgba(20, 21, 24, 0.94), rgba(9, 9, 10, 0.98));
          box-shadow: 0 14px 30px rgba(0,0,0,0.28), inset 0 0 0 1px rgba(255,255,255,0.03);
          text-decoration: none;
          color: var(--text);
          display: block;
          transition: transform 0.26s ease, border-color 0.26s ease, box-shadow 0.26s ease;
          animation: fadeIn .45s ease-out;
          min-height: 238px;
        }
        .location-card:hover {
          transform: translateY(-4px);
          border-color: rgba(255, 255, 255, 0.24);
          box-shadow: 0 18px 36px rgba(0,0,0,0.32), inset 0 0 0 1px rgba(255,255,255,0.04);
        }
        .location-card::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 2px;
          background: linear-gradient(90deg, transparent, var(--gold), transparent);
          opacity: 0.8;
        }
        .location-card::after {
          content: '';
          position: absolute;
          inset: 10px;
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 6px;
          pointer-events: none;
        }
        .location-name {
          font-size: 1.5em;
          color: var(--cream);
          margin-bottom: 10px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .location-meta {
          color: #b3afb0;
          margin-bottom: 10px;
          line-height: 1.45;
          font-size: 0.93rem;
        }
        .special-line {
          color: #d8dbe0;
          font-size: 0.9em;
          min-height: 1.3em;
          margin-top: 10px;
          margin-bottom: 20px;
        }
        .location-distance {
          font-size: 0.85rem;
          color: #b9bec5;
          min-height: 1.2rem;
        }
        .view-location {
          position: absolute;
          left: 24px;
          bottom: 24px;
          display: inline-block;
          color: var(--ink);
          background: linear-gradient(180deg, #ffffff, #bcc1c8 64%, #727983);
          padding: 10px 20px;
          border-radius: 8px;
          font-weight: 700;
          text-decoration: none;
          border: 1px solid rgba(255, 255, 255, 0.12);
          text-transform: uppercase;
          letter-spacing: 0.04em;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.38), 0 10px 18px rgba(0,0,0,0.2);
        }
        .empty-copy {
          text-align: center;
          max-width: 720px;
          margin: 22px auto 0;
          color: var(--muted);
          border: 1px dashed rgba(255, 255, 255, 0.16);
          border-radius: 10px;
          padding: 18px 16px;
          line-height: 1.55;
          background: rgba(255, 255, 255, 0.03);
        }
      </style>
    </head>
    <body>
      <div class="hero">
        <h1 class="hero-title">Dram & Draught</h1>
        <div class="divider"></div>
        <div class="badge">REGISTERED LUBRICATION</div>
        <div class="rl-card">
          <p>Our first location was in an old gas station. Back then, a sign for 'Registered Lubrication' meant you could count on quality products and good service. We liked that idea, so we kept the phrase. These days, it means great cocktails, whiskey how you like it, and service that knows how to take care of people.</p>
          <p class="rl-strong">Same promise of quality, just more fun.</p>
        </div>
      </div>
      <div class="container">
        <div class="location-controls">
          <p id="location-status">Showing locations alphabetically.</p>
          <button id="sort-by-distance" type="button">Find nearest to me</button>
        </div>
        ${
          locs.length ? `
            <div class="locations-grid">
              ${locs.map(loc => `
                <a href="/${loc.slug}" class="location-card" data-lat="${loc.googleCoordinates && Number.isFinite(Number(loc.googleCoordinates.lat)) ? loc.googleCoordinates.lat : ''}" data-lng="${loc.googleCoordinates && Number.isFinite(Number(loc.googleCoordinates.lng)) ? loc.googleCoordinates.lng : ''}">
                  <h2 class="location-name">${loc.name}</h2>
                  <p class="location-meta">
                    ${loc.address ? `${loc.address}<br/>` : ''}
                    ${loc.city ? `${loc.city}` : ''}${loc.state ? `, ${loc.state}` : ''}${loc.zipCode ? ` ${loc.zipCode}` : ''}
                  </p>
                  <p class="special-line">${loc.specialText || ''}</p>
                  <p class="location-distance" data-distance></p>
                  <span class="view-location">View Location &rarr;</span>
                </a>
              `).join('')}
            </div>
          ` : `
            <p class="empty-copy">Locations are coming soon. Please check back for updates.</p>
          `
        }
      </div>
      <script>
        (function() {
          const status = document.getElementById('location-status');
          const button = document.getElementById('sort-by-distance');
          const grid = document.querySelector('.locations-grid');
          if (!grid || !status || !button) return;

          const cards = Array.from(grid.querySelectorAll('.location-card'));
          if (!cards.length) return;

          const cardsWithCoords = cards.filter((card) => {
            const lat = Number(card.dataset.lat);
            const lng = Number(card.dataset.lng);
            return Number.isFinite(lat) && Number.isFinite(lng);
          });

          if (!navigator.geolocation || cardsWithCoords.length === 0) {
            status.textContent = cardsWithCoords.length ? 'Location sharing is unavailable in this browser right now.' : 'Nearest-location ordering will appear when we have location coordinates for each site.';
            button.disabled = true;
            return;
          }

          function toRad(value) {
            return (value * Math.PI) / 180;
          }

          function milesBetween(lat1, lng1, lat2, lng2) {
            const radius = 3958.8;
            const dLat = toRad(lat2 - lat1);
            const dLng = toRad(lng2 - lng1);
            const a =
              Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            return radius * c;
          }

          function updateDistanceText(card, distance) {
            const line = card.querySelector('[data-distance]');
            if (!line) return;
            line.textContent = distance == null ? '' : distance.toFixed(1) + ' mi';
          }

          function sortCardsByDistance(userLat, userLng) {
            const sorted = cards.slice().sort((a, b) => {
              const aLat = Number(a.dataset.lat);
              const aLng = Number(a.dataset.lng);
              const bLat = Number(b.dataset.lat);
              const bLng = Number(b.dataset.lng);
              const aDist = Number.isFinite(aLat) && Number.isFinite(aLng)
                ? milesBetween(userLat, userLng, aLat, aLng)
                : Number.POSITIVE_INFINITY;
              const bDist = Number.isFinite(bLat) && Number.isFinite(bLng)
                ? milesBetween(userLat, userLng, bLat, bLng)
                : Number.POSITIVE_INFINITY;

              updateDistanceText(a, aDist);
              updateDistanceText(b, bDist);
              return aDist - bDist;
            });
            sorted.forEach((card) => grid.appendChild(card));
            status.textContent = 'Showing nearest locations first.';
            button.textContent = 'Sorted by distance';
          }

          button.addEventListener('click', function() {
            button.disabled = true;
            status.textContent = 'Locating you...';

            navigator.geolocation.getCurrentPosition(
              (position) => {
                const { latitude, longitude } = position.coords || {};
                if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
                  status.textContent = 'Could not read your location. Using default order.';
                  button.disabled = false;
                  return;
                }

                cards.forEach((card) => {
                  const lat = Number(card.dataset.lat);
                  const lng = Number(card.dataset.lng);
                  const hasCoords = Number.isFinite(lat) && Number.isFinite(lng);
                  const line = card.querySelector('[data-distance]');
                  if (!hasCoords) {
                    if (line) line.textContent = 'Distance unavailable';
                    return;
                  }
                });

                sortCardsByDistance(latitude, longitude);
              },
              () => {
                status.textContent = 'Location permission denied. Using default order.';
                button.disabled = false;
              },
              { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 },
            );
          });
        })();
      </script>
    </body>
    </html>
  `;
}

module.exports = { generateHomepage };
