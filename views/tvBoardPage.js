const { escHTML } = require('./escapeHtml');
const { renderTvModule, moduleTitle } = require('./tvModules');

// Resolve a board's modules into a persistent (pinned) module + the rotating
// slide deck. Shared by the full page render and the JSON refresh endpoint so
// both stay in lockstep.
function buildBoardView(location, board, data) {
  const mods = (Array.isArray(board.modules) ? board.modules : []).filter((m) => m && m.type);
  const pinned = mods.find((m) => m && m.pinned) || null;
  let rotating = mods.filter((m) => m !== pinned);
  // If everything is pinned (or there's nothing left to rotate), let the deck
  // fall back to all modules so the stage is never blank.
  if (rotating.length === 0) rotating = mods;

  const defaultSeconds = Math.max(4, parseInt(board.rotateSeconds, 10) || 15);
  const slides = rotating.map((m, i) => ({
    id: String(m.id || `m${i}`),
    title: moduleTitle(m),
    seconds: Math.max(4, parseInt(m.seconds, 10) || defaultSeconds),
    full: m.type === 'image', // image slides go edge-to-edge (no slide padding)
    html: renderTvModule(m, data),
  }));

  const railModuleHtml = pinned ? renderTvModule(pinned, data) : '';
  return { slides, railModuleHtml, pinned: !!pinned };
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

// JSON payload for the periodic client refresh.
function renderBoardPayload(location, board, data) {
  const view = buildBoardView(location, board, data);
  return {
    ok: true,
    railHtml: view.railModuleHtml,
    pinned: view.pinned,
    slides: view.slides.map((s) => ({ id: s.id, title: s.title, seconds: s.seconds, full: !!s.full, html: s.html })),
    ticker: view.slides.map((s) => ({ id: s.id, title: s.title })),
    refreshedAt: new Date().toISOString(),
  };
}

function generateTvBoardPage(location, board, data) {
  const view = buildBoardView(location, board, data);
  const locName = escHTML(location.name || 'Dram & Draught');
  const boardName = escHTML(board.name || 'Menu Board');

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
    .tv-body-norail { display: block; }
    .tv-body-norail .tv-stage { height: 100%; }
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
    .tv-rail-modules .tv-mod-title { font-size: clamp(1.2rem, 1.9vw, 1.9rem); }
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
      transform-origin: center center;
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
      font-size: clamp(1.2rem, 1.9vw, 2.2rem); line-height: 1.12;
    }
    .tv-item-note {
      display: block; color: var(--muted);
      font-size: clamp(0.92rem, 1.15vw, 1.35rem); margin-top: 3px; line-height: 1.25;
    }
    .tv-item-price {
      color: var(--gold); font-weight: 800; white-space: nowrap;
      font-size: clamp(1.2rem, 1.9vw, 2.2rem); font-family: var(--display);
      flex: 0 0 auto;
    }
    /* In the narrow rail, force single-column lists so the price always has
       full row width and never clips against the edge. */
    .tv-rail-modules .tv-list-2col { grid-template-columns: 1fr; gap: clamp(6px,1vh,12px); }
    .tv-rail-modules .tv-item { gap: 12px; }
    .tv-rail-modules .tv-item-name { font-size: clamp(1rem, 1.4vw, 1.5rem); }
    .tv-rail-modules .tv-item-price { font-size: clamp(1rem, 1.4vw, 1.5rem); }
    .tv-rail-modules .tv-item-note { font-size: clamp(0.78rem, 1vw, 1.05rem); }
    /* events */
    .tv-events { display: grid; grid-template-columns: 1fr 1fr; gap: clamp(14px,1.8vw,28px); }
    .tv-event {
      display: flex; gap: 16px; align-items: stretch;
      border: 1px solid var(--line); border-radius: 16px; overflow: hidden;
      background: rgba(255,255,255,0.02); padding: 0;
    }
    .tv-event-img { width: clamp(90px,9vw,150px); flex: 0 0 auto; background-size: cover; background-position: center; }
    .tv-event-body { padding: clamp(14px,1.6vh,22px); display: flex; flex-direction: column; justify-content: center; }
    .tv-event-when { color: var(--gold); font-family: var(--display); text-transform: uppercase; letter-spacing: 0.08em; font-size: clamp(0.85rem,1.05vw,1.2rem); }
    .tv-event-title { color: var(--cream); font-weight: 700; font-size: clamp(1.2rem,1.7vw,2rem); line-height: 1.1; margin-top: 6px; }
    .tv-event-blurb { color: var(--muted); font-size: clamp(0.9rem,1.1vw,1.25rem); margin-top: 6px; }
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
    /* Portrait / small screens: stack the rail above the stage. */
    @media (max-aspect-ratio: 1/1), (max-width: 820px) {
      .tv-body { grid-template-columns: 1fr; grid-template-rows: minmax(0, 0.9fr) 1fr; }
      .tv-clock { font-size: clamp(1.6rem, 7vw, 2.6rem); }
      .tv-list-2col, .tv-events { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <div class="tv-screen">
    <header class="tv-topbar">
      <img class="tv-logo" src="${board.logo ? escHTML(board.logo) : '/assets/dram-draught-logo-white.png'}" alt="Dram &amp; Draught" />
      <div class="tv-topbar-meta">
        <div class="tv-clock" id="tv-clock">—</div>
        <div class="tv-date" id="tv-date"></div>
      </div>
    </header>
    <div class="tv-body${view.pinned ? '' : ' tv-body-norail'}">
      ${view.pinned ? `<aside class="tv-rail">
        <div class="tv-rail-modules" id="tv-rail-modules"><div class="tv-fit">${view.railModuleHtml}</div></div>
      </aside>` : ''}
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
      if (!s.length) return;
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
          var all = slides();
          var start = -1;
          for (var k = 0; k < all.length; k++) { if (all[k].getAttribute('data-id') === curId) { start = k; break; } }
          show(start < 0 ? 0 : start);
          fitAll();
        })
        .catch(function() {});
    }
    setInterval(refresh, 60000);

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
