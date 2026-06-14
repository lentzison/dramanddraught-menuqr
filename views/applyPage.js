const { getOpenState } = require('../helpers');
const { vintageThemeCss } = require('./publicTheme');
const { brandMarkCss, renderBrandMark } = require('./brandMark');
const { escHTML } = require('./escapeHtml');

const POSITIONS = ['Bartender', 'Barback', 'Server', 'Host', 'Floor Manager', 'Other'];
const DAYS = [
  { key: 'mon', label: 'Mon' },
  { key: 'tue', label: 'Tue' },
  { key: 'wed', label: 'Wed' },
  { key: 'thu', label: 'Thu' },
  { key: 'fri', label: 'Fri' },
  { key: 'sat', label: 'Sat' },
  { key: 'sun', label: 'Sun' },
];
const SHIFTS = [
  { key: 'day', label: 'Day' },
  { key: 'evening', label: 'Evening' },
  { key: 'late', label: 'Late night' },
];

function pageShell(location, title, bodyHtml) {
  const openState = getOpenState(location);
  const statusClass = openState.isOpen === true ? 'status-open'
    : openState.isOpen === false ? 'status-closed' : 'status-unknown';
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <meta name="theme-color" content="#0f1012" />
      <title>${escHTML(title)} — ${escHTML(location.name)} — Dram &amp; Draught</title>
      <style>
        ${vintageThemeCss()}
        ${brandMarkCss()}
        .apply-shell { max-width: 720px; margin: 0 auto; padding: 24px 18px 96px; }
        .apply-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
        .apply-back { color: var(--gold); font-size: 0.85rem; text-decoration: none; }
        .apply-back:hover { text-decoration: underline; }
        .apply-title { font-family: var(--brand-display, 'Mostra One', 'Futura', sans-serif); font-size: 2.1rem; line-height: 1.05; margin: 0 0 4px; color: #f5f1e6; letter-spacing: 0.01em; }
        .apply-sub { color: #a8acb3; font-size: 0.9rem; margin: 0 0 22px; }
        .apply-card { background: rgba(20,21,24,0.85); border: 1px solid rgba(212,175,55,0.18); border-radius: 14px; padding: 22px 20px; margin-bottom: 18px; }
        .apply-notice { background: rgba(20,21,24,0.6); border-left: 3px solid var(--gold); border-color: rgba(212,175,55,0.35); }
        .apply-commit-notice {
          margin-top: 14px;
          padding: 12px 14px;
          background: rgba(212,175,55,0.08);
          border: 1px solid rgba(212,175,55,0.3);
          border-radius: 10px;
          color: #e8e2d2;
          font-size: 0.88rem;
          line-height: 1.55;
        }
        .apply-commit-notice strong { color: var(--gold); }
        .apply-section-title { font-family: var(--brand-display, 'Mostra One', 'Futura', sans-serif); font-size: 1.05rem; color: var(--gold); margin: 0 0 14px; letter-spacing: 0.08em; text-transform: uppercase; }
        .apply-row { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 12px; }
        @media (max-width: 560px) { .apply-row { grid-template-columns: 1fr; } }
        .apply-field { display: block; }
        .apply-field label, .apply-label { display: block; font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.06em; color: #c8b770; margin-bottom: 6px; font-weight: 600; }
        .apply-req { color: #f7c4c4; margin-left: 2px; font-weight: 800; }
        .apply-field.has-error input, .apply-field.has-error select, .apply-field.has-error textarea { border-color: rgba(247,196,196,0.6); box-shadow: 0 0 0 2px rgba(247,196,196,0.18); }
        .apply-field-error { color: #f7c4c4; font-size: 0.78rem; margin-top: 4px; }
        .apply-field input[type="text"],
        .apply-field input[type="email"],
        .apply-field input[type="tel"],
        .apply-field input[type="number"],
        .apply-field input[type="date"],
        .apply-field select,
        .apply-field textarea {
          width: 100%; box-sizing: border-box;
          background: #15161a; color: #f5f1e6;
          border: 1px solid rgba(212,175,55,0.25);
          border-radius: 8px; padding: 10px 12px;
          font-size: 16px; font-family: inherit;
        }
        .apply-field textarea { min-height: 88px; resize: vertical; }
        .apply-field input:focus, .apply-field select:focus, .apply-field textarea:focus {
          outline: none; border-color: var(--gold); box-shadow: 0 0 0 2px rgba(212,175,55,0.18);
        }
        .apply-helper { font-size: 0.75rem; color: #8d9299; margin-top: 4px; }
        .avail-grid { display: grid; grid-template-columns: 100px repeat(3, 1fr); gap: 6px 10px; align-items: center; }
        .avail-grid .avail-day { color: #f5f1e6; font-size: 0.85rem; }
        .avail-grid .avail-cell { display: flex; align-items: center; gap: 6px; color: #a8acb3; font-size: 0.82rem; }
        .avail-grid .avail-cell input { accent-color: var(--gold); }
        .avail-head { color: #c8b770; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.06em; font-weight: 700; }
        .yesno-pair { display: flex; gap: 14px; }
        .yesno-pair label { display: inline-flex; align-items: center; gap: 6px; color: #f5f1e6; font-size: 0.92rem; }
        .resume-row { display: flex; flex-direction: column; gap: 6px; }
        .resume-row input[type="file"] { color: #f5f1e6; font-size: 0.88rem; }
        .apply-actions { display: flex; justify-content: flex-end; gap: 12px; margin-top: 18px; }
        .apply-btn {
          background: linear-gradient(180deg, #d4af37 0%, #b88e1c 100%);
          color: #1a1410; font-weight: 700; border: none; border-radius: 999px;
          padding: 12px 26px; font-size: 0.95rem; cursor: pointer;
          box-shadow: 0 8px 22px rgba(212,175,55,0.18);
        }
        .apply-btn:hover { filter: brightness(1.05); }
        .apply-error { background: rgba(180,40,40,0.15); border: 1px solid rgba(180,40,40,0.35); color: #f7c4c4; padding: 12px 14px; border-radius: 10px; margin-bottom: 16px; font-size: 0.9rem; }
        .apply-success { padding: 28px 22px; text-align: center; }
        .apply-success h1 { font-family: var(--brand-display, 'Mostra One', 'Futura', sans-serif); color: var(--gold); margin: 0 0 8px; font-size: 2rem; letter-spacing: 0.02em; }
        .apply-success p { color: #d6d2c5; line-height: 1.5; }
        .apply-success a.action-link { display: inline-block; margin-top: 16px; color: var(--gold); text-decoration: none; font-size: 0.92rem; border: 1px solid rgba(212,175,55,0.3); padding: 10px 20px; border-radius: 999px; }
      </style>
    </head>
    <body class="${statusClass}">
      <div class="apply-shell">
        <div class="apply-head">
          <a class="apply-back" href="/${escHTML(location.slug)}">&larr; ${escHTML(location.name)}</a>
          ${renderBrandMark()}
        </div>
        ${bodyHtml}
      </div>
    </body>
    </html>`;
}

// Google Jobs structured data — one schema.org JobPosting per open role gets
// the openings indexed in Google's job search for free. Rendered only on the
// live apply page (the route already gates on location.isHiring).
const JOB_BLURBS = {
  Bartender: 'Build consistent, spec-driven cocktails in a whiskey-forward neighborhood bar. Warm, guest-first hospitality; product curiosity encouraged and trained.',
  Barback: 'Keep service flowing: ice, glassware, citrus, restocking, cleanliness. Anticipation and urgency matter more than experience.',
  Server: 'Warm greetings, paced service, and real product knowledge in an elevated neighborhood bar.',
  Host: 'First impressions and pacing at the door — calm, welcoming, and organized.',
  'Floor Manager': 'Lead shifts by example: coach the team, hold standards, own the guest experience.',
};

function jobPostingJsonLd(location) {
  const today = new Date().toISOString().slice(0, 10);
  const postings = POSITIONS.filter((p) => p !== 'Other').map((p) => ({
    '@context': 'https://schema.org/',
    '@type': 'JobPosting',
    title: `${p} — Dram & Draught ${location.name}`,
    description: `<p>${JOB_BLURBS[p] || 'Join the Dram & Draught team.'} Apply online in about five minutes.</p>`,
    datePosted: today,
    employmentType: ['FULL_TIME', 'PART_TIME'],
    hiringOrganization: {
      '@type': 'Organization',
      name: 'Dram & Draught',
      sameAs: 'https://dramanddraught.com',
    },
    jobLocation: {
      '@type': 'Place',
      address: {
        '@type': 'PostalAddress',
        ...(location.address ? { streetAddress: location.address } : {}),
        addressLocality: location.city,
        addressRegion: location.state || 'NC',
        ...(location.zipCode ? { postalCode: location.zipCode } : {}),
        addressCountry: 'US',
      },
    },
    directApply: true,
  }));
  // <-escape so DB-sourced strings can never close the script tag.
  const json = JSON.stringify(postings).replace(/</g, '\\u003c');
  return `<script type="application/ld+json">${json}</script>`;
}

function generateApplyPage(location, opts = {}) {
  const errorMessage = opts.errorMessage || '';
  const prev = opts.prev || {};
  const availabilityValues = (prev.availability && typeof prev.availability === 'object') ? prev.availability : {};

  const positionOptions = POSITIONS.map((p) => {
    const sel = prev.position === p ? ' selected' : '';
    return `<option value="${escHTML(p)}"${sel}>${escHTML(p)}</option>`;
  }).join('');

  const availabilityRows = DAYS.map((d) => {
    const dayChecked = availabilityValues[d.key] || [];
    const cells = SHIFTS.map((s) => {
      const checked = Array.isArray(dayChecked) && dayChecked.includes(s.key) ? ' checked' : '';
      return `<label class="avail-cell"><input type="checkbox" name="avail_${d.key}" value="${s.key}"${checked} /> ${escHTML(s.label)}</label>`;
    }).join('');
    return `
      <span class="avail-day">${escHTML(d.label)}</span>
      ${cells}
    `;
  }).join('');

  const body = `
    ${jobPostingJsonLd(location)}
    <h1 class="apply-title">Join the ${escHTML(location.name)} team</h1>
    <p class="apply-sub">Tell us about yourself. We read every application.</p>

    <div class="apply-card apply-notice">
      <div class="apply-section-title" style="margin-bottom: 8px;">Before you start</div>
      <p style="color: #d6d2c5; line-height: 1.55; margin: 0 0 10px;">
        Keep answers focused on your work experience and behavior. Please <strong>don't include</strong>
        medical info, age beyond what we ask for, religion, family or childcare situation, disability
        status, or any other protected personal information. It won't be used in scoring and we may need
        to redact it.
      </p>
      <p style="color: #d6d2c5; line-height: 1.55; margin: 0;">
        Need an accommodation or an alternate way to complete this application? Email
        <a href="mailto:cheers@dramanddraught.com" style="color: var(--gold); text-decoration: underline;">cheers@dramanddraught.com</a>.
        Requesting accommodation won't be held against you.
      </p>
    </div>

    ${errorMessage ? `<div class="apply-error">${escHTML(errorMessage)}</div>` : ''}

    <form method="POST" action="/${escHTML(location.slug)}/apply" novalidate id="apply-form">
      <div class="apply-card">
        <div class="apply-section-title">About you</div>
        <div class="apply-row">
          <div class="apply-field">
            <label for="ap-name">Full name <span class="apply-req">*</span></label>
            <input type="text" id="ap-name" name="name" required autocomplete="name" autocapitalize="words" value="${escHTML(prev.name || '')}" />
          </div>
          <div class="apply-field">
            <label for="ap-email">Email <span class="apply-req">*</span></label>
            <input type="email" id="ap-email" name="email" required inputmode="email" autocomplete="email" autocapitalize="none" autocorrect="off" spellcheck="false" value="${escHTML(prev.email || '')}" />
          </div>
        </div>
        <div class="apply-row">
          <div class="apply-field">
            <label for="ap-phone">Phone <span class="apply-req">*</span></label>
            <input type="tel" id="ap-phone" name="phone" required inputmode="tel" autocomplete="tel" value="${escHTML(prev.phone || '')}" />
          </div>
          <div class="apply-field">
            <label for="ap-ref">Referred by</label>
            <input type="text" id="ap-ref" name="referredBy" autocomplete="off" value="${escHTML(prev.referredBy || '')}" />
          </div>
        </div>
      </div>

      <div class="apply-card">
        <div class="apply-section-title">Position</div>
        <div class="apply-row">
          <div class="apply-field">
            <label>What role are you applying for? *</label>
            <select name="position" required>
              <option value="">Select a role…</option>
              ${positionOptions}
            </select>
          </div>
          <div class="apply-field">
            <label>If "Other", what role?</label>
            <input type="text" name="positionOther" value="${escHTML(prev.positionOther || '')}" />
          </div>
        </div>
        <div class="apply-row">
          <div class="apply-field">
            <span class="apply-label">Are you 21 or older? *</span>
            <div class="yesno-pair">
              <label><input type="radio" name="age21" value="yes"${prev.age21 === 'yes' ? ' checked' : ''} required /> Yes</label>
              <label><input type="radio" name="age21" value="no"${prev.age21 === 'no' ? ' checked' : ''} /> No</label>
            </div>
          </div>
          <div class="apply-field">
            <label>Earliest start date</label>
            <input type="date" name="earliestStart" value="${escHTML(prev.earliestStart || '')}" />
          </div>
        </div>
        <div class="apply-row" data-alc-row>
          <div class="apply-field" style="grid-column: 1 / -1;">
            <span class="apply-label">Are you legally eligible to perform alcohol-service duties for this role at this location? <span class="apply-req" data-alc-required>*</span></span>
            <div class="yesno-pair">
              <label><input type="radio" name="alcoholEligibility" value="yes"${prev.alcoholEligibility === 'yes' ? ' checked' : ''} /> Yes</label>
              <label><input type="radio" name="alcoholEligibility" value="no"${prev.alcoholEligibility === 'no' ? ' checked' : ''} /> No</label>
              <label><input type="radio" name="alcoholEligibility" value="unsure"${prev.alcoholEligibility === 'unsure' ? ' checked' : ''} /> Unsure</label>
            </div>
            <div class="apply-helper">
              Required for Bartender, Barback, Server, and Floor Manager — any role that pours or serves alcohol.
              We use this in place of asking your age directly.
              <details style="display:inline-block; margin-left:4px;"><summary style="cursor:pointer; color:var(--gold); display:inline;">What does this mean?</summary>
              <div style="margin-top:6px; padding:10px 12px; background:rgba(255,255,255,0.04); border-left:2px solid var(--gold); border-radius:0 6px 6px 0; color:#d6d2c5; font-size:0.84rem; line-height:1.5;">
                North Carolina requires alcohol-service staff to be at least 18 (servers / barbacks) or 21 (bartenders mixing or pouring spirits).
                Some roles also require a TIPS or ABC certification you can get after hire. Pick <strong>Yes</strong> only if you can lawfully
                perform every alcohol-related duty for the role you applied to. Pick <strong>Unsure</strong> if you don't know — a manager will reach out, and it never counts against you.
              </div></details>
            </div>
          </div>
        </div>
      </div>

      <div class="apply-card">
        <div class="apply-section-title">Availability <span class="apply-req">*</span></div>
        <div class="apply-helper" style="margin-bottom: 10px;">Check every shift you can typically work — at least one is required.</div>
        <button type="button" id="avail-all-btn" style="margin-bottom:12px; background:transparent; border:1px solid rgba(212,175,55,0.4); color:var(--gold); border-radius:999px; padding:8px 16px; font-size:0.85rem; cursor:pointer;">✓ I have open availability — select everything</button>
        <div class="avail-grid">
          <span></span>
          <span class="avail-head">Day</span>
          <span class="avail-head">Evening</span>
          <span class="avail-head">Late</span>
          ${availabilityRows}
        </div>
        <div class="apply-row" style="margin-top: 16px;">
          <div class="apply-field">
            <label for="ap-hours">How many hours per week are you available to work?</label>
            <input type="number" id="ap-hours" name="hoursPerWeek" min="1" max="80" step="1" inputmode="numeric" required placeholder="e.g. 30" value="${escHTML(prev.hoursPerWeek || '')}" />
          </div>
        </div>
        <div class="apply-commit-notice">
          <strong>Heads up:</strong> we ask that the availability you give here stays consistent through
          your first <strong>90 days</strong> of employment. Availability is a key part of how we make
          hiring decisions. If it changes before, during, or after that window, we'll review whether the
          updated availability still meets the needs of the business.
        </div>
      </div>

      <div class="apply-card">
        <div class="apply-section-title">Experience</div>
        <div class="apply-row">
          <div class="apply-field">
            <label>Years in bar / restaurant</label>
            <input type="number" name="yearsExperience" min="0" max="60" value="${escHTML(prev.yearsExperience || '')}" />
          </div>
          <div class="apply-field">
            <label>Certifications</label>
            <input type="text" name="certifications" placeholder="TIPS, ServSafe, ABC, etc." value="${escHTML(prev.certifications || '')}" />
          </div>
        </div>
        <div class="apply-field" style="margin-bottom: 12px;">
          <label>Most recent employers</label>
          <textarea name="priorEmployers" placeholder="Where you've worked, role, and roughly when.">${escHTML(prev.priorEmployers || '')}</textarea>
        </div>
        <div class="apply-field" style="margin-bottom: 12px;">
          <label>Spirit knowledge / specialties</label>
          <textarea name="spiritKnowledge" placeholder="Whiskey nerd? Tiki obsessive? Tell us.">${escHTML(prev.spiritKnowledge || '')}</textarea>
        </div>
        <div class="apply-field">
          <label>Why Dram &amp; Draught?</label>
          <textarea name="whyDD" placeholder="A few sentences is plenty.">${escHTML(prev.whyDD || '')}</textarea>
        </div>
      </div>

      <div class="apply-card">
        <div class="apply-section-title">Resume (optional)</div>
        <div class="resume-row">
          <input type="file" id="resume-file" accept=".pdf,.doc,.docx,image/jpeg,image/png" />
          <div class="apply-helper" id="resume-helper">PDF, Word, or image. Max 5 MB.</div>
          <input type="hidden" name="resume_data" id="resume_data" value="" />
          <input type="hidden" name="resume_filename" id="resume_filename" value="" />
          <input type="hidden" name="resume_mime" id="resume_mime" value="" />
        </div>
      </div>

      <div class="apply-actions" style="flex-direction: column; align-items: flex-end; gap: 8px;">
        <div id="ap-draft-status" class="apply-helper" style="font-size:0.78rem; color:#8d9299;"></div>
        <button type="submit" class="apply-btn">Submit application</button>
      </div>
    </form>

    <script>
      // ---- localStorage draft autosave ----
      (function(){
        var form = document.getElementById('apply-form');
        if (!form) return;
        var KEY = 'dd-apply-draft-${escHTML(location.slug || '')}';
        var status = document.getElementById('ap-draft-status');
        var saveTimer = null;
        var fields = ['name','email','phone','referredBy','position','positionOther','age21','alcoholEligibility','earliestStart','hoursPerWeek','yearsExperience','certifications','priorEmployers','spiritKnowledge','whyDD'];
        function snapshot() {
          var data = {};
          fields.forEach(function (n) {
            var el = form.querySelector('[name="' + n + '"]:checked') || form.querySelector('[name="' + n + '"]');
            if (!el) return;
            if (el.type === 'radio') {
              var picked = form.querySelector('[name="' + n + '"]:checked');
              data[n] = picked ? picked.value : '';
            } else {
              data[n] = el.value;
            }
          });
          // availability checkboxes
          var avail = {};
          form.querySelectorAll('input[type="checkbox"][name^="avail_"]:checked').forEach(function (cb) {
            var day = cb.name.replace('avail_', '');
            (avail[day] = avail[day] || []).push(cb.value);
          });
          data.__avail = avail;
          return data;
        }
        function restore() {
          try {
            var raw = localStorage.getItem(KEY);
            if (!raw) return false;
            var data = JSON.parse(raw);
            if (!data || typeof data !== 'object') return false;
            // Skip restore if any prev values are already set (server re-render path).
            var hasServerPrev = fields.some(function (n) {
              var el = form.querySelector('[name="' + n + '"]:not([type=radio])');
              return el && el.value;
            });
            if (hasServerPrev) return false;
            fields.forEach(function (n) {
              if (data[n] == null) return;
              if (n === 'age21' || n === 'alcoholEligibility') {
                var r = form.querySelector('[name="' + n + '"][value="' + CSS.escape(data[n]) + '"]');
                if (r) r.checked = true;
              } else {
                var el = form.querySelector('[name="' + n + '"]');
                if (el) el.value = data[n];
              }
            });
            if (data.__avail && typeof data.__avail === 'object') {
              Object.keys(data.__avail).forEach(function (day) {
                (data.__avail[day] || []).forEach(function (shift) {
                  var cb = form.querySelector('input[type="checkbox"][name="avail_' + day + '"][value="' + CSS.escape(shift) + '"]');
                  if (cb) cb.checked = true;
                });
              });
            }
            if (status) status.textContent = 'Restored an unsaved draft.';
            return true;
          } catch (e) { return false; }
        }
        function saveSoon() {
          if (saveTimer) clearTimeout(saveTimer);
          saveTimer = setTimeout(function () {
            try {
              localStorage.setItem(KEY, JSON.stringify(snapshot()));
              if (status) status.textContent = 'Draft saved.';
            } catch (e) { /* private mode etc. */ }
          }, 600);
        }
        restore();
        form.addEventListener('input', saveSoon);
        form.addEventListener('change', saveSoon);
        form.addEventListener('submit', function () {
          try { localStorage.removeItem(KEY); } catch (e) {}
        });
      })();

      // ---- Inline error focus on server-side validation failure ----
      (function () {
        var bannerEl = document.querySelector('.apply-error');
        if (!bannerEl) return;
        var text = (bannerEl.textContent || '').toLowerCase();
        var form = document.getElementById('apply-form');
        if (!form) return;
        var firstBad = null;
        var checks = [
          { word: 'name', name: 'name' },
          { word: 'email', name: 'email' },
          { word: 'phone', name: 'phone' },
          { word: 'position', name: 'position' },
          { word: '21 or older', name: 'age21' },
          { word: 'alcohol-service', name: 'alcoholEligibility' },
        ];
        checks.forEach(function (c) {
          if (text.indexOf(c.word) === -1) return;
          var el = form.querySelector('[name="' + c.name + '"]');
          if (!el) return;
          var wrap = el.closest('.apply-field') || el.parentElement;
          if (wrap) wrap.classList.add('has-error');
          if (!firstBad) firstBad = el;
        });
        if (firstBad) {
          firstBad.scrollIntoView({ behavior: 'smooth', block: 'center' });
          setTimeout(function () { try { firstBad.focus(); } catch (e) {} }, 250);
        }
      })();

      // ---- Open-availability shortcut + at-least-one-slot guard ----
      (function () {
        var form = document.getElementById('apply-form');
        if (!form) return;
        var btn = document.getElementById('avail-all-btn');
        var boxes = function () { return Array.from(form.querySelectorAll('input[type="checkbox"][name^="avail_"]')); };
        if (btn) {
          btn.addEventListener('click', function () {
            var all = boxes();
            var everyChecked = all.every(function (b) { return b.checked; });
            all.forEach(function (b) { b.checked = !everyChecked; });
            btn.textContent = everyChecked ? '✓ I have open availability — select everything' : '✕ Clear all availability';
            form.dispatchEvent(new Event('change'));
          });
        }
        form.addEventListener('submit', function (e) {
          var any = boxes().some(function (b) { return b.checked; });
          if (!any) {
            e.preventDefault();
            var grid = form.querySelector('.avail-grid');
            if (grid) {
              grid.scrollIntoView({ behavior: 'smooth', block: 'center' });
              grid.style.outline = '2px solid rgba(247,196,196,0.6)';
              grid.style.borderRadius = '8px';
            }
            alert('Please check at least one availability slot (or tap "I have open availability").');
          }
        });
      })();

      // ---- Email typo guard ("gmial.com" → "gmail.com") ----
      (function () {
        var input = document.getElementById('ap-email');
        if (!input) return;
        var COMMON = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com', 'aol.com', 'live.com', 'msn.com', 'proton.me', 'protonmail.com'];
        var note = document.createElement('div');
        note.className = 'apply-helper';
        note.style.display = 'none';
        input.parentElement.appendChild(note);
        function distance(a, b) {
          if (Math.abs(a.length - b.length) > 2) return 99;
          var m = [];
          for (var i = 0; i <= a.length; i++) m[i] = [i];
          for (var j = 0; j <= b.length; j++) m[0][j] = j;
          for (i = 1; i <= a.length; i++) for (j = 1; j <= b.length; j++) {
            m[i][j] = Math.min(m[i-1][j] + 1, m[i][j-1] + 1, m[i-1][j-1] + (a[i-1] === b[j-1] ? 0 : 1));
          }
          return m[a.length][b.length];
        }
        function check() {
          note.style.display = 'none';
          var v = (input.value || '').trim().toLowerCase();
          var at = v.lastIndexOf('@');
          if (at < 1) return;
          var domain = v.slice(at + 1);
          if (!domain || COMMON.indexOf(domain) !== -1) return;
          var best = null, bestD = 3;
          COMMON.forEach(function (d) {
            var dist = distance(domain, d);
            if (dist > 0 && dist < bestD) { bestD = dist; best = d; }
          });
          if (!best) return;
          var fixed = v.slice(0, at + 1) + best;
          note.style.display = 'block';
          note.style.color = '#f2c879';
          note.innerHTML = 'Did you mean <a href="#" style="color:var(--gold); text-decoration:underline;" id="email-fix">' + fixed.replace(/</g, '&lt;') + '</a>? We can only reach you if this is right.';
          var link = note.querySelector('#email-fix');
          if (link) link.addEventListener('click', function (e) {
            e.preventDefault();
            input.value = fixed;
            note.style.display = 'none';
            input.dispatchEvent(new Event('input', { bubbles: true }));
          });
        }
        input.addEventListener('blur', check);
        input.addEventListener('change', check);
      })();

      (function(){
        var fileInput = document.getElementById('resume-file');
        var dataIn = document.getElementById('resume_data');
        var nameIn = document.getElementById('resume_filename');
        var mimeIn = document.getElementById('resume_mime');
        var helper = document.getElementById('resume-helper');
        var form = document.getElementById('apply-form');
        var btn = form ? form.querySelector('button[type="submit"]') : null;
        var MAX = 5 * 1024 * 1024;
        if (!fileInput) return;
        fileInput.addEventListener('change', function(){
          var f = fileInput.files && fileInput.files[0];
          if (!f) {
            dataIn.value = ''; nameIn.value = ''; mimeIn.value = '';
            helper.textContent = 'PDF, Word, or image. Max 5 MB.';
            return;
          }
          if (f.size > MAX) {
            helper.textContent = 'File is over 5 MB — please pick a smaller one.';
            fileInput.value = '';
            dataIn.value = ''; nameIn.value = ''; mimeIn.value = '';
            return;
          }
          var reader = new FileReader();
          if (btn) btn.disabled = true;
          helper.textContent = 'Reading file…';
          reader.onload = function(){
            dataIn.value = String(reader.result || '');
            nameIn.value = f.name;
            mimeIn.value = f.type || '';
            helper.textContent = f.name + ' attached.';
            if (btn) btn.disabled = false;
          };
          reader.onerror = function(){
            helper.textContent = 'Could not read file. Try again.';
            if (btn) btn.disabled = false;
          };
          reader.readAsDataURL(f);
        });
      })();
    </script>
  `;
  return pageShell(location, 'Apply', body);
}

function generateApplyClosedPage(location) {
  const body = `
    <div class="apply-card apply-success">
      <h1>Not currently hiring</h1>
      <p>${escHTML(location.name)} isn't accepting applications right now. Thanks for your interest — please check back soon.</p>
      <a class="action-link" href="/${escHTML(location.slug)}">Back to ${escHTML(location.name)}</a>
    </div>`;
  return pageShell(location, 'Hiring closed', body);
}

function generateApplySuccessPage(location, application) {
  const body = `
    <div class="apply-card apply-success">
      <h1>Thanks, ${escHTML((application.name || '').split(' ')[0] || 'friend')}!</h1>
      <p>Your application for ${escHTML(location.name)} is in. Our team will reach out to the email you provided when there's an update.</p>
      <p style="margin-top: 14px; color:#8d9299; font-size: 0.85rem;">Reference: ${escHTML(application.id)}</p>
      <a class="action-link" href="/${escHTML(location.slug)}">Back to ${escHTML(location.name)}</a>
    </div>`;
  return pageShell(location, 'Application received', body);
}

module.exports = {
  POSITIONS,
  DAYS,
  SHIFTS,
  generateApplyPage,
  generateApplyClosedPage,
  generateApplySuccessPage,
};
