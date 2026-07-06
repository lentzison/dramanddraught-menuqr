const { escHTML } = require('./escapeHtml');

// The module types a TV board can hold. `curated` modules store their own
// content on the board config (typed in the admin builder); the rest pull
// live data per render. Order here is the order shown in the admin picker.
const TV_MODULE_TYPES = [
  { type: 'specials', label: "Today's Specials", desc: "The current day's themed specials + half-price picks.", curated: false },
  { type: 'draft', label: 'On Draught', desc: "What's pouring right now, live from the bartender system.", curated: false },
  { type: 'events', label: 'Upcoming Events', desc: 'The next few events with date & time.', curated: false },
  { type: 'flights', label: 'Featured Flights', desc: 'Current spirit/cocktail flights with pours & price.', curated: false },
  { type: 'bottles', label: 'Featured Bottles', desc: 'Break-even / featured bottles for the week.', curated: false },
  { type: 'picks', label: "Bartender's Picks", desc: 'A curated list you type in (name, note, price).', curated: true },
  { type: 'message', label: 'Announcement', desc: 'A big custom headline + message (e.g. a promo or notice).', curated: true },
  { type: 'image', label: 'Image / Promo', desc: 'A full-screen image (poster, promo graphic, photo) with an optional caption.', curated: true },
];

const TV_MODULE_LABELS = TV_MODULE_TYPES.reduce((acc, m) => { acc[m.type] = m.label; return acc; }, {});

// How often a displaying TV polls ?format=json. The admin list's "screen
// offline" threshold is derived from this (3 missed polls), so keep them
// coupled through this constant.
const TV_POLL_SECONDS = 60;

function isCuratedType(type) {
  const m = TV_MODULE_TYPES.find((t) => t.type === type);
  return !!(m && m.curated);
}

function moduleTitle(mod) {
  const override = String(mod && mod.title ? mod.title : '').trim();
  if (override) return override;
  return TV_MODULE_LABELS[mod && mod.type] || 'Module';
}

// Events are stored as UTC timestamps but the business runs on Eastern wall
// time, and the server runs in UTC — so every date/time shown here is formatted
// in America/New_York. Using getHours()/getDay() would render in the server's
// UTC zone and shift everything 4–5 hours.
const EASTERN_TZ = 'America/New_York';

function easternParts(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: EASTERN_TZ,
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  }).formatToParts(d);
  const get = (t) => { const p = parts.find((x) => x.type === t); return p ? p.value : ''; };
  return {
    weekday: get('weekday'), month: get('month'), day: get('day'),
    hour: get('hour'), minute: get('minute'), ampm: (get('dayPeriod') || '').toUpperCase(),
  };
}

// ── Module scheduling (dayparting) ──
// A module may carry an optional `schedule` object, all fields optional:
//   { days: [0..6], start: "HH:MM", end: "HH:MM", until: "YYYY-MM-DD" }
// Everything is interpreted in Eastern wall time (the business timezone).
// `days` limits which weekdays it shows (0=Sun..6=Sat; empty = every day),
// start/end bound the time of day (start > end wraps past midnight, e.g.
// 21:00–02:00), and `until` is the last Eastern calendar day it shows.
// Boards re-poll every minute, so schedule flips take effect within ~60s.

// Hoisted: Intl.DateTimeFormat construction is expensive and this runs once
// per module on every TV render/poll; formatToParts on a shared instance is cheap.
const EASTERN_NOW_FMT = new Intl.DateTimeFormat('en-US', {
  timeZone: EASTERN_TZ,
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short',
});

function easternNowParts(now) {
  const parts = EASTERN_NOW_FMT.formatToParts(now || new Date());
  const get = (t) => { const p = parts.find((x) => x.type === t); return p ? p.value : ''; };
  const wdMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    dateStr: `${get('year')}-${get('month')}-${get('day')}`,
    weekday: wdMap[get('weekday')],
    // hour12:false can yield "24" for midnight in some ICU versions.
    minutes: (parseInt(get('hour'), 10) % 24) * 60 + parseInt(get('minute'), 10),
  };
}

