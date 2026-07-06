const { escHTML } = require('./escapeHtml');
const { renderTvModule, renderTvModuleSlides, renderTvRailModule, moduleTitle, isModuleVisibleNow, TV_POLL_SECONDS } = require('./tvModules');

// Resolve a board's modules into a persistent (pinned) module + the rotating
// slide deck. Shared by the full page render and the JSON refresh endpoint so
// both stay in lockstep. Modules outside their schedule window (dayparting)
// are dropped here, so the poll picks up schedule flips automatically — except
// in the admin editor preview (ignoreSchedule), which must show every module
// so a Friday-night slide can still be QA'd on a Tuesday afternoon.
function buildBoardView(location, board, data, opts = {}) {
  const mods = (Array.isArray(board.modules) ? board.modules : [])
    .filter((m) => m && m.type)
    .filter((m) => opts.ignoreSchedule || isModuleVisibleNow(m));
  const pinned = mods.find((m) => m && m.pinned) || null;
  let rotating = mods.filter((m) => m !== pinned);
  // If everything is pinned (or there's nothing left to rotate), let the deck
  // fall back to all modules so the stage is never blank.
  if (rotating.length === 0) rotating = mods;

  const defaultSeconds = Math.max(4, parseInt(board.rotateSeconds, 10) || 15);
  // A module can paginate into several slides (a long beer list splits into
  // full-size pages instead of being shrunk to fit one slide).
  const slides = rotating.flatMap((m, i) => {
    const baseId = String(m.id || `m${i}`);
    const seconds = Math.max(4, parseInt(m.seconds, 10) || defaultSeconds);
    return renderTvModuleSlides(m, data).map((part) => ({
      id: part.idSuffix ? `${baseId}_${part.idSuffix}` : baseId,
      title: part.title || moduleTitle(m),
      seconds,
      full: m.type === 'image', // image slides go edge-to-edge (no slide padding)
      html: part.html,
    }));
  });

  const railModuleHtml = pinned ? renderTvRailModule(pinned, data) : '';
  // A pinned beer menu is dense (taps + cans with meta lines), so it gets a
  // wider rail than the default 30% column — otherwise it's the smallest text
  // on the screen despite being the main attraction.
  const railWide = !!pinned && pinned.type === 'draft';
  return { slides, railModuleHtml, pinned: !!pinned, railWide };
}

function tickerHtml(slides) {
  if (!slides.length) return '';
  return `<ol class="tv-ticker">${slides.map((s, i) => `
    <li class="tv-ticker-item${i === 0 ? ' is-active' : ''}" data-id="${escHTML(s.id)}">
      <span class="tv-ticker-dot"></span>${escHTML(s.title)}
    </li>`).join('')}</ol>`;
}

function slidesDomHtml(slides) {
  return slides.map((s, i) => `
    <div class="tv-slide${i === 0 ? ' is-active' : ''}${s.full ? ' tv-slide-full' : ''}" data-id="${escHTML(s.id)}" data-seconds="${s.seconds}" data-title="${escHTML(s.title)}">
      <div class="tv-fit">${s.html}</div>
    </div>`).join('');
}

// Version token the screens reload on. Two parts:
//  - board.updatedAt: changes on every admin save (the screen heartbeat writes
//    lastSeenAt via raw SQL precisely so it does NOT bump updatedAt), and
//  - a hash of this file: changes when a deploy alters the TV page's own
//    CSS/markup/script, so styling fixes reach screens without re-saving
//    every board or touching a TV.
const PAGE_CODE_VERSION = (() => {
  try {
    return require('crypto').createHash('sha1').update(require('fs').readFileSync(__filename)).digest('hex').slice(0, 10);
  } catch { return '0'; }
})();

function boardVersion(board) {
  const saved = board.updatedAt ? new Date(board.updatedAt).toISOString() : '';
  return `${saved}|${PAGE_CODE_VERSION}`;
}

// JSON payload for the periodic client refresh.
function renderBoardPayload(location, board, data) {
  const view = buildBoardView(location, board, data);
  return {
    ok: true,
    version: boardVersion(board),
    railHtml: view.railModuleHtml,
    pinned: view.pinned,
    railWide: view.railWide,
    slides: view.slides.map((s) => ({ id: s.id, title: s.title, seconds: s.seconds, full: !!s.full, html: s.html })),
    ticker: view.slides.map((s) => ({ id: s.id, title: s.title })),
    refreshedAt: new Date().toISOString(),
  };
}

