const crypto = require('crypto');

const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

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
  if (/\/lubrication-cup$/.test(pathname)) return 'lubrication-cup';
  return 'location';
}

// Parse `src` or `utm_source` from a query string and normalize it to a short lower-case tag.
function parseSource(queryString) {
  if (!queryString) return null;
  const qs = queryString.startsWith('?') ? queryString.slice(1) : queryString;
  const params = new URLSearchParams(qs);
  let src = params.get('src') || params.get('utm_source') || '';
  src = String(src).trim().toLowerCase();
  if (!src) return null;
  // Keep it short, alphanumerics + a few separators
  src = src.replace(/[^a-z0-9_.\-]/g, '').slice(0, 32);
  return src || null;
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
    const source = parseSource(queryString);
    const isQrScan = !referrer && !source;
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
};
