const { vintageThemeCss } = require('./publicTheme');

const { brandMarkCss, renderBrandMark } = require('./brandMark');

const DAYS_ORDER = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
const DAY_SHORT = { MONDAY: 'Mon', TUESDAY: 'Tue', WEDNESDAY: 'Wed', THURSDAY: 'Thu', FRIDAY: 'Fri', SATURDAY: 'Sat', SUNDAY: 'Sun' };
const DAY_LABELS = { MONDAY: 'Monday', TUESDAY: 'Tuesday', WEDNESDAY: 'Wednesday', THURSDAY: 'Thursday', FRIDAY: 'Friday', SATURDAY: 'Saturday', SUNDAY: 'Sunday' };

function getEasternDay() {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
  return { dayOfWeek: days[now.getDay()], dayLabel: DAY_LABELS[days[now.getDay()]], date: now };
}

function getEasternMonth() {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  return { month: now.getMonth() + 1, year: now.getFullYear() };
}

const { escHTML } = require('./escapeHtml');

function groupBySection(specials) {
  const groups = [];
  const map = {};
  for (const s of specials) {
    const key = s.section || '';
    if (!map[key]) {
      map[key] = [];
      groups.push({ section: key, items: map[key] });
    }
    map[key].push(s);
  }
  return groups;
}

