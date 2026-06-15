const { adminLayout } = require('./adminLayout');
const { escHTML } = require('./escapeHtml');
const { EVENT_THEMES, THEME_BY_KEY, themeLabel } = require('./eventThemes');
const { normalizeRecurrenceRule, generateOccurrences, describeRecurrence } = require('../recurrence');
const { easternParts } = require('../dateEastern');

// Contextual help marker. Renders a "?" that pops the explanation (handled by
// the shared script in adminLayout). Use beside any feature staff might not
// recognize. Text is attribute-escaped.
function helpTip(text) {
  return `<button type="button" class="help-tip" aria-label="Help" aria-expanded="false" data-help="${escHTML(String(text || ''))}">?</button>`;
}

// Collapsible "How to use Events" guide shown at the top of the events list.
function eventsHowTo() {
  const step = (title, body) => `<li style="margin-bottom:10px;"><strong style="color:var(--text);">${escHTML(title)}</strong><br><span style="color:var(--text-muted); font-size:0.88rem;">${body}</span></li>`;
  return `
    <details class="ev-howto" style="margin:0 0 16px; border:1px solid var(--line); border-radius:12px; background:rgba(255,255,255,0.02);">
      <summary style="cursor:pointer; list-style:none; display:flex; align-items:center; gap:10px; padding:13px 16px; font-weight:800; color:var(--text);">
        <span style="font-size:1.1rem;">📖</span> How to use Events
        <span style="margin-left:auto; color:var(--text-muted); font-size:0.8rem; font-weight:600;">read me</span>
      </summary>
      <div style="padding:0 18px 16px;">
        <p style="color:var(--text-muted); font-size:0.88rem; margin:0 0 12px;">Everything you can do here. Tap any <span class="help-tip" style="cursor:default;">?</span> around the page for a quick explanation of that feature.</p>
        <ol style="margin:0; padding-left:20px;">
          ${step('Create or import an event', 'Click <strong>+ New event</strong> to build one from scratch, or use the <strong>Import from the Dram &amp; Draught website</strong> panel to pull in events from the public site — tap a venue chip to add it there. Already-added venues show a green ✓.')}
          ${step('The AI designs the page for you', 'When you import, the AI writes a short public blurb and builds the event page (Page Builder sections) from the source text automatically. You review and tweak it before publishing. The full original text is kept under the description as reference.')}
          ${step('Fill in the tabs', '<strong>Basics</strong> (name, date, location, description), <strong>Appearance</strong> (banner, theme), <strong>Signups</strong> (who can sign up + custom questions), and <strong>Page Builder</strong> (the rich event page — appears after you save).')}
          ${step('Same event at several locations', 'Make a separate event per venue (each has its own page and signups). They group together automatically in this list by name + date. Use <strong>Group with</strong> in the editor if you need to link them manually. The system won’t let you create the same event twice at the same location.')}
          ${step('Manage signups', 'Open <strong>Signups</strong> on any event to see who’s coming, check people in, export a CSV, and (for vendor/participant events) approve or reject applications.')}
          ${step('Run a competition', 'For cocktail comps etc., set the event’s signup type to <strong>Participant</strong>, collect entries, mark your <strong>finalists</strong>, then add judging criteria + judges and share the <strong>judge link</strong>. Scores roll up on the <strong>Results</strong> page.')}
          ${step('Publish & share', 'Turn the event <strong>Active</strong> to make it public (you’ll get a pre-publish checklist first). Then grab the public link or QR code from the <strong>More ▾</strong> menu. Delete an event from that same menu.')}
        </ol>
      </div>
    </details>`;
}

const WEEKDAY_OPTS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEK_OF_MONTH_OPTS = [[1, 'first'], [2, 'second'], [3, 'third'], [4, 'fourth'], [-1, 'last']];

// The Repeat rule inputs, shown inside the When section (saved with the event).
function recurrenceRuleFields(event) {
  const rule = normalizeRecurrenceRule(event?.recurrenceRule) || {};
  const enabled = !!(event && event.isRecurring);
  // Sensible defaults from the event's start when no rule yet.
  let defWeekday = 5; let defTime = '18:00';
  if (event?.startDate) {
    const p = easternParts(event.startDate);
    defWeekday = p.weekday;
    const t = new Date(event.startDate).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour12: false, hour: '2-digit', minute: '2-digit' });
    if (/^\d{2}:\d{2}$/.test(t)) defTime = t;
  }
  const freq = rule.frequency || 'weekly';
  const interval = rule.interval || 1;
  const weekday = rule.weekday != null ? rule.weekday : defWeekday;
  const weekOfMonth = rule.weekOfMonth || 1;
  const time = rule.time || defTime;
  const duration = rule.durationMinutes || '';
  const until = rule.until ? new Date(rule.until).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }) : '';
  const count = rule.count || '';

  const wdOptions = WEEKDAY_OPTS.map((w, i) => `<option value="${i}"${i === weekday ? ' selected' : ''}>${w}</option>`).join('');
  const womOptions = WEEK_OF_MONTH_OPTS.map(([v, l]) => `<option value="${v}"${v === weekOfMonth ? ' selected' : ''}>${l}</option>`).join('');

  // Repeat mode: "pattern" (rule) or "dates" (an explicit list). An event that's
  // recurring but has no rule is on specific dates.
  const hasRule = !!(event && event.recurrenceRule && normalizeRecurrenceRule(event.recurrenceRule));
  const mode = !enabled ? 'pattern' : (hasRule ? 'pattern' : 'dates');
  // Prefill the specific-dates editor from existing future manual occurrences.
  const occs = Array.isArray(event?.occurrences) ? event.occurrences : [];
  const currentId = event?.currentOccurrenceId;
  const manualFuture = occs
    .filter((o) => o.origin === 'manual' && !o.rolledOverAt && o.id !== currentId && new Date(o.startDate).getTime() >= Date.now())
    .sort((a, b) => new Date(a.startDate) - new Date(b.startDate))
    .map((o) => toDateTimeLocal(o.startDate));
  const prefillDatesJson = escHTML(JSON.stringify(manualFuture));

  return `
    <div class="ev-section" id="event-repeat" style="margin-top:18px">
      <label class="ev-repeat-toggle" style="display:flex;align-items:center;gap:10px;font-weight:600;cursor:pointer">
        <input type="checkbox" id="ev-repeat-enabled" name="repeatEnabled" ${enabled ? 'checked' : ''} style="width:auto;margin:0" />
        Repeat this event
      </label>
      <p class="ev-section-hint">Set it up once. When a date passes, the signup sheet resets for the next one and past signups are kept on record. You can edit the dates anytime.</p>

      <div id="ev-repeat-fields" style="${enabled ? '' : 'display:none'}">
        <div class="ev-repeat-mode" style="display:flex;gap:18px;margin:6px 0 14px;flex-wrap:wrap">
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-weight:500">
            <input type="radio" name="repeatMode" value="dates" ${mode === 'dates' ? 'checked' : ''} style="width:auto;margin:0" /> On specific dates I pick
          </label>
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-weight:500">
            <input type="radio" name="repeatMode" value="pattern" ${mode === 'pattern' ? 'checked' : ''} style="width:auto;margin:0" /> On a repeating pattern
          </label>
        </div>

        <!-- Specific dates -->
        <div class="ev-repeat-pane" data-pane="dates" style="${mode === 'dates' ? '' : 'display:none'}">
          <label>Dates</label>
          <p class="ev-section-hint" style="margin-top:2px">Add each date this event happens. The first/soonest date is the live one; the rest queue up. Don't know them yet? Leave it and add dates later.</p>
          <div id="ev-date-rows"></div>
          <button type="button" id="ev-add-date" class="btn btn-secondary btn-sm" style="margin-top:8px">+ Add a date</button>
          <input type="hidden" name="repeatDates" id="ev-repeat-dates" value="" data-prefill="${prefillDatesJson}" />
        </div>

        <!-- Repeating pattern -->
        <div class="ev-repeat-pane" data-pane="pattern" style="${mode === 'pattern' ? '' : 'display:none'}">
          <div class="ev-field-grid">
            <div>
              <label>Frequency</label>
              <select name="repeatFrequency" id="ev-repeat-freq">
                <option value="weekly"${freq === 'weekly' ? ' selected' : ''}>Weekly</option>
                <option value="monthly"${freq === 'monthly' ? ' selected' : ''}>Monthly</option>
              </select>
            </div>
            <div>
              <label>Every</label>
              <div style="display:flex;align-items:center;gap:8px">
                <input type="number" name="repeatInterval" min="1" max="52" value="${interval}" style="max-width:90px" />
                <span class="ev-repeat-unit" data-week="weeks" data-month="months">${freq === 'monthly' ? 'months' : 'weeks'}</span>
              </div>
            </div>
          </div>
          <div class="ev-field-grid" style="margin-top:14px">
            <div class="ev-repeat-monthly" style="${freq === 'monthly' ? '' : 'display:none'}">
              <label>On the</label>
              <select name="repeatWeekOfMonth">${womOptions}</select>
            </div>
            <div>
              <label>Day of week</label>
              <select name="repeatWeekday">${wdOptions}</select>
            </div>
            <div>
              <label>Time</label>
              <input type="time" name="repeatTime" value="${escHTML(time)}" />
            </div>
          </div>
          <div class="ev-field-grid" style="margin-top:14px">
            <div>
              <label>Duration <span style="color:#888;font-weight:400;font-size:0.8rem">(minutes, optional)</span></label>
              <input type="number" name="repeatDurationMinutes" min="15" max="1440" value="${duration}" placeholder="e.g. 120" />
            </div>
            <div>
              <label>End repeat <span style="color:#888;font-weight:400;font-size:0.8rem">(optional)</span></label>
              <div style="display:flex;align-items:center;gap:8px">
                <input type="date" name="repeatUntil" value="${escHTML(until)}" title="Stop repeating after this date" />
                <span style="color:#888">or</span>
                <input type="number" name="repeatCount" min="1" max="260" value="${count}" placeholder="# dates" style="max-width:110px" title="Stop after this many dates" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <script>(function(){
      var cb = document.getElementById('ev-repeat-enabled');
      var fields = document.getElementById('ev-repeat-fields');
      var freq = document.getElementById('ev-repeat-freq');
      var form = cb ? cb.closest('form') : null;
      if (cb && fields) cb.addEventListener('change', function(){ fields.style.display = cb.checked ? '' : 'none'; });

      // Mode panes
      function syncMode(){
        var mode = (document.querySelector('input[name="repeatMode"]:checked') || {}).value || 'dates';
        document.querySelectorAll('.ev-repeat-pane').forEach(function(p){ p.style.display = (p.getAttribute('data-pane') === mode) ? '' : 'none'; });
      }
      document.querySelectorAll('input[name="repeatMode"]').forEach(function(r){ r.addEventListener('change', syncMode); });
      syncMode();

      // Frequency unit + monthly row
      function syncFreq(){
        var monthly = freq && freq.value === 'monthly';
        document.querySelectorAll('.ev-repeat-monthly').forEach(function(el){ el.style.display = monthly ? '' : 'none'; });
        document.querySelectorAll('.ev-repeat-unit').forEach(function(el){ el.textContent = monthly ? el.getAttribute('data-month') : el.getAttribute('data-week'); });
      }
      if (freq) { freq.addEventListener('change', syncFreq); syncFreq(); }

      // Specific-dates editor
      var rowsEl = document.getElementById('ev-date-rows');
      var hidden = document.getElementById('ev-repeat-dates');
      var addBtn = document.getElementById('ev-add-date');
      function addRow(val){
        if (!rowsEl) return;
        var row = document.createElement('div');
        row.className = 'ev-date-row';
        row.style.cssText = 'display:flex;gap:8px;align-items:center;margin-bottom:8px';
        var inp = document.createElement('input');
        inp.type = 'datetime-local'; inp.className = 'ev-date-input'; if (val) inp.value = val;
        inp.addEventListener('change', serialize);
        var del = document.createElement('button');
        del.type = 'button'; del.className = 'btn btn-secondary btn-sm'; del.textContent = 'Remove';
        del.addEventListener('click', function(){ row.remove(); serialize(); });
        row.appendChild(inp); row.appendChild(del); rowsEl.appendChild(row);
      }
      function serialize(){
        if (!hidden) return;
        var vals = [];
        document.querySelectorAll('.ev-date-input').forEach(function(i){ if (i.value) vals.push(i.value); });
        hidden.value = JSON.stringify(vals);
      }
      if (addBtn) addBtn.addEventListener('click', function(){ addRow(''); });
      if (hidden) {
        var pre = [];
        try { pre = JSON.parse(hidden.getAttribute('data-prefill') || '[]'); } catch(e) { pre = []; }
        pre.forEach(addRow);
        serialize();
      }
      if (form) form.addEventListener('submit', serialize);
    })();</script>`;
}

