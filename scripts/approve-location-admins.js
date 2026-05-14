// Approves any Bartender DB user who can legitimately log into menuqr /admin
// but currently has isApproved = false. menuqr rejects unapproved users with
// "Account not approved".
//
// Eligible roles:
//   - Location-scoped (UserLocation.role): GENERAL_MANAGER, HEAD_BARTENDER, ADMIN
//   - Bar-support (UserBarSupportRole.role): any role in that table —
//     FOUNDER, MANAGING_DIRECTOR, HR, TRAINING, FINANCE, MARKETING
//
// Run:  node scripts/approve-location-admins.js
//
// Idempotent — re-running only updates rows that still need approval.

const { Pool } = require('pg');

const LOCATION_ROLES = ['GENERAL_MANAGER', 'HEAD_BARTENDER', 'ADMIN'];

const BARTENDER_DB_URL =
  process.env.BARTENDER_DB_URL ||
  'postgresql://bartenderuser:asswipe12@srv-captain--bartender:5432/postgres';

async function main() {
  const pool = new Pool({ connectionString: BARTENDER_DB_URL, max: 2 });
  try {
    const candidates = await pool.query(
      `SELECT DISTINCT u.id, u.email, u."firstName", u."lastName", u."isApproved",
              COALESCE(
                array_agg(DISTINCT ul.role) FILTER (WHERE ul.role IS NOT NULL),
                '{}'
              ) AS location_roles,
              COALESCE(
                array_agg(DISTINCT s.role) FILTER (WHERE s.role IS NOT NULL),
                '{}'
              ) AS support_roles
         FROM "User" u
         LEFT JOIN "UserLocation" ul         ON ul."userId" = u.id AND ul.role = ANY($1::text[])
         LEFT JOIN "UserBarSupportRole" s    ON s."userId"  = u.id
        WHERE ul.role IS NOT NULL OR s.role IS NOT NULL
        GROUP BY u.id, u.email, u."firstName", u."lastName", u."isApproved"
        ORDER BY u.email ASC`,
      [LOCATION_ROLES],
    );

    if (candidates.rows.length === 0) {
      console.log('No eligible users found.');
      return;
    }

    let approved = 0;
    let alreadyApproved = 0;
    for (const user of candidates.rows) {
      const rolesLabel = [
        ...(user.location_roles || []),
        ...(user.support_roles || []),
      ].filter(Boolean).join(', ') || '(no roles)';
      const label = `${user.firstName || ''} ${user.lastName || ''} <${user.email}> [${rolesLabel}]`.trim();
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
