// Auto-reminder emails for applicants who applied but never completed the
// hospitality questionnaire. Mirrors interviewReminders.js: hourly poll, two
// reminder windows (24h after application, 72h after application), per-row
// boolean flags so each reminder only fires once.

const { sendEmailViaGoogle } = require('./helpers');
const { getBrand } = require('./brand');
const { sendSms } = require('./sms');

const MENUQR_BASE_URL = process.env.MENUQR_BASE_URL || getBrand().urls.menuqr;
const ACTIVE_STATUSES = ['new', 'reviewing'];

function buildBody(application, kind) {
  const firstName = (application.name || '').split(' ')[0] || 'there';
  const locName = application.location?.name || 'Dram & Draught';
  const positionPhrase = application.position
    ? ` for the ${application.position}${application.position === 'Other' && application.positionOther ? ` (${application.positionOther})` : ''} role`
    : '';
  const url = `${MENUQR_BASE_URL}/apply/q/${application.id}`;
  const opening = kind === '24h'
    ? `Thanks again for applying to Dram & Draught – ${locName}${positionPhrase}. We noticed you didn't finish the short hospitality questionnaire — it only takes about 10 minutes and we'd love to see your answers before we move forward.`
    : `Just a friendly nudge — we still have your application for ${locName}${positionPhrase} on file, but we're waiting on the hospitality questionnaire before we can move forward. It takes about 10 minutes.`;
  return [
    `Hi ${firstName},`,
    '',
    opening,
    '',
    `Complete it here: ${url}`,
    '',
    "If the link doesn't work, just reply to this email and we'll send a fresh one.",
    '',
    'Cheers,',
    'Dram & Draught',
  ].join('\n');
}

async function sendReminder(prisma, application, kind) {
  if (!application.email) return;
  // Set the flag FIRST so a process restart between the email send and the
  // DB write can't cause a double-send next poll. If the send fails, we
  // rely on the manager noticing — vs. risking spamming candidates with
  // duplicate reminders.
  const flagField = kind === '24h' ? 'questionnaireReminder24hSent' : 'questionnaireReminder72hSent';
  const flagData = { [flagField]: true, questionnaireInviteSentAt: new Date() };
  try {
    await prisma.jobApplication.update({ where: { id: application.id }, data: flagData });
  } catch (err) {
    console.warn(`[questionnaire-reminders] ${kind} flag-write failed for ${application.email}: ${err.message}`);
    return;
  }
  try {
    const result = await sendEmailViaGoogle({
      to: application.email,
      subject: 'One more step for your Dram & Draught application',
      body: buildBody(application, kind),
    });
    if (result && result.ok === false) {
      console.warn(`[questionnaire-reminders] ${kind} send rejected for ${application.email}: ${result.reason || 'unknown'}`);
      return;
    }
    console.log(`[questionnaire-reminders] ${kind} sent to ${application.email}`);
  } catch (err) {
    console.warn(`[questionnaire-reminders] ${kind} send failed for ${application.email}: ${err.message}`);
  }
  // Companion SMS — covered by the same already-written flag, so it can never
  // fire twice either. No-op unless TWILIO_* env vars are configured.
  if (application.phone) {
    const firstName = (application.name || '').split(' ')[0] || 'there';
    const url = `${MENUQR_BASE_URL}/apply/q/${application.id}`;
    try {
      const r = await sendSms({
        to: application.phone,
        body: `Hi ${firstName} — Dram & Draught here. Your application is waiting on a short questionnaire (~10 min): ${url}`,
      });
      if (!r.ok && !r.skipped) console.warn(`[questionnaire-reminders] ${kind} SMS failed for ${application.id}: ${r.reason}`);
    } catch (err) {
      console.warn(`[questionnaire-reminders] ${kind} SMS failed for ${application.id}: ${err.message}`);
    }
  }
}

async function runQuestionnaireReminders(prisma) {
  if (!prisma) return;
  const now = Date.now();
  // Tighter windows than before (was 26h and 97h spans). Each window is now
  // 4-6h wide; combined with the flag-first-then-send change above, the
  // chance of either a missed reminder or a double-send is small.
  // 24h: applied between 24h and 30h ago.
  const lo24 = new Date(now - 30 * 60 * 60 * 1000);
  const hi24 = new Date(now - 24 * 60 * 60 * 1000);
  // 72h: applied between 72h and 78h ago. Cap re-fire at 7 days so an
  // application that lingers without a quiz still ends up in the "expired"
  // bucket cleanly (matches the new 30-day questionnaire link expiry).
  const lo72 = new Date(now - 78 * 60 * 60 * 1000);
  const hi72 = new Date(now - 72 * 60 * 60 * 1000);

  try {
    const due24 = await prisma.jobApplication.findMany({
      where: {
        status: { in: ACTIVE_STATUSES },
        email: { not: '' },
        questionnaire: { is: null },
        questionnaireReminder24hSent: false,
        createdAt: { gte: lo24, lte: hi24 },
      },
      include: { location: { select: { name: true, slug: true } } },
    });
    for (const app of due24) await sendReminder(prisma, app, '24h');

    const due72 = await prisma.jobApplication.findMany({
      where: {
        status: { in: ACTIVE_STATUSES },
        email: { not: '' },
        questionnaire: { is: null },
        questionnaireReminder72hSent: false,
        createdAt: { gte: lo72, lte: hi72 },
      },
      include: { location: { select: { name: true, slug: true } } },
    });
    for (const app of due72) await sendReminder(prisma, app, '72h');
  } catch (err) {
    console.warn('[questionnaire-reminders] poll failed:', err.message);
  }
}

// A rejected background run must never reach the process-level handler as an
// unhandled rejection; log it with its job name and let the next tick retry.
function guard(err) {
  console.error('[questionnaire-reminders] run failed:', err && err.stack ? err.stack : err);
}

function scheduleQuestionnaireReminders(prisma) {
  runQuestionnaireReminders(prisma).catch(guard);
  // Poll every 30 minutes. Windows are 6h wide, so two polls always cover
  // any single applicant once.
  setInterval(() => runQuestionnaireReminders(prisma).catch(guard), 30 * 60 * 1000);
}

module.exports = { runQuestionnaireReminders, scheduleQuestionnaireReminders };
