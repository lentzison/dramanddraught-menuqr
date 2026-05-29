const querystring = require('querystring');
const fs = require('fs');
const crypto = require('crypto');

let google = null;
let JWT = null;
let hasGoogleApis = false;
try {
  ({ google } = require('googleapis'));
  ({ JWT } = require('google-auth-library'));
  hasGoogleApis = true;
} catch {
  hasGoogleApis = false;
}

const OPENAI_MODEL = process.env.OPENAI_BOTTLE_NOTES_MODEL || 'gpt-4o-mini';
const OPENAI_FEEDBACK_MODEL = process.env.OPENAI_FEEDBACK_MODEL || 'gpt-4o-mini';
const OPENAI_COCKTAIL_IMAGE_MODEL = process.env.OPENAI_COCKTAIL_IMAGE_MODEL || 'gpt-image-1';
const OPENAI_COCKTAIL_IMAGE_SIZE = process.env.OPENAI_COCKTAIL_IMAGE_SIZE || '1024x1024';
const OPENAI_COCKTAIL_IMAGE_STYLE = process.env.OPENAI_COCKTAIL_IMAGE_STYLE || 'natural';
const OPENAI_COCKTAIL_IMAGE_QUALITY = process.env.OPENAI_COCKTAIL_IMAGE_QUALITY || 'standard';
const OPENAI_NOTES_REQUEST_TIMEOUT_MS = parseTimeoutMs(process.env.OPENAI_NOTES_REQUEST_TIMEOUT_MS, 22000);
const OPENAI_FEEDBACK_REQUEST_TIMEOUT_MS = parseTimeoutMs(process.env.OPENAI_FEEDBACK_REQUEST_TIMEOUT_MS, 7000);
const OPENAI_IMAGE_REQUEST_TIMEOUT_MS = parseTimeoutMs(process.env.OPENAI_IMAGE_REQUEST_TIMEOUT_MS, 45000);
const OPENAI_NOTES_RETRY_ATTEMPTS = parsePositiveInt(process.env.OPENAI_NOTES_RETRY_ATTEMPTS, 2, 0, 4);
const OPENAI_NOTES_RETRY_DELAY_MS = parseTimeoutMs(process.env.OPENAI_NOTES_RETRY_DELAY_MS, 900);
const OPENAI_NOTES_MAX_CONCURRENCY = parsePositiveInt(process.env.OPENAI_NOTES_MAX_CONCURRENCY, 1, 1, 6);
const OPENAI_COCKTAIL_IMAGE_TRANSPARENT_BG = (process.env.OPENAI_COCKTAIL_IMAGE_TRANSPARENT_BG || 'true').toLowerCase() === 'true';
const OPENAI_CACHE_MS = 1000 * 60 * 60 * 6; // 6 hours
const OPENAI_DIAGNOSTIC_MAX_DETAIL = 900;
const GOOGLE_HOURS_CACHE_MS = 1000 * 60 * 60 * 4; // 4 hours
const GOOGLE_HOURS_ERROR_CACHE_MS = 1000 * 60 * 15; // 15 minutes
const GOOGLE_REVIEW_URL_BASE = 'https://search.google.com/local/writereview';
const GOOGLE_MAPS_SEARCH_BASE = 'https://www.google.com/maps/search/?api=1&query=';
const GOOGLE_GMAIL_SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send';
const GOOGLE_OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_GMAIL_SEND_ENDPOINT_BASE = 'https://gmail.googleapis.com/gmail/v1/users';
const GOOGLE_TOKEN_CACHE_BUFFER_MS = 3 * 60 * 1000;
const SYSTEM_EMAIL_CC = 'lentz@dramanddraught.com';
const openAiBottleNotesCache = new Map();
const openAiCocktailImageCache = new Map();
const googleHoursCache = new Map();
let gmailClientCache = null;
let gmailAuthError = null;
let googleServiceAccountToken = { token: '', expiresAt: 0 };
let googleServiceAccountTokenError = null;
const openAiDiagnostics = {
  notes: { ok: false, status: 'not_checked', detail: 'Not checked yet.' },
  feedback: { ok: false, status: 'not_checked', detail: 'Not checked yet.' },
  image: { ok: false, status: 'not_checked', detail: 'Not checked yet.' },
};

function summarizeOpenAIDetail(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, OPENAI_DIAGNOSTIC_MAX_DETAIL);
}

function parseTimeoutMs(value, fallback) {
  const parsed = Number.parseInt(String(value || ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.max(1000, parsed);
}

function parsePositiveInt(value, fallback, min = 1, max = Number.MAX_SAFE_INTEGER) {
  const parsed = Number.parseInt(String(value || ''), 10);
  if (!Number.isFinite(parsed) || parsed < min) return fallback;
  return Math.min(max, parsed);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetriableOpenAiError(error, status) {
  const normalizedStatus = Number(status || 0);
  if ([429, 500, 502, 503, 504].includes(normalizedStatus)) return true;
  const message = String(error?.message || '').toLowerCase();
  return (
    message.includes('timeout')
    || message.includes('network')
    || message.includes('econnreset')
    || message.includes('socket')
    || message.includes('fetch failed')
    || message.includes('failed to fetch')
  );
}

function createOpenAiRetryDelayMs(attempt) {
  const base = Math.max(250, OPENAI_NOTES_RETRY_DELAY_MS);
  return Math.min(3000, base * (attempt + 1));
}

async function mapWithConcurrency(items, limit, worker) {
  const output = new Array(items.length);
  let cursor = 0;

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const currentIndex = cursor++;
      if (currentIndex >= items.length) break;
      const item = items[currentIndex];
      output[currentIndex] = await worker(item, currentIndex);
    }
  });

  await Promise.all(workers);
  return output;
}

function toErrorString(err, fallback) {
  if (!err) return fallback;
  const cause = err.cause ? err.cause.message || err.cause : null;
  if (err.message && cause) return `${err.message}; cause: ${cause}`;
  return err.message || fallback;
}

function isUsefulBottleNoteText(text) {
  const normalized = String(text || '').trim();
  if (!normalized) return false;
  if (normalized.length < 8) return false;
  const lower = normalized.toLowerCase();
  if (/^in\s+\d+\s*(ml|l|oz|cl|pt|g|kg)\b/i.test(lower)) return false;
  if (/^\d+\s*(ml|l|oz|cl|pt|g|kg)\b/i.test(lower)) return false;
  if (/^tasting\s+notes?\s+in\s+\d+\s*(ml|l|oz|cl|pt|g|kg)\b/i.test(lower)) return false;
  // Require labeled tasting sections (e.g. "Nose:", "Palate:") or substantial multi-line content;
  // short descriptions like "A well-balanced bourbon..." should use the creative AI prompt instead
  const hasSections = /\b(nose|palate|finish|aroma|body|history)\s*[:\-–]/i.test(normalized);
  if (hasSections) return true;
  // Multi-line or long text with real detail
  const hasMultipleLines = (normalized.match(/\n/g) || []).length >= 2;
  if (hasMultipleLines && normalized.length >= 100) return true;
  return false;
}

function truncateToWordBoundary(text, maxLen, minKeepRatio = 0.65) {
  const sanitized = String(text || '').trim();
  if (!sanitized || sanitized.length <= maxLen) return sanitized;
  const candidate = sanitized.slice(0, Math.max(1, maxLen));
  const cutIndex = candidate.lastIndexOf(' ');
  const minKeep = Math.floor(maxLen * minKeepRatio);
  if (cutIndex >= minKeep) {
    return candidate.slice(0, cutIndex).trim();
  }
  return candidate;
}

function isTrivialNotesEntry(entry) {
  const text = String((entry && entry.text) || '').trim().toLowerCase();
  if (!text) return true;
  if (text.length <= 12) return true;
  if (/^tasting\s+notes?\s+in\b/.test(text)) return true;
  if (/^(in\s+)?\d+\s*(ml|l|oz|cl|pt|g|kg)\b/.test(text)) return true;
  return false;
}

function hasSubstantiveParsedNotes(items) {
  if (!Array.isArray(items) || items.length === 0) return false;
  return items.some((entry) => !isTrivialNotesEntry(entry));
}

function setOpenAiDiagnostic(section, status, detail = null) {
  if (!openAiDiagnostics[section]) return;
  openAiDiagnostics[section] = {
    ok: status === 'ok',
    status,
    detail: summarizeOpenAIDetail(detail),
    at: new Date().toISOString(),
  };
}

function getOpenAiDiagnosticSnapshot() {
  const hasOpenAiKey = Boolean(process.env.OPENAI_API_KEY && String(process.env.OPENAI_API_KEY).trim());
  const openAiKey = hasOpenAiKey ? String(process.env.OPENAI_API_KEY).trim() : '';
  return {
    enabled: hasOpenAiKey && typeof fetch === 'function',
    hasKey: hasOpenAiKey,
    keyPreview: hasOpenAiKey ? `${openAiKey.slice(0, 4)}...${openAiKey.slice(-4)}` : null,
    models: {
      bottleNotes: OPENAI_MODEL,
      feedback: OPENAI_FEEDBACK_MODEL,
      cocktailImage: OPENAI_COCKTAIL_IMAGE_MODEL,
    },
    hasFetch: typeof fetch === 'function',
    channels: {
      notes: { ...openAiDiagnostics.notes },
      feedback: { ...openAiDiagnostics.feedback },
      image: { ...openAiDiagnostics.image },
    },
    timeouts: {
      notes: OPENAI_NOTES_REQUEST_TIMEOUT_MS,
      feedback: OPENAI_FEEDBACK_REQUEST_TIMEOUT_MS,
      image: OPENAI_IMAGE_REQUEST_TIMEOUT_MS,
    },
    retries: {
      notesRetryAttempts: OPENAI_NOTES_RETRY_ATTEMPTS,
      notesRetryDelayMs: OPENAI_NOTES_RETRY_DELAY_MS,
      notesMaxConcurrency: OPENAI_NOTES_MAX_CONCURRENCY,
    },
  };
}

function sendHTML(res, statusCode, html) {
  if (!res || res.writableEnded || res.finished) return;
  if (res.headersSent) {
    try { res.end(); } catch {}
    return;
  }
  res.writeHead(statusCode, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    'Pragma': 'no-cache',
  });
  res.end(html);
}

