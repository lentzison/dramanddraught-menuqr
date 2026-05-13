// Best-effort audit log writer. Errors are swallowed so an audit failure
// never blocks the actual mutation the user was trying to perform.
//
// Usage:
//   const { writeAudit } = require('./auditLog');
//   writeAudit(prisma, req, user, {
//     action: 'create',           // create | update | delete | duplicate | move | save
//     resourceType: 'event',      // free-form, e.g. event | menu_item | special | half_price | location
//     resourceId: created.id,
//     resourceLabel: created.title,
//     locationSlug: 'winston-salem',
//     details: { ... },           // optional JSON
//   });
//
// Fire-and-forget — does not block the request.

function getClientIp(req) {
  if (!req) return null;
  const fwd = req.headers && req.headers['x-forwarded-for'];
  if (fwd) return String(fwd).split(',')[0].trim();
  return (req.socket && req.socket.remoteAddress) || null;
}

// Always returns a Promise so callers can safely chain .catch even when the
// audit log is unavailable or the entry is malformed.
function writeAudit(prisma, req, user, entry) {
  if (!prisma || !prisma.auditLog) return Promise.resolve();
  if (!entry || !entry.action || !entry.resourceType) return Promise.resolve();
  const data = {
    userId: user && user.id ? String(user.id) : null,
    userEmail: user && user.email ? String(user.email) : null,
    userName: user && (user.firstName || user.lastName)
      ? [user.firstName, user.lastName].filter(Boolean).join(' ')
      : null,
    action: String(entry.action).slice(0, 32),
    resourceType: String(entry.resourceType).slice(0, 32),
    resourceId: entry.resourceId ? String(entry.resourceId).slice(0, 64) : null,
    resourceLabel: entry.resourceLabel ? String(entry.resourceLabel).slice(0, 200) : null,
    locationSlug: entry.locationSlug ? String(entry.locationSlug).slice(0, 64) : null,
    details: entry.details || null,
    ipAddress: getClientIp(req),
  };
  return prisma.auditLog.create({ data }).catch((err) => {
    console.warn('Audit log write failed:', err.message);
  });
}

module.exports = { writeAudit };
