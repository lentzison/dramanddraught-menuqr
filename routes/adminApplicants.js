const { sendHTML, parseBody, redirect, getFlashMsg, sendEmailViaGoogle } = require('../helpers');
const { requireAuth, isCompanyWide, getUserLocationSlugs } = require('../auth');
const { applicantsList, applicantDetail, STATUS_LABELS } = require('../views/adminApplicantsViews');
const { writeAudit } = require('../auditLog');

const VALID_STATUSES = new Set(Object.keys(STATUS_LABELS));
const VALID_INTERVIEW_TYPES = new Set(['in_person', 'phone', 'video']);

// Mirror parseDateTimeLocal in adminEvents.js — preserves Eastern wall-clock time.
function getEasternOffsetMinutes(year, month, day) {
  const probe = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  const formatted = probe.toLocaleString('en-US', { timeZone: 'America/New_York', timeZoneName: 'short' });
  return formatted.endsWith('EDT') ? -240 : -300;
}

function parseDateTimeLocal(value) {
  if (!value) return null;
  const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return null;
  const year = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  const day = parseInt(m[3], 10);
  const hour = parseInt(m[4], 10);
  const minute = parseInt(m[5], 10);
  if ([year, month, day, hour, minute].some((n) => Number.isNaN(n))) return null;
  const offsetMin = getEasternOffsetMinutes(year, month, day);
  const utcMs = Date.UTC(year, month - 1, day, hour, minute, 0) - offsetMin * 60 * 1000;
  const d = new Date(utcMs);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatEasternDateTime(date) {
  if (!date) return '';
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

function flashRedirect(res, baseUrl, type, text) {
  const sep = baseUrl.includes('?') ? '&' : '?';
  redirect(res, `${baseUrl}${sep}msg=${encodeURIComponent(`${type}|${text}`)}`);
}

function decodeFlash(req) {
  const msg = getFlashMsg(req.url);
  if (!msg) return null;
  const raw = String(msg);
  const idx = raw.indexOf('|');
  if (idx > 0) return { type: raw.slice(0, idx), text: raw.slice(idx + 1) };
  return { type: 'success', text: raw };
}

async function handleAdminApplicants(req, res, pathname, prisma) {
  if (!pathname.startsWith('/admin/applicants')) return false;

  const user = requireAuth(req, res);
  if (!user) { redirect(res, '/admin/login'); return true; }
  if (!prisma) { sendHTML(res, 500, '<p>DB not available</p>'); return true; }

  const userIsCompanyWide = isCompanyWide(user);
  const userSlugs = userIsCompanyWide ? null : getUserLocationSlugs(user);

  const locWhere = { isActive: true };
  if (!userIsCompanyWide) {
    locWhere.slug = { in: userSlugs.length ? userSlugs : ['__none__'] };
  }
  const locations = await prisma.location.findMany({
    where: locWhere,
    orderBy: { name: 'asc' },
    select: { id: true, slug: true, name: true },
  }).catch(() => []);
  const allowedLocationIds = new Set(locations.map(l => l.id));

  const applicationLocationGate = userIsCompanyWide
    ? {}
    : { locationId: { in: locations.map(l => l.id).length ? locations.map(l => l.id) : ['__none__'] } };

  // ─── Resume download: /admin/applicants/:id/resume ───
  const resumeMatch = pathname.match(/^\/admin\/applicants\/([0-9a-f-]{8,})\/resume$/i);
  if (resumeMatch) {
    const id = resumeMatch[1];
    const app = await prisma.jobApplication.findUnique({ where: { id } }).catch(() => null);
    if (!app || (!userIsCompanyWide && !allowedLocationIds.has(app.locationId))) {
      sendHTML(res, 404, '<h1>Not found</h1>');
      return true;
    }
    if (!app.resumeData) {
      sendHTML(res, 404, '<h1>No resume on file</h1>');
      return true;
    }
    const m = String(app.resumeData).match(/^data:([^;]+);base64,([A-Za-z0-9+/=]+)$/);
    if (!m) {
      sendHTML(res, 500, '<h1>Resume could not be decoded</h1>');
      return true;
    }
    const buf = Buffer.from(m[2], 'base64');
    const fileName = (app.resumeFileName || 'resume').replace(/[^A-Za-z0-9._-]+/g, '_');
    res.writeHead(200, {
      'Content-Type': m[1],
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Content-Length': buf.length,
    });
    res.end(buf);
    return true;
  }

  // ─── Status change: POST /admin/applicants/:id/status ───
  const statusMatch = pathname.match(/^\/admin\/applicants\/([0-9a-f-]{8,})\/status$/i);
  if (statusMatch && req.method === 'POST') {
    const id = statusMatch[1];
    const app = await prisma.jobApplication.findUnique({ where: { id } }).catch(() => null);
    if (!app || (!userIsCompanyWide && !allowedLocationIds.has(app.locationId))) {
      sendHTML(res, 404, '<h1>Not found</h1>');
      return true;
    }
    const body = await parseBody(req);
    const next = String(body.status || '').trim();
    if (!VALID_STATUSES.has(next)) {
      flashRedirect(res, `/admin/applicants/${id}`, 'error', 'Unknown status.');
      return true;
    }
    await prisma.jobApplication.update({
      where: { id },
      data: {
        status: next,
        decisionBy: user.email || null,
        decisionAt: new Date(),
        decisionNote: body.note ? String(body.note).slice(0, 1000) : null,
      },
    });
    writeAudit(prisma, req, user, {
      action: 'update',
      resourceType: 'jobApplication',
      resourceId: id,
      resourceLabel: `${app.name} — ${app.position}`,
      details: { from: app.status, to: next },
    }).catch(() => {});
    flashRedirect(res, `/admin/applicants/${id}`, 'success', `Moved to ${STATUS_LABELS[next] || next}.`);
    return true;
  }

  // ─── Internal notes: POST /admin/applicants/:id/notes ───
  const notesMatch = pathname.match(/^\/admin\/applicants\/([0-9a-f-]{8,})\/notes$/i);
  if (notesMatch && req.method === 'POST') {
    const id = notesMatch[1];
    const app = await prisma.jobApplication.findUnique({ where: { id } }).catch(() => null);
    if (!app || (!userIsCompanyWide && !allowedLocationIds.has(app.locationId))) {
      sendHTML(res, 404, '<h1>Not found</h1>');
      return true;
    }
    const body = await parseBody(req);
    await prisma.jobApplication.update({
      where: { id },
      data: { internalNotes: body.internalNotes ? String(body.internalNotes).slice(0, 8000) : null },
    });
    flashRedirect(res, `/admin/applicants/${id}`, 'success', 'Notes saved.');
    return true;
  }

  // ─── Schedule new interview: POST /admin/applicants/:id/interviews ───
  const newInterviewMatch = pathname.match(/^\/admin\/applicants\/([0-9a-f-]{8,})\/interviews$/i);
  if (newInterviewMatch && req.method === 'POST') {
    const id = newInterviewMatch[1];
    const app = await prisma.jobApplication.findUnique({
      where: { id },
      include: { location: { select: { id: true, name: true, slug: true } } },
    }).catch(() => null);
    if (!app || (!userIsCompanyWide && !allowedLocationIds.has(app.locationId))) {
      sendHTML(res, 404, '<h1>Not found</h1>');
      return true;
    }
    const body = await parseBody(req);
    const scheduledAt = parseDateTimeLocal(body.scheduledAt);
    if (!scheduledAt) {
      flashRedirect(res, `/admin/applicants/${id}`, 'error', 'A valid date and time is required.');
      return true;
    }
    if (scheduledAt.getTime() < Date.now() - 5 * 60 * 1000) {
      flashRedirect(res, `/admin/applicants/${id}`, 'error', 'Pick a date/time in the future.');
      return true;
    }
    const type = VALID_INTERVIEW_TYPES.has(String(body.type)) ? body.type : 'in_person';
    const duration = (() => {
      const n = parseInt(body.durationMinutes, 10);
      return Number.isFinite(n) && n >= 15 && n <= 240 ? n : 30;
    })();
    const interviewerEmail = String(body.interviewerEmail || '').trim().slice(0, 200) || (user?.email || null);
    const locationDetail = String(body.locationDetail || '').trim().slice(0, 500) || null;
    const candidateNote = String(body.candidateNote || '').trim().slice(0, 1000) || null;

    const interview = await prisma.interview.create({
      data: {
        applicationId: app.id,
        locationId: app.locationId,
        scheduledAt,
        durationMinutes: duration,
        type,
        locationDetail,
        interviewerEmail,
        candidateNote,
        status: 'scheduled',
        confirmationSentAt: new Date(),
      },
    });

    // Move applicant pipeline forward unless they're already past interview.
    const advance = ['new', 'reviewing'].includes(app.status);
    if (advance) {
      await prisma.jobApplication.update({
        where: { id: app.id },
        data: {
          status: 'interview_scheduled',
          decisionBy: user.email || null,
          decisionAt: new Date(),
        },
      });
    }

    writeAudit(prisma, req, user, {
      action: 'create',
      resourceType: 'interview',
      resourceId: interview.id,
      resourceLabel: `${app.name} — ${app.position}`,
      details: { scheduledAt, type, locationDetail },
    }).catch(() => {});

    // Confirmation emails (fire and forget).
    sendInterviewConfirmation(app, interview).catch((err) => console.warn('[applicants] confirmation email failed:', err.message));

    flashRedirect(res, `/admin/applicants/${id}`, 'success', 'Interview scheduled. Confirmation email sent.');
    return true;
  }

  // ─── Cancel interview: POST /admin/applicants/interviews/:id/cancel ───
  const cancelInterviewMatch = pathname.match(/^\/admin\/applicants\/interviews\/([0-9a-f-]{8,})\/cancel$/i);
  if (cancelInterviewMatch && req.method === 'POST') {
    const id = cancelInterviewMatch[1];
    const interview = await prisma.interview.findUnique({
      where: { id },
      include: { application: true },
    }).catch(() => null);
    if (!interview || (!userIsCompanyWide && !allowedLocationIds.has(interview.locationId))) {
      sendHTML(res, 404, '<h1>Not found</h1>');
      return true;
    }
    const body = await parseBody(req);
    const reason = String(body.reason || '').trim().slice(0, 500) || null;
    await prisma.interview.update({
      where: { id },
      data: {
        status: 'cancelled',
        cancelledAt: new Date(),
        cancellationReason: reason,
      },
    });
    writeAudit(prisma, req, user, {
      action: 'update',
      resourceType: 'interview',
      resourceId: id,
      resourceLabel: `${interview.application?.name || ''}`,
      details: { cancelled: true, reason },
    }).catch(() => {});

    sendInterviewCancellation(interview.application, interview, reason).catch((err) => console.warn('[applicants] cancellation email failed:', err.message));
    flashRedirect(res, `/admin/applicants/${interview.applicationId}`, 'success', 'Interview cancelled. Candidate emailed.');
    return true;
  }

  // ─── Detail: /admin/applicants/:id ───
  const detailMatch = pathname.match(/^\/admin\/applicants\/([0-9a-f-]{8,})$/i);
  if (detailMatch) {
    const id = detailMatch[1];
    const application = await prisma.jobApplication.findUnique({
      where: { id },
      include: {
        location: { select: { id: true, slug: true, name: true } },
      },
    }).catch(() => null);
    if (!application || (!userIsCompanyWide && !allowedLocationIds.has(application.locationId))) {
      sendHTML(res, 404, '<h1>Not found</h1>');
      return true;
    }
    const interviews = await prisma.interview.findMany({
      where: { applicationId: id },
      orderBy: { scheduledAt: 'desc' },
    }).catch(() => []);

    const flashMsg = decodeFlash(req);
    sendHTML(res, 200, applicantDetail({ application, interviews, user, flashMsg }));
    return true;
  }

  // ─── List: /admin/applicants ───
  if (pathname === '/admin/applicants') {
    const url = new URL(req.url, 'http://x');
    const filters = {
      status: url.searchParams.get('status') || '',
      position: url.searchParams.get('position') || '',
      location: url.searchParams.get('location') || '',
      q: (url.searchParams.get('q') || '').trim(),
    };

    const where = { ...applicationLocationGate };
    if (filters.status && VALID_STATUSES.has(filters.status)) where.status = filters.status;
    if (filters.position) where.position = filters.position;
    if (filters.location) {
      const loc = locations.find(l => l.slug === filters.location);
      if (loc) where.locationId = loc.id;
    }
    if (filters.q) {
      where.OR = [
        { name: { contains: filters.q, mode: 'insensitive' } },
        { email: { contains: filters.q, mode: 'insensitive' } },
      ];
    }

    const applications = await prisma.jobApplication.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { location: { select: { name: true, slug: true } } },
      take: 200,
    }).catch(() => []);

    // Counts for stat cards (scoped to allowed locations, ignoring filters
    // so the stats represent overall pipeline state, not the filtered view).
    const aggregate = await prisma.jobApplication.groupBy({
      where: applicationLocationGate,
      by: ['status'],
      _count: { _all: true },
    }).catch(() => []);
    const counts = { new: 0, reviewing: 0, interview_scheduled: 0, interviewed: 0, offer_extended: 0, hired: 0, rejected: 0, withdrawn: 0 };
    for (const row of aggregate) {
      if (counts[row.status] != null) counts[row.status] = row._count._all;
    }

    const flashMsg = decodeFlash(req);
    sendHTML(res, 200, applicantsList({
      applications,
      locations,
      filters,
      counts,
      user,
      flashMsg,
      canSeeMultipleLocations: userIsCompanyWide || locations.length > 1,
    }));
    return true;
  }

  return false;
}