function sendJSON(res, statusCode, data) {
  if (!res || res.writableEnded || res.finished) return;
  if (res.headersSent) {
    try { res.end(); } catch {}
    return;
  }
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function redirect(res, url) {
  if (!res || res.writableEnded || res.finished) return;
  if (res.headersSent) {
    try { res.end(); } catch {}
    return;
  }
  res.writeHead(302, { Location: url });
  res.end();
}

const WEEKDAY_KEYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
const DAY_LABELS = {
  SUNDAY: 'Sunday',
  MONDAY: 'Monday',
  TUESDAY: 'Tuesday',
  WEDNESDAY: 'Wednesday',
  THURSDAY: 'Thursday',
  FRIDAY: 'Friday',
  SATURDAY: 'Saturday',
};
const GOOGLE_WEEKDAY_TEXT_MAP = {
  sunday: 'sunday',
  monday: 'monday',
  tuesday: 'tuesday',
  wednesday: 'wednesday',
  thursday: 'thursday',
  friday: 'friday',
  saturday: 'saturday',
};
const GOOGLE_DAY_INDEX_TO_KEY = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function normalizeGoogleHoursText(text) {
  return String(text || '')
    .replace(/\u00a0|\u202f|\u2009|\u200a|\u205f|\u3000/g, ' ')
    .replace(/[−–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

// Direct Google review URLs by location slug (using CIDs)
const GOOGLE_REVIEW_URLS = {
  'raleigh': 'https://search.google.com/local/writereview?placeid=ChIJTaD_5GRfrIkRynJ-tfJtZSI',
  'greensboro': 'https://www.google.com/maps?cid=7371053924603763603',
  'winston-salem': 'https://www.google.com/maps?cid=6078974007613483928',
  'durham': 'https://www.google.com/maps?cid=5707873104102207707',
  'cary': 'https://www.google.com/maps?cid=4959704637554130279',
  'charlotte': 'https://www.google.com/maps?cid=7858976320037327007',
  'wilmington': 'https://www.google.com/maps?cid=9929267989488390120',
};

function parseGooglePlaceIdOverrides() {
  const builtInOverrides = {
    'winston': 'ChIJu2rfS46vU4gRmGui8qbaXFQ',
    'winston-salem': 'ChIJu2rfS46vU4gRmGui8qbaXFQ',
  };
  const raw = process.env.GOOGLE_PLACE_ID_OVERRIDES || process.env.GOOGLE_LOCATION_PLACE_IDS || '';
  if (!raw || typeof raw !== 'string') return builtInOverrides;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return builtInOverrides;
    return {
      ...builtInOverrides,
      ...Object.fromEntries(
        Object.entries(parsed)
          .map(([key, value]) => [String(key).toLowerCase().trim(), String(value || '').trim()])
          .filter(([, value]) => Boolean(value)),
      ),
    };
  } catch {
    return builtInOverrides;
  }
}

const googlePlaceIdOverrides = parseGooglePlaceIdOverrides();

function buildGoogleReviewUrl(placeId) {
  if (!placeId || typeof placeId !== 'string') return null;
  return `${GOOGLE_REVIEW_URL_BASE}?placeid=${encodeURIComponent(placeId.trim())}`;
}

function normalizeGoogleCoordinates(raw) {
  if (!raw || raw.lat === undefined || raw.lng === undefined) return null;
  const lat = Number(raw.lat);
  const lng = Number(raw.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function getGoogleApiKey() {
  return (
    process.env.GOOGLE_PLACES_API_KEY ||
    process.env.GOOGLE_MAPS_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    ''
  ).trim();
}

function isGoogleHoursEnabled() {
  return Boolean(getGoogleApiKey()) || Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
}

function getPlaceOverride(location) {
  if (!location) return null;
  const lookupKeys = [];
  if (location.slug) lookupKeys.push(String(location.slug).toLowerCase().trim());
  if (location.id) lookupKeys.push(String(location.id).toLowerCase().trim());
  if (location.name) lookupKeys.push(String(location.name).toLowerCase().trim());
  if (location.name && location.city) lookupKeys.push(`${String(location.name).toLowerCase().trim()}::${String(location.city).toLowerCase().trim()}`);
  for (const key of lookupKeys) {
    if (googlePlaceIdOverrides[key]) return googlePlaceIdOverrides[key];
  }
  return null;
}

function formatGoogleTimeToDisplay(time) {
  if (!time || typeof time !== 'string') return null;
  const match = time.trim().match(/^([01]?\d|2[0-3])([0-5]\d)$/);
  if (!match) return null;
  const hour = parseInt(match[1], 10);
  const minute = match[2];
  const isPm = hour >= 12;
  const hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${hour12}:${minute} ${isPm ? 'PM' : 'AM'}`;
}

function normalizeGoogleWeekdayText(rawText) {
  if (!rawText || !Array.isArray(rawText)) return null;
  const output = {};
  for (const entry of rawText) {
    const raw = String(entry || '').trim();
    if (!raw) continue;
    const match = raw.match(/^([a-z]+)\\s*:\\s*(.+)$/i);
    if (!match) continue;
    const dayRaw = match[1].trim().toLowerCase();
    const day = GOOGLE_WEEKDAY_TEXT_MAP[dayRaw];
    if (!day) continue;
    let text = normalizeGoogleHoursText(match[2]);
    if (/^\\s*closed\\s*$/i.test(text)) {
      text = 'Closed';
    } else if (/open 24 hours/i.test(text)) {
      text = '12:00 AM - 11:59 PM';
    } else if (text.includes(' - ')) {
      text = text.replace(/\\s*-\\s*/g, ' - ');
    }
    output[day] = text;
  }
  return Object.keys(output).length ? output : null;
}

async function fetchGooglePlaceId(location, timeoutMs = 6000) {
  const apiKey = getGoogleApiKey();
  if (!apiKey) return null;
  const query = `${location.name || ''} ${location.address || ''} ${location.city || ''} ${location.state || ''} ${location.zipCode || ''}`.trim();
  if (!query) return null;

  const endpoint = new URL('https://maps.googleapis.com/maps/api/place/findplacefromtext/json');
  endpoint.searchParams.set('input', query);
  endpoint.searchParams.set('inputtype', 'textquery');
  endpoint.searchParams.set('fields', 'place_id');
  endpoint.searchParams.set('key', apiKey);

  try {
    const response = await Promise.race([
      fetch(endpoint.toString()),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Google Places find-place timeout')), timeoutMs)),
    ]);
    if (!response || !response.ok) return null;
    const payload = await response.json().catch(() => null);
    if (!payload || payload.status !== 'OK') return null;
    const first = Array.isArray(payload.candidates) && payload.candidates.length ? payload.candidates[0] : null;
    return first && typeof first.place_id === 'string' ? first.place_id : null;
  } catch {
    return null;
  }
}

async function fetchGoogleHoursFromPlace(placeId, timeoutMs = 6000) {
  const apiKey = getGoogleApiKey();
  if (!apiKey || !placeId) return null;

  const endpoint = new URL('https://maps.googleapis.com/maps/api/place/details/json');
  endpoint.searchParams.set('place_id', placeId);
  endpoint.searchParams.set('fields', 'opening_hours,geometry,place_id');
  endpoint.searchParams.set('key', apiKey);

  try {
    const response = await Promise.race([
      fetch(endpoint.toString()),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Google Places details timeout')), timeoutMs)),
    ]);
    if (!response || !response.ok) return null;
    const payload = await response.json().catch(() => null);
    if (!payload || payload.status !== 'OK') return null;
    const result = payload?.result || {};
    const openingHours = result.opening_hours || {};
    let parsed = normalizeGoogleWeekdayText(openingHours.weekday_text);
    if (!parsed) {
      const periods = Array.isArray(openingHours.periods) ? openingHours.periods : [];
      const byDay = {};
      for (const period of periods) {
        if (!period?.open || period.open.day === undefined || !period.open.time) continue;
        const day = GOOGLE_DAY_INDEX_TO_KEY[Number(period.open.day)];
        if (!day) continue;
        const start = formatGoogleTimeToDisplay(period.open.time);
        const end = period.close && period.close.time ? formatGoogleTimeToDisplay(period.close.time) : null;
        if (!start || !end) continue;
        byDay[day] = `${start} - ${end}`;
      }
      parsed = Object.keys(byDay).length ? byDay : null;
    }
    return {
      hours: parsed,
      coordinates: normalizeGoogleCoordinates(result.geometry && result.geometry.location ? result.geometry.location : null),
      placeId: typeof result.place_id === 'string' ? result.place_id : placeId,
      reviewUrl: buildGoogleReviewUrl(typeof result.place_id === 'string' ? result.place_id : placeId),
    };
  } catch {
    return null;
  }
}

async function getGoogleHoursForLocation(location) {
  if (!location) return null;
  const cacheKey = String(location.id || location.slug || location.name || '').toLowerCase();
  const cached = googleHoursCache.get(cacheKey);
  const now = Date.now();
  if (cached && cached.expires > now) return cached.value;

  const explicitPlaceId = getPlaceOverride(location) || location.googlePlaceId || null;
  const hasApiAccess = isGoogleHoursEnabled();

  if (!hasApiAccess && !explicitPlaceId) {
    googleHoursCache.set(cacheKey, { value: null, expires: now + GOOGLE_HOURS_ERROR_CACHE_MS });
    return null;
  }

  const resolvedPlaceId = explicitPlaceId || (hasApiAccess ? await fetchGooglePlaceId(location).catch(() => null) : null);
  const details = resolvedPlaceId ? await fetchGoogleHoursFromPlace(resolvedPlaceId).catch(() => null) : null;
  const googleData = details || (resolvedPlaceId ? {
    hours: null,
    coordinates: null,
    placeId: resolvedPlaceId,
    reviewUrl: buildGoogleReviewUrl(resolvedPlaceId),
  } : null);
  const ttl = googleData ? GOOGLE_HOURS_CACHE_MS : GOOGLE_HOURS_ERROR_CACHE_MS;
  googleHoursCache.set(cacheKey, {
    value: googleData,
    expires: now + ttl,
  });
  return googleData;
}

function getEasternDate(date = new Date()) {
  return new Date(new Date(date).toLocaleString('en-US', { timeZone: 'America/New_York' }));
}

function parseTimeToMinutes(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return null;
  const cleaned = normalizeGoogleHoursText(timeStr);
  const match = cleaned.match(/^(\\d{1,2})(?::(\\d{2}))?\\s*(am|pm)$/i);
  if (!match) return null;
  let hour = parseInt(match[1], 10);
  const minute = parseInt(match[2] || '0', 10);
  const suffix = match[3].toLowerCase();

  if (hour < 1 || hour > 12 || minute < 0 || minute > 59) return null;
  if (suffix === 'pm' && hour !== 12) hour += 12;
  if (suffix === 'am' && hour === 12) hour = 0;
  return hour * 60 + minute;
}

function splitHoursRange(rawHours) {
  if (!rawHours || typeof rawHours !== 'string') return null;
  if (/^\\s*closed\\s*$/i.test(rawHours)) return { closed: true };
  if (rawHours.toLowerCase().includes('closed')) return null;
  const parts = rawHours.split('-').map((s) => s.trim()).filter(Boolean);
  if (parts.length !== 2) return null;
  const start = parseTimeToMinutes(parts[0].toLowerCase());
  const end = parseTimeToMinutes(parts[1].toLowerCase());
  if (start === null || end === null) return null;
  return { start, end };
}

function getOpenState(location, date = new Date()) {
  const today = getEasternDate(date);
  const dayKey = WEEKDAY_KEYS[today.getDay()]?.toLowerCase();
  const dayLabel = DAY_LABELS[WEEKDAY_KEYS[today.getDay()]];

  const hoursText = location && location.hours && typeof location.hours === 'object'
    ? location.hours[dayKey]
    : null;

  if (!hoursText || typeof hoursText !== 'string') {
    return { isOpen: null, status: 'Hours unavailable', todayHours: null, dayLabel };
  }

  const range = splitHoursRange(hoursText);
  if (range && range.closed) {
    return { isOpen: false, status: 'Closed', todayHours: hoursText, dayLabel };
  }
  if (!range) {
    return { isOpen: null, status: 'Hours unavailable', todayHours: hoursText, dayLabel };
  }

  const nowMinutes = today.getHours() * 60 + today.getMinutes();
  const closesAfterMidnight = range.end <= range.start;
  const isOpen = closesAfterMidnight
    ? (nowMinutes >= range.start || nowMinutes < range.end)
    : (nowMinutes >= range.start && nowMinutes < range.end);

  return {
    isOpen,
    status: isOpen ? 'Open now' : 'Closed',
    todayHours: hoursText,
    dayLabel,
  };
}

function parseBottleNoteSections(rawNotes) {
  if (!rawNotes || typeof rawNotes !== 'string') return [];
  const parts = rawNotes
    .replace(/\r/g, '')
    .split(/\n+|;| \| /)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) return [];

  const normalized = [];
  for (const part of parts) {
    if (part.includes(':')) {
      const idx = part.indexOf(':');
      const label = part.slice(0, idx).trim();
      const text = part.slice(idx + 1).trim();
      if (text) normalized.push({ label, text });
    } else if (part.toLowerCase().startsWith('nose ')) {
      const text = part.replace(/^nose\s*[:\-–]\s*/i, '').trim();
      if (text) normalized.push({ label: 'Nose', text });
    } else if (part.toLowerCase().startsWith('palate ')) {
      const text = part.replace(/^palate\s*[:\-–]\s*/i, '').trim();
      if (text) normalized.push({ label: 'Palate', text });
    } else if (part.toLowerCase().startsWith('finish ')) {
      const text = part.replace(/^finish\s*[:\-–]\s*/i, '').trim();
      if (text) normalized.push({ label: 'Finish', text });
    } else if (part.toLowerCase().startsWith('aroma ')) {
      const text = part.replace(/^aroma\s*[:\-–]\s*/i, '').trim();
      if (text) normalized.push({ label: 'Aroma', text });
    } else {
      normalized.push({ label: 'Tasting note', text: part });
    }
  }

  return normalized.slice(0, 5).map((n, i) => ({
    label: n.label || `Note ${i + 1}`,
    text: n.text,
  }));
}

function buildFallbackBottleNotes(rawBottle) {
  if (!rawBottle || typeof rawBottle !== 'object') return null;
  const name = sanitizeBottleNoteText(rawBottle.name || '', 120);
  const displayName = name || 'This featured bottle';

  const notesHintMap = [
    {
      match: /(stagg|bourbon|rye)/i,
      label: 'Bourbon-style',
      aroma: 'Crisp caramel and vanilla with a warm grain richness.',
      palate: 'Structured vanilla, toasted oak, and soft spice on the mid-palate.',
      finish: 'Drying, warm finish with a gentle chocolate or oak echo.',
      history: 'This week’s featured lineup includes a bourbon-style release. Ask the bartending team for the exact distillery story and batch notes.',
    },
    {
      match: /(rum|cachaca|cachaça)/i,
      label: 'Rum-style',
      aroma: 'Bright sugarcane sweetness and caramel undertones.',
      palate: 'Layered notes of molasses, spice, and ripe fruit.',
      finish: 'Clean, crisp finish with a balanced sweet-spice finish.',
      history: 'This is a house-selected rum entry for the week. Ask the bartender for still-age and origin details.',
    },
    {
      match: /(scotch|whisky|whiskey)/i,
      label: 'Scotch-style',
      aroma: 'Smoky smoke, malt, and subtle honeyed grain character.',
      palate: 'Rich malt depth with peppery or toasted nuance.',
      finish: 'Dry, lingering finish with mild spice and barrel influence.',
      history: 'This featured spirit rotates in weekly. Ask the team for the distillery, age statement, and barrel details.',
    },
    {
      match: /(gin|vodka|tequila|mezcal|mezcal)/i,
      label: 'Spirits-style',
      aroma: 'Bright botanical and grain-led aromatics.',
      palate: 'Balanced floral, spice, and citrus impressions.',
      finish: 'Clean and crisp, with a light, refreshing finish.',
      history: 'This is a rotating weekly feature. Ask your bartender for the exact producer and backstory.',
    },
  ];

  const matchedHint = notesHintMap.find((entry) => entry.match.test(displayName));
  const fallbackHint = matchedHint || {
    label: 'Spirit-style',
    aroma: 'Bright spirit-led aromatics and layered depth.',
    palate: 'Balanced character with a clear finish profile.',
    finish: 'A clean, easy finish suited to easy sipping and cocktails.',
    history: 'This bottle is on a weekly rotation. Ask your bartending team for current release details and background notes.',
  };

  return {
    summary: `Tasting notes for ${displayName}`,
    notes: [
      { label: 'Aroma', text: fallbackHint.aroma },
      { label: 'Palate', text: fallbackHint.palate },
      { label: 'Finish', text: fallbackHint.finish },
      {
        label: 'History',
        text: fallbackHint.history,
      },
    ],
  };
}

function isAiQualityNotes(notesObj) {
  if (!notesObj || !Array.isArray(notesObj.notes)) return false;
  if (notesObj.notes.length < 3) return false;
  const richLabels = ['history', 'aroma', 'nose', 'palate', 'finish', 'body'];
  const matchCount = notesObj.notes.filter((n) =>
    richLabels.includes((n.label || '').toLowerCase())
  ).length;
  return matchCount >= 2;
}

function pickCacheKeyForBottleNotes(bottle) {
  const name = String(bottle.name || '').trim().toLowerCase();
  const size = String(bottle.bottleSize || '').trim().toLowerCase();
  const notes = String(bottle.notes || '').trim().toLowerCase();
  return `${name}|${size}|${notes}`;
}

function sanitizeBottleNoteText(text, maxLen = 220) {
  if (typeof text !== 'string') return '';
  return truncateToWordBoundary(text.trim().replace(/\s+/g, ' '), maxLen);
}

function normalizeAiBottleNotesPayload(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const summary = sanitizeBottleNoteText(payload.summary || payload.blurb || payload.title, 260);
  const rawNotes = Array.isArray(payload.notes) ? payload.notes : [];
  const notes = rawNotes
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const label = sanitizeBottleNoteText(item.label || '', 28);
      const text = sanitizeBottleNoteText(item.text || item.description || '', 360);
      if (!text) return null;
      return { label: label || 'Tasting note', text };
    })
    .filter(Boolean)
    .slice(0, 5);

  if (!summary && notes.length === 0) return null;
  return { summary, notes };
}

function sanitizeEmail(value) {
  return String(value || '').trim();
}

function normalizeEmailAddress(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const withBrackets = raw.match(/<([^<>]+)>/);
  const candidate = withBrackets ? withBrackets[1].trim() : raw;
  return candidate.replace(/^"+|"+$/g, '').trim();
}

function isLikelyValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function normalizeEmailRecipientList(value) {
  if (!value) return [];
  const source = Array.isArray(value) ? value : String(value);
  return Array.from(new Set(
    String(source)
      .split(/[,\n;]+/)
      .map((entry) => normalizeEmailAddress(entry))
      .filter(Boolean)
      .map((entry) => entry.toLowerCase())
      .filter(isLikelyValidEmail),
  ));
}

function resolveFeedbackStaffRecipients({ sender, supportEmails = [] }) {
  const configuredRecipients = normalizeEmailRecipientList(
    process.env.GOOGLE_SUPPORT_ALERT_EMAILS || process.env.FEEDBACK_STAFF_RECIPIENTS || process.env.BAR_SUPPORT_EMAILS || '',
  );
  const senderEmail = normalizeEmailAddress(sender);
  const candidates = [
    ...(isLikelyValidEmail(senderEmail) ? [senderEmail] : []),
    ...Array.isArray(supportEmails) ? supportEmails : [],
    ...configuredRecipients,
  ];

  return Array.from(
    new Set(
      candidates
        .map((entry) => normalizeEmailAddress(entry))
        .filter((entry) => isLikelyValidEmail(entry)),
    ),
  );
}

function buildStaffFeedbackBody(location, rating, guestName, guestEmail, feedbackText, newsletterOptIn = false) {
  const locationName = typeof location === 'string' ? String(location || '').trim() : (location && typeof location === 'object' ? String(location.name || '').trim() : '');
  const locName = locationName || 'Dram & Draught';
  const locCity = typeof location === 'object' && location
    ? String([location.city, location.state].filter(Boolean).join(', ')).trim()
    : '';
  const comment = String(feedbackText || '').trim();
  const guest = String(guestName || 'Anonymous').trim();
  const email = sanitizeEmail(guestEmail);
  const normalizedRating = Number(rating) && Number.isFinite(Number(rating)) ? Number(rating) : 0;

  return [
    `Guest feedback received for ${locName}.`,
    locCity ? `Location: ${locName} (${locCity})` : null,
    `Guest: ${guest}${email ? ` (${email})` : ''}`,
    `Rating: ${normalizedRating}/5`,
    `Newsletter opt-in: ${Boolean(newsletterOptIn) ? 'Yes' : 'No'}`,
    'Guest feedback:',
    comment || 'No details provided.',
  ]
    .filter(Boolean)
    .join('\n');
}

function buildFeedbackFallback(locationName, rating, guestName, guestEmail, feedbackText) {
  const guest = guestName ? `${guestName} (${guestEmail || 'no email provided'})` : (guestEmail || 'anonymous guest');
  const summary = String(feedbackText || '').trim() || 'No details were provided.';
  return {
    subject: `Thanks for your feedback on ${locationName}`,
    body: `Hi ${guestName || 'there'},\n\nThank you for sharing your ${rating}-star feedback for ${locationName}. We really appreciate you taking the time to tell us.\n\nYou shared: ${summary}\n\nWe review every guest note personally and we'll pass this along with the team. Thanks again for helping us improve.\n\nWarmly,\nDram & Draught Team`,
  };
}

function base64url(input) {
  return Buffer.from(input || '').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function parseGoogleServiceAccountKey() {
  let raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY || '';
  if (!raw.trim() && process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH) {
    try {
      raw = fs.readFileSync(process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH, 'utf8');
    } catch (err) {
      console.warn('Failed to read GOOGLE_SERVICE_ACCOUNT_KEY_PATH:', err.message);
      raw = '';
    }
  }
  if (!raw.trim()) return null;

  const trimmedRaw = raw.trim();
  const tryParse = (candidate) => {
    const parsedCandidate = candidate.trim();
    try {
      return JSON.parse(parsedCandidate);
    } catch {
      return null;
    }
  };

  let parsed = null;
  if (/^[A-Za-z0-9+/\n\r =]+$/.test(trimmedRaw) && !trimmedRaw.includes('{')) {
    const decoded = trimmedRaw.replace(/\s+/g, '');
    try {
      const decodedJson = Buffer.from(decoded, 'base64').toString('utf8');
      parsed = tryParse(decodedJson);
      if (!parsed) {
        throw new Error('base64 decode did not parse');
      }
    } catch {
      parsed = null;
    }
  }
  if (!parsed) {
    parsed = tryParse(trimmedRaw);
  }
  if (!parsed || typeof parsed !== 'object') return null;
  try {
    const privateKey = String(parsed.private_key || '')
      .replace(/\r\n/g, '\n')
      .replace(/\\n/g, '\n')
      .trim();
    const clientEmail = String(parsed.client_email || '').trim();
    if (!privateKey || !clientEmail) {
      console.warn('Google service account key is missing required fields.');
      return null;
    }
    return {
      clientEmail,
      privateKey,
      tokenUri: String(parsed.token_uri || GOOGLE_OAUTH_TOKEN_URL).trim(),
    };
  } catch (err) {
    console.warn('Failed to parse GOOGLE_SERVICE_ACCOUNT_KEY JSON:', err.message || String(err));
    return null;
  }
}

function getGoogleServiceAccountSubjectEmail(senderOverride) {
  const requestedSender = sanitizeEmail(senderOverride);
  if (requestedSender) return requestedSender;

  const configuredSender = sanitizeEmail(process.env.GMAIL_SENDER_EMAIL);
  if (configuredSender) return configuredSender;

  const legacySubject = sanitizeEmail(process.env.GOOGLE_SERVICE_ACCOUNT_SUBJECT);
  if (legacySubject) return legacySubject;

  return 'cheers@dramanddraught.com';
}

function buildGmailHeaders({
  from,
  to,
  cc,
  bcc,
  subject,
  html = false,
}) {
  const sanitizeAddress = (value) => String(value || '').replace(/\r|\n/g, ' ').trim();
  const cleanList = (value) => {
    if (!value) return '';
    if (Array.isArray(value)) {
      return value
        .map((entry) => String(entry || '').replace(/\r|\n/g, ' ').trim())
        .filter(Boolean)
        .join(', ');
    }
    if (typeof value === 'string') {
      return value
        .split(',')
        .map((entry) => String(entry || '').replace(/\r|\n/g, ' ').trim())
        .filter(Boolean)
        .join(', ');
    }
    return '';
  };

  const headers = [
    `From: ${sanitizeAddress(from)}`,
    `To: ${cleanList(to)}`,
  ];
  const ccList = cleanList(cc);
  const bccList = cleanList(bcc);
  if (ccList) headers.push(`Cc: ${ccList}`);
  if (bccList) headers.push(`Bcc: ${bccList}`);
  const safeSubject = sanitizeEmail(String(subject || '').trim());
  const encodedSubject = /^[\x00-\x7F]*$/.test(safeSubject)
    ? safeSubject
    : `=?UTF-8?B?${Buffer.from(safeSubject).toString('base64')}?=`;
  if (encodedSubject) headers.push(`Subject: ${encodedSubject}`);
  headers.push('MIME-Version: 1.0');
  const contentType = html ? 'text/html' : 'text/plain';
  headers.push(`Content-Type: ${contentType}; charset="UTF-8"${html ? '' : '; format=flowed'}`);
  headers.push('Content-Transfer-Encoding: 8bit');
  headers.push(`Date: ${new Date().toUTCString()}`);
  return headers;
}

function buildRawGmailMessage({ from, to, cc, bcc, subject, body, html = false, attachments }) {
  if (Array.isArray(attachments) && attachments.length > 0) {
    return buildRawGmailMessageWithAttachments({ from, to, cc, bcc, subject, body, html, attachments });
  }
  const content = String(body || '').trim();
  const headers = buildGmailHeaders({
    from,
    to,
    cc,
    bcc,
    subject,
    html,
  });
  return base64url(`${headers.join('\r\n')}\r\n\r\n${content}`);
}

function buildRawGmailMessageWithAttachments({ from, to, cc, bcc, subject, body, html = false, attachments }) {
  const boundary = '__attachment_boundary_' + Date.now() + '__';
  const sanitizeAddress = (value) => String(value || '').replace(/\r|\n/g, ' ').trim();
  const cleanList = (value) => {
    if (!value) return '';
    if (Array.isArray(value)) return value.map(e => String(e || '').replace(/\r|\n/g, ' ').trim()).filter(Boolean).join(', ');
    return String(value).split(',').map(e => e.trim()).filter(Boolean).join(', ');
  };
  const safeSubject = String(subject || '').replace(/\r|\n/g, ' ').trim();
  const encodedSubject = /^[\x00-\x7F]*$/.test(safeSubject) ? safeSubject : `=?UTF-8?B?${Buffer.from(safeSubject).toString('base64')}?=`;

  const headers = [`From: ${sanitizeAddress(from)}`, `To: ${cleanList(to)}`];
  const ccStr = cleanList(cc);
  const bccStr = cleanList(bcc);
  if (ccStr) headers.push(`Cc: ${ccStr}`);
  if (bccStr) headers.push(`Bcc: ${bccStr}`);
  if (encodedSubject) headers.push(`Subject: ${encodedSubject}`);
  headers.push('MIME-Version: 1.0');
  headers.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
  headers.push(`Date: ${new Date().toUTCString()}`);

  const contentType = html ? 'text/html' : 'text/plain';
  const content = String(body || '').trim();

  let message = headers.join('\r\n') + '\r\n\r\n';
  message += `--${boundary}\r\n`;
  message += `Content-Type: ${contentType}; charset="UTF-8"\r\n`;
  message += 'Content-Transfer-Encoding: 8bit\r\n\r\n';
  message += content + '\r\n';

  for (const att of attachments) {
    const mimeType = att.mimeType || 'application/octet-stream';
    const filename = att.filename || 'attachment';
    const data = att.base64Data || '';
    message += `--${boundary}\r\n`;
    message += `Content-Type: ${mimeType}; name="${filename}"\r\n`;
    message += 'Content-Transfer-Encoding: base64\r\n';
    message += `Content-Disposition: attachment; filename="${filename}"\r\n\r\n`;
    message += data + '\r\n';
  }
  message += `--${boundary}--`;

  return base64url(message);
}

function getGmailClient(senderOverride) {
  const sender = getGoogleServiceAccountSubjectEmail(senderOverride);
  if (!sender) {
    gmailAuthError = {
      code: 'missing_sender',
      detail: 'GMAIL_SENDER_EMAIL is not configured.',
    };
    return { client: null, error: gmailAuthError };
  }

  if (/@(gmail|googlemail)\.com$/i.test(sender)) {
    gmailAuthError = {
      code: 'invalid_sender_domain',
      detail: 'GMAIL_SENDER_EMAIL must be a Google Workspace user for domain-wide delegation.',
    };
    return { client: null, error: gmailAuthError };
  }

  const key = parseGoogleServiceAccountKey();
  if (!key) {
    gmailAuthError = {
      code: 'missing_credentials',
      detail: 'GOOGLE_SERVICE_ACCOUNT_KEY not found or invalid.',
    };
    return { client: null, error: gmailAuthError };
  }

  if (!hasGoogleApis) {
    return { client: null, key, sender, isLegacy: true };
  }

  const cacheKey = `${key.clientEmail}|${sender}`;
  if (gmailClientCache?.cacheKey === cacheKey && gmailClientCache?.client) {
    return { client: gmailClientCache.client };
  }

  try {
    const authClient = new JWT({
      email: key.clientEmail,
      key: key.privateKey,
      subject: sender,
      scopes: [GOOGLE_GMAIL_SEND_SCOPE],
    });
    const client = google.gmail({ version: 'v1', auth: authClient });
    gmailClientCache = { cacheKey, client };
    gmailAuthError = null;
    return { client };
  } catch (err) {
    gmailAuthError = {
      code: 'auth_client_failed',
      detail: String(err.message || '').slice(0, 700),
    };
    console.warn('Failed to build Gmail auth client:', err.message);
    return { client: null, error: gmailAuthError };
  }
}

async function sendEmailViaGoogle({ to, cc, bcc, subject, body, html = false, attachments, from }) {
  const sender = getGoogleServiceAccountSubjectEmail(from);
  const normalizedTo = normalizeEmailRecipientList(to);
  if (!normalizedTo.length) {
    console.warn('Missing recipient for Google email send.');
    return { ok: false, reason: 'missing_recipient' };
  }

  const normalizedCc = Array.from(new Set([
    ...normalizeEmailRecipientList(cc),
    SYSTEM_EMAIL_CC,
  ].filter(Boolean)));
  if (cc && !normalizedCc.length) {
    console.warn('Dropping invalid CC recipient(s) from Google email send.', { cc });
  }

  const normalizedBcc = normalizeEmailRecipientList(bcc);
  if (bcc && !normalizedBcc.length) {
    console.warn('Dropping invalid BCC recipient(s) from Google email send.', { bcc });
  }

  if (!Array.isArray(normalizedTo) || !normalizedTo.every((entry) => isLikelyValidEmail(entry))) {
    console.warn('No valid recipient for Google email send.', { to: normalizedTo });
    return { ok: false, reason: 'invalid_recipient' };
  }

  const { client, key, sender: gmailClientSender, isLegacy, error } = getGmailClient(sender);
  const resolvedSender = normalizeEmailAddress(gmailClientSender || sender);
  if (!isLikelyValidEmail(resolvedSender)) {
    console.warn('Invalid sender configured for Google email send.', { sender: resolvedSender });
    return {
      ok: false,
      reason: 'invalid_sender',
      detail: 'GMAIL_SENDER_EMAIL must be a valid email address.',
    };
  }

  console.warn('Preparing Google API email send.', {
    sender: resolvedSender,
    to: normalizedTo,
    cc: normalizedCc,
    bcc: normalizedBcc,
  });

  if (!client) {
    if (!isLegacy) {
      return {
        ok: false,
        reason: error?.code || 'gmail_auth_failed',
        detail: error?.detail || 'Unable to initialize Gmail auth client.',
      };
    }

    if (resolvedSender && key) {
      return sendEmailViaGmailLegacy({
        to: normalizedTo,
        cc: normalizedCc,
        bcc: normalizedBcc,
        subject,
        body,
        sender: resolvedSender,
        key,
        html,
      });
    }

    return {
      ok: false,
      reason: 'gmail_auth_failed',
      detail: error?.detail || 'Unable to initialize Gmail auth client.',
    };
  }

  const toList = normalizedTo.join(', ');
  const ccList = normalizedCc.join(', ');
  const bccList = normalizedBcc.join(', ');
  const rawMessage = buildRawGmailMessage({
    from: resolvedSender,
    to: toList,
    cc: ccList,
    bcc: bccList,
    subject,
    body,
    html,
    attachments,
  });

  try {
    const response = await client.users.messages.send({
      userId: resolvedSender,
      requestBody: {
        raw: rawMessage,
      },
    });
    return { ok: true, id: response?.data?.id || null };
  } catch (err) {
    const responseStatus = err?.code || err?.response?.status || err?.status;
    const responseBody = err?.response?.data || '';
    const detail = responseBody
      ? (typeof responseBody === 'string' ? responseBody : JSON.stringify(responseBody))
      : String(err.message || '');
    const normalizedDetail = String(detail).toLowerCase();
    const fallbackKey = key || parseGoogleServiceAccountKey();
    const shouldTryLegacy = (
      responseStatus === 400
      && /recipient address required|invalid recipient|bad request/.test(normalizedDetail)
      && fallbackKey
    );
    if (shouldTryLegacy) {
      console.warn('Attempting legacy Gmail send fallback due recipient error:', {
        sender: resolvedSender,
        to: normalizedTo,
        cc: normalizedCc,
        bcc: normalizedBcc,
      });
      const legacyResult = await sendEmailViaGmailLegacy({
        to: normalizedTo,
        cc: normalizedCc,
        bcc: normalizedBcc,
        subject,
        body,
        sender: resolvedSender,
        key: fallbackKey,
        html,
      });
      if (legacyResult?.ok) {
        return legacyResult;
      }
      console.warn('Legacy Gmail send fallback failed:', legacyResult);
    }
      console.warn('Error sending Google email:', err.message, detail);
      const reason = responseStatus === 401 ? 'google_token_failed' : (responseStatus ? `gmail_send_failed_${responseStatus}` : 'gmail_send_error');
      return {
        ok: false,
        reason,
        detail: String(detail).slice(0, 600),
      };
    }
}

async function getGoogleServiceAccountAccessTokenLegacy(key, sender) {
  const subject = getGoogleServiceAccountSubjectEmail(sender);
  const cached = googleServiceAccountToken;
  if (cached.token && cached.expiresAt > Date.now() && cached.subject === subject) {
    return { token: cached.token };
  }
  googleServiceAccountTokenError = null;

  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss: key.clientEmail,
    scope: GOOGLE_GMAIL_SEND_SCOPE,
    aud: key.tokenUri || GOOGLE_OAUTH_TOKEN_URL,
    iat: now,
    exp: now + 3600,
    sub: subject,
  };
  const tokenHeader = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const tokenPayload = base64url(JSON.stringify(claim));
  const tokenToSign = `${tokenHeader}.${tokenPayload}`;

  let signature = '';
  try {
    signature = crypto
      .createSign('RSA-SHA256')
      .update(tokenToSign)
      .end()
      .sign(key.privateKey, 'base64');
  } catch (err) {
    googleServiceAccountTokenError = {
      code: 'jwt_sign_failed',
      detail: String(err.message || '').slice(0, 700),
    };
    return { token: '', error: googleServiceAccountTokenError };
  }

  const signedJwt = `${tokenToSign}.${base64url(Buffer.from(signature, 'base64'))}`;
  const endpoint = key.tokenUri || GOOGLE_OAUTH_TOKEN_URL;
  const form = new URLSearchParams();
  form.set('grant_type', 'urn:ietf:params:oauth:grant-type:jwt-bearer');
  form.set('assertion', signedJwt);

  try {
    const response = await Promise.race([
      fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form.toString(),
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Google token request timeout')), 5000)),
    ]);
    if (!response || !response.ok) {
      const body = await response?.text().catch(() => '');
      let detail = String(body || '').slice(0, 700);
      try {
        const payload = JSON.parse(body);
        if (payload && typeof payload.error === 'string') {
          detail = `${payload.error}: ${payload.error_description || ''}`.trim();
        } else if (payload && payload.error) {
          detail = JSON.stringify(payload.error);
        }
      } catch {
        // keep raw text body
      }
      googleServiceAccountTokenError = {
        code: `token_status_${response?.status || 'network_error'}`,
        detail,
      };
      return { token: '', error: googleServiceAccountTokenError };
    }
    const payload = await response.json();
    const token = String(payload?.access_token || '').trim();
    const expiresIn = Number(payload?.expires_in || 3600);
    if (!token) {
      googleServiceAccountTokenError = {
        code: 'empty_access_token',
        detail: 'Google token endpoint returned no access_token.',
      };
      return { token: '', error: googleServiceAccountTokenError };
    }

    googleServiceAccountToken = {
      token,
      subject,
      expiresAt: Date.now() + Math.max(60_000, (Number.isFinite(expiresIn) ? expiresIn : 3600) * 1000 - GOOGLE_TOKEN_CACHE_BUFFER_MS),
    };
    googleServiceAccountTokenError = null;
    return { token };
  } catch (err) {
    googleServiceAccountTokenError = {
      code: 'token_request_exception',
      detail: String(err.message || '').slice(0, 700),
    };
    return { token: '', error: googleServiceAccountTokenError };
  }
}

async function sendEmailViaGmailLegacy({ to, cc, bcc, subject, body, sender, key, html = false }) {
  const normalizedTo = normalizeEmailRecipientList(to);
  if (!normalizedTo.length) {
    return { ok: false, reason: 'missing_recipient' };
  }
  const normalizedCc = normalizeEmailRecipientList(cc);
  const normalizedBcc = normalizeEmailRecipientList(bcc);

  if (cc && !normalizedCc.length) {
    console.warn('Dropping invalid CC recipient(s) from legacy Google email send.', { cc });
  }
  if (bcc && !normalizedBcc.length) {
    console.warn('Dropping invalid BCC recipient(s) from legacy Google email send.', { bcc });
  }
  if (!normalizedTo.every((entry) => isLikelyValidEmail(entry))) {
    return { ok: false, reason: 'invalid_recipient' };
  }

  const resolvedSender = normalizeEmailAddress(sender);
  if (!isLikelyValidEmail(resolvedSender)) {
    console.warn('Invalid legacy Gmail sender address.', { sender });
    return {
      ok: false,
      reason: 'invalid_sender',
      detail: 'GMAIL_SENDER_EMAIL must be a valid email address.',
    };
  }

  const tokenInfo = await getGoogleServiceAccountAccessTokenLegacy(key, resolvedSender);
  const token = tokenInfo?.token || '';
  if (!token) {
    const fallbackDetail = tokenInfo?.error?.detail || googleServiceAccountTokenError?.detail || null;
    const fallbackCode = tokenInfo?.error?.code || googleServiceAccountTokenError?.code || 'unknown_token_error';
    return {
      ok: false,
      reason: 'google_token_failed',
      detail: fallbackDetail
        ? `${fallbackCode}: ${fallbackDetail}`
        : fallbackCode,
    };
  }

  const toList = normalizedTo.join(', ');
  const ccList = normalizedCc.join(', ');
  const bccList = normalizedBcc.join(', ');
  console.warn('Preparing legacy Google email send.', {
    sender: resolvedSender,
    to: normalizedTo,
    cc: normalizedCc,
    bcc: normalizedBcc,
  });

  const rawMessage = buildRawGmailMessage({
    from: resolvedSender,
    to: toList,
    cc: ccList,
    bcc: bccList,
    subject,
    body,
    html,
  });

  try {
    const response = await Promise.race([
      fetch(`${GOOGLE_GMAIL_SEND_ENDPOINT_BASE}/${encodeURIComponent(resolvedSender)}/messages/send`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ raw: rawMessage }),
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Google Gmail API request timeout')), 8000)),
    ]);

    if (!response || !response.ok) {
      const responseText = await response?.text().catch(() => '');
      return {
        ok: false,
        reason: `gmail_send_failed_${response?.status || 'network_error'}`,
        detail: responseText ? String(responseText).slice(0, 600) : undefined,
      };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      reason: 'gmail_send_error',
      detail: String(err.message || '').slice(0, 600),
    };
  }
}

async function sendFeedbackEmails({
  locationName,
  rating,
  guestName,
  guestEmail,
  feedbackText,
  staffEmails = [],
  newsletterOptIn = false,
}) {
  const normalizedStaff = Array.from(new Set(staffEmails
    .map((entry) => sanitizeEmail(entry))
    .filter((entry) => isLikelyValidEmail(entry))));
  const sender = getGoogleServiceAccountSubjectEmail();
  const safeLocationName = locationName || 'Dram & Draught';
  const safeGuestName = sanitizeEmail(guestName);
  const normalizedGuestEmail = sanitizeEmail(guestEmail);
  const hasGuestEmail = Boolean(normalizedGuestEmail && isLikelyValidEmail(normalizedGuestEmail));

  const reply = hasGuestEmail
    ? await generateFeedbackResponse({
      locationName: safeLocationName,
      rating,
      guestName: safeGuestName,
      guestEmail: normalizedGuestEmail,
      feedback: feedbackText,
    })
    : buildFeedbackFallback(
      safeLocationName,
      rating,
      safeGuestName || 'Guest',
      null,
      feedbackText,
    );

  const userResult = hasGuestEmail
    ? await sendEmailViaGoogle({
      to: normalizedGuestEmail,
      subject: reply.subject,
      body: reply.body,
    })
    : { ok: false, reason: 'missing_recipient' };

  const staffRecipients = resolveFeedbackStaffRecipients({
    sender,
    supportEmails: normalizedStaff,
  });

  const staffResult = staffRecipients.length
    ? await sendEmailViaGoogle({
    to: staffRecipients,
    subject: `Guest feedback received for ${locationName} (${rating}/5)`,
    body: buildStaffFeedbackBody(
      { name: locationName },
      rating,
      guestName,
      guestEmail,
      feedbackText,
      newsletterOptIn,
    ),
    })
    : { ok: false, reason: 'missing_recipient' };

  return {
    reply,
    guestSent: Boolean(userResult?.ok),
    staffSent: Boolean(staffResult?.ok),
    deliveryErrors: {
      guest: userResult?.reason ? {
        code: userResult.reason,
        detail: userResult.detail || null,
      } : null,
      staff: staffResult?.reason ? {
        code: staffResult.reason,
        detail: staffResult.detail || null,
      } : null,
    },
    sender,
  };
}

async function generateFeedbackResponse(payload) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || typeof fetch !== 'function') {
    setOpenAiDiagnostic(
      'feedback',
      !apiKey ? 'missing_api_key' : 'fetch_unavailable',
      'Feedback fallback used because OpenAI runtime is unavailable.',
    );
    return buildFeedbackFallback(
      payload.locationName || 'Dram & Draught',
      payload.rating,
      payload.guestName,
      payload.guestEmail,
      payload.feedback,
    );
  }

  const locationName = String(payload.locationName || 'Dram & Draught').trim();
  const rating = Number(payload.rating || 0);
  const guestName = sanitizeEmail(payload.guestName);
  const guestEmail = sanitizeEmail(payload.guestEmail);
  const feedback = String(payload.feedback || '').trim() || 'No details were provided.';

  try {
    const response = await Promise.race([
      fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: OPENAI_FEEDBACK_MODEL,
          temperature: 0.45,
          max_tokens: 220,
          messages: [
            {
              role: 'system',
              content:
                'You are a guest-experience assistant for Dram & Draught. Write a friendly, human reply to a guest feedback email. '
                + 'Use a warm bar-owner tone, thank them for visiting and giving feedback, acknowledge the specific feedback details, and say the team will review it. '
                + 'Keep it concise, sincere, and personalized to the provided rating and comments. Use no markdown. '
                + 'Always sign off as "Cheers,\nThe Dram & Draught Team" — never use a placeholder like [Your Name].',
            },
            {
              role: 'user',
              content: `Location: ${locationName}
Rating: ${rating}/5
Guest name: ${guestName || 'Guest'}
Guest email: ${guestEmail || 'Not provided'}
Guest feedback: ${feedback}`,
            },
            {
              role: 'user',
              content:
                'Reply in JSON only with keys "subject" and "body".'
                + ' Example: {"subject":"Thanks for your feedback","body":"Hi ..."}',
            },
          ],
        }),
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error(`OpenAI feedback request timeout after ${OPENAI_FEEDBACK_REQUEST_TIMEOUT_MS}ms`)), OPENAI_FEEDBACK_REQUEST_TIMEOUT_MS)),
    ]);

    if (!response || !response.ok) {
      const responseText = response ? (await response.text().catch(() => '')) : '';
      setOpenAiDiagnostic(
        'feedback',
        response ? `http_${response.status}` : 'no_response',
        responseText || 'OpenAI feedback request did not return a valid response.',
      );
      return buildFeedbackFallback(locationName, rating, guestName, guestEmail, feedback);
    }

    const parsed = await response.json();
    const raw = parsed?.choices?.[0]?.message?.content;
    if (!raw || typeof raw !== 'string') {
      setOpenAiDiagnostic('feedback', 'invalid_payload', 'OpenAI feedback response missing message content.');
      return buildFeedbackFallback(locationName, rating, guestName, guestEmail, feedback);
    }

    try {
      const parsedPayload = JSON.parse(raw);
      if (
        parsedPayload
        && typeof parsedPayload === 'object'
        && typeof parsedPayload.subject === 'string'
        && typeof parsedPayload.body === 'string'
      ) {
        setOpenAiDiagnostic('feedback', 'ok', 'Generated JSON content from OpenAI feedback response.');
        return {
          subject: parsedPayload.subject.slice(0, 140).trim() || `Thanks for your feedback on ${locationName}`,
          body: parsedPayload.body.trim(),
        };
      }
    } catch {
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          const parsedPayload = JSON.parse(match[0]);
          if (
            parsedPayload
            && typeof parsedPayload === 'object'
            && typeof parsedPayload.subject === 'string'
            && typeof parsedPayload.body === 'string'
          ) {
            setOpenAiDiagnostic('feedback', 'ok', 'Extracted JSON content from OpenAI feedback response.');
            return {
              subject: parsedPayload.subject.slice(0, 140).trim() || `Thanks for your feedback on ${locationName}`,
              body: parsedPayload.body.trim(),
            };
          }
        } catch {
          setOpenAiDiagnostic('feedback', 'parse_failed', 'OpenAI feedback extraction parse failed.');
          return buildFeedbackFallback(locationName, rating, guestName, guestEmail, feedback);
        }
      }
      setOpenAiDiagnostic('feedback', 'parse_failed', 'No valid JSON payload found in OpenAI feedback response.');
      return buildFeedbackFallback(locationName, rating, guestName, guestEmail, feedback);
    }
  } catch (err) {
    setOpenAiDiagnostic('feedback', 'request_failed', err?.message || 'OpenAI feedback request failed.');
    return buildFeedbackFallback(locationName, rating, guestName, guestEmail, feedback);
  }

  setOpenAiDiagnostic('feedback', 'fallback', 'Feedback fallback used after parsing path.');
  return buildFeedbackFallback(locationName, rating, guestName, guestEmail, feedback);
}

