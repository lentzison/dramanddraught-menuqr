// Sends a one-off "please complete the new questionnaire" email to every
// applicant who already exists in the system but hasn't filled out the
// hospitality questionnaire yet.
//
// Eligibility:
//   - JobApplication has no JobApplicationQuestionnaire row yet
//   - status is "new" or "reviewing" (skip hired/rejected/withdrawn/etc.)
//   - has an email address
//   - questionnaireInviteSentAt is null (we have not already emailed them via
//     this flow). Pass --force to re-send to people we already nudged.
//
// On each successful send, the applicant's questionnaireInviteSentAt is
// updated so re-runs are idempotent.
//
// Usage (dry-run by default; prints what would be sent):
//   node scripts/invite-existing-applicants-to-questionnaire.js
//
// To actually send:
//   node scripts/invite-existing-applicants-to-questionnaire.js --send
//
// Optional filters:
//   --location=greensboro       only this location slug
//   --before=2026-05-12         only applications created strictly before this date (ISO)
//   --force                     also include applicants who were already invited
//
// Requires DATABASE_URL + Gmail service-account env vars to be present.

const path = require('path');
const { sendEmailViaGoogle } = require(path.join('..', 'helpers'));
const prisma = require(path.join('..', 'db'));

const MENUQR_BASE_URL = process.env.MENUQR_BASE_URL || 'https://menuqr.apps.dramanddraught.com';
const ACTIVE_STATUSES = ['new', 'reviewing'];

function parseArgs() {
  const out = { send: false, location: null, before: null, force: false };
  for (const arg of process.argv.slice(2)) {
    if (arg === '--send') out.send = true;
    else if (arg === '--force') out.force = true;
    else if (arg.startsWith('--location=')) out.location = arg.slice('--location='.length);
    else if (arg.startsWith('--before=')) out.before = new Date(arg.slice('--before='.length));
  }
  return out;
}

function buildEmail(application, location) {
  const url = `${MENUQR_BASE_URL}/apply/q/${application.id}`;
  const firstName = (application.name || '').split(' ')[0] || 'there';
  const positionPhrase = application.position
    ? `for the ${application.position}${application.position === 'Other' && application.positionOther ? ` (${application.positionOther})` : ''} role`
    : '';
  const body = [
    `Hi ${firstName},`,
    '',
    `Thanks again for applying to Dram & Draught – ${location.name}${positionPhrase ? ' ' + positionPhrase : ''}.`,
    '',
    "We added a short hospitality questionnaire to our hiring process and we'd love to see your answers before we move forward. It takes about 10 minutes.",
    '',
    `Complete it here: ${url}`,
    '',
    "If the link doesn't work, just reply to this email and we'll send a fresh one.",
    '',
    'Cheers,',
    'Dram & Draught',
  ].join('\n');
  return {
    to: application.email,
    subject: `One more step for your Dram & Draught application`,
    body,
  };
}

async function main() {
  const args = parseArgs();

  const where = {
    questionnaire: { is: null },
    status: { in: ACTIVE_STATUSES },
    email: { not: '' },
  };
  if (!args.force) {
    where.questionnaireInviteSentAt = null;
  }
  if (args.before) {
    where.createdAt = { lt: args.before };
  }
  if (args.location) {
    const loc = await prisma.location.findFirst({ where: { slug: args.location } });
    if (!loc) {
      console.error(`No location found with slug "${args.location}".`);
      process.exit(1);
    }
    where.locationId = loc.id;
  }

  const applications = await prisma.jobApplication.findMany({
    where,
    include: { location: { select: { id: true, name: true, slug: true } } },
    orderBy: { createdAt: 'asc' },
  });

  if (applications.length === 0) {
    console.log('No eligible applicants found.');
    return;
  }

  console.log(`Found ${applications.length} eligible applicant(s).`);
  if (!args.send) {
    console.log('\n--- DRY RUN (no emails will be sent). Pass --send to actually send. ---\n');
  }

  let sent = 0;
  let failed = 0;
  for (const application of applications) {
    if (!application.email) {
      console.log(`  · skip (no email): ${application.name}`);
      continue;
    }
    const { to, subject, body } = buildEmail(application, application.location);
    if (!args.send) {
      console.log(`  · would email ${to}  (${application.location.name} · ${application.position || 'unspecified'})`);
      continue;
    }
    try {
      const result = await sendEmailViaGoogle({ to, subject, body });
      if (result && result.ok === false) {
        failed++;
        console.warn(`  · FAILED ${to}: ${result.reason || 'unknown'} ${result.detail ? '— ' + result.detail : ''}`);
      } else {
        sent++;
        await prisma.jobApplication
          .update({
            where: { id: application.id },
            data: { questionnaireInviteSentAt: new Date() },
          })
          .catch((err) => console.warn(`  · could not stamp invite-sent for ${to}: ${err.message}`));
        console.log(`  → ${to}  (${application.location.name})`);
      }
    } catch (err) {
      failed++;
      console.warn(`  · FAILED ${to}: ${err.message}`);
    }
  }

  if (args.send) {
    console.log(`\nDone. Sent ${sent}, failed ${failed}.`);
  } else {
    console.log(`\nDry run complete. Pass --send to email all ${applications.length} applicant(s).`);
  }
}

main()
  .catch((err) => {
    console.error('Error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => {});
  });
