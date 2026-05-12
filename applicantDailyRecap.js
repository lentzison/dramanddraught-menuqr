const { sendEmailViaGoogle, getLocations } = require('./helpers');
const { getGeneralManagerEmailsForLocation } = require('./bartenderDb');

const COMPANY_RECIPIENTS = ['carrie@dramanddraught.com', 'lentz@dramanddraught.com'];

// In-memory marker so the hourly poll only fires once per Eastern calendar day.
// On a server restart we may resend if the restart lands between 9am and 10am Eastern;
// that's acceptable.
let lastRecapDateKey = null;

function easternHour(date = new Date()) {
  return parseInt(
    date.toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false }),
    10,
  );
}

function easternDateKey(date = new Date()) {
  return date.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

function easternHumanDate(date) {
  return date.toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    weekday: 'long', month: 'long', day: 'numeric',
  });
}

function easternTime(date) {
  return date.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric', minute: '2-digit',
  });
}

function positionLabel(app) {
  if (app.position === 'Other' && app.positionOther) return app.positionOther;
  return app.position || 'Unspecified';
}

function buildBody(location, applications, yesterdayHuman) {
  const dashboardPath = `/admin/applicants?location=${location.slug}&status=new`;
  if (applications.length === 0) {
    return [
      `No new applicants for ${location.name} on ${yesterdayHuman}.`,
      '',
      `Open the dashboard: ${dashboardPath}`,
      '',
      '— Dram & Draught',
    ].join('\n');
  }
  const lines = [
    `${applications.length} new applicant${applications.length === 1 ? '' : 's'} for ${location.name} on ${yesterdayHuman}:`,
    '',
  ];
  applications.forEach((app, i) => {
    const phone = app.phone ? ` · ${app.phone}` : '';
    lines.push(`${i + 1}. ${app.name}`);
    lines.push(`   ${positionLabel(app)} · ${app.email}${phone}`);
    lines.push(`   Applied ${easternTime(app.createdAt)} (Eastern)`);
    lines.push('');
  });
  lines.push(`Open the dashboard: ${dashboardPath}`);
  lines.push('');
  lines.push('— Dram & Draught');
  return lines.join('\n');
}

async function runApplicantDailyRecap(prisma) {
  if (!prisma) return;

  // Time gate: only fire at 9 AM Eastern, once per Eastern calendar day.
  if (easternHour() !== 9) return;
  const todayKey = easternDateKey();
  if (lastRecapDateKey === todayKey) return;
  lastRecapDateKey = todayKey;

  try {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const yesterdayKey = easternDateKey(yesterday);
    const yesterdayHuman = easternHumanDate(yesterday);

    // Pull applications from a UTC window wide enough to cover the entire
    // previous Eastern calendar day regardless of DST, then filter by Eastern date.
    const since = new Date(Date.now() - 36 * 60 * 60 * 1000);
    const recent = await prisma.jobApplication.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: 'asc' },
    });
    const yesterdayApps = recent.filter(
      (app) => easternDateKey(app.createdAt) === yesterdayKey,
    );

    const byLocation = new Map();
    for (const app of yesterdayApps) {
      const list = byLocation.get(app.locationId) || [];
      list.push(app);
      byLocation.set(app.locationId, list);
    }

    const locations = await getLocations(prisma);
    for (const location of locations) {
      const apps = byLocation.get(location.id) || [];
      let gmEmails = [];
      try {
        gmEmails = await getGeneralManagerEmailsForLocation(location.slug);
      } catch (err) {
        console.warn(`[applicant recap] could not fetch GMs for ${location.slug}:`, err.message);
      }
      const recipients = Array.from(new Set([...gmEmails, ...COMPANY_RECIPIENTS]));
      if (recipients.length === 0) continue;

      const subject = `Daily applicant recap — ${location.name} — ${yesterdayHuman}`;
      const body = buildBody(location, apps, yesterdayHuman);

      try {
        await sendEmailViaGoogle({ to: recipients, subject, body });
        console.log(`[applicant recap] sent for ${location.slug} (${apps.length} applicants)`);
      } catch (err) {
        console.warn(`[applicant recap] send failed for ${location.slug}:`, err.message);
      }
    }
  } catch (err) {
    console.warn('[applicant recap] error:', err.message);
  }
}

function scheduleApplicantDailyRecap(prisma) {
  runApplicantDailyRecap(prisma);
  setInterval(() => runApplicantDailyRecap(prisma), 5 * 60 * 1000);
}

module.exports = { runApplicantDailyRecap, scheduleApplicantDailyRecap };