function buildFeedbackMailto({ name, email, subject, body }) {
  const recipient = sanitizeEmail(email);
  const safeSubject = encodeURIComponent(String(subject || '').trim().slice(0, 140));
  const safeBody = encodeURIComponent(String(body || '').trim());
  return recipient ? `mailto:${recipient}?subject=${safeSubject}&body=${safeBody}` : '';
}

function getFeedbackFromAddress() {
  return sanitizeEmail(process.env.GMAIL_SENDER_EMAIL || 'cheers@dramanddraught.com');
}

async function fetchAiBottleNotes(rawBottle) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || typeof fetch !== 'function' || !rawBottle || typeof rawBottle !== 'object') {
    setOpenAiDiagnostic(
      'notes',
      !apiKey ? 'missing_api_key' : (typeof fetch !== 'function' ? 'fetch_unavailable' : 'invalid_input'),
      'Bottle note AI enhancement unavailable in runtime.',
    );
    return null;
  }

  const promptPayload = {
    bottleName: String(rawBottle.name || '').trim(),
    bottleSize: String(rawBottle.bottleSize || '').trim(),
    cost: String(rawBottle.costPerOz || '').trim(),
    notes: String(rawBottle.notes || '').trim(),
  };
  const hasSourceNotes = isUsefulBottleNoteText(promptPayload.notes);
  const systemPrompt = hasSourceNotes
    ? 'You are a copy editor for a high-end cocktail bar menu. Rewrite tasting notes for restaurant guests in a concise, accurate, and enticing way.'
      + ' Keep all concrete details from the source notes and do not invent claims. Include a brief history note if possible.'
      + ' Return strict JSON with keys summary and notes.'
      + ' notes should be an array of objects with label and text. label should be one of: History, Aroma, Nose, Palate, Finish, Body, Impressions, Tasting note.'
    : 'You are a copy editor for a high-end cocktail bar menu. Create guest-friendly tasting notes for this bottle using known naming conventions only.'
      + ' Include a concise history note for the bottle line (if possible) and a tasting note section. Do not invent verifiable facts; if details are uncertain, keep it general and honest.'
      + ' Return strict JSON with keys summary and notes.'
      + ' notes should be an array of objects with label and text. label should be one of: History, Aroma, Nose, Palate, Finish, Body, Impressions, Tasting note.';

  const maxAttempts = 1 + OPENAI_NOTES_RETRY_ATTEMPTS;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await Promise.race([
        fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: OPENAI_MODEL,
            temperature: 0.2,
            max_tokens: 500,
            messages: [
              {
                role: 'system',
                content: systemPrompt,
              },
              {
                role: 'user',
                content: `Input bottle data: ${JSON.stringify(promptPayload)}`,
              },
              {
                role: 'user',
                content: 'Return only JSON no markdown. Example: {"summary":"...","notes":[{"label":"Nose","text":"..."}]}',
              },
            ],
          }),
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error(`OpenAI request timeout after ${OPENAI_NOTES_REQUEST_TIMEOUT_MS}ms`)), OPENAI_NOTES_REQUEST_TIMEOUT_MS)),
      ]);

      if (!response || !response.ok) {
        const responseText = response ? (await response.text().catch(() => '')) : '';
        const status = Number(response?.status || 0);
        const retriable = isRetriableOpenAiError(null, status);
        if (retriable && attempt < maxAttempts) {
          setOpenAiDiagnostic(
            'notes',
            `http_${status}_retry_${attempt}`,
            `OpenAI request received HTTP ${status}. Retrying...`,
          );
          await sleep(createOpenAiRetryDelayMs(attempt));
          continue;
        }
        setOpenAiDiagnostic(
          'notes',
          response ? `http_${response.status}` : 'no_response',
          responseText || 'OpenAI completion request did not return a valid response.',
        );
        return null;
      }

      const parsed = await response.json();
      const raw = parsed?.choices?.[0]?.message?.content;
      if (!raw || typeof raw !== 'string') {
        setOpenAiDiagnostic('notes', 'invalid_payload', 'OpenAI completion response missing message content.');
        return null;
      }

      try {
        const parsedPayload = normalizeAiBottleNotesPayload(JSON.parse(raw));
        if (!parsedPayload) {
          setOpenAiDiagnostic('notes', 'parse_failed', 'OpenAI JSON payload could not be normalized.');
          return null;
        }
        setOpenAiDiagnostic('notes', 'ok', 'Bottle notes generated successfully from OpenAI.');
        return parsedPayload;
      } catch {
        const firstObject = raw.match(/\{[\s\S]*\}/);
        if (firstObject) {
          try {
            const parsedPayload = normalizeAiBottleNotesPayload(JSON.parse(firstObject[0]));
            if (!parsedPayload) {
              setOpenAiDiagnostic('notes', 'parse_failed', 'OpenAI JSON payload could not be normalized after extraction.');
              return null;
            }
            setOpenAiDiagnostic('notes', 'ok', 'Bottle notes generated from extracted OpenAI JSON.');
            return parsedPayload;
          } catch {
            setOpenAiDiagnostic('notes', 'parse_failed', 'OpenAI JSON payload extraction parse failed.');
            return null;
          }
        }
        setOpenAiDiagnostic('notes', 'parse_failed', 'No JSON payload found in OpenAI completion response.');
        return null;
      }
    } catch (err) {
      const detail = toErrorString(err, 'OpenAI request failed.');
      const retriable = isRetriableOpenAiError(err, null);
      if (retriable && attempt < maxAttempts) {
        setOpenAiDiagnostic(
          'notes',
          `request_failed_retry_${attempt}`,
          `OpenAI attempt ${attempt} failed: ${detail}. Retrying...`,
        );
        await sleep(createOpenAiRetryDelayMs(attempt));
        continue;
      }
      console.warn('OpenAI enhancement failed:', detail);
      setOpenAiDiagnostic('notes', 'request_failed', detail);
      return null;
    }
  }

  return null;
}

