const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { findUserByEmail, getUserRoles, hasAccess } = require('./bartenderDb');

// In-memory session store
const sessions = new Map();
const SESSION_TTL = 8 * 60 * 60 * 1000; // 8 hours
const COOKIE_NAME = 'menuqr_session';

function generateSessionId() {
  return crypto.randomBytes(32).toString('hex');
}

function cleanExpiredSessions() {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (session.expiresAt < now) sessions.delete(id);
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
  sessions.set(sessionId, {
    user,
    expiresAt: Date.now() + SESSION_TTL,
  });
  setSessionCookie(res, sessionId);
  return sessionId;
}

function destroySession(req, res) {
  const cookies = parseCookies(req);
  const sessionId = cookies[COOKIE_NAME];
  if (sessionId) sessions.delete(sessionId);
  clearSessionCookie(res);
}

function requireAuth(req, res) {
  const session = getSession(req);
  if (!session) return null;
  return session.user;
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
  // Refresh the cookie too so browser keeps it
  setSessionCookie(res, sessionId);
  return true;
}

module.exports = { authenticate, createSession, destroySession, requireAuth, getSession, refreshSession };
