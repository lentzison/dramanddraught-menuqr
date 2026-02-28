function generateHomepage(locs) {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Dram & Draught - Locations in North Carolina</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        :root {
          --panel: #17141c;
          --line: rgba(216, 174, 73, 0.25);
          --muted: #b0a99c;
          --gold: #d9b25f;
          --amber: #b97c3d;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        body {
          font-family: "Palatino Linotype", "Bodoni MT", "Trebuchet MS", Georgia, serif;
          color: #efe7d4;
          background:
            radial-gradient(1100px 520px at 16% -8%, rgba(216, 174, 73, 0.23), transparent 60%),
            radial-gradient(900px 520px at 100% 0%, rgba(185, 124, 61, 0.22), transparent 56%),
            linear-gradient(180deg, #09090c 0%, #0c0c0d 42%, #080808 100%);
          min-height: 100vh;
        }
        .hero {
          position: relative;
          overflow: hidden;
          color: #eee;
          text-align: center;
          padding: 60px 20px 46px;
          border-radius: 0 0 34px 34px;
          border: 1px solid var(--line);
          border-top: 0;
          border-bottom-color: rgba(255,255,255,0.08);
          box-shadow: 0 10px 40px rgba(0,0,0,0.45);
          background: linear-gradient(170deg, rgba(18,17,21,0.95), rgba(7,7,8,0.94));
          margin: 0 auto;
          max-width: 980px;
          animation: fadeIn .45s ease-out;
        }
        .hero::before {
          content: '';
          position: absolute;
          inset: 0;
          background: repeating-linear-gradient(130deg, rgba(255,255,255,0.05), rgba(255,255,255,0.05) 1px, transparent 1px, transparent 8px);
          opacity: 0.16;
          pointer-events: none;
        }
        .hero::after {
          content: '';
          position: absolute;
          inset: 0;
          background:
            radial-gradient(520px 220px at 70% 12%, rgba(255,255,255,0.06), transparent 45%),
            radial-gradient(430px 180px at 18% 74%, rgba(216,174,73,0.12), transparent 50%);
          opacity: 0.7;
          pointer-events: none;
          mix-blend-mode: screen;
        }
        .hero h1 {
          position: relative;
          font-size: clamp(2.2rem, 8vw, 3.4rem);
          margin-bottom: 10px;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          background: linear-gradient(135deg, #f3d7a5, var(--gold), var(--amber));
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
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
          color: #e9cf92;
          border: 1px solid var(--line);
          padding: 6px 12px;
          border-radius: 999px;
          letter-spacing: 0.12em;
          font-weight: 700;
          font-size: 0.8em;
          background: rgba(212, 175, 55, 0.08);
          margin-top: 8px;
          margin-bottom: 12px;
        }
        .rl-card {
          position: relative;
          background: var(--panel);
          border: 1px solid var(--line);
          border-radius: 14px;
          padding: 16px;
          max-width: 900px;
          margin: 0 auto;
          color: #d7d3c9;
          line-height: 1.65;
          box-shadow: 0 8px 22px rgba(0,0,0,0.35);
          animation: fadeIn .45s ease-out .08s both;
        }
        .rl-card p { margin: 0.4rem 0; }
        .rl-strong { color: #d9b25f; font-weight: 700; }
        .container {
          max-width: 1200px;
          margin: 0 auto;
          padding: 40px 20px;
        }
        .location-controls {
          max-width: 980px;
          margin: 0 auto 20px;
          text-align: center;
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
        }
        .location-controls p {
          color: #9d9485;
          margin-bottom: 0;
          font-size: 0.94rem;
        }
        .location-controls button {
          background: #d9b25f;
          color: #1b1309;
          border: 0;
          border-radius: 18px;
          padding: 8px 16px;
          font-family: inherit;
          font-weight: 700;
          cursor: pointer;
          transition: transform 0.2s ease, filter 0.2s ease;
          min-height: 38px;
        }
        .location-controls button:hover {
          transform: translateY(-2px);
          filter: brightness(1.06);
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
          border-radius: 15px;
          padding: 24px;
          background: var(--panel);
          box-shadow: 0 10px 30px rgba(0,0,0,0.25);
          text-decoration: none;
          color: #ddd;
          display: block;
          transition: transform 0.26s ease, border-color 0.26s ease;
          animation: fadeIn .45s ease-out;
          min-height: 238px;
        }
        .location-card:hover {
          transform: translateY(-5px);
          border-color: rgba(255,255,255,0.35);
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
        .location-name {
          font-size: 1.5em;
          color: #fff;
          margin-bottom: 10px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.02em;
        }
        .location-meta {
          color: #7f776d;
          margin-bottom: 10px;
          line-height: 1.45;
          font-size: 0.93rem;
        }
        .special-line {
          color: var(--gold);
          font-size: 0.9em;
          min-height: 1.3em;
          margin-top: 10px;
          margin-bottom: 20px;
        }
        .location-distance {
          font-size: 0.85rem;
          color: #b0a99c;
          min-height: 1.2rem;
        }
        .view-location {
          position: absolute;
          left: 24px;
          bottom: 24px;
          display: inline-block;
          color: #14110d;
          background: linear-gradient(135deg, #d4af37, #b87333);
          padding: 10px 20px;
          border-radius: 20px;
          font-weight: 500;
          text-decoration: none;
        }
        .empty-copy {
          text-align: center;
          max-width: 720px;
          margin: 22px auto 0;
          color: #9d9485;
          border: 1px dashed rgba(255,255,255,0.2);
          border-radius: 14px;
          padding: 18px 16px;
          line-height: 1.55;
        }
      </style>
    </head>
    <body>
      <div class="hero">
        <h1 class="hero-title">Dram & Draught</h1>
        <div class="divider"></div>
        <div class="badge">REGISTERED LUBRICATION</div>
        <div class="rl-card">
          <p>Our first home was a converted service station, back when a sign for 'Registered Lubrication' actually meant you could count on getting quality fluids. We liked the idea, so we kept the name. Only now, instead of motor oil, it's bourbon in your Old Fashioned and cocktails built to keep the night running smooth.</p>
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