function normalizeCocktailPrompt(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9,.'\\-\\s]/gi, '')
    .replace(/\\s+/g, ' ')
    .trim();
}

function buildCocktailImagePrompt(special) {
  const name = sanitizeBottleNoteText(special?.name || '', 120);
  const category = sanitizeBottleNoteText(special?.category || '', 50);
  const section = sanitizeBottleNoteText(special?.section || '', 60);
  const description = sanitizeBottleNoteText(special?.description || '', 200);
  const detailText = sanitizeBottleNoteText(special?.detailText || '', 200);
  const flavorParts = [description, detailText].filter(Boolean).join(' ');
  const detailLine = normalizeCocktailPrompt(flavorParts).slice(0, 200);
  const transparentInstruction = OPENAI_COCKTAIL_IMAGE_TRANSPARENT_BG
    ? 'Place the drink on a fully transparent background.'
    : 'Use a simple dark, muted background.';

  return (
    `Create a very simple, hand-drawn cocktail icon for: ${name}. `
    + `${category ? `Category: ${category}. ` : ''}`
    + `${section ? `Theme: ${section}. ` : ''}`
    + `${detailLine ? `Ingredient/style references: ${detailLine}. ` : ''}`
    + 'Use a minimal line-art + flat color illustration, as if drawn by hand. '
    + 'Only one centered drink and optional garnish should appear, clean, balanced, and isolated. '
    + 'Keep the design very simple, icon-like, and easy to recognize. '
    + 'No photo realism, no textures, no gradients, no bokeh, no reflections, no extra props, no bars/people. '
    + `${transparentInstruction} `
    + 'No text overlays, no logos, no watermarks, no QR codes, no menus, no people, no hands.'
  );
}

