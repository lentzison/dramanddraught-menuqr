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
        .apply-title { font-family: var(--brand-serif, 'Cormorant Garamond', serif); font-size: 1.9rem; line-height: 1.1; margin: 0 0 4px; color: #f5f1e6; }
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
        .apply-section-title { font-family: var(--brand-serif, 'Cormorant Garamond', serif); font-size: 1.2rem; color: var(--gold); margin: 0 0 14px; letter-spacing: 0.02em; }
        .apply-row { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 12px; }
        @media (max-width: 560px) { .apply-row { grid-template-columns: 1fr; } }
        .apply-field { display: block; }
        .apply-field label, .apply-label { display: block; font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.06em; color: #c8b770; margin-bottom: 6px; font-weight: 600; }
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
          font-size: 0.95rem; font-family: inherit;
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
        .apply-success h1 { font-family: var(--brand-serif, 'Cormorant Garamond', serif); color: var(--gold); margin: 0 0 8px; font-size: 1.8rem; }
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
        <a href="mailto:hiring@dramanddraught.com" style="color: var(--gold); text-decoration: underline;">hiring@dramanddraught.com</a>.
        Requesting accommodation won't be held against you.
      </p>
    </div>

    ${errorMessage ? `<div class="apply-error">${escHTML(errorMessage)}</div>` : ''}

    <form method="POST" action="/${escHTML(location.slug)}/apply" novalidate id="apply-form">
      <div class="apply-card">
        <div class="apply-section-title">About you</div>
        <div class="apply-row">
          <div class="apply-field">
            <label>Full name *</label>
            <input type="text" name="name" required value="${escHTML(prev.name || '')}" />
          </div>
          <div class="apply-field">
            <label>Email *</label>
            <input type="email" name="email" required value="${escHTML(prev.email || '')}" />
          </div>
        </div>
        <div class="apply-row">
          <div class="apply-field">
            <label>Phone *</label>
            <input type="tel" name="phone" required value="${escHTML(prev.phone || '')}" />
          </div>
          <div class="apply-field">
            <label>Referred by</label>
            <input type="text" name="referredBy" value="${escHTML(prev.referredBy || '')}" />
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
            <div class="apply-helper">Required for any role serving alcohol.</div>
          </div>
          <div class="apply-field">
            <label>Earliest start date</label>
            <input type="date" name="earliestStart" value="${escHTML(prev.earliestStart || '')}" />
          </div>
        </div>
      </div>

      <div class="apply-card">
        <div class="apply-section-title">Availability</div>
        <div class="apply-helper" style="margin-bottom: 10px;">Check every shift you can typically work.</div>
        <div class="avail-grid">
          <span></span>
          <span class="avail-head">Day</span>
          <span class="avail-head">Evening</span>
          <span class="avail-head">Late</span>
          ${availabilityRows}
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

      <div class="apply-actions">
        <button type="submit" class="apply-btn">Submit application</button>
      </div>
    </form>

    <script>
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
