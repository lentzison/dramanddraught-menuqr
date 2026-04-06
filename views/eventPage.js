const { vintageThemeCss } = require('./publicTheme');
const { brandMarkCss, renderBrandMark } = require('./brandMark');

function escHTML(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

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
  const promoteFrom = event.promoteFrom ? new Date(event.promoteFrom) : null;
  if (promoteFrom && now < promoteFrom) return { key: 'upcoming', message: `Signups open ${formatEventDate(promoteFrom)} at ${formatEventTime(promoteFrom)}.` };
  const promoteUntil = event.promoteUntil ? new Date(event.promoteUntil) : (event.startDate ? new Date(event.startDate) : null);
  if (promoteUntil && now > promoteUntil) return { key: 'closed', message: 'Signups for this event have closed.' };
  if (event.capacity && signupCount >= event.capacity) return { key: 'full', message: 'This event is fully booked.' };
  return { key: 'open' };
}

function renderStatusBanner(status, event) {
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
    return `<label for="cq-${escHTML(q.id)}">${escHTML(q.label)}${reqMark}</label>
      <input type="text" id="cq-${escHTML(q.id)}" name="cq_${escHTML(q.id)}" value="${escHTML(prev)}"${req} />`;
  }).join('');
}

function generateEventPage(location, event, signupCount, options = {}) {
  const { prevValues = {}, errorMessage = '' } = options;
  const status = eventStatus(event, signupCount);
  const canSignup = status.key === 'open';
  const publicPath = `/${location.slug}/events/${event.slug}`;

  const descriptionHtml = event.description
    ? event.description.split(/\n\n+/).map(p => `<p>${escHTML(p).replace(/\n/g, '<br/>')}</p>`).join('')
    : '';

  const form = canSignup ? `
    <form method="POST" action="${escHTML(publicPath)}/signup" class="ev-form">
      ${errorMessage ? `<div class="ev-error">${escHTML(errorMessage)}</div>` : ''}

      <label for="ev-name">Name <span style="color:var(--amber)">*</span></label>
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
        <label for="ev-notes">Notes or Special Requests</label>
        <textarea id="ev-notes" name="notes" rows="3">${escHTML(prevValues.notes || '')}</textarea>
      ` : ''}

      ${renderCustomFields(event, prevValues)}

      <button type="submit" class="ev-submit-btn">Sign Up</button>
    </form>
  ` : '';

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
          background: linear-gradient(180deg, var(--bg-a), var(--bg-b));
          color: var(--text);
          min-height: 100vh;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
        }
        .ev-wrap {
          max-width: 640px;
          margin: 0 auto;
          padding: 0 16px 60px;
        }
        .ev-back {
          display: inline-block;
          color: var(--muted);
          font-size: 0.82rem;
          text-decoration: none;
          padding: 14px 0 10px;
        }
        .ev-back:hover { color: var(--gold); }
        .ev-hero {
          background:
            linear-gradient(180deg, rgba(24,25,28,0.95), rgba(15,16,18,0.98)),
            radial-gradient(circle at top, rgba(210,170,103,0.1), transparent 60%);
          border: 1px solid var(--line);
          border-radius: 20px;
          padding: 26px 22px;
          margin-bottom: 22px;
          box-shadow: 0 18px 48px var(--shadow);
          text-align: center;
        }
        .ev-hero .brand-mark { max-width: 200px; margin: 0 auto 14px; }
        .ev-hero-eyebrow {
          color: var(--gold);
          font-size: 0.68rem;
          font-weight: 800;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          margin-bottom: 6px;
        }
        .ev-hero-title {
          font-family: 'Playfair Display', Georgia, serif;
          font-size: 1.8rem;
          font-weight: 800;
          line-height: 1.15;
          color: var(--text);
          margin-bottom: 10px;
        }
        .ev-hero-location {
          color: var(--muted);
          font-size: 0.9rem;
        }
        .ev-banner-img {
          width: 100%;
          max-height: 320px;
          object-fit: cover;
          border-radius: 16px;
          margin-bottom: 22px;
          border: 1px solid var(--line);
        }
        .ev-details {
          background: var(--panel);
          border: 1px solid var(--line);
          border-radius: 16px;
          padding: 22px;
          margin-bottom: 20px;
        }
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
        .ev-status-cancelled { background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.3); }
        .ev-status-cancelled .ev-status-title { color: #f87171; }
        .ev-status-upcoming { background: rgba(96,165,250,0.08); border: 1px solid rgba(96,165,250,0.3); }
        .ev-status-upcoming .ev-status-title { color: #93c5fd; }
        .ev-status-closed { background: rgba(251,146,60,0.08); border: 1px solid rgba(251,146,60,0.3); }
        .ev-status-closed .ev-status-title { color: #fdba74; }

        /* ─── Page sections ─── */
        .ev-sec {
          margin-bottom: 22px;
        }
        .ev-sec-text {
          background: var(--panel);
          border: 1px solid var(--line);
          border-radius: 16px;
          padding: 22px 24px;
        }
        .ev-sec-heading {
          font-family: 'Playfair Display', Georgia, serif;
          color: var(--gold);
          font-size: 1.3rem;
          font-weight: 800;
          margin-bottom: 12px;
          line-height: 1.2;
        }
        .ev-sec-body {
          color: var(--steel);
          font-size: 0.95rem;
          line-height: 1.65;
        }
        .ev-sec-body p { margin-bottom: 10px; }
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
          background: var(--panel);
          border: 1px solid var(--line);
          border-radius: 16px;
          padding: 22px 24px;
        }
        .ev-sec-details-title {
          font-family: 'Playfair Display', Georgia, serif;
          color: var(--gold);
          font-size: 1.15rem;
          font-weight: 800;
          margin-bottom: 14px;
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
          background: linear-gradient(135deg, rgba(210,170,103,0.12), rgba(138,86,53,0.06)) !important;
          border-color: rgba(210,170,103,0.35) !important;
        }
        .ev-sec-bg-dark {
          background: #050505 !important;
          border-color: rgba(255,255,255,0.06) !important;
        }
        .ev-sec-bg-transparent {
          background: transparent !important;
          border: none !important;
          padding-left: 0 !important;
          padding-right: 0 !important;
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
          background: var(--panel);
          border: 1px solid var(--line);
          border-radius: 16px;
          padding: 24px 22px 28px;
          margin-bottom: 20px;
        }
        .ev-form label {
          display: block;
          color: var(--muted);
          font-size: 0.78rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          margin: 14px 0 6px;
        }
        .ev-form label:first-child { margin-top: 0; }
        .ev-form input,
        .ev-form textarea,
        .ev-form select {
          width: 100%;
          padding: 13px 14px;
          background: var(--panel-strong);
          border: 1px solid var(--line);
          border-radius: 10px;
          color: var(--text);
          font-size: 1rem;
          font-family: inherit;
        }
        .ev-form input:focus,
        .ev-form textarea:focus,
        .ev-form select:focus {
          outline: none;
          border-color: var(--gold);
          background: var(--panel-soft);
        }
        .ev-form textarea { resize: vertical; min-height: 72px; }
        .ev-submit-btn {
          width: 100%;
          margin-top: 22px;
          padding: 15px 20px;
          background: linear-gradient(135deg, var(--gold), var(--amber));
          color: #0c0c0c;
          border: none;
          border-radius: 12px;
          font-size: 1rem;
          font-weight: 800;
          letter-spacing: 0.04em;
          cursor: pointer;
          transition: filter 0.2s, transform 0.05s;
        }
        .ev-submit-btn:hover { filter: brightness(1.1); }
        .ev-submit-btn:active { transform: translateY(1px); }
        .ev-error {
          background: rgba(239,68,68,0.1);
          border: 1px solid rgba(239,68,68,0.3);
          color: #fca5a5;
          padding: 12px 14px;
          border-radius: 10px;
          margin-bottom: 16px;
          font-size: 0.9rem;
        }

        @media (max-width: 480px) {
          .ev-hero { padding: 22px 16px; border-radius: 16px; }
          .ev-hero-title { font-size: 1.5rem; }
          .ev-details, .ev-form { padding: 18px 16px; border-radius: 14px; }
          .ev-datetime-row { gap: 10px; }
        }
      </style>
    </head>
    <body>
      <div class="ev-wrap">
        <a href="/${escHTML(location.slug)}" class="ev-back">← ${escHTML(location.name)}</a>

        <div class="ev-hero">
          ${renderBrandMark()}
          <div class="ev-hero-eyebrow">Event</div>
          <h1 class="ev-hero-title">${escHTML(event.title)}</h1>
          <div class="ev-hero-location">${escHTML(location.name)}</div>
        </div>

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
          ${event.capacity ? `<div class="ev-capacity">${signupCount} / ${event.capacity} signed up</div>` : ''}
        </div>

        ${renderSections(event.sections)}

        ${renderStatusBanner(status, event)}

        ${form}
      </div>
    </body>
    </html>
  `;
}

