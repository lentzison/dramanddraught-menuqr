const { sendEmailViaGoogle, getLocations } = require('./helpers');
const { getBrand } = require('./brand');
const { getGeneralManagerEmailsForLocation } = require('./bartenderDb');

const COMPANY_RECIPIENTS = ['carrie@dramanddraught.com', 'lentz@dramanddraught.com'];
const MENUQR_BASE_URL = process.env.MENUQR_BASE_URL || getBrand().urls.menuqr;

// In-memory marker so the poll fires once per Eastern calendar day.
// On a server restart we may resend if the restart lands in the 9 AM Eastern window;
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

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderApplicantRow(app) {
  const phone = app.phone ? ` &middot; ${escapeHtml(app.phone)}` : '';
  return `
    <tr>
      <td style="padding:12px 0;border-bottom:1px solid #f0ece4;">
        <div style="font-weight:600;font-size:14px;color:#1a1a1a;">${escapeHtml(app.name)}</div>
        <div style="color:#555;font-size:13px;margin-top:2px;">
          ${escapeHtml(positionLabel(app))} &middot;
          <a href="mailto:${escapeHtml(app.email)}" style="color:#5b3a1a;text-decoration:none;">${escapeHtml(app.email)}</a>${phone}
        </div>
        <div style="color:#888;font-size:12px;margin-top:2px;">Applied ${escapeHtml(easternTime(app.createdAt))} Eastern</div>
      </td>
    </tr>`;
}

function renderLocationSection(location, applications) {
  const dashboardUrl = `${MENUQR_BASE_URL}/admin/applicants?location=${encodeURIComponent(location.slug)}&status=new`;
  const count = applications.length;
  const countLabel = count === 0
    ? '<span style="color:#888;font-weight:400;font-style:italic;">No new applicants</span>'
    : `<span style="color:#5b3a1a;">${count} new</span>`;

  const body = count === 0
    ? '<p style="color:#888;font-style:italic;font-size:13px;margin:6px 0 12px 0;">No applications received yesterday.</p>'
    : `<table cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;margin-bottom:12px;">
        ${applications.map(renderApplicantRow).join('')}
      </table>`;

  return `
    <div style="margin-bottom:28px;">
      <h2 style="font-size:15px;color:#5b3a1a;margin:0 0 8px 0;padding-bottom:6px;border-bottom:1px solid #d8d2c4;letter-spacing:0.02em;">
        ${escapeHtml(location.name)} &middot; ${countLabel}
      </h2>
      ${body}
      <a href="${dashboardUrl}" style="display:inline-block;padding:7px 14px;background:#c8a155;color:#1a1a1a;text-decoration:none;border-radius:4px;font-weight:600;font-size:13px;">
        Open ${escapeHtml(location.name)} dashboard &rarr;
      </a>
    </div>`;
}

// Speed-to-contact SLA: applicants sitting in the early pipeline with no
// logged contact for 48+ hours. Bar staff get hired elsewhere in days — this
// is the section a GM should act on first.
function renderSlaSection(slaApps, locationsById) {
  if (!slaApps.length) return '';
  const rows = slaApps.map((app) => {
    const days = Math.floor((Date.now() - new Date(app.createdAt).getTime()) / (24 * 60 * 60 * 1000));
    const loc = locationsById.get(app.locationId);
    const phone = app.phone ? ` &middot; ${escapeHtml(app.phone)}` : '';
    return `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #f0ece4;">
        <div style="font-weight:600;font-size:14px;color:#1a1a1a;">
          ${escapeHtml(app.name)}
          <span style="color:#b3541e;font-size:12px;font-weight:700;margin-left:6px;">⏱ ${days} day${days === 1 ? '' : 's'}, not contacted</span>
        </div>
        <div style="color:#555;font-size:13px;margin-top:2px;">
          ${escapeHtml(positionLabel(app))}${loc ? ` &middot; ${escapeHtml(loc.name)}` : ''}${phone}
        </div>
        <div style="margin-top:4px;">
          <a href="${MENUQR_BASE_URL}/admin/applicants/${escapeHtml(app.id)}" style="color:#5b3a1a;font-size:12px;">Open applicant &rarr;</a>
        </div>
      </td>
    </tr>`;
  }).join('');
  return `
    <div style="margin-bottom:28px;padding:14px 16px;background:#fdf3ec;border:1px solid #ecd2bd;border-radius:6px;">
      <h2 style="font-size:15px;color:#b3541e;margin:0 0 8px 0;letter-spacing:0.02em;">⏱ Waiting on first contact (48h+)</h2>
      <p style="color:#7a5c42;font-size:12px;margin:0 0 8px 0;">Good candidates take another job in days — a quick call or text keeps them warm.</p>
      <table cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;">${rows}</table>
    </div>`;
}

