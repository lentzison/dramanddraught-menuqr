// Ensures Anna (anna@dramanddraught.com) can log in to menuqr admin.
//
// menuqr auth is backed by the Bartender database: a user can sign in only if
// (a) they have a User row in Bartender DB, (b) isApproved = true, and
// (c) they hold an allowed role. This script idempotently makes sure Anna is
// approved and has GENERAL_MANAGER for the Greensboro location.
//
// It does NOT create the user or set a password — Anna must already exist in
// the Bartender dashboard (she does). If she doesn't, the script prints a
// clear message and exits.
//
// Run:  node scripts/setup-anna-login.js

const { Pool } = require('pg');

const EMAIL = 'anna@dramanddraught.com';
const LOCATION_NAME = 'Greensboro';
const ROLE = 'GENERAL_MANAGER';

const BARTENDER_DB_URL =
  process.env.BARTENDER_DB_URL ||
  'postgresql://bartenderuser:asswipe12@srv-captain--bartender:5432/postgres';

async function main() {
  const pool = new Pool({ connectionString: BARTENDER_DB_URL, max: 2 });
  try {
    // 1. Find the user
    const userRes = await pool.query(
      'SELECT id, email, "firstName", "lastName", "isApproved" FROM "User" WHERE LOWER(email) = LOWER($1) LIMIT 1',
      [EMAIL],
    );
    if (userRes.rows.length === 0) {
      console.error(
        `No User row found for ${EMAIL}. Ask Anna to sign up at the Bartender dashboard first, then re-run this script.`,
      );
      process.exit(1);
    }
    const user = userRes.rows[0];
    console.log(`Found user: ${user.firstName || ''} ${user.lastName || ''} <${user.email}> (id: ${user.id})`);

    // 2. Approve if not already
    if (!user.isApproved) {
      await pool.query('UPDATE "User" SET "isApproved" = true WHERE id = $1', [user.id]);
      console.log('  → Set isApproved = true');
    } else {
      console.log('  ✓ Already approved');
    }

    // 3. Find the Greensboro location in Bartender DB
    const locRes = await pool.query(
      'SELECT id, name FROM "Location" WHERE name = $1 AND "isActive" = true LIMIT 1',
      [LOCATION_NAME],
    );
    if (locRes.rows.length === 0) {
      console.error(`Location "${LOCATION_NAME}" not found or inactive in Bartender DB.`);
      process.exit(1);
    }
    const location = locRes.rows[0];
    console.log(`Found location: ${location.name} (id: ${location.id})`);

    // 4. Ensure she holds the role. UserLocation's unique constraint is
    //    assumed to be on (userId, locationId) — if a row exists we update
    //    the role, otherwise insert.
    const existingRoleRes = await pool.query(
      'SELECT role FROM "UserLocation" WHERE "userId" = $1 AND "locationId" = $2 LIMIT 1',
      [user.id, location.id],
    );
    if (existingRoleRes.rows.length === 0) {
      await pool.query(
        'INSERT INTO "UserLocation" ("userId", "locationId", role) VALUES ($1, $2, $3)',
        [user.id, location.id, ROLE],
      );
      console.log(`  → Granted ${ROLE} for ${location.name}`);
    } else if (existingRoleRes.rows[0].role !== ROLE) {
      await pool.query(
        'UPDATE "UserLocation" SET role = $1 WHERE "userId" = $2 AND "locationId" = $3',
        [ROLE, user.id, location.id],
      );
      console.log(`  → Updated role to ${ROLE} (was ${existingRoleRes.rows[0].role})`);
    } else {
      console.log(`  ✓ Already has ${ROLE} for ${location.name}`);
    }

    console.log('\nDone. Anna can now log in at /admin/login with her Bartender credentials.');
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