function generateEventConfirmationPage(location, event, signup) {
  const defaultMsg = "Thanks for signing up! We'll see you at the event.";
  const message = (event.confirmationMessage && event.confirmationMessage.trim()) || defaultMsg;
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta name="theme-color" content="#0f1012">
      <title>You're signed up - ${escHTML(event.title)}</title>
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
        .ec-back {
          display: inline-block;
          color: var(--gold);
          text-decoration: none;
          font-weight: 700;
          font-size: 0.9rem;
          padding: 10px 20px;
          border: 1px solid var(--gold);
          border-radius: 10px;
        }
        .ec-back:hover { background: rgba(210,170,103,0.1); }
      </style>
    </head>
    <body>
      <div class="ec-card">
        <div class="ec-check">✓</div>
        <div class="ec-eyebrow">You're In</div>
        <div class="ec-title">${escHTML(event.title)}</div>
        <div class="ec-subtitle">${escHTML(formatEventDate(event.startDate))} &middot; ${escHTML(formatEventTime(event.startDate))}</div>

        <div class="ec-message">${escHTML(message).replace(/\n/g, '<br/>')}</div>

        <div class="ec-details">
          Signed up as <strong>${escHTML(signup.name)}</strong>${signup.email ? `<br/>Confirmation details may be sent to <strong>${escHTML(signup.email)}</strong>` : ''}
        </div>

        <a href="/${escHTML(location.slug)}" class="ec-back">← Back to ${escHTML(location.name)}</a>
      </div>
    </body>
    </html>
  `;
}

module.exports = {
  generateEventPage,
  generateEventConfirmationPage,
  eventStatus,
};
