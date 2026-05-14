// Diagnostic: given one or more emails, print the user's Bartender DB row
// plus all UserLocation + UserBarSupportRole rows. Lets you see at a glance
// why someone can or can't log into /admin.
//
// Usage:
//   node scripts/check-admin-login.js eli@dramanddraught.com lexi@dramanddraught.com

const { Pool } = require('pg');

const BARTENDER_DB_URL =
  process.env.BARTENDER_DB_URL ||
  'postgresql://bartenderuser:asswipe12@srv-captain--bartender:5432/postgres';

const ALLOWED_LOCATION_ROLES = new Set(['ADMIN', 'GENERAL_MANAGER', 'HEAD_BARTENDER']);
const ALLOWED_SUPPORT_ROLES  = new Set(['FOUNDER', 'MANAGING_DIRECTOR', 'HR', 'TRAINING', 'FINANCE', 'MARKETING']);

async function inspect(pool, email) {
  const user = await pool.query(
    `SELECT id, email, "firstName", "lastName", "isApproved"
       FROM "User" WHERE LOWER(email) = LOWER($1) LIMIT 1`,
    [email],
  );
  if (user.rows.length === 0) {
    console.log(`\n${email}\n  ✗ no User row exists in Bartender DB.`);
    console.log('    Fix: have them sign up in the Bartender dashboard first.');
    return;
  }
  const u = user.rows[0];
  console.log(`\n${u.email}  (${u.firstName || ''} ${u.lastName || ''})`.trim());
  console.log(`  isApproved: ${u.isApproved ? 'yes' : 'NO ← will see "Account not approved"'}`);

  const locs = await pool.query(
    `SELECT ul.role, l.name AS "locationName", l."isActive"
       FROM "UserLocation" ul
       JOIN "Location" l ON l.id = ul."locationId"
      WHERE ul."userId" = $1
      ORDER BY l.name ASC`,
    [u.id],
  );
  if (locs.rows.length === 0) {
    console.log('  Location roles: (none)');
  } else {
    console.log('  Location roles:');
    for (const r of locs.rows) {
      const ok = ALLOWED_LOCATION_ROLES.has(r.role) && r.isActive;
      const mark = ok ? '✓' : '·';
      console.log(`    ${mark} ${r.locationName} — ${r.role}${r.isActive ? '' : ' (location inactive)'}`);
    }
  }

  const sup = await pool.query(
    `SELECT role FROM "UserBarSupportRole" WHERE "userId" = $1 ORDER BY role ASC`,
    [u.id],
  );
  if (sup.rows.length === 0) {
    console.log('  Bar-support roles: (none)');
  } else {
    console.log('  Bar-support roles:');
    for (const r of sup.rows) {
      const ok = ALLOWED_SUPPORT_ROLES.has(r.role);
      console.log(`    ${ok ? '✓' : '·'} ${r.role}`);
    }
  }

  const hasOk = locs.rows.some((r) => ALLOWED_LOCATION_ROLES.has(r.role) && r.isActive)
    || sup.rows.some((r) => ALLOWED_SUPPORT_ROLES.has(r.role));
  if (!hasOk) {
    console.log('  ⚠ No eligible role — login will fail with "Insufficient permissions".');
    console.log('    Fix: in the Bartender dashboard, assign GENERAL_MANAGER / HEAD_BARTENDER / ADMIN at a location, or a bar-support role.');
  } else if (!u.isApproved) {
    console.log('  ⚠ Role is fine but account is unapproved — run scripts/approve-location-admins.js to fix.');
  } else {
    console.log('  ✓ Should be able to log in.');
  }
}

async function main() {
  const emails = process.argv.slice(2);
  if (emails.length === 0) {
    console.error('Usage: node scripts/check-admin-login.js email1 [email2 ...]');
    process.exit(1);
  }
  const pool = new Pool({ connectionString: BARTENDER_DB_URL, max: 2 });
  try {
    for (const email of emails) {
      await inspect(pool, email);
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
