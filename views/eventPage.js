const { vintageThemeCss } = require('./publicTheme');
const { resolveThemeRender, eventThemesCss } = require('./eventThemes');
const { brandMarkCss, renderBrandMark } = require('./brandMark');
const { escHTML } = require('./escapeHtml');
const { mediaRenditionUrl } = require('../helpers');

// Renditions for media-served images (no-op for data/other URLs).
// Hero shows the WHOLE banner (width-capped, no crop) so nothing is cut off;
// the social card needs a fixed aspect, so it uses a focal-point crop.
const HERO_RENDITION = 'w_1600,f_webp,q_88';
const SOCIAL_RENDITION = 'w_1200,h_630,c_fill,g_auto,f_jpg,q_85';

function formatEventDate(value) {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatEventTime(value) {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function isSafeLinkHref(value) {
  return /^(https?:\/\/|mailto:|tel:)/i.test(String(value || '').trim());
}

const EVENT_BASE_URL = process.env.MENUQR_BASE_URL || 'https://menuqr.apps.dramanddraught.com';

// Strip markdown/HTML to plain text for meta descriptions and calendar bodies.
function plainText(value, maxLen = 0) {
  let s = String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // [label](url) -> label
    .replace(/[*_`#>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (maxLen && s.length > maxLen) s = s.slice(0, maxLen - 1).trimEnd() + '…';
  return s;
}

// Format a Date as a UTC iCal/Google timestamp: 20260615T180000Z.
function toCalDate(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return '';
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

// Default a missing end time to start + 2h so calendars get a sensible block.
function eventEndOrDefault(event) {
  if (event.endDate) return new Date(event.endDate);
  const start = new Date(event.startDate);
  return new Date(start.getTime() + 2 * 60 * 60 * 1000);
}

// Escape per RFC 5545 (commas, semicolons, backslashes, newlines).
function icsEscape(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

// Build a downloadable .ics for an event. Stored dates are absolute instants,
// so emitting them in UTC (Z) is correct regardless of venue timezone.
function buildEventIcs(location, event) {
  const url = `${EVENT_BASE_URL}/${location.slug}/events/${event.slug}`;
  const desc = plainText(event.description, 600);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Dram & Draught//Events//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:event-${event.id}@dramanddraught.com`,
    `DTSTAMP:${toCalDate(new Date())}`,
    `DTSTART:${toCalDate(event.startDate)}`,
    `DTEND:${toCalDate(eventEndOrDefault(event))}`,
    `SUMMARY:${icsEscape(event.title)}`,
    desc ? `DESCRIPTION:${icsEscape(desc + '\n\n' + url)}` : `DESCRIPTION:${icsEscape(url)}`,
    `LOCATION:${icsEscape(location.name || '')}`,
    `URL:${icsEscape(url)}`,
    event.isCancelled ? 'STATUS:CANCELLED' : 'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.join('\r\n') + '\r\n';
}

// Google Calendar "add event" template URL.
function googleCalendarUrl(location, event) {
  const url = `${EVENT_BASE_URL}/${location.slug}/events/${event.slug}`;
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title || 'Event',
    dates: `${toCalDate(event.startDate)}/${toCalDate(eventEndOrDefault(event))}`,
    details: (plainText(event.description, 600) + '\n\n' + url).trim(),
    location: location.name || '',
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

// Social/SEO head tags: description, canonical, Open Graph, Twitter, JSON-LD.
function eventMetaTags(location, event) {
  const url = `${EVENT_BASE_URL}/${location.slug}/events/${event.slug}`;
  const desc = plainText(event.description, 160)
    || `${event.title} at Dram & Draught ${location.name}. ${formatEventDate(event.startDate)}.`;
  const title = `${event.title} — Dram & Draught ${location.name}`;
  // Only a hosted (http) image works as a social preview; base64/data URLs don't.
  // Media-hosted images get a 1200×630 social crop; other hosted URLs pass through.
  const img = event.image && /^https?:\/\//i.test(event.image)
    ? mediaRenditionUrl(event.image, SOCIAL_RENDITION)
    : '';
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: event.title,
    startDate: new Date(event.startDate).toISOString(),
    endDate: eventEndOrDefault(event).toISOString(),
    eventStatus: event.isCancelled
      ? 'https://schema.org/EventCancelled'
      : 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    location: { '@type': 'Place', name: `Dram & Draught ${location.name}`, address: location.address || location.name || '' },
    description: desc,
    url,
    ...(img ? { image: [img] } : {}),
    organizer: { '@type': 'Organization', name: 'Dram & Draught', url: EVENT_BASE_URL },
  };
  // JSON-LD is embedded in a <script>; escape '<' to prevent breaking out.
  const ldJson = JSON.stringify(ld).replace(/</g, '\\u003c');
  return `
      <meta name="description" content="${escHTML(desc)}">
      <link rel="canonical" href="${escHTML(url)}">
      <meta property="og:type" content="website">
      <meta property="og:site_name" content="Dram & Draught">
      <meta property="og:title" content="${escHTML(title)}">
      <meta property="og:description" content="${escHTML(desc)}">
      <meta property="og:url" content="${escHTML(url)}">
      ${img ? `<meta property="og:image" content="${escHTML(img)}">` : ''}
      <meta name="twitter:card" content="${img ? 'summary_large_image' : 'summary'}">
      <meta name="twitter:title" content="${escHTML(title)}">
      <meta name="twitter:description" content="${escHTML(desc)}">
      ${img ? `<meta name="twitter:image" content="${escHTML(img)}">` : ''}
      <script type="application/ld+json">${ldJson}</script>`;
}

function renderInlineRichText(value) {
  const input = String(value || '');
  if (!input) return '';
  const linkRegex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+|tel:[^\s)]+)\)|(https?:\/\/[^\s<]+)/gi;
  let out = '';
  let lastIndex = 0;

  function formatPlain(text) {
    return escHTML(text)
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>');
  }

  input.replace(linkRegex, (match, label, explicitUrl, bareUrl, offset) => {
    out += formatPlain(input.slice(lastIndex, offset));
    let href = explicitUrl || bareUrl || '';
    let trailing = '';
    if (bareUrl) {
      const trailingMatch = href.match(/[),.!?;:]+$/);
      if (trailingMatch) {
        trailing = trailingMatch[0];
        href = href.slice(0, -trailing.length);
      }
    }
    if (isSafeLinkHref(href)) {
      const text = label ? formatPlain(label) : escHTML(href);
      out += `<a href="${escHTML(href)}" target="_blank" rel="noopener noreferrer">${text}</a>${escHTML(trailing)}`;
    } else {
      out += formatPlain(match);
    }
    lastIndex = offset + match.length;
    return match;
  });
  out += formatPlain(input.slice(lastIndex));
  return out;
}

function renderRichText(value) {
  const lines = String(value || '').replace(/\r\n/g, '\n').split('\n');
  const chunks = [];
  let para = [];
  let list = [];

  function flushPara() {
    if (!para.length) return;
    chunks.push(`<p>${para.map(line => renderInlineRichText(line)).join('<br/>')}</p>`);
    para = [];
  }

  function flushList() {
    if (!list.length) return;
    chunks.push(`<ul>${list.map(line => `<li>${renderInlineRichText(line)}</li>`).join('')}</ul>`);
    list = [];
  }

  lines.forEach((line) => {
    const bullet = line.match(/^\s*(?:[-*•]\s+)(.+)$/);
    if (!line.trim()) {
      flushPara();
      flushList();
      return;
    }
    if (bullet) {
      flushPara();
      list.push(bullet[1]);
      return;
    }
    flushList();
    para.push(line);
  });
  flushPara();
  flushList();
  return chunks.join('');
}

function eventStatus(event, signupCount, now = new Date()) {
  if (event.isCancelled) return { key: 'cancelled', message: 'This event has been cancelled.' };
  if (!event.isActive) return { key: 'hidden', message: 'This event is not currently available.' };
  // Info-only events have no signup form at all and no status banner.
  if (event.signupsEnabled === false) return { key: 'no-signups' };
  const promoteFrom = event.promoteFrom ? new Date(event.promoteFrom) : null;
  if (promoteFrom && now < promoteFrom) return { key: 'upcoming', message: `Signups open ${formatEventDate(promoteFrom)} at ${formatEventTime(promoteFrom)}.` };
  const promoteUntil = event.promoteUntil ? new Date(event.promoteUntil) : (event.startDate ? new Date(event.startDate) : null);
  if (promoteUntil && now > promoteUntil) return { key: 'closed', message: 'Signups for this event have closed.' };
  if (event.capacity && signupCount >= event.capacity) return { key: 'full', message: 'This event is fully booked.' };
  return { key: 'open' };
}

function renderStatusBanner(status, event) {
  if (status.key === 'hidden') {
    return `<div class="ev-status ev-status-hidden">
      <div class="ev-status-title">Not Currently Available</div>
      <div class="ev-status-msg">${escHTML(status.message)}</div>
    </div>`;
  }
  if (status.key === 'cancelled') {
    return `<div class="ev-status ev-status-cancelled">
      <div class="ev-status-title">Cancelled</div>
      <div class="ev-status-msg">${escHTML(status.message)}</div>
    </div>`;
  }
  if (status.key === 'upcoming') {
    return `<div class="ev-status ev-status-upcoming">
      <div class="ev-status-title">Signups Open Soon</div>
      <div class="ev-status-msg">${escHTML(status.message)}</div>
    </div>`;
  }
  if (status.key === 'closed') {
    return `<div class="ev-status ev-status-closed">
      <div class="ev-status-title">Signups Closed</div>
      <div class="ev-status-msg">${escHTML(status.message)}</div>
    </div>`;
  }
  if (status.key === 'full') {
    return `<div class="ev-status ev-status-closed">
      <div class="ev-status-title">Fully Booked</div>
      <div class="ev-status-msg">${escHTML(status.message)}</div>
    </div>`;
  }
  return '';
}

// Convert a YouTube/Vimeo URL into an embeddable iframe src.
function videoEmbedUrl(url) {
  if (!url) return null;
  const str = String(url).trim();
  // YouTube watch URL
  let m = str.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]{11})/);
  if (m) return `https://www.youtube.com/embed/${m[1]}`;
  // Vimeo
  m = str.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (m) return `https://player.vimeo.com/video/${m[1]}`;
  return null;
}

function isValidImageSrc(src) {
  if (!src) return false;
  return /^data:image\/(jpeg|jpg|png|gif|webp);base64,/i.test(src)
    || /^https?:\/\//i.test(src)
    || /^\/assets\/[a-z0-9\-._\/]+$/i.test(src); // site-relative asset path
}

function bgStyleClass(s) {
  const v = s && s.bgStyle;
  if (v === 'gold') return ' ev-sec-bg-gold';
  if (v === 'dark') return ' ev-sec-bg-dark';
  if (v === 'transparent') return ' ev-sec-bg-transparent';
  return ''; // default — no extra class
}

// Render the thin "top banner" sections (type: 'topbanner') separately from
// the main column. Used for a compact vendor-looking-for-you strip at the
// top of the page. Returns empty string if no top banners exist.
function renderTopBanners(sections) {
  if (!Array.isArray(sections) || sections.length === 0) return '';
  const banners = sections.filter(s => s && s.type === 'topbanner' && s.ackOnly !== true);
  if (banners.length === 0) return '';
  return banners.map(s => `
    <div class="ev-topbanner">
      <div class="ev-topbanner-inner">
        ${s.body ? `<span class="ev-topbanner-text">${escHTML(s.body)}</span>` : ''}
        ${s.buttonHref ? `<a href="${escHTML(s.buttonHref)}" class="ev-topbanner-btn">${escHTML(s.buttonLabel || 'Apply')}</a>` : ''}
      </div>
    </div>
  `).join('');
}

