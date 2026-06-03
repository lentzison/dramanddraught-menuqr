const { escHTML } = require('./escapeHtml');

// The module types a TV board can hold. `curated` modules store their own
// content on the board config (typed in the admin builder); the rest pull
// live data per render. Order here is the order shown in the admin picker.
const TV_MODULE_TYPES = [
  { type: 'specials', label: "Today's Specials", desc: "The current day's themed specials + half-price picks.", curated: false },
  { type: 'draft', label: 'On Draft / Beer', desc: "What's pouring right now, live from the bartender system.", curated: false },
  { type: 'events', label: 'Upcoming Events', desc: 'The next few events with date & time.', curated: false },
  { type: 'flights', label: 'Featured Flights', desc: 'Current spirit/cocktail flights with pours & price.', curated: false },
  { type: 'bottles', label: 'Featured Bottles', desc: 'Break-even / featured bottles for the week.', curated: false },
  { type: 'picks', label: "Bartender's Picks", desc: 'A curated list you type in (name, note, price).', curated: true },
  { type: 'message', label: 'Announcement', desc: 'A big custom headline + message (e.g. a promo or notice).', curated: true },
];

const TV_MODULE_LABELS = TV_MODULE_TYPES.reduce((acc, m) => { acc[m.type] = m.label; return acc; }, {});

function isCuratedType(type) {
  const m = TV_MODULE_TYPES.find((t) => t.type === type);
  return !!(m && m.curated);
}

