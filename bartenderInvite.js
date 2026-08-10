// bartenderInvite.js — Issue a Bartender Dashboard onboarding invite for a
// newly-hired applicant.
//
// We can't call the bartender app's POST /api/employees/invites endpoint
// because it requires a session cookie. Instead we write straight to the
// shared bartender Postgres ("EmployeeInvite" table) and send the welcome
// email ourselves via menuqr's existing Google email helper. The bartender
// app's /register?invite={token} page already validates the token and walks
// the new hire through password + handbook setup.
//
// Schema reference (from bartender DB):
//   EmployeeInvite(id, token, email, firstName, lastName, phone, role,
//                  locationId, emailSubject, emailBody, status,
//                  sentAt, viewedAt, usedAt, expiresAt, userId,
//                  invitedById, createdAt, updatedAt)

const crypto = require('crypto');
const { getPool, getLocationIdByMenuqrSlug } = require('./bartenderDb');
const { sendEmailViaGoogle } = require('./helpers');
const { getBrand } = require('./brand');

const BARTENDER_APP_URL = 'https://bartender-app.apps.dramanddraught.com';
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// Map menuqr position → bartender Role enum.
const POSITION_TO_ROLE = {
  Bartender: 'BARTENDER',
  Barback: 'SERVER_BARBACK',
  Server: 'SERVER_BARBACK',
  Host: 'HOST',
  'Floor Manager': 'GENERAL_MANAGER',
  Other: 'OTHER',
};

// All roles the UI lets the admin pick from (matches the bartender Role enum
// values that make sense for new hires).
const ROLE_OPTIONS = [
  { value: 'BARTENDER',        label: 'Bartender' },
  { value: 'SERVER_BARBACK',   label: 'Server / Barback' },
  { value: 'HOST',             label: 'Host' },
  { value: 'HEAD_BARTENDER',   label: 'Head Bartender' },
  { value: 'GENERAL_MANAGER',  label: 'General Manager' },
  { value: 'OTHER',            label: 'Other' },
];

const ROLE_LABELS = ROLE_OPTIONS.reduce((acc, o) => { acc[o.value] = o.label; return acc; }, {});

// First/last name split: trim, split on whitespace, last token is lastName,
// rest joined back into firstName. The bartender User columns are NOT NULL,
// so single-name applicants used to ship as lastName=" " (single space).
// That rendered as a blank "Last name" in the bartender register form, which
// felt broken. Fall back to "—" instead so the candidate sees something
// intentional and can edit it themselves during signup.
function splitName(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: 'Friend', lastName: '—' };
  if (parts.length === 1) return { firstName: parts[0], lastName: '—' };
  return { firstName: parts.slice(0, -1).join(' '), lastName: parts[parts.length - 1] };
}

// Generate a cuid-like id. The bartender User/Invite columns are TEXT with no
// default, and existing rows use cuid format. Any unique string works; we use
// a 24-char base32-style identifier prefixed with a timestamp millis to keep
// it sortable.
function generateId() {
  const ms = Date.now().toString(36);
  const rand = crypto.randomBytes(12).toString('hex');
  return `mqr${ms}${rand}`.slice(0, 32);
}

// Token used in the registration URL. 64 hex chars = 32 bytes of entropy.
function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

// Look up the bartender User.id to attribute the invite to. Try the admin's
// email first; fall back to any active ADMIN user so we never block sending.
async function resolveInvitedById(db, adminEmail) {
  if (adminEmail) {
    const r = await db.query('SELECT id FROM "User" WHERE email = $1 AND "isActive" = true LIMIT 1', [String(adminEmail).toLowerCase()]);
    if (r.rows.length) return r.rows[0].id;
  }
  // Fallback: any active user with an ADMIN UserLocation role.
  const fallback = await db.query(`
    SELECT u.id
      FROM "User" u
      JOIN "UserLocation" ul ON ul."userId" = u.id
     WHERE u."isActive" = true AND ul.role = 'ADMIN'
     ORDER BY u."createdAt" ASC
     LIMIT 1
  `);
  return fallback.rows[0]?.id || null;
}

// Look up an existing PENDING/SENT invite by email so we don't double-create.
async function findActiveInvite(db, email) {
  const r = await db.query(`
    SELECT id, token, status, "sentAt", "expiresAt"
      FROM "EmployeeInvite"
     WHERE email = $1
       AND status IN ('PENDING', 'SENT')
       AND "expiresAt" > NOW()
     ORDER BY "createdAt" DESC
     LIMIT 1
  `, [String(email).toLowerCase()]);
  return r.rows[0] || null;
}