function parseHHMM(value) {
  const m = String(value || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const mins = parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  return (mins >= 0 && mins < 24 * 60) ? mins : null;
}

function isModuleVisibleNow(mod, now) {
  const sch = mod && mod.schedule;
  if (!sch || typeof sch !== 'object') return true;
  const { dateStr, weekday, minutes } = easternNowParts(now);
  if (sch.until && /^\d{4}-\d{2}-\d{2}$/.test(sch.until) && dateStr > sch.until) return false;
  if (Array.isArray(sch.days) && sch.days.length > 0 && sch.days.length < 7 && !sch.days.includes(weekday)) return false;
  const start = parseHHMM(sch.start);
  const end = parseHHMM(sch.end);
  if (start != null && end != null && start !== end) {
    return start < end ? (minutes >= start && minutes < end) : (minutes >= start || minutes < end);
  }
  if (start != null && end == null) return minutes >= start;
  if (start == null && end != null) return minutes < end;
  return true;
}

function fmtTime(value) {
  const p = easternParts(value);
  if (!p) return '';
  return p.minute === '00' ? `${p.hour} ${p.ampm}` : `${p.hour}:${p.minute} ${p.ampm}`;
}

function fmtEventWhen(start, end) {
  const p = easternParts(start);
  if (!p) return '';
  const datePart = `${p.weekday}, ${p.month} ${p.day}`;
  const startTime = fmtTime(start);
  const endTime = end ? fmtTime(end) : '';
  const timePart = startTime ? (endTime ? `${startTime} – ${endTime}` : startTime) : '';
  return timePart ? `${datePart} · ${timePart}` : datePart;
}

function head(kicker, title) {
  // The gold kicker label was removed — modules show just the title.
  return `<div class="tv-mod-head">
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
  const rows = items.slice(0, 10).map((it) => {
    // Only prepend "$" to bare numeric prices ("10" → "$10") — text like
    // "50% OFF" or "BOGO" passes through untouched.
    const rawPrice = String(it.price || '').trim();
    const price = /^\d+(\.\d+)?$/.test(rawPrice) ? `$${rawPrice}` : rawPrice;
    return priceRow(it.name, it.description || it.note || '', price);
  }).join('');
  return head(kicker, title)
    + (sp.tagline ? `<p class="tv-mod-sub">${escHTML(sp.tagline)}</p>` : '')
    + `<ul class="tv-list">${rows}</ul>`;
}

// ── Beer menu (shared taproom-board table) ──
// The beer menu renders the same way everywhere it appears — pinned rail or
// full-screen slide: one line per beer (bold name, muted brewery/style/ABV,
// price on a shared right edge) under small gold section labels. Context CSS
// only changes the type scale and whether sections sit side by side.

function beerRow(name, meta, price) {
  return `<li class="tv-beer-row">
    <span class="tv-beer-name">${escHTML(name)}</span>
    <span class="tv-beer-meta">${escHTML(meta || '')}</span>
    <span class="tv-beer-price">${price ? escHTML(price) : ''}</span>
  </li>`;
}

function beerMeta(item) {
  return [item.brewery, item.style, item.abv ? `${item.abv}%` : null].filter(Boolean).join(' · ');
}

function beerSection(label, rowsHtml) {
  return `<div class="tv-beer-sec">${label ? `<div class="tv-beer-label">${label}</div>` : ''}<ul class="tv-beer-list">${rowsHtml}</ul></div>`;
}

function draftParts(mod, data) {
  const d = (data && data.draft) || {};
  return {
    taps: (Array.isArray(d.items) ? d.items : []).filter((t) => t && t.beerName),
    cans: (Array.isArray(mod && mod.cans) ? mod.cans : []).filter((c) => c && c.name),
  };
}

function renderDraft(mod, data) {
  const { taps, cans } = draftParts(mod, data);
  if (taps.length === 0 && cans.length === 0) {
    return head('', moduleTitle(mod)) + emptyBody('No taps to show right now.');
  }
  const sections = [];
  if (taps.length) {
    sections.push(beerSection(escHTML(moduleTitle(mod)), taps.slice(0, 12).map((t) => beerRow(t.beerName, beerMeta(t), t.price || '')).join('')));
  }
  if (cans.length) {
    sections.push(beerSection(taps.length ? 'Cans &amp; Bottles' : escHTML(moduleTitle(mod)), cans.slice(0, 20).map((c) => beerRow(c.name, beerMeta(c), c.price || '')).join('')));
  }
  return `<div class="tv-beer-menu${sections.length > 1 ? ' tv-beer-cols-2' : ''}">${sections.join('')}</div>`;
}

// Module render for the persistent rail — same renderers as the slides (the
// beer menu is context-styled by CSS, not re-rendered differently).
function renderTvRailModule(mod, data) {
  return renderTvModule(mod, data);
}

// ── Multi-slide rendering ──
// The stage auto-shrinks slide content to fit, so a full beer program (a
// dozen taps plus a case of cans) squeezed onto one slide ends up unreadably
// small from across the bar. Instead, a draft module paginates: taps and
// cans/bottles become separate full-size slides, chunked when long. Only the
// rotating stage paginates — the pinned rail still uses the compact
// single-render (renderDraft) since nothing rotates there.
const DRAFT_ROWS_PER_SLIDE = 12;

function chunkRows(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function draftSlides(mod, data) {
  const { taps, cans } = draftParts(mod, data);
  const title = moduleTitle(mod);
  // Small programs still read fine combined on one slide.
  if (taps.length + cans.length <= DRAFT_ROWS_PER_SLIDE) {
    return [{ idSuffix: '', title, html: renderDraft(mod, data) }];
  }
  const slides = [];
  chunkRows(taps, DRAFT_ROWS_PER_SLIDE).forEach((group, i, all) => {
    const t = all.length > 1 ? `${title} · ${i + 1} of ${all.length}` : title;
    slides.push({
      idSuffix: i > 0 ? `taps${i + 1}` : '',
      title: t,
      html: `<div class="tv-beer-menu">${beerSection(escHTML(t), group.map((x) => beerRow(x.beerName, beerMeta(x), x.price || '')).join(''))}</div>`,
    });
  });
  chunkRows(cans, DRAFT_ROWS_PER_SLIDE).forEach((group, i, all) => {
    const t = all.length > 1 ? `Cans & Bottles · ${i + 1} of ${all.length}` : 'Cans & Bottles';
    slides.push({
      idSuffix: `cans${i > 0 ? i + 1 : ''}`,
      title: t,
      html: `<div class="tv-beer-menu">${beerSection(escHTML(t), group.map((x) => beerRow(x.name, beerMeta(x), x.price || '')).join(''))}</div>`,
    });
  });
  return slides;
}

// Rotating events: one event per slide (feedback was that a grid of several
// at once is easy to miss — a single big poster per rotation reads across the
// bar). Each slide is a full-stage poster: uncropped artwork with the date,
// title, and blurb below. The pinned rail keeps the compact list (renderEvents)
// since nothing rotates there.
const MAX_EVENT_SLIDES = 6;

function renderEventSolo(ev) {
  const hasImg = !!ev.image;
  const when = fmtEventWhen(ev.startDate, ev.endDate);
  // A real <img> (not a background div) so the poster sizes to its own aspect
  // and scales down to fit — a background div has no intrinsic size and
  // collapses in a flex column. object-fit:contain shows the whole 1000×560
  // rendition with no crop.
  return `<div class="tv-event-solo${hasImg ? ' has-img' : ''}">
    ${hasImg ? `<img class="tv-event-solo-img" src="${escHTML(ev.image)}" alt="${escHTML(ev.title)}" />` : ''}
    <div class="tv-event-solo-body">
      ${when ? `<div class="tv-event-solo-when">${escHTML(when)}</div>` : ''}
      <div class="tv-event-solo-title">${escHTML(ev.title)}</div>
      ${ev.blurb ? `<div class="tv-event-solo-blurb">${escHTML(ev.blurb)}</div>` : ''}
    </div>
  </div>`;
}

function eventSlides(mod, data) {
  const events = Array.isArray(data && data.events) ? data.events : [];
  const title = moduleTitle(mod);
  if (events.length === 0) {
    return [{ idSuffix: '', title, html: head('Coming Up', title) + emptyBody('No upcoming events scheduled.') }];
  }
  return events.slice(0, MAX_EVENT_SLIDES).map((ev, i, all) => ({
    idSuffix: i > 0 ? `ev${i + 1}` : '',
    // The counter tells guests more are coming without cramming them together.
    title: all.length > 1 ? `${title} · ${i + 1} of ${all.length}` : title,
    html: head('Coming Up', title) + renderEventSolo(ev),
  }));
}

// One module → one or more rotating slides. Draft and events paginate;
// everything else stays a single slide.
function renderTvModuleSlides(mod, data) {
  if (mod && mod.type === 'draft') return draftSlides(mod, data);
  if (mod && mod.type === 'events') return eventSlides(mod, data);
  if (mod && mod.type === 'specials') {
    const sp = data && data.specials;
    const hasSpecials = sp && Array.isArray(sp.items) && sp.items.length > 0;
    const hasBottle = data && Array.isArray(data.bottles) && data.bottles.length > 0;
    // When the day has no individual specials but a break-even bottle is
    // featured, the break-even IS the day's special — don't also show an
    // empty "Today's Specials" slide next to it.
    if (!hasSpecials && hasBottle) return [];
  }
  return [{ idSuffix: '', title: moduleTitle(mod), html: renderTvModule(mod, data) }];
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
  // Break-even is almost always a single bottle — give it a featured slide
  // with the price, quick facts, and the catalog description/tasting notes
  // (the same enrichment the specials page uses). Multiple bottles fall back
  // to the compact price list.
  if (bottles.length === 1) {
    const b = bottles[0];
    const facts = [b.region, b.style, b.abv, b.bottleSize].filter(Boolean).join(' · ');
    const price = b.costPerOz || b.bottleCost || '';
    const desc = b.description || b.notes || '';
    const tasting = b.tastingNotes || '';
    return head('Featured', moduleTitle(mod)) + `<div class="tv-be">
      <div class="tv-be-head">
        <div class="tv-be-name">${escHTML(b.name)}</div>
        ${price ? `<div class="tv-be-price"><span class="tv-be-price-amt">${escHTML(price)}</span><span class="tv-be-price-note">our cost — no markup</span></div>` : ''}
      </div>
      ${facts ? `<div class="tv-be-facts">${escHTML(facts)}</div>` : ''}
      ${desc ? `<div class="tv-be-desc">${escHTML(desc)}</div>` : ''}
      ${tasting ? `<div class="tv-be-tasting"><span class="tv-be-tasting-label">Tasting</span><span>${escHTML(tasting)}</span></div>` : ''}
    </div>`;
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
  // Same one-line table language as the beer menu: drink bold, "X's pick"
  // (plus any note) muted on the same line, price on the shared right edge.
  const rows = items.map((it) => beerRow(
    it.name,
    [it.by ? `${it.by}'s pick` : '', it.description || ''].filter(Boolean).join(' · '),
    it.price || '',
  )).join('');
  // Big slide title like the other rotating sections; the table brings only
  // its rows here, not its small gold section label.
  return head("Bartender's", moduleTitle(mod)) + `<div class="tv-beer-menu">${beerSection('', rows)}</div>`;
}

function renderImage(mod) {
  const src = String(mod && mod.image ? mod.image : '').trim();
  if (!src) {
    return head('Image', moduleTitle(mod)) + emptyBody('Upload an image in the board editor.');
  }
  const fit = mod && mod.fit === 'cover' ? 'cover' : 'contain';
  const caption = String(mod && mod.caption ? mod.caption : '').trim();
  return `<div class="tv-image tv-image-${fit}" style="background-image:url('${escHTML(src)}')" role="img" aria-label="${escHTML(caption || moduleTitle(mod))}"></div>
    ${caption ? `<div class="tv-image-caption">${escHTML(caption)}</div>` : ''}`;
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
    case 'image': return renderImage(mod);
    default: return emptyBody('Unknown module.');
  }
}

module.exports = {
  TV_MODULE_TYPES,
  TV_MODULE_LABELS,
  TV_POLL_SECONDS,
  isCuratedType,
  moduleTitle,
  renderTvModule,
  renderTvModuleSlides,
  renderTvRailModule,
  isModuleVisibleNow,
};
