const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { findUserByEmail, getUserRoles, hasAccess } = require('./bartenderDb');

// Session store: in-memory Map as the fast path, backed by the AdminSession
// table so sessions survive deploys/restarts. Reads stay synchronous
// (requireAuth is called all over the routes) — index.js awaits
// hydrateSession() for /admin requests, which pulls a DB-backed session into
// the Map before any route runs.
const sessions = new Map();
const SESSION_TTL = 8 * 60 * 60 * 1000; // 8 hours
const COOKIE_NAME = 'menuqr_session';

let sessionDb = null; // prisma client, wired up from index.js at boot
function setSessionStore(prisma) { sessionDb = prisma; }

// Load the request's session from the DB into the in-memory Map if this
// process hasn't seen it yet (fresh container after a deploy).
async function hydrateSession(req) {
  if (!sessionDb) return;
  const sid = parseCookies(req)[COOKIE_NAME];
  if (!sid || sessions.has(sid)) return;
  try {
    const row = await sessionDb.adminSession.findUnique({ where: { id: sid } });
    if (row && row.expiresAt.getTime() > Date.now()) {
      sessions.set(sid, { user: row.user, expiresAt: row.expiresAt.getTime() });
    }
  } catch (err) {
    console.warn('Session hydrate failed:', err.message);
  }
}

function generateSessionId() {
  return crypto.randomBytes(32).toString('hex');
}

function cleanExpiredSessions() {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (session.expiresAt < now) sessions.delete(id);
  }
  if (sessionDb) {
    sessionDb.adminSession.deleteMany({ where: { expiresAt: { lt: new Date(now) } } })
      .catch((err) => console.warn('Session cleanup failed:', err.message));
  }
}

// Run cleanup every 30 minutes
setInterval(cleanExpiredSessions, 30 * 60 * 1000);

function parseCookies(req) {
  const cookies = {};
  const header = req.headers.cookie || '';
  header.split(';').forEach(pair => {
    const [name, ...rest] = pair.trim().split('=');
    if (name) cookies[name.trim()] = decodeURIComponent(rest.join('='));
  });
  return cookies;
}

function getSession(req) {
  const cookies = parseCookies(req);
  const sessionId = cookies[COOKIE_NAME];
  if (!sessionId) return null;
  const session = sessions.get(sessionId);
  if (!session) return null;
  if (session.expiresAt < Date.now()) {
    sessions.delete(sessionId);
    return null;
  }
  return session;
}

function setSessionCookie(res, sessionId) {
  const cookie = `${COOKIE_NAME}=${sessionId}; HttpOnly; SameSite=Lax; Path=/admin; Max-Age=${SESSION_TTL / 1000}`;
  // Append to existing Set-Cookie headers if any
  const existing = res.getHeader('Set-Cookie') || [];
  const arr = Array.isArray(existing) ? existing : (existing ? [existing] : []);
  arr.push(cookie);
  res.setHeader('Set-Cookie', arr);
}

function clearSessionCookie(res) {
  const cookie = `${COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/admin; Max-Age=0`;
  res.setHeader('Set-Cookie', cookie);
}

async function authenticate(email, password) {
  try {
    const user = await findUserByEmail(email);
    if (!user) return { error: 'Invalid email or password' };
    if (!user.isApproved) return { error: 'Account not approved' };

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return { error: 'Invalid email or password' };

    const roles = await getUserRoles(user.id);
    if (!hasAccess(roles)) return { error: 'Insufficient permissions' };

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        roles,
      }
    };
  } catch (err) {
    console.error('Auth error:', err.message);
    return { error: 'Authentication service unavailable' };
  }
}

function createSession(res, user) {
  const sessionId = generateSessionId();
  const expiresAt = Date.now() + SESSION_TTL;
  sessions.set(sessionId, { user, expiresAt });
  if (sessionDb) {
    sessionDb.adminSession.create({ data: { id: sessionId, user, expiresAt: new Date(expiresAt) } })
      .catch((err) => console.warn('Session persist failed:', err.message));
  }
  setSessionCookie(res, sessionId);
  return sessionId;
}

// SSO sign-in: identity already proven by a verified handoff token, so no
// password — just confirm the user still exists, is approved, and has access.
async function authenticateSso(email) {
  try {
    const user = await findUserByEmail(email);
    if (!user) return { error: 'No account' };
    if (!user.isApproved) return { error: 'Account not approved' };
    const roles = await getUserRoles(user.id);
    if (!hasAccess(roles)) return { error: 'Insufficient permissions' };
    return { user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, roles } };
  } catch (err) {
    console.error('SSO auth error:', err.message);
    return { error: 'Authentication service unavailable' };
  }
}

function destroySession(req, res) {
  const cookies = parseCookies(req);
  const sessionId = cookies[COOKIE_NAME];
  if (sessionId) {
    sessions.delete(sessionId);
    if (sessionDb) {
      sessionDb.adminSession.delete({ where: { id: sessionId } })
        .catch(() => {}); // already gone is fine
    }
  }
  clearSessionCookie(res);
}

function requireAuth(req, res) {
  const session = getSession(req);
  if (!session) return null;
  return session.user;
}

// A user has company-wide access iff they hold any UserBarSupportRole row.
// Otherwise they're scoped to the specific menuqr location slug(s) attached to
// their UserLocation rows.
function isCompanyWide(user) {
  if (!user || !user.roles) return false;
  return Array.isArray(user.roles.supportRoles) && user.roles.supportRoles.length > 0;
}

// Returns the deduped list of menuqr location slugs a user is scoped to.
// Skips entries we couldn't map to a known menuqr slug.
function getUserLocationSlugs(user) {
  const list = (user && user.roles && user.roles.locations) || [];
  const slugs = list.map(l => l && l.slug).filter(Boolean);
  return Array.from(new Set(slugs));
}

function canAccessLocation(user, slug) {
  if (isCompanyWide(user)) return true;
  if (!slug) return false;
  return getUserLocationSlugs(user).includes(String(slug).toLowerCase());
}

// Bump the session expiration so an open admin tab keeps the session alive.
// Returns true if a session was found and refreshed, false otherwise.
function refreshSession(req, res) {
  const cookies = parseCookies(req);
  const sessionId = cookies[COOKIE_NAME];
  if (!sessionId) return false;
  const session = sessions.get(sessionId);
  if (!session) return false;
  if (session.expiresAt < Date.now()) {
    sessions.delete(sessionId);
    return false;
  }
  session.expiresAt = Date.now() + SESSION_TTL;
  if (sessionDb) {
    sessionDb.adminSession.update({ where: { id: sessionId }, data: { expiresAt: new Date(session.expiresAt) } })
      .catch(() => {}); // row may predate persistence; recreated on next login
  }
  // Refresh the cookie too so browser keeps it
  setSessionCookie(res, sessionId);
  return true;
}

module.exports = {
  authenticate,
  authenticateSso,
  createSession,
  destroySession,
  requireAuth,
  getSession,
  refreshSession,
  setSessionStore,
  hydrateSession,
  isCompanyWide,
  getUserLocationSlugs,
  canAccessLocation,
};