// Block on an existing User row — bartender app's own register API errors
// out with "user with this email already exists" mid-signup if we don't
// catch this here, leaving the candidate confused and the admin thinking
// the invite went through.
async function findExistingUser(db, email) {
  const r = await db.query(
    `SELECT id, "firstName", "lastName", "isActive" FROM "User" WHERE email = $1 LIMIT 1`,
    [String(email).toLowerCase()],
  );
  return r.rows[0] || null;
}

function buildEmailBody({ firstName, locationName, roleLabel, registrationUrl, senderName }) {
  // Mirrors the bartender app's default template so the candidate gets the
  // same onboarding instructions.
  return [
    `Hi ${firstName},`,
    '',
    `Welcome to the team! We're excited to have you join us at ${locationName} as a ${roleLabel}.`,
    '',
    'Step 1: Create your employee account',
    `To begin your onboarding, please create your employee account through our Bartender's Dashboard:`,
    '',
    registrationUrl,
    '',
    'Then install the dashboard app on your phone for quick access:',
    `${getBrand().urls.bartender}/install`,
    '',
    'Step 2: Complete Toast onboarding',
    `After creating your account, you'll receive an email from Toast (our POS/Payroll system) to complete your tax paperwork, intake documents, and set up direct deposit.`,
    '',
    'Step 3: Set up Sling',
    `You'll also receive an email to create your Sling account. This is how you'll view your schedule, request time off, and communicate with the team.`,
    '',
    'Step 4: Schedule your first shift',
    `Once you've completed the above steps, please let us know your availability so we can schedule your first training shift!`,
    '',
    `If you have any questions or run into any issues, don't hesitate to reach out — I'm happy to help!`,
    '',
    'Looking forward to working with you,',
    senderName || getBrand().identity.name,
  ].join('\n');
}

// Main export: create the invite row in the bartender DB and email the
// candidate. Returns { ok, inviteId, token, registrationUrl, reusedExisting,
// error }. Errors are returned (not thrown) so the caller can show a flash.
// Resolve the subject/body actually emailed. A caller-supplied (admin-edited)
// subject/body wins; otherwise we build the default. Placeholders are filled in
// either case, and we guarantee the registration link is present so an edit
// can't accidentally drop the one thing the candidate needs.
function renderInviteEmail(rawSubject, rawBody, ctx) {
  const subject = (rawSubject && String(rawSubject).trim()) || `Welcome to the ${getBrand().identity.name} Team!`;
  let body = (rawBody && String(rawBody).trim()) || buildEmailBody(ctx);
  const repl = {
    '{{registrationUrl}}': ctx.registrationUrl || '',
    '{{firstName}}': ctx.firstName || '',
    '{{locationName}}': ctx.locationName || '',
    '{{roleLabel}}': ctx.roleLabel || '',
    '{{role}}': ctx.roleLabel || '',
    '{{senderName}}': ctx.senderName || '',
  };
  for (const [k, v] of Object.entries(repl)) body = body.split(k).join(v);
  if (ctx.registrationUrl && !body.includes(ctx.registrationUrl)) {
    body += `\n\nCreate your account: ${ctx.registrationUrl}`;
  }
  return { subject, body };
}

