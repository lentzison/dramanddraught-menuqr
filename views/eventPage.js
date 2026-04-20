const { vintageThemeCss } = require('./publicTheme');
const { brandMarkCss, renderBrandMark } = require('./brandMark');
const { escHTML } = require('./escapeHtml');

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
  return /^data:image\/(jpeg|jpg|png|gif|webp);base64,/i.test(src) || /^https?:\/\//i.test(src);
}

function bgStyleClass(s) {
  const v = s && s.bgStyle;
  if (v === 'gold') return ' ev-sec-bg-gold';
  if (v === 'dark') return ' ev-sec-bg-dark';
  if (v === 'transparent') return ' ev-sec-bg-transparent';
  return ''; // default — no extra class
}

// Render an array of page sections.
// Types: text, image, details, button, video, divider, hero, twocol, schedule, faq
function renderSections(sections) {
  if (!Array.isArray(sections) || sections.length === 0) return '';
  return sections.map(s => {
    const type = s && s.type;

    if (type === 'text') {
      const heading = s.heading ? `<h2 class="ev-sec-heading">${escHTML(s.heading)}</h2>` : '';
      const body = s.body
        ? s.body.split(/\n\n+/).map(p => `<p>${escHTML(p).replace(/\n/g, '<br/>')}</p>`).join('')
        : '';
      const align = (s.align === 'center' || s.align === 'right') ? ` ev-sec-align-${s.align}` : '';
      return `<section class="ev-sec ev-sec-text${bgStyleClass(s)}${align}">${heading}<div class="ev-sec-body">${body}</div></section>`;
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
              <div class="ev-sec-details-value">${escHTML(it.value || '')}</div>
            </div>
          `).join('')}
        </div>
      </section>`;
    }

    if (type === 'button') {
      if (!s.url) return '';
      const styleClass = s.style === 'secondary' ? 'ev-sec-btn-secondary' : 'ev-sec-btn-primary';
      return `<section class="ev-sec ev-sec-button${bgStyleClass(s)}">
        <a href="${escHTML(s.url)}" class="ev-sec-btn ${styleClass}" target="_blank" rel="noopener noreferrer">${escHTML(s.label || 'Learn More')}</a>
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
      const body = s.body
        ? s.body.split(/\n\n+/).map(p => `<p>${escHTML(p).replace(/\n/g, '<br/>')}</p>`).join('')
        : '';
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
                ${it.description ? `<div class="ev-sec-schedule-desc">${escHTML(it.description)}</div>` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      </section>`;
    }

    if (type === 'cocktailmenu') {
      const items = Array.isArray(s.items) ? s.items.filter(it => it && it.name) : [];
      if (items.length === 0 && !s.title) return '';
      const rows = items.map(it => `
        <div class="cm-row">
          <div class="cm-row-head">
            <div class="cm-row-name">${escHTML(it.name || '')}</div>
            <div class="cm-row-meta">
              ${it.abv ? `<span class="cm-row-abv">${escHTML(it.abv)}</span>` : ''}
              ${it.creator ? `<span class="cm-row-creator">${escHTML(it.creator)}</span>` : ''}
            </div>
          </div>
          ${it.ingredients ? `<div class="cm-row-pour">${escHTML(it.ingredients)}</div>` : ''}
          ${it.vibe ? `<div class="cm-row-vibe">${escHTML(it.vibe)}</div>` : ''}
        </div>
      `).join('');
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
              <div class="ev-sec-faq-answer">${escHTML(it.answer || '').replace(/\n/g, '<br/>')}</div>
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
  const spotsLeft = event.capacity ? Math.max(event.capacity - signupCount, 0) : null;
  const isVendor = event.isVendorEvent === true;

  // Vendor-event copy: re-label the form as an application and hint that
  // there's a review step before the vendor is confirmed.
  const heroEyebrow = isVendor ? 'Vendor Applications' : 'Presents';
  const sideKicker = isVendor ? 'Vendor Application' : 'Reserve Your Spot';
  const sideTitle = isVendor ? 'Apply to be a vendor' : 'Join this event';
  const sideCopy = isVendor
    ? 'Tell us about your business below. Our team reviews each application and will reach out once a decision has been made.'
    : 'Signups are open now.';
  const submitLabel = isVendor ? 'Submit Application' : 'Sign Up';

  const descriptionHtml = event.description
    ? event.description.split(/\n\n+/).map(p => `<p>${escHTML(p).replace(/\n/g, '<br/>')}</p>`).join('')
    : '';

  const signupForm = canSignup ? `
    <form method="POST" action="${escHTML(publicPath)}/signup" class="ev-form">
      ${errorMessage ? `<div class="ev-error">${escHTML(errorMessage)}</div>` : ''}

      <label for="ev-name">${isVendor ? 'Contact Name' : 'Name'} <span style="color:var(--amber)">*</span></label>
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
        <label for="ev-notes">${isVendor ? 'Anything else we should know?' : 'Notes or Special Requests'}</label>
        <textarea id="ev-notes" name="notes" rows="3">${escHTML(prevValues.notes || '')}</textarea>
      ` : ''}

      ${renderCustomFields(event, prevValues)}

      <button type="submit" class="ev-submit-btn">${escHTML(submitLabel)}</button>
    </form>
  ` : '';

  const sideCard = canSignup ? `
    <aside class="ev-side-card">
      <div class="ev-side-kicker">${escHTML(sideKicker)}</div>
      <h2 class="ev-side-title">${escHTML(sideTitle)}</h2>
      <p class="ev-side-copy">${escHTML(sideCopy)}</p>
      ${signupForm}
    </aside>
  ` : status.key === 'no-signups' ? `
    <aside class="ev-side-card">
      <div class="ev-side-kicker">Event Details</div>
      <h2 class="ev-side-title">No signup required</h2>
      <p class="ev-side-copy">This page is informational only. Check the event details and come by at the listed time.</p>
      <div class="ev-side-actions">
        <a href="${escHTML(eventsPath)}" class="ev-side-link">Browse all events</a>
        <a href="/${escHTML(location.slug)}" class="ev-side-link ev-side-link-muted">Back to ${escHTML(location.name)}</a>
      </div>
    </aside>
  ` : `
    <aside class="ev-side-card">
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
      <style>
        ${vintageThemeCss()}
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
        .ev-error {
          background: rgba(239,68,68,0.1);
          border: 1px solid rgba(239,68,68,0.3);
          color: #fca5a5;
          padding: 12px 14px;
          border-radius: 10px;
          margin-bottom: 16px;
          font-size: 0.9rem;
        }
        /* Image upload custom question */
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
    <body${isVendor ? ' class="ev-vendor"' : ''}>
      ${isVendor ? `<div class="spring-petals" aria-hidden="true">
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

        <div class="ev-hero">
          ${renderBrandMark()}
          <div class="ev-hero-eyebrow">${escHTML(heroEyebrow)}</div>
          <h1 class="ev-hero-title">${escHTML(event.title)}</h1>
          <div class="ev-hero-divider"></div>
          <div class="ev-hero-location">${escHTML(location.name)}</div>
        </div>

        <div class="ev-main-grid">
          <div class="ev-main-col">
            ${event.image ? `<img src="${escHTML(event.image)}" alt="${escHTML(event.title)}" class="ev-banner-img" />` : ''}

            <div class="ev-details">
              <div class="ev-datetime-row">
                <div class="ev-datetime-item">
                  <div class="ev-datetime-label">Date</div>
                  <div class="ev-datetime-value">${escHTML(formatEventDate(event.startDate))}</div>
                </div>
                <div class="ev-datetime-item">
                  <div class="ev-datetime-label">Time</div>
                  <div class="ev-datetime-value">${escHTML(formatEventTime(event.startDate))}${event.endDate ? ' &ndash; ' + escHTML(formatEventTime(event.endDate)) : ''}</div>
                </div>
              </div>
              ${descriptionHtml ? `<div class="ev-description">${descriptionHtml}</div>` : ''}
              <div class="ev-detail-chips">
                ${event.signupsEnabled === false ? '<span class="ev-detail-chip">Info only</span>' : ''}
              </div>
            </div>

            ${renderSections(event.sections)}
          </div>
          <div class="ev-side-col">
            ${sideCard}
          </div>
        </div>
      </div>
      <script>
        // Track which image inputs are still loading so submit can wait.
        var pendingImageReads = 0;

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
  const isVendor = event.isVendorEvent === true;
  const defaultMsg = isVendor
    ? "Thanks for applying! Our team will review your application and reach out once a decision has been made."
    : "Thanks for signing up! We'll see you at the event.";
  const message = (event.confirmationMessage && event.confirmationMessage.trim()) || defaultMsg;
  const eyebrowText = isVendor ? 'Application Received' : "You're In";
  const pageTitle = isVendor ? 'Application received' : "You're signed up";
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
    <body${isVendor ? ' class="ev-vendor"' : ''}>
      <div class="ec-card">
        <div class="ec-check">✓</div>
        <div class="ec-eyebrow">${escHTML(eyebrowText)}</div>
        <div class="ec-title">${escHTML(event.title)}</div>
        <div class="ec-subtitle">${escHTML(formatEventDate(event.startDate))} &middot; ${escHTML(formatEventTime(event.startDate))}</div>

        <div class="ec-message">${escHTML(message).replace(/\n/g, '<br/>')}</div>

        <div class="ec-details">
          ${isVendor ? 'Application from' : 'Signed up as'} <strong>${escHTML(signup.name)}</strong>${signup.email ? `<br/>${isVendor ? "We'll contact you at" : 'Confirmation details may be sent to'} <strong>${escHTML(signup.email)}</strong>` : ''}
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

module.exports = {
  generateEventPage,
  generateEventConfirmationPage,
  eventStatus,
  formatEventDate,
  formatEventTime,
};