function renderEmailHtml({ yesterdayHuman, totalApplicants, locationSections, slaSection = '' }) {
  const summary = totalApplicants === 0
    ? 'No new applicants yesterday.'
    : `<strong>${totalApplicants}</strong> new applicant${totalApplicants === 1 ? '' : 's'} yesterday.`;

  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#faf7f1;">
<div style="max-width:600px;margin:0 auto;padding:32px 28px;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1a1a1a;line-height:1.5;">
  <div style="border-bottom:3px solid #c8a155;padding-bottom:14px;margin-bottom:22px;">
    <h1 style="margin:0;font-size:22px;color:#1a1a1a;font-weight:700;">Daily Applicant Recap</h1>
    <p style="margin:6px 0 0 0;color:#888;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;">${escapeHtml(yesterdayHuman)}</p>
  </div>

  <p style="font-size:15px;margin:0 0 28px 0;">${summary}</p>

  ${slaSection}

  ${locationSections}

  <p style="margin-top:32px;padding-top:14px;border-top:1px solid #d8d2c4;color:#888;font-size:11px;letter-spacing:0.02em;">
    Dram &amp; Draught &middot; Automated daily recap of yesterday&rsquo;s job applications
  </p>
</div>
</body></html>`;
}

async function runApplicantDailyRecap(prisma) {
  if (!prisma) return;

  if (easternHour() !== 9) return;
  const todayKey = easternDateKey();
  if (lastRecapDateKey === todayKey) return;
  lastRecapDateKey = todayKey;

  try {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const yesterdayKey = easternDateKey(yesterday);
    const yesterdayHuman = easternHumanDate(yesterday);

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

    // Speed-to-contact SLA breaches: early-pipeline applicants with no logged
    // contact 48h+ after applying. Fetched regardless of yesterday's volume —
    // a quiet day is exactly when the backlog should be called out.
    const slaCutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const slaCandidates = await prisma.jobApplication.findMany({
      where: {
        status: { in: ['new', 'reviewing'] },
        createdAt: { lte: slaCutoff },
      },
      orderBy: { createdAt: 'asc' },
      take: 200,
    }).catch(() => []);
    const slaApps = slaCandidates.filter((app) => !Array.isArray(app.contactLog) || app.contactLog.length === 0);

    if (yesterdayApps.length === 0 && slaApps.length === 0) {
      console.log('[applicant recap] no applicants yesterday and no SLA breaches; skipping send');
      return;
    }

    const locations = await getLocations(prisma);
    const locationsById = new Map(locations.map((l) => [l.id, l]));
    const slaLocationIds = new Set(slaApps.map((a) => a.locationId));
    const locationsWithApps = locations.filter((loc) => (byLocation.get(loc.id) || []).length > 0 || slaLocationIds.has(loc.id));

    const gmEmails = new Set();
    const locationSections = [];
    for (const location of locationsWithApps) {
      const apps = byLocation.get(location.id) || [];
      if (apps.length) locationSections.push(renderLocationSection(location, apps));
      try {
        const gms = await getGeneralManagerEmailsForLocation(location.slug);
        for (const email of gms) gmEmails.add(email);
      } catch (err) {
        console.warn(`[applicant recap] could not fetch GMs for ${location.slug}:`, err.message);
      }
    }

    const recipients = Array.from(new Set([...gmEmails, ...COMPANY_RECIPIENTS]));
    if (recipients.length === 0) {
      console.warn('[applicant recap] no recipients resolved; skipping send');
      return;
    }

    const slaSuffix = slaApps.length ? ` — ⏱ ${slaApps.length} awaiting first contact` : '';
    const subject = `Daily applicant recap — ${yesterdayHuman} — ${yesterdayApps.length} new${slaSuffix}`;

    const html = renderEmailHtml({
      yesterdayHuman,
      totalApplicants: yesterdayApps.length,
      locationSections: locationSections.join(''),
      slaSection: renderSlaSection(slaApps, locationsById),
    });

    try {
      await sendEmailViaGoogle({ to: recipients, subject, body: html, html: true });
      console.log(`[applicant recap] sent (${yesterdayApps.length} applicants across ${locationsWithApps.length} locations, ${recipients.length} recipients)`);
    } catch (err) {
      console.warn('[applicant recap] send failed:', err.message);
    }
  } catch (err) {
    console.warn('[applicant recap] error:', err.message);
  }
}

// A rejected background run must never reach the process-level handler as an
// unhandled rejection; log it with its job name and let the next tick retry.
function guard(err) {
  console.error('[applicant-recap] run failed:', err && err.stack ? err.stack : err);
}

function scheduleApplicantDailyRecap(prisma) {
  runApplicantDailyRecap(prisma).catch(guard);
  setInterval(() => runApplicantDailyRecap(prisma).catch(guard), 5 * 60 * 1000);
}

module.exports = { runApplicantDailyRecap, scheduleApplicantDailyRecap };