function normalizeCocktailImageCacheKey(special) {
  const name = normalizeCocktailPrompt(special?.name || '');
  const description = normalizeCocktailPrompt(special?.description || '');
  const detailText = normalizeCocktailPrompt(special?.detailText || '');
  return `${name}|${description}|${detailText}`;
}

function mapOpenAIImageResponse(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const first = payload.data && payload.data[0];
  if (!first || typeof first !== 'object') return null;
  if (typeof first.b64_json === 'string') return `data:image/png;base64,${first.b64_json}`;
  if (typeof first.url === 'string') return first.url;
  return null;
}

async function fetchCocktailImage(special, timeoutMs = 45000) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || typeof fetch !== 'function') {
    setOpenAiDiagnostic(
      'image',
      !apiKey ? 'missing_api_key' : 'fetch_unavailable',
      'OpenAI image generation unavailable in runtime.',
    );
    return null;
  }
  if (!special || !special.name) return null;

  const requestBody = {
    model: OPENAI_COCKTAIL_IMAGE_MODEL,
    prompt: buildCocktailImagePrompt(special),
    n: 1,
    size: OPENAI_COCKTAIL_IMAGE_SIZE,
  };

  if (OPENAI_COCKTAIL_IMAGE_TRANSPARENT_BG && OPENAI_COCKTAIL_IMAGE_MODEL === 'gpt-image-1') {
    requestBody.background = 'transparent';
  }

  if (OPENAI_COCKTAIL_IMAGE_MODEL === 'dall-e-3') {
    requestBody.style = OPENAI_COCKTAIL_IMAGE_STYLE;
    requestBody.quality = OPENAI_COCKTAIL_IMAGE_QUALITY;
  }

  try {
    const response = await Promise.race([
      fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error(`OpenAI image request timeout after ${timeoutMs}ms`)), timeoutMs)),
    ]);

    if (!response || !response.ok) {
      const responseText = response ? (await response.text().catch(() => '')) : '';
      setOpenAiDiagnostic(
        'image',
        response ? `http_${response.status}` : 'no_response',
        responseText || 'OpenAI image generation request did not return a valid response.',
      );
      return null;
    }
    const parsed = await response.json();
    const imageResult = mapOpenAIImageResponse(parsed);
    setOpenAiDiagnostic(
      'image',
      imageResult ? 'ok' : 'invalid_payload',
      imageResult ? 'Image generated successfully.' : 'OpenAI image response missing supported payload.',
    );
    return imageResult;
  } catch (err) {
    console.warn('OpenAI image generation failed:', err.message);
    setOpenAiDiagnostic('image', 'request_failed', err?.message || 'OpenAI image request failed.');
    return null;
  }
}

