// Auto-reminder emails for applicants who applied but never completed the
// hospitality questionnaire. Mirrors interviewReminders.js: hourly poll, two
// reminder windows (24h after application, 72h after application), per-row
// boolean flags so each reminder only fires once.

const { sendEmailViaGoogle } = require('./helpers');

const MENUQR_BASE_URL = process.env.MENUQR_BASE_URL || 'https://menuqr.apps.dramanddraught.com';
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
    const data = kind === '24h'
      ? { questionnaireReminder24hSent: true }
      : { questionnaireReminder72hSent: true };
    // Also stamp questionnaireInviteSentAt so manual "Send invites" buttons
    // skip this person on the next click.
    data.questionnaireInviteSentAt = new Date();
    await prisma.jobApplication.update({ where: { id: application.id }, data });
    console.log(`[questionnaire-reminders] ${kind} sent to ${application.email}`);
  } catch (err) {
    console.warn(`[questionnaire-reminders] ${kind} send failed for ${application.email}: ${err.message}`);
  }
}

async function runQuestionnaireReminders(prisma) {
  if (!prisma) return;
  const now = Date.now();
  // 24h window: applied between 23h and 49h ago, no quiz, no 24h reminder yet.
  const lo24 = new Date(now - 49 * 60 * 60 * 1000);
  const hi24 = new Date(now - 23 * 60 * 60 * 1000);
  // 72h window: applied between 71h and 168h ago (cap at 7 days), no quiz, no 72h reminder yet.
  const lo72 = new Date(now - 168 * 60 * 60 * 1000);
  const hi72 = new Date(now - 71 * 60 * 60 * 1000);

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

function scheduleQuestionnaireReminders(prisma) {
  runQuestionnaireReminders(prisma);
  // Hourly poll. Plenty of resolution since each reminder window is ~24h wide.
  setInterval(() => runQuestionnaireReminders(prisma), 60 * 60 * 1000);
}

module.exports = { runQuestionnaireReminders, scheduleQuestionnaireReminders };
