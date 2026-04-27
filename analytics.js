const crypto = require('crypto');

const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const EMAIL_HASH_SALT = process.env.ANALYTICS_EMAIL_HASH_SALT || process.env.SESSION_SECRET || 'menuqr-analytics';

function parseUserAgent(ua) {
  const str = String(ua || '');
  let deviceType = 'desktop';
  let browser = 'Other';
  let os = 'Other';

  // OS
  if (/iPhone|iPad|iPod/.test(str)) os = 'iOS';
  else if (/Android/.test(str)) os = 'Android';
  else if (/Mac OS X/.test(str)) os = 'macOS';
  else if (/Windows/.test(str)) os = 'Windows';
  else if (/Linux/.test(str)) os = 'Linux';
  else if (/CrOS/.test(str)) os = 'ChromeOS';

  // Device type
  if (/iPhone|iPod|Android.*Mobile|Mobile.*Android/.test(str)) deviceType = 'mobile';
  else if (/iPad|Android(?!.*Mobile)|Tablet/.test(str)) deviceType = 'tablet';

  // Browser
  if (/CriOS/.test(str)) browser = 'Chrome';
  else if (/FxiOS/.test(str)) browser = 'Firefox';
  else if (/EdgA|Edg\/|Edge/.test(str)) browser = 'Edge';
  else if (/OPR|Opera/.test(str)) browser = 'Opera';
  else if (/SamsungBrowser/.test(str)) browser = 'Samsung Internet';
  else if (/Chrome\//.test(str) && !/Chromium/.test(str)) browser = 'Chrome';
  else if (/Safari\//.test(str) && !/Chrome/.test(str)) browser = 'Safari';
  else if (/Firefox\//.test(str)) browser = 'Firefox';

  return { deviceType, browser, os };
}

function parseCookies(req) {
  const header = req.headers.cookie || '';
  const cookies = {};
  header.split(';').forEach(pair => {
    const [key, ...rest] = pair.trim().split('=');
    if (key) cookies[key.trim()] = rest.join('=').trim();
  });
  return cookies;
}

function getVisitorId(req) {
  const cookies = parseCookies(req);
  return cookies.dnd_visitor || null;
}

function setVisitorCookie(res, visitorId) {
  const maxAge = 365 * 24 * 60 * 60; // 1 year
  const cookie = `dnd_visitor=${visitorId}; Max-Age=${maxAge}; Path=/; SameSite=Lax`;
  const existing = res.getHeader('Set-Cookie');
  if (existing) {
    const arr = Array.isArray(existing) ? existing : [existing];
    arr.push(cookie);
    res.setHeader('Set-Cookie', arr);
  } else {
    res.setHeader('Set-Cookie', cookie);
  }
}

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const ip = String(forwarded).split(',')[0].trim();
    return ip || null;
  }
  return req.socket?.remoteAddress || null;
}

function classifyPageType(pathname) {
  if (pathname === '/') return 'home';
  if (/\/specials$/.test(pathname)) return 'specials';
  if (/\/draft$/.test(pathname)) return 'draft';
  if (/\/menu$/.test(pathname)) return 'menu';
  if (/\/events(?:\/|$)/.test(pathname)) return 'event';
  if (/\/flights$/.test(pathname)) return 'flights';
  if (/\/spirits$/.test(pathname)) return 'spirits';
  if (/\/lubrication-cup$/.test(pathname)) return 'lubrication-cup';
  return 'location';
}

function normalizeTrackingValue(value, maxLength = 64) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return null;
  const cleaned = raw.replace(/[^a-z0-9_.\-]/g, '').slice(0, maxLength);
  return cleaned || null;
}

// Parse campaign parameters from query string and normalize them for reporting.
function parseTrackingParams(queryString) {
  if (!queryString) return null;
  const qs = queryString.startsWith('?') ? queryString.slice(1) : queryString;
  const params = new URLSearchParams(qs);
  return {
    source: normalizeTrackingValue(params.get('src') || params.get('utm_source'), 32),
    medium: normalizeTrackingValue(params.get('medium') || params.get('utm_medium'), 32),
    campaign: normalizeTrackingValue(params.get('campaign') || params.get('utm_campaign'), 64),
    qrId: normalizeTrackingValue(params.get('qr') || params.get('qrid') || params.get('qr_id'), 64),
  };
}

