const { vintageThemeCss } = require('./publicTheme');
const { brandMarkCss, renderBrandMark } = require('./brandMark');

function escHTML(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fallbackNoteSections(raw) {
  if (!raw || typeof raw !== 'string') return [];
  return raw.split('\n').filter(Boolean).map((line) => {
    const colonIndex = line.indexOf(':');
    if (colonIndex > 0 && colonIndex < 20) {
      return { label: line.slice(0, colonIndex).trim(), text: line.slice(colonIndex + 1).trim() };
    }
    return { label: 'Note', text: line.trim() };
  });
}

function renderTastingNotes(pour) {
  const notes = pour && pour.guestNotes ? pour.guestNotes : null;
  const list = notes && Array.isArray(notes.notes)
    ? notes.notes
    : fallbackNoteSections(pour && pour.tastingNotes);

  const summary = notes && notes.summary ? notes.summary : 'Tasting notes';
  if (!list.length) return '';

  return `
    <div class="bottle-note-block">
      <p class="bottle-note-summary">${escHTML(summary)}</p>
      <ul class="bottle-note-list">
        ${list.map((item) => `
          <li class="bottle-note-item">
            <span class="bottle-note-label">${escHTML(item.label || 'Note')}</span>
            <span class="bottle-note-text">${escHTML(item.text || '')}</span>
          </li>
        `).join('')}
      </ul>
    </div>
  `;
}

function generateFlightsPage(location, flights) {
  const spiritListUrl = `https://app.dramanddraught.com/admin/spirits/locations?locationId=${encodeURIComponent(location.bartenderLocationId || location.id)}`;

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta name="theme-color" content="#0f1012">
      <title>Spirit Flights - Dram & Draught ${escHTML(location.name)}</title>
      <style>
        ${vintageThemeCss()}
        ${brandMarkCss()}
        .header {
          text-align: center;
          padding: 30px 24px 24px;
          max-width: 900px;
          margin: 0 auto;
          position: relative;
          overflow: hidden;
          background:
            linear-gradient(180deg, rgba(24,25,28,0.96), rgba(7,7,8,0.98)),
            radial-gradient(circle at 30% 0%, rgba(255,255,255,0.08), transparent 40%);
          border: 1px solid var(--line);
          border-top: 0;
          border-radius: 0 0 28px 28px;
          box-shadow: 0 22px 58px var(--shadow), inset 0 0 0 1px rgba(255,255,255,0.04);
        }
        .header h1 {
          font-size: 1.5rem;
          font-weight: 800;
          color: var(--cream);
          margin: 0 0 4px;
        }
        .header .subtitle {
          color: var(--muted);
          font-size: 0.88rem;
        }
        .container {
          max-width: 900px;
          margin: 0 auto;
          padding: 16px 14px 30px;
        }
        .section {
          margin-bottom: 20px;
        }
        .flight-card {
          background: linear-gradient(180deg, rgba(20, 21, 24, 0.95), rgba(9, 9, 10, 0.98));
          border: 1px solid var(--line);
          border-radius: 16px;
          padding: 18px 18px 16px;
          margin-bottom: 16px;
          box-shadow: 0 10px 24px rgba(0,0,0,0.24), inset 0 0 0 1px rgba(255,255,255,0.03);
        }
        .flight-theme { font-size: 1.17rem; font-weight: 800; color: var(--cream); margin-bottom: 4px; }
        .flight-desc { color: var(--muted); font-size: 0.88rem; margin-bottom: 8px; }
        .flight-price-wrap { margin-bottom: 16px; }
        .flight-price {
          display: inline-block;
          background: linear-gradient(180deg, var(--accent-light), var(--gold) 64%, var(--amber));
          color: var(--ink);
          font-weight: 800;
          padding: 4px 14px;
          border-radius: 8px;
          font-size: 0.95rem;
        }
        .friday-discount-label {
          display: inline-block;
          color: var(--gold);
          font-size: 0.75rem;
          font-weight: 600;
          margin-left: 8px;
          vertical-align: middle;
        }
        .pours { display: flex; flex-direction: column; gap: 10px; }
        .pour {
          display: flex;
          gap: 12px;
          align-items: flex-start;
          background: rgba(255,255,255,0.05);
          border-radius: 8px;
          padding: 12px 12px 12px 14px;
          border: 1px solid rgba(255,255,255,0.08);
        }
        .pour-number {
          width: 26px;
          height: 26px;
          background: linear-gradient(180deg, var(--accent-light), var(--gold) 64%, var(--amber));
          color: var(--ink);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 800;
          font-size: 0.81rem;
          flex-shrink: 0;
        }
        .pour-info { flex: 1; min-width: 0; }
        .pour-name { font-weight: 700; color: var(--cream); }
        .pour-origin { color: var(--gold); font-size: 0.82rem; }
        .pour .bottle-note-block {
          margin-top: 8px;
          padding-top: 8px;
          border-top: 1px solid rgba(245,232,204,0.08);
        }
        .pour .bottle-note-summary { font-size: 0.74rem; margin-bottom: 5px; }
        .pour .bottle-note-item { font-size: 0.76rem; gap: 7px; }
        .pour .bottle-note-label { min-width: 54px; }
        .pour-size { color: #8d9299; font-size: 0.75rem; margin-top: 2px; }
        .flight-detail { display: none; }
        .flight-detail.flight-open { display: block; }
        .flight-expand-btn {
          background: none;
          border: 1px solid rgba(245,232,204,0.18);
          color: var(--gold);
          font-size: 0.78rem;
          font-weight: 600;
          padding: 6px 14px;
          border-radius: 8px;
          cursor: pointer;
          margin-top: 10px;
          letter-spacing: 0.02em;
          width: 100%;
        }
        .flight-expand-btn:hover { background: rgba(245,232,204,0.08); }
        .flight-pour-names {
          color: var(--muted);
          font-size: 0.82rem;
          margin-top: 6px;
          line-height: 1.5;
        }
        .bottle-note-block { margin-top: 10px; }
        .bottle-note-summary { font-size: 0.78rem; font-style: italic; color: var(--muted); margin-bottom: 6px; }
        .bottle-note-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 4px; }
        .bottle-note-item { display: flex; gap: 8px; font-size: 0.8rem; color: #c4c8ce; }
        .bottle-note-label { font-weight: 700; color: var(--gold); min-width: 60px; flex-shrink: 0; text-transform: uppercase; font-size: 0.7rem; letter-spacing: 0.04em; }
        .bottle-note-text { flex: 1; }
        .empty-state {
          text-align: center;
          padding: 40px 20px;
          color: var(--muted);
          font-size: 0.95rem;
        }
        .spirit-cta {
          display: block;
          text-align: center;
          margin: 20px auto;
          color: var(--gold);
          font-size: 0.88rem;
          text-decoration: none;
          font-weight: 600;
        }
        .spirit-cta:hover { text-decoration: underline; }
        .footer {
          text-align: center;
          padding: 24px 0 10px;
        }
        .back-link {
          color: var(--muted);
          text-decoration: none;
          font-size: 0.85rem;
        }
        .back-link:hover { color: var(--cream); }
      </style>
    </head>
    <body>
      <div class="header">
        ${renderBrandMark()}
        <h1>Spirit Flights</h1>
        <p class="subtitle">Curated tasting flights &mdash; ${escHTML(location.name)}</p>
      </div>

      <div class="container">
        ${flights.length > 0 ? flights.map((flight, fi) => {
          const sortedPours = (flight.pours || []).sort((a, b) => a.displayOrder - b.displayOrder);
          const pourNames = sortedPours.map((p) => escHTML(p.spiritName)).join(' &bull; ');
          const detailId = `flight-detail-${fi}`;
          return `
          <div class="section">
            <div class="flight-card">
              <div class="flight-theme">${escHTML(flight.theme)}</div>
              ${flight.description ? `<div class="flight-desc">${escHTML(flight.description)}</div>` : ''}
              ${flight.priceLabel ? `
                <div class="flight-price-wrap">
                  <div class="flight-price">${escHTML(flight.priceLabel)}</div>
                  ${flight.fridayPriceLabel ? '<span class="friday-discount-label">Friday flight discount!</span>' : ''}
                </div>
              ` : ''}
              <div class="flight-pour-names">${pourNames}</div>
              <div class="flight-detail" id="${detailId}">
                <div class="pours">
                  ${sortedPours.map((p, i) => `
                    <div class="pour">
                      <div class="pour-number">${i + 1}</div>
                      <div class="pour-info">
                        <div class="pour-name">${escHTML(p.spiritName)}</div>
                        ${p.description ? `<div class="pour-origin">${escHTML(p.description)}</div>` : ''}
                        ${renderTastingNotes(p)}
                        ${p.pourSize ? `<div class="pour-size">${escHTML(p.pourSize)}</div>` : ''}
                      </div>
                    </div>
                  `).join('')}
                </div>
              </div>
              <button class="flight-expand-btn" onclick="var el=document.getElementById('${detailId}');var open=el.classList.toggle('flight-open');this.textContent=open?'Hide tasting notes':'See tasting notes';">See tasting notes</button>
            </div>
          </div>
        `}).join('') : `
          <div class="empty-state">
            <p>No featured flights right now. Check back soon!</p>
          </div>
        `}

        <a href="${spiritListUrl}" class="spirit-cta" target="_blank">Browse Our Full Spirit List &rarr;</a>

        <div class="footer">
          <a href="/${escHTML(location.slug)}" class="back-link">&larr; Back to ${escHTML(location.name)}</a>
        </div>
      </div>
    </body>
    </html>
  `;
}

module.exports = { generateFlightsPage };