function moduleTitle(mod) {
  const override = String(mod && mod.title ? mod.title : '').trim();
  if (override) return override;
  return TV_MODULE_LABELS[mod && mod.type] || 'Module';
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function fmtTime(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  let h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  return m === 0 ? `${h} ${ampm}` : `${h}:${String(m).padStart(2, '0')} ${ampm}`;
}

function fmtEventWhen(start, end) {
  if (!start) return '';
  const d = new Date(start);
  if (Number.isNaN(d.getTime())) return '';
  const datePart = `${WEEKDAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
  const startTime = fmtTime(start);
  const endTime = end ? fmtTime(end) : '';
  const timePart = startTime ? (endTime ? `${startTime} – ${endTime}` : startTime) : '';
  return timePart ? `${datePart} · ${timePart}` : datePart;
}

function head(kicker, title) {
  return `<div class="tv-mod-head">
    <span class="tv-kicker">${escHTML(kicker)}</span>
    <h2 class="tv-mod-title">${escHTML(title)}</h2>
  </div>`;
}

function emptyBody(message) {
  return `<div class="tv-empty">${escHTML(message)}</div>`;
}

// Generic "name / note / price" row used by several modules.
function priceRow(name, note, price) {
  return `<li class="tv-item">
    <div class="tv-item-main">
      <span class="tv-item-name">${escHTML(name)}</span>
      ${note ? `<span class="tv-item-note">${escHTML(note)}</span>` : ''}
    </div>
    ${price ? `<span class="tv-item-price">${escHTML(price)}</span>` : ''}
  </li>`;
}

function renderSpecials(mod, data) {
  const sp = (data && data.specials) || {};
  const items = Array.isArray(sp.items) ? sp.items : [];
  const kicker = sp.dayLabel ? `${sp.dayLabel} · Specials` : 'Specials';
  const title = moduleTitle(mod) === "Today's Specials" && sp.themeName ? sp.themeName : moduleTitle(mod);
  if (items.length === 0) {
    return head(kicker, title) + emptyBody('No specials set for today.');
  }
  const rows = items.slice(0, 10).map((it) => priceRow(
    it.name,
    it.description || it.note || '',
    it.price ? (String(it.price).startsWith('$') ? it.price : `$${it.price}`) : '',
  )).join('');
  return head(kicker, title)
    + (sp.tagline ? `<p class="tv-mod-sub">${escHTML(sp.tagline)}</p>` : '')
    + `<ul class="tv-list">${rows}</ul>`;
}

function renderDraft(mod, data) {
  const d = (data && data.draft) || {};
  const items = (Array.isArray(d.items) ? d.items : []).filter((t) => t && t.beerName);
  if (items.length === 0) {
    return head('On Tap', moduleTitle(mod)) + emptyBody('No taps to show right now.');
  }
  const rows = items.slice(0, 12).map((t) => {
    const meta = [t.brewery, t.style, t.abv ? `${t.abv}% ABV` : null].filter(Boolean).join(' · ');
    return priceRow(t.beerName, meta, t.price || '');
  }).join('');
  return head('On Tap', moduleTitle(mod)) + `<ul class="tv-list tv-list-2col">${rows}</ul>`;
}

function renderEvents(mod, data) {
  const events = Array.isArray(data && data.events) ? data.events : [];
  if (events.length === 0) {
    return head('Coming Up', moduleTitle(mod)) + emptyBody('No upcoming events scheduled.');
  }
  const cards = events.slice(0, 4).map((ev) => `
    <div class="tv-event">
      ${ev.image ? `<div class="tv-event-img" style="background-image:url('${escHTML(ev.image)}')"></div>` : ''}
      <div class="tv-event-body">
        <div class="tv-event-when">${escHTML(fmtEventWhen(ev.startDate, ev.endDate))}</div>
        <div class="tv-event-title">${escHTML(ev.title)}</div>
        ${ev.blurb ? `<div class="tv-event-blurb">${escHTML(ev.blurb)}</div>` : ''}
      </div>
    </div>`).join('');
  return head('Coming Up', moduleTitle(mod)) + `<div class="tv-events">${cards}</div>`;
}

function renderFlights(mod, data) {
  const flights = Array.isArray(data && data.flights) ? data.flights : [];
  if (flights.length === 0) {
    return head('Flights', moduleTitle(mod)) + emptyBody('No featured flights right now.');
  }
  const cards = flights.slice(0, 3).map((f) => {
    const pours = (Array.isArray(f.pours) ? f.pours : []).slice(0, 6).map((p) => `
      <li class="tv-pour">
        <span class="tv-pour-name">${escHTML(p.spiritName || '')}</span>
        ${p.tastingNotes ? `<span class="tv-pour-note">${escHTML(p.tastingNotes)}</span>` : ''}
      </li>`).join('');
    return `<div class="tv-flight">
      <div class="tv-flight-head">
        <span class="tv-flight-name">${escHTML(f.theme || 'Flight')}</span>
        ${f.priceLabel ? `<span class="tv-item-price">${escHTML(f.priceLabel)}</span>` : ''}
      </div>
      ${f.description ? `<div class="tv-flight-desc">${escHTML(f.description)}</div>` : ''}
      <ul class="tv-pours">${pours}</ul>
    </div>`;
  }).join('');
  return head('Flights', moduleTitle(mod)) + `<div class="tv-flights">${cards}</div>`;
}

function renderBottles(mod, data) {
  const bottles = Array.isArray(data && data.bottles) ? data.bottles : [];
  if (bottles.length === 0) {
    return head('Featured', moduleTitle(mod)) + emptyBody('No featured bottles this week.');
  }
  const rows = bottles.slice(0, 10).map((b) => {
    const meta = [b.bottleSize, b.notes].filter(Boolean).join(' · ');
    return priceRow(b.name, meta, b.costPerOz || b.bottleCost || '');
  }).join('');
  return head('Featured', moduleTitle(mod)) + `<ul class="tv-list">${rows}</ul>`;
}

function renderPicks(mod) {
  const items = (Array.isArray(mod && mod.items) ? mod.items : []).filter((it) => it && it.name);
  if (items.length === 0) {
    return head("Bartender's", moduleTitle(mod)) + emptyBody('Add some picks in the board editor.');
  }
  const rows = items.slice(0, 10).map((it) => {
    const note = [it.by ? `— ${it.by}` : '', it.description || ''].filter(Boolean).join(' ');
    return priceRow(it.name, note, it.price || '');
  }).join('');
  return head("Bartender's", moduleTitle(mod)) + `<ul class="tv-list">${rows}</ul>`;
}

function renderMessage(mod) {
  const heading = String(mod && mod.heading ? mod.heading : moduleTitle(mod)).trim();
  const body = String(mod && mod.body ? mod.body : '').trim();
  return `<div class="tv-message">
    <div class="tv-message-heading">${escHTML(heading)}</div>
    ${body ? `<div class="tv-message-body">${escHTML(body)}</div>` : ''}
  </div>`;
}

// Render one module's inner slide HTML from its config + the loaded data bundle.
function renderTvModule(mod, data) {
  if (!mod || !mod.type) return emptyBody('Empty module.');
  switch (mod.type) {
    case 'specials': return renderSpecials(mod, data);
    case 'draft': return renderDraft(mod, data);
    case 'events': return renderEvents(mod, data);
    case 'flights': return renderFlights(mod, data);
    case 'bottles': return renderBottles(mod, data);
    case 'picks': return renderPicks(mod);
    case 'message': return renderMessage(mod);
    default: return emptyBody('Unknown module.');
  }
}

module.exports = {
  TV_MODULE_TYPES,
  TV_MODULE_LABELS,
  isCuratedType,
  moduleTitle,
  renderTvModule,
};