async function generateCocktailImage(special) {
  if (!special || !special.name) return null;
  const cacheKey = normalizeCocktailImageCacheKey(special);
  const cached = openAiCocktailImageCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.value;

  const imageUrl = await fetchCocktailImage(special);
  openAiCocktailImageCache.set(cacheKey, {
    value: imageUrl,
    expires: Date.now() + (1000 * 60 * 60),
  });

  return imageUrl;
}

async function enhanceBottleNotes(rawBottle) {
  const cacheKey = pickCacheKeyForBottleNotes(rawBottle);
  if (!cacheKey) return null;

  // 1. Check in-memory cache (fast path)
  const cached = openAiBottleNotesCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    // Skip low-quality cached notes when AI is available so we can regenerate
    if (!process.env.OPENAI_API_KEY || isAiQualityNotes(cached.value)) {
      return cached.value;
    }
  }

  // 2. Check DB cache (survives restarts)
  try {
    const prisma = require('./db');
    const dbCached = await prisma.bottleNotesCache.findUnique({ where: { cacheKey } });
    if (dbCached && dbCached.notesJson) {
      const parsed = JSON.parse(dbCached.notesJson);
      if (parsed && parsed.notes) {
        // If AI is available and cached notes are low-quality (non-AI), skip cache to retry AI
        if (process.env.OPENAI_API_KEY && !isAiQualityNotes(parsed)) {
          // fall through to AI call
        } else {
          openAiBottleNotesCache.set(cacheKey, { value: parsed, expires: Date.now() + OPENAI_CACHE_MS });
          return parsed;
        }
      }
    }
  } catch (err) {
    // DB cache miss or error — continue to AI
  }

  // 3. Call AI
  const ai = await fetchAiBottleNotes(rawBottle);
  if (ai && ai.notes) {
    // Save to both caches
    openAiBottleNotesCache.set(cacheKey, { value: ai, expires: Date.now() + OPENAI_CACHE_MS });
    try {
      const prisma = require('./db');
      await prisma.bottleNotesCache.upsert({
        where: { cacheKey },
        update: { notesJson: JSON.stringify(ai) },
        create: { cacheKey, notesJson: JSON.stringify(ai) },
      });
    } catch (err) {
      // DB write failed — in-memory cache still works
    }
    return ai;
  }

  // 4. Fallback: parse existing notes from source
  const parsedNotes = parseBottleNoteSections(rawBottle && rawBottle.notes);
  if (parsedNotes.length > 0 && hasSubstantiveParsedNotes(parsedNotes)) {
    const value = { summary: 'Tasting notes', notes: parsedNotes };
    openAiBottleNotesCache.set(cacheKey, { value, expires: Date.now() + OPENAI_CACHE_MS });
    try {
      const prisma = require('./db');
      await prisma.bottleNotesCache.upsert({
        where: { cacheKey },
        update: { notesJson: JSON.stringify(value) },
        create: { cacheKey, notesJson: JSON.stringify(value) },
      });
    } catch (err) { /* ignore */ }
    return value;
  }

  // 5. Heuristic fallback
  const fallback = buildFallbackBottleNotes(rawBottle);
  const finalValue = fallback || null;

  openAiBottleNotesCache.set(cacheKey, {
    value: finalValue,
    expires: Date.now() + OPENAI_CACHE_MS,
  });

  return finalValue;
}

