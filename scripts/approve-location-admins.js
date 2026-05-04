// Approves any Bartender DB user who holds a GENERAL_MANAGER or
// HEAD_BARTENDER role on at least one location but has isApproved = false.
// menuqr's /admin login rejects unapproved users with "Account not
// approved", which has been blocking GMs and head bartenders from signing in.
//
// Run:  node scripts/approve-location-admins.js

const { Pool } = require('pg');

const ROLES = ['GENERAL_MANAGER', 'HEAD_BARTENDER'];

const BARTENDER_DB_URL =
  process.env.BARTENDER_DB_URL ||
  'postgresql://bartenderuser:asswipe12@srv-captain--bartender:5432/postgres';

async function main() {
  const pool = new Pool({ connectionString: BARTENDER_DB_URL, max: 2 });
  try {
    const candidates = await pool.query(
      `SELECT DISTINCT u.id, u.email, u."firstName", u."lastName", u."isApproved"
         FROM "User" u
         JOIN "UserLocation" ul ON ul."userId" = u.id
        WHERE ul.role = ANY($1::text[])
        ORDER BY u.email ASC`,
      [ROLES],
    );

    if (candidates.rows.length === 0) {
      console.log(`No users found with roles ${ROLES.join(', ')}.`);
      return;
    }

    let approved = 0;
    let alreadyApproved = 0;
    for (const user of candidates.rows) {
      const label = `${user.firstName || ''} ${user.lastName || ''} <${user.email}>`.trim();
      if (user.isApproved) {
        console.log(`  ✓ ${label} — already approved`);
        alreadyApproved++;
        continue;
      }
      await pool.query('UPDATE "User" SET "isApproved" = true WHERE id = $1', [user.id]);
      console.log(`  → ${label} — approved`);
      approved++;
    }

    console.log(
      `\nDone. Approved ${approved} user(s); ${alreadyApproved} already approved.`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
