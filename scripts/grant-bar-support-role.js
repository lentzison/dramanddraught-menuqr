// Grant a bar-support role to a user by email. Idempotent — re-running is a
// no-op if the user already holds the role.
//
// Usage:
//   node scripts/grant-bar-support-role.js <email> <ROLE>
//
// ROLE must be one of: FOUNDER, MANAGING_DIRECTOR, HR, TRAINING, FINANCE, MARKETING

const { Pool } = require('pg');
const crypto = require('crypto');

const ALLOWED_ROLES = new Set(['FOUNDER', 'MANAGING_DIRECTOR', 'HR', 'TRAINING', 'FINANCE', 'MARKETING']);

const BARTENDER_DB_URL =
  process.env.BARTENDER_DB_URL ||
  'postgresql://bartenderuser:asswipe12@srv-captain--bartender:5432/postgres';

async function main() {
  const [, , emailArg, roleArg] = process.argv;
  if (!emailArg || !roleArg) {
    console.error('Usage: node scripts/grant-bar-support-role.js <email> <ROLE>');
    console.error(`ROLE must be one of: ${[...ALLOWED_ROLES].join(', ')}`);
    process.exit(1);
  }
  const role = roleArg.toUpperCase();
  if (!ALLOWED_ROLES.has(role)) {
    console.error(`Invalid role "${roleArg}". Must be one of: ${[...ALLOWED_ROLES].join(', ')}`);
    process.exit(1);
  }

  const pool = new Pool({ connectionString: BARTENDER_DB_URL, max: 2 });
  try {
    const userRes = await pool.query(
      `SELECT id, email, "firstName", "lastName", "isApproved"
         FROM "User" WHERE LOWER(email) = LOWER($1) LIMIT 1`,
      [emailArg],
    );
    if (userRes.rows.length === 0) {
      console.error(`No User row found for ${emailArg}.`);
      process.exit(1);
    }
    const user = userRes.rows[0];
    const label = `${user.firstName || ''} ${user.lastName || ''} <${user.email}>`.trim();
    console.log(`Found user: ${label} (id: ${user.id})`);

    if (!user.isApproved) {
      await pool.query('UPDATE "User" SET "isApproved" = true WHERE id = $1', [user.id]);
      console.log('  → set isApproved = true');
    }

    const existing = await pool.query(
      `SELECT 1 FROM "UserBarSupportRole" WHERE "userId" = $1 AND role::text = $2 LIMIT 1`,
      [user.id, role],
    );
    if (existing.rows.length > 0) {
      console.log(`  ✓ already has bar-support role ${role}`);
    } else {
      await pool.query(
        `INSERT INTO "UserBarSupportRole" (id, "userId", role, "createdAt", "updatedAt")
         VALUES ($1, $2, $3::"BarSupportAdminRole", NOW(), NOW())`,
        [crypto.randomUUID(), user.id, role],
      );
      console.log(`  → granted bar-support role ${role}`);
    }

    console.log('\nDone.');
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