function getTodayHours(location, dayOfWeek) {
  if (!location || !location.hours || !dayOfWeek) return null;
  if (!WEEKDAY_KEYS.includes(dayOfWeek)) return null;
  return location.hours[dayOfWeek.toLowerCase()] || null;
}

function getDayLabel(dayOfWeek) {
  return DAY_LABELS[dayOfWeek] || dayOfWeek;
}

function normalizeLinkItems(rawLinks) {
  if (!Array.isArray(rawLinks)) return [];
  return rawLinks
    .filter((link) => link && typeof link === 'object')
    .map((link) => ({
      label: String(link.label || '').trim(),
      url: String(link.url || '').trim(),
      target: link.target === '_blank' ? '_blank' : '_self',
    }))
    .filter((link) => link.label && link.url);
}

function uniqueLinks(links) {
  const seen = new Set();
  const output = [];
  for (const link of links) {
    const key = `${String(link.label || '').toLowerCase()}::${String(link.url || '').toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(link);
  }
  return output;
}

function getDefaultLinks(location) {
  const loc = location || {};
  const slug = String(loc.slug || '').toLowerCase();
  const spiritUrl = slug ? `/${slug}/spirits` : '';
  const address = [loc.address, loc.city, loc.state, loc.zipCode].filter(Boolean).join(', ');
  const hasMenu = typeof loc.menuUrl === 'string' && loc.menuUrl.trim().length > 0;

  const links = [
    ...(hasMenu ? [{ label: 'Menu', url: String(loc.menuUrl).trim() }] : []),
    ...(spiritUrl ? [{ label: 'Spirit List', url: spiritUrl }] : []),
  ];

  if (loc.phone) links.push({ label: 'Call', url: `tel:${String(loc.phone).replace(/[^+\\d]/g, '')}` });
  if (loc.facebook) links.push({ label: 'Facebook', url: loc.facebook });
  if (loc.instagram) links.push({ label: 'Instagram', url: loc.instagram });
  if (loc.twitter) links.push({ label: 'Twitter', url: loc.twitter });
  links.push(...normalizeLinkItems(loc.links || []));

  if (!hasMenu && !spiritUrl) {
    links.push({ label: 'Menu', url: 'https://www.dramanddraught.com/menus/' });
  }

  return uniqueLinks(links);
}

async function buildGuestBottleNotesForCatalog(bottles, enableAi = false) {
  const list = Array.isArray(bottles) ? bottles : [];
  if (!enableAi) return list;

  const enhanced = await mapWithConcurrency(list, OPENAI_NOTES_MAX_CONCURRENCY, async (bottle) => {
    if (!bottle) return bottle;
    const notes = await enhanceBottleNotes(bottle);
    return {
      ...bottle,
      guestNotes: notes || buildFallbackBottleNotes(bottle) || null,
    };
  });

  return enhanced;
}

function getIcon(label) {
  const l = (label || '').toLowerCase();
  if (l.includes('special')) return '🌟';
  if (l.includes('menu')) return '📖';
  if (l.includes('spirit')) return '🥃';
  if (l.includes('cocktail')) return '🍸';
  if (l.includes('draft')) return '🍺';
  if (l.includes('wine')) return '🍷';
  if (l.includes('event')) return '📅';
  if (l.includes('direction') || l.includes('map')) return '🗺️';
  if (l.includes('call')) return '☎️';
  if (l.includes('email')) return '✉️';
  if (l.includes('facebook')) return '📘';
  if (l.includes('instagram')) return '📷';
  if (l.includes('twitter')) return '🐦';
  return '➜';
}

function getLinkButtons(location) {
  return getDefaultLinks(location || {}).map((link) => ({ ...link, icon: getIcon(link.label) }));
}

function parseBody(req, { maxBytes = 4 * 1024 * 1024 } = {}) {
  return new Promise((resolve, reject) => {
    let data = '';
    let bytes = 0;
    req.on('data', (c) => {
      bytes += c.length;
      if (bytes > maxBytes) { req.destroy(); return reject(new Error('Body too large')); }
      data += c;
    });
    req.on('end', () => {
      const ct = req.headers['content-type'] || '';
      if (ct.includes('application/x-www-form-urlencoded')) return resolve(querystring.parse(data));
      if (ct.includes('application/json')) {
        try { return resolve(JSON.parse(data || '{}')); } catch { return resolve({}); }
      }
      resolve({ raw: data });
    });
  });
}

function unauthorized(res) {
  res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="Admin"', 'Content-Type': 'text/plain' });
  res.end('Unauthorized');
}

function isAdmin(req) {
  const user = process.env.ADMIN_USER || 'admin';
  const pass = process.env.ADMIN_PASS || '';
  const hdr = req.headers['authorization'] || '';
  if (!hdr.startsWith('Basic ')) return false;
  const b64 = hdr.slice(6);
  try {
    const [u, p] = Buffer.from(b64, 'base64').toString('utf8').split(':');
    return u === user && p === pass;
  } catch {
    return false;
  }
}

// Fallback Dram & Draught locations data
const fallbackLocations = [
  {
    name: 'Greensboro', slug: 'greensboro', city: 'Greensboro', state: 'NC',
    address: '300 West Gate City Blvd', zipCode: '27406', phone: '', email: 'greensboro@dramanddraught.com',
    specialText: '300+ Whiskeys | Craft Cocktails | NC Beers',
    hours: { monday: '4:00 PM - 12:00 AM', tuesday: '4:00 PM - 12:00 AM', wednesday: '4:00 PM - 12:00 AM', thursday: '4:00 PM - 2:00 AM', friday: '4:00 PM - 2:00 AM', saturday: '12:00 PM - 2:00 AM', sunday: '12:00 PM - 12:00 AM' },
    features: ['300+ Whiskeys', 'Craft Cocktails', 'NC Draft Beer', 'Wine Selection', 'Indoor & Outdoor Seating']
  },
  {
    name: 'Raleigh', slug: 'raleigh', city: 'Raleigh', state: 'NC',
    address: '1 Glenwood Avenue, Suite 101', zipCode: '27603', phone: '', email: 'raleigh@dramanddraught.com',
    specialText: 'Glenwood South Location | Happy Hour Daily',
    hours: { monday: '3:00 PM - 2:00 AM', tuesday: '3:00 PM - 2:00 AM', wednesday: '3:00 PM - 2:00 AM', thursday: '3:00 PM - 2:00 AM', friday: '3:00 PM - 2:00 AM', saturday: '12:00 PM - 2:00 AM', sunday: '12:00 PM - 12:00 AM' },
    features: ['300+ Whiskeys', 'Craft Cocktails', 'NC Draft Beer', 'Wine Selection', 'Late Night']
  },
  {
    name: 'Durham', slug: 'durham', city: 'Durham', state: 'NC',
    address: '701 W. Main Street Suite 123', zipCode: '27701', phone: '', email: 'durham@dramanddraught.com',
    specialText: 'Downtown Durham | Brightleaf Square',
    hours: { monday: '3:00 PM - 12:00 AM', tuesday: '3:00 PM - 12:00 AM', wednesday: '3:00 PM - 12:00 AM', thursday: '3:00 PM - 12:00 AM', friday: '3:00 PM - 2:00 AM', saturday: '12:00 PM - 2:00 AM', sunday: '12:00 PM - 12:00 AM' },
    features: ['300+ Whiskeys', 'Craft Cocktails', 'NC Draft Beer', 'Wine Selection', 'Historic Location']
  },
  {
    name: 'Winston-Salem', slug: 'winston-salem', city: 'Winston-Salem', state: 'NC',
    address: '486 North Patterson Avenue STE 120', zipCode: '27101', phone: '', email: 'winston@dramanddraught.com',
    specialText: 'Innovation Quarter | Indoor & Outdoor Seating',
    hours: { monday: '3:00 PM - 12:00 AM', tuesday: '3:00 PM - 12:00 AM', wednesday: '3:00 PM - 12:00 AM', thursday: '3:00 PM - 2:00 AM', friday: '3:00 PM - 2:00 AM', saturday: '12:00 PM - 2:00 AM', sunday: '12:00 PM - 12:00 AM' },
    features: ['300+ Whiskeys', 'Craft Cocktails', 'NC Draft Beer', 'Wine Selection', 'Outdoor Patio']
  },
  {
    name: 'Cary', slug: 'cary', city: 'Cary', state: 'NC',
    address: '3 Fenton Main St', zipCode: '27511', phone: '', email: 'cary@dramanddraught.com',
    specialText: 'Fenton Development | Extended Weekend Hours',
    hours: { monday: '4:00 PM - 12:00 AM', tuesday: '12:00 PM - 12:00 AM', wednesday: '12:00 PM - 12:00 AM', thursday: '12:00 PM - 12:00 AM', friday: '12:00 PM - 2:00 AM', saturday: '12:00 PM - 2:00 AM', sunday: '12:00 PM - 11:00 PM' },
    features: ['300+ Whiskeys', 'Craft Cocktails', 'NC Draft Beer', 'Wine Selection', 'Family Friendly']
  },
  {
    name: 'Charlotte', slug: 'charlotte', city: 'Charlotte', state: 'NC',
    address: '1220 S Tryon St', zipCode: '28203', phone: '', email: 'charlotte@dramanddraught.com',
    specialText: 'South End Location | Open Late',
    hours: { monday: '3:00 PM - 2:00 AM', tuesday: '3:00 PM - 2:00 AM', wednesday: '3:00 PM - 2:00 AM', thursday: '3:00 PM - 2:00 AM', friday: '3:00 PM - 2:00 AM', saturday: '12:00 PM - 2:00 AM', sunday: '12:00 PM - 12:00 AM' },
    features: ['300+ Whiskeys', 'Craft Cocktails', 'NC Draft Beer', 'Wine Selection', 'Late Night', 'South End']
  },
  {
    name: 'Wilmington', slug: 'wilmington', city: 'Wilmington', state: 'NC',
    address: '109 Market St', zipCode: '28401', phone: '', email: 'wilmington@dramanddraught.com',
    specialText: 'Historic Downtown | Steps from Riverwalk',
    hours: { monday: '2:00 PM - 12:00 AM', tuesday: '2:00 PM - 12:00 AM', wednesday: '2:00 PM - 12:00 AM', thursday: '2:00 PM - 12:00 AM', friday: '12:00 PM - 2:00 AM', saturday: '12:00 PM - 2:00 AM', sunday: '12:00 PM - 12:00 AM' },
    features: ['300+ Whiskeys', 'Craft Cocktails', 'NC Draft Beer', 'Wine Selection', 'Historic Downtown', 'Near Riverwalk']
  }
];

function getFlashMsg(reqUrl) {
  try {
    const u = new URL(reqUrl, 'http://localhost');
    return u.searchParams.get('msg') || '';
  } catch { return ''; }
}

async function getLocations(prisma) {
  if (prisma) {
    try {
      const locations = await prisma.location.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });
      const enriched = await Promise.all(
        locations.map(async (location) => {
          const googleData = await getGoogleHoursForLocation(location);
          if (!googleData) return { ...location, googleReviewUrl: GOOGLE_REVIEW_URLS[location.slug] || null };
          const googleCoordinates = googleData.coordinates || null;
          const mergedHours = {
            ...(typeof location.hours === 'object' && location.hours ? location.hours : {}),
            ...(googleData.hours || {}),
          };
          return {
            ...location,
            hours: mergedHours,
            openHoursSource: 'google',
            googlePlaceId: googleData.placeId || null,
            googleReviewUrl: GOOGLE_REVIEW_URLS[location.slug] || googleData.reviewUrl || null,
            googleCoordinates: googleCoordinates,
          };
        }),
      );
      return enriched;
    } catch (e) {
      console.warn('DB unavailable, using fallback locations');
    }
  }
  return fallbackLocations;
}

// ─── Media system integration (dram-draught-public) ───
// Upload an inline data-URL image into the shared media system so it lands in
// the media dashboard and can be served in any size/crop. Returns
// { fileId, url } on success, or null when the integration isn't configured
// (no EXTERNAL_API_KEY) or the upload fails — callers fall back to storing the
// data URL inline as before, so nothing breaks without the key.
async function uploadImageToMedia(dataUrl, { collection = 'menuqr', tags = '' } = {}) {
  const apiKey = process.env.EXTERNAL_API_KEY;
  if (!apiKey) return null;
  const m = /^data:(image\/[a-z+.-]+);base64,(.+)$/i.exec(String(dataUrl || '').trim());
  if (!m) return null; // only inline data URLs get uploaded; hosted URLs pass through
  const mime = m[1];
  let buffer;
  try { buffer = Buffer.from(m[2], 'base64'); } catch { return null; }
  if (!buffer || buffer.length === 0) return null;

  const origin = process.env.PUBLIC_WEB_ORIGIN || 'https://public.apps.dramanddraught.com';
  const ext = (mime.split('/')[1] || 'jpg').replace('jpeg', 'jpg').replace('+xml', '');
  try {
    const form = new FormData();
    form.append('file', new Blob([buffer], { type: mime }), `upload.${ext}`);
    form.append('collection', collection);
    if (tags) form.append('tags', tags);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    let res;
    try {
      res = await fetch(`${origin}/api/external/upload`, {
        method: 'POST',
        headers: { 'X-API-Key': apiKey },
        body: form,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) {
      console.warn('[menuqr] media upload failed:', res.status);
      return null;
    }
    const json = await res.json().catch(() => null);
    if (!json || !json.fileId) return null;
    // Store an absolute URL on menuqr's known origin so rendition rewriting is
    // predictable regardless of the media app's own PUBLIC_APP_URL setting.
    return { fileId: json.fileId, url: `${origin}/media/image/${json.fileId}?size=xlarge` };
  } catch (err) {
    console.warn('[menuqr] media upload error:', err.message);
    return null;
  }
}

// Rewrite a stored media image URL into a specific transform/crop. The public
// media server route is GET /media/:type/:spec/:fileId (spec before fileId).
// Non-media URLs (data URLs, arbitrary hosted images) pass through unchanged.
function mediaRenditionUrl(url, spec) {
  const m = /^(https?:\/\/[^/]+)\/media\/(image|video)\/([^/?#]+)/i.exec(String(url || ''));
  if (!m || !spec) return url;
  return `${m[1]}/media/${m[2]}/${spec}/${m[3]}`;
}

module.exports = {
  uploadImageToMedia,
  mediaRenditionUrl,
  sendHTML, sendJSON, redirect, getDefaultLinks, getIcon, getLinkButtons,
  getEasternDate, getOpenState, getTodayHours, getDayLabel,
  parseBody, unauthorized, isAdmin, fallbackLocations, getLocations, getFlashMsg,
  parseBottleNoteSections,
  buildGuestBottleNotesForCatalog,
  enhanceBottleNotes,
  generateFeedbackResponse,
  buildStaffFeedbackBody,
  sendFeedbackEmails,
  sendEmailViaGoogle,
  buildFeedbackMailto,
  getFeedbackFromAddress,
  getOpenAiDiagnosticSnapshot,
  generateCocktailImage,
  buildCocktailImagePrompt,
};