async function createAndSendInvite({ application, locationSlug, role, adminEmail, adminName, emailSubject, emailBody, attachments }) {
  try {
    if (!application?.email) return { ok: false, error: 'Applicant has no email on file.' };
    if (!locationSlug) return { ok: false, error: 'Applicant has no location.' };

    const roleEnum = role || POSITION_TO_ROLE[application.position] || 'OTHER';
    const roleLabel = ROLE_LABELS[roleEnum] || roleEnum;
    const senderName = adminName || `${getBrand().identity.name} Hiring`;
    const { firstName, lastName } = splitName(application.name);
    const atts = Array.isArray(attachments) && attachments.length ? attachments : undefined;

    const db = getPool();

    // Block early if a User already exists for this email in the bartender
    // DB. The bartender app's POST /api/employees/invites errors with
    // "a user with this email already exists" — replicate that check here
    // so admins get an honest "already onboarded" message instead of a
    // confusing "we sent an invite but the candidate can't sign up".
    const existingUser = await findExistingUser(db, application.email);
    if (existingUser) {
      return {
        ok: false,
        error: `A bartender-dashboard account already exists for ${application.email}` +
          (existingUser.firstName ? ` (${existingUser.firstName} ${existingUser.lastName})` : '') +
          `. If they need their account re-activated or the password reset, do that in the Bartender Dashboard directly.`,
      };
    }

    // Resolve the bartender location (for the insert + default-body location name).
    const locationId = await getLocationIdByMenuqrSlug(locationSlug);
    let locationName = locationSlug;
    if (locationId) {
      const locRow = await db.query('SELECT name FROM "Location" WHERE id = $1', [locationId]);
      locationName = locRow.rows[0]?.name || locationSlug;
    }

    // De-dupe: if there's already an active invite, reuse its token (don't
    // create a second row) but still (re)send the email — with the edited
    // subject/body + attachment — so "Resend" actually resends.
    const existing = await findActiveInvite(db, application.email);
    if (existing) {
      const registrationUrl = `${BARTENDER_APP_URL}/register?invite=${existing.token}`;
      const { subject, body } = renderInviteEmail(emailSubject, emailBody, { firstName, locationName, roleLabel, registrationUrl, senderName });
      let emailError = null;
      try {
        await sendEmailViaGoogle({ to: application.email, subject, body, attachments: atts });
      } catch (e) {
        emailError = e.message || String(e);
      }
      if (!emailError) {
        await db.query(`UPDATE "EmployeeInvite" SET "emailSubject" = $1, "emailBody" = $2, status = 'SENT', "sentAt" = NOW(), "updatedAt" = NOW() WHERE id = $3`, [subject, body, existing.id]).catch(() => {});
      }
      return {
        ok: true,
        inviteId: existing.id,
        token: existing.token,
        registrationUrl,
        reusedExisting: true,
        sentAt: emailError ? null : new Date(),
        emailError,
      };
    }

    if (!locationId) return { ok: false, error: `Unknown or inactive bartender location for slug "${locationSlug}".` };

    const invitedById = await resolveInvitedById(db, adminEmail);
    if (!invitedById) return { ok: false, error: 'Could not find a bartender admin user to attribute this invite to.' };

    const id = generateId();
    const token = generateToken();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + INVITE_TTL_MS);
    const registrationUrl = `${BARTENDER_APP_URL}/register?invite=${token}`;

    const { subject, body } = renderInviteEmail(emailSubject, emailBody, { firstName, locationName, roleLabel, registrationUrl, senderName });

    // Insert directly into the bartender DB. We store the body we send so the
    // bartender admin UI can show what the candidate received.
    await db.query(`
      INSERT INTO "EmployeeInvite"
        (id, token, email, "firstName", "lastName", phone, role, "locationId",
         "emailSubject", "emailBody", status, "sentAt", "expiresAt",
         "invitedById", "createdAt", "updatedAt")
      VALUES
        ($1,  $2,    $3,    $4,         $5,        $6,    $7::"Role", $8,
         $9,           $10,         'SENT',  $11,    $12,
         $13,         NOW(),      NOW())
    `, [
      id, token, String(application.email).toLowerCase(), firstName, lastName, application.phone || null,
      roleEnum, locationId,
      subject, body, now, expiresAt,
      invitedById,
    ]);

    // Send the email after the row is persisted — failure here doesn't
    // invalidate the invite (admin can resend), but we surface the error so
    // the caller can flag it.
    let emailError = null;
    try {
      await sendEmailViaGoogle({ to: application.email, subject, body, attachments: atts });
    } catch (e) {
      emailError = e.message || String(e);
      // Drop the invite back to PENDING so it's obvious the email didn't send.
      await db.query(`UPDATE "EmployeeInvite" SET status = 'PENDING', "sentAt" = NULL WHERE id = $1`, [id]).catch(() => {});
    }

    return {
      ok: true,
      inviteId: id,
      token,
      registrationUrl,
      reusedExisting: false,
      sentAt: emailError ? null : now,
      emailError,
    };
  } catch (err) {
    console.error('[bartenderInvite] createAndSendInvite failed:', err.message);
    return { ok: false, error: err.message };
  }
}

// Pull the latest status of an invite for the detail view (used to show
// "Viewed" / "Completed" / "Expired" without depending on a webhook).
async function fetchInviteStatus(inviteId) {
  if (!inviteId) return null;
  try {
    const db = getPool();
    const r = await db.query(`
      SELECT id, status, "sentAt", "viewedAt", "usedAt", "expiresAt", "userId"
        FROM "EmployeeInvite"
       WHERE id = $1
       LIMIT 1
    `, [inviteId]);
    return r.rows[0] || null;
  } catch (err) {
    console.warn('[bartenderInvite] fetchInviteStatus failed:', err.message);
    return null;
  }
}

module.exports = {
  createAndSendInvite,
  fetchInviteStatus,
  POSITION_TO_ROLE,
  ROLE_OPTIONS,
  ROLE_LABELS,
  BARTENDER_APP_URL,
};
