// sso.js — cross-app single sign-on for the three Dram & Draught apps.
// Verifies/mints short-lived HS256 handoff tokens using the SHARED
// NEXTAUTH_SECRET (no jsonwebtoken dependency — Node crypto only, and the
// output is a standard JWT so the Next.js / Express apps interop).
const crypto = require('crypto');

function secret() {
  const s = process.env.NEXTAUTH_SECRET || process.env.JWT_SECRET;
  if (!s) throw new Error('NEXTAUTH_SECRET must be set for SSO');
  return s;
}

function b64url(input) {
  return Buffer.from(input).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(str) {
  return Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

// Where each app accepts an incoming handoff.
const APPS = {
  bartender: { accept: 'https://bartender.dramanddraught.com/sso' },
  public:    { accept: 'https://public.dramanddraught.com/api/auth/sso' },
  menuqr:    { accept: 'https://menuqr.apps.dramanddraught.com/admin/sso' },
};

function sign({ sub, email, target }) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const now = Math.floor(Date.now() / 1000);
  const payload = b64url(JSON.stringify({ sub, email, purpose: 'sso', target, iat: now, exp: now + 120 }));
  const data = `${header}.${payload}`;
  const sig = crypto.createHmac('sha256', secret()).update(data).digest('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${data}.${sig}`;
}

function verify(token, expectedTarget) {
  try {
    const parts = String(token).split('.');
    if (parts.length !== 3) return null;
    const [h, p, s] = parts;
    const expected = crypto.createHmac('sha256', secret()).update(`${h}.${p}`).digest('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const a = Buffer.from(s);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const payload = JSON.parse(b64urlDecode(p));
    if (payload.purpose !== 'sso') return null;
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    if (expectedTarget && payload.target !== expectedTarget) return null;
    if (!payload.sub) return null;
    return { userId: payload.sub, email: payload.email };
  } catch {
    return null;
  }
}

module.exports = { sign, verify, APPS };