// Upcoming dates + manual add/remove + "roll over now". Lives OUTSIDE the main
// event form (its own _action POSTs), shown only for saved events.
function recurrenceManageCard(event, actionUrl) {
  if (!event || !event.id) return '';
  const rule = normalizeRecurrenceRule(event.recurrenceRule);
  const occs = Array.isArray(event.occurrences) ? event.occurrences : [];
  const currentId = event.currentOccurrenceId;
  const now = Date.now();

  const current = occs.find((o) => o.id === currentId);
  const upcoming = occs.filter((o) => !o.rolledOverAt && o.id !== currentId && new Date(o.startDate).getTime() >= now)
    .sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
  const past = occs.filter((o) => o.rolledOverAt || (o.id !== currentId && new Date(o.startDate).getTime() < now)).length;

  // A live preview from the rule (in case nothing is materialized past the buffer).
  let preview = [];
  if (rule) {
    const from = current ? (current.endDate || current.startDate) : new Date();
    preview = generateOccurrences(rule, from, 5);
  }

  const occRow = (o) => `
    <li class="ev-occ-row">
      <span>${escHTML(formatFriendlyDate(o.startDate))}${(o._count?.signups || 0) ? ` · <span style="color:#d2aa67">${o._count.signups} signup${o._count.signups === 1 ? '' : 's'}</span>` : ''}${o.origin === 'manual' ? ' · <span style="color:#888">added</span>' : ''}</span>
      ${(o._count?.signups || 0) === 0 ? `<button type="submit" name="_action" value="deleteOccurrence" class="btn btn-secondary btn-sm" formaction="${escHTML(actionUrl)}" formmethod="POST" onclick="this.form.querySelector('#ev-del-occ').value='${escHTML(o.id)}'">Remove</button>` : ''}
    </li>`;

  const isRecurring = !!event.isRecurring;
  return `
    <div class="ev-section" id="repeat" style="margin-top:18px">
      <h3>Repeat schedule</h3>
      ${rule ? `<p class="ev-section-hint">${escHTML(describeRecurrence(rule))}.</p>`
             : isRecurring ? `<p class="ev-section-hint">Repeats on specific dates you set. Add or edit dates above (in the When section) or below, then roll over or email past signups when you're ready.</p>`
             : `<p class="ev-section-hint">This event isn't repeating. Turn on “Repeat this event” above and save to schedule dates, or add one-off dates below.</p>`}

      <div class="ev-occ-block">
        <strong>Live date</strong>
        <p style="margin:4px 0 10px">${current ? escHTML(formatFriendlyDate(current.startDate)) : '—'} <span style="color:#888">(accepting signups now)</span></p>

        ${upcoming.length ? `<strong>Upcoming dates</strong>
        <form method="POST" action="${escHTML(actionUrl)}"><input type="hidden" id="ev-del-occ" name="occurrenceId" value="" />
          <ul class="ev-occ-list">${upcoming.map(occRow).join('')}</ul>
        </form>` : ''}

        ${preview.length ? `<details style="margin-top:8px"><summary style="cursor:pointer;color:#888">Preview next generated dates</summary>
          <ul class="ev-occ-list" style="margin-top:8px">${preview.map((p) => `<li class="ev-occ-row"><span style="color:#aaa">${escHTML(formatFriendlyDate(p.startDate))}</span></li>`).join('')}</ul>
        </details>` : ''}

        ${past ? `<p style="margin-top:10px"><a href="/admin/events/${escHTML(event.id)}/signups?occ=all" style="color:#d2aa67">View past signups (${past} past date${past === 1 ? '' : 's'}) →</a></p>` : ''}
      </div>

      <div class="ev-occ-actions" style="display:flex;flex-wrap:wrap;gap:18px;margin-top:14px">
        <form method="POST" action="${escHTML(actionUrl)}" class="ev-occ-add" style="display:flex;align-items:flex-end;gap:8px">
          <input type="hidden" name="_action" value="addOccurrence" />
          <div><label style="font-size:0.82rem">Add a one-off date</label>
            <input type="datetime-local" name="occurrenceDate" required /></div>
          <button type="submit" class="btn btn-secondary btn-sm">Add date</button>
        </form>

        <form method="POST" action="${escHTML(actionUrl)}" class="ev-occ-roll" style="display:flex;align-items:flex-end;gap:8px" onsubmit="return confirm('Roll over to the next date now? This resets the live signup sheet and emails everyone who has signed up before.')">
          <input type="hidden" name="_action" value="rollover" />
          <div><label style="font-size:0.82rem">Roll over now <span style="color:#888;font-weight:400">(optional date)</span></label>
            <input type="datetime-local" name="rolloverDate" /></div>
          <button type="submit" class="btn btn-primary btn-sm">Roll over →</button>
        </form>
      </div>

      <div class="ev-occ-announce" style="margin-top:14px;padding-top:14px;border-top:1px solid rgba(255,255,255,0.08)">
        <form method="POST" action="${escHTML(actionUrl)}" onsubmit="return confirm('Email everyone who has ever signed up for this event about the current date? (People who opted out are skipped.)')">
          <input type="hidden" name="_action" value="announce" />
          <button type="submit" class="btn btn-secondary btn-sm">✉ Email past signups about this date</button>
          <span class="ev-section-hint" style="margin-left:8px">Lets people from past dates know — sends an invite to the live date${current ? ` (${escHTML(formatFriendlyDate(current.startDate))})` : ''}.</span>
        </form>
      </div>
    </div>`;
}

// Visual theme picker for the event editor's Appearance tab. Renders every
// registered theme as a selectable card with a mini color preview. The radio
// group submits as `themeKey` (the "default" option normalizes to null server
// side). Active state is set server-side and kept in sync by editor JS.
function themePickerFragment(currentKey) {
  const cur = currentKey || 'default';
  const card = (t) => {
    const isCur = t.key === cur;
    const s = t.swatch;
    return `
      <label class="ev-theme-card${isCur ? ' is-active' : ''}">
        <input type="radio" name="themeKey" value="${escHTML(t.key)}"${isCur ? ' checked' : ''} />
        <span class="ev-theme-preview" style="background:linear-gradient(140deg, ${escHTML(s.bg)}, ${escHTML(s.bg2)});">
          <span class="ev-theme-accentbar" style="background:${escHTML(s.accent)};"></span>
          <span class="ev-theme-sample" style="color:${escHTML(s.accent)};">${escHTML(t.label)}</span>
          <span class="ev-theme-dots">
            <span style="background:${escHTML(s.accent)};"></span>
            <span style="background:${escHTML(s.accent2)};"></span>
          </span>
          <span class="ev-theme-check" aria-hidden="true">✓</span>
        </span>
        <span class="ev-theme-meta">
          <span class="ev-theme-name">${escHTML(t.label)}</span>
          <span class="ev-theme-desc">${escHTML(t.description)}</span>
        </span>
      </label>`;
  };
  return `<div class="ev-theme-grid">${EVENT_THEMES.map(card).join('')}</div>`;
}

// Format a date as local datetime-local input value ("YYYY-MM-DDTHH:MM")
function toDateTimeLocal(value) {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return '';
  // Use Eastern time for display/editing since that's the business timezone
  const eastern = new Date(d.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const pad = n => String(n).padStart(2, '0');
  return `${eastern.getFullYear()}-${pad(eastern.getMonth() + 1)}-${pad(eastern.getDate())}T${pad(eastern.getHours())}:${pad(eastern.getMinutes())}`;
}

function formatFriendlyDate(value) {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// Reusable image upload fragment (file picker → base64 + URL fallback + preview).
// Used by image, hero, and two-column section types.
function imageUploadFragment(section, idPrefix) {
  const hasSrc = !!section?.src;
  return `
    <div class="sec-img-upload" data-prefix="${idPrefix}">
      <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" id="${idPrefix}-file" class="sec-img-file" />
      <div class="sec-img-hint">Click to choose a file (max ~500&#8239;KB), or paste a hosted image URL below.</div>
      <input type="text" id="${idPrefix}-url-input" placeholder="https://... (optional alternative)" class="sec-img-url-input" value="${hasSrc && /^https?:\/\//i.test(section.src) ? escHTML(section.src) : ''}" />
      <input type="hidden" id="${idPrefix}-src" name="src" value="${hasSrc ? escHTML(section.src) : ''}" />
      <div class="sec-img-preview-wrap">
        <img id="${idPrefix}-preview" class="sec-img-preview" src="${hasSrc ? escHTML(section.src) : ''}" alt="" style="${hasSrc ? '' : 'display:none'}" />
        ${hasSrc ? `<button type="button" class="btn btn-secondary btn-sm sec-img-clear" data-prefix="${idPrefix}">Remove image</button>` : ''}
      </div>
    </div>
  `;
}

function richTextToolbar(targetId) {
  return `
    <div class="rich-toolbar" data-target="${escHTML(targetId)}">
      <button type="button" class="rt-btn" data-action="bold">Bold</button>
      <button type="button" class="rt-btn" data-action="italic">Italic</button>
      <button type="button" class="rt-btn" data-action="bullet">Bullet</button>
      <button type="button" class="rt-btn" data-action="link">Link</button>
      <span class="rt-help">Use **bold**, *italic*, bullets, and pasted URLs.</span>
    </div>
  `;
}

// Render the inline edit form for a single section, by type. Used both for
// existing sections (when expanded) and the "add new section" panel.
function renderSectionEditFields(section, idPrefix) {
  const type = section?.type || 'text';
  if (type === 'text') {
    const align = section?.align || 'left';
    return `
      <label for="${idPrefix}-heading">Heading <span style="color:#888; font-weight:400; font-size:0.78rem">(optional)</span></label>
      <input type="text" id="${idPrefix}-heading" name="heading" value="${escHTML(section?.heading || '')}" placeholder="e.g. About the Event" />
      <label for="${idPrefix}-body">Body Text</label>
      ${richTextToolbar(`${idPrefix}-body`)}
      <textarea id="${idPrefix}-body" class="rich-textarea" name="body" rows="5" placeholder="What guests should know. Use bullets, pasted links, or [link text](https://example.com).">${escHTML(section?.body || '')}</textarea>
      <label>Text Alignment</label>
      <div style="display:flex; gap:14px;">
        <label class="ev-check"><input type="radio" name="align" value="left" ${align === 'left' ? 'checked' : ''} /> Left</label>
        <label class="ev-check"><input type="radio" name="align" value="center" ${align === 'center' ? 'checked' : ''} /> Center</label>
        <label class="ev-check"><input type="radio" name="align" value="right" ${align === 'right' ? 'checked' : ''} /> Right</label>
      </div>
      ${bgStylePicker(section, idPrefix)}
    `;
  }
  if (type === 'image') {
    return `
      <label>Image</label>
      ${imageUploadFragment(section, idPrefix)}
      <label for="${idPrefix}-caption">Caption <span style="color:#888; font-weight:400; font-size:0.78rem">(optional)</span></label>
      <input type="text" id="${idPrefix}-caption" name="caption" value="${escHTML(section?.caption || '')}" placeholder="Shown beneath the image" />
      <label for="${idPrefix}-alt">Alt Text <span style="color:#888; font-weight:400; font-size:0.78rem">(for accessibility)</span></label>
      <input type="text" id="${idPrefix}-alt" name="alt" value="${escHTML(section?.alt || '')}" placeholder="Describe the image briefly" />
    `;
  }
  if (type === 'details') {
    const items = Array.isArray(section?.items) && section.items.length > 0 ? section.items : [{ label: '', value: '' }];
    const rows = items.map(it => `
      <div class="sec-detail-row">
        <input type="text" name="detail_label" value="${escHTML(it.label || '')}" placeholder="e.g. Date" />
        <input type="text" name="detail_value" value="${escHTML(it.value || '')}" placeholder="e.g. Saturday, October 15" />
        <button type="button" class="btn btn-secondary btn-sm sec-detail-remove">×</button>
      </div>
    `).join('');
    return `
      <label for="${idPrefix}-title">Title <span style="color:#888; font-weight:400; font-size:0.78rem">(optional)</span></label>
      <input type="text" id="${idPrefix}-title" name="title" value="${escHTML(section?.title || '')}" placeholder="e.g. Event Info" />
      <label>Details</label>
      <div class="sec-detail-list" id="${idPrefix}-details">${rows}</div>
      <button type="button" class="btn btn-secondary btn-sm sec-detail-add" data-target="${idPrefix}-details">+ Add Row</button>
      ${bgStylePicker(section, idPrefix)}
    `;
  }
  if (type === 'button') {
    const style = section?.style || 'primary';
    return `
      <label for="${idPrefix}-label">Button Label <span style="color:#f87171">*</span></label>
      <input type="text" id="${idPrefix}-label" name="label" value="${escHTML(section?.label || '')}" placeholder="e.g. Get Tickets" required />
      <label for="${idPrefix}-url">Link URL <span style="color:#f87171">*</span></label>
      <input type="url" id="${idPrefix}-url" name="url" value="${escHTML(section?.url || '')}" placeholder="https://eventbrite.com/..." required />
      <label>Style</label>
      <div style="display:flex; gap:14px;">
        <label class="ev-check"><input type="radio" name="style" value="primary" ${style === 'primary' ? 'checked' : ''} /> Primary (gold, prominent)</label>
        <label class="ev-check"><input type="radio" name="style" value="secondary" ${style === 'secondary' ? 'checked' : ''} /> Secondary (outline)</label>
      </div>
      ${bgStylePicker(section, idPrefix)}
    `;
  }
  if (type === 'video') {
    return `
      <label for="${idPrefix}-url">Video URL <span style="color:#f87171">*</span></label>
      <input type="url" id="${idPrefix}-url" name="url" value="${escHTML(section?.url || '')}" placeholder="https://youtube.com/watch?v=... or https://vimeo.com/..." required />
      <div style="color:#888; font-size:0.78rem; margin-top:4px;">YouTube, Vimeo, and other common video URLs work. Will be embedded automatically.</div>
      <label for="${idPrefix}-caption">Caption <span style="color:#888; font-weight:400; font-size:0.78rem">(optional)</span></label>
      <input type="text" id="${idPrefix}-caption" name="caption" value="${escHTML(section?.caption || '')}" placeholder="Shown beneath the video" />
      ${bgStylePicker(section, idPrefix)}
    `;
  }
  if (type === 'divider') {
    return `<p style="color:#888; font-size:0.85rem; margin-top:8px;">A simple horizontal divider. No options needed.</p>`;
  }

  if (type === 'hero') {
    return `
      <label>Background Image <span style="color:#f87171">*</span></label>
      ${imageUploadFragment(section, idPrefix)}
      <label for="${idPrefix}-eyebrow">Eyebrow <span style="color:#888; font-weight:400; font-size:0.78rem">(small label above title)</span></label>
      <input type="text" id="${idPrefix}-eyebrow" name="eyebrow" value="${escHTML(section?.eyebrow || '')}" placeholder="e.g. PRESENTING" />
      <label for="${idPrefix}-title">Title</label>
      <input type="text" id="${idPrefix}-title" name="title" value="${escHTML(section?.title || '')}" placeholder="e.g. Lubrication Cup 2026" />
      <label for="${idPrefix}-subtitle">Subtitle <span style="color:#888; font-weight:400; font-size:0.78rem">(optional)</span></label>
      <input type="text" id="${idPrefix}-subtitle" name="subtitle" value="${escHTML(section?.subtitle || '')}" placeholder="e.g. The cocktail competition that crowns the city's best" />
    `;
  }
  if (type === 'twocol') {
    const pos = section?.imagePosition || 'left';
    return `
      <label>Image <span style="color:#f87171">*</span></label>
      ${imageUploadFragment(section, idPrefix)}
      <label for="${idPrefix}-alt">Alt Text <span style="color:#888; font-weight:400; font-size:0.78rem">(for accessibility)</span></label>
      <input type="text" id="${idPrefix}-alt" name="alt" value="${escHTML(section?.alt || '')}" placeholder="Describe the image briefly" />
      <label>Image Position</label>
      <div style="display:flex; gap:14px;">
        <label class="ev-check"><input type="radio" name="imagePosition" value="left" ${pos === 'left' ? 'checked' : ''} /> Image on left</label>
        <label class="ev-check"><input type="radio" name="imagePosition" value="right" ${pos === 'right' ? 'checked' : ''} /> Image on right</label>
      </div>
      <label for="${idPrefix}-heading">Heading <span style="color:#888; font-weight:400; font-size:0.78rem">(optional)</span></label>
      <input type="text" id="${idPrefix}-heading" name="heading" value="${escHTML(section?.heading || '')}" placeholder="e.g. About the Cup" />
      <label for="${idPrefix}-body">Body Text</label>
      ${richTextToolbar(`${idPrefix}-body`)}
      <textarea id="${idPrefix}-body" class="rich-textarea" name="body" rows="6" placeholder="The story alongside the image. Use bullets, pasted links, or [link text](https://example.com).">${escHTML(section?.body || '')}</textarea>
      ${bgStylePicker(section, idPrefix)}
    `;
  }
  if (type === 'schedule') {
    const items = Array.isArray(section?.items) && section.items.length > 0 ? section.items : [{ time: '', title: '', description: '' }];
    const rows = items.map(it => `
      <div class="sec-sched-row">
        <input type="text" name="sched_time" value="${escHTML(it.time || '')}" placeholder="7:00 PM" />
        <input type="text" name="sched_title" value="${escHTML(it.title || '')}" placeholder="What happens" />
        <input type="text" name="sched_desc" value="${escHTML(it.description || '')}" placeholder="Optional details" />
        <button type="button" class="btn btn-secondary btn-sm sec-sched-remove">×</button>
      </div>
    `).join('');
    return `
      <label for="${idPrefix}-title">Title <span style="color:#888; font-weight:400; font-size:0.78rem">(optional)</span></label>
      <input type="text" id="${idPrefix}-title" name="title" value="${escHTML(section?.title || '')}" placeholder="e.g. Schedule of Events" />
      <label>Schedule Items</label>
      <div class="sec-sched-list" id="${idPrefix}-sched">${rows}</div>
      <button type="button" class="btn btn-secondary btn-sm sec-sched-add" data-target="${idPrefix}-sched">+ Add Time Slot</button>
      ${bgStylePicker(section, idPrefix)}
    `;
  }
  if (type === 'faq') {
    const items = Array.isArray(section?.items) && section.items.length > 0 ? section.items : [{ question: '', answer: '' }];
    const rows = items.map(it => `
      <div class="sec-faq-row">
        <input type="text" name="faq_question" value="${escHTML(it.question || '')}" placeholder="Question (e.g. How do I sign up?)" />
        <textarea name="faq_answer" class="rich-textarea" rows="2" placeholder="Answer">${escHTML(it.answer || '')}</textarea>
        <button type="button" class="btn btn-secondary btn-sm sec-faq-remove">×</button>
      </div>
    `).join('');
    return `
      <label for="${idPrefix}-title">Title <span style="color:#888; font-weight:400; font-size:0.78rem">(optional)</span></label>
      <input type="text" id="${idPrefix}-title" name="title" value="${escHTML(section?.title || '')}" placeholder="e.g. Frequently Asked Questions" />
      <label>Questions</label>
      <div class="sec-faq-list" id="${idPrefix}-faq">${rows}</div>
      <button type="button" class="btn btn-secondary btn-sm sec-faq-add" data-target="${idPrefix}-faq">+ Add Question</button>
      ${bgStylePicker(section, idPrefix)}
    `;
  }

  if (type === 'cocktailmenu') {
    const items = Array.isArray(section?.items) && section.items.length > 0 ? section.items : [{ name: '', ingredients: '', abv: '', creator: '', vibe: '' }];
    const rows = items.map(it => cocktailRowHtml(it)).join('');
    return `
      <label for="${idPrefix}-title">Title <span style="color:#888; font-weight:400; font-size:0.78rem">(optional)</span></label>
      <input type="text" id="${idPrefix}-title" name="title" value="${escHTML(section?.title || '')}" placeholder="e.g. Event Cocktail Menu" />
      <label for="${idPrefix}-subtitle">Subtitle <span style="color:#888; font-weight:400; font-size:0.78rem">(optional)</span></label>
      <input type="text" id="${idPrefix}-subtitle" name="subtitle" value="${escHTML(section?.subtitle || '')}" placeholder="e.g. Pouring all night during the event" />
      <label>Drinks</label>
      <div class="sec-cm-list" id="${idPrefix}-cm">${rows}</div>
      <button type="button" class="btn btn-secondary btn-sm sec-cm-add" data-target="${idPrefix}-cm">+ Add Drink</button>
      ${bgStylePicker(section, idPrefix)}
    `;
  }

  return `<p style="color:#888;">Unknown section type</p>`;
}

// One editable drink row for the cocktail-menu section builder. Kept in sync
// with the JS that appends new rows (see sec-cm-add handler).
function cocktailRowHtml(it = {}) {
  return `
      <div class="sec-cm-row">
        <input type="text" name="cm_name" value="${escHTML(it.name || '')}" placeholder="Drink name" />
        <input type="text" name="cm_abv" value="${escHTML(it.abv || '')}" placeholder="ABV / price" />
        <button type="button" class="btn btn-secondary btn-sm sec-cm-remove">×</button>
        <input type="text" name="cm_ingredients" value="${escHTML(it.ingredients || '')}" placeholder="Ingredients — gin, lime, mint…" />
        <input type="text" name="cm_vibe" value="${escHTML(it.vibe || '')}" placeholder="Tasting note / vibe (optional)" />
        <input type="text" name="cm_creator" value="${escHTML(it.creator || '')}" placeholder="By (bartender, optional)" />
      </div>`;
}

function sectionPreviewSummary(section) {
  if (!section) return '';
  const type = section.type || 'text';
  if (type === 'text') {
    if (section.heading) return escHTML(section.heading);
    if (section.body) return escHTML(section.body.slice(0, 80) + (section.body.length > 80 ? '…' : ''));
    return '<em style="color:#666">Empty text</em>';
  }
  if (type === 'image') {
    return section.caption ? escHTML(section.caption) : '<em style="color:#666">Image</em>';
  }
  if (type === 'details') {
    const count = Array.isArray(section.items) ? section.items.length : 0;
    return `${section.title ? escHTML(section.title) + ' · ' : ''}${count} row${count === 1 ? '' : 's'}`;
  }
  if (type === 'button') {
    return `${escHTML(section.label || 'Button')} → ${escHTML((section.url || '').slice(0, 60))}`;
  }
  if (type === 'video') {
    return escHTML((section.url || '').slice(0, 60));
  }
  if (type === 'divider') {
    return '<em style="color:#666">— divider —</em>';
  }
  if (type === 'hero') {
    return section.title ? escHTML(section.title) : '<em style="color:#666">Hero banner</em>';
  }
  if (type === 'twocol') {
    if (section.heading) return escHTML(section.heading) + ' (image ' + (section.imagePosition || 'left') + ')';
    return '<em style="color:#666">Two-column block</em>';
  }
  if (type === 'schedule') {
    const count = Array.isArray(section.items) ? section.items.length : 0;
    return `${section.title ? escHTML(section.title) + ' · ' : ''}${count} item${count === 1 ? '' : 's'}`;
  }
  if (type === 'faq') {
    const count = Array.isArray(section.items) ? section.items.length : 0;
    return `${section.title ? escHTML(section.title) + ' · ' : ''}${count} question${count === 1 ? '' : 's'}`;
  }
  if (type === 'cocktailmenu') {
    const count = Array.isArray(section.items) ? section.items.length : 0;
    return `${section.title ? escHTML(section.title) + ' · ' : ''}${count} drink${count === 1 ? '' : 's'}`;
  }
  return '';
}

function sectionTypeIcon(type) {
  return ({
    text: 'T',
    image: '📷',
    details: '⋮',
    button: '▶',
    video: '►',
    divider: '—',
    hero: '★',
    twocol: '⊞',
    schedule: '⏱',
    faq: '?',
    cocktailmenu: '🍸',
  })[type] || '?';
}

// Background style picker fragment — used by section types that support theming
function bgStylePicker(section, idPrefix) {
  const current = section?.bgStyle || 'default';
  const options = [
    { key: 'default', label: 'Default' },
    { key: 'gold', label: 'Gold Highlight' },
    { key: 'dark', label: 'Dark Card' },
    { key: 'transparent', label: 'No Background' },
  ];
  return `
    <label for="${idPrefix}-bg">Background Style</label>
    <select id="${idPrefix}-bg" name="bgStyle">
      ${options.map(o => `<option value="${o.key}"${current === o.key ? ' selected' : ''}>${o.label}</option>`).join('')}
    </select>
  `;
}

function eventStatusBadge(event) {
  if (event.isCancelled) return '<span class="ev-badge ev-badge-cancelled">Cancelled</span>';
  if (!event.isActive) return '<span class="ev-badge ev-badge-inactive">Hidden</span>';

  const now = new Date();
  const start = event.startDate ? new Date(event.startDate) : null;
  const promoteFrom = event.promoteFrom ? new Date(event.promoteFrom) : null;
  const promoteUntil = event.promoteUntil ? new Date(event.promoteUntil) : (start || null);

  if (start && now > start) return '<span class="ev-badge ev-badge-past">Past</span>';
  if (promoteFrom && now < promoteFrom) return '<span class="ev-badge ev-badge-scheduled">Upcoming</span>';
  if (promoteUntil && now > promoteUntil) return '<span class="ev-badge ev-badge-closed">Signups Closed</span>';
  return '<span class="ev-badge ev-badge-live">Live</span>';
}

// ─── Events list (redesigned) ───
// Same data, much more scannable: hero thumbnail, status pill, signup count
// bar, inline action menu (Copy / QR / Public / Signups / Edit).
// QR studio: pick the QR color, background color (or transparent) and size,
// preview live, and download PNG/SVG for different ad backgrounds.
function eventQrStudioPage(event, user, opts = {}) {
  const dark = opts.dark || '#0f1012';
  const light = opts.light && opts.light !== '#00000000' ? opts.light : '#ffffff';
  const transparent = !!opts.transparent;
  const qrBase = `/admin/events/${escHTML(event.id)}/qr`;
  return adminLayout('QR code', `
    <style>
      .qr-studio { display:grid; grid-template-columns:300px 1fr; gap:20px; align-items:start; }
      @media (max-width:720px) { .qr-studio { grid-template-columns:1fr; } }
      .qr-controls .qr-field { margin-bottom:16px; }
      .qr-controls label { display:block; font-size:0.8rem; font-weight:700; color:var(--text-muted); margin-bottom:6px; }
      .qr-controls input[type=color] { width:54px; height:36px; padding:0; border:1px solid var(--line); border-radius:8px; background:#000; cursor:pointer; vertical-align:middle; }
      .qr-controls input[type=text] { width:110px; font-family:monospace; }
      .qr-controls input[type=range] { width:100%; }
      .qr-swatches { display:flex; gap:8px; flex-wrap:wrap; margin-top:8px; }
      .qr-swatch { width:26px; height:26px; border-radius:6px; border:1px solid var(--line); cursor:pointer; }
      .qr-preview-wrap { display:flex; flex-direction:column; align-items:center; gap:14px; }
      /* checkerboard so a transparent background is visible in the preview */
      .qr-preview { padding:16px; border-radius:12px; border:1px solid var(--line);
        background-image:linear-gradient(45deg,#2a2b30 25%,transparent 25%),linear-gradient(-45deg,#2a2b30 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#2a2b30 75%),linear-gradient(-45deg,transparent 75%,#2a2b30 75%);
        background-size:18px 18px; background-position:0 0,0 9px,9px -9px,-9px 0; }
      .qr-preview img { display:block; width:280px; height:280px; }
    </style>
    <div class="page-header">
      <div>
        <a href="/admin/events/${escHTML(event.id)}" class="evs-back" style="color:#888;text-decoration:none;font-size:0.85rem;">← Back to event</a>
        <h1 style="margin:4px 0 0;">QR code — ${escHTML(event.title)}</h1>
        <p class="page-subtitle">Recolor the code for different ad backgrounds, then download. The code always points to the public event page.</p>
      </div>
    </div>
    <div class="card">
      <div class="qr-studio">
        <div class="qr-controls">
          <div class="qr-field">
            <label>QR color ${helpTip('The color of the code itself. Keep it dark and high-contrast against the background so phones can still scan it.')}</label>
            <input type="color" id="qr-dark" value="${escHTML(dark)}" />
            <input type="text" id="qr-dark-hex" value="${escHTML(dark)}" />
          </div>
          <div class="qr-field">
            <label>Background</label>
            <input type="color" id="qr-light" value="${escHTML(light)}" ${transparent ? 'disabled' : ''} />
            <input type="text" id="qr-light-hex" value="${escHTML(light)}" ${transparent ? 'disabled' : ''} />
            <div class="qr-swatches">
              <span class="qr-swatch" data-bg="#ffffff" style="background:#fff" title="White"></span>
              <span class="qr-swatch" data-bg="#0f1012" style="background:#0f1012" title="Near-black"></span>
              <span class="qr-swatch" data-bg="#f4f1ea" style="background:#f4f1ea" title="Cream"></span>
              <span class="qr-swatch" data-bg="#d4af37" style="background:#d4af37" title="Gold"></span>
            </div>
          </div>
          <div class="qr-field">
            <label class="ev-check" style="display:flex;align-items:center;gap:8px;">
              <input type="checkbox" id="qr-transparent" ${transparent ? 'checked' : ''} /> Transparent background ${helpTip('Removes the background so the code drops onto any colored or photo ad. Best with a dark QR color. PNG and SVG both keep the transparency.')}
            </label>
          </div>
          <div class="qr-field">
            <label>Size (PNG): <span id="qr-size-val">800</span> px</label>
            <input type="range" id="qr-size" min="300" max="2000" step="100" value="800" />
          </div>
          <div style="display:flex; gap:10px; flex-wrap:wrap;">
            <a id="qr-dl-png" class="btn btn-primary" href="#">Download PNG</a>
            <a id="qr-dl-svg" class="btn btn-secondary" href="#">Download SVG (vector)</a>
          </div>
          <p style="color:var(--text-soft); font-size:0.78rem; margin:12px 0 0;">SVG scales to any size without blurring — best for print. PNG is best for web/social.</p>
        </div>
        <div class="qr-preview-wrap">
          <div class="qr-preview"><img id="qr-img" alt="QR preview" /></div>
          <div style="color:var(--text-muted); font-size:0.8rem;">Scan to test before you print.</div>
        </div>
      </div>
    </div>
    <script>
      (function() {
        var base = ${JSON.stringify(`/admin/events/${event.id}/qr`)};
        var darkC = document.getElementById('qr-dark'), darkH = document.getElementById('qr-dark-hex');
        var lightC = document.getElementById('qr-light'), lightH = document.getElementById('qr-light-hex');
        var trans = document.getElementById('qr-transparent');
        var size = document.getElementById('qr-size'), sizeVal = document.getElementById('qr-size-val');
        var img = document.getElementById('qr-img');
        var dlPng = document.getElementById('qr-dl-png'), dlSvg = document.getElementById('qr-dl-svg');
        function hex(v) { return String(v || '').replace(/^#/, ''); }
        function params(extra) {
          var p = 'dark=' + encodeURIComponent(hex(darkC.value));
          if (trans.checked) p += '&transparent=1';
          else p += '&light=' + encodeURIComponent(hex(lightC.value));
          return p + (extra || '');
        }
        function refresh() {
          sizeVal.textContent = size.value;
          lightC.disabled = lightH.disabled = trans.checked;
          img.src = base + '?' + params('&size=600') + '&_=' + Date.now();
          dlPng.href = base + '?fmt=png&download=1&' + params('&size=' + size.value);
          dlSvg.href = base + '?fmt=svg&download=1&' + params();
        }
        darkC.addEventListener('input', function(){ darkH.value = darkC.value; refresh(); });
        darkH.addEventListener('change', function(){ if (/^#?[0-9a-fA-F]{6}$/.test(darkH.value)) { darkC.value = darkH.value.replace(/^#?/, '#'); refresh(); } });
        lightC.addEventListener('input', function(){ lightH.value = lightC.value; refresh(); });
        lightH.addEventListener('change', function(){ if (/^#?[0-9a-fA-F]{6}$/.test(lightH.value)) { lightC.value = lightH.value.replace(/^#?/, '#'); refresh(); } });
        trans.addEventListener('change', refresh);
        size.addEventListener('input', refresh);
        Array.prototype.forEach.call(document.querySelectorAll('.qr-swatch'), function(s) {
          s.addEventListener('click', function(){ trans.checked = false; lightC.value = s.getAttribute('data-bg'); lightH.value = s.getAttribute('data-bg'); refresh(); });
        });
        refresh();
      })();
    </script>
  `, user);
}

// Redesigned import panel: events from the Dram website grouped by identity,
// each showing per-venue status (✓ already on menuqr, or "+ <venue>" to add).
// Accepts { groups, count }; tolerates the legacy array shape (renders nothing).
function renderImportPanel(importable) {
  const data = (importable && !Array.isArray(importable)) ? importable : null;
  const groups = data && Array.isArray(data.groups) ? data.groups : [];
  const count = data ? (data.count || 0) : 0;
  if (!groups.length) return '';

  const fmtDate = (d) => d
    ? new Date(d).toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : 'Date TBD';

  const chip = (v) => {
    if (v.already) return `<span class="ev-imp-chip is-done" title="Already on menuqr">✓ ${escHTML(v.locationName)}</span>`;
    if (v.needsPick) return `<a class="ev-imp-chip needs-pick" href="/admin/events/new?importFrom=${encodeURIComponent(v.sourceId)}" title="We couldn't match this to one of your locations — you'll choose it on the next screen">+ ${escHTML(v.locationName)} ⚲</a>`;
    return `<a class="ev-imp-chip is-add" href="/admin/events/new?importFrom=${encodeURIComponent(v.sourceId)}" title="Import to ${escHTML(v.locationName)}">+ ${escHTML(v.locationName)}</a>`;
  };

  const groupHtml = groups.map((g) => {
    const venues = (g.venues || []).map(chip).join('');
    const d = g.detail || {};
    const venueRows = (g.venues || []).map((v) => `
      <div class="ev-imp-vrow">
        <span class="ev-imp-vrow-loc">${escHTML(v.locationName)}${v.needsPick && v.sourceVenue ? '' : ''}</span>
        ${v.already
          ? '<span class="ev-imp-vrow-status is-done">✓ already on menuqr</span>'
          : (v.needsPick
            ? `<a class="ev-imp-vrow-status needs-pick" href="/admin/events/new?importFrom=${encodeURIComponent(v.sourceId)}">choose location &amp; import →</a>`
            : `<a class="ev-imp-vrow-status is-add" href="/admin/events/new?importFrom=${encodeURIComponent(v.sourceId)}">import →</a>`)}
      </div>`).join('');
    const needsPickAny = (g.venues || []).some(v => v.needsPick && !v.already);
    return `
      <div class="ev-imp-event" data-imp-id="${escHTML(g.identity || g.baseName || '')}">
        <div class="ev-imp-event-top">
          <div class="ev-imp-event-info">
            <div class="ev-imp-event-name">${escHTML(g.baseName || 'Untitled event')}</div>
            <div class="ev-imp-event-date">${escHTML(fmtDate(g.date))}</div>
          </div>
          <div class="ev-imp-venues">${venues}</div>
          <button type="button" class="ev-imp-dismiss" title="Remove from this list (you can restore it)" aria-label="Remove this import">✕</button>
        </div>
        <details class="ev-imp-details">
          <summary>See details${needsPickAny ? ' · ⚲ a venue needs a location' : ''}</summary>
          <div class="ev-imp-detail-body">
            ${d.image ? `<img class="ev-imp-thumb" src="${escHTML(d.image)}" alt="" loading="lazy" />` : ''}
            <div class="ev-imp-detail-text">
              ${d.descPreview ? `<p class="ev-imp-desc">${escHTML(d.descPreview)}${d.descPreview.length >= 320 ? '…' : ''}</p>` : '<p class="ev-imp-desc" style="color:var(--text-soft);">No description provided by the source.</p>'}
              <div class="ev-imp-detail-meta">
                ${d.capacity ? `<span>Capacity: ${escHTML(String(d.capacity))}</span>` : ''}
                ${d.ticketUrl ? `<span>· <a href="${escHTML(d.ticketUrl)}" target="_blank" rel="noopener">Ticket link ↗</a></span>` : ''}
              </div>
              <div class="ev-imp-venue-list">
                <div class="ev-imp-venue-list-head">Locations on the source site:</div>
                ${venueRows}
              </div>
              <p class="ev-imp-note">Importing opens the event for review — you confirm the location, see the full text, and the AI builds the page before anything is published. Nothing goes live until you publish it.</p>
            </div>
          </div>
        </details>
      </div>`;
  }).join('');

  return `
    <style>
      .ev-import-rail { margin:0 0 16px; border-radius:12px; border:1px solid rgba(125,211,252,0.3);
        background:linear-gradient(180deg,rgba(125,211,252,0.08),rgba(125,211,252,0.02)); }
      .ev-import-rail > summary { cursor:pointer; list-style:none; display:flex; align-items:center; gap:12px; padding:14px 16px; }
      .ev-import-rail > summary::-webkit-details-marker { display:none; }
      .ev-imp-toggle { margin-left:auto; color:#9cc7ee; font-size:0.78rem; font-weight:700; white-space:nowrap; }
      .ev-imp-toggle::after { content:'Hide ▴'; }
      .ev-import-rail:not([open]) .ev-imp-toggle::after { content:'Show ▾'; }
      .ev-imp-body { padding:4px 14px 14px; display:flex; flex-direction:column; gap:8px; max-height:460px; overflow:auto; }
      .ev-imp-event { padding:11px 14px; border-radius:10px; background:rgba(0,0,0,0.18); border:1px solid rgba(255,255,255,0.06); }
      .ev-imp-event-top { display:flex; align-items:center; justify-content:space-between; gap:14px; flex-wrap:wrap; }
      .ev-imp-event-info { min-width:160px; flex:1; }
      .ev-imp-event-name { color:var(--text); font-weight:800; font-size:0.95rem; }
      .ev-imp-event-date { color:var(--text-muted); font-size:0.8rem; margin-top:2px; }
      .ev-imp-venues { display:flex; flex-wrap:wrap; gap:6px; justify-content:flex-end; }
      .ev-imp-event[hidden] { display:none; }
      .ev-imp-dismiss { flex:0 0 auto; width:26px; height:26px; border-radius:50%; border:1px solid rgba(255,255,255,0.15);
        background:transparent; color:var(--text-soft); font-size:0.85rem; cursor:pointer; line-height:1; }
      .ev-imp-dismiss:hover { color:#fca5a5; border-color:rgba(239,68,68,0.5); background:rgba(239,68,68,0.1); }
      .ev-imp-restore { margin:8px 14px 12px; color:#9cc7ee; font-size:0.8rem; }
      .ev-imp-restore[hidden] { display:none; }
      .ev-imp-restore button { background:none; border:none; color:#9cc7ee; font:inherit; font-weight:700; cursor:pointer; text-decoration:underline; padding:0; }
      .ev-imp-chip { display:inline-flex; align-items:center; gap:4px; padding:5px 11px; border-radius:999px;
        font-size:0.82rem; font-weight:700; text-decoration:none; white-space:nowrap; }
      .ev-imp-chip.is-done { color:#86efac; background:rgba(34,197,94,0.12); border:1px solid rgba(34,197,94,0.3); }
      .ev-imp-chip.is-add { color:#0f1012; background:linear-gradient(180deg,#bfe3ff,#7dd3fc); border:1px solid #7dd3fc; }
      .ev-imp-chip.is-add:hover { filter:brightness(1.06); }
      .ev-imp-chip.needs-pick { color:#fcd34d; background:rgba(245,158,11,0.12); border:1px solid rgba(245,158,11,0.4); }
      .ev-imp-chip.needs-pick:hover { background:rgba(245,158,11,0.2); }
      .ev-imp-details { margin-top:8px; }
      .ev-imp-details > summary { cursor:pointer; list-style:none; color:#9cc7ee; font-size:0.78rem; font-weight:700; padding:4px 0; }
      .ev-imp-details > summary::-webkit-details-marker { display:none; }
      .ev-imp-details > summary::before { content:'▸ '; }
      .ev-imp-details[open] > summary::before { content:'▾ '; }
      .ev-imp-detail-body { display:flex; gap:14px; padding:8px 0 2px; flex-wrap:wrap; }
      .ev-imp-thumb { width:120px; height:80px; object-fit:cover; border-radius:8px; flex:0 0 auto; }
      .ev-imp-detail-text { flex:1; min-width:200px; }
      .ev-imp-desc { color:var(--text); font-size:0.86rem; line-height:1.5; margin:0 0 8px; }
      .ev-imp-detail-meta { color:var(--text-muted); font-size:0.8rem; margin-bottom:10px; }
      .ev-imp-detail-meta a { color:#9cc7ee; }
      .ev-imp-venue-list-head { color:var(--text-soft); font-size:0.72rem; font-weight:800; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:5px; }
      .ev-imp-vrow { display:flex; align-items:center; justify-content:space-between; gap:10px; padding:5px 0; border-top:1px solid rgba(255,255,255,0.06); }
      .ev-imp-vrow-loc { color:var(--text); font-size:0.86rem; font-weight:600; }
      .ev-imp-vrow-status { font-size:0.8rem; font-weight:700; text-decoration:none; white-space:nowrap; }
      .ev-imp-vrow-status.is-done { color:#86efac; }
      .ev-imp-vrow-status.is-add { color:#7dd3fc; }
      .ev-imp-vrow-status.needs-pick { color:#fcd34d; }
      .ev-imp-note { color:var(--text-soft); font-size:0.78rem; line-height:1.5; margin:10px 0 0; }
      .ev-imp-hide { margin-left:8px; background:transparent; border:1px solid rgba(255,255,255,0.18); color:var(--text-muted);
        border-radius:999px; padding:3px 10px; font-size:0.74rem; font-weight:700; cursor:pointer; white-space:nowrap; }
      .ev-imp-hide:hover { color:var(--text); border-color:rgba(255,255,255,0.4); }
      .ev-imp-show { margin:0 0 16px; background:transparent; border:1px dashed rgba(125,211,252,0.4); color:#9cc7ee;
        border-radius:10px; padding:8px 14px; font-size:0.82rem; font-weight:700; cursor:pointer; }
      .ev-imp-show[hidden] { display:none; }
    </style>
    <div id="ev-import-wrap">
      <details class="ev-import-rail" open>
        <summary>
          <span style="font-size:1.15rem;">✨</span>
          <div style="min-width:0;">
            <strong style="color:#cfe4ff;">Import from the Dram &amp; Draught website</strong>
            <div style="color:var(--text-muted); font-size:0.8rem; margin-top:2px;">
              ${count} to add across ${groups.length} event${groups.length === 1 ? '' : 's'} · <span style="color:#86efac;">✓</span> already on menuqr · tap a venue to import it
            </div>
          </div>
          <span class="ev-imp-toggle"></span>
          <button type="button" class="ev-imp-hide" id="ev-import-hide" title="Hide this panel — you can bring it back anytime">Hide ✕</button>
        </summary>
        <div class="ev-imp-body">${groupHtml}</div>
      <div class="ev-imp-restore" id="ev-import-restore" hidden><span id="ev-import-restore-n"></span> removed · <button type="button" id="ev-import-restore-btn">show them</button></div>
      </details>
    </div>
    <button type="button" class="ev-imp-show" id="ev-import-show" hidden>✨ Show import from the Dram &amp; Draught website (${count})</button>
    <script>
      (function() {
        var HIDE_KEY = 'menuqr-events-import-hidden';
        var DISMISS_KEY = 'menuqr-events-import-dismissed';
        var wrap = document.getElementById('ev-import-wrap');
        var showBtn = document.getElementById('ev-import-show');
        var hideBtn = document.getElementById('ev-import-hide');
        function applyHide(hidden) {
          if (wrap) wrap.hidden = hidden;
          if (showBtn) showBtn.hidden = !hidden;
        }
        var isHidden = false;
        try { isHidden = localStorage.getItem(HIDE_KEY) === '1'; } catch (e) {}
        applyHide(isHidden);
        if (hideBtn) hideBtn.addEventListener('click', function(e) {
          e.preventDefault(); e.stopPropagation();
          try { localStorage.setItem(HIDE_KEY, '1'); } catch (e2) {}
          applyHide(true);
        });
        if (showBtn) showBtn.addEventListener('click', function() {
          try { localStorage.removeItem(HIDE_KEY); } catch (e2) {}
          applyHide(false);
        });

        // Per-event dismissal: remove individual imports from the list (kept in
        // localStorage by identity). A footer lets you restore everything.
        var restore = document.getElementById('ev-import-restore');
        var restoreN = document.getElementById('ev-import-restore-n');
        var restoreBtn = document.getElementById('ev-import-restore-btn');
        function getDismissed() {
          try { var a = JSON.parse(localStorage.getItem(DISMISS_KEY) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; }
        }
        function setDismissed(a) { try { localStorage.setItem(DISMISS_KEY, JSON.stringify(a)); } catch (e) {} }
        function applyDismissed() {
          var set = getDismissed();
          var events = wrap ? wrap.querySelectorAll('.ev-imp-event') : [];
          var hiddenCount = 0;
          Array.prototype.forEach.call(events, function(ev) {
            var id = ev.getAttribute('data-imp-id');
            var dismissed = set.indexOf(id) !== -1;
            ev.hidden = dismissed;
            if (dismissed) hiddenCount++;
          });
          if (restore) restore.hidden = hiddenCount === 0;
          if (restoreN) restoreN.textContent = hiddenCount + (hiddenCount === 1 ? ' event' : ' events');
        }
        if (wrap) wrap.addEventListener('click', function(e) {
          var btn = e.target.closest && e.target.closest('.ev-imp-dismiss');
          if (!btn) return;
          var ev = btn.closest('.ev-imp-event');
          var id = ev && ev.getAttribute('data-imp-id');
          if (!id) return;
          var set = getDismissed();
          if (set.indexOf(id) === -1) set.push(id);
          setDismissed(set);
          applyDismissed();
        });
        if (restoreBtn) restoreBtn.addEventListener('click', function() { setDismissed([]); applyDismissed(); });
        applyDismissed();
      })();
    </script>`;
}

function eventsList(events, user, flashMsg, filter = 'upcoming', importable = []) {
  const now = new Date();
  const bucketOf = (ev) => {
    if (ev.isCancelled) return 'cancelled';
    if (!ev.isActive) return 'hidden';
    if (ev.startDate && new Date(ev.startDate) < now) return 'past';
    return 'upcoming';
  };

  // Compute counts before filtering so chips reflect the full set.
  const counts = events.reduce((acc, ev) => {
    acc[bucketOf(ev)] = (acc[bucketOf(ev)] || 0) + 1;
    acc.all += 1;
    return acc;
  }, { all: 0, upcoming: 0, past: 0, hidden: 0, cancelled: 0 });

  const visible = filter === 'all'
    ? events
    : events.filter((ev) => bucketOf(ev) === filter);

  const filterChip = (key, label, count) => {
    const active = filter === key;
    const href = key === 'upcoming' ? '/admin/events' : `/admin/events?filter=${key}`;
    return `<a class="ev-chip ${active ? 'is-active' : ''}" href="${escHTML(href)}">${escHTML(label)}<span class="ev-chip-count">${count}</span></a>`;
  };

  const renderCard = (ev) => {
    const signupCount = ev._count?.signups || 0;
    const cap = ev.capacity || 0;
    const fillPct = cap ? Math.min(100, Math.round((signupCount / cap) * 100)) : 0;
    const locName = ev.location?.name || '';
    const locSlug = ev.location?.slug || '';
    const publicPath = locSlug && ev.slug ? `/${locSlug}/events/${ev.slug}` : '';
    const qrPath = `/admin/events/${ev.id}/qr`;
    const imgUrl = ev.image && /^(https?:|data:image\/)/i.test(ev.image) ? ev.image : null;
    const startDate = ev.startDate ? new Date(ev.startDate) : null;
    const startMonth = startDate ? startDate.toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short' }) : '';
    const startDay = startDate ? startDate.toLocaleString('en-US', { timeZone: 'America/New_York', day: 'numeric' }) : '';
    const startTime = startDate ? startDate.toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' }) : '';
    const { effectiveSignupType: pickType, SIGNUP_TYPE_LABELS } = require('../eventSignupTypes');
    const typeLabel = SIGNUP_TYPE_LABELS[pickType(ev)] || 'Guest RSVP';

    return `
      <div class="ev-card ${bucketOf(ev)}">
        <div class="ev-card-date" aria-hidden="true">
          ${startDate ? `<span class="ev-card-date-month">${escHTML(startMonth)}</span><span class="ev-card-date-day">${escHTML(startDay)}</span><span class="ev-card-date-time">${escHTML(startTime)}</span>` : '<span class="ev-card-date-none">No date</span>'}
        </div>
        <div class="ev-card-thumb">
          ${imgUrl ? `<img src="${escHTML(imgUrl)}" alt="" loading="lazy" />` : '<span class="ev-card-thumb-empty" aria-hidden="true">◎</span>'}
        </div>
        <div class="ev-card-body">
          <div class="ev-card-head">
            <a class="ev-card-title" href="/admin/events/${escHTML(ev.id)}">${escHTML(ev.title)}</a>
            ${eventStatusBadge(ev)}
            ${ev.isRecurring ? '<span class="ev-badge ev-badge-recurring" title="Repeats on a schedule">↻ Repeats</span>' : ''}
          </div>
          <div class="ev-card-meta">
            <span>${escHTML(locName) || 'No location'}</span>
            <span class="dot">•</span>
            <span>${escHTML(typeLabel)}</span>
            ${ev.themeKey ? `<span class="dot">•</span><span class="ev-card-theme">${(() => {
              const t = THEME_BY_KEY[ev.themeKey];
              const dot = t ? `<span class="ev-card-theme-dot" style="background:${escHTML(t.swatch.accent)};"></span>` : '';
              return `${dot}${escHTML(themeLabel(ev.themeKey))}`;
            })()}</span>` : ''}
          </div>
          <div class="ev-card-signups">
            <div class="ev-card-signups-line">
              <strong>${signupCount}</strong> signup${signupCount === 1 ? '' : 's'}${cap ? ` / ${cap}` : ''}
              ${ev.signupsEnabled === false ? '<span class="ev-card-signups-off">signups off</span>' : ''}
            </div>
            ${cap ? `<div class="ev-card-bar"><span style="width:${fillPct}%;"></span></div>` : ''}
          </div>
        </div>
        <div class="ev-card-actions">
          <a class="btn btn-primary btn-sm" href="/admin/events/${escHTML(ev.id)}">Edit</a>
          <a class="btn btn-secondary btn-sm" href="/admin/events/${escHTML(ev.id)}/signups">Signups${signupCount ? ` (${signupCount})` : ''}</a>
          <details class="ev-card-more">
            <summary class="btn btn-secondary btn-sm">More ▾</summary>
            <div class="ev-card-menu">
              ${publicPath ? `<a href="${escHTML(publicPath)}" target="_blank" rel="noopener">Open public page ↗</a>` : ''}
              ${publicPath ? `<button type="button" class="ev-copy-link" data-href="${escHTML(publicPath)}">Copy public link</button>` : ''}
              <a href="${escHTML(qrPath)}?studio=1">QR code &amp; colors</a>
              <a href="${escHTML(qrPath)}?fmt=png&download=1" target="_blank" rel="noopener">Quick QR download (PNG)</a>
              <hr />
              <form method="POST" action="/admin/events/${escHTML(ev.id)}" style="margin:0;">
                <input type="hidden" name="_action" value="duplicate" />
                <button type="submit">Duplicate</button>
              </form>
              <hr />
              <form method="POST" action="/admin/events/${escHTML(ev.id)}" style="margin:0;" onsubmit="return confirm('Delete &quot;${escHTML((ev.title || 'this event').replace(/"/g, ''))}&quot;? This permanently removes the event and all its signups. This cannot be undone.');">
                <input type="hidden" name="_action" value="delete" />
                <button type="submit" style="color:#fca5a5;">Delete event</button>
              </form>
            </div>
          </details>
        </div>
      </div>`;
  };

  // Collapse the same event across locations into one group. Grouping is by
  // computed IDENTITY (base name + date) — not source id or raw title — so the
  // same event at different venues groups even when imported separately. A
  // manual groupKey overrides. The header uses the clean base name and shows
  // each DISTINCT location (a same-location duplicate is flagged, not counted
  // as another location).
  const { eventBaseName, effectiveGroupKey } = require('../eventGrouping');
  const groups = new Map();
  for (const ev of visible) {
    const key = effectiveGroupKey(ev);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(ev);
  }
  const renderedGroups = new Set();
  const cards = visible.map((ev) => {
    const key = effectiveGroupKey(ev);
    const members = key ? groups.get(key) : null;
    if (!members || members.length < 2) return renderCard(ev);
    if (renderedGroups.has(key)) return '';
    renderedGroups.add(key);
    // Distinct locations, with a duplicate warning when a venue appears twice.
    const locCounts = new Map();
    for (const m of members) {
      const name = m.location?.name || 'No location';
      locCounts.set(name, (locCounts.get(name) || 0) + 1);
    }
    const locChips = Array.from(locCounts.entries())
      .map(([name, n]) => `<span class="ev-group-chip${n > 1 ? ' is-dup' : ''}"${n > 1 ? ' title="Duplicate — this event exists more than once at this location"' : ''}>${escHTML(name)}${n > 1 ? ` ⚠×${n}` : ''}</span>`)
      .join('');
    const distinctLocs = locCounts.size;
    const hasDup = Array.from(locCounts.values()).some(n => n > 1);
    const totalSignups = members.reduce((s, m) => s + (m._count?.signups || 0), 0);
    return `
      <details class="ev-group" open>
        <summary class="ev-group-head">
          <span class="ev-group-caret" aria-hidden="true">▾</span>
          <span class="ev-group-title">${escHTML(eventBaseName(members[0].title))}</span>
          <span class="ev-group-badge">${distinctLocs} location${distinctLocs === 1 ? '' : 's'}</span>
          ${hasDup ? '<span class="ev-group-badge" style="background:rgba(239,68,68,0.14);border-color:rgba(239,68,68,0.4);color:#fca5a5;">duplicates</span>' : ''}
          <span class="ev-group-locs">${locChips}</span>
          <span class="ev-group-signups">${totalSignups} signup${totalSignups === 1 ? '' : 's'} total</span>
        </summary>
        <div class="ev-group-body">${members.map(renderCard).join('')}</div>
      </details>`;
  }).join('');

  return adminLayout('Events', `
    <style>
      :root { --ev-card-radius: 12px; }
      .ev-hero {
        display: flex; align-items: flex-start; justify-content: space-between;
        gap: 18px; margin-bottom: 14px; padding: 22px 24px;
        background: linear-gradient(180deg, rgba(255,255,255,0.035), rgba(255,255,255,0.01)), var(--surface);
        border: 1px solid var(--line); border-radius: var(--ev-card-radius);
      }
      .ev-hero-left h1 { margin: 4px 0 6px; font-size: clamp(1.6rem, 2.6vw, 2.1rem); }
      .ev-hero .ev-hero-stats {
        display: flex; gap: 18px; margin-top: 8px;
        color: var(--text-muted); font-size: 0.88rem;
      }
      .ev-hero .ev-hero-stats strong { color: var(--gold-strong); font-size: 1.4rem; display: block; line-height: 1; }
      .ev-hero .ev-hero-stats span.sub { display: block; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.06em; font-weight: 700; margin-top: 4px; }

      .ev-group {
        border: 1px solid var(--line); border-radius: var(--ev-card-radius);
        background: rgba(255,255,255,0.02); margin-bottom: 10px;
        /* not overflow:hidden — it would clip the card "More" dropdown */
      }
      .ev-group[open] { background: rgba(212,175,55,0.04); }
      .ev-group-head {
        display: flex; align-items: center; flex-wrap: wrap; gap: 10px;
        padding: 12px 16px; cursor: pointer; list-style: none;
        border-bottom: 1px solid transparent;
      }
      .ev-group[open] .ev-group-head { border-bottom-color: var(--line); }
      .ev-group-head::-webkit-details-marker { display: none; }
      .ev-group-caret { color: var(--text-muted); transition: transform 0.15s; }
      .ev-group:not([open]) .ev-group-caret { transform: rotate(-90deg); }
      .ev-group-title { font-weight: 800; color: var(--text); font-size: 1rem; }
      .ev-group-badge {
        font-size: 0.72rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em;
        color: var(--gold-strong); background: rgba(212,175,55,0.12);
        border: 1px solid rgba(212,175,55,0.3); border-radius: 999px; padding: 2px 9px;
      }
      .ev-group-locs { display: flex; flex-wrap: wrap; gap: 5px; }
      .ev-group-chip {
        font-size: 0.74rem; color: var(--text-muted);
        background: rgba(255,255,255,0.05); border: 1px solid var(--line);
        border-radius: 999px; padding: 2px 9px;
      }
      .ev-group-chip.is-dup { color:#fca5a5; background:rgba(239,68,68,0.12); border-color:rgba(239,68,68,0.4); font-weight:700; }
      .ev-group-signups { margin-left: auto; color: var(--text-muted); font-size: 0.82rem; }
      .ev-group-body { padding: 10px 12px; display: flex; flex-direction: column; gap: 10px; }
      .ev-group-body .ev-card { background: var(--surface); }

      .ev-chip-rail { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 14px; }
      .ev-chip {
        display: inline-flex; align-items: center; gap: 8px;
        padding: 7px 13px; border-radius: 999px;
        background: rgba(255,255,255,0.04); border: 1px solid var(--line);
        color: var(--text-muted); text-decoration: none; font-size: 0.84rem; font-weight: 700;
        transition: all 0.15s;
      }
      .ev-chip:hover { color: var(--text); border-color: rgba(240,199,102,0.4); text-decoration: none; }
      .ev-chip.is-active { background: var(--gold-strong); color: #17110a; border-color: var(--gold-strong); }
      .ev-chip-count { font-size: 0.72rem; font-weight: 800; padding: 1px 7px; border-radius: 999px; background: rgba(255,255,255,0.06); color: var(--text-muted); }
      .ev-chip.is-active .ev-chip-count { background: rgba(0,0,0,0.18); color: #17110a; }

      .ev-list { display: flex; flex-direction: column; gap: 12px; }

      .ev-card {
        display: grid;
        grid-template-columns: 72px 84px 1fr auto;
        gap: 16px; align-items: center;
        padding: 14px 16px;
        background: linear-gradient(180deg, rgba(255,255,255,0.035), rgba(255,255,255,0.01)), var(--surface);
        border: 1px solid var(--line); border-radius: var(--ev-card-radius);
        transition: border-color 0.18s, box-shadow 0.18s;
      }
      .ev-card:hover { border-color: rgba(240,199,102,0.45); box-shadow: 0 8px 24px rgba(0,0,0,0.25); }
      .ev-card.cancelled, .ev-card.past { opacity: 0.7; }

      .ev-card-date {
        display: flex; flex-direction: column; align-items: center;
        background: rgba(255,255,255,0.04); border: 1px solid var(--line); border-radius: 10px;
        padding: 10px 6px;
      }
      .ev-card-date-month { font-size: 0.74rem; color: var(--gold-strong); text-transform: uppercase; letter-spacing: 0.06em; font-weight: 800; }
      .ev-card-date-day { font-size: 1.7rem; color: var(--text); font-weight: 800; line-height: 1; }
      .ev-card-date-time { font-size: 0.7rem; color: var(--text-muted); margin-top: 4px; }
      .ev-card-date-none { font-size: 0.74rem; color: var(--text-muted); text-align: center; padding: 14px 4px; }

      .ev-card-thumb {
        width: 84px; height: 84px; border-radius: 8px; overflow: hidden;
        background: rgba(255,255,255,0.03); border: 1px solid var(--line);
        display: flex; align-items: center; justify-content: center;
      }
      .ev-card-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
      .ev-card-thumb-empty { color: var(--text-soft); font-size: 1.8rem; opacity: 0.4; }

      .ev-card-body { min-width: 0; }
      .ev-card-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 4px; }
      .ev-card-title { font-size: 1.05rem; font-weight: 800; color: var(--text); text-decoration: none; }
      .ev-card-title:hover { color: var(--gold-strong); text-decoration: none; }
      .ev-card-meta { color: var(--text-muted); font-size: 0.84rem; display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
      .ev-card-meta .dot { color: var(--text-soft); }
      .ev-card-theme { display:inline-flex; align-items:center; gap:5px; font-size: 0.74rem; color: var(--text-muted); }
      .ev-card-theme-dot { width:9px; height:9px; border-radius:50%; box-shadow:0 0 0 1px rgba(255,255,255,0.18); flex:0 0 auto; }
      .ev-card-signups { margin-top: 6px; }
      .ev-card-signups-line { display: flex; gap: 8px; align-items: center; color: var(--text-muted); font-size: 0.82rem; }
      .ev-card-signups-line strong { color: var(--text); font-weight: 800; }
      .ev-card-signups-off {
        display: inline-block; padding: 1px 8px; border-radius: 999px;
        font-size: 0.66rem; text-transform: uppercase; letter-spacing: 0.05em;
        background: rgba(255,255,255,0.05); color: var(--text-soft);
      }
      .ev-card-bar { height: 4px; border-radius: 2px; background: rgba(255,255,255,0.06); overflow: hidden; margin-top: 4px; }
      .ev-card-bar > span { display: block; height: 100%; background: linear-gradient(90deg, #62d28f, var(--gold-strong)); }

      .ev-card-actions { display: flex; gap: 6px; align-items: center; }
      .ev-card-actions .btn { white-space: nowrap; }

      .ev-card-more { position: relative; }
      .ev-card-more summary { list-style: none; cursor: pointer; }
      .ev-card-more summary::-webkit-details-marker { display: none; }
      .ev-card-menu {
        position: absolute; right: 0; top: calc(100% + 6px); z-index: 30;
        min-width: 220px; padding: 6px;
        background: var(--surface-2); border: 1px solid var(--line); border-radius: var(--ev-card-radius);
        box-shadow: var(--shadow);
      }
      .ev-card-menu a, .ev-card-menu button {
        display: block; width: 100%; text-align: left; padding: 8px 12px;
        background: transparent; border: none; color: var(--text); font: inherit;
        font-size: 0.86rem; border-radius: 6px; cursor: pointer; text-decoration: none;
      }
      .ev-card-menu a:hover, .ev-card-menu button:hover { background: rgba(255,255,255,0.05); }
      .ev-card-menu hr { border: none; border-top: 1px solid var(--line); margin: 4px 0; }

      .ev-empty {
        text-align: center; padding: 50px 20px;
        background: rgba(255,255,255,0.02); border: 1px dashed rgba(255,255,255,0.16); border-radius: var(--ev-card-radius);
      }
      .ev-empty-icon { font-size: 2.2rem; opacity: 0.35; margin-bottom: 10px; }
      .ev-empty p { color: var(--text-muted); }

      .ev-badge { display: inline-block; padding: 3px 9px; border-radius: 999px; font-size: 0.68rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; }
      .ev-badge-live { background: rgba(98,210,143,0.22); color: #a4f4c2; }
      .ev-badge-scheduled { background: rgba(143,183,255,0.16); color: #a8c6ff; }
      .ev-badge-closed { background: rgba(242,166,90,0.18); color: var(--amber); }
      .ev-badge-past { background: rgba(255,255,255,0.06); color: var(--text-muted); }
      .ev-badge-cancelled { background: rgba(255,123,123,0.18); color: #ffb3b3; }
      .ev-badge-recurring { background: rgba(210,170,103,0.18); color: #d2aa67; }
      .ev-badge-inactive { background: rgba(255,255,255,0.05); color: var(--text-soft); }

      @media (max-width: 760px) {
        .ev-card { grid-template-columns: 60px 1fr; row-gap: 8px; }
        .ev-card-thumb { display: none; }
        .ev-card-actions { grid-column: 1 / -1; justify-content: flex-end; flex-wrap: wrap; }
      }
    </style>

    <div class="ev-hero">
      <div class="ev-hero-left">
        <div class="admin-kicker">Event pages</div>
        <h1>Events</h1>
        <p class="page-subtitle" style="margin: 0;">Create public signup pages, manage RSVPs, share QR codes, and build event landing pages.</p>
        <div class="ev-hero-stats">
          <div><strong>${counts.upcoming}</strong><span class="sub">Upcoming</span></div>
          <div><strong>${counts.past}</strong><span class="sub">Past</span></div>
        </div>
      </div>
      <div>
        <a href="/admin/events/new" class="btn btn-primary">+ New event</a>
      </div>
    </div>

    <div class="ev-chip-rail">
      ${filterChip('upcoming', 'Upcoming', counts.upcoming)}
      ${filterChip('past', 'Past', counts.past)}
      ${filterChip('hidden', 'Hidden', counts.hidden)}
      ${filterChip('cancelled', 'Cancelled', counts.cancelled)}
      ${filterChip('all', 'All', counts.all)}
    </div>

    ${eventsHowTo()}

    ${renderImportPanel(importable)}

    ${visible.length === 0 ? `
      <div class="ev-empty">
        <div class="ev-empty-icon">◎</div>
        <p style="font-size: 1rem; margin-bottom: 4px;">No events in this view.</p>
        <p style="font-size: 0.85rem;">${filter === 'upcoming' ? 'Click "+ New event" above to create one.' : `<a href="/admin/events" style="color: var(--gold-strong);">Back to Upcoming</a>`}</p>
      </div>
    ` : `<div class="ev-list">${cards}</div>`}

    <script>
      // Copy public-page link to clipboard from the More menu.
      document.addEventListener('click', function (e) {
        var btn = e.target.closest && e.target.closest('.ev-copy-link');
        if (!btn) return;
        e.preventDefault();
        var href = btn.getAttribute('data-href') || '';
        var full = window.location.origin.replace(/\\/$/, '') + href;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(full).then(function () {
            var orig = btn.textContent;
            btn.textContent = 'Copied!';
            setTimeout(function () { btn.textContent = orig; }, 1500);
          });
        } else {
          window.prompt('Copy this URL:', full);
        }
      });
      // Close the More menu when clicking outside.
      document.addEventListener('click', function (e) {
        document.querySelectorAll('details.ev-card-more[open]').forEach(function (d) {
          if (!d.contains(e.target)) d.removeAttribute('open');
        });
      });
    </script>
  `, user, { pathname: '/admin/events', flashMsg });
}

// ─── Page sections editor (rich content for the public event page) ───
function renderSectionsCard(event, actionUrl) {
  const sections = Array.isArray(event.sections) ? event.sections : [];
  const totalCount = sections.length;

  const sectionRows = sections.map((s, idx) => {
    const isFirst = idx === 0;
    const isLast = idx === totalCount - 1;
    const editPrefix = `sec-edit-${s.id}`;
    return `
      <div class="sec-row" id="sec-${s.id}">
        <div class="sec-row-summary">
          <span class="sec-row-icon">${sectionTypeIcon(s.type)}</span>
          <div class="sec-row-info">
            <div class="sec-row-type">${escHTML((s.type || '').toUpperCase())}</div>
            <div class="sec-row-preview">${sectionPreviewSummary(s)}</div>
          </div>
          <div class="sec-row-actions">
            <form method="POST" action="${actionUrl}" class="sec-inline">
              <input type="hidden" name="_action" value="moveSection" />
              <input type="hidden" name="sectionId" value="${escHTML(s.id)}" />
              <button type="submit" name="direction" value="top" class="btn btn-secondary btn-sm"${isFirst ? ' disabled' : ''}>⇡</button>
              <button type="submit" name="direction" value="up" class="btn btn-secondary btn-sm"${isFirst ? ' disabled' : ''}>↑</button>
              <button type="submit" name="direction" value="down" class="btn btn-secondary btn-sm"${isLast ? ' disabled' : ''}>↓</button>
              <button type="submit" name="direction" value="bottom" class="btn btn-secondary btn-sm"${isLast ? ' disabled' : ''}>⇣</button>
            </form>
            <form method="POST" action="${actionUrl}" class="sec-inline">
              <input type="hidden" name="_action" value="duplicateSection" />
              <input type="hidden" name="sectionId" value="${escHTML(s.id)}" />
              <button type="submit" class="btn btn-secondary btn-sm">Copy</button>
            </form>
            <button type="button" class="btn btn-secondary btn-sm" onclick="toggleSecEdit('${editPrefix}')">Edit</button>
            <form method="POST" action="${actionUrl}" class="sec-inline" onsubmit="return confirm('Delete this section?')">
              <input type="hidden" name="_action" value="deleteSection" />
              <input type="hidden" name="sectionId" value="${escHTML(s.id)}" />
              <button type="submit" class="btn btn-danger btn-sm">Del</button>
            </form>
          </div>
        </div>
        <div class="sec-row-edit" id="${editPrefix}" style="display:none">
          <form method="POST" action="${actionUrl}" enctype="application/x-www-form-urlencoded">
            <input type="hidden" name="_action" value="editSection" />
            <input type="hidden" name="sectionId" value="${escHTML(s.id)}" />
            <input type="hidden" name="type" value="${escHTML(s.type)}" />
            ${renderSectionEditFields(s, editPrefix)}
            <div class="form-actions">
              <button type="submit" class="btn btn-primary btn-sm">Save Section</button>
              <button type="button" class="btn btn-secondary btn-sm" onclick="toggleSecEdit('${editPrefix}')">Cancel</button>
            </div>
          </form>
        </div>
      </div>
    `;
  }).join('');

  // Build "add new section" panel — type buttons that reveal a typed form
  const ALL_TYPES = ['hero', 'text', 'twocol', 'image', 'details', 'schedule', 'faq', 'cocktailmenu', 'button', 'video', 'divider'];
  const TYPE_LABELS = { twocol: 'Two-Column', faq: 'FAQ', cocktailmenu: 'Cocktail Menu' };
  const typeLabel = (t) => TYPE_LABELS[t] || (t.charAt(0).toUpperCase() + t.slice(1));
  const addPanels = ALL_TYPES.map(t => {
    const stub = { type: t };
    if (t === 'details') stub.items = [{ label: '', value: '' }];
    if (t === 'schedule') stub.items = [{ time: '', title: '', description: '' }];
    if (t === 'faq') stub.items = [{ question: '', answer: '' }];
    if (t === 'cocktailmenu') stub.items = [{ name: '', ingredients: '', abv: '', creator: '', vibe: '' }];
    return `
      <div class="sec-add-panel" id="sec-add-${t}" style="display:none">
        <form method="POST" action="${actionUrl}">
          <input type="hidden" name="_action" value="addSection" />
          <input type="hidden" name="type" value="${t}" />
          ${renderSectionEditFields(stub, `sec-new-${t}`)}
          <div class="form-actions">
            <button type="submit" class="btn btn-primary btn-sm">Add ${typeLabel(t)} Section</button>
            <button type="button" class="btn btn-secondary btn-sm" onclick="hideAddPanel('${t}')">Cancel</button>
          </div>
        </form>
      </div>
    `;
  }).join('');

  return `
    <div class="ev-section ev-sections-card" id="sections">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px; flex-wrap:wrap; margin-bottom:4px">
        <div>
          <h2>Page Sections ${helpTip('These build the public event page. Add text, images, schedules, FAQs, a cocktail menu, buttons, and more — they appear in order below the event details. Imported events get these filled in by the AI automatically; edit or reorder them here.')}</h2>
          <p class="ev-section-hint">Build out the event page with text, images, details, buttons, and videos. Sections show up in order on the public page below the event details.</p>
        </div>
        ${event.sourceDescription ? `
          <form method="POST" action="${actionUrl}" style="margin:0;" onsubmit="return confirm('${sectionRows ? 'Replace the current sections with a fresh AI design generated from the imported source text?' : 'Generate page sections from the imported source text with AI?'}');">
            <input type="hidden" name="_action" value="generateDesign" />
            <button type="submit" class="btn btn-primary btn-sm" title="Build sections from the imported source description">✨ ${sectionRows ? 'Regenerate' : 'Generate'} from source (AI)</button>
          </form>` : ''}
      </div>

      ${sectionRows || '<div class="sec-empty">No sections yet — add one below' + (event.sourceDescription ? ', or use “Generate from source (AI)” above.' : '.') + '</div>'}

      <div class="sec-add-bar">
        <span style="color:#888; font-size:0.85rem; margin-right:6px">+ Add section:</span>
        <button type="button" class="btn btn-secondary btn-sm" onclick="showAddPanel('hero')">Hero Banner</button>
        <button type="button" class="btn btn-secondary btn-sm" onclick="showAddPanel('text')">Text</button>
        <button type="button" class="btn btn-secondary btn-sm" onclick="showAddPanel('twocol')">Two-Column</button>
        <button type="button" class="btn btn-secondary btn-sm" onclick="showAddPanel('image')">Image</button>
        <button type="button" class="btn btn-secondary btn-sm" onclick="showAddPanel('details')">Details</button>
        <button type="button" class="btn btn-secondary btn-sm" onclick="showAddPanel('schedule')">Schedule</button>
        <button type="button" class="btn btn-secondary btn-sm" onclick="showAddPanel('faq')">FAQ</button>
        <button type="button" class="btn btn-secondary btn-sm" onclick="showAddPanel('cocktailmenu')">🍸 Cocktail Menu</button>
        <button type="button" class="btn btn-secondary btn-sm" onclick="showAddPanel('button')">Button / Link</button>
        <button type="button" class="btn btn-secondary btn-sm" onclick="showAddPanel('video')">Video</button>
        <button type="button" class="btn btn-secondary btn-sm" onclick="showAddPanel('divider')">Divider</button>
      </div>

      ${addPanels}
    </div>

    <style>
      .ev-sections-card .sec-row {
        background:#111;
        border:1px solid #222;
        border-radius:10px;
        margin-bottom:10px;
      }
      .ev-sections-card .sec-row-summary {
        display:flex;
        align-items:center;
        gap:12px;
        padding:12px 14px;
      }
      .ev-sections-card .sec-row-icon {
        width:34px; height:34px;
        background:#1a1a1a;
        border-radius:8px;
        display:flex; align-items:center; justify-content:center;
        color:#d4af37; font-weight:800; font-size:1rem;
        flex-shrink:0;
      }
      .ev-sections-card .sec-row-info { flex:1; min-width:0; }
      .ev-sections-card .sec-row-type { color:#d4af37; font-size:0.7rem; font-weight:800; text-transform:uppercase; letter-spacing:0.08em; margin-bottom:2px; }
      .ev-sections-card .sec-row-preview { color:#bbb; font-size:0.88rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .ev-sections-card .sec-row-actions { display:flex; gap:5px; align-items:center; flex-wrap:wrap; }
      .ev-sections-card .sec-inline { display:inline-flex; gap:4px; margin:0; }
      .ev-sections-card .sec-row-edit {
        background:#0d0d0d;
        border-top:1px solid #222;
        border-radius:0 0 10px 10px;
        padding:14px 16px;
      }
      .ev-sections-card .sec-add-bar {
        display:flex;
        flex-wrap:wrap;
        gap:6px;
        padding:14px 0 0;
        margin-top:12px;
        border-top:1px dashed #2a2a2a;
        align-items:center;
      }
      .ev-sections-card .sec-add-panel {
        background:#0d0d0d;
        border:1px solid rgba(212,175,55,0.3);
        border-radius:10px;
        padding:16px;
        margin-top:12px;
      }
      .ev-sections-card .sec-empty {
        background:#111;
        border:1px dashed #2a2a2a;
        border-radius:10px;
        padding:24px 14px;
        text-align:center;
        color:#666;
        font-size:0.88rem;
      }
      .ev-sections-card .sec-detail-list { margin-bottom:10px; }
      .ev-sections-card .sec-detail-row {
        display:grid;
        grid-template-columns:1fr 2fr auto;
        gap:8px;
        margin-bottom:6px;
        align-items:center;
      }
      .ev-sections-card .sec-detail-row input { margin:0 !important; }
      .ev-sections-card .sec-detail-remove,
      .ev-sections-card .sec-sched-remove,
      .ev-sections-card .sec-faq-remove {
        background:transparent;
        border:1px solid #444;
        color:#888;
        border-radius:6px;
        padding:6px 12px;
        cursor:pointer;
        font-size:0.9rem;
      }
      .ev-sections-card .sec-detail-remove:hover,
      .ev-sections-card .sec-sched-remove:hover,
      .ev-sections-card .sec-faq-remove:hover { border-color:#f87171; color:#f87171; }

      .ev-sections-card .sec-sched-list,
      .ev-sections-card .sec-faq-list { margin-bottom:10px; }
      .ev-sections-card .sec-sched-row {
        display:grid;
        grid-template-columns:90px 1.2fr 1.5fr auto;
        gap:8px;
        margin-bottom:6px;
        align-items:center;
      }
      .ev-sections-card .sec-sched-row input { margin:0 !important; }
      .ev-sections-card .sec-faq-row {
        display:grid;
        grid-template-columns:1fr auto;
        grid-template-areas: "q q" "a x";
        gap:6px 8px;
        margin-bottom:10px;
        padding:10px;
        background:#0a0a0a;
        border-radius:6px;
        border:1px solid #1a1a1a;
      }
      .ev-sections-card .sec-faq-row input[name="faq_question"] { grid-area:q; margin:0 !important; }
      .ev-sections-card .sec-faq-row textarea { grid-area:a; margin:0 !important; }
      .ev-sections-card .sec-faq-row .sec-faq-remove { grid-area:x; align-self:start; }
      .ev-sections-card .sec-cm-row {
        display:grid;
        grid-template-columns:1fr 120px auto;
        grid-template-areas: "name abv x" "ing ing ing" "vibe vibe creator";
        gap:6px 8px;
        margin-bottom:10px;
        padding:10px;
        background:#0a0a0a;
        border-radius:6px;
        border:1px solid #1a1a1a;
      }
      .ev-sections-card .sec-cm-row input { margin:0 !important; }
      .ev-sections-card .sec-cm-row input[name="cm_name"] { grid-area:name; }
      .ev-sections-card .sec-cm-row input[name="cm_abv"] { grid-area:abv; }
      .ev-sections-card .sec-cm-row .sec-cm-remove { grid-area:x; align-self:start; }
      .ev-sections-card .sec-cm-row input[name="cm_ingredients"] { grid-area:ing; }
      .ev-sections-card .sec-cm-row input[name="cm_vibe"] { grid-area:vibe; }
      .ev-sections-card .sec-cm-row input[name="cm_creator"] { grid-area:creator; }
      @media (max-width:768px) {
        .ev-sections-card .sec-sched-row { grid-template-columns:1fr; }
        .ev-sections-card .sec-cm-row { grid-template-columns:1fr; grid-template-areas:"name" "abv" "ing" "vibe" "creator" "x"; }
      }
    </style>

    <script>
      function toggleSecEdit(id) {
        var el = document.getElementById(id);
        if (!el) return;
        el.style.display = el.style.display === 'none' ? 'block' : 'none';
      }
      var SEC_TYPES = ['hero','text','twocol','image','details','schedule','faq','button','video','divider'];
      function showAddPanel(t) {
        SEC_TYPES.forEach(function(x) {
          var p = document.getElementById('sec-add-' + x);
          if (p) p.style.display = (x === t) ? 'block' : 'none';
        });
      }
      function hideAddPanel(t) {
        var p = document.getElementById('sec-add-' + t);
        if (p) p.style.display = 'none';
      }

      // (Image upload handlers live in the main editor script — work for both
      // banner image and section images via global event delegation.)

      // Details rows: add and remove
      document.addEventListener('click', function(e) {
        if (e.target.classList && e.target.classList.contains('sec-detail-add')) {
          var targetId = e.target.getAttribute('data-target');
          var list = document.getElementById(targetId);
          if (!list) return;
          var row = document.createElement('div');
          row.className = 'sec-detail-row';
          row.innerHTML =
            '<input type="text" name="detail_label" placeholder="e.g. Date" />' +
            '<input type="text" name="detail_value" placeholder="e.g. Saturday, October 15" />' +
            '<button type="button" class="btn btn-secondary btn-sm sec-detail-remove">×</button>';
          list.appendChild(row);
        }
        if (e.target.classList && e.target.classList.contains('sec-detail-remove')) {
          var row = e.target.closest('.sec-detail-row');
          if (row) row.remove();
        }
      });

      // Schedule rows: add and remove
      document.addEventListener('click', function(e) {
        if (e.target.classList && e.target.classList.contains('sec-sched-add')) {
          var targetId = e.target.getAttribute('data-target');
          var list = document.getElementById(targetId);
          if (!list) return;
          var row = document.createElement('div');
          row.className = 'sec-sched-row';
          row.innerHTML =
            '<input type="text" name="sched_time" placeholder="7:00 PM" />' +
            '<input type="text" name="sched_title" placeholder="What happens" />' +
            '<input type="text" name="sched_desc" placeholder="Optional details" />' +
            '<button type="button" class="btn btn-secondary btn-sm sec-sched-remove">×</button>';
          list.appendChild(row);
        }
        if (e.target.classList && e.target.classList.contains('sec-sched-remove')) {
          var row = e.target.closest('.sec-sched-row');
          if (row) row.remove();
        }
      });

      // FAQ rows: add and remove
      document.addEventListener('click', function(e) {
        if (e.target.classList && e.target.classList.contains('sec-faq-add')) {
          var targetId = e.target.getAttribute('data-target');
          var list = document.getElementById(targetId);
          if (!list) return;
          var row = document.createElement('div');
          row.className = 'sec-faq-row';
          row.innerHTML =
            '<input type="text" name="faq_question" placeholder="Question" />' +
            '<textarea name="faq_answer" class="rich-textarea" rows="2" placeholder="Answer"></textarea>' +
            '<button type="button" class="btn btn-secondary btn-sm sec-faq-remove">×</button>';
          list.appendChild(row);
        }
        if (e.target.classList && e.target.classList.contains('sec-faq-remove')) {
          var row = e.target.closest('.sec-faq-row');
          if (row) row.remove();
        }
      });

      // Cocktail menu rows: add and remove (keep markup in sync with cocktailRowHtml)
      document.addEventListener('click', function(e) {
        if (e.target.classList && e.target.classList.contains('sec-cm-add')) {
          var targetId = e.target.getAttribute('data-target');
          var list = document.getElementById(targetId);
          if (!list) return;
          var row = document.createElement('div');
          row.className = 'sec-cm-row';
          row.innerHTML =
            '<input type="text" name="cm_name" placeholder="Drink name" />' +
            '<input type="text" name="cm_abv" placeholder="ABV / price" />' +
            '<button type="button" class="btn btn-secondary btn-sm sec-cm-remove">×</button>' +
            '<input type="text" name="cm_ingredients" placeholder="Ingredients — gin, lime, mint…" />' +
            '<input type="text" name="cm_vibe" placeholder="Tasting note / vibe (optional)" />' +
            '<input type="text" name="cm_creator" placeholder="By (bartender, optional)" />';
          list.appendChild(row);
        }
        if (e.target.classList && e.target.classList.contains('sec-cm-remove')) {
          var row = e.target.closest('.sec-cm-row');
          if (row) row.remove();
        }
      });

      // If URL has #sections, scroll there after page load
      if (window.location.hash === '#sections') {
        setTimeout(function() {
          var el = document.getElementById('sections');
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
      }
    </script>
  `;
}

// ─── Event editor (create or edit) ───
function eventEditor(event, locations, user, flashMsg, signupCount = 0, opts = {}) {
  // opts.forceNew renders the create form (POSTs to /new) while still seeding
  // field values from a passed-in `event` shape — used by the "import from Dram"
  // flow, which pre-fills core fields but leaves it a brand-new menuqr event.
  const isNew = !event || opts.forceNew === true;
  const title = isNew ? 'New Event' : 'Edit Event';
  const actionUrl = isNew ? '/admin/events/new' : `/admin/events/${escHTML(event.id)}`;

  // Pre-select whenever we have a locationId to seed (real edit OR a confident
  // import match). When we don't, lead with a disabled placeholder so the
  // browser can't auto-select the first venue — the `required` select then
  // forces the admin to pick, instead of silently saving as (e.g.) Cary.
  const hasSeededLocation = !!(event && event.locationId && locations.some(l => l.id === event.locationId));
  const locationOptions =
    `<option value="" disabled${hasSeededLocation ? '' : ' selected'}>— Select a location —</option>` +
    locations.map(l => {
      const selected = event && event.locationId === l.id ? ' selected' : '';
      return `<option value="${escHTML(l.id)}"${selected}>${escHTML(l.name)}</option>`;
    }).join('');

  const customQuestions = (!isNew && Array.isArray(event.customQuestions)) ? event.customQuestions : [];
  const customQuestionRows = customQuestions.map((q, i) => `
    <div class="cq-row" data-cq-idx="${i}">
      <input type="hidden" name="custom_id" value="${escHTML(q.id || '')}" />
      <div class="cq-row-grid">
        <div>
          <label>Question</label>
          <input type="text" name="custom_label" value="${escHTML(q.label)}" placeholder="e.g. T-shirt size" />
        </div>
        <div>
          <label>Type</label>
          <select name="custom_type">
            <option value="text"${q.type === 'text' ? ' selected' : ''}>Short text</option>
            <option value="textarea"${q.type === 'textarea' ? ' selected' : ''}>Long text</option>
            <option value="number"${q.type === 'number' ? ' selected' : ''}>Number</option>
            <option value="yesno"${q.type === 'yesno' ? ' selected' : ''}>Yes / No</option>
            <option value="image"${q.type === 'image' ? ' selected' : ''}>Image upload</option>
            <option value="images-multi"${q.type === 'images-multi' ? ' selected' : ''}>Image gallery (multiple)</option>
          </select>
        </div>
        <div class="cq-required-col">
          <label>&nbsp;</label>
          <label class="ev-check"><input type="checkbox" name="custom_required_${i}" ${q.required ? 'checked' : ''} /> Required</label>
        </div>
        <div class="cq-del-col">
          <label>&nbsp;</label>
          <button type="button" class="btn btn-danger btn-sm cq-remove">Remove</button>
        </div>
      </div>
    </div>
  `).join('');

  // ─── Pre-publish checklist ───
  // Gentle review prompts shown when saving an event that will be live, so
  // things like a missing cocktail menu or a past date get a second look
  // before it posts. Section-aware checks only apply to saved events (Page
  // Builder content doesn't exist yet on the create/import form).
  const evSections = (!isNew && Array.isArray(event.sections)) ? event.sections : [];
  const hasSectionType = (t) => evSections.some(s => s && s.type === t);
  const publishChecklist = [];
  if (!isNew) {
    if (!hasSectionType('cocktailmenu')) publishChecklist.push('No cocktail menu added — if this event features specific cocktails, add a Cocktail Menu section in Page Builder.');
    if (!event.image && !hasSectionType('hero')) publishChecklist.push('No banner image set for this event.');
    if (evSections.length === 0) publishChecklist.push('The event page has no Page Builder content yet — just the short description.');
    if (event.startDate && new Date(event.startDate) < new Date()) publishChecklist.push("This event's date is in the past, so it won't appear on the public events page.");
  }
  // Emit as a JS array literal (JSON is valid JS); escape "<" so the data can
  // never break out of the <script> context. Do NOT escHTML it — that would
  // corrupt the JSON, and apostrophes in the copy would break a quoted string.
  const publishChecklistJson = JSON.stringify(publishChecklist).replace(/</g, '\\u003c');

  // ─── Competition judging config ───
  const judgingCriteria = (!isNew && Array.isArray(event.judgingCriteria)) ? event.judgingCriteria : [];
  const judgesList = (!isNew && Array.isArray(event.judges)) ? event.judges : [];
  const criteriaRows = judgingCriteria.map((c) => `
    <div class="jc-row">
      <input type="hidden" name="jc_id" value="${escHTML(c.id || '')}" />
      <div class="jc-row-grid">
        <div><label>Criterion</label><input type="text" name="jc_label" value="${escHTML(c.label || '')}" placeholder="e.g. Taste &amp; Balance" /></div>
        <div><label>Max</label><input type="number" name="jc_max" min="1" max="100" value="${escHTML(String(c.max || 10))}" /></div>
        <div class="cq-del-col"><label>&nbsp;</label><button type="button" class="btn btn-danger btn-sm jc-remove">Remove</button></div>
      </div>
    </div>`).join('');
  const judgeRows = judgesList.map((j) => `
    <div class="judge-row">
      <input type="hidden" name="judge_id" value="${escHTML(j.id || '')}" />
      <div class="jc-row-grid">
        <div><label>Judge name</label><input type="text" name="judge_name" value="${escHTML(j.name || '')}" placeholder="e.g. Carrie M." /></div>
        <div class="cq-del-col"><label>&nbsp;</label><button type="button" class="btn btn-danger btn-sm judge-remove">Remove</button></div>
      </div>
    </div>`).join('');

  // Public URL preview (shown when editing) — with quick source-tag buttons
  // so each social post gets a properly tagged share link, plus per-event QR
  // download links.
  let publicUrlBlock = '';
  if (!isNew) {
    const locSlug = event.location?.slug || '';
    const publicUrl = locSlug && event.slug ? `/${locSlug}/events/${event.slug}` : '';
    const qrUrl = `/admin/events/${escHTML(event.id)}/qr`;
    publicUrlBlock = `
      <div class="ev-public-url" id="ev-public-url" hidden>
        <div class="ev-public-url-label">Share link</div>
        <div class="ev-public-url-row">
          <input type="text" id="ev-share-url" data-base="${escHTML(publicUrl)}" readonly value="${escHTML(publicUrl)}" />
          <button type="button" id="ev-copy-url" class="btn btn-primary btn-sm">Copy</button>
          ${publicUrl ? `<a id="ev-open-url" href="${escHTML(publicUrl)}" target="_blank" class="btn btn-secondary btn-sm">Preview ↗</a>` : ''}
        </div>
        <div class="ev-public-url-hint">
          Pick where you're sharing this link below. Each option adds a tag so Analytics can show you exactly which channel brought people in.
        </div>
        <div class="ev-share-buttons">
          <button type="button" class="ev-share-btn" data-src="">No tag</button>
          <button type="button" class="ev-share-btn" data-src="instagram">Instagram</button>
          <button type="button" class="ev-share-btn" data-src="facebook">Facebook</button>
          <button type="button" class="ev-share-btn" data-src="tiktok">TikTok</button>
          <button type="button" class="ev-share-btn" data-src="website">Website</button>
          <button type="button" class="ev-share-btn" data-src="email">Email</button>
          <button type="button" class="ev-share-btn" data-src="sms">SMS</button>
          <button type="button" class="ev-share-btn" data-src="qr">QR Code</button>
        </div>
        <div id="ev-share-status" class="ev-share-status"></div>

        ${publicUrl ? `
        <div class="ev-qr-row">
          <div class="ev-qr-thumb">
            <img src="${escHTML(qrUrl)}?size=300" alt="QR preview" loading="lazy" />
          </div>
          <div class="ev-qr-meta">
            <div class="ev-qr-label">QR code</div>
            <p>Print this for your QR holders, table tents, posters, or anywhere people will scan into the event page.</p>
            <div class="ev-qr-actions">
              <a class="btn btn-primary btn-sm" href="${escHTML(qrUrl)}?size=1200" download="event-${escHTML(event.slug)}-qr.png">Download PNG</a>
              <a class="btn btn-secondary btn-sm" href="${escHTML(qrUrl)}?fmt=svg" download="event-${escHTML(event.slug)}-qr.svg">Download SVG</a>
              <a class="btn btn-secondary btn-sm" href="${escHTML(qrUrl)}" target="_blank">View full size ↗</a>
            </div>
          </div>
        </div>
        ` : ''}
      </div>
    `;
  }

  const editorTabs = `
    <nav class="ev-tabbar" role="tablist" aria-label="Event editor sections">
      <button type="button" class="ev-tab is-active" data-tab="basics">Basics</button>
      <button type="button" class="ev-tab" data-tab="appearance">Appearance</button>
      <button type="button" class="ev-tab" data-tab="signups">Signups</button>
      ${!isNew ? '<button type="button" class="ev-tab" data-tab="page">Page Builder</button>' : ''}
    </nav>
  `;
  const statusBadgeHtml = isNew
    ? '<span class="ev-badge ev-badge-scheduled">New Draft</span>'
    : eventStatusBadge(event);
  const signupsLinkHtml = !isNew
    ? `<a href="/admin/events/${escHTML(event.id)}/signups" class="ev-meta-link">${signupCount} ${signupCount === 1 ? 'signup' : 'signups'} →</a>`
    : '<span class="ev-meta-muted">Not saved yet</span>';
  const headerToggles = !isNew
    ? `
      <label class="ev-pill-toggle"><input type="checkbox" name="isActive" form="ev-form" ${event.isActive ? 'checked' : ''} /><span>Active</span></label>
      <label class="ev-pill-toggle ev-pill-toggle-danger"><input type="checkbox" name="isCancelled" form="ev-form" ${event.isCancelled ? 'checked' : ''} /><span>Cancelled</span></label>
    `
    : `
      <label class="ev-pill-toggle"><input type="checkbox" name="isActive" form="ev-form" checked /><span>Active</span></label>
    `;

  return adminLayout(title, `
    <style>
      .ev-editor-head {
        display:flex;
        flex-direction:column;
        gap:10px;
        padding:16px 18px;
        margin-bottom:16px;
        background:linear-gradient(180deg, rgba(255,255,255,0.035), rgba(255,255,255,0.015)), var(--surface);
        border:1px solid var(--line);
        border-radius:var(--radius);
      }
      .ev-editor-head .ev-back { color:var(--text-muted); font-size:0.8rem; text-decoration:none; }
      .ev-editor-head .ev-back:hover { color:var(--gold-strong); }
      .ev-editor-head h1 { margin:2px 0 0; font-size:1.3rem; }
      .ev-header-row {
        display:flex;
        align-items:center;
        gap:12px;
        flex-wrap:wrap;
      }
      .ev-header-row-top { justify-content:space-between; }
      .ev-header-row-meta {
        padding-top:10px;
        border-top:1px solid rgba(255,255,255,0.07);
        font-size:0.85rem;
        color:#bbb;
      }
      .ev-header-toggles { display:flex; gap:8px; flex-wrap:wrap; }
      .ev-pill-toggle {
        display:inline-flex;
        align-items:center;
        gap:6px;
        padding:7px 12px;
        border:1px solid var(--line);
        border-radius:999px;
        background:#121417;
        font-size:0.78rem;
        font-weight:700;
        color:#999;
        cursor:pointer;
        margin:0;
      }
      .ev-pill-toggle input { width:auto; margin:0; accent-color:#4ade80; }
      .ev-pill-toggle:has(input:checked) {
        color:#4ade80;
        border-color:rgba(74,222,128,0.45);
        background:rgba(74,222,128,0.1);
      }
      .ev-pill-toggle-danger:has(input:checked) {
        color:#f87171;
        border-color:rgba(248,113,113,0.45);
        background:rgba(248,113,113,0.1);
      }
      .ev-meta-link {
        color:#93c5fd;
        text-decoration:none;
        font-weight:600;
        font-size:0.85rem;
        background:none;
        border:none;
        padding:0;
        cursor:pointer;
        font-family:inherit;
      }
      .ev-meta-link:hover { color:#d4af37; }
      .ev-meta-muted { color:#666; font-size:0.85rem; }
      .ev-header-actions { display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-left:auto; }

      .ev-jump-nav {
        display:flex;
        gap:8px;
        flex-wrap:wrap;
        margin-bottom:14px;
        position:sticky;
        top:0;
        z-index:20;
        padding:10px 0;
        background:rgba(16,17,19,0.92);
        border-bottom:1px solid var(--line-soft);
      }
      .ev-jump-nav a {
        display:inline-flex;
        align-items:center;
        min-height:34px;
        padding:0 12px;
        border-radius:999px;
        border:1px solid var(--line);
        color:var(--text-muted);
        text-decoration:none;
        font-size:0.78rem;
        font-weight:700;
        letter-spacing:0.04em;
        background:#121417;
      }
      .ev-jump-nav a:hover { color:var(--gold-strong); border-color:rgba(214,173,75,0.35); }

      .ev-public-url {
        background:rgba(96,165,250,0.08);
        border:1px solid rgba(96,165,250,0.25);
        border-radius:10px;
        padding:14px 16px;
        margin-bottom:20px;
      }
      .ev-public-url[hidden] { display:none; }
      .ev-public-url-label { font-size:0.72rem; color:#93c5fd; font-weight:700; text-transform:uppercase; letter-spacing:0.08em; margin-bottom:8px; }
      .ev-public-url-row { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
      .ev-public-url-row input { flex:1; min-width:260px; background:#0d0f12; color:var(--gold-strong); font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; font-size:0.85rem; }
      .ev-public-url-hint { color:#888; font-size:0.78rem; margin-top:10px; }
      .ev-share-buttons { display:flex; gap:6px; flex-wrap:wrap; margin-top:10px; }
      .ev-share-btn {
        background:#1a1a1d;
        border:1px solid #333;
        color:#ccc;
        padding:7px 14px;
        border-radius:18px;
        font-size:0.78rem;
        font-weight:600;
        cursor:pointer;
        font-family:inherit;
        transition: all 0.15s;
      }
      .ev-share-btn:hover { border-color:#93c5fd; color:#93c5fd; }
      .ev-share-btn.ev-share-btn-active { background:rgba(96,165,250,0.18); border-color:#60a5fa; color:#93c5fd; }
      .ev-share-status { color:#4ade80; font-size:0.8rem; margin-top:8px; min-height:1.2em; }

      .ev-signup-type-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 10px; }
      .ev-signup-type {
        display: block; padding: 12px 14px; cursor: pointer;
        background: rgba(255,255,255,0.025); border: 1px solid var(--line); border-radius: 10px;
        transition: all 0.15s;
      }
      .ev-signup-type:hover { border-color: rgba(240,199,102,0.4); }
      .ev-signup-type.is-active { border-color: var(--gold-strong); background: rgba(240,199,102,0.08); }
      .ev-signup-type input { margin-right: 6px; accent-color: var(--gold-strong); }
      .ev-signup-type strong { display: block; color: var(--text); font-size: 0.94rem; margin-bottom: 4px; }
      .ev-signup-type span { display: block; color: var(--text-muted); font-size: 0.78rem; line-height: 1.4; }

      .ev-qr-row {
        display: grid; grid-template-columns: 200px 1fr; gap: 18px;
        margin-top: 18px; padding: 16px;
        background: rgba(255,255,255,0.025); border: 1px solid var(--line); border-radius: 10px;
      }
      .ev-qr-thumb {
        background: #fff; padding: 10px; border-radius: 8px;
        display: flex; align-items: center; justify-content: center;
      }
      .ev-qr-thumb img { display: block; max-width: 100%; height: auto; }
      .ev-qr-meta { display: flex; flex-direction: column; gap: 8px; }
      .ev-qr-label { font-size: 0.72rem; color: var(--gold-strong); font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; }
      .ev-qr-meta p { color: var(--text-muted); font-size: 0.86rem; margin: 0; line-height: 1.5; }
      .ev-qr-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 4px; }
      @media (max-width: 600px) { .ev-qr-row { grid-template-columns: 1fr; } .ev-qr-thumb { max-width: 240px; margin: 0 auto; } }

      .ev-section {
        background:linear-gradient(180deg, rgba(255,255,255,0.035), rgba(255,255,255,0.015)), var(--surface);
        border:1px solid var(--line);
        border-radius:var(--radius);
        padding:20px;
        margin-bottom:16px;
      }
      .ev-section h2 {
        color:var(--text);
        font-size:1.02rem;
        margin:0 0 4px;
        font-weight:850;
      }
      .ev-section .ev-section-hint {
        color:var(--text-muted);
        font-size:0.82rem;
        margin-bottom:14px;
      }
      .rich-toolbar {
        display:flex;
        align-items:center;
        gap:8px;
        flex-wrap:wrap;
        padding:10px;
        margin:6px 0 0;
        background:#0d0f12;
        border:1px solid rgba(255,255,255,0.08);
        border-bottom:0;
        border-radius:8px 8px 0 0;
      }
      .rt-btn {
        min-height:34px;
        border:1px solid rgba(214,173,75,0.35);
        border-radius:7px;
        background:rgba(214,173,75,0.08);
        color:var(--gold-strong);
        font:inherit;
        font-size:0.82rem;
        font-weight:800;
        cursor:pointer;
        padding:7px 10px;
      }
      .rt-btn:hover,
      .rt-btn:focus {
        border-color:var(--gold-strong);
        background:rgba(214,173,75,0.16);
        outline:none;
      }
      .rt-help {
        color:var(--text-muted);
        font-size:0.78rem;
        line-height:1.35;
      }
      .rich-textarea {
        min-height:120px;
        border-top-left-radius:0 !important;
        border-top-right-radius:0 !important;
      }

      .ev-check { display:flex; align-items:center; gap:8px; color:#ccc; font-size:0.9rem; margin:0; padding:10px 0; cursor:pointer; }
      .ev-check input[type="checkbox"] { width:auto; margin:0; }

      .ev-field-grid {
        display:grid;
        grid-template-columns:1fr 1fr;
        gap:14px;
      }

      .ev-standard-fields {
        display:grid;
        grid-template-columns:1fr 1fr;
        gap:4px 20px;
        background:#121417;
        padding:12px 16px;
        border-radius:8px;
        border:1px solid rgba(255,255,255,0.07);
      }

      .cq-list { margin-bottom:14px; }
      .cq-row {
        background:#121417;
        border:1px solid rgba(255,255,255,0.07);
        border-radius:8px;
        padding:14px;
        margin-bottom:10px;
      }
      .cq-row-grid {
        display:grid;
        grid-template-columns:2fr 1fr auto auto;
        gap:10px;
        align-items:flex-end;
      }
      .cq-row-grid label { margin-top:0; }
      .cq-required-col { display:flex; align-items:flex-end; }
      .cq-required-col .ev-check { padding:10px 4px; }
      .cq-del-col { display:flex; align-items:flex-end; }
      .jc-row, .judge-row {
        background:#121417;
        border:1px solid rgba(255,255,255,0.07);
        border-radius:8px;
        padding:14px;
        margin-bottom:10px;
      }
      .jc-row-grid {
        display:grid;
        grid-template-columns:2fr 1fr auto;
        gap:10px;
        align-items:flex-end;
      }
      .judge-row .jc-row-grid { grid-template-columns:1fr auto; }
      .jc-row-grid label { margin-top:0; }
      @media (max-width:640px) { .jc-row-grid { grid-template-columns:1fr; } }

      .ev-delete-section {
        background:rgba(239,68,68,0.05);
        border:1px solid rgba(239,68,68,0.2);
        border-radius:10px;
        padding:16px 18px;
        margin-top:24px;
      }
      .ev-delete-section h3 { color:#f87171; font-size:0.85rem; text-transform:uppercase; letter-spacing:0.08em; margin:0 0 6px; }
      .ev-delete-section p { color:#888; font-size:0.82rem; margin:0 0 12px; }

      /* Reusable image upload widget — used by banner and section images */
      .sec-img-upload {
        background:#0d0f12;
        border:1px solid var(--line);
        border-radius:8px;
        padding:14px;
        margin-bottom:8px;
      }
      .sec-img-hint { color:#888; font-size:0.78rem; margin:6px 0 8px; }
      .sec-img-url-input { margin-bottom:10px !important; }
      .sec-img-preview-wrap { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
      .sec-img-preview { max-width:240px; max-height:160px; border-radius:6px; border:1px solid #333; }

      /* ─── Tabbed editor ─── */
      .ev-tabbar {
        display:flex;
        gap:6px;
        flex-wrap:wrap;
        margin-bottom:18px;
        padding:6px;
        position:sticky;
        top:0;
        z-index:20;
        background:rgba(16,17,19,0.95);
        border:1px solid var(--line-soft);
        border-radius:12px;
        backdrop-filter:blur(6px);
      }
      .ev-tab {
        flex:1 1 auto;
        min-width:84px;
        padding:10px 14px;
        border:1px solid transparent;
        border-radius:8px;
        background:transparent;
        color:var(--text-muted);
        font-size:0.85rem;
        font-weight:700;
        letter-spacing:0.02em;
        cursor:pointer;
        font-family:inherit;
        transition:all 0.15s;
      }
      .ev-tab:hover { color:var(--text); background:rgba(255,255,255,0.04); }
      .ev-tab.is-active {
        color:#15110c;
        background:linear-gradient(135deg, var(--gold-strong), #e7c879);
        border-color:transparent;
        box-shadow:0 4px 14px rgba(214,173,75,0.3);
      }
      .ev-tab-panel { display:none; }
      .ev-tab-panel.is-active { display:block; animation:evTabFade 0.2s ease-out; }
      @keyframes evTabFade { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:none; } }

      /* ─── Theme picker ─── */
      .ev-appearance-head { display:flex; align-items:flex-start; justify-content:space-between; gap:14px; flex-wrap:wrap; }
      .ev-appearance-head h2 { margin:0; }
      .ev-appearance-preview { flex:0 0 auto; white-space:nowrap; }
      .ev-theme-grid {
        display:grid;
        gap:14px;
        margin-top:12px;
        grid-template-columns:repeat(auto-fill, minmax(220px, 1fr));
      }
      .ev-theme-card {
        position:relative;
        display:flex;
        flex-direction:column;
        margin:0;
        border:1.5px solid var(--line);
        border-radius:12px;
        background:#121417;
        overflow:hidden;
        cursor:pointer;
        transition:border-color 0.15s, transform 0.15s, box-shadow 0.15s;
      }
      .ev-theme-card:hover { transform:translateY(-2px); border-color:rgba(214,173,75,0.5); }
      .ev-theme-card input { position:absolute; opacity:0; pointer-events:none; }
      .ev-theme-card.is-active {
        border-color:var(--gold-strong);
        box-shadow:0 0 0 3px rgba(214,173,75,0.25);
      }
      .ev-theme-preview {
        position:relative;
        height:96px;
        padding:16px 14px 12px;
        display:flex;
        flex-direction:column;
        justify-content:space-between;
      }
      .ev-theme-accentbar { position:absolute; top:0; left:0; right:0; height:4px; }
      .ev-theme-sample {
        font-weight:800;
        font-size:1.05rem;
        letter-spacing:0.02em;
        text-shadow:0 1px 2px rgba(0,0,0,0.25);
      }
      .ev-theme-dots { display:flex; gap:6px; }
      .ev-theme-dots span {
        width:14px; height:14px; border-radius:50%;
        box-shadow:0 0 0 1px rgba(0,0,0,0.25), inset 0 0 0 1px rgba(255,255,255,0.25);
      }
      .ev-theme-check {
        position:absolute;
        top:10px;
        right:10px;
        width:22px;
        height:22px;
        border-radius:50%;
        background:var(--gold-strong);
        color:#15110c;
        display:none;
        align-items:center;
        justify-content:center;
        font-size:0.8rem;
        font-weight:900;
        box-shadow:0 2px 6px rgba(0,0,0,0.35);
      }
      .ev-theme-card.is-active .ev-theme-check { display:flex; }
      .ev-theme-meta { padding:11px 13px 13px; display:flex; flex-direction:column; gap:4px; }
      .ev-theme-name { font-weight:700; font-size:0.9rem; color:var(--text); }
      .ev-theme-desc { font-size:0.76rem; color:var(--text-muted); line-height:1.45; }

      @media (max-width:768px) {
        .ev-field-grid { grid-template-columns:1fr; }
        .ev-standard-fields { grid-template-columns:1fr; }
        .cq-row-grid { grid-template-columns:1fr; }
        .cq-required-col, .cq-del-col { align-items:flex-start; }
        .ev-jump-nav { position:static; }
        .ev-header-actions { width:100%; justify-content:space-between; }
        .rich-toolbar { align-items:flex-start; }
        .rt-help { flex-basis:100%; }
        .ev-theme-grid { grid-template-columns:1fr 1fr; }
      }
      @media (max-width:480px) {
        .ev-theme-grid { grid-template-columns:1fr; }
      }
    </style>

    <div class="ev-editor-head">
      <div class="ev-header-row ev-header-row-top">
        <div>
          <a href="/admin/events" class="ev-back">← Back to events</a>
          <h1>${escHTML(title)}</h1>
        </div>
        <div class="ev-header-actions">
          <div class="ev-header-toggles">${headerToggles}</div>
          <button type="submit" form="ev-form" class="btn btn-primary">${isNew ? 'Create Event' : 'Save'}</button>
        </div>
      </div>
      <div class="ev-header-row ev-header-row-meta">
        ${statusBadgeHtml}
        ${signupsLinkHtml}
        ${!isNew ? '<button type="button" id="ev-share-toggle" class="ev-meta-link">Share ↗</button>' : ''}
      </div>
    </div>

    ${publicUrlBlock}
    ${editorTabs}

    <form method="POST" action="${actionUrl}" id="ev-form"${opts.importedFromPublicId ? '' : ` data-autosave="event-${escHTML(event?.id || 'new')}"`}>
      ${opts.importedFromPublicId ? `
      <input type="hidden" name="importedFromPublicId" value="${escHTML(String(opts.importedFromPublicId))}" />
      <div class="ev-import-banner" style="margin:0 0 1rem;padding:0.75rem 1rem;border-radius:10px;background:#1e3a5f;border:1px solid #2f5a8f;color:#cfe4ff;font-size:0.9rem;">
        ✨ Pre-filled from a <strong>Dram &amp; Draught</strong> event. Review the basics, add menuqr setup (signups, theme, sections), then save — this will become the menuqr event and stop the website from creating a duplicate.
      </div>` : ''}
      <div class="ev-tab-panel is-active" data-tab-panel="basics">
      <!-- ─── Basics ─── -->
      <div class="ev-section" id="event-details">
        <h2>Event Details</h2>
        <p class="ev-section-hint">What guests see first: title, location, URL slug, description, and banner image.</p>

        <label for="ev-title">Event Name <span style="color:#f87171">*</span></label>
        <input type="text" id="ev-title" name="title" required value="${escHTML(event?.title || '')}" placeholder="e.g. Lubrication Cup 2026" />

        <div class="ev-field-grid">
          <div>
            <label for="ev-location">Location <span style="color:#f87171">*</span></label>
            <select id="ev-location" name="locationId" required>
              ${locationOptions}
            </select>
            ${!isNew ? `<p style="color:#888; font-size:0.78rem; margin:6px 0 0">Changing the location moves the event (and its public URL) to that venue.</p>` : ''}
          </div>
          <div>
            <label for="ev-slug">URL Slug <span style="color:#888; font-weight:400; font-size:0.8rem">(optional — auto-generated from name)</span></label>
            <input type="text" id="ev-slug" name="slug" value="${escHTML(event?.slug || '')}" placeholder="lubrication-cup" pattern="[-a-z0-9]*" />
          </div>
        </div>
        ${(() => {
          const groupOptions = Array.isArray(opts.groupOptions) ? opts.groupOptions : [];
          const currentGroup = (event?.groupKey && !String(event.groupKey).startsWith('src:')) ? String(event.groupKey) : '';
          const autoMatch = opts.autoKey ? groupOptions.find(g => g.key === opts.autoKey) : null;
          const optionEls = groupOptions
            .map(g => `<option value="${escHTML(g.key)}"${currentGroup === g.key ? ' selected' : ''}>${escHTML(g.label)}</option>`)
            .join('');
          const customOpt = (currentGroup && !groupOptions.some(g => g.key === currentGroup))
            ? `<option value="${escHTML(currentGroup)}" selected>${escHTML(currentGroup)} (current)</option>` : '';
          const note = currentGroup
            ? ''
            : (autoMatch
              ? `<p style="color:#a4f4c2; font-size:0.8rem; margin:6px 0 0">↳ Will be grouped automatically with: <strong>${escHTML(autoMatch.label)}</strong></p>`
              : `<p style="color:#888; font-size:0.78rem; margin:6px 0 0">No matching event yet — it'll group automatically with any event of the same name &amp; date added later, or pick one above to force a group.</p>`);
          return `
        <div>
          <label for="ev-groupkey">Group with ${helpTip('When the same event runs at multiple venues, grouping shows them together as one entry in the events list. Leave on Auto-detect to group by name + date, or pick an existing group to force it.')}<span style="color:#888; font-weight:400; font-size:0.8rem">(links the same event across locations in the admin list)</span></label>
          <select id="ev-groupkey" name="groupKey">
            <option value="">Auto-detect — group with events of the same name &amp; date</option>
            ${optionEls}
            ${customOpt}
          </select>
          ${note}
        </div>`;
        })()}

        <label for="ev-description">Description <span style="color:#888; font-weight:400; font-size:0.8rem">(short public blurb — the full details live in the Page Builder)</span></label>
        ${richTextToolbar('ev-description')}
        <textarea id="ev-description" class="rich-textarea" name="description" rows="6" placeholder="A sentence or two shown above the event page. Use bullets, pasted links, or [link text](https://example.com).">${escHTML(event?.description || '')}</textarea>
        ${(!isNew && event.sourceDescription) ? `
        <details class="ev-source-ref" style="margin-top:8px; border:1px solid var(--line); border-radius:8px; padding:0 12px;">
          <summary style="cursor:pointer; padding:10px 0; color:var(--text-muted); font-size:0.85rem;">📄 Imported source text <span style="color:#888;">(reference only — not shown publicly)</span></summary>
          <div style="padding:0 0 12px;">
            <p style="color:#888; font-size:0.78rem; margin:0 0 8px;">The original text imported from the Dram &amp; Draught site / Eventbrite. The public description and Page Builder were generated from this. Kept so you can see the source.</p>
            <textarea readonly rows="8" style="width:100%; background:#0f1012; color:#bbb; border:1px solid var(--line); border-radius:6px; padding:10px; font-size:0.84rem; line-height:1.5;">${escHTML(event.sourceDescription)}</textarea>
          </div>
        </details>` : ''}

        <label>Banner Image <span style="color:#888; font-weight:400; font-size:0.8rem">(optional)</span></label>
        ${(() => {
          const hasSrc = !!event?.image;
          return `
        <div class="sec-img-upload" data-prefix="ev-banner">
          <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" id="ev-banner-file" class="sec-img-file" />
          <div class="sec-img-hint">Click to choose a file (auto-compressed), or paste a hosted image URL below.</div>
          <input type="text" id="ev-banner-url-input" placeholder="https://... (optional alternative)" class="sec-img-url-input" value="${hasSrc && /^https?:\/\//i.test(event.image) ? escHTML(event.image) : ''}" />
          <input type="hidden" id="ev-banner-src" name="image" value="${hasSrc ? escHTML(event.image) : ''}" />
          <div class="sec-img-preview-wrap">
            <img id="ev-banner-preview" class="sec-img-preview" src="${hasSrc ? escHTML(event.image) : ''}" alt="" style="${hasSrc ? '' : 'display:none'}" />
            ${hasSrc ? `<button type="button" class="btn btn-secondary btn-sm sec-img-clear" data-prefix="ev-banner">Remove image</button>` : ''}
          </div>
        </div>`;
        })()}

        ${(() => {
          const style = event?.bannerStyle === 'featured' ? 'featured' : 'hero';
          return `
        <label style="margin-top:14px; margin-bottom:6px">Banner style <span style="color:#888; font-weight:400; font-size:0.8rem">(when an image is set)</span></label>
        <div class="ev-signup-type-grid">
          <label class="ev-signup-type ${style === 'hero' ? 'is-active' : ''}">
            <input type="radio" name="bannerStyle" value="hero" ${style === 'hero' ? 'checked' : ''} />
            <strong>Image hero</strong>
            <span>Photo fills the header with the title overlaid on top.</span>
          </label>
          <label class="ev-signup-type ${style === 'featured' ? 'is-active' : ''}">
            <input type="radio" name="bannerStyle" value="featured" ${style === 'featured' ? 'checked' : ''} />
            <strong>Featured below</strong>
            <span>Keep the styled text header; show the image beneath it.</span>
          </label>
        </div>`;
        })()}
      </div>

      <!-- ─── Dates ─── -->
      <div class="ev-section" id="event-when">
        <h2>When</h2>
        <p class="ev-section-hint">Set the event time and the promotion/signup window.</p>

        <div class="ev-field-grid">
          <div>
            <label for="ev-start">Event Date &amp; Time <span style="color:#f87171">*</span></label>
            <input type="datetime-local" id="ev-start" name="startDate" required value="${escHTML(toDateTimeLocal(event?.startDate))}" />
          </div>
          <div>
            <label for="ev-end">End Time <span style="color:#888; font-weight:400; font-size:0.8rem">(optional)</span></label>
            <input type="datetime-local" id="ev-end" name="endDate" value="${escHTML(toDateTimeLocal(event?.endDate))}" />
          </div>
        </div>

        <div class="ev-field-grid" style="margin-top:14px">
          <div>
            <label for="ev-promote-from">Start Promoting <span style="color:#888; font-weight:400; font-size:0.8rem">(optional &mdash; defaults to now)</span></label>
            <input type="datetime-local" id="ev-promote-from" name="promoteFrom" value="${escHTML(toDateTimeLocal(event?.promoteFrom))}" />
          </div>
          <div>
            <label for="ev-promote-until">Stop Accepting Signups <span style="color:#888; font-weight:400; font-size:0.8rem">(optional &mdash; defaults to event start)</span></label>
            <input type="datetime-local" id="ev-promote-until" name="promoteUntil" value="${escHTML(toDateTimeLocal(event?.promoteUntil))}" />
          </div>
        </div>
      </div>
      ${recurrenceRuleFields(event)}
      </div><!-- /basics panel -->

      <div class="ev-tab-panel" data-tab-panel="appearance">
        <div class="ev-section" id="event-appearance">
          <div class="ev-appearance-head">
            <div>
              <h2>Appearance</h2>
              <p class="ev-section-hint">Choose a look for the public event page. A theme restyles the colors, fonts, and background — your text, images, and sections stay exactly as you set them.</p>
            </div>
            ${!isNew && event.location?.slug && event.slug
              ? `<a class="btn btn-secondary btn-sm ev-appearance-preview" href="/${escHTML(event.location.slug)}/events/${escHTML(event.slug)}" target="_blank" rel="noopener">Preview page ↗</a>`
              : ''}
          </div>
          <p class="ev-section-hint" style="margin-top:-6px">Save your changes first, then preview to see the theme live.</p>
          ${themePickerFragment(event?.themeKey)}
        </div>
      </div>

      <div class="ev-tab-panel" data-tab-panel="signups">
      <!-- ─── Signups (form + settings combined) ─── -->
      <div class="ev-section" id="event-signups">
        <h2>Signups</h2>
        <p class="ev-section-hint">Configure the form, limits, questions, and confirmation message. Turn the form off for info-only events.</p>

        <label class="ev-check checkbox-card" style="margin-bottom:14px">
          <input type="checkbox" name="signupsEnabled" ${!event || event.signupsEnabled !== false ? 'checked' : ''} />
          <strong>Show signup form on the public page</strong>
        </label>

        ${(() => {
          // Signup mode picker — Guest RSVP / Vendor / Participant. Drives
          // form copy, the "approve before confirmed" gate, and where the
          // signup ends up in the admin signups tabs.
          const { SIGNUP_TYPE_LABELS, SIGNUP_TYPE_DESCRIPTIONS, effectiveSignupType: pickType } = require('../eventSignupTypes');
          const current = event ? pickType(event) : 'guest';
          const opt = (key) => `
            <label class="ev-signup-type ${current === key ? 'is-active' : ''}">
              <input type="radio" name="signupType" value="${key}" ${current === key ? 'checked' : ''} />
              <strong>${escHTML(SIGNUP_TYPE_LABELS[key])}</strong>
              <span>${escHTML(SIGNUP_TYPE_DESCRIPTIONS[key])}</span>
            </label>`;
          return `
            <label style="margin-top: 10px; margin-bottom: 6px;">Signup mode ${helpTip('Guest RSVP confirms instantly. Vendor and Participant route signups to an approval queue first — use Participant for competition entrants (it unlocks finalists + judging).')}</label>
            <div class="ev-signup-type-grid">
              ${opt('guest')}
              ${opt('vendor')}
              ${opt('participant')}
            </div>
          `;
        })()}

        <div class="ev-field-grid">
          <div>
            <label for="ev-capacity">Max Signups <span style="color:#888; font-weight:400; font-size:0.8rem">(leave blank for no limit)</span></label>
            <input type="number" id="ev-capacity" name="capacity" min="1" value="${escHTML(event?.capacity || '')}" placeholder="e.g. 50" />
          </div>
          <div>
            <label for="ev-notify">Notification Email <span style="color:#888; font-weight:400; font-size:0.8rem">(optional)</span></label>
            <input type="email" id="ev-notify" name="notifyEmail" value="${escHTML(event?.notifyEmail || '')}" placeholder="Get emailed when someone signs up" />
          </div>
        </div>

        ${(() => {
          const mode = event?.spotsLeftMode || 'always';
          const o = (val, label) => `<option value="${val}"${mode === val ? ' selected' : ''}>${label}</option>`;
          return `
        <div class="ev-field-grid" style="margin-top:18px">
          <div>
            <label for="ev-spots-mode">&ldquo;Spots left&rdquo; countdown <span style="color:#888; font-weight:400; font-size:0.8rem">(needs a max)</span></label>
            <select id="ev-spots-mode" name="spotsLeftMode">
              ${o('always', 'Always show how many spots remain')}
              ${o('near-full', 'Only show once 75% full (build urgency)')}
              ${o('hidden', 'Never show a count')}
            </select>
            <p style="color:#888; font-size:0.78rem; margin:6px 0 0">Controls the &ldquo;Only 5 spots left&rdquo; badge on the public page. Ignored when there&rsquo;s no max.</p>
          </div>
          <div></div>
        </div>`;
        })()}

        <div class="ev-field-grid" style="margin-top:18px">
          <div>
            <label for="ev-ticket-url">Ticket URL <span style="color:#888; font-weight:400; font-size:0.8rem">(Eventbrite, optional)</span></label>
            <input type="url" id="ev-ticket-url" name="ticketUrl" value="${escHTML(event?.ticketUrl || '')}" placeholder="https://www.eventbrite.com/e/..." />
            <p style="color:#888; font-size:0.78rem; margin:6px 0 0">Adds a &ldquo;Get Tickets&rdquo; button to the public event page and surfaces on the calendar.</p>
          </div>
          <div>
            <label class="ev-check" style="margin-top:24px"><input type="checkbox" name="remindersEnabled" ${!event || event.remindersEnabled !== false ? 'checked' : ''} /> Send reminder emails (T-24h &amp; T-1h)</label>
            <p style="color:#888; font-size:0.78rem; margin:6px 0 0">Only approved signups with an email get reminders. Recipients can opt out via a one-click link.</p>
          </div>
        </div>

        <label style="margin-top:18px; margin-bottom:8px">Standard Fields</label>
        <div class="ev-standard-fields">
          <label class="ev-check"><input type="checkbox" name="collectEmail" ${!event || event.collectEmail ? 'checked' : ''} /> Email address</label>
          <label class="ev-check"><input type="checkbox" name="collectPhone" ${!event || event.collectPhone ? 'checked' : ''} /> Phone number</label>
          <label class="ev-check"><input type="checkbox" name="collectPartySize" ${event?.collectPartySize ? 'checked' : ''} /> Party size (how many people)</label>
          <label class="ev-check"><input type="checkbox" name="collectNotes" ${event?.collectNotes ? 'checked' : ''} /> Notes or special requests</label>
        </div>

        <label style="margin-top:18px; margin-bottom:6px">Custom Questions ${helpTip('Extra questions on the signup form — short text, long text, number, yes/no, a single image, or an image gallery. Use these to collect things like dietary needs, a cocktail spec, or photos from entrants.')}</label>
        <p style="color:#888; font-size:0.8rem; margin-bottom:10px">
          Add your own questions, like &ldquo;T-shirt size&rdquo; or &ldquo;Experience level&rdquo;.
        </p>
        <div id="cq-list" class="cq-list">${customQuestionRows}</div>
        <button type="button" id="cq-add" class="btn btn-secondary btn-sm">+ Add Custom Question</button>

        <div class="ev-judging-section" style="margin-top:22px; padding-top:18px; border-top:1px solid var(--line);">
          <label style="margin-bottom:6px">Competition judging ${helpTip('For cocktail comps, cook-offs, etc. Add scoring criteria and judges, then a private judge link appears on the Signups page. Mark finalists there, judges score them on their phones, and results rank automatically.')}<span style="color:#888; font-weight:400; font-size:0.8rem">(optional)</span></label>
          <p style="color:#888; font-size:0.8rem; margin-bottom:10px">
            For cocktail comps, cook-offs, performances, etc. Collect applications, mark finalists on the signups page, then judges score the finalists on the criteria below via a private link. Leave empty for normal events.
          </p>

          <label style="margin-top:6px; font-size:0.85rem">How many finalists do you plan to select?</label>
          <input type="number" name="finalistTarget" min="1" max="100" value="${event?.finalistTarget ? escHTML(String(event.finalistTarget)) : ''}" placeholder="e.g. 8" style="max-width:160px" />

          <label style="margin-top:14px; margin-bottom:6px; font-size:0.85rem">Scoring criteria</label>
          <p style="color:#888; font-size:0.78rem; margin-bottom:8px">What judges rate each finalist on, and the max points for each (e.g. Taste 10, Presentation 5).</p>
          <div id="jc-list" class="cq-list">${criteriaRows}</div>
          <button type="button" id="jc-add" class="btn btn-secondary btn-sm">+ Add criterion</button>

          <label style="margin-top:14px; margin-bottom:6px; font-size:0.85rem">Judges</label>
          <p style="color:#888; font-size:0.78rem; margin-bottom:8px">Who will score. Each judge picks their name when they open the judge link.</p>
          <div id="judge-list" class="cq-list">${judgeRows}</div>
          <button type="button" id="judge-add" class="btn btn-secondary btn-sm">+ Add judge</button>

          ${!isNew && event.judgeToken ? `
            <p style="color:#8d9299; font-size:0.78rem; margin-top:12px">A judge link is generated automatically once you have at least one criterion and one judge. Find it (and open/close scoring) on the event's <a href="/admin/events/${escHTML(event.id)}/signups" style="color:var(--gold)">signups page</a>.</p>
          ` : `<p style="color:#8d9299; font-size:0.78rem; margin-top:12px">Save with at least one criterion and one judge to generate the shareable judge link.</p>`}
        </div>

        <label for="ev-confirm" style="margin-top:18px">Confirmation Message <span style="color:#888; font-weight:400; font-size:0.8rem">(shown after signup)</span></label>
        ${richTextToolbar('ev-confirm')}
        <textarea id="ev-confirm" class="rich-textarea" name="confirmationMessage" rows="4" placeholder="Thanks for signing up! Use bullets, pasted links, or [link text](https://example.com).">${escHTML(event?.confirmationMessage || '')}</textarea>
      </div>
      </div><!-- /signups panel -->

      <div class="form-actions">
        <button type="submit" class="btn btn-primary">${isNew ? 'Create Event' : 'Save Changes'}</button>
        <a href="/admin/events" class="btn btn-secondary">Cancel</a>
      </div>
    </form>

    <div id="ev-publish-modal" class="ev-publish-overlay" hidden>
      <div class="ev-publish-card" role="dialog" aria-modal="true" aria-labelledby="ev-publish-title">
        <h3 id="ev-publish-title">Before you publish</h3>
        <p style="color:#aaa; font-size:0.88rem; margin:0 0 10px">A few things to double-check on this event:</p>
        <ul id="ev-publish-list" style="margin:0 0 16px; padding-left:18px; line-height:1.7; color:#e7e2d6;"></ul>
        <div style="display:flex; gap:10px; justify-content:flex-end; flex-wrap:wrap;">
          <button type="button" class="btn btn-secondary" id="ev-publish-back">Go back &amp; fix</button>
          <button type="button" class="btn btn-primary" id="ev-publish-go">Publish anyway</button>
        </div>
      </div>
    </div>
    <style>
      .ev-publish-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.6); display:flex; align-items:center; justify-content:center; z-index:1000; padding:18px; }
      .ev-publish-overlay[hidden] { display:none; }
      .ev-publish-card { background:var(--surface,#1a1b1f); border:1px solid var(--line,#2a2b30); border-radius:14px; padding:22px; max-width:460px; width:100%; }
      .ev-publish-card h3 { margin:0 0 6px; color:#f0c869; }
    </style>

    ${!isNew ? `
      <div class="ev-tab-panel" data-tab-panel="page">
        ${recurrenceManageCard(event, actionUrl)}
        ${renderSectionsCard(event, actionUrl)}
        <div class="ev-delete-section">
          <h3>Delete this event</h3>
          <p>This permanently removes the event and all its signups. This cannot be undone.</p>
          <form method="POST" action="${actionUrl}" onsubmit="return confirm('Really delete this event and all ${signupCount} signup${signupCount === 1 ? '' : 's'}? This cannot be undone.')">
            <input type="hidden" name="_action" value="delete" />
            <button type="submit" class="btn btn-danger">Delete Event</button>
          </form>
        </div>
      </div>
    ` : ''}

    <script>
      (function() {
        // Share link with source-tag buttons:
        //   - clicking a tag updates the share URL with ?src=<tag>
        //   - the Copy button copies whatever's currently in the URL field
        //   - the Open ↗ link opens the current URL
        var shareInput = document.getElementById('ev-share-url');
        var copyBtn = document.getElementById('ev-copy-url');
        var openLink = document.getElementById('ev-open-url');
        var status = document.getElementById('ev-share-status');
        var basePath = shareInput ? shareInput.getAttribute('data-base') : '';
        var origin = window.location.origin;
        var currentSrc = '';

        function buildUrl(src) {
          if (!basePath) return '';
          var url = origin + basePath;
          if (src) url += '?src=' + encodeURIComponent(src);
          return url;
        }
        function applySrc(src) {
          currentSrc = src || '';
          if (shareInput) shareInput.value = buildUrl(currentSrc);
          if (openLink) openLink.href = buildUrl(currentSrc);
          // Update active button styling
          document.querySelectorAll('.ev-share-btn').forEach(function(b) {
            if (b.getAttribute('data-src') === currentSrc) b.classList.add('ev-share-btn-active');
            else b.classList.remove('ev-share-btn-active');
          });
        }
        function copyUrl() {
          if (!shareInput) return;
          shareInput.select();
          try { navigator.clipboard.writeText(shareInput.value); }
          catch (e) { document.execCommand('copy'); }
          if (status) {
            status.textContent = currentSrc
              ? '\u2713 Copied! Tagged as ' + currentSrc + '.'
              : '\u2713 Copied! (no source tag)';
            setTimeout(function() { status.textContent = ''; }, 2500);
          }
        }

        if (shareInput) {
          // Initialize URL with the absolute origin so it's copy-ready
          applySrc('');
        }
        // Share panel toggle (button in header expands/collapses the share box)
        var shareToggle = document.getElementById('ev-share-toggle');
        var sharePanel = document.getElementById('ev-public-url');
        if (shareToggle && sharePanel) {
          shareToggle.addEventListener('click', function() {
            var open = !sharePanel.hasAttribute('hidden');
            if (open) {
              sharePanel.setAttribute('hidden', '');
            } else {
              sharePanel.removeAttribute('hidden');
              sharePanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
          });
        }
        if (copyBtn) copyBtn.addEventListener('click', copyUrl);
        document.querySelectorAll('.ev-share-btn').forEach(function(btn) {
          btn.addEventListener('click', function() {
            applySrc(btn.getAttribute('data-src') || '');
            copyUrl();
          });
        });

        // Custom question add/remove
        var cqList = document.getElementById('cq-list');
        var cqAdd = document.getElementById('cq-add');
        var cqIdx = ${customQuestions.length};
        function buildCqRow(i) {
          var row = document.createElement('div');
          row.className = 'cq-row';
          row.setAttribute('data-cq-idx', i);
          row.innerHTML =
            '<input type="hidden" name="custom_id" value="" />' +
            '<div class="cq-row-grid">' +
              '<div><label>Question</label><input type="text" name="custom_label" placeholder="e.g. T-shirt size" /></div>' +
              '<div><label>Type</label><select name="custom_type">' +
                '<option value="text">Short text</option>' +
                '<option value="textarea">Long text</option>' +
                '<option value="number">Number</option>' +
                '<option value="yesno">Yes / No</option>' +
                '<option value="image">Image upload</option>' +
                '<option value="images-multi">Image gallery (multiple)</option>' +
              '</select></div>' +
              '<div class="cq-required-col"><label>&nbsp;</label><label class="ev-check"><input type="checkbox" name="custom_required_' + i + '" /> Required</label></div>' +
              '<div class="cq-del-col"><label>&nbsp;</label><button type="button" class="btn btn-danger btn-sm cq-remove">Remove</button></div>' +
            '</div>';
          return row;
        }
        if (cqAdd && cqList) {
          cqAdd.addEventListener('click', function() {
            cqList.appendChild(buildCqRow(cqIdx));
            cqIdx++;
          });
        }
        document.addEventListener('click', function(e) {
          if (e.target && e.target.classList && e.target.classList.contains('cq-remove')) {
            var row = e.target.closest('.cq-row');
            if (row) row.remove();
          }
        });

        // Judging criteria add/remove.
        var jcList = document.getElementById('jc-list');
        var jcAdd = document.getElementById('jc-add');
        if (jcAdd && jcList) {
          jcAdd.addEventListener('click', function() {
            var row = document.createElement('div');
            row.className = 'jc-row';
            row.innerHTML =
              '<input type="hidden" name="jc_id" value="" />' +
              '<div class="jc-row-grid">' +
                '<div><label>Criterion</label><input type="text" name="jc_label" placeholder="e.g. Presentation" /></div>' +
                '<div><label>Max</label><input type="number" name="jc_max" min="1" max="100" value="10" /></div>' +
                '<div class="cq-del-col"><label>&nbsp;</label><button type="button" class="btn btn-danger btn-sm jc-remove">Remove</button></div>' +
              '</div>';
            jcList.appendChild(row);
          });
        }
        // Judge roster add/remove.
        var judgeList = document.getElementById('judge-list');
        var judgeAdd = document.getElementById('judge-add');
        if (judgeAdd && judgeList) {
          judgeAdd.addEventListener('click', function() {
            var row = document.createElement('div');
            row.className = 'judge-row';
            row.innerHTML =
              '<input type="hidden" name="judge_id" value="" />' +
              '<div class="jc-row-grid">' +
                '<div><label>Judge name</label><input type="text" name="judge_name" placeholder="e.g. Carrie M." /></div>' +
                '<div class="cq-del-col"><label>&nbsp;</label><button type="button" class="btn btn-danger btn-sm judge-remove">Remove</button></div>' +
              '</div>';
            judgeList.appendChild(row);
          });
        }
        document.addEventListener('click', function(e) {
          if (!e.target || !e.target.classList) return;
          if (e.target.classList.contains('jc-remove')) { var r1 = e.target.closest('.jc-row'); if (r1) r1.remove(); }
          if (e.target.classList.contains('judge-remove')) { var r2 = e.target.closest('.judge-row'); if (r2) r2.remove(); }
        });

        // Rich text helper buttons for event descriptions and content sections.
        function replaceTextareaRange(textarea, text, selectStart, selectEnd) {
          var start = textarea.selectionStart || 0;
          var end = textarea.selectionEnd || start;
          textarea.value = textarea.value.slice(0, start) + text + textarea.value.slice(end);
          var nextStart = typeof selectStart === 'number' ? start + selectStart : start + text.length;
          var nextEnd = typeof selectEnd === 'number' ? start + selectEnd : nextStart;
          textarea.focus();
          textarea.setSelectionRange(nextStart, nextEnd);
          textarea.dispatchEvent(new Event('input', { bubbles: true }));
        }
        function applyTextWrap(textarea, before, after, fallback) {
          var start = textarea.selectionStart || 0;
          var end = textarea.selectionEnd || start;
          var selected = textarea.value.slice(start, end) || fallback;
          replaceTextareaRange(textarea, before + selected + after, before.length, before.length + selected.length);
        }
        function applyBullets(textarea) {
          var start = textarea.selectionStart || 0;
          var end = textarea.selectionEnd || start;
          var selected = textarea.value.slice(start, end);
          if (!selected) {
            replaceTextareaRange(textarea, '• ', 2, 2);
            return;
          }
          var lines = selected.split('\\n').map(function(line) {
            if (!line.trim()) return line;
            if (/^\\s*(?:[-*•])\\s+/.test(line)) return line;
            return line.replace(/^(\\s*)/, '$1• ');
          });
          replaceTextareaRange(textarea, lines.join('\\n'));
        }
        function normalizeLinkUrl(url) {
          var trimmed = (url || '').trim();
          if (!trimmed) return '';
          if (/^(https?:\\/\\/|mailto:|tel:)/i.test(trimmed)) return trimmed;
          return 'https://' + trimmed;
        }
        document.addEventListener('click', function(e) {
          if (!e.target.classList || !e.target.classList.contains('rt-btn')) return;
          var toolbar = e.target.closest('.rich-toolbar');
          var targetId = toolbar ? toolbar.getAttribute('data-target') : '';
          var textarea = targetId ? document.getElementById(targetId) : null;
          if (!textarea) return;
          var action = e.target.getAttribute('data-action');
          if (action === 'bold') {
            applyTextWrap(textarea, '**', '**', 'important text');
          } else if (action === 'italic') {
            applyTextWrap(textarea, '*', '*', 'emphasized text');
          } else if (action === 'bullet') {
            applyBullets(textarea);
          } else if (action === 'link') {
            var start = textarea.selectionStart || 0;
            var end = textarea.selectionEnd || start;
            var selected = textarea.value.slice(start, end).trim();
            var url = normalizeLinkUrl(prompt('Paste the link URL') || '');
            if (!url) {
              textarea.focus();
              return;
            }
            var label = selected || prompt('Link text', url) || url;
            replaceTextareaRange(textarea, '[' + label + '](' + url + ')', 1, 1 + label.length);
          }
        });

        // Auto-fill slug from title if slug field is empty (only when creating)
        var titleEl = document.getElementById('ev-title');
        var slugEl = document.getElementById('ev-slug');
        if (titleEl && slugEl && ${isNew ? 'true' : 'false'}) {
          var userEditedSlug = false;
          slugEl.addEventListener('input', function() { userEditedSlug = true; });
          titleEl.addEventListener('input', function() {
            if (!userEditedSlug) {
              slugEl.value = titleEl.value.toLowerCase().replace(/[^a-z0-9\\s-]/g, '').trim().replace(/\\s+/g, '-').slice(0, 60);
            }
          });
        }

        // ─── Image upload widget (used by banner AND section images) ───
        // Photos are stored inline as base64 data URLs, so we resize +
        // recompress in the browser before saving. This makes normal phone
        // photos (2–5 MB) "just work" instead of being rejected or silently
        // dropped server-side for being too large.
        function compressImageFile(file, cb) {
          var TARGET_BYTES = 620 * 1024; // keep data URL comfortably under the server cap
          var MAX_DIM = 1600;            // longest edge
          var reader = new FileReader();
          reader.onload = function() {
            var img = new Image();
            img.onload = function() {
              try {
                var w = img.naturalWidth || img.width;
                var h = img.naturalHeight || img.height;
                if (!w || !h) { cb(reader.result); return; }
                var scale = Math.min(1, MAX_DIM / Math.max(w, h));
                function render(s, q) {
                  var canvas = document.createElement('canvas');
                  canvas.width = Math.max(1, Math.round(w * s));
                  canvas.height = Math.max(1, Math.round(h * s));
                  var ctx = canvas.getContext('2d');
                  // White matte so PNG/transparent areas don't go black in JPEG.
                  ctx.fillStyle = '#ffffff';
                  ctx.fillRect(0, 0, canvas.width, canvas.height);
                  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                  return canvas.toDataURL('image/jpeg', q);
                }
                var q = 0.82;
                var out = render(scale, q);
                var guard = 0;
                while (out.length > TARGET_BYTES && q > 0.4 && guard < 6) { q -= 0.1; out = render(scale, q); guard++; }
                // Still too big? step the dimensions down too.
                guard = 0;
                while (out.length > TARGET_BYTES && scale > 0.3 && guard < 4) { scale *= 0.8; out = render(scale, 0.7); guard++; }
                cb(out);
              } catch (err) {
                cb(reader.result); // fall back to the original data URL
              }
            };
            img.onerror = function() { cb(reader.result); };
            img.src = reader.result;
          };
          reader.onerror = function() { cb(null); };
          reader.readAsDataURL(file);
        }
        document.addEventListener('change', function(e) {
          if (!e.target.classList || !e.target.classList.contains('sec-img-file')) return;
          var input = e.target;
          var prefix = input.id.replace(/-file$/, '');
          var srcInput = document.getElementById(prefix + '-src');
          var preview = document.getElementById(prefix + '-preview');
          var urlInput = document.getElementById(prefix + '-url-input');
          var file = input.files && input.files[0];
          if (!file) return;
          if ((file.type || '').indexOf('image/') !== 0) {
            alert('That file is not an image. Please choose a JPG, PNG, or WebP.');
            input.value = '';
            return;
          }
          compressImageFile(file, function(dataUrl) {
            if (!dataUrl) { alert('Sorry, that image could not be processed. Try a different file.'); input.value = ''; return; }
            if (dataUrl.length > 760 * 1024) {
              alert('Even after compressing, this image is too large. Try a smaller photo or paste a hosted image URL.');
              input.value = '';
              return;
            }
            if (srcInput) srcInput.value = dataUrl;
            if (preview) { preview.src = dataUrl; preview.style.display = ''; }
            if (urlInput) urlInput.value = '';
          });
        });
        // URL input → set the hidden src field + preview
        document.addEventListener('input', function(e) {
          if (!e.target.classList || !e.target.classList.contains('sec-img-url-input')) return;
          var input = e.target;
          var prefix = input.id.replace(/-url-input$/, '');
          var srcInput = document.getElementById(prefix + '-src');
          var preview = document.getElementById(prefix + '-preview');
          var url = (input.value || '').trim();
          if (srcInput) srcInput.value = url;
          if (preview) {
            if (/^https?:\\/\\//i.test(url)) { preview.src = url; preview.style.display = ''; }
            else { preview.style.display = 'none'; }
          }
        });
        // Remove image button
        document.addEventListener('click', function(e) {
          if (!e.target.classList || !e.target.classList.contains('sec-img-clear')) return;
          var prefix = e.target.getAttribute('data-prefix');
          var srcInput = document.getElementById(prefix + '-src');
          var preview = document.getElementById(prefix + '-preview');
          var urlInput = document.getElementById(prefix + '-url-input');
          var fileInput = document.getElementById(prefix + '-file');
          if (srcInput) srcInput.value = '';
          if (preview) { preview.src = ''; preview.style.display = 'none'; }
          if (urlInput) urlInput.value = '';
          if (fileInput) fileInput.value = '';
        });

        // ─── Tabbed editor ───
        var tabs = Array.prototype.slice.call(document.querySelectorAll('.ev-tab'));
        var panels = Array.prototype.slice.call(document.querySelectorAll('[data-tab-panel]'));
        function activateTab(name) {
          var matched = false;
          tabs.forEach(function(t) {
            var on = t.getAttribute('data-tab') === name;
            t.classList.toggle('is-active', on);
            if (on) matched = true;
          });
          if (!matched) return;
          panels.forEach(function(p) {
            p.classList.toggle('is-active', p.getAttribute('data-tab-panel') === name);
          });
          try { history.replaceState(null, '', '#' + name); } catch (e) {}
        }
        tabs.forEach(function(t) {
          t.addEventListener('click', function() { activateTab(t.getAttribute('data-tab')); });
        });
        // Deep-link / restore via #hash (e.g. #appearance)
        var initialTab = (window.location.hash || '').replace('#', '');
        if (initialTab) activateTab(initialTab);

        // ─── Theme picker active-state ───
        document.addEventListener('change', function(e) {
          if (!e.target || e.target.name !== 'themeKey') return;
          document.querySelectorAll('.ev-theme-card').forEach(function(card) {
            var input = card.querySelector('input[name="themeKey"]');
            card.classList.toggle('is-active', !!(input && input.checked));
          });
        });

        // ─── Pre-publish checklist ───
        // When saving an event that will be live, surface a quick review of
        // things that are commonly forgotten (cocktail menu, image, past date)
        // before it posts. Bypassed once the admin confirms.
        var checklist = ${publishChecklistJson};
        var evForm = document.getElementById('ev-form');
        var pubModal = document.getElementById('ev-publish-modal');
        var pubProceed = false;
        if (evForm && pubModal && checklist.length) {
          evForm.addEventListener('submit', function(e) {
            if (pubProceed) return;
            var active = evForm.querySelector('[name="isActive"]');
            var willBeLive = active ? active.checked : false;
            if (!willBeLive) return; // only nag when actually publishing
            e.preventDefault();
            var list = document.getElementById('ev-publish-list');
            list.innerHTML = '';
            checklist.forEach(function(item) {
              var li = document.createElement('li');
              li.textContent = item;
              list.appendChild(li);
            });
            pubModal.hidden = false;
          });
          var back = document.getElementById('ev-publish-back');
          var go = document.getElementById('ev-publish-go');
          if (back) back.addEventListener('click', function() { pubModal.hidden = true; });
          if (go) go.addEventListener('click', function() {
            pubProceed = true;
            pubModal.hidden = true;
            if (evForm.requestSubmit) evForm.requestSubmit(); else evForm.submit();
          });
          pubModal.addEventListener('click', function(e) { if (e.target === pubModal) pubModal.hidden = true; });
        }
      })();
    </script>
  `, user, { pathname: isNew ? '/admin/events/new' : `/admin/events/${event.id}`, flashMsg });
}

// ─── Signups viewer ───
// Judging leaderboard: finalists ranked by average judge total, with a
// per-judge breakdown and the original submission for context.
function eventResultsView(event, finalists, user, flashMsg) {
  const { aggregateResults } = require('../eventJudging');
  const customDefs = Array.isArray(event.customQuestions) ? event.customQuestions : [];
  const { criteria, judges, rows } = aggregateResults(event, finalists);
  const maxTotal = criteria.reduce((s, c) => s + c.max, 0);

  const flash = flashMsg ? `<div class="admin-flash">${escHTML(String(flashMsg).replace(/^[a-z]+\|/, ''))}</div>` : '';

  if (criteria.length === 0 || judges.length === 0) {
    return adminLayout(`${event.title} — Results`, `
      ${flash}
      <div class="page-header">
        <div>
          <a href="/admin/events/${escHTML(event.id)}/signups" class="evs-back">← Signups</a>
          <h1 style="margin:4px 0 0">${escHTML(event.title)} — Results</h1>
        </div>
        <a href="/admin/events/${escHTML(event.id)}" class="btn btn-secondary">Edit Event</a>
      </div>
      <div class="card" style="padding:24px; text-align:center; color:var(--text-muted);">
        Set at least one scoring criterion and one judge in <a href="/admin/events/${escHTML(event.id)}" style="color:var(--gold)">Edit Event</a> to start judging.
      </div>
    `, user);
  }

  // Compact submission summary for a finalist (text answers + image thumbs).
  const submissionSummary = (signup) => {
    const answers = signup.customAnswers || {};
    const bits = customDefs.map((q) => {
      const v = answers[q.id];
      if (v == null || v === '') return '';
      if (q.type === 'images-multi' && Array.isArray(v)) {
        const imgs = v.filter(x => typeof x === 'string' && /^(data:image|https?:\/\/)/i.test(x));
        if (!imgs.length) return '';
        return `<div class="res-sub-field"><span>${escHTML(q.label)}</span><div class="evs-images">${imgs.map(src => `<a href="${escHTML(src)}" target="_blank" rel="noopener"><img src="${escHTML(src)}" alt="" /></a>`).join('')}</div></div>`;
      }
      if (q.type === 'image' && /^(data:image|https?:\/\/)/i.test(String(v))) {
        return `<div class="res-sub-field"><span>${escHTML(q.label)}</span><div class="evs-images"><a href="${escHTML(String(v))}" target="_blank" rel="noopener"><img src="${escHTML(String(v))}" alt="" /></a></div></div>`;
      }
      return `<div class="res-sub-field"><span>${escHTML(q.label)}</span><div>${escHTML(String(v))}</div></div>`;
    }).filter(Boolean).join('');
    return bits;
  };

  const critHeader = criteria.map(c => `<th title="max ${c.max}">${escHTML(c.label)}<br><span style="font-weight:400;color:var(--text-soft)">/ ${c.max}</span></th>`).join('');

  const rankRows = rows.map((row) => {
    const medal = row.rank === 1 ? '🥇' : row.rank === 2 ? '🥈' : row.rank === 3 ? '🥉' : (row.rank ? `#${row.rank}` : '—');
    const perCrit = criteria.map(c => {
      const avg = row.perCriterionAvg[c.id];
      return `<td style="text-align:center">${avg == null ? '<span class="evs-muted">—</span>' : avg.toFixed(1)}</td>`;
    }).join('');
    const judgeChips = row.judgeCards.map(jc =>
      `<span class="res-judge-chip${jc.scored ? '' : ' is-pending'}" title="${escHTML(jc.notes || '')}">${escHTML(jc.judge.name)}: ${jc.scored ? jc.total.toFixed(1) : '—'}${jc.notes ? ' 💬' : ''}</span>`
    ).join('');
    const notes = row.judgeCards.filter(jc => jc.notes).map(jc =>
      `<div class="res-note"><strong>${escHTML(jc.judge.name)}:</strong> ${escHTML(jc.notes)}</div>`
    ).join('');
    const sub = submissionSummary(row.signup);
    return `
      <tr class="res-main-row">
        <td style="text-align:center; font-size:1.1rem; font-weight:800;">${medal}</td>
        <td>
          <div style="font-weight:800; color:var(--text);">${escHTML(row.signup.name || 'Unnamed')}</div>
          <div class="evs-filter-note">${row.judgesScored} / ${judges.length} judges scored</div>
        </td>
        <td style="text-align:center; font-size:1.15rem; font-weight:800; color:var(--gold);">${row.judgesScored ? row.averageTotal.toFixed(1) : '—'}<span style="color:var(--text-soft); font-size:0.8rem; font-weight:500;"> / ${maxTotal}</span></td>
        ${perCrit}
      </tr>
      <tr class="res-detail-row">
        <td></td>
        <td colspan="${2 + criteria.length}">
          <div class="res-judges">${judgeChips}</div>
          ${notes ? `<div class="res-notes">${notes}</div>` : ''}
          ${sub ? `<details class="res-submission"><summary>View submission</summary><div class="res-sub-grid">${sub}</div></details>` : ''}
        </td>
      </tr>`;
  }).join('');

  return adminLayout(`${event.title} — Results`, `
    <style>
      .res-table { width:100%; border-collapse:collapse; }
      .res-table th { text-align:center; color:var(--accent); font-size:0.8rem; padding:8px 10px; border-bottom:1px solid var(--line); }
      .res-table th:nth-child(2) { text-align:left; }
      .res-table td { padding:10px; vertical-align:top; }
      .res-main-row { border-top:1px solid rgba(255,255,255,0.06); }
      .res-detail-row td { padding-top:0; padding-bottom:16px; }
      .res-judges { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:6px; }
      .res-judge-chip { background:#121417; border:1px solid rgba(255,255,255,0.1); border-radius:999px; padding:3px 10px; font-size:0.8rem; color:#cbd5e1; }
      .res-judge-chip.is-pending { color:#68717d; border-style:dashed; }
      .res-note { font-size:0.84rem; color:var(--text-muted); margin:2px 0; }
      .res-notes { margin:6px 0; padding:8px 10px; background:#121417; border-radius:8px; }
      .res-submission { margin-top:8px; }
      .res-submission summary { cursor:pointer; color:var(--gold); font-size:0.84rem; }
      .res-sub-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(200px,1fr)); gap:10px; margin-top:8px; }
      .res-sub-field span { display:block; color:var(--text-soft); font-size:0.68rem; font-weight:800; letter-spacing:0.06em; text-transform:uppercase; margin-bottom:3px; }
      .res-sub-field { background:#121417; border:1px solid rgba(255,255,255,0.06); border-radius:8px; padding:8px 10px; font-size:0.85rem; color:#ded6ca; }
      .evs-images { display:flex; gap:6px; flex-wrap:wrap; }
      .evs-images img { width:60px; height:60px; object-fit:cover; border-radius:6px; }
      .evs-back { color:#888; font-size:0.85rem; text-decoration:none; }
      .evs-back:hover { color:#d4af37; }
      .evs-muted { color:#68717d; }
      .evs-filter-note { color:#888; font-size:0.82rem; }
    </style>
    ${flash}
    <div class="page-header">
      <div>
        <a href="/admin/events/${escHTML(event.id)}/signups" class="evs-back">← Signups</a>
        <div class="admin-kicker" style="margin-top:8px">Judging results</div>
        <h1 style="margin:4px 0 0">${escHTML(event.title)}</h1>
        <p class="page-subtitle">${rows.length} finalist${rows.length === 1 ? '' : 's'} · ${judges.length} judge${judges.length === 1 ? '' : 's'} · scoring ${event.judgingOpen ? '<strong style="color:#6ee7b7">open</strong>' : '<strong style="color:#fca5a5">closed</strong>'}</p>
      </div>
      <a href="/admin/events/${escHTML(event.id)}/signups" class="btn btn-secondary">Back to signups</a>
    </div>
    ${rows.length === 0 ? `
      <div class="card" style="padding:24px; text-align:center; color:var(--text-muted);">
        No finalists selected yet. Mark finalists on the <a href="/admin/events/${escHTML(event.id)}/signups" style="color:var(--gold)">signups page</a>.
      </div>
    ` : `
      <div class="card" style="padding:8px 16px; overflow-x:auto;">
        <table class="res-table">
          <thead><tr><th>Rank</th><th>Finalist</th><th>Avg total</th>${critHeader}</tr></thead>
          <tbody>${rankRows}</tbody>
        </table>
      </div>
    `}
  `, user);
}

function eventSignupsView(event, signups, user, flashMsg, occCtx = {}) {
  const customDefs = Array.isArray(event.customQuestions) ? event.customQuestions : [];
  const { effectiveSignupType, needsApproval } = require('../eventSignupTypes');
  const sType = effectiveSignupType(event);
  const isVendor = sType === 'vendor' || event.isVendorEvent === true;
  // Finalist selection + judging apply to application-style events (vendor /
  // participant). A competition is the canonical participant case.
  const supportsFinalists = needsApproval(event);
  const criteria = Array.isArray(event.judgingCriteria) ? event.judgingCriteria : [];
  const judges = Array.isArray(event.judges) ? event.judges : [];
  const judgingConfigured = criteria.length > 0 && judges.length > 0;

  // Occurrence tabs (recurring events keep past dates on record). Only shown
  // when there's more than one occurrence to switch between.
  const occurrences = Array.isArray(occCtx.occurrences) ? occCtx.occurrences : [];
  const currentId = occCtx.currentOccurrenceId;
  const selected = occCtx.selectedOcc || currentId;
  let occTabs = '';
  if (occurrences.length > 1) {
    const sorted = [...occurrences].sort((a, b) => new Date(b.startDate) - new Date(a.startDate));
    const base = `/admin/events/${escHTML(event.id)}/signups`;
    const tab = (href, label, active) => `<a href="${href}" class="evs-occ-tab${active ? ' is-active' : ''}">${label}</a>`;
    occTabs = `<div class="evs-occ-tabs" style="display:flex;flex-wrap:wrap;gap:8px;margin:14px 0">
      ${sorted.map((o) => {
        const isCur = o.id === currentId;
        const label = `${escHTML(formatFriendlyDate(o.startDate))}${isCur ? ' · Live' : ''} (${o._count?.signups || 0})`;
        return tab(`${base}?occ=${escHTML(o.id)}`, label, selected === o.id && selected !== 'all');
      }).join('')}
      ${tab(`${base}?occ=all`, 'All dates', selected === 'all')}
    </div>
    <style>.evs-occ-tab{padding:6px 12px;border:1px solid #2a2b30;border-radius:8px;color:#bbb;text-decoration:none;font-size:0.85rem}.evs-occ-tab.is-active{background:#d2aa67;color:#1a1b1f;border-color:#d2aa67;font-weight:700}</style>`;
  }

  const statusBadge = (status) => {
    const s = String(status || 'approved');
    if (s === 'pending') return '<span class="evs-badge evs-badge-pending">Pending</span>';
    if (s === 'rejected') return '<span class="evs-badge evs-badge-rejected">Rejected</span>';
    if (s === 'waitlisted') return '<span class="evs-badge evs-badge-waitlist">Waitlist</span>';
    return '<span class="evs-badge evs-badge-approved">Approved</span>';
  };

  const rows = signups.map(s => {
    const answers = s.customAnswers || {};
    // Fallback lookup by position. Question IDs follow the pattern
    // q_<index>_<random>; saved answer IDs may be stale (predating an event
    // edit that regenerated the random suffixes), but the index segment still
    // identifies the slot so we can rescue old signups for display.
    const answersByIndex = {};
    for (const [key, value] of Object.entries(answers)) {
      const m = String(key).match(/^q_(\d+)_/);
      if (m) answersByIndex[Number(m[1])] = value;
    }
    const lookup = (q, i) => (answers[q.id] !== undefined ? answers[q.id] : answersByIndex[i]);
    const searchText = [
      s.name || '',
      s.email || '',
      s.phone || '',
      s.notes || '',
      s.status || '',
      ...customDefs.map((q, i) => {
        if (q.type === 'image') return '';
        const v = lookup(q, i);
        return v == null ? '' : v;
      }),
    ].join(' ').toLowerCase();
    const customFields = customDefs.map((q, i) => {
      const raw = lookup(q, i);
      if (raw == null || raw === '') {
        return `<div class="evs-field"><span>${escHTML(q.label)}</span><strong class="evs-muted">—</strong></div>`;
      }
      // images-multi: stored as an array of data URLs. Render a row of
      // thumbnails, each clickable to open full-size in a new tab.
      if (q.type === 'images-multi' && Array.isArray(raw)) {
        const imgs = raw.filter(x => typeof x === 'string' && /^(data:image|https?:\/\/)/i.test(x));
        if (imgs.length === 0) return `<div class="evs-field"><span>${escHTML(q.label)}</span><strong class="evs-muted">—</strong></div>`;
        return `<div class="evs-field evs-field-wide"><span>${escHTML(q.label)}</span><div class="evs-images">${imgs.map(src => `<a href="${escHTML(src)}" target="_blank" rel="noopener"><img src="${escHTML(src)}" alt="${escHTML(q.label)}" /></a>`).join('')}</div></div>`;
      }
      // Single-image questions
      if (q.type === 'image' && /^(data:image|https?:\/\/)/i.test(String(raw))) {
        return `<div class="evs-field evs-field-wide"><span>${escHTML(q.label)}</span><div class="evs-images"><a href="${escHTML(raw)}" target="_blank" rel="noopener"><img src="${escHTML(raw)}" alt="${escHTML(q.label)}" /></a></div></div>`;
      }
      return `<div class="evs-field"><span>${escHTML(q.label)}</span><strong>${escHTML(String(raw))}</strong></div>`;
    }).join('');

    const sStatus = String(s.status || 'approved');
    const isWaitlisted = sStatus === 'waitlisted';
    // Finalist toggle — selecting a finalist also confirms them (so they leave
    // the pending queue). Hidden for rejected rows.
    const finalistControl = (supportsFinalists && sStatus !== 'rejected') ? `
      <form method="POST" action="/admin/events/${escHTML(event.id)}/signups" style="margin:0;">
        <input type="hidden" name="_action" value="toggleFinalist" />
        <input type="hidden" name="signupId" value="${escHTML(s.id)}" />
        <button type="submit" class="btn btn-sm ${s.isFinalist ? 'btn-secondary' : 'btn-success'}">${s.isFinalist ? '★ Remove finalist' : '☆ Select as finalist'}</button>
      </form>` : '';
    const checkedIn = !!s.checkedInAt;
    // Day-of check-in: available for confirmed attendees (guest + approved
    // vendor/participant). Not for pending, rejected, or waitlisted rows.
    const checkinBtn = (!isWaitlisted && sStatus !== 'pending' && sStatus !== 'rejected') ? `
      <form method="POST" action="/admin/events/${escHTML(event.id)}/signups" class="evs-checkin-form">
        <input type="hidden" name="_action" value="checkin" />
        <input type="hidden" name="signupId" value="${escHTML(s.id)}" />
        <button type="submit" class="btn btn-sm ${checkedIn ? 'btn-secondary' : 'btn-success'}">${checkedIn ? '✓ Checked in — undo' : 'Check in'}</button>
      </form>` : '';
    const removeForm = `
      <form method="POST" action="/admin/events/${escHTML(event.id)}/signups" onsubmit="return confirm('Remove this signup?')">
        <input type="hidden" name="_action" value="deleteSignup" />
        <input type="hidden" name="signupId" value="${escHTML(s.id)}" />
        <button type="submit" class="btn btn-secondary btn-sm">Remove</button>
      </form>`;

    // Vendor events get approve/reject controls instead of just a Remove button.
    // Pending rows show the decision buttons; already-decided rows show who + when + remove.
    let actionPanel;
    if (isWaitlisted) {
      actionPanel = `
        <div class="evs-actions evs-actions-pending">
          <div class="evs-actions-title">On the waitlist</div>
          <form method="POST" action="/admin/events/${escHTML(event.id)}/signups">
            <input type="hidden" name="_action" value="promoteWaitlist" />
            <input type="hidden" name="signupId" value="${escHTML(s.id)}" />
            <button type="submit" class="btn btn-success btn-sm">Promote to confirmed</button>
          </form>
          ${removeForm}
        </div>
      `;
    } else if (isVendor) {
      const status = sStatus === 'approved' || sStatus === 'rejected' ? sStatus : 'pending';
      if (status === 'pending') {
        actionPanel = `
          <div class="evs-actions evs-actions-pending">
            <div class="evs-actions-title">Pending review</div>
            <a class="btn btn-success" href="/admin/events/${escHTML(event.id)}/signups?decision=approve&signupId=${encodeURIComponent(s.id)}">Approve</a>
            <a class="btn btn-danger" href="/admin/events/${escHTML(event.id)}/signups?decision=reject&signupId=${encodeURIComponent(s.id)}">Reject</a>
            ${finalistControl}
          </div>
        `;
      } else {
        const who = s.approvedBy ? `<div class="evs-who">${escHTML(s.approvedBy)}</div>` : '';
        const when = s.approvedAt ? `<div class="evs-when">${escHTML(formatFriendlyDate(s.approvedAt))}</div>` : '';
        const reason = s.rejectionReason ? `<div class="evs-reason" title="Rejection note">“${escHTML(s.rejectionReason)}”</div>` : '';
        actionPanel = `
          <div class="evs-actions">
            <div class="evs-actions-title">${status === 'approved' ? 'Approved' : 'Rejected'}</div>
            ${who}${when}${reason}
            ${finalistControl}
            ${status === 'approved' ? checkinBtn : ''}
            ${removeForm}
          </div>
        `;
      }
    } else {
      actionPanel = `
        <div class="evs-actions">
          <div class="evs-actions-title">Manage signup</div>
          ${finalistControl}
          ${checkinBtn}
          ${removeForm}
        </div>
      `;
    }

    return `
      <article class="evs-card" id="signup-${escHTML(s.id)}" data-search="${escHTML(searchText)}" data-status="${escHTML(sStatus)}">
        <div class="evs-card-main">
          <div class="evs-card-head">
            <div>
              <div class="evs-name">${escHTML(s.name || 'Unnamed signup')}</div>
              <div class="evs-sub">Signed up ${escHTML(formatFriendlyDate(s.createdAt))}</div>
            </div>
            <div class="evs-badges">
              ${(isVendor || sType === 'participant' || isWaitlisted) ? statusBadge(s.status) : ''}
              ${s.isFinalist ? '<span class="evs-badge evs-badge-approved" title="Selected to compete in front of judges">★ Finalist</span>' : ''}
              ${checkedIn ? '<span class="evs-badge evs-badge-checkedin">✓ Checked in</span>' : ''}
            </div>
          </div>
          <div class="evs-field-grid">
            <div class="evs-field"><span>Email</span><strong>${s.email ? `<a href="mailto:${escHTML(s.email)}">${escHTML(s.email)}</a>` : '<span class="evs-muted">—</span>'}</strong></div>
            <div class="evs-field"><span>Phone</span><strong>${s.phone ? `<a href="tel:${escHTML(s.phone)}">${escHTML(s.phone)}</a>` : '<span class="evs-muted">—</span>'}</strong></div>
            ${event.collectPartySize ? `<div class="evs-field"><span>Party Size</span><strong>${s.partySize || '<span class="evs-muted">—</span>'}</strong></div>` : ''}
            ${event.collectNotes ? `<div class="evs-field evs-field-wide"><span>Notes</span><strong>${s.notes ? escHTML(s.notes) : '<span class="evs-muted">—</span>'}</strong></div>` : ''}
            ${customFields}
          </div>
        </div>
        ${actionPanel}
      </article>
    `;
  }).join('');

  // Count vendor signups by status for the stats row.
  const pendingCount = isVendor ? signups.filter(s => s.status === 'pending').length : 0;
  const approvedCount = isVendor ? signups.filter(s => s.status === 'approved').length : 0;
  const rejectedCount = isVendor ? signups.filter(s => s.status === 'rejected').length : 0;
  const waitlistCount = signups.filter(s => s.status === 'waitlisted').length;
  const checkedInCount = signups.filter(s => s.checkedInAt).length;
  // Capacity is occupied by everything except waitlisted/rejected signups.
  const confirmedCount = signups.filter(s => s.status !== 'waitlisted' && s.status !== 'rejected').length;

  const capacityText = event.capacity ? ` / ${event.capacity}` : '';
  const remainingSpots = event.capacity ? Math.max(event.capacity - confirmedCount, 0) : null;
  const totalGuests = event.collectPartySize ? signups.reduce((sum, s) => sum + (s.partySize || 1), 0) : null;

  const finalistCount = signups.filter(s => s.isFinalist).length;
  const finalistTarget = Number.isFinite(event.finalistTarget) && event.finalistTarget > 0 ? event.finalistTarget : null;
  const scoredFinalists = signups.filter(s => s.isFinalist && Array.isArray(s.scorecards) && s.scorecards.some(c => c && c.scores && Object.keys(c.scores).length)).length;

  // Judging control strip — only for application-style events. Shows the
  // finalist count, links to the results board, and (once criteria + judges
  // are configured) the shareable judge link + an open/close toggle.
  const judgeBase = process.env.MENUQR_BASE_URL || 'https://menuqr.apps.dramanddraught.com';
  const judgeLink = event.judgeToken ? `${judgeBase}/events/judge/${event.judgeToken}` : null;
  const judgingPanel = supportsFinalists ? `
    <div class="card" style="margin:16px 0; padding:16px;">
      <div style="display:flex; flex-wrap:wrap; gap:16px; align-items:center; justify-content:space-between;">
        <div>
          <div class="admin-kicker">Competition judging ${helpTip('Mark which entrants are finalists using the “Select as finalist” button on each signup below. Then open scoring and share the judge link — judges score finalists on your criteria, and “View results” ranks them.')}</div>
          <div style="font-size:1.2rem; font-weight:800; color:var(--text); margin-top:4px;">
            ${finalistCount}${finalistTarget ? ` / ${finalistTarget}` : ''} finalist${finalistCount === 1 ? '' : 's'} selected
            ${finalistTarget && finalistCount >= finalistTarget ? ' ✓' : ''}
          </div>
          <div class="evs-filter-note" style="margin-top:2px;">
            ${judgingConfigured ? `${scoredFinalists} of ${finalistCount} scored by at least one judge` : 'Set scoring criteria and judges in Edit Event to enable scoring.'}
          </div>
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
          <a href="/admin/events/${escHTML(event.id)}/results" class="btn btn-secondary">View results</a>
          ${judgingConfigured ? `
            <form method="POST" action="/admin/events/${escHTML(event.id)}/signups" style="margin:0;">
              <input type="hidden" name="_action" value="toggleJudging" />
              <button type="submit" class="btn ${event.judgingOpen ? 'btn-danger' : 'btn-success'}">${event.judgingOpen ? 'Close scoring' : 'Open scoring'}</button>
            </form>` : ''}
        </div>
      </div>
      ${judgingConfigured && judgeLink ? `
        <div style="margin-top:12px; padding-top:12px; border-top:1px solid rgba(255,255,255,0.08);">
          <div class="evs-filter-note" style="margin-bottom:6px;">Judge link — share with your ${judges.length} judge${judges.length === 1 ? '' : 's'}. Scoring is <strong style="color:${event.judgingOpen ? '#6ee7b7' : '#fca5a5'};">${event.judgingOpen ? 'OPEN' : 'CLOSED'}</strong>.</div>
          <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
            <input type="text" readonly value="${escHTML(judgeLink)}" onclick="this.select()" style="flex:1; min-width:240px; background:#121417; border:1px solid var(--line); border-radius:8px; padding:10px 12px; color:#cbd5e1; font-family:monospace; font-size:0.82rem;" />
            <button type="button" class="btn btn-secondary btn-sm" onclick="navigator.clipboard.writeText('${escHTML(judgeLink)}').then(()=>{this.textContent='Copied!';setTimeout(()=>{this.textContent='Copy';},1500);})">Copy</button>
          </div>
        </div>` : ''}
    </div>
  ` : '';

  return adminLayout(`${event.title} Signups`, `
    <style>
      .evs-back { color:#888; font-size:0.85rem; text-decoration:none; }
      .evs-back:hover { color:#d4af37; }
      .evs-toolbar { display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap; margin-bottom:16px; }
      .evs-search {
        min-width:260px;
        max-width:420px;
        width:100%;
        background:#121417;
        border:1px solid var(--line);
        border-radius:10px;
        padding:12px 14px;
        color:#eee;
      }
      .evs-filter-note { color:#888; font-size:0.82rem; }
      .evs-empty { padding:40px; text-align:center; color:#666; }
      .evs-empty[hidden] { display:none; }
      .evs-card-list { display:flex; flex-direction:column; gap:12px; }
      .evs-card {
        display:grid;
        grid-template-columns:minmax(0, 1fr) 190px;
        gap:16px;
        align-items:start;
        background:linear-gradient(180deg, rgba(255,255,255,0.035), rgba(255,255,255,0.015)), var(--surface);
        border:1px solid var(--line);
        border-radius:var(--radius);
        padding:16px;
      }
      .evs-card[hidden] { display:none; }
      .evs-card-main { min-width:0; }
      .evs-card-head {
        display:flex;
        align-items:flex-start;
        justify-content:space-between;
        gap:12px;
        padding-bottom:12px;
        margin-bottom:12px;
        border-bottom:1px solid rgba(255,255,255,0.07);
      }
      .evs-name { color:var(--text); font-size:1.06rem; font-weight:850; line-height:1.2; }
      .evs-sub { color:var(--text-muted); font-size:0.8rem; margin-top:3px; }
      .evs-field-grid {
        display:grid;
        grid-template-columns:repeat(2, minmax(0, 1fr));
        gap:10px;
      }
      .evs-field {
        min-width:0;
        padding:10px 12px;
        background:#121417;
        border:1px solid rgba(255,255,255,0.06);
        border-radius:8px;
      }
      .evs-field-wide { grid-column:1 / -1; }
      .evs-field span {
        display:block;
        color:var(--text-soft);
        font-size:0.68rem;
        font-weight:850;
        letter-spacing:0.07em;
        text-transform:uppercase;
        margin-bottom:4px;
      }
      .evs-field strong {
        display:block;
        color:#ded6ca;
        font-size:0.88rem;
        line-height:1.4;
        overflow-wrap:anywhere;
      }
      .evs-muted { color:#68717d !important; font-weight:650; }
      .evs-images { display:flex; gap:6px; flex-wrap:wrap; }
      .evs-images img {
        width:72px;
        height:72px;
        object-fit:cover;
        border-radius:6px;
        border:1px solid var(--line);
        display:block;
      }
      .evs-badge { display:inline-block; padding:4px 10px; border-radius:999px; font-size:0.7rem; font-weight:700; letter-spacing:0.04em; text-transform:uppercase; white-space:nowrap; }
      .evs-badge-pending { background:rgba(251,191,36,0.12); color:#fcd34d; border:1px solid rgba(251,191,36,0.35); }
      .evs-badge-approved { background:rgba(138,168,122,0.14); color:#b9d1a8; border:1px solid rgba(138,168,122,0.4); }
      .evs-badge-waitlist { background:rgba(167,139,250,0.16); color:#c4b5fd; border:1px solid rgba(167,139,250,0.45); }
      .evs-badge-checkedin { background:rgba(52,211,153,0.16); color:#6ee7b7; border:1px solid rgba(52,211,153,0.45); }
      .evs-badges { display:flex; gap:6px; flex-wrap:wrap; align-items:flex-start; }
      .evs-checkin-form { margin:0; }
      .evs-badge-rejected { background:rgba(239,68,68,0.1); color:#fca5a5; border:1px solid rgba(239,68,68,0.3); }
      .evs-filter-tabs { display:flex; gap:6px; flex-wrap:wrap; margin-bottom:16px; }
      .evs-filter-tab { background:#121417; border:1px solid var(--line); color:var(--text-muted); padding:8px 14px; border-radius:999px; font-size:0.8rem; font-weight:700; cursor:pointer; letter-spacing:0.04em; }
      .evs-filter-tab.active { background:var(--gold-strong); color:#111; border-color:var(--gold-strong); }
      .evs-filter-tab:hover { color:#eee; }
      .evs-filter-tab.active:hover { color:#111; }
      .evs-who { color:#aaa; font-size:0.75rem; }
      .evs-when { color:#666; font-size:0.72rem; }
      .evs-reason { color:#fca5a5; font-size:0.78rem; font-style:italic; margin-top:4px; max-width:220px; }
      .evs-actions {
        position:sticky;
        top:88px;
        display:flex;
        flex-direction:column;
        gap:8px;
        padding:12px;
        background:rgba(0,0,0,0.18);
        border:1px solid rgba(255,255,255,0.08);
        border-radius:var(--radius);
      }
      .evs-actions-title {
        color:var(--text-muted);
        font-size:0.72rem;
        font-weight:850;
        text-transform:uppercase;
        letter-spacing:0.08em;
      }
      .evs-actions form { margin:0; }
      .evs-actions .btn { width:100%; }
      .evs-actions-pending {
        border-color:rgba(251,191,36,0.28);
        background:rgba(251,191,36,0.055);
      }
      .btn-success { background:#567a46; color:#fff; border:1px solid #6b9057; }
      .btn-success:hover { background:#6b9057; }
      @media (max-width: 840px) {
        .evs-card { grid-template-columns:1fr; }
        .evs-actions {
          position:static;
          order:-1;
          display:grid;
          grid-template-columns:1fr 1fr;
          align-items:center;
        }
        .evs-actions-title { grid-column:1 / -1; }
      }
      @media (max-width: 560px) {
        .evs-toolbar { align-items:stretch; flex-direction:column; }
        .evs-search { min-width:0; max-width:none; }
        .evs-card { padding:12px; }
        .evs-card-head { flex-direction:column; }
        .evs-field-grid { grid-template-columns:1fr; }
        .evs-actions { grid-template-columns:1fr; }
        .evs-filter-tabs { display:grid; grid-template-columns:1fr 1fr; }
        .evs-filter-tab { width:100%; }
      }
    </style>

    <div class="page-header">
      <div>
        <a href="/admin/events" class="evs-back">← All events</a>
        <div class="admin-kicker" style="margin-top:8px">Signups</div>
        <h1 style="margin:4px 0 0">${escHTML(event.title)}</h1>
        <p class="page-subtitle">
          ${escHTML(event.location?.name || '')} &middot; ${escHTML(formatFriendlyDate(event.startDate))}
        </p>
      </div>
      <div style="display:flex; gap:8px; flex-wrap:wrap">
        <a href="/admin/events/${escHTML(event.id)}" class="btn btn-secondary">Edit Event</a>
        ${signups.length > 0 ? `<a href="/admin/events/${escHTML(event.id)}/signups/export${selected === 'all' ? '?scope=all' : (selected && selected !== currentId ? `?occ=${escHTML(selected)}` : '')}" class="btn btn-primary">Export CSV</a>` : ''}
      </div>
    </div>

    ${occTabs}

    ${judgingPanel}

    <div class="admin-stat-grid">
      <div class="admin-stat">
        <strong>${signups.length}${escHTML(capacityText)}</strong>
        <span>${isVendor ? 'Total Applications' : 'Total Signups'}</span>
      </div>
      ${isVendor ? `
        <div class="admin-stat">
          <strong style="color:#fcd34d">${pendingCount}</strong>
          <span>Pending Review</span>
        </div>
        <div class="admin-stat">
          <strong style="color:#b9d1a8">${approvedCount}</strong>
          <span>Approved</span>
        </div>
        <div class="admin-stat">
          <strong style="color:#fca5a5">${rejectedCount}</strong>
          <span>Rejected</span>
        </div>
      ` : ''}
      ${totalGuests != null ? `
        <div class="admin-stat">
          <strong>${totalGuests}</strong>
          <span>Total Guests</span>
        </div>
      ` : ''}
      ${remainingSpots != null ? `
        <div class="admin-stat">
          <strong>${remainingSpots}</strong>
          <span>${remainingSpots === 0 ? 'Event Full' : 'Spots Remaining'}</span>
        </div>
      ` : ''}
      ${waitlistCount > 0 ? `
        <div class="admin-stat">
          <strong style="color:#c4b5fd">${waitlistCount}</strong>
          <span>On Waitlist</span>
        </div>
      ` : ''}
      ${checkedInCount > 0 ? `
        <div class="admin-stat">
          <strong style="color:#6ee7b7">${checkedInCount}</strong>
          <span>Checked In</span>
        </div>
      ` : ''}
    </div>

    ${(isVendor || waitlistCount > 0) && signups.length > 0 ? `
      <div class="evs-filter-tabs" id="evs-filter-tabs">
        <button type="button" class="evs-filter-tab active" data-filter="all">All (${signups.length})</button>
        ${isVendor ? `<button type="button" class="evs-filter-tab" data-filter="pending">Pending (${pendingCount})</button>` : ''}
        ${isVendor ? `<button type="button" class="evs-filter-tab" data-filter="approved">Approved (${approvedCount})</button>` : ''}
        ${waitlistCount > 0 ? `<button type="button" class="evs-filter-tab" data-filter="waitlisted">Waitlist (${waitlistCount})</button>` : ''}
        ${isVendor ? `<button type="button" class="evs-filter-tab" data-filter="rejected">Rejected (${rejectedCount})</button>` : ''}
      </div>
    ` : ''}

    ${signups.length > 0 ? `
      <div class="evs-toolbar">
        <input type="search" id="evs-search" class="evs-search" placeholder="Search by name, email, phone, notes, or answers" />
        <div id="evs-filter-note" class="evs-filter-note">Showing all ${signups.length} ${isVendor ? 'applications' : 'signups'}</div>
      </div>
    ` : ''}

    ${signups.length === 0 ? `
      <div class="card">
        <div class="evs-empty">
          <p style="font-size:1rem; margin-bottom:6px">No signups yet</p>
          <p style="font-size:0.82rem">Share the event link to start collecting signups.</p>
        </div>
      </div>
    ` : `
      <div class="evs-card-list" id="evs-rows">${rows}</div>
    `}
    <script>
      (function() {
        var search = document.getElementById('evs-search');
        var note = document.getElementById('evs-filter-note');
        var tabs = Array.from(document.querySelectorAll('#evs-filter-tabs .evs-filter-tab'));
        var rows = Array.from(document.querySelectorAll('#evs-rows .evs-card'));
        var noun = ${isVendor ? "'applications'" : "'signups'"};
        if (rows.length === 0) return;
        var currentFilter = 'all';

        function applyFilters() {
          var query = search ? String(search.value || '').trim().toLowerCase() : '';
          var visible = 0;
          rows.forEach(function(row) {
            var haystack = row.getAttribute('data-search') || '';
            var status = row.getAttribute('data-status') || 'approved';
            var matchesSearch = !query || haystack.indexOf(query) !== -1;
            var matchesFilter = currentFilter === 'all' || status === currentFilter;
            var match = matchesSearch && matchesFilter;
            row.hidden = !match;
            if (match) visible++;
          });
          if (note) {
            var isFiltered = query || currentFilter !== 'all';
            note.textContent = isFiltered
              ? 'Showing ' + visible + ' of ' + rows.length + ' ' + noun
              : 'Showing all ' + rows.length + ' ' + noun;
          }
        }

        if (search) search.addEventListener('input', applyFilters);
        tabs.forEach(function(tab) {
          tab.addEventListener('click', function() {
            tabs.forEach(function(t) { t.classList.remove('active'); });
            tab.classList.add('active');
            currentFilter = tab.getAttribute('data-filter') || 'all';
            applyFilters();
          });
        });
      })();
    </script>
  `, user, { pathname: `/admin/events/${event.id}/signups`, flashMsg });
}

function eventSignupDecisionView(event, signup, decision, email, user, flashMsg) {
  const isApprove = decision === 'approve';
  const title = isApprove ? 'Approve Vendor Application' : 'Reject Vendor Application';
  const actionLabel = isApprove ? 'Approve and Send Email' : 'Reject and Send Email';
  const actionClass = isApprove ? 'btn-success' : 'btn-danger';
  const reasonField = !isApprove ? `
    <div class="decision-field">
      <label for="rejectionReason">Saved rejection note</label>
      <textarea id="rejectionReason" name="rejectionReason" rows="3" placeholder="Optional. This is saved on the application record.">${escHTML(signup.rejectionReason || '')}</textarea>
    </div>
  ` : '';
  const applicantDetails = [
    signup.email ? `<div><span>Email</span><strong><a href="mailto:${escHTML(signup.email)}">${escHTML(signup.email)}</a></strong></div>` : '',
    signup.phone ? `<div><span>Phone</span><strong>${escHTML(signup.phone)}</strong></div>` : '',
    signup.partySize ? `<div><span>Party Size</span><strong>${escHTML(signup.partySize)}</strong></div>` : '',
    signup.notes ? `<div class="wide"><span>Notes</span><strong>${escHTML(signup.notes)}</strong></div>` : '',
  ].filter(Boolean).join('');

  return adminLayout(title, `
    <style>
      .decision-wrap { max-width:980px; margin:0 auto; }
      .decision-back { color:#888; font-size:0.85rem; text-decoration:none; }
      .decision-back:hover { color:#d4af37; }
      .decision-card { background:#111; border:1px solid var(--line); border-radius:14px; padding:18px; margin-top:16px; }
      .decision-grid { display:grid; grid-template-columns:0.9fr 1.4fr; gap:18px; align-items:start; }
      .decision-summary { background:#17191d; border:1px solid #2a2d33; border-radius:12px; padding:14px; }
      .decision-summary h2 { margin:0 0 6px; color:#fff; font-size:1.1rem; }
      .decision-summary p { margin:0 0 14px; color:#9ca3af; line-height:1.45; font-size:0.9rem; }
      .decision-facts { display:grid; gap:8px; }
      .decision-facts div { background:#101114; border:1px solid #262a30; border-radius:8px; padding:9px; }
      .decision-facts div.wide { grid-column:1 / -1; }
      .decision-facts span, .decision-field label { display:block; color:#8b949e; font-size:0.72rem; text-transform:uppercase; letter-spacing:0.08em; margin-bottom:5px; font-weight:700; }
      .decision-facts strong { color:#e5e7eb; font-size:0.9rem; word-break:break-word; }
      .decision-form { display:grid; gap:12px; }
      .decision-field input, .decision-field textarea {
        width:100%; background:#0d0f12; color:#f3f4f6; border:1px solid #30343b; border-radius:10px;
        padding:11px 12px; font:inherit; line-height:1.45;
      }
      .decision-field textarea { resize:vertical; min-height:220px; }
      #rejectionReason { min-height:90px; }
      .decision-send-note { color:#9ca3af; font-size:0.84rem; line-height:1.45; margin:0; }
      .decision-actions { display:flex; gap:10px; flex-wrap:wrap; align-items:center; justify-content:flex-end; }
      @media(max-width:780px) {
        .decision-grid { grid-template-columns:1fr; }
        .decision-card { padding:14px; }
        .decision-actions { justify-content:stretch; }
        .decision-actions .btn { width:100%; text-align:center; }
      }
    </style>
    <div class="decision-wrap">
      <a class="decision-back" href="/admin/events/${escHTML(event.id)}/signups">&larr; Back to applications</a>
      <div class="page-header">
        <div>
          <div class="admin-kicker">Vendor decision</div>
          <h1>${escHTML(title)}</h1>
          <p class="page-subtitle">Review and edit the email before the status changes. It will be sent from ${escHTML(user.email || 'the approving admin')} and CC lentz@dramanddraught.com.</p>
        </div>
      </div>
      <div class="decision-card">
        <div class="decision-grid">
          <aside class="decision-summary">
            <h2>${escHTML(signup.name || 'Unnamed applicant')}</h2>
            <p>${escHTML(event.title)} at ${escHTML(event.location?.name || 'Dram & Draught')}</p>
            <div class="decision-facts">${applicantDetails || '<div><span>Details</span><strong>No contact details provided.</strong></div>'}</div>
          </aside>
          <form class="decision-form" method="POST" action="/admin/events/${escHTML(event.id)}/signups">
            <input type="hidden" name="_action" value="sendDecision" />
            <input type="hidden" name="signupId" value="${escHTML(signup.id)}" />
            <input type="hidden" name="decision" value="${escHTML(decision)}" />
            <div class="decision-field">
              <label for="emailSubject">Subject</label>
              <input id="emailSubject" name="emailSubject" value="${escHTML(email.subject || '')}" required />
            </div>
            <div class="decision-field">
              <label for="emailBody">Email body</label>
              <textarea id="emailBody" name="emailBody" required>${escHTML(email.body || '')}</textarea>
            </div>
            ${reasonField}
            <p class="decision-send-note">Nothing is approved or rejected until this email is sent. Add load-in notes, next steps, or any other instructions here.</p>
            <div class="decision-actions">
              <a class="btn btn-secondary" href="/admin/events/${escHTML(event.id)}/signups">Cancel</a>
              <button type="submit" class="btn ${actionClass}">${actionLabel}</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `, user, { pathname: `/admin/events/${event.id}/signups`, flashMsg });
}

module.exports = { eventsList, eventEditor, eventSignupsView, eventSignupDecisionView, eventResultsView, eventQrStudioPage };