function generateTvBoardPage(location, board, data, opts = {}) {
  const view = buildBoardView(location, board, data, { ignoreSchedule: !!opts.preview });
  const locName = escHTML(location.name || 'Dram & Draught');
  const boardName = escHTML(board.name || 'Menu Board');
  const portrait = !!opts.portrait;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex">
  <title>${locName} · ${boardName} — TV</title>
  <style>
    @font-face {
      font-family: 'Mostra One';
      font-style: normal; font-weight: 400; font-display: swap;
      src: url('/assets/fonts/MostraOne-Regular.ttf') format('truetype');
    }
    @font-face {
      font-family: 'Mostra One';
      font-style: normal; font-weight: 700; font-display: swap;
      src: url('/assets/fonts/MostraOne-Bold.ttf') format('truetype');
    }
    :root {
      --gold: #d2aa67;
      --gold-bright: #f0d49a;
      --amber: #8a5635;
      --cream: #ffffff;
      --ink: #0a0a0b;
      --text: #f3f1ee;
      --muted: #a7a3a0;
      --line: rgba(255,255,255,0.10);
      --display: 'Mostra One', 'Futura', 'Avenir Next', 'Helvetica Neue', sans-serif;
      --body: "Iowan Old Style", "Palatino Linotype", Georgia, serif;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { height: 100%; }
    body {
      font-family: var(--body);
      color: var(--text);
      background:
        radial-gradient(1200px 600px at 12% -6%, rgba(210,170,103,0.12), transparent 60%),
        radial-gradient(1000px 520px at 100% 110%, rgba(111,118,127,0.14), transparent 60%),
        linear-gradient(180deg, #191a1d 0%, #0d0e10 42%, #040404 100%);
      overflow: hidden;
    }
    body::before {
      content: ''; position: fixed; inset: 0; z-index: 0; pointer-events: none;
      background:
        repeating-linear-gradient(90deg, rgba(255,255,255,0.018), rgba(255,255,255,0.018) 1px, transparent 1px, transparent 7px),
        repeating-linear-gradient(0deg, rgba(0,0,0,0.05), rgba(0,0,0,0.05) 1px, transparent 1px, transparent 9px);
      opacity: 0.5; mix-blend-mode: soft-light;
    }
    .tv-screen {
      position: relative; z-index: 1;
      height: 100vh; width: 100vw;
      display: flex; flex-direction: column;
      gap: clamp(12px, 1.6vh, 24px);
      padding: clamp(16px, 2vh, 34px);
    }
    /* Full-width top bar: logo on the left, time + date on the right. */
    .tv-topbar {
      flex: 0 0 auto;
      display: flex; align-items: center; justify-content: space-between;
      gap: 20px; padding: 0 clamp(4px, 0.6vw, 14px);
    }
    .tv-topbar-meta { text-align: right; line-height: 1; }
    .tv-body {
      flex: 1 1 auto; min-height: 0;
      display: grid; grid-template-columns: 30% 1fr;
      gap: clamp(16px, 2vw, 34px);
    }
    /* Balanced split (the layout Cary chose): the pinned beer menu holds a
       wide permanent panel while the rotating stage keeps enough width for
       specials/picks/events to render without squeezing. */
    .tv-body.tv-rail-wide { grid-template-columns: 46% 1fr; }
    .tv-body-norail { display: block; }
    .tv-body-norail .tv-stage { height: 100%; }
    /* The rail element is always in the DOM (a scheduled pinned module may
       appear mid-day via the JSON poll); it's hidden whenever it's empty. */
    .tv-body-norail .tv-rail { display: none; }
    /* ── Persistent rail (holds the pinned module) ── */
    .tv-rail {
      display: flex; flex-direction: column;
      border: 1px solid var(--line);
      border-radius: 22px;
      background: linear-gradient(180deg, rgba(22,23,26,0.86), rgba(8,8,9,0.92));
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.05);
      padding: clamp(16px, 1.8vw, 30px);
      overflow: hidden;
    }
    .tv-logo { display: block; max-height: clamp(40px, 7vh, 84px); max-width: clamp(150px, 22vw, 340px); object-fit: contain; object-position: left center; }
    .tv-clock {
      font-family: var(--display);
      font-size: clamp(1.7rem, 2.9vw, 3.2rem);
      line-height: 1; color: var(--cream);
      letter-spacing: 0.01em;
    }
    .tv-clock .ampm { font-size: 0.4em; color: var(--gold); margin-left: 0.2em; }
    .tv-date {
      color: var(--muted);
      font-size: clamp(0.72rem, 0.95vw, 1.05rem);
      margin-top: 4px; text-transform: uppercase; letter-spacing: 0.12em;
    }
    .tv-rail-modules { position: relative; min-height: 0; overflow: hidden; flex: 1 1 auto; }
    .tv-rail-modules > .tv-fit { position: absolute; inset: 0; padding: 0; }
    .tv-rail-modules .tv-mod-title { font-size: clamp(1.3rem, 2.2vw, 2.4rem); }
    /* Section toggle: a compact, centered strip along the very bottom. */
    .tv-foot { flex: 0 0 auto; padding-top: clamp(4px,0.8vh,10px); }
    .tv-ticker { list-style: none; display: flex; flex-direction: row; flex-wrap: wrap; gap: 6px 16px; justify-content: center; }
    .tv-ticker-item {
      display: flex; align-items: center; gap: 6px;
      font-family: var(--display);
      text-transform: uppercase; letter-spacing: 0.05em;
      font-size: clamp(0.58rem, 0.82vw, 0.9rem);
      color: var(--muted);
      transition: color 0.3s;
    }
    .tv-ticker-dot {
      width: 7px; height: 7px; border-radius: 50%;
      background: rgba(255,255,255,0.18); flex: 0 0 auto; transition: background 0.3s, box-shadow 0.3s;
    }
    .tv-ticker-item.is-active { color: var(--gold-bright); }
    .tv-ticker-item.is-active .tv-ticker-dot { background: var(--gold); box-shadow: 0 0 12px rgba(210,170,103,0.8); }
    /* ── Rotating stage ── */
    .tv-stage {
      position: relative;
      border: 1px solid var(--line);
      border-radius: 22px;
      background: linear-gradient(180deg, rgba(20,21,24,0.7), rgba(9,9,10,0.82));
      overflow: hidden;
    }
    .tv-progress {
      position: absolute; top: 0; left: 0; height: 4px; width: 0%;
      background: linear-gradient(90deg, var(--amber), var(--gold), var(--gold-bright));
      z-index: 5; box-shadow: 0 0 14px rgba(210,170,103,0.5);
    }
    .tv-slides { position: absolute; inset: 0; }
    .tv-slide {
      position: absolute; inset: 0;
      opacity: 0;
      transition: opacity 0.6s ease;
      pointer-events: none;
      overflow: hidden;
    }
    .tv-slide.is-active { opacity: 1; }
    /* Content wrapper that gets scaled down to always fit its box (no clipping). */
    .tv-fit {
      position: absolute; inset: 0;
      display: flex; flex-direction: column;
      padding: clamp(28px, 4vh, 64px) clamp(28px, 3.4vw, 70px);
      /* Content is top-aligned, so when it's scaled down to fit we anchor the
         scale to the top — a center origin leaves a gap up top and still clips
         the overflowing bottom (e.g. a long draught + cans list in the rail). */
      transform-origin: top center;
      will-change: transform;
    }
    /* Image / promo slides fill edge-to-edge (not scaled). */
    .tv-slide-full > .tv-fit { padding: 0; }
    .tv-image { flex: 1; background-position: center; background-repeat: no-repeat; }
    .tv-image-contain { background-size: contain; }
    .tv-image-cover { background-size: cover; }
    .tv-image-caption {
      position: absolute; left: 0; right: 0; bottom: 0;
      padding: clamp(16px,3vh,40px) clamp(24px,3vw,56px);
      font-family: var(--display); color: var(--cream);
      font-size: clamp(1.4rem, 2.6vw, 3rem); line-height: 1.1;
      background: linear-gradient(0deg, rgba(0,0,0,0.78), transparent);
    }
    /* ── Module content ── */
    .tv-mod-head { margin-bottom: clamp(14px, 2.2vh, 30px); }
    .tv-kicker {
      display: block; color: var(--gold);
      font-family: var(--display);
      text-transform: uppercase; letter-spacing: 0.2em;
      font-size: clamp(0.8rem, 1vw, 1.15rem);
      margin-bottom: 8px;
    }
    .tv-mod-title {
      font-family: var(--display);
      color: var(--cream);
      font-size: clamp(2rem, 3.6vw, 4rem);
      line-height: 1.02; letter-spacing: 0.01em;
    }
    .tv-mod-sub { color: var(--muted); font-size: clamp(1rem,1.4vw,1.6rem); margin-bottom: 12px; }
    /* Sub-section divider inside a module (e.g. "Cans & Bottles" under taps). */
    .tv-subhead {
      color: var(--gold); font-family: var(--display);
      text-transform: uppercase; letter-spacing: 0.14em;
      font-size: clamp(0.9rem, 1.2vw, 1.35rem);
      margin: clamp(14px,2vh,26px) 0 clamp(8px,1.2vh,14px);
      padding-top: clamp(8px,1.2vh,14px);
      border-top: 1px solid var(--line);
    }
    .tv-empty { color: var(--muted); font-size: clamp(1.2rem,1.8vw,2rem); margin: auto 0; }
    .tv-list { list-style: none; display: flex; flex-direction: column; gap: clamp(8px,1.4vh,18px); }
    .tv-list-2col {
      display: grid; grid-template-columns: 1fr 1fr;
      gap: clamp(8px,1.2vh,16px) clamp(28px,3vw,60px);
    }
    .tv-item {
      display: flex; align-items: baseline; justify-content: space-between;
      gap: 18px; border-bottom: 1px solid rgba(255,255,255,0.07); padding-bottom: clamp(6px,1vh,12px);
    }
    .tv-item-main { min-width: 0; }
    .tv-item-name {
      display: block; color: var(--cream); font-weight: 700;
      font-size: clamp(1.35rem, 2.1vw, 2.4rem); line-height: 1.12;
    }
    .tv-item-note {
      display: block; color: #bdb8b3;
      font-size: clamp(1.05rem, 1.3vw, 1.5rem); margin-top: 3px; line-height: 1.25;
    }
    .tv-item-price {
      color: var(--gold); font-weight: 800; white-space: nowrap;
      font-size: clamp(1.35rem, 2.1vw, 2.4rem); font-family: var(--display);
      flex: 0 0 auto;
    }
    /* In the narrow rail, force single-column lists so the price always has
       full row width and never clips against the edge. */
    .tv-rail-modules .tv-list-2col { grid-template-columns: 1fr; gap: clamp(6px,1vh,12px); }
    .tv-rail-modules .tv-item { gap: 12px; }
    .tv-rail-modules .tv-item-name { font-size: clamp(1.1rem, 2vw, 2.3rem); }
    .tv-rail-modules .tv-item-price { font-size: clamp(1.1rem, 2vw, 2.3rem); }
    .tv-rail-modules .tv-item-note { font-size: clamp(0.9rem, 1.3vw, 1.5rem); }
    .tv-rail-modules .tv-subhead { font-size: clamp(1rem, 1.5vw, 1.7rem); }
    /* ── Beer menu (taproom-board table) ──
       One line per beer: bold name, muted style info, price on a shared right
       edge. Sections flow as one aligned list under small gold labels — no
       competing giant headers, no ragged columns, no dead space. */
    /* margin:auto centers vertically when the list is short, but unlike
       justify-content:center it never clips the top when content overflows
       (and scrollHeight stays honest so the fit-scaler can do its job). */
    .tv-beer-menu { display: flex; flex-direction: column; margin: auto 0; gap: clamp(18px, 3vh, 40px); }
    .tv-beer-label {
      color: var(--gold); font-family: var(--display);
      text-transform: uppercase; letter-spacing: 0.18em;
      font-size: clamp(0.85rem, 1.25vw, 1.45rem);
      margin-bottom: clamp(8px, 1.4vh, 18px);
    }
    .tv-beer-list { list-style: none; display: flex; flex-direction: column; }
    .tv-beer-row {
      display: grid; grid-template-columns: auto minmax(0, 1fr) auto;
      align-items: baseline; gap: clamp(10px, 1.2vw, 24px);
      padding: clamp(7px, 1.15vh, 15px) 0;
      border-bottom: 1px solid rgba(255,255,255,0.06);
    }
    .tv-beer-list > .tv-beer-row:last-child { border-bottom: 0; }
    .tv-beer-name {
      color: var(--cream); font-weight: 700; white-space: nowrap;
      font-size: clamp(1.15rem, 1.9vw, 2.2rem); line-height: 1.1;
    }
    .tv-beer-meta {
      color: #b3aeaa; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      font-size: clamp(0.85rem, 1.2vw, 1.4rem);
    }
    .tv-beer-price {
      color: var(--gold); font-weight: 800; font-family: var(--display);
      font-size: clamp(1.15rem, 1.9vw, 2.2rem); white-space: nowrap; text-align: right;
    }
    /* Full-screen beer slides: same table at a bigger scale, sections side
       by side (there's width to spare on a full slide). */
    .tv-slides .tv-beer-menu.tv-beer-cols-2 { display: grid; grid-template-columns: 1.15fr 1fr; gap: 0 clamp(40px, 4vw, 90px); align-items: start; }
    .tv-slides .tv-beer-label { font-size: clamp(1rem, 1.6vw, 1.9rem); }
    .tv-slides .tv-beer-name, .tv-slides .tv-beer-price { font-size: clamp(1.4rem, 2.5vw, 3rem); }
    .tv-slides .tv-beer-meta { font-size: clamp(1rem, 1.5vw, 1.8rem); }
    .tv-slides .tv-beer-row { padding: clamp(10px, 1.8vh, 24px) 0; }
    /* Portrait: the wide short rail band runs the two sections side by side;
       a tall portrait stage stacks them. */
    body.tv-portrait .tv-rail-modules .tv-beer-cols-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0 clamp(24px, 4vw, 56px); align-items: start; }
    body.tv-portrait .tv-slides .tv-beer-menu.tv-beer-cols-2 { grid-template-columns: 1fr; }
    /* events */
    .tv-events { display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: clamp(14px,1.8vw,28px); align-content: start; }
    .tv-event {
      display: flex; flex-direction: column;
      border: 1px solid var(--line); border-radius: 16px; overflow: hidden;
      background: rgba(255,255,255,0.02);
    }
    /* Full-width banner image on top, details below — reads like an event
       poster. The box matches the served rendition's aspect ratio (1000x560)
       so the artwork shows in full instead of being cropped to a strip. */
    .tv-event-img { width: 100%; aspect-ratio: 1000 / 560; flex: 0 0 auto; background-size: cover; background-position: center; }
    .tv-event-body { padding: clamp(14px,1.8vh,24px); }
    .tv-event-when { color: var(--gold); font-family: var(--display); text-transform: uppercase; letter-spacing: 0.08em; font-size: clamp(0.85rem,1.05vw,1.2rem); }
    .tv-event-title { color: var(--cream); font-weight: 700; font-size: clamp(1.2rem,1.7vw,2rem); line-height: 1.1; margin-top: 6px; }
    .tv-event-blurb { color: var(--muted); font-size: clamp(0.9rem,1.1vw,1.25rem); margin-top: 6px; }
    /* Solo event: one event per rotating slide, stacked poster layout — banner
       image on top, then date / title / blurb full-width below. Everything is
       full-width and centered so long titles ("Rooftop Tiki Throwdown") and
       long date ranges can't overflow a narrow column; the stage's
       scale-to-fit handles any vertical overflow. The served image is a
       1000×560 (c_fill) rendition, so a box at that aspect with cover shows
       the whole poster with no crop or letterbox. Works whether the stage is
       narrow (beer rail pinned) or full-width. */
    .tv-event-solo { display: flex; flex: 1 1 auto; min-height: 0; flex-direction: column; align-items: center; justify-content: center; gap: clamp(14px,2.4vh,32px); text-align: center; }
    .tv-event-solo-img {
      flex: 0 1 auto;
      max-height: 54%; max-width: 100%;
      width: auto; height: auto;
      object-fit: contain;
      border-radius: clamp(10px,0.8vw,18px);
      border: 1px solid var(--line);
      box-shadow: 0 22px 58px rgba(0,0,0,0.5);
    }
    .tv-event-solo-body { flex: 0 0 auto; max-width: 100%; }
    .tv-event-solo-when { color: var(--gold); font-family: var(--display); text-transform: uppercase; letter-spacing: 0.06em; font-size: clamp(1.1rem,1.7vw,2rem); }
    .tv-event-solo-title { color: var(--cream); font-family: var(--display); font-weight: 400; font-size: clamp(1.8rem,3.2vw,3.6rem); line-height: 1.06; margin-top: clamp(6px,1vh,14px); overflow-wrap: break-word; }
    .tv-event-solo-blurb { color: var(--muted); font-size: clamp(1rem,1.5vw,1.85rem); margin-top: clamp(8px,1.2vh,16px); line-height: 1.32; max-width: 26ch; margin-left: auto; margin-right: auto; }
    /* break-even featured bottle */
    .tv-be { display: flex; flex-direction: column; gap: clamp(12px,1.8vh,24px); }
    .tv-be-head { display: flex; align-items: flex-start; justify-content: space-between; gap: clamp(16px,2vw,36px); flex-wrap: wrap; }
    .tv-be-name { flex: 1 1 60%; color: var(--cream); font-family: var(--display); font-size: clamp(1.6rem,2.9vw,3.4rem); line-height: 1.08; }
    .tv-be-price { flex: 0 0 auto; text-align: center; border: 1px solid rgba(210,170,103,0.45); border-radius: 16px; padding: clamp(8px,1.2vh,16px) clamp(12px,1.4vw,22px); background: rgba(210,170,103,0.12); }
    .tv-be-price-amt { display: block; color: var(--gold); font-family: var(--display); font-weight: 700; font-size: clamp(2rem,3.6vw,4rem); line-height: 1; }
    .tv-be-price-note { display: block; margin-top: 5px; color: var(--muted); font-size: clamp(0.7rem,0.9vw,1.05rem); letter-spacing: 0.08em; text-transform: uppercase; }
    .tv-be-facts { color: var(--gold); font-size: clamp(0.95rem,1.3vw,1.55rem); letter-spacing: 0.04em; text-transform: uppercase; }
    .tv-be-desc { color: var(--text); font-size: clamp(1.05rem,1.5vw,2rem); line-height: 1.4; }
    .tv-be-tasting { border-left: 3px solid var(--gold); padding: clamp(8px,1.2vh,14px) clamp(12px,1.2vw,18px); background: rgba(255,255,255,0.035); border-radius: 0 12px 12px 0; }
    .tv-be-tasting-label { display: block; color: var(--gold); font-size: clamp(0.72rem,0.9vw,1.1rem); font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; margin-bottom: 4px; }
    .tv-be-tasting span:last-child { color: var(--muted); font-size: clamp(1rem,1.35vw,1.75rem); line-height: 1.38; font-style: italic; }

    /* flights */
    .tv-flights { display: flex; flex-direction: column; gap: clamp(12px,1.6vh,22px); }
    .tv-flight { border: 1px solid var(--line); border-radius: 16px; padding: clamp(14px,1.8vh,24px); background: rgba(255,255,255,0.02); }
    .tv-flight-head { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; }
    .tv-flight-name { font-family: var(--display); color: var(--cream); font-size: clamp(1.3rem,2vw,2.3rem); }
    .tv-flight-desc { color: var(--muted); font-size: clamp(0.95rem,1.2vw,1.4rem); margin-top: 4px; }
    .tv-pours { list-style: none; display: flex; flex-wrap: wrap; gap: 8px 28px; margin-top: 10px; }
    .tv-pour { color: var(--text); font-size: clamp(0.95rem,1.2vw,1.4rem); }
    .tv-pour-name { color: var(--cream); font-weight: 700; }
    .tv-pour-note { color: var(--muted); }
    /* message */
    .tv-message { margin: auto 0; }
    .tv-message-heading { font-family: var(--display); color: var(--gold-bright); font-size: clamp(2.6rem,5.5vw,6rem); line-height: 1.02; }
    .tv-message-body { color: var(--text); font-size: clamp(1.3rem,2.4vw,2.8rem); margin-top: clamp(14px,2vh,28px); line-height: 1.3; }
    /* Portrait / small screens: stack the rail above the stage.
       (.tv-body.tv-rail-wide is repeated so the wide-rail rule can't win the
       cascade and put columns back on a portrait screen.) */
    @media (max-aspect-ratio: 1/1), (max-width: 820px) {
      .tv-body, .tv-body.tv-rail-wide { grid-template-columns: 1fr; grid-template-rows: minmax(0, 0.9fr) 1fr; }
      .tv-clock { font-size: clamp(1.6rem, 7vw, 2.6rem); }
      .tv-list-2col, .tv-events { grid-template-columns: 1fr; }
    }
    /* ── Forced vertical sign (?orientation=portrait) ──
       The pinned module sits as a compact band on top; the rotating stage takes
       the majority of the tall screen. Class-driven so it applies even when a
       physically-rotated panel still reports a landscape viewport. On the narrow
       axis, vw maps to width — so type that scaled with vw is bumped back up for
       legibility from a distance. */
    body.tv-portrait .tv-body {
      grid-template-columns: 1fr;
      /* Explicit band height — the rail's content is absolutely positioned, so an
         auto-sized track would collapse to zero and swallow the pinned module.
         The band gets ~30vh; the rotating stage takes the rest. */
      grid-template-rows: clamp(150px, 30vh, 460px) minmax(0, 1fr);
      gap: clamp(12px, 1.8vh, 26px);
    }
    body.tv-portrait .tv-body-norail { display: flex; flex-direction: column; }
    body.tv-portrait .tv-rail { padding: clamp(14px, 2.4vw, 26px); }
    body.tv-portrait .tv-logo { max-height: clamp(46px, 9vw, 96px); max-width: 60vw; }
    body.tv-portrait .tv-clock { font-size: clamp(1.9rem, 6vw, 3.6rem); }
    body.tv-portrait .tv-date { font-size: clamp(0.8rem, 2.2vw, 1.2rem); }
    /* On the wide, short band the pinned list can run two columns again. */
    body.tv-portrait .tv-rail-modules .tv-list-2col {
      grid-template-columns: 1fr 1fr; gap: clamp(6px,1vh,12px) clamp(20px,4vw,48px);
    }
    /* ...but when the draft sections already sit side by side (taps | cans),
       keep each section's list single-column so the band isn't 4-up. */
    body.tv-portrait .tv-rail-modules .tv-draft-cols-2 .tv-list-2col { grid-template-columns: 1fr; }
    body.tv-portrait .tv-rail-modules .tv-mod-title { font-size: clamp(1.4rem, 3vw, 2.4rem); }
    body.tv-portrait .tv-rail-modules .tv-item-name,
    body.tv-portrait .tv-rail-modules .tv-item-price { font-size: clamp(1.1rem, 2.4vw, 1.8rem); }
    body.tv-portrait .tv-rail-modules .tv-item-note { font-size: clamp(0.85rem, 1.8vw, 1.2rem); }
    /* Single-column content on the narrow stage; scale text up for distance. */
    body.tv-portrait .tv-list-2col, body.tv-portrait .tv-events { grid-template-columns: 1fr; }
    body.tv-portrait .tv-fit { padding: clamp(24px, 3.4vh, 56px) clamp(22px, 4.5vw, 56px); }
    body.tv-portrait .tv-mod-title { font-size: clamp(2.4rem, 6.5vw, 4.6rem); }
    body.tv-portrait .tv-mod-sub { font-size: clamp(1.1rem, 2.4vw, 1.8rem); }
    body.tv-portrait .tv-item-name,
    body.tv-portrait .tv-item-price { font-size: clamp(1.5rem, 3.4vw, 2.6rem); }
    body.tv-portrait .tv-item-note { font-size: clamp(1.05rem, 2.2vw, 1.6rem); }
    body.tv-portrait .tv-flight-name { font-size: clamp(1.6rem, 3.6vw, 2.6rem); }
    body.tv-portrait .tv-message-heading { font-size: clamp(2.8rem, 8vw, 6rem); }
    body.tv-portrait .tv-message-body { font-size: clamp(1.4rem, 3.4vw, 2.8rem); }
    body.tv-portrait .tv-ticker { font-size: clamp(0.7rem, 1.9vw, 1rem); }
  </style>
</head>
<body class="${portrait ? 'tv-portrait' : ''}">
  <div class="tv-screen">
    <header class="tv-topbar">
      <img class="tv-logo" src="${board.logo ? escHTML(board.logo) : '/assets/dram-draught-logo-white.png'}" alt="Dram &amp; Draught" />
      <div class="tv-topbar-meta">
        <div class="tv-clock" id="tv-clock">—</div>
        <div class="tv-date" id="tv-date"></div>
      </div>
    </header>
    <div class="tv-body${view.pinned ? '' : ' tv-body-norail'}${view.railWide ? ' tv-rail-wide' : ''}" id="tv-body">
      <aside class="tv-rail">
        <div class="tv-rail-modules" id="tv-rail-modules">${view.pinned ? `<div class="tv-fit">${view.railModuleHtml}</div>` : ''}</div>
      </aside>
      <main class="tv-stage">
        <div class="tv-progress" id="tv-progress"></div>
        <div class="tv-slides" id="tv-slides">${slidesDomHtml(view.slides)}</div>
      </main>
    </div>
    <footer class="tv-foot">${tickerHtml(view.slides)}</footer>
  </div>
  <script>
  (function() {
    var stage = document.getElementById('tv-slides');
    var progress = document.getElementById('tv-progress');
    var idx = 0, timer = null;
    // Bumped on every admin save; when the poll sees a new value the page
    // hard-reloads so config changes reach the screen without touching the TV.
    var boardVersion = ${JSON.stringify(boardVersion(board))};
    var isPreview = ${opts.preview ? 'true' : 'false'};

    function slides() { return Array.prototype.slice.call(stage.querySelectorAll('.tv-slide')); }

    // Scale a .tv-fit wrapper down until its content fits its box — so a long
    // beer list (or any module) never gets clipped. Image slides fill on their
    // own and are skipped.
    function fitBox(box) {
      if (!box) return;
      var fit = box.querySelector('.tv-fit');
      if (!fit) return;
      if (box.classList.contains('tv-slide-full') || fit.querySelector('.tv-image')) { fit.style.transform = 'none'; return; }
      fit.style.transform = 'none';
      var ch = fit.clientHeight, cw = fit.clientWidth;
      var sh = fit.scrollHeight, sw = fit.scrollWidth;
      if (!ch || !sh) return;
      var scale = Math.min(1, ch / sh, cw / sw);
      fit.style.transform = scale < 0.995 ? 'scale(' + scale.toFixed(4) + ')' : 'none';
    }
    function fitAll() {
      slides().forEach(fitBox);
      fitBox(document.getElementById('tv-rail-modules'));
    }

    function updateTicker() {
      var s = slides();
      var activeId = s[idx] ? s[idx].getAttribute('data-id') : null;
      Array.prototype.forEach.call(document.querySelectorAll('.tv-ticker-item'), function(li) {
        li.classList.toggle('is-active', li.getAttribute('data-id') === activeId);
      });
    }

    function runProgress(seconds) {
      if (!progress) return;
      progress.style.transition = 'none';
      progress.style.width = '0%';
      // Force reflow so the reset takes before we animate.
      void progress.offsetWidth;
      progress.style.transition = 'width ' + seconds + 's linear';
      progress.style.width = '100%';
    }

    function scheduleNext() {
      clearTimeout(timer);
      var s = slides();
      if (s.length <= 1) { if (progress) progress.style.width = '0%'; return; }
      var sec = parseInt(s[idx].getAttribute('data-seconds') || '15', 10);
      if (!(sec > 0)) sec = 15;
      runProgress(sec);
      timer = setTimeout(function() { show(idx + 1); }, sec * 1000);
    }

    function show(i) {
      var s = slides();
      if (!s.length) {
        // Everything scheduled off: stop the rotation cleanly so a mid-slide
        // progress animation doesn't sit frozen over the empty stage.
        clearTimeout(timer);
        if (progress) { progress.style.transition = 'none'; progress.style.width = '0%'; }
        return;
      }
      idx = ((i % s.length) + s.length) % s.length;
      s.forEach(function(el, j) { el.classList.toggle('is-active', j === idx); });
      fitBox(s[idx]);
      updateTicker();
      scheduleNext();
    }

    // Live clock in the rail.
    function tick() {
      var now = new Date();
      var h = now.getHours(), m = now.getMinutes();
      var ampm = h >= 12 ? 'PM' : 'AM';
      h = h % 12; if (h === 0) h = 12;
      var clock = document.getElementById('tv-clock');
      var date = document.getElementById('tv-date');
      if (clock) clock.innerHTML = h + ':' + (m < 10 ? '0' + m : m) + '<span class="ampm">' + ampm + '</span>';
      if (date) {
        date.textContent = now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
      }
    }
    tick();
    setInterval(tick, 15000);

    // Periodic data refresh — pull fresh slide HTML without a jarring reload,
    // and try to keep showing the same module across the swap.
    function refresh() {
      fetch(location.pathname + '?format=json', { cache: 'no-store' })
        .then(function(r) { return r.ok ? r.json() : null; })
        .then(function(data) {
          if (!data || !data.ok || !Array.isArray(data.slides)) return;
          if (data.version && boardVersion && data.version !== boardVersion) {
            location.reload();
            return;
          }
          var cur = slides();
          var curId = cur[idx] ? cur[idx].getAttribute('data-id') : null;
          stage.innerHTML = data.slides.map(function(s) {
            var t = String(s.title || '').replace(/"/g, '&quot;');
            var cls = 'tv-slide' + (s.full ? ' tv-slide-full' : '');
            return '<div class="' + cls + '" data-id="' + s.id + '" data-seconds="' + s.seconds + '" data-title="' + t + '"><div class="tv-fit">' + s.html + '</div></div>';
          }).join('');
          var foot = document.querySelector('.tv-foot');
          if (foot) {
            foot.innerHTML = '<ol class="tv-ticker">' + (data.ticker || []).map(function(s) {
              return '<li class="tv-ticker-item" data-id="' + s.id + '"><span class="tv-ticker-dot"></span>' + String(s.title || '').replace(/</g, '&lt;') + '</li>';
            }).join('') + '</ol>';
          }
          var railMods = document.getElementById('tv-rail-modules');
          if (railMods && typeof data.railHtml === 'string') railMods.innerHTML = data.railHtml ? '<div class="tv-fit">' + data.railHtml + '</div>' : '';
          // A scheduled pinned module may come and go mid-day — toggle the rail.
          var body = document.getElementById('tv-body');
          if (body) {
            body.classList.toggle('tv-body-norail', !data.pinned);
            body.classList.toggle('tv-rail-wide', !!data.railWide);
          }
          var all = slides();
          var start = -1;
          for (var k = 0; k < all.length; k++) { if (all[k].getAttribute('data-id') === curId) { start = k; break; } }
          show(start < 0 ? 0 : start);
          fitAll();
        })
        .catch(function() {});
    }
    // The admin editor preview renders via srcdoc (no real URL to poll).
    if (!isPreview) setInterval(refresh, ${TV_POLL_SECONDS * 1000});

    show(0);
    fitAll();
    // Re-fit after fonts/images settle and whenever the screen size changes.
    setTimeout(fitAll, 400);
    if (document.fonts && document.fonts.ready) { document.fonts.ready.then(fitAll).catch(function(){}); }
    window.addEventListener('load', fitAll);
    var rzTimer = null;
    window.addEventListener('resize', function () { clearTimeout(rzTimer); rzTimer = setTimeout(fitAll, 150); });
  })();
  </script>
</body>
</html>`;
}

module.exports = { generateTvBoardPage, renderBoardPayload, buildBoardView };