function sectionKeyForFilter(section) {
  return String(section || 'all')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function getTodayHours(location, dayOfWeek) {
  if (!location.hours) return null;
  const key = dayOfWeek.toLowerCase();
  return location.hours[key] || null;
}

function formatGuestCharge(priceText) {
  if (!priceText) return null;
  const cleaned = String(priceText).trim().replace(/\s*\/\s*oz\b/i, '').trim();
  if (!cleaned) return null;
  return cleaned.startsWith('$') ? cleaned : `$${cleaned}`;
}

function sanitizeGuestCopy(text) {
  if (!text) return '';
  const cleaned = String(text)
    .replace(/\s*—\s*40\+\s*options\s+available\s+via\s+qr\s*code\.?/gi, '')
    .replace(/\s*-\s*40\+\s*options\s+available\s+via\s+qr\s*code\.?/gi, '')
    .replace(/service\s+industry\s+workers?\s+get\s+special\s+pricing\s+all\s+night\.?/gi, '')
    .replace(/explore\s+our\s+collection\s+of\s+300\+\s+whiskeys\s+with\s+special\s+wed.*?pricing\.?/gi, '')
    .replace(/rotating\s+themed\s+3[- ]pour\s+flights\.?\s+a?\s*guided\s+journey\s+through\s+fine\s+spirits\.?/gi, '')
    .replace(/great\s+deals\s+to\s+kick\s+off\s+the\s+weekend\s+a\s+day\s+early\.?/gi, '')
    .replace(/select\s+bottles\s+sold\s+at\s+cost\s+—\s*check\s+with\s+your\s+bartender\s+for\s+this\s+month['’]s\s+selection\.?/gi, '')
    .replace(/select\s+bottles\s+sold\s+at\s+cost\s+check\s+with\s+your\s+bartender\s+for\s+this\s+month['’]s\s+selection\.?/gi, '')
    .replace(/—+\s*$/, '')
    .replace(/^\s*—+\s*/, '')
    .trim();
  return cleaned.replace(/\s{2,}/g, ' ');
}

function fallbackBottleNoteSections(rawNotes) {
  if (!rawNotes || typeof rawNotes !== 'string') return [];
  return rawNotes
    .replace(/\r/g, '')
    .split(/\n+|;| \| /)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 5)
    .map((part, i) => {
      if (part.includes(':')) {
        const idx = part.indexOf(':');
        return { label: part.slice(0, idx).trim() || `Note ${i + 1}`, text: part.slice(idx + 1).trim() };
      }
      return { label: 'Tasting note', text: part };
    })
    .filter((entry) => entry.text);
}

function renderBottleTastingNotes(bottle) {
  const notes = bottle && bottle.guestNotes ? bottle.guestNotes : null;
  const list = notes && Array.isArray(notes.notes)
    ? notes.notes
    : fallbackBottleNoteSections(bottle && bottle.notes);

  const summary = notes && notes.summary ? notes.summary : 'Tasting notes';
  if (!list.length) return '';

  const rendered = list.map((item) => `
      <li class="bottle-note-item">
        <span class="bottle-note-label">${escHTML(item.label || 'Tasting note')}</span>
        <span class="bottle-note-text">${escHTML(item.text || '')}</span>
      </li>
    `).join('');

  return `
      <div class="bottle-note-block">
        <p class="bottle-note-summary">${escHTML(summary)}</p>
        <ul class="bottle-note-list">
          ${rendered}
        </ul>
      </div>
    `;
}

function makeQuery(day, todayDay) {
  const parts = [];
  if (day && day !== todayDay) parts.push(`day=${day}`);
  return parts.length ? `?${parts.join('&')}` : '';
}

function generateSpecialsPage(location, theme, specials, flight, bottles, viewingDay, tomorrowTheme, fridayFlight, options = {}) {
  const todayDay = getEasternDay().dayOfWeek;
  const activeDay = viewingDay || todayDay;
  const dayLabel = DAY_LABELS[activeDay];
  const isToday = activeDay === todayDay;
  const isFriday = activeDay === 'FRIDAY';
  const isSunday = activeDay === 'SUNDAY';
  const isMonday = activeDay === 'MONDAY';
  const themeTagline = sanitizeGuestCopy(theme && typeof theme.tagline === 'string' ? theme.tagline : '');
  const isIndustryNight = isMonday && theme && /industry night/i.test(theme.name || '');
  const badIndustryTagline = /we take care of our own/i;
  const shouldHideIndustryNightTagline = isIndustryNight && (themeTagline.toLowerCase() === '' || badIndustryTagline.test(themeTagline));
  const displayTagline = shouldHideIndustryNightTagline ? '' : themeTagline;
  const nextAvailable = options.nextAvailable || null;
  const warnings = options.warnings || {};
  const halfPriceSpirits = options.halfPriceSpirits || [];
  const fridayFlights = options.fridayFlights || (flight ? [flight] : []);
  const halfPriceConfig = (theme && theme.halfPriceConfig) || null;
  const hasHalfPrice = halfPriceConfig && halfPriceSpirits.length > 0;
  const halfPriceDiscount = (halfPriceConfig && typeof halfPriceConfig.discount === 'number' && halfPriceConfig.discount > 0 && halfPriceConfig.discount < 100)
    ? halfPriceConfig.discount
    : 50;
  const halfPriceDayLabel = (halfPriceConfig && typeof halfPriceConfig.label === 'string' && halfPriceConfig.label.trim())
    ? halfPriceConfig.label.trim()
    : 'Spirits';
  const themeDescription = sanitizeGuestCopy(theme && typeof theme.description === 'string' ? theme.description : '');
  const hasGiftToYouCopy = /our gift to you/i.test(themeDescription);
  const showGiftToYouSubtitle = isSunday && bottles && bottles.length > 0 && !hasGiftToYouCopy;
  const isSundayBottlesDay = isSunday && (bottles || []).length > 0;
  const breakEvenServingNote = isSundayBottlesDay ? '1 oz per customer so everyone can get a taste.' : '';
  const isBreakEvenSpecial = (s) => /break even/i.test(`${s && (s.name || '')} ${s && (s.section || '')} ${s && (s.description || '')}`);
  const specialsForDisplay = isSundayBottlesDay ? (specials || []).filter((s) => !isBreakEvenSpecial(s)) : (specials || []);
  const showThemeDescInBanner = theme && specialsForDisplay.length > 0;
  const sections = groupBySection(specialsForDisplay);
  const hasSections = sections.some(g => g.section !== '');
  const sectionFilters = [];
  const sectionSeen = new Set();
  for (const sectionGroup of sections) {
    if (!sectionGroup.section) continue;
    const key = sectionKeyForFilter(sectionGroup.section);
    if (!sectionSeen.has(key)) {
      sectionSeen.add(key);
      sectionFilters.push({ label: sectionGroup.section, key });
    }
  }
  const sectionFilterMarkup = sectionFilters.length > 1 ? `
    <div class="filter-chips" role="tablist" aria-label="Filter cocktail categories">
      <button class="filter-chip is-active" data-section-filter="all" type="button">All</button>
      ${sectionFilters.map((filter) => `<button class="filter-chip" data-section-filter="${escHTML(filter.key)}" type="button">${escHTML(filter.label)}</button>`).join('')}
    </div>
  ` : '';

  const spiritListUrl = `/${location.slug}/spirits`;

  // Today's hours
  const todayHours = getTodayHours(location, activeDay);

  // Day navigation tabs
  const dayNav = DAYS_ORDER.map(d => {
    const isCurrent = d === activeDay;
    const isActualToday = d === todayDay;
    const href = `/${location.slug}/specials${makeQuery(d, todayDay)}`;
    return `<a href="${href}" class="day-tab${isCurrent ? ' active' : ''}${isActualToday ? ' today' : ''}" aria-label="View ${DAY_SHORT[d]} specials">${DAY_SHORT[d]}</a>`;
  }).join('');

  // Search + filter controls (hidden on Friday flight night)
  const searchSectionUI = (specialsForDisplay.length && !isFriday) ? `
    <div class="section">
      <div class="section-header">
        <h2>Search this lineup</h2>
      </div>
      <div class="cocktail-search" id="cocktail-search-wrap">
        <input id="cocktail-search-input" type="search" placeholder="Search cocktails, ingredients, or notes" aria-label="Search specials">
        <button id="cocktail-clear-filters" type="button" class="filter-reset">Clear filters</button>
      </div>
      ${sectionFilterMarkup}
      <div id="cocktail-no-results" class="empty-card" style="display: none;">No matches found for that search.</div>
    </div>
  ` : '';

  const renderSpecialCard = (s) => {
    const badgeList = s.badges ? s.badges.split(',').map(b => b.trim()).filter(Boolean) : [];
    const description = sanitizeGuestCopy(s.description || '');
    const detailText = sanitizeGuestCopy(s.detailText || '');
    const timeWindow = sanitizeGuestCopy(s.timeWindow || '');
    const sectionKey = sectionKeyForFilter(s.section || 'uncategorized');
    const searchableText = `${s.name} ${s.description || ''} ${s.detailText || ''} ${s.badges || ''}`.toLowerCase();
    return `
      <div class="deal-card${s.isFeatured ? ' featured' : ''}" data-special-card data-section="${escHTML(sectionKey)}" data-search="${escHTML(searchableText)}">
        <div class="deal-info">
          <div class="deal-name-row">
            <span class="deal-name">${escHTML(s.name)}</span>
            ${badgeList.map(b => `<span class="badge">${escHTML(b)}</span>`).join('')}
          </div>
          ${description ? `<div class="deal-desc">${escHTML(description)}</div>` : ''}
          ${detailText ? `<div class="deal-detail">${escHTML(detailText)}</div>` : ''}
          ${timeWindow ? `<div class="deal-time">${escHTML(timeWindow)}</div>` : ''}
        </div>
        ${s.price ? `<div class="deal-price">${escHTML(s.price)}</div>` : ''}
      </div>
    `;
  };

  let specialsHTML = '';
  if (theme && specialsForDisplay.length > 0) {
    if (hasSections) {
      specialsHTML = sections.map(g => `
        <div class="section" data-special-section="${sectionKeyForFilter(g.section || 'uncategorized')}">
          ${g.section ? `
            <div class="section-header">
              <h2>${escHTML(g.section)}</h2>
            </div>
          ` : `
            <div class="section-header">
              <h2>${isToday ? "Tonight's" : dayLabel + "'s"} Specials</h2>
            </div>
          `}
          ${g.items.map(renderSpecialCard).join('')}
        </div>
      `).join('');
    } else {
    specialsHTML = `
        <div class="section">
          <div class="section-header">
            <h2>${isToday ? "Tonight's" : dayLabel + "'s"} Specials</h2>
          </div>
          ${specialsForDisplay.map(renderSpecialCard).join('')}
        </div>
      `;
    }
  }

  let _flightNoteId = 0;
  // Show flights on either today's specials OR the Friday tab (the day they actually run).
  // Without this, viewing Friday from any other day of the week hides the flight even
  // though it's the headline special for that day.
  const flightSection = ((isToday || isFriday) && fridayFlights.length > 0) ? `
    <div class="section">
      <div class="section-header">
        <h2>${isFriday ? "This Friday's" : 'Featured'} Flight${fridayFlights.length > 1 ? 's' : ''}</h2>
      </div>
      ${fridayFlights.map((f) => {
        const noteBlockId = `specials-flight-notes-${++_flightNoteId}`;
        const priceLabel = isFriday
          ? (f.fridayPriceLabel || f.price)
          : (f.regularPriceLabel || f.price);
        const discountNote = isFriday && f.regularPriceLabel
          ? `<div class="flight-price-regular">Regular ${escHTML(f.regularPriceLabel)} during the week</div>`
          : (!isFriday && f.fridayPriceLabel
            ? `<div class="flight-price-regular">${escHTML(f.fridayPriceLabel)} on Fridays</div>`
            : '');
        return `
        <div class="flight-card" ${fridayFlights.length > 1 ? 'style="margin-bottom: 16px;"' : ''}>
          <div class="flight-theme">${escHTML(f.theme)}</div>
          ${f.description ? `<div class="flight-desc">${escHTML(f.description)}</div>` : ''}
          ${priceLabel ? `
            <div class="flight-price-wrap">
              <div class="flight-price">${escHTML(priceLabel)}</div>
              ${discountNote}
            </div>
          ` : ''}
          <div class="flight-pour-names">${(f.pours || []).sort((a,b) => a.displayOrder - b.displayOrder).map((p) => escHTML(p.spiritName)).join(' &bull; ')}</div>
          <button class="flight-expand-btn" onclick="var el=document.getElementById('${noteBlockId}');var open=el.classList.toggle('flight-notes-open');this.textContent=open?'Hide tasting notes':'See tasting notes';">See tasting notes</button>
          <div class="flight-notes-detail" id="${noteBlockId}">
            <div class="pours">
              ${(f.pours || []).sort((a,b) => a.displayOrder - b.displayOrder).map((p, i) => `
                <div class="pour">
                  <div class="pour-number">${i + 1}</div>
                  <div class="pour-info">
                    <div class="pour-name">${escHTML(p.spiritName)}</div>
                    ${p.description ? `<div class="pour-origin">${escHTML(p.description)}</div>` : ''}
                    ${p.guestNotes || p.tastingNotes
                      ? renderBottleTastingNotes({
                          guestNotes: p.guestNotes || null,
                          notes: p.tastingNotes || '',
                        })
                      : ''}
                    ${p.pourSize ? `<div class="pour-size">${escHTML(p.pourSize)}</div>` : ''}
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      `}).join('')}
    </div>
  ` : '';

  const bottlesSection = isSunday ? (bottles && bottles.length > 0 ? `
    <div class="section">
      <div class="section-header">
        <h2>This Week's Break Even Bottle${bottles.length > 1 ? 's' : ''}</h2>
      </div>
      ${breakEvenServingNote ? `<p class="section-subtitle">Break-even note: ${escHTML(breakEvenServingNote)}</p>` : ''}
      ${showGiftToYouSubtitle ? '<p class="section-subtitle">Select bottles sold at cost &mdash; our gift to you</p>' : ''}
      ${bottles.map(b => `
        <div class="bottle-card">
          <div class="bottle-head">
            <div class="bottle-head-copy">
              <div class="deal-name">${escHTML(b.name)}</div>
            </div>
            ${formatGuestCharge(b.costPerOz) ? `<div class="deal-price">Price: ${escHTML(formatGuestCharge(b.costPerOz))}</div>` : ''}
          </div>
          ${renderBottleTastingNotes(b)}
        </div>
      `).join('')}
    </div>
  ` : `
    <div class="section">
      <div class="section-header">
        <h2>Break Even Bottles</h2>
      </div>
      <div class="bottle-card" style="text-align:center; padding:20px 16px">
        <div class="deal-name" style="margin-bottom:6px">Ask your bartender what this week's break-even bottle is!</div>
        <p style="color:#aaa; font-size:0.9rem; margin:0">Select bottles sold at cost &mdash; our gift to you</p>
      </div>
    </div>
  `) : '';

  // Group half-price spirits by category for compact display
  const halfPriceGrouped = {};
  (halfPriceSpirits || []).forEach(s => {
    const cat = s.primaryCategory || 'Other';
    if (!halfPriceGrouped[cat]) halfPriceGrouped[cat] = [];
    halfPriceGrouped[cat].push(s);
  });
  const halfPriceCatKeys = Object.keys(halfPriceGrouped).sort();

  const halfPriceHeadline = halfPriceDiscount === 50
    ? `Half-Price ${escHTML(halfPriceDayLabel)}`
    : `${halfPriceDiscount}% Off ${escHTML(halfPriceDayLabel)}`;
  const halfPriceSubtitle = halfPriceDiscount === 50
    ? `50% off select spirits &mdash; ${isToday ? 'tonight only' : dayLabel + ' only'}`
    : `${halfPriceDiscount}% off select spirits &mdash; ${isToday ? 'tonight only' : dayLabel + ' only'}`;
  const discountMultiplier = (100 - halfPriceDiscount) / 100;

  const halfPriceSection = hasHalfPrice ? `
    <div class="section">
      <div class="section-header">
        <h2>${halfPriceHeadline}</h2>
      </div>
      <p class="section-subtitle">${halfPriceSubtitle}</p>
      <div class="hp-search-wrap">
        <input id="hp-guest-search" type="search" placeholder="Search ${halfPriceSpirits.length} spirits..." aria-label="Search discounted spirits">
      </div>
      <div id="hp-guest-list">
        ${halfPriceCatKeys.map(cat => {
          const spirits = halfPriceGrouped[cat];
          return `
            <div class="hp-cat-group" data-hp-cat-group>
              <div class="hp-cat-label">${escHTML(cat)} <span class="hp-cat-count">(${spirits.length})</span></div>
              ${spirits.map(s => {
                const origPrice = s.oneOzPrice ? `$${s.oneOzPrice}` : '';
                const discountedPrice = s.oneOzPrice ? `$${(s.oneOzPrice * discountMultiplier).toFixed(0)}` : '';
                return `<div class="hp-spirit-row" data-hp-search="${escHTML(s.name.toLowerCase())}">
                  <span class="hp-spirit-name">${escHTML(s.name)}</span>
                  <span class="hp-spirit-prices">${origPrice ? `<s>${escHTML(origPrice)}</s>` : ''} ${discountedPrice ? `<strong>${escHTML(discountedPrice)}</strong>` : ''}</span>
                </div>`;
              }).join('')}
            </div>
          `;
        }).join('')}
      </div>
      <div id="hp-no-results" class="empty-card" style="display:none">No spirits match that search.</div>
    </div>
  ` : '';

  // Tomorrow preview teaser
  const tomorrowIdx = (DAYS_ORDER.indexOf(activeDay) + 1) % 7;
  const tomorrowDay = DAYS_ORDER[tomorrowIdx];
  const tomorrowTeaser = tomorrowTheme ? `
    <div class="teaser-card">
      <div class="teaser-label">Tomorrow</div>
      <div class="teaser-title">${escHTML(tomorrowTheme.name)}</div>
      ${tomorrowTheme.tagline ? `<div class="teaser-tagline">${escHTML(sanitizeGuestCopy(tomorrowTheme.tagline))}</div>` : ''}
      <a href="/${location.slug}/specials?day=${tomorrowDay}" class="teaser-link">See ${DAY_LABELS[tomorrowDay]}'s specials →</a>
    </div>
  ` : '';

  // Friday flight teaser (non-Friday days, only if no extended flights are already showing)
  const flightTeaser = (!isFriday && fridayFlights.length === 0 && fridayFlight) ? `
    <div class="teaser-card">
      <div class="teaser-label">This Friday</div>
      <div class="teaser-title">Flight Night</div>
      <div class="teaser-tagline">${escHTML(fridayFlight.theme)}</div>
      ${fridayFlight.fridayPriceLabel ? `<div class="teaser-copy" style="margin-top:6px">${escHTML(fridayFlight.fridayPriceLabel)} on Friday${fridayFlight.regularPriceLabel ? ` • ${escHTML(fridayFlight.regularPriceLabel)} during the week` : ''}</div>` : ''}
      <a href="/${location.slug}/specials?day=FRIDAY" class="teaser-link">See Friday's lineup →</a>
    </div>
  ` : '';

  const noSpecialsMessage = !theme ? `
    <div class="section">
      <div class="empty-card">
        ${nextAvailable ? `<p>${nextAvailable.title} is coming ${nextAvailable.dayLabel}.</p>` : `<p>No specials posted for ${dayLabel} yet. Check back soon!</p>`}
        ${nextAvailable ? `<p><a href="/${location.slug}/specials?day=${nextAvailable.dayOfWeek}" class="spirit-link">See ${nextAvailable.dayLabel}'s specials →</a></p>` : ''}
      </div>
    </div>
  ` : '';

  const warningLabels = [
    warnings.specials ? 'specials schedule' : null,
    warnings.flight ? 'Friday flight' : null,
    warnings.bottles ? 'Sunday bottle deals' : null,
    warnings.halfPrice ? 'half-price spirits' : null,
  ].filter(Boolean);

  const dataWarningMessage = warningLabels.length ? `
    <div class="section">
      <div class="warning-card">
        <p>Some sections are temporarily unavailable (${warningLabels.join(', ')}).</p>
        <a href="${spiritListUrl}" class="spirit-link">Browse Our Spirit List →</a>
      </div>
    </div>
  ` : '';

  const isHalfPriceActive = hasHalfPrice;
  const emptyThemeMessage = (theme && specialsForDisplay.length === 0 && !isSundayBottlesDay && !isHalfPriceActive) ? `
    <div class="section">
      <div class="empty-card">
        <p>${escHTML(themeDescription || `No individual specials for ${dayLabel}.`)}</p>
        <a href="${spiritListUrl}" class="spirit-link">Browse Our Spirit List →</a>
      </div>
    </div>
  ` : '';

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${theme ? escHTML(theme.name) : dayLabel + ' Specials'} - Dram & Draught ${escHTML(location.name)}</title>
      <style>
        ${vintageThemeCss()}
        ${brandMarkCss()}
        .header {
          text-align: center;
          padding: 30px 24px 24px;
          max-width: 900px;
          margin: 0 auto;
          position: relative;
          overflow: hidden;
          background:
            linear-gradient(180deg, rgba(24,25,28,0.96), rgba(7,7,8,0.98)),
            radial-gradient(circle at 30% 0%, rgba(255,255,255,0.08), transparent 40%);
          border: 1px solid var(--line);
          border-top: 0;
          border-radius: 0 0 28px 28px;
          box-shadow: 0 22px 58px var(--shadow), inset 0 0 0 1px rgba(255,255,255,0.04);
        }
        .header::before {
          content: '';
          position: absolute;
          inset: 0;
          background:
            repeating-linear-gradient(90deg, rgba(255,255,255,0.03), rgba(255,255,255,0.03) 1px, transparent 1px, transparent 8px),
            repeating-linear-gradient(0deg, rgba(0,0,0,0.06), rgba(0,0,0,0.06) 1px, transparent 1px, transparent 10px);
          opacity: 0.24;
          pointer-events: none;
        }
        .brand {
          width: min(52vw, 360px);
          margin: 0 auto;
        }
        .location-name {
          color: #d3d0cb;
          font-size: 0.84rem;
          text-transform: uppercase;
          letter-spacing: 0.2em;
          margin-top: 12px;
        }
        .day-nav {
          position: sticky;
          top: 10px;
          z-index: 2;
          display: flex;
          gap: 8px;
          padding: 12px 14px;
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
          scrollbar-width: none;
          justify-content: center;
          background: rgba(12, 13, 15, 0.88);
          backdrop-filter: blur(6px);
          border: 1px solid var(--line);
          border-radius: 16px;
          max-width: 880px;
          margin: 12px auto 0;
          box-shadow: 0 12px 28px rgba(0,0,0,0.22);
        }
        .day-nav::-webkit-scrollbar { display: none; }
        .day-tab {
          padding: 8px 12px;
          border-radius: 8px;
          font-size: 0.81rem;
          font-weight: 700;
          color: var(--muted);
          text-decoration: none;
          white-space: nowrap;
          transition: all 0.18s;
          border: 1px solid rgba(255,255,255,0.08);
          background: rgba(255,255,255,0.05);
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .day-tab:hover { color: var(--cream); background: rgba(255,255,255,0.08); }
        .day-tab.active {
          color: var(--ink);
          background: linear-gradient(180deg, var(--accent-light), var(--gold) 64%, var(--amber));
          border-color: rgba(255,255,255,0.12);
          font-weight: 800;
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.38), 0 8px 16px rgba(0,0,0,0.22);
        }
        .day-tab.today:not(.active) {
          border-color: rgba(255,255,255,0.2);
          color: #d3d6db;
        }
        .hours-line {
          text-align: center;
          padding: 10px 16px;
          color: var(--muted);
          font-size: 0.82rem;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 999px;
          max-width: 520px;
          margin: 10px auto 0;
        }
        .hours-line span { color: var(--gold); font-weight: 600; }
        .theme-banner {
          margin: 18px auto 6px;
          max-width: 700px;
          background: linear-gradient(180deg, rgba(20, 21, 24, 0.95), rgba(9, 9, 10, 0.98));
          border: 1px solid var(--line);
          border-radius: 20px;
          padding: 24px 22px 22px;
          text-align: center;
          box-shadow: 0 16px 32px rgba(0,0,0,0.3), inset 0 0 0 1px rgba(255,255,255,0.03);
        }
        .theme-day {
          color: var(--gold);
          font-size: 0.78rem;
          text-transform: uppercase;
          letter-spacing: 0.16em;
          font-weight: 700;
        }
        .today-badge {
          display: inline-block;
          background: var(--accent-soft-strong);
          color: var(--ink);
          font-size: 0.65rem;
          padding: 2px 8px;
          border-radius: 999px;
          margin-left: 8px;
          font-weight: 800;
          letter-spacing: 0.06em;
          vertical-align: middle;
          text-transform: uppercase;
        }
        .theme-name {
          font-size: clamp(1.6rem, 7vw, 2rem);
          font-weight: 800;
          color: var(--cream);
          margin: 8px 0 4px;
        }
        .theme-tagline {
          color: var(--gold);
          font-style: italic;
          font-size: 0.98rem;
        }
        .theme-desc {
          color: var(--muted);
          font-size: 0.92rem;
          margin-top: 8px;
          max-width: 500px;
          margin-left: auto;
          margin-right: auto;
          line-height: 1.55;
        }
        .container { max-width: 760px; margin: 0 auto; padding: 8px 6px 14px; }
        .section { margin: 24px 0; animation: fadeIn .35s ease both; }
        .cocktail-search {
          display: flex;
          gap: 8px;
          align-items: center;
          margin: 2px 0 10px;
        }
        .cocktail-search input {
          flex: 1;
          min-width: 0;
          border: 1px solid rgba(245,232,204,0.14);
          border-radius: 12px;
          background: rgba(255,243,217,0.06);
          color: var(--text);
          padding: 12px 14px;
          font-size: 0.9rem;
          outline: none;
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .cocktail-search input:focus {
          border-color: rgba(255,255,255,0.28);
          box-shadow: 0 0 0 3px rgba(255,255,255,0.12);
        }
        .filter-chips {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          margin-top: 12px;
        }
        .filter-chip {
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: 999px;
          background: rgba(255,255,255,0.05);
          color: #d8dbe0;
          padding: 6px 12px;
          font-size: 0.76rem;
          font-weight: 700;
          letter-spacing: 0.05em;
          cursor: pointer;
          text-transform: uppercase;
        }
        .filter-chip:hover {
          border-color: rgba(255,255,255,0.24);
          color: #fff;
        }
        .filter-chip.is-active {
          border-color: rgba(255,255,255,0.12);
          background: linear-gradient(180deg, var(--accent-light), var(--gold) 64%, var(--amber));
          color: var(--ink);
        }
        .filter-reset {
          white-space: nowrap;
          border: 1px solid rgba(255,255,255,0.18);
          border-radius: 12px;
          background: rgba(255,255,255,0.05);
          color: var(--cream);
          padding: 10px 12px;
          font-size: 0.76rem;
          cursor: pointer;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .filter-reset:hover {
          background: rgba(255,255,255,0.08);
        }
        .filter-reset:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }
        .deal-card.is-hidden {
          display: none !important;
        }
        .section-header {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 12px;
          padding: 0 2px 10px;
          border-bottom: 1px solid rgba(255,255,255,0.08);
        }
        .section-header h2 {
          font-size: 1.02rem;
          color: var(--gold);
          font-weight: 800;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }
        .section-subtitle { color: #9c9486; font-size: 0.84rem; margin: -6px 0 14px 4px; }
        .bottle-card {
          background: linear-gradient(180deg, rgba(20, 21, 24, 0.94), rgba(9, 9, 10, 0.98));
          border: 1px solid var(--line);
          border-radius: 16px;
          padding: 16px;
          margin-bottom: 10px;
          box-shadow: 0 12px 24px rgba(0,0,0,0.24), inset 0 0 0 1px rgba(255,255,255,0.03);
          display: flex;
          flex-direction: column;
          gap: 10px;
          transition: border-color 0.2s, transform 0.2s;
        }
        .bottle-card:hover { border-color: rgba(245,232,204,0.24); transform: translateY(-1px); }
        .bottle-head {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .bottle-head-copy { min-width: 0; flex: 1; }
        .bottle-note-block {
          border-top: 1px solid rgba(245,232,204,0.08);
          padding-top: 10px;
        }
        .bottle-note-summary {
          color: var(--cream);
          font-size: 0.82rem;
          font-weight: 700;
          margin-bottom: 6px;
        }
        .bottle-note-list {
          list-style: none;
          padding: 0;
          margin: 0;
          display: grid;
          gap: 7px;
        }
        .bottle-note-item {
          color: #b8a890;
          font-size: 0.82rem;
          line-height: 1.45;
          display: grid;
          grid-template-columns: auto 1fr;
          gap: 9px;
        }
        .bottle-note-label {
          color: #ceb06e;
          white-space: nowrap;
          text-transform: uppercase;
          font-size: 0.62rem;
          letter-spacing: 0.03em;
          font-weight: 700;
          min-width: 64px;
        }
        .deal-card {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          background: linear-gradient(180deg, rgba(20, 21, 24, 0.94), rgba(9, 9, 10, 0.98));
          border: 1px solid var(--line);
          border-radius: 16px;
          padding: 16px;
          margin-bottom: 10px;
          box-shadow: 0 12px 24px rgba(0,0,0,0.24), inset 0 0 0 1px rgba(255,255,255,0.03);
          transition: border-color 0.2s, transform 0.2s;
        }
        .deal-card:hover { border-color: rgba(245,232,204,0.24); transform: translateY(-1px); }
        .deal-card.featured {
          border-color: rgba(255,255,255,0.24);
          box-shadow: 0 0 18px rgba(255,255,255,0.08);
        }
        .deal-info { min-width: 0; flex: 1; }
        .deal-name-row {
          display: flex;
          align-items: center;
          gap: 7px;
          flex-wrap: wrap;
        }
        .deal-name { font-weight: 700; color: var(--cream); font-size: 1rem; }
        .deal-desc { color: #b8bcc2; font-size: 0.85rem; margin-top: 2px; }
        .deal-detail {
          color: #9fa4ab;
          font-size: 0.82rem;
          margin-top: 6px;
          font-style: italic;
          line-height: 1.5;
        }
        .deal-time {
          color: #d6d9de;
          font-size: 0.82rem;
          margin-top: 4px;
        }
        .deal-price {
          margin-left: auto;
          align-self: flex-start;
          color: var(--gold);
          font-weight: 800;
          font-size: 1.05rem;
          white-space: nowrap;
          border: 1px solid rgba(210, 170, 103, 0.24);
          border-radius: 999px;
          padding: 6px 10px;
          background: rgba(210, 170, 103, 0.08);
        }
        .badge {
          display: inline-block;
          background: linear-gradient(180deg, rgba(255,255,255,0.14), rgba(111,118,127,0.18));
          color: var(--gold);
          font-size: 0.62rem;
          font-weight: 700;
          padding: 3px 8px;
          border-radius: 999px;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .flight-card {
          background: linear-gradient(180deg, rgba(20, 21, 24, 0.95), rgba(9, 9, 10, 0.98));
          border: 1px solid var(--line);
          border-radius: 16px;
          padding: 18px 18px 16px;
          box-shadow: 0 10px 24px rgba(0,0,0,0.24), inset 0 0 0 1px rgba(255,255,255,0.03);
        }
        .flight-theme { font-size: 1.17rem; font-weight: 800; color: var(--cream); margin-bottom: 4px; }
        .flight-desc { color: var(--muted); font-size: 0.88rem; margin-bottom: 8px; }
        .flight-price-wrap { margin-bottom: 16px; }
        .flight-price {
          display: inline-block;
          background: linear-gradient(180deg, var(--accent-light), var(--gold) 64%, var(--amber));
          color: var(--ink);
          font-weight: 800;
          padding: 4px 14px;
          border-radius: 8px;
          font-size: 0.95rem;
        }
        .flight-price-regular { margin-top: 6px; color: var(--muted); font-size: 0.82rem; }
        .flight-pour-names { color: var(--muted); font-size: 0.82rem; margin-bottom: 10px; line-height: 1.5; }
        .flight-expand-btn {
          background: none;
          border: 1px solid rgba(245,232,204,0.18);
          color: var(--gold);
          font-size: 0.78rem;
          font-weight: 600;
          padding: 6px 14px;
          border-radius: 8px;
          cursor: pointer;
          letter-spacing: 0.02em;
          width: 100%;
          margin-bottom: 4px;
        }
        .flight-expand-btn:hover { background: rgba(245,232,204,0.08); }
        .flight-notes-detail { display: none; margin-top: 10px; }
        .flight-notes-detail.flight-notes-open { display: block; }
        .pours { display: flex; flex-direction: column; gap: 10px; }
        .pour {
          display: flex;
          gap: 12px;
          align-items: flex-start;
          background: rgba(255,255,255,0.05);
          border-radius: 8px;
          padding: 12px 12px 12px 14px;
          border: 1px solid rgba(255,255,255,0.08);
        }
        .pour-number {
          width: 26px;
          height: 26px;
          background: linear-gradient(180deg, var(--accent-light), var(--gold) 64%, var(--amber));
          color: var(--ink);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 800;
          font-size: 0.81rem;
          flex-shrink: 0;
        }
        .pour-info { flex: 1; min-width: 0; }
        .pour-name { font-weight: 700; color: var(--cream); }
        .pour-origin { color: var(--gold); font-size: 0.82rem; }
        .pour .bottle-note-block {
          margin-top: 8px;
          padding-top: 8px;
          border-top: 1px solid rgba(245,232,204,0.08);
        }
        .pour .bottle-note-summary {
          font-size: 0.74rem;
          margin-bottom: 5px;
        }
        .pour .bottle-note-item {
          font-size: 0.76rem;
          gap: 7px;
        }
        .pour .bottle-note-label {
          min-width: 54px;
        }
        .pour-size { color: #8d9299; font-size: 0.75rem; margin-top: 2px; }
        .teaser-card {
          background: linear-gradient(180deg, rgba(20, 21, 24, 0.9), rgba(9, 9, 10, 0.95));
          border: 1px solid var(--line);
          border-radius: 16px;
          padding: 14px 16px;
          margin-bottom: 10px;
          text-align: center;
          box-shadow: inset 0 0 16px rgba(0,0,0,0.18);
        }
        .teaser-label {
          font-size: 0.72rem;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          color: #9b9fa5;
          font-weight: 700;
          margin-bottom: 4px;
        }
        .teaser-title {
          font-size: 1.03rem;
          font-weight: 800;
          color: var(--cream);
        }
        .teaser-tagline {
          color: var(--gold);
          font-size: 0.88rem;
          font-style: italic;
          margin-top: 2px;
        }
        .teaser-link {
          display: inline-block;
          margin-top: 8px;
          color: #e5e7eb;
          font-size: 0.82rem;
          font-weight: 600;
          text-decoration: none;
        }
        .teaser-link:hover { text-decoration: underline; }
        .warning-card {
          text-align: center;
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.16);
          border-radius: 16px;
          padding: 16px;
          color: #f0f1f3;
          box-shadow: 0 8px 24px rgba(0,0,0,0.2);
        }
        .warning-card p { margin-bottom: 10px; line-height: 1.5; }
        .empty-card {
          text-align: center;
          background: linear-gradient(180deg, rgba(20, 21, 24, 0.95), rgba(9, 9, 10, 0.98));
          border: 1px solid var(--line);
          border-radius: 16px;
          padding: 32px 20px;
          box-shadow: 0 10px 24px rgba(0,0,0,0.2);
        }
        .empty-card p { color: var(--muted); line-height: 1.5; }
        .spirit-link {
          display: inline-block;
          margin-top: 16px;
          color: var(--ink);
          background: linear-gradient(180deg, var(--accent-light), var(--gold) 64%, var(--amber));
          padding: 10px 22px;
          border-radius: 14px;
          text-decoration: none;
          font-weight: 700;
          font-size: 0.9rem;
          box-shadow: 0 8px 18px rgba(0,0,0,0.28);
          border: 1px solid rgba(255,255,255,0.12);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .spirit-link:hover { filter: brightness(1.05); }
        .spirit-cta {
          display: block;
          text-align: center;
          margin: 24px 0 8px;
          padding: 14px 20px;
          background: linear-gradient(180deg, var(--accent-light), var(--gold) 64%, var(--amber));
          color: var(--ink);
          font-weight: 800;
          font-size: 0.95rem;
          border-radius: 14px;
          text-decoration: none;
          letter-spacing: 0.05em;
          box-shadow: 0 10px 24px rgba(0,0,0,0.3);
          border: 1px solid rgba(255,255,255,0.12);
          text-transform: uppercase;
        }
        .spirit-cta:hover { filter: brightness(1.03); }
        .hp-search-wrap { margin-bottom: 14px; }
        .hp-search-wrap input {
          width: 100%;
          border: 1px solid rgba(255,255,255,0.14);
          border-radius: 12px;
          background: rgba(255,255,255,0.05);
          color: var(--text);
          padding: 12px 14px;
          font-size: 0.9rem;
          outline: none;
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .hp-search-wrap input:focus {
          border-color: rgba(255,255,255,0.28);
          box-shadow: 0 0 0 3px rgba(255,255,255,0.12);
        }
        .hp-cat-group { margin-bottom: 6px; }
        .hp-cat-label {
          color: var(--gold);
          font-size: 0.78rem;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          padding: 10px 4px 5px;
          border-bottom: 1px solid rgba(255,255,255,0.18);
        }
        .hp-cat-count { color: #8d9299; font-weight: 400; }
        .hp-spirit-row {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 4px;
          border-bottom: 1px solid rgba(255,255,255,0.04);
          font-size: 0.88rem;
        }
        .hp-spirit-name { flex: 1; color: var(--text); min-width: 0; }
        .hp-spirit-prices {
          white-space: nowrap;
          text-align: right;
          font-size: 0.85rem;
        }
        .hp-spirit-prices s { color: #8d9299; margin-right: 6px; }
        .hp-spirit-prices strong { color: var(--gold); font-weight: 800; }
        .hp-spirit-row.hp-hidden { display: none; }
        .footer {
          text-align: center;
          padding: 24px 20px 32px;
        }
        .back-link {
          display: inline-block;
          color: var(--muted);
          text-decoration: none;
          font-size: 0.9rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }
        .back-link:hover { color: var(--gold); }
        @media (max-width: 720px) {
          .header {
            padding: 26px 16px 22px;
            border-radius: 0 0 24px 24px;
          }
          .brand {
            width: min(78vw, 340px);
          }
          .day-nav {
            top: 8px;
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr));
            justify-content: stretch;
            overflow: visible;
            padding: 10px;
            gap: 6px;
          }
          .day-tab {
            min-width: 0;
            text-align: center;
            padding: 9px 0;
            font-size: 0.72rem;
            letter-spacing: 0.02em;
          }
          .theme-banner {
            padding: 20px 16px 18px;
            margin-top: 16px;
          }
          .container {
            padding: 6px 2px 12px;
          }
          .cocktail-search {
            flex-direction: column;
          }
          .cocktail-search input,
          .filter-reset {
            width: 100%;
          }
          .deal-card,
          .bottle-card {
            padding: 14px;
          }
          .deal-card {
            flex-direction: column;
          }
          .deal-price {
            margin-left: 0;
            margin-top: 8px;
          }
        }
      </style>
    </head>
    <body>
        <div class="header">
        ${renderBrandMark({ className: 'brand', note: 'Specials' })}
        <div class="location-name">${escHTML(location.name)}</div>
      </div>

      <div class="day-nav">${dayNav}</div>
      ${todayHours ? `<div class="hours-line">Open ${isToday ? 'today' : dayLabel} <span>${escHTML(todayHours)}</span></div>` : ''}
      ${dataWarningMessage}

      ${theme ? `
        ${theme.themeColor && /^#[0-9a-fA-F]{6}$/.test(theme.themeColor) ? `
          <style>
            .theme-banner .theme-tagline { color: ${theme.themeColor}; }
            .theme-banner .theme-day { color: ${theme.themeColor}; }
            .theme-banner { border-color: ${theme.themeColor}40; }
          </style>
        ` : ''}
        <div class="theme-banner">
          <div class="theme-day">${dayLabel}${isToday ? '<span class="today-badge">TODAY</span>' : ''}</div>
          <div class="theme-name">${escHTML(theme.name)}</div>
          ${displayTagline ? `<div class="theme-tagline">${escHTML(displayTagline)}</div>` : ''}
          ${showThemeDescInBanner ? `<div class="theme-desc">${escHTML(themeDescription)}</div>` : ''}
        </div>
      ` : ''}

      <div class="container">
        ${searchSectionUI}
        ${specialsHTML}
        ${emptyThemeMessage}
        ${noSpecialsMessage}
        ${flightSection}
        ${bottlesSection}
        ${halfPriceSection}

        ${tomorrowTeaser || flightTeaser ? `
        <div class="section">
          <div class="section-header">
            <h2>Coming Up</h2>
          </div>
          ${tomorrowTeaser}
          ${flightTeaser}
        </div>
        ` : ''}

        <a href="${spiritListUrl}" class="spirit-cta">Browse Our Full Spirit List →</a>

        <div class="footer">
          <a href="/${location.slug}" class="back-link">← Back to ${escHTML(location.name)}</a>
        </div>
      </div>
      <script>
        (function() {
          const searchInput = document.getElementById('cocktail-search-input');
          const clearFiltersBtn = document.getElementById('cocktail-clear-filters');
          const cards = Array.from(document.querySelectorAll('[data-special-card]'));
          const sections = Array.from(document.querySelectorAll('[data-special-section]'));
          const filters = Array.from(document.querySelectorAll('[data-section-filter]'));
          const noResults = document.getElementById('cocktail-no-results');
          let activeSection = 'all';

          function applyFilters() {
            const query = searchInput ? (searchInput.value || '').trim().toLowerCase() : '';
            let visibleCards = 0;

            cards.forEach((card) => {
              const matchesSection = activeSection === 'all' || card.dataset.section === activeSection;
              const matchesSearch = !query || (card.dataset.search || '').indexOf(query) !== -1;
              const visible = matchesSection && matchesSearch;
              card.classList.toggle('is-hidden', !visible);
              if (visible) visibleCards += 1;
            });

            sections.forEach((section) => {
              const sectionCards = section.querySelectorAll('[data-special-card]');
              const visibleInSection = Array.from(sectionCards).some((card) => !card.classList.contains('is-hidden'));
              section.style.display = visibleInSection ? '' : 'none';
            });

            if (noResults) {
              noResults.style.display = visibleCards > 0 ? 'none' : 'block';
            }

            if (clearFiltersBtn) {
              clearFiltersBtn.disabled = !query;
            }
          }

          function setSectionFilter(filterKey) {
            activeSection = filterKey || 'all';
            filters.forEach((filterBtn) => {
              if ((filterBtn.getAttribute('data-section-filter') || 'all') === activeSection) {
                filterBtn.classList.add('is-active');
                filterBtn.setAttribute('aria-pressed', 'true');
              } else {
                filterBtn.classList.remove('is-active');
                filterBtn.setAttribute('aria-pressed', 'false');
              }
            });
            applyFilters();
          }

          filters.forEach((btn) => {
            btn.addEventListener('click', () => {
              setSectionFilter(btn.getAttribute('data-section-filter'));
            });
          });

          if (searchInput) {
            searchInput.addEventListener('input', applyFilters);
            searchInput.addEventListener('change', applyFilters);
          }

          if (clearFiltersBtn) {
            clearFiltersBtn.addEventListener('click', () => {
              if (searchInput) {
                searchInput.value = '';
              }
              setSectionFilter('all');
            });
          }

          applyFilters();
          setSectionFilter('all');

          // Half-price spirit search
          var hpSearch = document.getElementById('hp-guest-search');
          var hpRows = document.querySelectorAll('.hp-spirit-row');
          var hpGroups = document.querySelectorAll('[data-hp-cat-group]');
          var hpNoResults = document.getElementById('hp-no-results');
          if (hpSearch) {
            hpSearch.addEventListener('input', function() {
              var q = (hpSearch.value || '').toLowerCase().trim();
              var total = 0;
              hpRows.forEach(function(row) {
                var name = row.getAttribute('data-hp-search') || '';
                var match = !q || name.indexOf(q) !== -1;
                row.classList.toggle('hp-hidden', !match);
                if (match) total++;
              });
              hpGroups.forEach(function(g) {
                var visible = g.querySelectorAll('.hp-spirit-row:not(.hp-hidden)');
                g.style.display = visible.length ? '' : 'none';
                var countEl = g.querySelector('.hp-cat-count');
                if (countEl) countEl.textContent = '(' + visible.length + ')';
              });
              if (hpNoResults) hpNoResults.style.display = total > 0 ? 'none' : 'block';
            });
          }
        })();
      </script>
    </body>
    </html>
  `;
}

module.exports = { generateSpecialsPage, getEasternDay, getEasternMonth, DAYS_ORDER };