// Backward-compatible helper for existing callers/tests.
function parseSource(queryString) {
  return (parseTrackingParams(queryString) || {}).source || null;
}

function normalizeEmailForAnalytics(email) {
  const normalized = String(email || '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : null;
}

function hashEmail(email) {
  const normalized = normalizeEmailForAnalytics(email);
  if (!normalized) return null;
  return crypto.createHash('sha256').update(EMAIL_HASH_SALT + ':' + normalized).digest('hex');
}

function maskEmail(email) {
  const normalized = normalizeEmailForAnalytics(email);
  if (!normalized) return '';
  const [local, domain] = normalized.split('@');
  const visible = local.length <= 2 ? local[0] : local.slice(0, 2);
  return visible + '***@' + domain;
}

async function trackPageView(req, res, prisma, locationSlug, locationId, pagePath, queryString) {
  if (!prisma) return null;

  try {
    let visitorId = getVisitorId(req);
    const isNew = !visitorId;
    if (!visitorId) {
      visitorId = crypto.randomUUID();
    }
    setVisitorCookie(res, visitorId);

    const ua = req.headers['user-agent'] || '';
    const { deviceType, browser, os } = parseUserAgent(ua);
    const ip = getClientIp(req);
    const referrer = req.headers.referer || req.headers.referrer || '';
    const tracking = parseTrackingParams(queryString) || {};
    const { source, medium, campaign, qrId } = tracking;
    const isQrScan = Boolean(qrId) || (!referrer && !source);
    const pageType = classifyPageType(pagePath);

    // Find existing session within timeout window
    const cutoff = new Date(Date.now() - SESSION_TIMEOUT_MS);
    let session = await prisma.visitorSession.findFirst({
      where: {
        visitorId,
        locationSlug: locationSlug || '',
        startedAt: { gte: cutoff },
      },
      orderBy: { startedAt: 'desc' },
    });

    if (session) {
      // Update existing session; also backfill source if the new pageview has one and the session didn't
      const updateData = { pageCount: { increment: 1 }, updatedAt: new Date() };
      if (source && !session.source) updateData.source = source;
      if (medium && !session.medium) updateData.medium = medium;
      if (campaign && !session.campaign) updateData.campaign = campaign;
      if (qrId && !session.qrId) updateData.qrId = qrId;
      if (qrId && !session.isQrScan) updateData.isQrScan = true;
      session = await prisma.visitorSession.update({
        where: { id: session.id },
        data: updateData,
      });
    } else {
      // Create new session
      session = await prisma.visitorSession.create({
        data: {
          visitorId,
          locationId: locationId || null,
          locationSlug: locationSlug || '',
          ipAddress: ip,
          userAgent: ua.slice(0, 500),
          deviceType,
          browser,
          os,
          referrer: referrer ? referrer.slice(0, 500) : null,
          isQrScan,
          source: source || null,
          medium: medium || null,
          campaign: campaign || null,
          qrId: qrId || null,
          entryPage: pagePath,
        },
      });
    }

    // Record page view (fire-and-forget)
    prisma.pageView.create({
      data: {
        sessionId: session.id,
        visitorId,
        locationSlug: locationSlug || '',
        pagePath,
        pageType,
        queryString: queryString || null,
      },
    }).catch(err => console.warn('PageView insert error:', err.message));

    return session.id;
  } catch (err) {
    console.warn('Analytics tracking error:', err.message);
    return null;
  }
}

async function getCurrentSessionForVisitor(prisma, visitorId) {
  if (!prisma || !visitorId) return null;
  return prisma.visitorSession.findFirst({
    where: { visitorId },
    orderBy: { updatedAt: 'desc' },
  }).catch(() => null);
}

async function linkVisitorToEmail(req, prisma, email, options = {}) {
  if (!prisma?.guestVisitorLink) return null;
  const normalizedEmail = normalizeEmailForAnalytics(email);
  const visitorId = options.visitorId || getVisitorId(req);
  if (!normalizedEmail || !visitorId) return null;

  const emailHash = hashEmail(normalizedEmail);
  const emailMasked = maskEmail(normalizedEmail);
  const session = options.session || await getCurrentSessionForVisitor(prisma, visitorId);
  const locationSlug = options.locationSlug || session?.locationSlug || null;
  const source = options.source || session?.source || null;

  const existing = await prisma.guestVisitorLink.findUnique({
    where: { emailHash_visitorId: { emailHash, visitorId } },
  }).catch(() => null);

  const data = {
    emailMasked,
    lastLocationSlug: locationSlug || null,
    lastSource: source || null,
    giftCardOptIn: options.giftCardOptIn ? true : undefined,
    newsletterOptIn: options.newsletterOptIn ? true : undefined,
  };
  if (options.kind === 'feedback') data.feedbackCount = { increment: 1 };
  if (options.kind === 'event_signup') data.eventSignupCount = { increment: 1 };

  if (existing) {
    const updateData = {};
    Object.entries(data).forEach(([key, value]) => {
      if (value !== undefined) updateData[key] = value;
    });
    return prisma.guestVisitorLink.update({
      where: { id: existing.id },
      data: updateData,
    }).catch(() => null);
  }

  return prisma.guestVisitorLink.create({
    data: {
      emailHash,
      emailMasked,
      visitorId,
      firstLocationSlug: locationSlug || null,
      lastLocationSlug: locationSlug || null,
      firstSource: source || null,
      lastSource: source || null,
      giftCardOptIn: Boolean(options.giftCardOptIn),
      newsletterOptIn: Boolean(options.newsletterOptIn),
      feedbackCount: options.kind === 'feedback' ? 1 : 0,
      eventSignupCount: options.kind === 'event_signup' ? 1 : 0,
    },
  }).catch(() => null);
}

async function recordAnalyticsEvent(req, prisma, eventType, options = {}) {
  if (!prisma?.analyticsEvent || !eventType) return null;
  const visitorId = options.visitorId || getVisitorId(req) || null;
  const session = options.session || await getCurrentSessionForVisitor(prisma, visitorId);
  const emailHash = options.email ? hashEmail(options.email) : (options.emailHash || null);
  const emailMasked = options.email ? maskEmail(options.email) : (options.emailMasked || null);

  return prisma.analyticsEvent.create({
    data: {
      eventType: String(eventType).slice(0, 80),
      visitorId,
      sessionId: options.sessionId || session?.id || null,
      emailHash,
      emailMasked,
      locationId: options.locationId || session?.locationId || null,
      locationSlug: options.locationSlug || session?.locationSlug || null,
      source: options.source || session?.source || null,
      medium: options.medium || session?.medium || null,
      campaign: options.campaign || session?.campaign || null,
      qrId: options.qrId || session?.qrId || null,
      pagePath: options.pagePath || session?.entryPage || null,
      entityType: options.entityType || null,
      entityId: options.entityId || null,
      entityName: options.entityName || null,
      metadata: options.metadata || null,
    },
  }).catch((err) => {
    console.warn('AnalyticsEvent insert error:', err.message);
    return null;
  });
}

function buildTrackingScript(sessionId) {
  if (!sessionId) return '';
  return `
    <script>
    (function(){
      var sid="${sessionId}",t0=Date.now(),sent=false;
      function beat(){
        if(sent)return;sent=true;
        var d=Math.round((Date.now()-t0)/1000);
        var b=JSON.stringify({sessionId:sid,durationSecs:d,screenWidth:screen.width,screenHeight:screen.height,language:navigator.language||""});
        if(navigator.sendBeacon)navigator.sendBeacon("/api/analytics/heartbeat",b);
      }
      document.addEventListener("visibilitychange",function(){if(document.visibilityState==="hidden")beat();});
      window.addEventListener("pagehide",beat);
    })();
    </script>`;
}

module.exports = {
  trackPageView,
  buildTrackingScript,
  parseUserAgent,
  getVisitorId,
  parseCookies,
  getClientIp,
  parseSource,
  parseTrackingParams,
  hashEmail,
  maskEmail,
  linkVisitorToEmail,
  recordAnalyticsEvent,
};