// Render an array of page sections.
// Types: text, image, details, button, video, divider, hero, twocol, schedule, faq, cocktailmenu
//
// Sections with `ackOnly: true` are only included when `options.ackOnly === true`
// (they're reserved for the post-submit terms/acknowledgment page). The default
// public render skips them. `topbanner` sections are always skipped here —
// they render at the top of the page via renderTopBanners().
function renderSections(sections, options = {}) {
  if (!Array.isArray(sections) || sections.length === 0) return '';
  const ackOnly = options.ackOnly === true;
  const filtered = sections.filter(s => {
    if (!s) return false;
    if (s.type === 'topbanner') return false;
    return ackOnly ? s.ackOnly === true : s.ackOnly !== true;
  });
  if (filtered.length === 0) return '';
  return filtered.map(s => {
    const type = s && s.type;

    if (type === 'text') {
      const heading = s.heading ? `<h2 class="ev-sec-heading">${escHTML(s.heading)}</h2>` : '';
      const body = s.body ? renderRichText(s.body) : '';
      const align = (s.align === 'center' || s.align === 'right') ? ` ev-sec-align-${s.align}` : '';
      // Optional stacked images above the heading — used by the art pop-up
      // "ARTISTS WANTED" callout where the two drip-text graphics stack.
      const stack = Array.isArray(s.stackedImages) ? s.stackedImages.filter(isValidImageSrc) : [];
      const stackMarkup = stack.length
        ? `<div class="ev-sec-stack">${stack.map(src => `<img src="${escHTML(src)}" alt="" loading="lazy" />`).join('')}</div>`
        : '';
      return `<section class="ev-sec ev-sec-text${bgStyleClass(s)}${align}">${stackMarkup}${heading}<div class="ev-sec-body">${body}</div></section>`;
    }

    if (type === 'image') {
      if (!isValidImageSrc(s.src)) return '';
      return `<section class="ev-sec ev-sec-image">
        <img src="${escHTML(s.src)}" alt="${escHTML(s.alt || s.caption || '')}" loading="lazy" />
        ${s.caption ? `<div class="ev-sec-caption">${escHTML(s.caption)}</div>` : ''}
      </section>`;
    }

    if (type === 'details') {
      const items = Array.isArray(s.items) ? s.items.filter(it => it && (it.label || it.value)) : [];
      if (items.length === 0 && !s.title) return '';
      return `<section class="ev-sec ev-sec-details${bgStyleClass(s)}">
        ${s.title ? `<div class="ev-sec-details-title">${escHTML(s.title)}</div>` : ''}
        <div class="ev-sec-details-list">
          ${items.map(it => `
            <div class="ev-sec-details-row">
              <div class="ev-sec-details-label">${escHTML(it.label || '')}</div>
              <div class="ev-sec-details-value">${renderInlineRichText(it.value || '')}</div>
            </div>
          `).join('')}
        </div>
      </section>`;
    }

    if (type === 'button') {
      if (!s.url) return '';
      const styleClass = s.style === 'secondary' ? 'ev-sec-btn-secondary' : 'ev-sec-btn-primary';
      // Same-tab navigation for in-page anchors (#apply etc.) — opening a
      // new tab for a hash link is jarring.
      const isAnchor = String(s.url).startsWith('#');
      const attrs = isAnchor ? '' : 'target="_blank" rel="noopener noreferrer"';
      return `<section class="ev-sec ev-sec-button${bgStyleClass(s)}">
        <a href="${escHTML(s.url)}" class="ev-sec-btn ${styleClass}" ${attrs}>${escHTML(s.label || 'Learn More')}</a>
      </section>`;
    }

    if (type === 'video') {
      const embed = videoEmbedUrl(s.url);
      if (!embed) return '';
      return `<section class="ev-sec ev-sec-video${bgStyleClass(s)}">
        <div class="ev-sec-video-frame">
          <iframe src="${escHTML(embed)}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
        </div>
        ${s.caption ? `<div class="ev-sec-caption">${escHTML(s.caption)}</div>` : ''}
      </section>`;
    }

    if (type === 'divider') {
      return `<hr class="ev-sec-divider" />`;
    }

    if (type === 'hero') {
      if (!isValidImageSrc(s.src)) return '';
      return `<section class="ev-sec ev-sec-hero" style="background-image: linear-gradient(180deg, rgba(7,7,8,0.55), rgba(7,7,8,0.85)), url('${escHTML(s.src).replace(/'/g, "\\'")}')">
        <div class="ev-sec-hero-inner">
          ${s.eyebrow ? `<div class="ev-sec-hero-eyebrow">${escHTML(s.eyebrow)}</div>` : ''}
          ${s.title ? `<h1 class="ev-sec-hero-title">${escHTML(s.title)}</h1>` : ''}
          ${s.subtitle ? `<div class="ev-sec-hero-subtitle">${escHTML(s.subtitle)}</div>` : ''}
        </div>
      </section>`;
    }

    if (type === 'twocol') {
      if (!isValidImageSrc(s.src)) return '';
      const heading = s.heading ? `<h2 class="ev-sec-heading">${escHTML(s.heading)}</h2>` : '';
      const body = s.body ? renderRichText(s.body) : '';
      const posClass = s.imagePosition === 'right' ? ' ev-sec-twocol-right' : '';
      return `<section class="ev-sec ev-sec-twocol${bgStyleClass(s)}${posClass}">
        <div class="ev-sec-twocol-image">
          <img src="${escHTML(s.src)}" alt="${escHTML(s.alt || s.heading || '')}" loading="lazy" />
        </div>
        <div class="ev-sec-twocol-text">
          ${heading}
          <div class="ev-sec-body">${body}</div>
        </div>
      </section>`;
    }

    if (type === 'schedule') {
      const items = Array.isArray(s.items) ? s.items.filter(it => it && (it.time || it.title || it.description)) : [];
      if (items.length === 0 && !s.title) return '';
      return `<section class="ev-sec ev-sec-schedule${bgStyleClass(s)}">
        ${s.title ? `<div class="ev-sec-details-title">${escHTML(s.title)}</div>` : ''}
        <div class="ev-sec-schedule-list">
          ${items.map(it => `
            <div class="ev-sec-schedule-row">
              <div class="ev-sec-schedule-time">${escHTML(it.time || '')}</div>
              <div class="ev-sec-schedule-content">
                ${it.title ? `<div class="ev-sec-schedule-title">${escHTML(it.title)}</div>` : ''}
                ${it.description ? `<div class="ev-sec-schedule-desc">${renderInlineRichText(it.description)}</div>` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      </section>`;
    }

    if (type === 'cocktailmenu') {
      const items = Array.isArray(s.items) ? s.items.filter(it => it && it.name) : [];
      if (items.length === 0 && !s.title) return '';
      const rows = items.map(it => {
        const hasMeta = !!(it.abv || it.creator);
        return `
        <div class="cm-row">
          <div class="cm-row-head">
            <div class="cm-row-name">${escHTML(it.name || '')}</div>
            ${hasMeta ? `<div class="cm-row-meta">
              ${it.abv ? `<span class="cm-row-abv">${escHTML(it.abv)}</span>` : ''}
              ${it.creator ? `<span class="cm-row-creator">${escHTML(it.creator)}</span>` : ''}
            </div>` : ''}
          </div>
          ${it.ingredients ? `<div class="cm-row-pour">${escHTML(it.ingredients)}</div>` : ''}
          ${it.vibe ? `<div class="cm-row-vibe">${escHTML(it.vibe)}</div>` : ''}
        </div>
      `;
      }).join('');
      return `<section class="ev-sec ev-sec-cocktails${bgStyleClass(s)}">
        ${s.title ? `<div class="ev-sec-details-title">${escHTML(s.title)}</div>` : ''}
        ${s.subtitle ? `<div class="cm-subtitle">${escHTML(s.subtitle)}</div>` : ''}
        <div class="cm-list">${rows}</div>
      </section>`;
    }

    if (type === 'faq') {
      const items = Array.isArray(s.items) ? s.items.filter(it => it && (it.question || it.answer)) : [];
      if (items.length === 0 && !s.title) return '';
      return `<section class="ev-sec ev-sec-faq${bgStyleClass(s)}">
        ${s.title ? `<div class="ev-sec-details-title">${escHTML(s.title)}</div>` : ''}
        <div class="ev-sec-faq-list">
          ${items.map(it => `
            <details class="ev-sec-faq-item">
              <summary class="ev-sec-faq-question">${escHTML(it.question || '')}</summary>
              <div class="ev-sec-faq-answer">${renderRichText(it.answer || '')}</div>
            </details>
          `).join('')}
        </div>
      </section>`;
    }

    return '';
  }).join('');
}

function renderCustomFields(event, prevValues = {}) {
  const questions = Array.isArray(event.customQuestions) ? event.customQuestions : [];
  if (!questions.length) return '';
  return questions.map(q => {
    const prev = prevValues[q.id] == null ? '' : prevValues[q.id];
    const req = q.required ? ' required' : '';
    const reqMark = q.required ? ' <span style="color:var(--amber)">*</span>' : '';
    if (q.type === 'textarea') {
      return `<label for="cq-${escHTML(q.id)}">${escHTML(q.label)}${reqMark}</label>
        <textarea id="cq-${escHTML(q.id)}" name="cq_${escHTML(q.id)}" rows="3"${req}>${escHTML(prev)}</textarea>`;
    }
    if (q.type === 'number') {
      return `<label for="cq-${escHTML(q.id)}">${escHTML(q.label)}${reqMark}</label>
        <input type="number" id="cq-${escHTML(q.id)}" name="cq_${escHTML(q.id)}" value="${escHTML(prev)}"${req} />`;
    }
    if (q.type === 'yesno') {
      return `<label for="cq-${escHTML(q.id)}">${escHTML(q.label)}${reqMark}</label>
        <select id="cq-${escHTML(q.id)}" name="cq_${escHTML(q.id)}"${req}>
          <option value="">Select...</option>
          <option value="Yes"${prev === 'Yes' ? ' selected' : ''}>Yes</option>
          <option value="No"${prev === 'No' ? ' selected' : ''}>No</option>
        </select>`;
    }
    if (q.type === 'images-multi') {
      // Compact multi-file uploader. The form only shows a small trigger
      // button + summary; the actual drop zone and thumbnail grid live in a
      // shared modal (rendered once near the end of <body>). The hidden
      // field carries a JSON-stringified array of data URLs.
      const max = Number.isFinite(q.max) && q.max > 0 ? q.max : 5;
      let prevArr = [];
      try {
        const parsed = typeof prev === 'string' ? JSON.parse(prev || '[]') : (Array.isArray(prev) ? prev : []);
        if (Array.isArray(parsed)) prevArr = parsed;
      } catch (e) { prevArr = []; }
      const hiddenValue = prevArr.length ? JSON.stringify(prevArr) : '';
      const hintText = q.hint || `Optional, but adding work samples helps us evaluate your application (up to ${max}).`;
      return `<label>${escHTML(q.label)}${reqMark}</label>
        <div class="ev-cq-images-wrap" data-max="${max}" data-target="cq-${escHTML(q.id)}" data-modal-title="${escHTML(q.label)}">
          <button type="button" class="ev-cq-images-open" data-target="cq-${escHTML(q.id)}">
            <span class="ev-cq-images-open-label" id="cq-${escHTML(q.id)}-open-label">+ Add images</span>
            <span class="ev-cq-images-count" id="cq-${escHTML(q.id)}-count">0 / ${max}</span>
          </button>
          <div class="ev-cq-images-summary" id="cq-${escHTML(q.id)}-summary"></div>
          <input type="hidden" id="cq-${escHTML(q.id)}" name="cq_${escHTML(q.id)}" value="${escHTML(hiddenValue)}" />
          <div class="ev-cq-images-hint">${escHTML(hintText)}</div>
        </div>`;
    }
    if (q.type === 'image') {
      // NOTE: never put `required` on the hidden input — HTML5 validation
      // can't show a message on a hidden field and silently blocks submit.
      // Required validation for image questions happens server-side.
      const hasPrev = !!prev && /^(data:image|https?:\/\/)/i.test(prev);
      return `<label for="cq-${escHTML(q.id)}-file">${escHTML(q.label)}${reqMark}</label>
        <div class="ev-cq-image-wrap">
          <input type="file" id="cq-${escHTML(q.id)}-file" class="ev-cq-image-file" data-target="cq-${escHTML(q.id)}" accept="image/jpeg,image/png,image/webp,image/gif" />
          <input type="hidden" id="cq-${escHTML(q.id)}" name="cq_${escHTML(q.id)}" value="${hasPrev ? escHTML(prev) : ''}" />
          <div class="ev-cq-image-hint">Max ~500&#8239;KB. JPG/PNG/WebP.</div>
          <img class="ev-cq-image-preview" id="cq-${escHTML(q.id)}-preview" src="${hasPrev ? escHTML(prev) : ''}" alt="" style="${hasPrev ? '' : 'display:none'}" />
        </div>`;
    }
    return `<label for="cq-${escHTML(q.id)}">${escHTML(q.label)}${reqMark}</label>
      <input type="text" id="cq-${escHTML(q.id)}" name="cq_${escHTML(q.id)}" value="${escHTML(prev)}"${req} />`;
  }).join('');
}

function generateEventPage(location, event, signupCount, options = {}) {
  const { prevValues = {}, errorMessage = '' } = options;
  const status = eventStatus(event, signupCount);
  const canSignup = status.key === 'open';
  const publicPath = `/${location.slug}/events/${event.slug}`;
  const eventsPath = `/${location.slug}/events`;
  // Banner placement: "hero" (default) makes the image a full-bleed header
  // background with the themed title overlaid; "featured" keeps the text hero
  // and shows the image below. Only applies when an image is actually set.
  const imageHero = !!event.image && event.bannerStyle !== 'featured';
  const spotsLeft = event.capacity ? Math.max(event.capacity - signupCount, 0) : null;
  // "X spots left" urgency indicator. Mode is set per-event in the editor:
  //   always → whenever capacity is set; near-full → only once ≥75% full;
  //   hidden → never. Only meaningful while signups are open.
  const fillRatio = event.capacity ? signupCount / event.capacity : 0;
  const spotsMode = event.spotsLeftMode || 'always';
  const showSpotsLeft = canSignup && spotsLeft !== null && spotsLeft > 0 && (
    spotsMode === 'always' || (spotsMode === 'near-full' && fillRatio >= 0.75)
  );
  const spotsLeftHtml = showSpotsLeft
    ? `<div class="ev-spots-left${spotsLeft <= 5 ? ' ev-spots-left-low' : ''}">${spotsLeft === 1 ? 'Only 1 spot left' : `Only ${spotsLeft} spots left`}</div>`
    : '';
  const calendarHtml = (event.startDate && !event.isCancelled) ? `
    <div class="ev-cal-add">
      <span class="ev-cal-add-label">Add to calendar</span>
      <a class="ev-cal-btn" href="${escHTML(googleCalendarUrl(location, event))}" target="_blank" rel="noopener">Google</a>
      <a class="ev-cal-btn" href="${escHTML(publicPath)}.ics">Apple / Outlook (.ics)</a>
    </div>` : '';
  const { effectiveSignupType, isVendor: isVendorFn, isParticipant: isParticipantFn } = require('../eventSignupTypes');
  const signupType = effectiveSignupType(event);
  const isVendor = isVendorFn(event);
  const isParticipant = isParticipantFn(event);
  // themeKey drives the visual look. Resolution (including the historical
  // fallback where vendor events with no themeKey use the spring palette) and
  // the full theme catalog live in views/eventThemes.js.
  const { themeKey, bodyClass, isArt } = resolveThemeRender(event, { isVendor });
  const heroEyebrow = isArt
    ? 'Artists Wanted'
    : isVendor ? 'Vendor Applications'
    : isParticipant ? 'Sign up to take part'
    : 'Presents';
  const sideKicker = isArt
    ? 'Artist Application'
    : isVendor ? 'Vendor Application'
    : isParticipant ? 'Participant Signup'
    : 'Reserve Your Spot';
  const sideTitle = isArt
    ? 'Apply to show your work'
    : isVendor ? 'Apply to be a vendor'
    : isParticipant ? 'Sign up to take part'
    : 'Join this event';
  const sideCopy = isArt
    ? 'Tell us about your work. We send invites to accepted artists as slots open up.'
    : isVendor
      ? 'Tell us about your business below. Our team reviews each application and will reach out once a decision has been made.'
      : isParticipant
        ? 'Tell us about yourself and what you\'re bringing. The team reviews participant signups and will email you when a slot is confirmed.'
        : 'Signups are open now.';
  const submitLabel = isVendor ? 'Submit Application'
    : isParticipant ? 'Submit Signup'
    : 'Sign Up';

  const descriptionHtml = event.description ? renderRichText(event.description) : '';

  // Shared form fields, reused by both the open-signup form and the
  // when-full waitlist form (only one renders at a time, so IDs don't clash).
  const signupFieldsHtml = `
      <label for="ev-name">${isVendor ? 'Contact Name' : isParticipant ? 'Your Name' : 'Name'} <span style="color:var(--amber)">*</span></label>
      <input type="text" id="ev-name" name="name" required value="${escHTML(prevValues.name || '')}" autocomplete="name" />

      ${event.collectEmail ? `
        <label for="ev-email">Email ${event.collectEmail ? '<span style="color:var(--amber)">*</span>' : ''}</label>
        <input type="email" id="ev-email" name="email" ${event.collectEmail ? 'required' : ''} value="${escHTML(prevValues.email || '')}" autocomplete="email" />
      ` : ''}

      ${event.collectPhone ? `
        <label for="ev-phone">Phone</label>
        <input type="tel" id="ev-phone" name="phone" value="${escHTML(prevValues.phone || '')}" autocomplete="tel" />
      ` : ''}

      ${event.collectPartySize ? `
        <label for="ev-party">Party Size</label>
        <input type="number" id="ev-party" name="partySize" min="1" max="50" value="${escHTML(prevValues.partySize || '1')}" />
      ` : ''}

      ${event.collectNotes ? `
        <label for="ev-notes">${isVendor ? 'Anything else we should know?' : isParticipant ? 'Tell us what you\'re bringing' : 'Notes or Special Requests'}</label>
        <textarea id="ev-notes" name="notes" rows="3" placeholder="${isParticipant ? 'Cocktail concept, dish description, performance length, equipment you\'ll bring, etc.' : ''}">${escHTML(prevValues.notes || '')}</textarea>
      ` : ''}

      ${renderCustomFields(event, prevValues)}`;

  const signupForm = canSignup ? `
    <form method="POST" action="${escHTML(publicPath)}/signup" class="ev-form">
      ${errorMessage ? `<div class="ev-error">${escHTML(errorMessage)}</div>` : ''}
      ${signupFieldsHtml}
      <button type="submit" class="ev-submit-btn">${escHTML(submitLabel)}</button>
    </form>
  ` : '';

  // When an event is full we still let people join a waitlist (unless it's a
  // ticket-link event). Posts to the same endpoint with joinWaitlist=1.
  const waitlistEligible = status.key === 'full' && event.signupsEnabled !== false && !!event.capacity;
  const waitlistForm = waitlistEligible ? `
    <form method="POST" action="${escHTML(publicPath)}/signup" class="ev-form">
      <input type="hidden" name="joinWaitlist" value="1" />
      ${errorMessage ? `<div class="ev-error">${escHTML(errorMessage)}</div>` : ''}
      ${signupFieldsHtml}
      <button type="submit" class="ev-submit-btn">Join the waitlist</button>
    </form>
  ` : '';

  const ticketUrl = event.ticketUrl || '';
  const ticketProvider = event.ticketProvider || (ticketUrl ? 'external' : null);
  const ticketCta = ticketUrl ? `
    <a href="${escHTML(ticketUrl)}" target="_blank" rel="noopener noreferrer" class="ev-ticket-cta">
      <span class="ev-ticket-cta-label">Get Tickets</span>
      <span class="ev-ticket-cta-provider">${escHTML(ticketProvider === 'eventbrite' ? 'Eventbrite ↗' : 'External link ↗')}</span>
    </a>
  ` : '';

  // When a ticket URL is set, tickets are the primary CTA and the in-page
  // signup form is hidden — showing both made visitors unsure whether to
  // buy on Eventbrite or fill in the form here.
  const sideCard = ticketUrl ? `
    <aside class="ev-side-card" id="apply">
      ${ticketCta}
      <div class="ev-side-actions">
        <a href="${escHTML(eventsPath)}" class="ev-side-link">Browse all events</a>
        <a href="/${escHTML(location.slug)}" class="ev-side-link ev-side-link-muted">Back to ${escHTML(location.name)}</a>
      </div>
    </aside>
  ` : canSignup ? `
    <aside class="ev-side-card" id="apply">
      <div class="ev-side-kicker">${escHTML(sideKicker)}</div>
      <h2 class="ev-side-title">${escHTML(sideTitle)}</h2>
      <p class="ev-side-copy">${escHTML(sideCopy)}</p>
      ${spotsLeftHtml}
      ${signupForm}
    </aside>
  ` : waitlistEligible ? `
    <aside class="ev-side-card" id="apply">
      <div class="ev-side-kicker">Waitlist</div>
      <h2 class="ev-side-title">This event is full</h2>
      <p class="ev-side-copy">Add your name to the waitlist and we'll email you if a spot opens up.</p>
      ${waitlistForm}
      <div class="ev-side-actions">
        <a href="${escHTML(eventsPath)}" class="ev-side-link ev-side-link-muted">Browse all events</a>
      </div>
    </aside>
  ` : status.key === 'no-signups' ? '' : `
    <aside class="ev-side-card" id="apply">
      ${renderStatusBanner(status, event)}
      <div class="ev-side-actions">
        <a href="${escHTML(eventsPath)}" class="ev-side-link">Browse all events</a>
        <a href="/${escHTML(location.slug)}" class="ev-side-link ev-side-link-muted">Back to ${escHTML(location.name)}</a>
      </div>
    </aside>
  `;

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta name="theme-color" content="#0f1012">
      <title>${escHTML(event.title)} - Dram &amp; Draught ${escHTML(location.name)}</title>
      ${eventMetaTags(location, event)}
      <style>
        ${vintageThemeCss()}
        ${eventThemesCss()}
        ${brandMarkCss()}
        body {
          background:
            radial-gradient(900px 380px at 14% -8%, rgba(255,255,255,0.06), transparent 60%),
            radial-gradient(1080px 540px at 100% 0%, rgba(111,118,127,0.10), transparent 58%),
            radial-gradient(760px 380px at 50% 110%, rgba(210,170,103,0.06), transparent 62%),
            linear-gradient(180deg, var(--bg-a) 0%, #0d0e10 38%, var(--bg-b) 100%);
          color: var(--text);
          min-height: 100vh;
          font-family: "Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, serif;
        }
        /* ─── Spring palette override (vendor events) ───
           Full garden-party theme: the dark vintage base flips to cream + sage +
           peach, existing gold accents become sage green, and we scatter a set
           of inline SVG florals across the background. Everything still routes
           through the existing CSS vars so the rest of the page inherits it
           without touching structural CSS.
           Florals (all inline SVGs as data URIs):
             --f-blossom : 5-petal peach blossom
             --f-daisy   : white daisy with yellow center
             --f-leaf    : sage leaf sprig
             --f-petal   : single pink petal (used for falling animation) */
        body.ev-vendor {
          --gold: #6f9061;            /* deeper sage green for primary accents */
          --amber: #d97a5e;            /* saturated peach for hover/CTA */
          --accent-light: #3a4a32;     /* deep forest green for text on light bg */
          --text: #2a3326;             /* near-black forest for headings */
          --steel: #3f4a38;            /* body copy */
          --muted: #6b7a64;            /* softened muted */
          --smoke: #8a9b83;            /* lightest label text */
          --bg-a: #fbf4e4;             /* warm cream */
          --bg-b: #f1e0c7;             /* peach cream */
          --panel: #ffffff;
          --panel-strong: #fbf4e4;
          --line: rgba(111,144,97,0.22);
          --line-strong: rgba(111,144,97,0.38);
          --shadow: rgba(144,110,80,0.18);

          --f-blossom: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 120'><g transform='translate(60 60)'><g fill='%23f9b5a1'><ellipse rx='18' ry='32' cy='-28'/><ellipse rx='18' ry='32' cy='-28' transform='rotate(72)'/><ellipse rx='18' ry='32' cy='-28' transform='rotate(144)'/><ellipse rx='18' ry='32' cy='-28' transform='rotate(216)'/><ellipse rx='18' ry='32' cy='-28' transform='rotate(288)'/></g><circle r='10' fill='%23f7d154'/></g></svg>");
          --f-daisy: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 120'><g transform='translate(60 60)'><g fill='%23fffdf4'><ellipse rx='12' ry='30' cy='-26'/><ellipse rx='12' ry='30' cy='-26' transform='rotate(45)'/><ellipse rx='12' ry='30' cy='-26' transform='rotate(90)'/><ellipse rx='12' ry='30' cy='-26' transform='rotate(135)'/><ellipse rx='12' ry='30' cy='-26' transform='rotate(180)'/><ellipse rx='12' ry='30' cy='-26' transform='rotate(225)'/><ellipse rx='12' ry='30' cy='-26' transform='rotate(270)'/><ellipse rx='12' ry='30' cy='-26' transform='rotate(315)'/></g><circle r='11' fill='%23f2c94c'/></g></svg>");
          --f-leaf: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 160 100'><path d='M10 60 Q 50 0 150 50 Q 100 90 10 60 Z' fill='%23a3c48d' opacity='0.95'/><path d='M14 60 Q 80 42 146 54' stroke='%236f9061' stroke-width='1.5' fill='none'/></svg>");
          --f-petal: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'><ellipse cx='20' cy='20' rx='14' ry='8' fill='%23f9c1ad' transform='rotate(30 20 20)'/></svg>");

          background:
            var(--f-blossom) -40px -30px / 180px 180px no-repeat,
            var(--f-leaf) right -30px top 180px / 220px 140px no-repeat,
            var(--f-daisy) -20px 60% / 130px 130px no-repeat,
            var(--f-blossom) right -30px bottom 80px / 150px 150px no-repeat,
            var(--f-leaf) 20px bottom -10px / 240px 150px no-repeat,
            radial-gradient(900px 380px at 14% -8%, rgba(249,193,173,0.55), transparent 60%),
            radial-gradient(1080px 540px at 100% 0%, rgba(163,196,141,0.42), transparent 58%),
            radial-gradient(760px 380px at 50% 110%, rgba(247,209,84,0.28), transparent 62%),
            linear-gradient(180deg, var(--bg-a) 0%, #f8ead1 50%, var(--bg-b) 100%);
          background-attachment: fixed, fixed, fixed, fixed, fixed, fixed, fixed, fixed, fixed;
        }
        /* A layer of falling petals over the whole page. Pointer-events: none
           so clicks pass through. Each petal is a positioned pseudo element
           inside a fixed wrapper, animated with 'petalfall'. */
        .spring-petals {
          position: fixed;
          inset: 0;
          pointer-events: none;
          overflow: hidden;
          z-index: 1;
        }
        .spring-petals span {
          position: absolute;
          top: -60px;
          width: 24px;
          height: 24px;
          background: var(--f-petal) center/contain no-repeat;
          opacity: 0.85;
          animation: petalfall linear infinite;
          will-change: transform, opacity;
        }
        @keyframes petalfall {
          0%   { transform: translate3d(0, -40px, 0) rotate(0deg);   opacity: 0; }
          10%  { opacity: 0.9; }
          50%  { transform: translate3d(40px, 50vh, 0) rotate(180deg); }
          100% { transform: translate3d(-20px, 110vh, 0) rotate(360deg); opacity: 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          .spring-petals { display: none; }
        }
        .ev-wrap { position: relative; z-index: 2; }

        /* Keep the hero card readable against the light background by
           flipping it to a sunlit cream with a peachy top wash. */
        body.ev-vendor .ev-hero {
          background:
            radial-gradient(circle at 18% 0%, rgba(249,193,173,0.55), transparent 55%),
            radial-gradient(circle at 85% 100%, rgba(163,196,141,0.45), transparent 55%),
            linear-gradient(180deg, #ffffff 0%, #fff7e8 100%);
          border: 1px solid rgba(111,144,97,0.35);
          box-shadow: 0 24px 60px rgba(144,110,80,0.22), inset 0 0 0 1px rgba(255,255,255,0.6);
        }
        body.ev-vendor .ev-hero::before {
          background: linear-gradient(90deg, transparent, #d97a5e, #f2c94c, #6f9061, transparent);
          opacity: 0.9;
          height: 2px;
          max-width: 420px;
        }
        /* Blossoms floating around the hero title */
        body.ev-vendor .ev-hero::after {
          content: '';
          position: absolute;
          inset: 0;
          pointer-events: none;
          background:
            var(--f-blossom) left 14px top 14px / 72px 72px no-repeat,
            var(--f-blossom) right 14px top 14px / 64px 64px no-repeat,
            var(--f-leaf) left 10% bottom -8px / 160px 100px no-repeat;
          opacity: 0.9;
        }
        body.ev-vendor .ev-hero-eyebrow,
        body.ev-vendor .ev-side-kicker {
          color: #d97a5e;
          text-shadow: 0 1px 0 rgba(255,255,255,0.6);
        }
        body.ev-vendor .ev-hero-title {
          color: #2a3326;
          text-shadow: 0 2px 0 rgba(255,255,255,0.4);
        }
        body.ev-vendor .ev-hero-location { color: #6f9061; }
        body.ev-vendor .ev-hero-divider {
          background: linear-gradient(90deg, transparent, #6f9061 30%, #d97a5e 70%, transparent);
          opacity: 1;
          height: 2px;
        }
        body.ev-vendor .ev-back,
        body.ev-vendor .ev-all-events { color: #6b7a64; }
        body.ev-vendor .ev-back:hover,
        body.ev-vendor .ev-all-events:hover { color: #d97a5e; }

        /* Details/text cards: cream panels with green/peach trim.
           Rotate a sprig of leaves into the corner of every text section. */
        body.ev-vendor .ev-details,
        body.ev-vendor .ev-side-card,
        body.ev-vendor .ev-sec-text,
        body.ev-vendor .ev-sec-details,
        body.ev-vendor .ev-sec-schedule,
        body.ev-vendor .ev-sec-faq {
          background: linear-gradient(180deg, #ffffff, #fff7e8);
          border: 1px solid rgba(111,144,97,0.28);
          box-shadow: 0 10px 28px rgba(144,110,80,0.14);
          position: relative;
          overflow: hidden;
        }
        body.ev-vendor .ev-sec-details::before,
        body.ev-vendor .ev-sec-text::before {
          content: '';
          position: absolute;
          top: -18px;
          right: -26px;
          width: 140px;
          height: 90px;
          background: var(--f-leaf) center/contain no-repeat;
          opacity: 0.55;
          pointer-events: none;
          transform: rotate(18deg);
        }
        body.ev-vendor .ev-sec-faq::before {
          content: '';
          position: absolute;
          top: -14px;
          left: -14px;
          width: 70px;
          height: 70px;
          background: var(--f-daisy) center/contain no-repeat;
          opacity: 0.55;
          pointer-events: none;
        }
        /* Gold-style "featured" cards become a warm peach wash */
        body.ev-vendor .ev-sec-bg-gold {
          background:
            radial-gradient(circle at 20% 0%, rgba(249,193,173,0.55), transparent 60%),
            linear-gradient(180deg, #fff2df, #ffe2c8) !important;
          border-color: rgba(217,122,94,0.35) !important;
          box-shadow: 0 14px 32px rgba(217,122,94,0.15), inset 0 0 0 1px rgba(255,255,255,0.5) !important;
        }
        body.ev-vendor .ev-sec-bg-dark {
          background: linear-gradient(180deg, #f5eedc, #ecd9b6) !important;
          border-color: rgba(111,144,97,0.3) !important;
        }
        body.ev-vendor .ev-sec-heading::after,
        body.ev-vendor .ev-sec-details-title::after,
        body.ev-vendor .ev-sec-text .ev-sec-heading::after {
          background: linear-gradient(90deg, #6f9061, #d97a5e);
          opacity: 1;
          width: 60px;
          height: 2px;
        }
        body.ev-vendor .ev-datetime-label,
        body.ev-vendor .ev-sec-details-label,
        body.ev-vendor .ev-form label { color: #6b7a64; }
        body.ev-vendor .ev-datetime-value,
        body.ev-vendor .ev-sec-details-value { color: #2a3326; }
        body.ev-vendor .ev-description { color: #3f4a38; }
        body.ev-vendor .ev-detail-chip {
          background: linear-gradient(135deg, #e8f0df, #fce5d8);
          border-color: rgba(111,144,97,0.35);
          color: #3a4a32;
        }
        body.ev-vendor .ev-side-title { color: #2a3326; }
        body.ev-vendor .ev-side-copy { color: #3f4a38; }
        body.ev-vendor .ev-form input,
        body.ev-vendor .ev-form textarea,
        body.ev-vendor .ev-form select {
          background: #fff9ea;
          border-color: rgba(111,144,97,0.35);
          color: #2a3326;
        }
        body.ev-vendor .ev-form input:focus,
        body.ev-vendor .ev-form textarea:focus,
        body.ev-vendor .ev-form select:focus {
          background: #ffffff;
          border-color: #6f9061;
          box-shadow: 0 0 0 3px rgba(111,144,97,0.18);
        }
        body.ev-vendor .ev-submit-btn {
          background: linear-gradient(135deg, #6f9061 0%, #a3c48d 45%, #f2c094 100%);
          color: #1f2a1c;
          box-shadow: 0 14px 32px rgba(111,144,97,0.35);
          text-shadow: 0 1px 0 rgba(255,255,255,0.35);
        }
        body.ev-vendor .ev-submit-btn:hover {
          filter: brightness(1.05) saturate(1.1);
          box-shadow: 0 18px 40px rgba(217,122,94,0.35);
        }
        body.ev-vendor .ev-side-link {
          background: linear-gradient(135deg, rgba(111,144,97,0.25), rgba(217,122,94,0.2));
          border-color: rgba(111,144,97,0.45);
          color: #2a3326;
        }
        body.ev-vendor .ev-side-link:hover { border-color: #d97a5e; }
        body.ev-vendor .ev-side-link-muted {
          background: transparent;
          border-color: rgba(111,144,97,0.3);
          color: #6b7a64;
        }
        /* Make the banner image feel like a polaroid with a peach mat */
        body.ev-vendor .ev-banner-img {
          border: 4px solid #ffffff;
          outline: 1px solid rgba(111,144,97,0.35);
          box-shadow: 0 16px 34px rgba(144,110,80,0.18);
        }
        /* Schedule time numbers in peach */
        body.ev-vendor .ev-sec-schedule-time { color: #d97a5e; }
        /* FAQ toggle marker in sage */
        body.ev-vendor .ev-sec-faq-question::after { color: #6f9061; }
        body.ev-vendor .ev-sec-faq-question:hover { color: #d97a5e; }
        body.ev-vendor .ev-sec-divider {
          background: linear-gradient(90deg, transparent, rgba(111,144,97,0.6), rgba(217,122,94,0.6), transparent);
          height: 2px;
        }

        /* ─── Art Gallery theme (Neighborhood Art Pop-Up) ───
           Purple damask wallpaper backing with cream "gallery catalog" panels
           on top. Cartoon art assets are placed intentionally, not randomly:
             • frame.png  → small ornate frame hanging in the hero corner
             • artist.png + wanted.png → stacked "ARTISTS WANTED" poster inside
               the artist-call-to-action section
             • paint.png + paintbrush.png → art-supplies still-life on the
               cocktail menu card
             • vendorpass.png → hanging lanyard at the top of the signup card
             • statue.png    → classical bust peeking behind the details card */
        @import url('https://fonts.googleapis.com/css2?family=Permanent+Marker&family=Caveat:wght@700&display=swap');
        body.ev-art {
          --gold: #d14c2e;              /* tomato red accent (replaces gold) */
          --amber: #e7b83a;             /* mustard yellow accent */
          --accent-light: #1a1816;      /* near-black text for light panels */
          --text: #1a1816;
          --steel: #2c2826;
          --muted: #6b6357;
          --smoke: #8a8279;
          --bg-a: #f2e1f0;
          --bg-b: #d9a6d2;
          --panel: #fffaf0;             /* aged paper cream */
          --panel-strong: #f6ecd7;
          --line: rgba(26,24,22,0.35);
          --line-strong: rgba(26,24,22,0.65);
          --shadow: rgba(65,30,70,0.35);
          background:
            url('/assets/artpopup/background.png') repeat,
            linear-gradient(180deg, #b577b0, #d9a6d2);
          color: var(--text);
          font-family: 'Playfair Display', 'Iowan Old Style', Georgia, serif;
        }
        body.ev-art .ev-wrap { position: relative; z-index: 2; }

        /* Hero: bold gallery placard. Ornate frame hangs in the top-right
           corner like a painting on the wall behind the placard. */
        body.ev-art .ev-hero {
          background:
            radial-gradient(circle at 50% 110%, rgba(231,184,58,0.35), transparent 55%),
            linear-gradient(180deg, #fffaf0 0%, #f6ecd7 100%);
          border: 3px solid #1a1816;
          border-radius: 18px;
          box-shadow: 12px 12px 0 #1a1816, 0 24px 60px rgba(0,0,0,0.35);
          padding: 50px 24px 44px;
          overflow: visible;
        }
        body.ev-art .ev-hero::before {
          background: linear-gradient(90deg, transparent, #d14c2e 20%, #e7b83a 50%, #3a6d4a 80%, transparent);
          opacity: 1;
          height: 3px;
        }
        /* The ornate frame, hung at a small angle in the hero corner.
           Sized to feel like decor, not content — negative margin so it breaks
           out of the hero box. Mobile shrinks and pulls it in. */
        body.ev-art .ev-hero::after {
          content: '';
          position: absolute;
          top: -28px;
          right: -18px;
          width: 140px;
          height: 210px;
          background: url('/assets/artpopup/frame.png') center/contain no-repeat;
          filter: drop-shadow(0 10px 18px rgba(0,0,0,0.35));
          transform: rotate(6deg);
          pointer-events: none;
        }
        @media (max-width: 640px) {
          body.ev-art .ev-hero::after { width: 88px; height: 130px; right: -8px; top: -16px; }
        }

        /* "Artists Wanted" eyebrow for the art theme: big hand-painted
           display type with a hard shadow so it reads like a flyer stamp,
           tilted slightly. No image — just type. */
        body.ev-art .ev-hero-eyebrow {
          font-family: 'Permanent Marker', 'Playfair Display', Georgia, serif;
          font-size: clamp(1.6rem, 5.5vw, 2.4rem);
          font-weight: 400;
          color: #d14c2e;
          letter-spacing: 0.06em;
          line-height: 1;
          text-transform: uppercase;
          display: inline-block;
          transform: rotate(-3deg);
          text-shadow: 3px 3px 0 #1a1816, 6px 6px 0 #e7b83a;
          margin: 2px auto 16px;
          padding: 2px 10px;
          position: relative;
          z-index: 2;
        }

        /* Classical bust lives in the hero, balancing the ornate frame on
           the opposite side. Placed to the bottom-left of the hero placard
           with a slight outward offset so it reads as decor pinned to the
           hero, not as content. Mobile shrinks and pulls it in. */
        body.ev-art .ev-hero {
          overflow: visible;
        }
        body.ev-art .ev-hero > .ev-hero-statue {
          position: absolute;
          bottom: -40px;
          left: -34px;
          width: 150px;
          height: 220px;
          background: url('/assets/artpopup/statue.png') center/contain no-repeat;
          filter: drop-shadow(0 14px 22px rgba(0,0,0,0.4));
          transform: rotate(-6deg);
          pointer-events: none;
          z-index: 1;
        }
        @media (max-width: 640px) {
          body.ev-art .ev-hero > .ev-hero-statue { width: 86px; height: 130px; left: -12px; bottom: -22px; }
        }
        body.ev-art .ev-hero-eyebrow {
          color: #d14c2e;
          font-family: 'Permanent Marker', 'Playfair Display', serif;
          font-size: 1.1rem;
          letter-spacing: 0.18em;
          text-shadow: 2px 2px 0 rgba(231,184,58,0.5);
        }
        body.ev-art .ev-hero-title {
          font-family: 'Playfair Display', 'Iowan Old Style', Georgia, serif;
          font-weight: 900;
          color: #1a1816;
          font-size: clamp(2.4rem, 9vw, 3.6rem);
          text-shadow: 4px 4px 0 #e7b83a, 8px 8px 0 rgba(26,24,22,0.2);
          letter-spacing: -0.015em;
        }
        body.ev-art .ev-hero-divider {
          background: linear-gradient(90deg, transparent, #d14c2e, #e7b83a, #3a6d4a, transparent);
          opacity: 1;
          height: 3px;
          max-width: 320px;
        }
        body.ev-art .ev-hero-location {
          color: #3a6d4a;
          font-family: 'Caveat', 'Playfair Display', cursive;
          font-size: 1.35rem;
          font-weight: 700;
          font-style: normal;
        }
        body.ev-art .ev-page-nav .ev-back,
        body.ev-art .ev-page-nav .ev-all-events {
          color: #fffaf0;
          background: rgba(26,24,22,0.55);
          padding: 8px 14px;
          border-radius: 8px;
          backdrop-filter: blur(4px);
        }
        body.ev-art .ev-page-nav .ev-back:hover,
        body.ev-art .ev-page-nav .ev-all-events:hover { color: #e7b83a; }

        /* Shared panel treatment: cream paper, hard black frame, drop-shadow
           that gives each card a posted/pinned feeling. */
        body.ev-art .ev-details,
        body.ev-art .ev-side-card,
        body.ev-art .ev-sec-text,
        body.ev-art .ev-sec-details,
        body.ev-art .ev-sec-schedule,
        body.ev-art .ev-sec-faq,
        body.ev-art .ev-sec-cocktails {
          background: linear-gradient(180deg, #fffaf0, #f6ecd7);
          border: 2px solid #1a1816;
          border-radius: 14px;
          box-shadow: 8px 8px 0 #1a1816, 0 16px 30px rgba(0,0,0,0.2);
          position: relative;
          margin-bottom: 28px;
        }
        body.ev-art .ev-details { margin-bottom: 20px; }

        /* Artist-call-to-action section: the "gold" variant.
           Stacked ARTISTS / statue / WANTED graphics render inside as the
           headline. Section padding is trimmed so the callout feels compact. */
        body.ev-art .ev-sec-bg-gold {
          background:
            radial-gradient(circle at 20% 0%, rgba(209,76,46,0.18), transparent 60%),
            linear-gradient(180deg, #fff4dc, #ffe3a8) !important;
          border-color: #1a1816 !important;
          box-shadow: 8px 8px 0 #1a1816, 0 16px 30px rgba(0,0,0,0.2) !important;
          padding: 22px 22px 20px !important;
        }

        /* Paint-supplies still-life decorating the cocktail menu card:
           paintbrush + palette overlapping the paint tube. Positioned in the
           top-right corner of the card. */
        body.ev-art .ev-sec-cocktails {
          overflow: visible;
          padding-top: 34px;
        }
        body.ev-art .ev-sec-cocktails::before {
          content: '';
          position: absolute;
          top: -34px;
          right: -22px;
          width: 180px;
          height: 120px;
          background:
            url('/assets/artpopup/paint.png') left 0 top 10px / 72px 108px no-repeat,
            url('/assets/artpopup/paintbrush.png') right 0 top 0 / 130px 130px no-repeat;
          filter: drop-shadow(0 10px 14px rgba(0,0,0,0.3));
          transform: rotate(6deg);
          pointer-events: none;
        }
        @media (max-width: 640px) {
          body.ev-art .ev-sec-cocktails::before {
            width: 120px; height: 80px; right: -10px; top: -20px;
            background-size: 50px 74px, 88px 88px;
          }
        }

        /* Vendor pass hanging from the top of the signup side-card, like a
           lanyard clipped to the top edge. Gentle sway animation. */
        body.ev-art .ev-side-card {
          overflow: visible;
          padding-top: 68px;
        }
        body.ev-art .ev-side-card::before {
          content: '';
          position: absolute;
          top: -56px;
          right: 18px;
          width: 110px;
          height: 165px;
          background: url('/assets/artpopup/vendorpass.png') center/contain no-repeat;
          filter: drop-shadow(0 8px 14px rgba(0,0,0,0.4));
          transform-origin: 50% -5%;
          animation: passSway 5s ease-in-out infinite;
          pointer-events: none;
        }
        @keyframes passSway {
          0%, 100% { transform: rotate(-3deg); }
          50%       { transform: rotate(3deg); }
        }
        @media (prefers-reduced-motion: reduce) {
          body.ev-art .ev-side-card::before { animation: none; }
        }
        body.ev-art .ev-sec-bg-dark {
          background: linear-gradient(180deg, #e8d9bd, #d4c098) !important;
          border-color: #1a1816 !important;
        }
        body.ev-art .ev-sec-heading,
        body.ev-art .ev-sec-details-title,
        body.ev-art .ev-side-title {
          font-family: 'Playfair Display', Georgia, serif;
          font-weight: 900;
          color: #1a1816;
          letter-spacing: -0.01em;
        }
        body.ev-art .ev-sec-heading::after,
        body.ev-art .ev-sec-details-title::after,
        body.ev-art .ev-sec-text .ev-sec-heading::after {
          background: linear-gradient(90deg, #d14c2e, #e7b83a);
          opacity: 1;
          width: 70px;
          height: 3px;
        }
        body.ev-art .ev-datetime-label,
        body.ev-art .ev-sec-details-label,
        body.ev-art .ev-form label {
          color: #6b6357;
          font-family: 'Permanent Marker', 'Inter', sans-serif;
          font-weight: 400;
          letter-spacing: 0.08em;
        }
        body.ev-art .ev-datetime-value,
        body.ev-art .ev-sec-details-value { color: #1a1816; font-family: 'Playfair Display', Georgia, serif; font-weight: 700; }
        body.ev-art .ev-description { color: #2c2826; font-size: 1.02rem; line-height: 1.7; }
        body.ev-art .ev-detail-chip {
          background: #1a1816;
          border-color: #1a1816;
          color: #e7b83a;
          font-family: 'Permanent Marker', 'Inter', sans-serif;
        }
        body.ev-art .ev-datetime-row { border-bottom-color: rgba(26,24,22,0.2); }

        /* Sidebar form: the artist application lives here */
        body.ev-art .ev-side-card { padding: 26px; }
        body.ev-art .ev-side-kicker {
          color: #d14c2e;
          font-family: 'Permanent Marker', 'Inter', sans-serif;
          font-size: 0.92rem;
          letter-spacing: 0.1em;
        }
        body.ev-art .ev-side-copy { color: #2c2826; font-family: 'Inter', sans-serif; }
        body.ev-art .ev-form input,
        body.ev-art .ev-form textarea,
        body.ev-art .ev-form select {
          background: #fffdf5;
          border: 2px solid #1a1816;
          border-radius: 8px;
          color: #1a1816;
          font-family: 'Inter', sans-serif;
        }
        body.ev-art .ev-form input:focus,
        body.ev-art .ev-form textarea:focus,
        body.ev-art .ev-form select:focus {
          background: #ffffff;
          border-color: #d14c2e;
          box-shadow: 4px 4px 0 rgba(209,76,46,0.35);
        }
        body.ev-art .ev-submit-btn {
          background: #1a1816;
          color: #e7b83a;
          border: 2px solid #1a1816;
          box-shadow: 6px 6px 0 #d14c2e;
          text-shadow: none;
          font-family: 'Permanent Marker', 'Inter', sans-serif;
          letter-spacing: 0.06em;
        }
        body.ev-art .ev-submit-btn:hover {
          background: #d14c2e;
          color: #fffaf0;
          transform: translate(-2px, -2px);
          box-shadow: 8px 8px 0 #1a1816;
        }
        body.ev-art .ev-side-link {
          background: #1a1816;
          color: #e7b83a;
          border: 2px solid #1a1816;
          box-shadow: 4px 4px 0 #d14c2e;
          font-family: 'Permanent Marker', 'Inter', sans-serif;
        }
        body.ev-art .ev-side-link:hover { background: #d14c2e; color: #fffaf0; }
        body.ev-art .ev-side-link-muted {
          background: transparent;
          color: #1a1816;
          border-color: #1a1816;
          box-shadow: none;
        }
        body.ev-art .ev-side-link-muted:hover { background: #1a1816; color: #e7b83a; }
        /* Banner image framed like a gallery piece */
        body.ev-art .ev-banner-img {
          border: 6px solid #1a1816;
          border-radius: 6px;
          box-shadow: 10px 10px 0 #e7b83a;
          padding: 6px;
          background: #fffaf0;
        }
        body.ev-art .ev-sec-divider {
          background:
            linear-gradient(90deg, transparent, #1a1816 20%, #d14c2e 50%, #1a1816 80%, transparent);
          height: 3px;
        }
        /* FAQ accents */
        body.ev-art .ev-sec-faq-question::after { color: #d14c2e; }
        body.ev-art .ev-sec-faq-question:hover { color: #d14c2e; }
        body.ev-art .ev-sec-schedule-time { color: #d14c2e; font-family: 'Permanent Marker', 'Inter', sans-serif; }
        body.ev-art .ev-status {
          background: #fffaf0;
          border: 2px solid #1a1816;
          color: #1a1816;
        }
        .ev-wrap {
          max-width: 1080px;
          margin: 0 auto;
          padding: 0 16px 72px;
        }
        .ev-page-nav {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          padding: 14px 0 10px;
          flex-wrap: wrap;
        }
        .ev-back,
        .ev-all-events {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          color: var(--muted);
          font-size: 0.82rem;
          text-decoration: none;
          padding: 8px 0;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          font-family: Inter, -apple-system, BlinkMacSystemFont, sans-serif;
          font-weight: 700;
        }
        .ev-back:hover,
        .ev-all-events:hover { color: var(--gold); }
        /* Thin top banner (e.g. "We are looking for vendors, apply here")
           sits between the page nav and the hero. Rendered per the
           topbanner section type. */
        .ev-topbanner {
          margin: 0 0 14px;
          border-radius: 12px;
          background: linear-gradient(135deg, rgba(210,170,103,0.18), rgba(210,170,103,0.08));
          border: 1px solid rgba(210,170,103,0.45);
          padding: 10px 16px;
          box-shadow: 0 6px 18px rgba(0,0,0,0.25);
        }
        .ev-topbanner-inner {
          display: flex;
          align-items: center;
          justify-content: center;
          flex-wrap: wrap;
          gap: 12px;
        }
        .ev-topbanner-text {
          color: var(--accent-light);
          font-family: Inter, -apple-system, BlinkMacSystemFont, sans-serif;
          font-size: 0.86rem;
          font-weight: 700;
          letter-spacing: 0.04em;
        }
        .ev-topbanner-btn {
          display: inline-block;
          padding: 6px 14px;
          border-radius: 999px;
          background: var(--gold);
          color: #0c0c0c;
          text-decoration: none;
          font-family: Inter, -apple-system, BlinkMacSystemFont, sans-serif;
          font-size: 0.78rem;
          font-weight: 800;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          transition: filter 0.15s, transform 0.05s;
        }
        .ev-topbanner-btn:hover { filter: brightness(1.1); text-decoration: none; }
        body.ev-vendor .ev-topbanner {
          background: linear-gradient(135deg, rgba(111,144,97,0.18), rgba(232,167,146,0.14));
          border-color: rgba(111,144,97,0.4);
          box-shadow: 0 6px 18px rgba(144,110,80,0.12);
        }
        body.ev-vendor .ev-topbanner-text { color: #2a3326; }
        body.ev-vendor .ev-topbanner-btn { background: linear-gradient(135deg, #6f9061, #a3c48d); color: #1f2a1c; }
        body.ev-art .ev-topbanner {
          background: #1a1816;
          border: 2px solid #1a1816;
          box-shadow: 4px 4px 0 #d14c2e;
        }
        body.ev-art .ev-topbanner-text {
          color: #e7b83a;
          font-family: 'Permanent Marker', Inter, sans-serif;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }
        body.ev-art .ev-topbanner-btn {
          background: #d14c2e;
          color: #fffaf0;
          font-family: 'Permanent Marker', Inter, sans-serif;
        }
        body.ev-art .ev-topbanner-btn:hover { background: #e7b83a; color: #1a1816; }

        .ev-hero {
          position: relative;
          background:
            linear-gradient(180deg, rgba(24,25,28,0.97), rgba(7,7,8,0.99)),
            radial-gradient(circle at top, rgba(210,170,103,0.18), transparent 55%);
          border: 1px solid var(--line);
          border-radius: 0 0 28px 28px;
          border-top: 0;
          padding: 38px 24px 34px;
          margin: 0 -2px 30px;
          box-shadow: 0 22px 58px var(--shadow), inset 0 0 0 1px rgba(255,255,255,0.04);
          text-align: center;
        }
        .ev-hero::before {
          content: '';
          position: absolute;
          left: 50%;
          top: 0;
          transform: translateX(-50%);
          width: 60%;
          max-width: 280px;
          height: 1px;
          background: linear-gradient(90deg, transparent, var(--gold), transparent);
          opacity: 0.6;
        }
        .ev-hero .brand-mark { max-width: 260px; margin: 4px auto 22px; }
        .ev-hero-eyebrow {
          color: var(--gold);
          font-size: 0.7rem;
          font-weight: 800;
          letter-spacing: 0.28em;
          text-transform: uppercase;
          margin-bottom: 12px;
          opacity: 0.85;
        }
        .ev-hero-title {
          font-family: 'Playfair Display', 'Iowan Old Style', Georgia, serif;
          font-size: clamp(2.1rem, 8vw, 3rem);
          font-weight: 800;
          line-height: 1.05;
          letter-spacing: -0.01em;
          color: var(--text);
          margin: 0 0 14px;
          text-shadow: 0 4px 24px rgba(0,0,0,0.6);
        }
        .ev-hero-divider {
          width: 56px;
          height: 1px;
          background: var(--gold);
          opacity: 0.5;
          margin: 14px auto 16px;
        }
        .ev-hero-location {
          color: var(--steel);
          font-size: 0.92rem;
          font-style: italic;
          letter-spacing: 0.04em;
        }
        /* Image hero: shows the WHOLE banner image (no logo, no text, no crop).
           The themed .ev-hero border/shadow frames it; the image sets the
           height at its natural aspect so nothing is ever cut off. */
        .ev-hero.ev-hero-image {
          padding: 0;
          min-height: 0;
          overflow: hidden;
        }
        .ev-hero.ev-hero-image::before { display: none; }
        .ev-hero-banner {
          display: block;
          width: 100%;
          height: auto;
        }
        .ev-banner-img {
          width: 100%;
          max-height: 320px;
          object-fit: cover;
          border-radius: 16px;
          border: 1px solid var(--line);
        }
        .ev-main-grid {
          display: grid;
          grid-template-columns: minmax(0, 1.35fr) minmax(320px, 0.85fr);
          gap: 22px;
          align-items: start;
          margin-bottom: 28px;
        }
        .ev-main-grid-full {
          grid-template-columns: minmax(0, 1fr);
        }
        .ev-main-col,
        .ev-side-col { min-width: 0; }
        .ev-main-col { display: flex; flex-direction: column; gap: 20px; }
        .ev-details {
          background: var(--panel);
          border: 1px solid var(--line);
          border-radius: 16px;
          padding: 22px;
        }
        .ev-detail-chips {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          margin-top: 16px;
        }
        .ev-detail-chip {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 8px 12px;
          border-radius: 999px;
          border: 1px solid rgba(210,170,103,0.22);
          background: rgba(210,170,103,0.08);
          color: var(--accent-light);
          font-size: 0.75rem;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          font-family: Inter, -apple-system, BlinkMacSystemFont, sans-serif;
          font-weight: 700;
        }
        .ev-side-card {
          position: sticky;
          top: 18px;
          scroll-margin-top: 20px;
          background: linear-gradient(180deg, rgba(24,25,28,0.96), rgba(12,13,15,0.98));
          border: 1px solid var(--line);
          border-radius: 18px;
          padding: 22px;
          box-shadow: 0 18px 42px rgba(0,0,0,0.32);
        }
        .ev-side-kicker {
          color: var(--gold);
          font-size: 0.68rem;
          font-weight: 800;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          margin-bottom: 10px;
          font-family: Inter, -apple-system, BlinkMacSystemFont, sans-serif;
        }
        .ev-side-title {
          font-family: 'Playfair Display', 'Iowan Old Style', Georgia, serif;
          font-size: 1.6rem;
          line-height: 1.08;
          margin: 0 0 10px;
          color: var(--text);
        }
        .ev-side-copy {
          color: var(--steel);
          font-size: 0.95rem;
          line-height: 1.6;
          margin-bottom: 18px;
          font-family: Inter, -apple-system, BlinkMacSystemFont, sans-serif;
        }
        .ev-side-actions {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .ev-side-link {
          display: inline-flex;
          justify-content: center;
          align-items: center;
          min-height: 48px;
          border-radius: 12px;
          border: 1px solid rgba(210,170,103,0.28);
          background: linear-gradient(135deg, rgba(210,170,103,0.18), rgba(210,170,103,0.10));
          color: var(--accent-light);
          text-decoration: none;
          font-size: 0.88rem;
          font-family: Inter, -apple-system, BlinkMacSystemFont, sans-serif;
          font-weight: 700;
          letter-spacing: 0.03em;
        }
        .ev-side-link:hover { border-color: rgba(210,170,103,0.55); text-decoration: none; }
        .ev-side-link-muted {
          background: transparent;
          border-color: var(--line);
          color: var(--muted);
        }
        .ev-side-link-muted:hover { color: var(--text); border-color: rgba(255,255,255,0.18); }
        .ev-datetime-row {
          display: flex;
          gap: 14px;
          margin-bottom: 16px;
          padding-bottom: 16px;
          border-bottom: 1px solid var(--line);
          flex-wrap: wrap;
        }
        /* "X spots left" urgency pill in the signup card */
        .ev-spots-left {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          margin-bottom: 14px;
          padding: 7px 14px;
          border-radius: 999px;
          background: rgba(210,170,103,0.14);
          border: 1px solid rgba(210,170,103,0.4);
          color: var(--accent-light);
          font-family: Inter, -apple-system, BlinkMacSystemFont, sans-serif;
          font-size: 0.82rem;
          font-weight: 800;
          letter-spacing: 0.03em;
        }
        .ev-spots-left::before { content: '◷'; font-size: 0.9rem; }
        .ev-spots-left-low {
          background: rgba(229,115,84,0.16);
          border-color: rgba(229,115,84,0.5);
          color: #f0a58c;
        }
        /* Add-to-calendar buttons under the date/time */
        .ev-cal-add {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
          margin-bottom: 16px;
        }
        .ev-cal-add-label {
          font-size: 0.62rem;
          font-weight: 800;
          color: var(--smoke);
          text-transform: uppercase;
          letter-spacing: 0.1em;
          margin-right: 2px;
        }
        .ev-cal-btn {
          padding: 5px 12px;
          border-radius: 999px;
          border: 1px solid var(--line-strong);
          background: rgba(255,255,255,0.03);
          color: var(--steel);
          text-decoration: none;
          font-family: Inter, -apple-system, BlinkMacSystemFont, sans-serif;
          font-size: 0.74rem;
          font-weight: 700;
          letter-spacing: 0.02em;
          transition: border-color 0.15s, color 0.15s;
        }
        .ev-cal-btn:hover { border-color: var(--gold); color: var(--text); }
        .ev-datetime-item { flex: 1; min-width: 140px; }
        .ev-datetime-label {
          font-size: 0.62rem;
          font-weight: 800;
          color: var(--smoke);
          text-transform: uppercase;
          letter-spacing: 0.14em;
          margin-bottom: 4px;
        }
        .ev-datetime-value {
          color: var(--text);
          font-size: 0.95rem;
          font-weight: 600;
        }
        .ev-description {
          color: var(--steel);
          font-size: 0.95rem;
          line-height: 1.65;
        }
        .ev-description p { margin-bottom: 10px; }
        .ev-description p:last-child { margin-bottom: 0; }
        .ev-description ul,
        .ev-sec-body ul,
        .ev-sec-faq-answer ul {
          margin: 8px 0 12px 1.25rem;
          padding: 0;
        }
        .ev-description li,
        .ev-sec-body li,
        .ev-sec-faq-answer li {
          margin-bottom: 7px;
        }
        .ev-description a,
        .ev-sec-body a,
        .ev-sec-details-value a,
        .ev-sec-schedule-desc a,
        .ev-sec-faq-answer a {
          color: var(--gold);
          font-weight: 800;
          text-decoration: underline;
          text-underline-offset: 3px;
        }

        .ev-capacity {
          display: inline-block;
          background: rgba(210,170,103,0.1);
          border: 1px solid rgba(210,170,103,0.3);
          color: var(--gold);
          padding: 4px 12px;
          border-radius: 12px;
          font-size: 0.78rem;
          font-weight: 700;
          margin-top: 10px;
        }

        .ev-status {
          border-radius: 16px;
          padding: 18px 22px;
          margin-bottom: 20px;
          text-align: center;
        }
        .ev-status-title {
          font-size: 0.72rem;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.14em;
          margin-bottom: 6px;
        }
        .ev-status-msg { color: var(--muted); font-size: 0.88rem; }
        .ev-status-hidden { background: rgba(148,163,184,0.10); border: 1px solid rgba(148,163,184,0.28); }
        .ev-status-hidden .ev-status-title { color: #cbd5e1; }
        .ev-status-cancelled { background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.3); }
        .ev-status-cancelled .ev-status-title { color: #f87171; }
        .ev-status-upcoming { background: rgba(96,165,250,0.08); border: 1px solid rgba(96,165,250,0.3); }
        .ev-status-upcoming .ev-status-title { color: #93c5fd; }
        .ev-status-closed { background: rgba(251,146,60,0.08); border: 1px solid rgba(251,146,60,0.3); }
        .ev-status-closed .ev-status-title { color: #fdba74; }

        /* ─── Page sections ─── */
        .ev-sec {
          margin-bottom: 26px;
        }
        /* Stacked images — e.g. ARTISTS · STATUE · WANTED for the art pop-up.
           Three graphics tilt and overlap like a taped-up handbill. The
           middle slot is sized smaller so the top/bottom drip-text reads as
           the heading and the middle reads as a small emblem. */
        .ev-sec-stack {
          display: flex;
          flex-direction: column;
          align-items: center;
          margin: -4px auto 10px;
        }
        .ev-sec-stack img {
          max-width: min(220px, 64%);
          height: auto;
          display: block;
          filter: drop-shadow(0 8px 14px rgba(0,0,0,0.3));
        }
        .ev-sec-stack img:nth-child(1) { transform: rotate(-3deg); }
        /* 2-image stack fallback: second image is the closer (slightly tilted
           right) drip text overlapping the first. */
        .ev-sec-stack img:nth-child(2):last-child {
          transform: rotate(3deg);
          margin-top: -14px;
        }
        /* 3-image stack: middle slot is an emblem, not a banner, so it's
           much smaller and sits between the two drip-text graphics. */
        .ev-sec-stack img:nth-child(2):not(:last-child) {
          max-width: 88px;
          margin: -6px 0 -8px;
          transform: rotate(-4deg);
          z-index: 1;
          position: relative;
        }
        .ev-sec-stack img:nth-child(3) {
          transform: rotate(3deg);
          margin-top: -6px;
        }
        .ev-sec-text {
          background: linear-gradient(180deg, rgba(24,25,28,0.95), rgba(15,16,18,0.98));
          border: 1px solid var(--line);
          border-radius: 18px;
          padding: 28px 26px;
          box-shadow: 0 12px 32px rgba(0,0,0,0.35), inset 0 0 0 1px rgba(255,255,255,0.025);
        }
        .ev-sec-heading {
          font-family: 'Playfair Display', 'Iowan Old Style', Georgia, serif;
          color: var(--text);
          font-size: clamp(1.4rem, 5vw, 1.7rem);
          font-weight: 800;
          margin-bottom: 14px;
          line-height: 1.15;
          letter-spacing: -0.005em;
        }
        .ev-sec-text .ev-sec-heading::after {
          content: '';
          display: block;
          width: 36px;
          height: 1px;
          background: var(--gold);
          opacity: 0.6;
          margin-top: 10px;
        }
        .ev-sec-text.ev-sec-align-center .ev-sec-heading::after { margin-left: auto; margin-right: auto; }
        .ev-sec-text.ev-sec-align-right .ev-sec-heading::after { margin-left: auto; }
        .ev-sec-body {
          color: var(--steel);
          font-size: 1rem;
          line-height: 1.7;
        }
        .ev-sec-body p { margin-bottom: 12px; }
        .ev-sec-body p:last-child { margin-bottom: 0; }

        .ev-sec-image {
          border-radius: 16px;
          overflow: hidden;
          background: var(--panel);
          border: 1px solid var(--line);
        }
        .ev-sec-image img {
          width: 100%;
          height: auto;
          display: block;
        }
        .ev-sec-caption {
          color: var(--muted);
          font-size: 0.82rem;
          font-style: italic;
          padding: 10px 16px;
          text-align: center;
        }

        .ev-sec-details {
          background: linear-gradient(180deg, rgba(24,25,28,0.95), rgba(15,16,18,0.98));
          border: 1px solid var(--line);
          border-radius: 18px;
          padding: 26px 26px 22px;
          box-shadow: 0 12px 32px rgba(0,0,0,0.35);
        }
        .ev-sec-details-title {
          font-family: 'Playfair Display', 'Iowan Old Style', Georgia, serif;
          color: var(--text);
          font-size: 1.4rem;
          font-weight: 800;
          margin-bottom: 18px;
          line-height: 1.15;
          text-align: center;
        }
        .ev-sec-details-title::after {
          content: '';
          display: block;
          width: 36px;
          height: 1px;
          background: var(--gold);
          opacity: 0.6;
          margin: 10px auto 0;
        }
        .ev-sec-details-list { display: flex; flex-direction: column; gap: 0; }
        .ev-sec-details-row {
          display: grid;
          grid-template-columns: minmax(110px, 38%) 1fr;
          gap: 12px;
          padding: 10px 0;
          border-bottom: 1px solid var(--line);
        }
        .ev-sec-details-row:last-child { border-bottom: none; }
        .ev-sec-details-label {
          color: var(--smoke);
          font-size: 0.7rem;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          padding-top: 2px;
        }
        .ev-sec-details-value {
          color: var(--text);
          font-size: 0.95rem;
          font-weight: 600;
        }

        .ev-sec-button { text-align: center; }
        .ev-sec-btn {
          display: inline-block;
          padding: 14px 32px;
          border-radius: 12px;
          font-size: 0.95rem;
          font-weight: 800;
          letter-spacing: 0.04em;
          text-decoration: none;
          transition: filter 0.2s, transform 0.05s;
        }
        .ev-sec-btn-primary {
          background: linear-gradient(135deg, var(--gold), var(--amber));
          color: #0c0c0c;
          box-shadow: 0 12px 28px rgba(210,170,103,0.18);
        }
        .ev-sec-btn-primary:hover { filter: brightness(1.1); text-decoration: none; }
        .ev-sec-btn-secondary {
          background: transparent;
          color: var(--gold);
          border: 1px solid var(--gold);
        }
        .ev-sec-btn-secondary:hover { background: rgba(210,170,103,0.08); text-decoration: none; }

        .ev-sec-video-frame {
          position: relative;
          padding-bottom: 56.25%;
          height: 0;
          background: var(--panel);
          border: 1px solid var(--line);
          border-radius: 16px;
          overflow: hidden;
        }
        .ev-sec-video-frame iframe {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
        }

        .ev-sec-divider {
          border: none;
          height: 1px;
          background: linear-gradient(90deg, transparent, var(--line-strong), transparent);
          margin: 24px 0;
        }

        /* ─── Background style modifiers ─── */
        .ev-sec-bg-gold {
          background:
            linear-gradient(180deg, rgba(24,25,28,0.92), rgba(15,16,18,0.95)),
            radial-gradient(circle at 50% 0%, rgba(210,170,103,0.28), transparent 60%) !important;
          border-color: rgba(210,170,103,0.45) !important;
          box-shadow: 0 16px 36px rgba(210,170,103,0.08), inset 0 0 0 1px rgba(210,170,103,0.12) !important;
        }
        .ev-sec-bg-gold .ev-sec-heading { color: var(--accent-light); }
        .ev-sec-bg-gold .ev-sec-heading::after { background: var(--gold); opacity: 1; }
        .ev-sec-bg-gold .ev-sec-details-title { color: var(--accent-light); }
        .ev-sec-bg-dark {
          background: #050505 !important;
          border-color: rgba(255,255,255,0.06) !important;
        }
        .ev-sec-bg-transparent {
          background: transparent !important;
          border: none !important;
          padding-left: 0 !important;
          padding-right: 0 !important;
          box-shadow: none !important;
        }
        .ev-sec-align-center { text-align: center; }
        .ev-sec-align-center .ev-sec-heading { text-align: center; }
        .ev-sec-align-right { text-align: right; }
        .ev-sec-align-right .ev-sec-heading { text-align: right; }

        /* ─── Hero section (full-width banner with image background) ─── */
        .ev-sec-hero {
          margin: -8px -16px 26px;
          padding: 60px 24px;
          background-size: cover;
          background-position: center;
          border-radius: 16px;
          text-align: center;
          min-height: 280px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .ev-sec-hero-inner { max-width: 560px; }
        .ev-sec-hero-eyebrow {
          color: var(--gold);
          font-size: 0.72rem;
          font-weight: 800;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          margin-bottom: 10px;
        }
        .ev-sec-hero-title {
          font-family: 'Playfair Display', Georgia, serif;
          font-size: 2.2rem;
          font-weight: 800;
          line-height: 1.1;
          color: var(--text);
          margin: 0 0 10px;
          text-shadow: 0 2px 18px rgba(0,0,0,0.6);
        }
        .ev-sec-hero-subtitle {
          color: var(--steel);
          font-size: 1rem;
          line-height: 1.5;
          text-shadow: 0 2px 12px rgba(0,0,0,0.6);
        }

        /* ─── Two-column section ─── */
        .ev-sec-twocol {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0;
          background: var(--panel);
          border: 1px solid var(--line);
          border-radius: 16px;
          overflow: hidden;
        }
        .ev-sec-twocol.ev-sec-twocol-right { grid-template-columns: 1fr 1fr; direction: rtl; }
        .ev-sec-twocol.ev-sec-twocol-right > * { direction: ltr; }
        .ev-sec-twocol-image {
          background: var(--panel-strong);
          min-height: 240px;
        }
        .ev-sec-twocol-image img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }
        .ev-sec-twocol-text {
          padding: 24px 26px;
          display: flex;
          flex-direction: column;
          justify-content: center;
        }
        .ev-sec-twocol-text .ev-sec-heading { margin-bottom: 12px; }

        /* ─── Schedule section ─── */
        .ev-sec-schedule {
          background: var(--panel);
          border: 1px solid var(--line);
          border-radius: 16px;
          padding: 22px 24px;
        }
        .ev-sec-schedule-list { display: flex; flex-direction: column; gap: 0; }
        .ev-sec-schedule-row {
          display: grid;
          grid-template-columns: 110px 1fr;
          gap: 18px;
          padding: 14px 0;
          border-bottom: 1px solid var(--line);
        }
        .ev-sec-schedule-row:last-child { border-bottom: none; }
        .ev-sec-schedule-time {
          color: var(--gold);
          font-weight: 800;
          font-size: 0.92rem;
          letter-spacing: 0.04em;
          padding-top: 2px;
        }
        .ev-sec-schedule-content { min-width: 0; }
        .ev-sec-schedule-title {
          color: var(--text);
          font-weight: 700;
          font-size: 1rem;
          margin-bottom: 4px;
        }
        .ev-sec-schedule-desc {
          color: var(--muted);
          font-size: 0.88rem;
          line-height: 1.5;
        }

        /* ─── Cocktail menu (tight printed-menu style) ───
           Single column list, no cards — hairline dividers between drinks.
           Reads like a cocktail menu, keeps the page short. */
        .ev-sec-cocktails {
          background: linear-gradient(180deg, rgba(24,25,28,0.95), rgba(15,16,18,0.98));
          border: 1px solid var(--line);
          border-radius: 18px;
          padding: 22px 26px 18px;
          box-shadow: 0 12px 32px rgba(0,0,0,0.35);
        }
        .cm-subtitle {
          color: var(--muted);
          font-size: 0.86rem;
          text-align: center;
          margin-top: -6px;
          margin-bottom: 14px;
          font-style: italic;
        }
        .cm-list { display: flex; flex-direction: column; }
        .cm-row {
          padding: 12px 0;
          border-bottom: 1px dashed var(--line);
        }
        .cm-row:last-child { border-bottom: none; }
        .cm-row-head {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          gap: 12px;
          margin-bottom: 4px;
          flex-wrap: wrap;
        }
        .cm-row-name {
          font-family: 'Playfair Display', Georgia, serif;
          font-weight: 800;
          font-size: 1.05rem;
          color: var(--text);
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }
        .cm-row-meta {
          display: flex;
          gap: 10px;
          align-items: baseline;
          flex-wrap: wrap;
        }
        .cm-row-abv {
          font-size: 0.72rem;
          font-weight: 800;
          color: var(--gold);
          letter-spacing: 0.06em;
        }
        .cm-row-creator {
          font-size: 0.68rem;
          color: var(--smoke);
          letter-spacing: 0.06em;
          text-transform: uppercase;
          font-weight: 700;
        }
        .cm-row-pour {
          color: var(--steel);
          font-size: 0.88rem;
          line-height: 1.45;
        }
        .cm-row-vibe {
          color: var(--muted);
          font-size: 0.8rem;
          font-style: italic;
          margin-top: 2px;
        }
        /* Vendor (spring) theme tweaks for the cocktail list */
        body.ev-vendor .ev-sec-cocktails {
          background: linear-gradient(180deg, #ffffff, #fff5e4);
          border-color: rgba(111,144,97,0.3);
        }
        body.ev-vendor .cm-row { border-bottom-color: rgba(111,144,97,0.22); }
        body.ev-vendor .cm-row-abv { color: #d97a5e; }
        body.ev-vendor .cm-row-creator { color: #6f9061; }

        /* ─── FAQ section ─── */
        .ev-sec-faq {
          background: var(--panel);
          border: 1px solid var(--line);
          border-radius: 16px;
          padding: 22px 24px;
        }
        .ev-sec-faq-list { display: flex; flex-direction: column; gap: 4px; }
        .ev-sec-faq-item {
          border-bottom: 1px solid var(--line);
          padding: 4px 0;
        }
        .ev-sec-faq-item:last-child { border-bottom: none; }
        .ev-sec-faq-question {
          padding: 14px 30px 14px 0;
          color: var(--text);
          font-weight: 700;
          font-size: 0.98rem;
          cursor: pointer;
          list-style: none;
          position: relative;
          transition: color 0.15s;
        }
        .ev-sec-faq-question::-webkit-details-marker { display: none; }
        .ev-sec-faq-question:hover { color: var(--gold); }
        .ev-sec-faq-question::after {
          content: '+';
          position: absolute;
          right: 4px;
          top: 50%;
          transform: translateY(-50%);
          color: var(--gold);
          font-size: 1.4rem;
          font-weight: 300;
          transition: transform 0.2s;
        }
        .ev-sec-faq-item[open] .ev-sec-faq-question::after { content: '−'; }
        .ev-sec-faq-answer {
          padding: 0 0 18px;
          color: var(--steel);
          font-size: 0.92rem;
          line-height: 1.6;
        }

        @media (max-width: 600px) {
          .ev-sec-twocol { grid-template-columns: 1fr; }
          .ev-sec-twocol.ev-sec-twocol-right { grid-template-columns: 1fr; direction: ltr; }
          .ev-sec-twocol-image { min-height: 200px; }
          .ev-sec-hero { padding: 40px 18px; min-height: 220px; }
          .ev-sec-hero-title { font-size: 1.7rem; }
          .ev-sec-schedule-row { grid-template-columns: 90px 1fr; gap: 12px; }
        }

        .ev-form {
          background: transparent;
          border: 0;
          border-radius: 0;
          padding: 0;
          margin: 0;
          box-shadow: none;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
        }
        .ev-form label {
          display: block;
          color: var(--smoke);
          font-size: 0.7rem;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          margin: 16px 0 6px;
        }
        .ev-form label:first-child { margin-top: 0; }
        .ev-form input,
        .ev-form textarea,
        .ev-form select {
          width: 100%;
          padding: 14px 16px;
          background: #0a0a0c;
          border: 1px solid var(--line);
          border-radius: 10px;
          color: var(--text);
          font-size: 1rem;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
          transition: border-color 0.15s, background 0.15s;
        }
        .ev-form input:focus,
        .ev-form textarea:focus,
        .ev-form select:focus {
          outline: none;
          border-color: var(--gold);
          background: #0d0e10;
          box-shadow: 0 0 0 3px rgba(210,170,103,0.12);
        }
        .ev-form textarea { resize: vertical; min-height: 72px; }
        .ev-submit-btn {
          width: 100%;
          margin-top: 28px;
          padding: 17px 20px;
          background: linear-gradient(135deg, var(--gold), var(--amber));
          color: #0c0c0c;
          border: none;
          border-radius: 12px;
          font-size: 1.05rem;
          font-weight: 800;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          cursor: pointer;
          transition: filter 0.2s, transform 0.05s, box-shadow 0.2s;
          box-shadow: 0 12px 28px rgba(210,170,103,0.22);
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
        }
        .ev-submit-btn:hover { filter: brightness(1.1); box-shadow: 0 14px 36px rgba(210,170,103,0.32); }
        .ev-submit-btn:active { transform: translateY(1px); }
        .ev-submit-btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .ev-ticket-cta {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 4px;
          width: 100%;
          margin-bottom: 22px;
          padding: 16px 18px;
          background: linear-gradient(135deg, var(--gold), var(--amber));
          color: #0c0c0c;
          text-decoration: none;
          border-radius: 12px;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
          transition: filter 0.2s, box-shadow 0.2s, transform 0.05s;
          box-shadow: 0 10px 28px rgba(210,170,103,0.22);
        }
        .ev-ticket-cta:hover { filter: brightness(1.08); box-shadow: 0 14px 36px rgba(210,170,103,0.32); }
        .ev-ticket-cta:active { transform: translateY(1px); }
        .ev-ticket-cta-label { font-size: 1.05rem; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; }
        .ev-ticket-cta-provider { font-size: 0.78rem; font-weight: 600; letter-spacing: 0.04em; opacity: 0.78; text-transform: none; }
        .ev-error {
          background: rgba(239,68,68,0.1);
          border: 1px solid rgba(239,68,68,0.3);
          color: #fca5a5;
          padding: 12px 14px;
          border-radius: 10px;
          margin-bottom: 16px;
          font-size: 0.9rem;
        }
        /* Multi-image upload — form shows only a compact trigger button +
           a small summary of already-added thumbnails. The heavy UI (drop
           zone + grid) lives inside .ev-modal. */
        .ev-cq-images-wrap {
          background: transparent;
          border: 0;
          padding: 0;
        }
        .ev-cq-images-open {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
          width: 100%;
          padding: 12px 14px;
          background: transparent;
          border: 2px dashed var(--line-strong);
          border-radius: 8px;
          color: var(--steel);
          cursor: pointer;
          font-size: 0.88rem;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
          transition: background 0.15s, border-color 0.15s;
        }
        .ev-cq-images-open:hover { background: rgba(255,255,255,0.04); border-color: var(--gold); }
        .ev-cq-images-open-label { font-weight: 700; letter-spacing: 0.03em; }
        .ev-cq-images-count { color: var(--smoke); font-size: 0.78rem; font-weight: 700; white-space: nowrap; }
        .ev-cq-images-summary {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(52px, 1fr));
          gap: 4px;
          margin-top: 8px;
        }
        .ev-cq-images-summary:empty { display: none; }
        .ev-cq-images-summary .ev-cq-images-thumb { aspect-ratio: 1; }
        .ev-cq-images-hint { color: var(--smoke); font-size: 0.76rem; margin-top: 6px; }

        /* Drop zone inside the modal. Same visual language as the inline
           trigger but slightly larger/opener since space is not tight. */
        .ev-cq-images-drop {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 18px 16px;
          background: transparent;
          border: 2px dashed var(--line-strong);
          border-radius: 10px;
          color: var(--steel);
          cursor: pointer;
          font-size: 0.95rem;
          transition: background 0.15s, border-color 0.15s;
        }
        .ev-cq-images-drop:hover { background: rgba(255,255,255,0.04); border-color: var(--gold); }
        .ev-cq-images-drop input[type="file"] { display: none; }
        .ev-cq-images-drop-label { font-weight: 700; letter-spacing: 0.03em; }

        /* Shared thumbnail styling (used both in the form-level summary and
           inside the modal grid). */
        .ev-cq-images-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
          gap: 8px;
          margin-top: 12px;
        }
        .ev-cq-images-grid:empty { margin-top: 0; }
        .ev-cq-images-thumb {
          position: relative;
          aspect-ratio: 1;
          border-radius: 8px;
          overflow: hidden;
          border: 1px solid var(--line);
          background: rgba(0,0,0,0.3);
        }
        .ev-cq-images-thumb img {
          width: 100%; height: 100%; object-fit: cover; display: block;
        }
        .ev-cq-images-remove {
          position: absolute;
          top: 4px; right: 4px;
          width: 22px; height: 22px;
          background: rgba(0,0,0,0.75);
          color: #fff;
          border: 0;
          border-radius: 50%;
          cursor: pointer;
          font-size: 15px;
          line-height: 1;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 0;
        }
        .ev-cq-images-remove:hover { background: #d14c2e; }

        /* Theme tweaks for the inline trigger and drop zones */
        body.ev-vendor .ev-cq-images-open,
        body.ev-vendor .ev-cq-images-drop { background: #fff9ea; color: #2a3326; border-color: rgba(111,144,97,0.45); }
        body.ev-vendor .ev-cq-images-open:hover,
        body.ev-vendor .ev-cq-images-drop:hover { background: #ffffff; border-color: #6f9061; }
        body.ev-art .ev-cq-images-open,
        body.ev-art .ev-cq-images-drop { background: #fffdf5; color: #1a1816; border-color: #1a1816; }
        body.ev-art .ev-cq-images-open:hover,
        body.ev-art .ev-cq-images-drop:hover { background: #ffffff; border-color: #d14c2e; }

        /* Modal overlay */
        .ev-modal {
          position: fixed; inset: 0;
          z-index: 1000;
          display: flex; align-items: center; justify-content: center;
          padding: 20px;
        }
        .ev-modal[hidden] { display: none; }
        .ev-modal-backdrop {
          position: absolute; inset: 0;
          background: rgba(0,0,0,0.6);
          backdrop-filter: blur(3px);
        }
        .ev-modal-panel {
          position: relative;
          background: var(--panel);
          border: 1px solid var(--line);
          border-radius: 16px;
          max-width: 560px;
          width: 100%;
          max-height: calc(100vh - 40px);
          display: flex;
          flex-direction: column;
          box-shadow: 0 24px 60px rgba(0,0,0,0.45);
          color: var(--text);
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
        }
        body.ev-art .ev-modal-panel {
          background: #fffaf0;
          border: 3px solid #1a1816;
          box-shadow: 12px 12px 0 #1a1816, 0 24px 60px rgba(0,0,0,0.5);
        }
        body.ev-vendor .ev-modal-panel {
          background: #ffffff;
          border: 1px solid rgba(111,144,97,0.4);
          box-shadow: 0 24px 60px rgba(144,110,80,0.35);
        }
        .ev-modal-head {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 20px;
          border-bottom: 1px solid var(--line);
        }
        body.ev-art .ev-modal-head { border-bottom-color: rgba(26,24,22,0.2); }
        .ev-modal-title {
          font-family: 'Playfair Display', Georgia, serif;
          font-weight: 800;
          font-size: 1.15rem;
          margin: 0;
          color: var(--text);
        }
        .ev-modal-close {
          background: transparent;
          border: 0;
          color: var(--muted);
          font-size: 1.8rem;
          line-height: 1;
          cursor: pointer;
          padding: 0 4px;
        }
        .ev-modal-close:hover { color: var(--text); }
        .ev-modal-body {
          padding: 16px 20px;
          overflow-y: auto;
          flex: 1 1 auto;
        }
        .ev-modal-foot {
          padding: 14px 20px;
          border-top: 1px solid var(--line);
          display: flex;
          justify-content: flex-end;
        }
        body.ev-art .ev-modal-foot { border-top-color: rgba(26,24,22,0.2); }
        .ev-modal-done {
          padding: 10px 22px;
          background: var(--gold);
          color: #fff;
          border: 0;
          border-radius: 8px;
          font-weight: 700;
          cursor: pointer;
          font-family: 'Inter', sans-serif;
          font-size: 0.92rem;
          letter-spacing: 0.04em;
        }
        body.ev-art .ev-modal-done {
          background: #1a1816;
          color: #e7b83a;
          border: 2px solid #1a1816;
          box-shadow: 4px 4px 0 #d14c2e;
        }
        body.ev-art .ev-modal-done:hover { background: #d14c2e; color: #fffaf0; }
        body.ev-vendor .ev-modal-done { background: linear-gradient(135deg, #6f9061, #a3c48d); color: #1f2a1c; }
        body:not(.ev-art):not(.ev-vendor) .ev-modal-done { background: linear-gradient(135deg, var(--gold), var(--amber)); color: #0c0c0c; }
        @media (max-width: 560px) {
          .ev-modal { padding: 0; align-items: flex-end; }
          .ev-modal-panel { border-radius: 16px 16px 0 0; max-height: 90vh; }
        }

        /* Legacy single-image custom question */
        .ev-cq-image-wrap {
          background: var(--panel-strong);
          border: 1px solid var(--line);
          border-radius: 10px;
          padding: 14px;
        }
        .ev-cq-image-wrap input[type="file"] {
          width: 100%;
          padding: 8px;
          background: transparent;
          border: 1px dashed var(--line-strong);
          border-radius: 8px;
          color: var(--steel);
          cursor: pointer;
        }
        .ev-cq-image-hint { color: var(--smoke); font-size: 0.78rem; margin-top: 8px; }
        .ev-cq-image-preview {
          max-width: 200px;
          max-height: 200px;
          border-radius: 8px;
          margin-top: 12px;
          border: 1px solid var(--line);
          display: block;
        }

        @media (max-width: 880px) {
          .ev-main-grid { grid-template-columns: 1fr; }
          .ev-side-card { position: static; }
        }

        @media (max-width: 480px) {
          .ev-page-nav { padding-top: 10px; }
          .ev-hero { padding: 22px 16px; border-radius: 16px; }
          .ev-hero-title { font-size: 1.5rem; }
          .ev-details, .ev-side-card { padding: 18px 16px; border-radius: 14px; }
          .ev-datetime-row { gap: 10px; }
        }
      </style>
    </head>
    <body${bodyClass ? ` class="${bodyClass}"` : ''}>
      ${bodyClass === 'ev-vendor' ? `<div class="spring-petals" aria-hidden="true">
        ${Array.from({ length: 14 }).map((_, i) => {
          const left = (i * 7.3) % 100;
          const dur = 9 + (i % 6) * 1.8;
          const delay = (i * 1.1) % 10;
          const size = 14 + (i % 5) * 4;
          return `<span style="left:${left.toFixed(1)}%; animation-duration:${dur.toFixed(1)}s; animation-delay:${delay.toFixed(1)}s; width:${size}px; height:${size}px;"></span>`;
        }).join('')}
      </div>` : ''}
      <div class="ev-wrap">
        <div class="ev-page-nav">
          <a href="/${escHTML(location.slug)}" class="ev-back">← ${escHTML(location.name)}</a>
          <a href="${escHTML(eventsPath)}" class="ev-all-events">All Events</a>
        </div>
        ${renderTopBanners(event.sections)}

        ${imageHero ? `
        <div class="ev-hero ev-hero-image"><img class="ev-hero-banner" src="${escHTML(mediaRenditionUrl(event.image, HERO_RENDITION))}" alt="${escHTML(event.title)}" /></div>
        ` : `
        <div class="ev-hero">
          ${isArt ? '<div class="ev-hero-statue" aria-hidden="true"></div>' : ''}
          ${renderBrandMark()}
          <div class="ev-hero-eyebrow">${escHTML(heroEyebrow)}</div>
          <h1 class="ev-hero-title">${escHTML(event.title)}</h1>
          <div class="ev-hero-divider"></div>
          <div class="ev-hero-location">${escHTML(location.name)}</div>
        </div>
        `}

        ${(Array.isArray(event.customQuestions) && event.customQuestions.some(q => q && q.type === 'images-multi')) ? `
        <div class="ev-modal" id="ev-images-modal" hidden aria-hidden="true" role="dialog" aria-modal="true" aria-labelledby="ev-images-modal-title">
          <div class="ev-modal-backdrop" data-close></div>
          <div class="ev-modal-panel">
            <div class="ev-modal-head">
              <h3 class="ev-modal-title" id="ev-images-modal-title">Your images</h3>
              <button type="button" class="ev-modal-close" data-close aria-label="Close">×</button>
            </div>
            <div class="ev-modal-body">
              <label class="ev-cq-images-drop" for="ev-images-modal-file">
                <span class="ev-cq-images-drop-label">+ Choose images</span>
                <span class="ev-cq-images-count" id="ev-images-modal-count">0 / 5</span>
                <input type="file" id="ev-images-modal-file" class="ev-cq-images-file" accept="image/jpeg,image/png,image/webp,image/gif" multiple />
              </label>
              <div class="ev-cq-images-grid" id="ev-images-modal-grid"></div>
              <div class="ev-cq-images-hint">Up to <span id="ev-images-modal-max">5</span> images, ~500&#8239;KB each. JPG/PNG/WebP.</div>
            </div>
            <div class="ev-modal-foot">
              <button type="button" class="ev-modal-done" data-close>Done</button>
            </div>
          </div>
        </div>` : ''}
        <div class="ev-main-grid${sideCard ? '' : ' ev-main-grid-full'}">
          <div class="ev-main-col">
            ${event.image && !imageHero ? `<img src="${escHTML(event.image)}" alt="${escHTML(event.title)}" class="ev-banner-img" />` : ''}

            <div class="ev-details">
              <div class="ev-datetime-row">
                <div class="ev-datetime-item">
                  <div class="ev-datetime-label">Date</div>
                  <div class="ev-datetime-value"><time datetime="${escHTML(new Date(event.startDate).toISOString())}">${escHTML(formatEventDate(event.startDate))}</time></div>
                </div>
                <div class="ev-datetime-item">
                  <div class="ev-datetime-label">Time</div>
                  <div class="ev-datetime-value">${escHTML(formatEventTime(event.startDate))}${event.endDate ? ' &ndash; ' + escHTML(formatEventTime(event.endDate)) : ''}</div>
                </div>
              </div>
              ${calendarHtml}
              ${descriptionHtml ? `<div class="ev-description">${descriptionHtml}</div>` : ''}
            </div>

            ${renderSections(event.sections)}
          </div>
          ${sideCard ? `<div class="ev-side-col">
            ${sideCard}
          </div>` : ''}
        </div>
      </div>
      <script>
        // Track which image inputs are still loading so submit can wait.
        var pendingImageReads = 0;

        // Modal-based multi-image uploader. The form shows just a trigger
        // button + compact thumbnail summary; the drop zone + full grid live
        // in a single shared modal bound to whichever question opened it.
        (function() {
          var modal = document.getElementById('ev-images-modal');
          if (!modal) return;
          var modalFile  = document.getElementById('ev-images-modal-file');
          var modalGrid  = document.getElementById('ev-images-modal-grid');
          var modalCount = document.getElementById('ev-images-modal-count');
          var modalMax   = document.getElementById('ev-images-modal-max');
          var modalTitle = document.getElementById('ev-images-modal-title');
          var activeTarget = null;

          function getArr(targetId) {
            var hidden = document.getElementById(targetId);
            if (!hidden) return [];
            try {
              var a = hidden.value ? JSON.parse(hidden.value) : [];
              return Array.isArray(a) ? a : [];
            } catch (e) { return []; }
          }
          function setArr(targetId, arr) {
            var hidden = document.getElementById(targetId);
            if (!hidden) return;
            hidden.value = arr.length ? JSON.stringify(arr) : '';
          }
          function getMax(targetId) {
            var wrap = document.querySelector('.ev-cq-images-wrap[data-target="' + targetId + '"]');
            return wrap ? (parseInt(wrap.getAttribute('data-max'), 10) || 5) : 5;
          }
          function renderFormSummary(targetId) {
            var arr = getArr(targetId);
            var max = getMax(targetId);
            var countEl = document.getElementById(targetId + '-count');
            var labelEl = document.getElementById(targetId + '-open-label');
            var summary = document.getElementById(targetId + '-summary');
            if (countEl) countEl.textContent = arr.length + ' / ' + max;
            if (labelEl) labelEl.textContent = arr.length > 0 ? 'Edit images' : '+ Add images';
            if (summary) {
              summary.innerHTML = '';
              arr.forEach(function(src) {
                var thumb = document.createElement('div');
                thumb.className = 'ev-cq-images-thumb';
                var img = document.createElement('img');
                img.src = src;
                thumb.appendChild(img);
                summary.appendChild(thumb);
              });
            }
          }
          function renderModalGrid() {
            if (!activeTarget || !modalGrid) return;
            var arr = getArr(activeTarget);
            var max = getMax(activeTarget);
            modalGrid.innerHTML = '';
            arr.forEach(function(src, idx) {
              var thumb = document.createElement('div');
              thumb.className = 'ev-cq-images-thumb';
              var img = document.createElement('img');
              img.src = src;
              thumb.appendChild(img);
              var btn = document.createElement('button');
              btn.type = 'button';
              btn.className = 'ev-cq-images-remove';
              btn.setAttribute('data-idx', String(idx));
              btn.setAttribute('aria-label', 'Remove image');
              btn.textContent = '×';
              thumb.appendChild(btn);
              modalGrid.appendChild(thumb);
            });
            if (modalCount) modalCount.textContent = arr.length + ' / ' + max;
            if (modalMax) modalMax.textContent = max;
          }
          function openModal(targetId) {
            activeTarget = targetId;
            var wrap = document.querySelector('.ev-cq-images-wrap[data-target="' + targetId + '"]');
            if (modalTitle) modalTitle.textContent = wrap ? (wrap.getAttribute('data-modal-title') || 'Your images') : 'Your images';
            modal.hidden = false;
            modal.setAttribute('aria-hidden', 'false');
            document.documentElement.style.overflow = 'hidden';
            renderModalGrid();
          }
          function closeModal() {
            if (activeTarget) renderFormSummary(activeTarget);
            activeTarget = null;
            modal.hidden = true;
            modal.setAttribute('aria-hidden', 'true');
            document.documentElement.style.overflow = '';
            if (modalFile) modalFile.value = '';
          }

          // Triggers: the per-question "+ Add images" button in the form.
          document.querySelectorAll('.ev-cq-images-open').forEach(function(btn) {
            btn.addEventListener('click', function() {
              openModal(btn.getAttribute('data-target'));
            });
          });
          // Close: backdrop click, X, Done, or Esc key.
          modal.addEventListener('click', function(e) {
            if (e.target && e.target.hasAttribute('data-close')) closeModal();
          });
          document.addEventListener('keydown', function(e) {
            if (!modal.hidden && e.key === 'Escape') closeModal();
          });
          // File picker inside the modal.
          if (modalFile) {
            modalFile.addEventListener('change', function() {
              if (!activeTarget) return;
              var max = getMax(activeTarget);
              var current = getArr(activeTarget);
              var files = Array.from(modalFile.files || []);
              var hitLimit = false;
              for (var i = 0; i < files.length; i++) {
                if (current.length + (i - (hitLimit ? 1 : 0)) >= max) { hitLimit = true; break; }
                var file = files[i];
                if (file.size > 750 * 1024) {
                  alert('"' + file.name + '" is too large. Max ~500 KB per image.');
                  continue;
                }
                pendingImageReads++;
                (function(f) {
                  var reader = new FileReader();
                  reader.onload = function() {
                    var a = getArr(activeTarget);
                    if (a.length < getMax(activeTarget)) {
                      a.push(reader.result);
                      setArr(activeTarget, a);
                      renderModalGrid();
                    }
                    pendingImageReads--;
                  };
                  reader.onerror = function() { pendingImageReads--; };
                  reader.readAsDataURL(f);
                })(file);
              }
              if (hitLimit) alert('You can upload up to ' + max + ' images.');
              modalFile.value = '';
            });
          }
          // Remove thumb inside modal.
          if (modalGrid) {
            modalGrid.addEventListener('click', function(e) {
              if (!e.target.classList || !e.target.classList.contains('ev-cq-images-remove')) return;
              var idx = parseInt(e.target.getAttribute('data-idx'), 10);
              if (isNaN(idx) || !activeTarget) return;
              var arr = getArr(activeTarget);
              arr.splice(idx, 1);
              setArr(activeTarget, arr);
              renderModalGrid();
            });
          }
          // Hydrate every form-level summary on load (so prev values render
          // after a validation redirect).
          document.querySelectorAll('.ev-cq-images-wrap').forEach(function(wrap) {
            var t = wrap.getAttribute('data-target');
            if (t) renderFormSummary(t);
          });
        })();

        // Image-upload custom questions: read file as base64 and store in
        // the corresponding hidden input so it submits with the form.
        document.addEventListener('change', function(e) {
          if (!e.target.classList || !e.target.classList.contains('ev-cq-image-file')) return;
          var input = e.target;
          var targetId = input.getAttribute('data-target');
          var hidden = document.getElementById(targetId);
          var preview = document.getElementById(targetId + '-preview');
          var file = input.files && input.files[0];
          if (!file) return;
          if (file.size > 750 * 1024) {
            alert('Image is too large. Max ~500 KB. Try a smaller photo, or leave it blank.');
            input.value = '';
            return;
          }
          pendingImageReads++;
          var reader = new FileReader();
          reader.onload = function() {
            if (hidden) hidden.value = reader.result;
            if (preview) { preview.src = reader.result; preview.style.display = ''; }
            pendingImageReads--;
          };
          reader.onerror = function() {
            pendingImageReads--;
            alert('Could not read that image. Try a different file.');
            input.value = '';
          };
          reader.readAsDataURL(file);
        });

        // Form submit handler:
        //   - if any image is still being read, wait briefly and retry
        //   - show "Submitting..." on the button so the user gets feedback
        //   - never silently fail
        var signupForm = document.querySelector('form.ev-form');
        if (signupForm) {
          signupForm.addEventListener('submit', function(e) {
            if (pendingImageReads > 0) {
              e.preventDefault();
              var btn = signupForm.querySelector('.ev-submit-btn');
              if (btn) { btn.disabled = true; btn.textContent = 'Loading image...'; }
              // Retry the submit after the FileReader finishes
              var attempts = 0;
              var poll = setInterval(function() {
                attempts++;
                if (pendingImageReads === 0) {
                  clearInterval(poll);
                  signupForm.submit();
                } else if (attempts > 60) {
                  // 6s timeout — give up and let the user fix
                  clearInterval(poll);
                  if (btn) { btn.disabled = false; btn.textContent = 'Sign Up'; }
                  alert('Image is still loading. Try removing it and submitting again.');
                }
              }, 100);
              return;
            }
            // Normal submit — just show submitting state
            var btn = signupForm.querySelector('.ev-submit-btn');
            if (btn) { btn.disabled = true; btn.textContent = 'Submitting...'; }
          });
        }
      </script>
    </body>
    </html>
  `;
}

function generateEventConfirmationPage(location, event, signup) {
  const { effectiveSignupType, isVendor: isVendorFn, isParticipant: isParticipantFn } = require('../eventSignupTypes');
  const signupType = effectiveSignupType(event);
  const isVendor = isVendorFn(event);
  const isParticipant = isParticipantFn(event);
  const { bodyClass } = resolveThemeRender(event, { isVendor });
  const isWaitlisted = signup && signup.status === 'waitlisted';
  const defaultMsg = isWaitlisted
    ? "You're on the waitlist! This event is currently full, but we'll email you right away if a spot opens up."
    : isVendor
      ? "Thanks for applying! Our team will review your application and reach out once a decision has been made."
      : isParticipant
        ? "Thanks for signing up to take part. The team reviews each signup and will email you when your slot is confirmed."
        : "Thanks for signing up! We'll see you at the event.";
  // A custom confirmation message is for confirmed signups; waitlisted guests
  // always get the waitlist explainer so they aren't told "see you there".
  const message = (!isWaitlisted && event.confirmationMessage && event.confirmationMessage.trim()) || defaultMsg;
  const messageHtml = renderRichText(message);
  const eyebrowText = isWaitlisted ? 'On the Waitlist' : isVendor ? 'Application Received' : isParticipant ? 'Signup Received' : "You're In";
  const pageTitle = isWaitlisted ? "You're on the waitlist" : isVendor ? 'Application received' : isParticipant ? 'Signup received' : "You're signed up";
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta name="theme-color" content="#0f1012">
      <title>${escHTML(pageTitle)} - ${escHTML(event.title)}</title>
      <style>
        ${vintageThemeCss()}
        ${eventThemesCss()}
        ${brandMarkCss()}
        body {
          background: linear-gradient(180deg, var(--bg-a), var(--bg-b));
          color: var(--text);
          min-height: 100vh;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px 16px;
        }
        /* Spring palette for vendor-event confirmation. Overrides CSS vars so the
           checkmark + eyebrow pick up green/peach instead of gold/amber. */
        body.ev-vendor {
          --gold: #8aa87a;
          --amber: #e8a792;
          --accent-light: #f3e6c9;
          background:
            radial-gradient(900px 380px at 14% -8%, rgba(232,167,146,0.10), transparent 60%),
            radial-gradient(1080px 540px at 100% 0%, rgba(138,168,122,0.12), transparent 58%),
            linear-gradient(180deg, var(--bg-a), var(--bg-b));
        }
        /* Art-gallery confirmation: damask backdrop, cream placard, bold type. */
        body.ev-art {
          --gold: #d14c2e;
          --amber: #e7b83a;
          background:
            url('/assets/artpopup/background.png') repeat,
            linear-gradient(180deg, #b577b0, #d9a6d2);
          color: #1a1816;
        }
        body.ev-art .ec-card {
          background: linear-gradient(180deg, #fffaf0, #f6ecd7);
          border: 3px solid #1a1816;
          box-shadow: 10px 10px 0 #1a1816, 0 22px 58px rgba(0,0,0,0.35);
        }
        body.ev-art .ec-check {
          background: linear-gradient(135deg, #d14c2e, #e7b83a);
          color: #1a1816;
          box-shadow: 6px 6px 0 #1a1816;
        }
        body.ev-art .ec-eyebrow { color: #d14c2e; font-family: 'Permanent Marker', 'Inter', sans-serif; }
        body.ev-art .ec-title { color: #1a1816; }
        body.ev-art .ec-subtitle,
        body.ev-art .ec-details,
        body.ev-art .ec-message { color: #2c2826; }
        body.ev-art .ec-message {
          background: #fffdf5;
          border-color: #1a1816;
        }
        body.ev-art .ec-message a { color: #d14c2e; }
        body.ev-art .ec-back {
          background: #1a1816;
          color: #e7b83a;
          border-color: #1a1816;
          box-shadow: 4px 4px 0 #d14c2e;
        }
        body.ev-art .ec-back:hover { background: #d14c2e; color: #fffaf0; }
        body.ev-art .ec-back-muted {
          background: transparent;
          color: #1a1816;
          border-color: #1a1816;
          box-shadow: none;
        }
        .ec-card {
          max-width: 520px;
          width: 100%;
          background: var(--panel);
          border: 1px solid var(--line);
          border-radius: 20px;
          padding: 38px 28px;
          text-align: center;
          box-shadow: 0 22px 58px var(--shadow);
        }
        .ec-check {
          width: 68px; height: 68px;
          border-radius: 50%;
          background: linear-gradient(135deg, var(--gold), var(--amber));
          color: #0c0c0c;
          font-size: 2rem;
          line-height: 68px;
          font-weight: 900;
          margin: 0 auto 18px;
          box-shadow: 0 12px 28px rgba(210,170,103,0.25);
        }
        .ec-eyebrow {
          color: var(--gold);
          font-size: 0.68rem;
          font-weight: 800;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          margin-bottom: 8px;
        }
        .ec-title {
          font-family: 'Playfair Display', Georgia, serif;
          font-size: 1.6rem;
          font-weight: 800;
          color: var(--text);
          margin-bottom: 8px;
        }
        .ec-subtitle { color: var(--muted); margin-bottom: 18px; font-size: 0.92rem; }
        .ec-message {
          color: var(--steel);
          font-size: 0.95rem;
          line-height: 1.6;
          background: var(--panel-strong);
          border: 1px solid var(--line);
          border-radius: 12px;
          padding: 18px;
          margin-bottom: 22px;
          text-align: left;
        }
        .ec-message p { margin: 0 0 10px; }
        .ec-message p:last-child { margin-bottom: 0; }
        .ec-message ul {
          margin: 8px 0 12px 1.25rem;
          padding: 0;
        }
        .ec-message li { margin-bottom: 7px; }
        .ec-message a {
          color: var(--gold);
          font-weight: 800;
          text-decoration: underline;
          text-underline-offset: 3px;
        }
        .ec-details {
          color: var(--muted);
          font-size: 0.85rem;
          line-height: 1.7;
          margin-bottom: 22px;
        }
        .ec-details strong { color: var(--text); }
        .ec-actions {
          display: flex;
          justify-content: center;
          gap: 10px;
          flex-wrap: wrap;
        }
        .ec-back {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: var(--gold);
          text-decoration: none;
          font-weight: 700;
          font-size: 0.9rem;
          padding: 10px 20px;
          border: 1px solid var(--gold);
          border-radius: 10px;
          min-height: 44px;
        }
        .ec-back:hover { background: rgba(210,170,103,0.1); }
        .ec-back-muted {
          color: var(--muted);
          border-color: var(--line);
        }
        .ec-back-muted:hover { color: var(--text); background: rgba(255,255,255,0.04); }
      </style>
    </head>
    <body${bodyClass ? ` class="${bodyClass}"` : ''}>
      <div class="ec-card">
        <div class="ec-check">✓</div>
        <div class="ec-eyebrow">${escHTML(eyebrowText)}</div>
        <div class="ec-title">${escHTML(event.title)}</div>
        <div class="ec-subtitle">${escHTML(formatEventDate(event.startDate))} &middot; ${escHTML(formatEventTime(event.startDate))}</div>

        <div class="ec-message">${messageHtml}</div>

        <div class="ec-details">
          ${isVendor ? 'Application from' : isParticipant ? 'Signup from' : 'Signed up as'} <strong>${escHTML(signup.name)}</strong>${signup.email ? `<br/>${isVendor || isParticipant ? "We'll contact you at" : 'Confirmation details may be sent to'} <strong>${escHTML(signup.email)}</strong>` : ''}
        </div>

        <div class="ec-actions">
          <a href="/${escHTML(location.slug)}/events" class="ec-back">More Events</a>
          <a href="/${escHTML(location.slug)}" class="ec-back ec-back-muted">← Back to ${escHTML(location.name)}</a>
        </div>
      </div>
    </body>
    </html>
  `;
}

// Post-submit terms gate. Shown after an artist submits the application form
// when the event has any `ackOnly: true` sections. The form on this page
// re-submits all the entered values (carried as hidden inputs) along with
// `_confirmed=true`, which tells the signup handler to actually create the
// EventSignup. Without acknowledgment, the submission is never persisted.
function generateEventTermsPage(location, event, prevValues = {}) {
  const isVendor = event.isVendorEvent === true;
  const { bodyClass } = resolveThemeRender(event, { isVendor });
  const publicPath = `/${location.slug}/events/${event.slug}`;
  const ackMarkup = renderSections(event.sections, { ackOnly: true });

  // Build hidden inputs carrying every value the user entered on step 1.
  // Arrays (e.g. images-multi answers) are JSON-stringified so the server
  // parses them the same way it did on step 1.
  const hidden = [];
  const pushHidden = (name, value) => {
    if (value === null || value === undefined || value === '') return;
    const serialized = Array.isArray(value) ? JSON.stringify(value) : String(value);
    hidden.push(`<input type="hidden" name="${escHTML(name)}" value="${escHTML(serialized)}" />`);
  };
  pushHidden('name', prevValues.name);
  pushHidden('email', prevValues.email);
  pushHidden('phone', prevValues.phone);
  pushHidden('partySize', prevValues.partySize);
  pushHidden('notes', prevValues.notes);
  for (const [k, v] of Object.entries(prevValues.customAnswers || {})) {
    pushHidden(`cq_${k}`, v);
  }
  hidden.push('<input type="hidden" name="_confirmed" value="true" />');

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta name="theme-color" content="#0f1012">
      <title>Please review — ${escHTML(event.title)}</title>
      <style>
        ${vintageThemeCss()}
        ${eventThemesCss()}
        ${brandMarkCss()}
        body {
          background:
            radial-gradient(900px 380px at 14% -8%, rgba(255,255,255,0.06), transparent 60%),
            radial-gradient(1080px 540px at 100% 0%, rgba(111,118,127,0.10), transparent 58%),
            linear-gradient(180deg, var(--bg-a) 0%, #0d0e10 38%, var(--bg-b) 100%);
          color: var(--text);
          min-height: 100vh;
          font-family: "Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, serif;
        }
        /* Match the art-gallery theme vars/background when applicable */
        body.ev-art {
          --gold: #d14c2e;
          --amber: #e7b83a;
          --text: #1a1816;
          --steel: #2c2826;
          --muted: #6b6357;
          --panel: #fffaf0;
          --line: rgba(26,24,22,0.35);
          background:
            url('/assets/artpopup/background.png') repeat,
            linear-gradient(180deg, #b577b0, #d9a6d2);
          color: var(--text);
        }
        body.ev-vendor {
          --gold: #6f9061;
          --amber: #d97a5e;
          --text: #2a3326;
          --steel: #3f4a38;
          --muted: #6b7a64;
          --panel: #ffffff;
          --line: rgba(111,144,97,0.22);
          background:
            radial-gradient(900px 380px at 14% -8%, rgba(249,193,173,0.55), transparent 60%),
            radial-gradient(1080px 540px at 100% 0%, rgba(163,196,141,0.42), transparent 58%),
            linear-gradient(180deg, #fbf4e4 0%, #f8ead1 50%, #f1e0c7 100%);
        }
        .et-wrap { max-width: 780px; margin: 0 auto; padding: 32px 16px 72px; }
        .et-header {
          text-align: center;
          padding: 30px 24px;
          margin-bottom: 22px;
          background: linear-gradient(180deg, #fffaf0, #f6ecd7);
          border: 3px solid #1a1816;
          border-radius: 16px;
          box-shadow: 10px 10px 0 #1a1816, 0 22px 48px rgba(0,0,0,0.3);
        }
        body.ev-vendor .et-header {
          background: linear-gradient(180deg, #ffffff, #fff7e8);
          border-color: rgba(111,144,97,0.35);
          box-shadow: 0 16px 40px rgba(144,110,80,0.22);
        }
        body:not(.ev-art):not(.ev-vendor) .et-header {
          background: var(--panel);
          border: 1px solid var(--line);
          box-shadow: 0 18px 40px var(--shadow);
        }
        .et-eyebrow {
          font-size: 0.72rem;
          font-weight: 800;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          color: #d14c2e;
          margin-bottom: 10px;
          font-family: 'Permanent Marker', 'Inter', sans-serif;
        }
        body.ev-vendor .et-eyebrow { color: #d97a5e; font-family: inherit; }
        .et-title {
          font-family: 'Playfair Display', Georgia, serif;
          font-weight: 900;
          font-size: clamp(1.6rem, 5vw, 2.2rem);
          color: var(--text);
          margin: 0 0 6px;
        }
        .et-sub { color: var(--muted); font-size: 0.95rem; }
        .et-ack-form {
          background: linear-gradient(180deg, #fffaf0, #f6ecd7);
          border: 3px solid #1a1816;
          border-radius: 16px;
          box-shadow: 10px 10px 0 #1a1816, 0 22px 48px rgba(0,0,0,0.3);
          padding: 26px;
          margin-top: 26px;
        }
        body.ev-vendor .et-ack-form {
          background: #ffffff;
          border: 1px solid rgba(111,144,97,0.35);
          box-shadow: 0 16px 40px rgba(144,110,80,0.22);
        }
        body:not(.ev-art):not(.ev-vendor) .et-ack-form {
          background: var(--panel);
          border: 1px solid var(--line);
          box-shadow: 0 18px 40px var(--shadow);
        }
        .et-check {
          display: flex;
          gap: 12px;
          align-items: flex-start;
          padding: 14px 16px;
          border: 2px dashed rgba(26,24,22,0.35);
          border-radius: 10px;
          cursor: pointer;
          font-size: 0.96rem;
          line-height: 1.5;
          color: var(--text);
          font-family: 'Inter', -apple-system, sans-serif;
        }
        body.ev-vendor .et-check { border-color: rgba(111,144,97,0.4); }
        .et-check input { margin-top: 4px; transform: scale(1.15); cursor: pointer; }
        .et-submit {
          display: block;
          width: 100%;
          margin-top: 22px;
          padding: 18px 20px;
          background: #1a1816;
          color: #e7b83a;
          border: 2px solid #1a1816;
          border-radius: 12px;
          font-size: 1.05rem;
          font-weight: 800;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          cursor: pointer;
          box-shadow: 6px 6px 0 #d14c2e;
          font-family: 'Permanent Marker', 'Inter', sans-serif;
          transition: transform 0.1s, box-shadow 0.15s;
        }
        .et-submit:hover { background: #d14c2e; color: #fffaf0; transform: translate(-2px, -2px); box-shadow: 8px 8px 0 #1a1816; }
        .et-submit:disabled { opacity: 0.45; cursor: not-allowed; box-shadow: 6px 6px 0 rgba(0,0,0,0.25); }
        body.ev-vendor .et-submit {
          background: linear-gradient(135deg, #6f9061 0%, #a3c48d 45%, #f2c094 100%);
          color: #1f2a1c;
          border-color: transparent;
          box-shadow: 0 14px 32px rgba(111,144,97,0.35);
          font-family: 'Inter', sans-serif;
          text-transform: uppercase;
        }
        body.ev-vendor .et-submit:hover { filter: brightness(1.05); transform: none; box-shadow: 0 18px 40px rgba(217,122,94,0.35); }
        .et-back {
          display: inline-block;
          margin-top: 18px;
          color: var(--muted);
          font-size: 0.88rem;
          text-decoration: underline;
          font-family: 'Inter', sans-serif;
        }
        /* Reuse the same section card styles as the main event page for the
           ack sections so they feel native. Minimal inline style block. */
        .ev-sec { margin-bottom: 22px; }
        .ev-sec-text {
          background: linear-gradient(180deg, #fffaf0, #f6ecd7);
          border: 3px solid #1a1816;
          border-radius: 14px;
          padding: 24px 26px;
          box-shadow: 8px 8px 0 #1a1816, 0 16px 30px rgba(0,0,0,0.2);
        }
        body.ev-vendor .ev-sec-text {
          background: linear-gradient(180deg, #ffffff, #fff7e8);
          border: 1px solid rgba(111,144,97,0.28);
          box-shadow: 0 10px 28px rgba(144,110,80,0.14);
        }
        .ev-sec-heading {
          font-family: 'Playfair Display', Georgia, serif;
          font-weight: 900;
          font-size: 1.3rem;
          margin-bottom: 12px;
          color: var(--text);
        }
        .ev-sec-heading::after {
          content: '';
          display: block;
          width: 60px;
          height: 3px;
          background: linear-gradient(90deg, #d14c2e, #e7b83a);
          margin-top: 8px;
        }
        body.ev-vendor .ev-sec-heading::after { background: linear-gradient(90deg, #6f9061, #d97a5e); }
        .ev-sec-body { color: var(--steel); font-size: 0.98rem; line-height: 1.65; font-family: 'Inter', -apple-system, sans-serif; }
        .ev-sec-body p { margin-bottom: 10px; }
        .ev-sec-body p:last-child { margin-bottom: 0; }
      </style>
    </head>
    <body${bodyClass ? ` class="${bodyClass}"` : ''}>
      <div class="et-wrap">
        <div class="et-header">
          <div class="et-eyebrow">Almost There</div>
          <h1 class="et-title">${escHTML(event.title)}</h1>
          <div class="et-sub">Read the details below, check the box, and submit to finish your application.</div>
        </div>
        ${ackMarkup}
        <form method="POST" action="${escHTML(publicPath)}/signup" class="et-ack-form" id="et-form">
          ${hidden.join('\n          ')}
          <label class="et-check">
            <input type="checkbox" id="et-agree" name="_agreed" value="yes" required />
            <span>I have read and understand the information above, and I want to submit my application.</span>
          </label>
          <button type="submit" class="et-submit" id="et-submit" disabled>Submit my application</button>
          <a href="${escHTML(publicPath)}" class="et-back">← Back to the event page</a>
        </form>
      </div>
      <script>
        (function() {
          var cb = document.getElementById('et-agree');
          var btn = document.getElementById('et-submit');
          if (!cb || !btn) return;
          cb.addEventListener('change', function() { btn.disabled = !cb.checked; });
          document.getElementById('et-form').addEventListener('submit', function() {
            btn.disabled = true;
            btn.textContent = 'Submitting...';
          });
        })();
      </script>
    </body>
    </html>
  `;
}

module.exports = {
  generateEventPage,
  generateEventConfirmationPage,
  generateEventTermsPage,
  eventStatus,
  formatEventDate,
  formatEventTime,
  buildEventIcs,
};