async function sendInterviewConfirmation(application, interview) {
  if (!application?.email) return;
  const dateStr = formatEasternDateTime(interview.scheduledAt);
  const typeLabel = interview.type === 'phone' ? 'phone call' : interview.type === 'video' ? 'video call' : 'in-person interview';
  const lines = [
    `Hi ${application.name.split(' ')[0] || 'there'},`,
    '',
    `Your ${typeLabel} for the ${application.position} role has been scheduled.`,
    '',
    `When: ${dateStr} (Eastern), ${interview.durationMinutes} minutes`,
    interview.locationDetail ? `Where: ${interview.locationDetail}` : null,
    interview.interviewerEmail ? `Interviewer: ${interview.interviewerEmail}` : null,
    interview.candidateNote ? `\nA note from us: ${interview.candidateNote}` : null,
    '',
    "We'll send you a reminder the day before and an hour before. Just reply to this email if anything changes.",
    '',
    'Looking forward to it,',
    'Dram & Draught',
  ].filter((v) => v != null);

  const recipients = [application.email];
  if (interview.interviewerEmail && interview.interviewerEmail !== application.email) {
    recipients.push(interview.interviewerEmail);
  }
  await sendEmailViaGoogle({
    to: recipients,
    subject: `Interview confirmed — Dram & Draught (${dateStr})`,
    body: lines.join('\n'),
  });
}

async function sendInterviewCancellation(application, interview, reason) {
  if (!application?.email) return;
  const dateStr = formatEasternDateTime(interview.scheduledAt);
  const lines = [
    `Hi ${application.name.split(' ')[0] || 'there'},`,
    '',
    `We need to cancel your interview scheduled for ${dateStr} (Eastern).`,
    reason ? `\nReason: ${reason}` : null,
    '',
    "We'll be in touch with next steps. Sorry for the change.",
    '',
    'Dram & Draught',
  ].filter((v) => v != null);

  await sendEmailViaGoogle({
    to: application.email,
    subject: `Interview cancelled — Dram & Draught`,
    body: lines.join('\n'),
  });
}

module.exports = {
  handleAdminApplicants,
  // exposed for the reminder loop
  sendInterviewConfirmation,
  sendInterviewCancellation,
};
