const { sendHTML, parseBody, redirect, getFlashMsg, sendEmailViaGoogle } = require('../helpers');
const { requireAuth, isCompanyWide, getUserLocationSlugs } = require('../auth');
const { applicantsList, applicantDetail, STATUS_LABELS } = require('../views/adminApplicantsViews');
const { writeAudit } = require('../auditLog');
const { runAiEvaluation } = require('../hiring/aiEvaluation');
const { createAndSendInvite: createDashboardInvite, fetchInviteStatus, ROLE_OPTIONS: DASHBOARD_ROLE_OPTIONS } = require('../bartenderInvite');

async function rerunAndPersistScreening(prisma, application, questionnaire) {
  const evaluation = await runAiEvaluation({ application, questionnaire });
  await prisma.jobApplicationAiEvaluation.upsert({
    where: { applicationId: application.id },
    update: {
      recommendation: evaluation.recommendation,
      weightedScore: evaluation.weightedScore,
      confidence: evaluation.confidence,
      humanReviewRequired: evaluation.humanReviewRequired,
      humanReviewReasons: evaluation.humanReviewReasons || [],
      candidateSummary: evaluation.candidateSummary || '',
      positiveSignalSummary: evaluation.positiveSignalSummary || null,
      overallRationale: evaluation.overallRationale || '',
      jobRelatedConcerns: evaluation.jobRelatedConcerns || [],
      suggestedInterviewQuestions: evaluation.suggestedInterviewQuestions || [],
      possibleBetterRoleFit: evaluation.possibleBetterRoleFit || null,
      categoryScores: evaluation.categoryScores || [],
      modelName: evaluation.modelName,
      promptVersion: evaluation.promptVersion,
      knowledgeBaseVersion: evaluation.knowledgeBaseVersion,
      rawAiPayload: evaluation.rawAiPayload || null,
      errorDetail: evaluation.errorDetail || null,
    },
    create: {
      applicationId: application.id,
      recommendation: evaluation.recommendation,
      weightedScore: evaluation.weightedScore,
      confidence: evaluation.confidence,
      humanReviewRequired: evaluation.humanReviewRequired,
      humanReviewReasons: evaluation.humanReviewReasons || [],
      candidateSummary: evaluation.candidateSummary || '',
      positiveSignalSummary: evaluation.positiveSignalSummary || null,
      overallRationale: evaluation.overallRationale || '',
      jobRelatedConcerns: evaluation.jobRelatedConcerns || [],
      suggestedInterviewQuestions: evaluation.suggestedInterviewQuestions || [],
      possibleBetterRoleFit: evaluation.possibleBetterRoleFit || null,
      categoryScores: evaluation.categoryScores || [],
      modelName: evaluation.modelName,
      promptVersion: evaluation.promptVersion,
      knowledgeBaseVersion: evaluation.knowledgeBaseVersion,
      rawAiPayload: evaluation.rawAiPayload || null,
      errorDetail: evaluation.errorDetail || null,
    },
  });
  return evaluation;
}

const VALID_STATUSES = new Set(Object.keys(STATUS_LABELS));
const VALID_INTERVIEW_TYPES = new Set(['in_person', 'phone', 'video']);
const VALID_CONTACT_METHODS = new Set(['phone', 'text', 'in_person', 'email_manual', 'other']);
const CONTACT_METHOD_LABELS = {
  phone: 'phone call',
  text: 'text message',
  in_person: 'in person',
  email_manual: 'manual email',
  other: 'other',
};

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

  // ─── Hiring config (read-only): /admin/applicants/hiring-config ───
  if (pathname === '/admin/applicants/hiring-config') {
    const { hiringConfigPage } = require('../views/adminApplicantsViews');
    sendHTML(res, 200, hiringConfigPage({ user }));
    return true;
  }

  // ─── Retry a single failed screening: POST /admin/applicants/:id/retry-screening ───
  const retryOneMatch = pathname.match(/^\/admin\/applicants\/([0-9a-f-]{8,})\/retry-screening$/i);
  if (retryOneMatch && req.method === 'POST') {
    const id = retryOneMatch[1];
    const app = await prisma.jobApplication.findUnique({
      where: { id },
      include: { questionnaire: true, location: true },
    }).catch(() => null);
    if (!app || (!userIsCompanyWide && !allowedLocationIds.has(app.locationId))) {
      sendHTML(res, 404, '<h1>Not found</h1>');
      return true;
    }
    if (!app.questionnaire) {
      flashRedirect(res, `/admin/applicants/${id}`, 'error', 'No questionnaire on file to score.');
      return true;
    }
    try {
      const result = await rerunAndPersistScreening(prisma, app, app.questionnaire);
      writeAudit(prisma, req, user, {
        action: 'retry',
        resourceType: 'screening',
        resourceId: id,
        resourceLabel: app.name,
        details: { ok: !result.errorDetail, error: result.errorDetail || null },
      });
      if (result.errorDetail) {
        flashRedirect(res, `/admin/applicants/${id}`, 'error', `Screening still failed: ${result.errorDetail.slice(0, 200)}`);
      } else {
        flashRedirect(res, `/admin/applicants/${id}`, 'success', 'Screening complete.');
      }
    } catch (err) {
      console.warn('[retry-screening] error:', err.message);
      flashRedirect(res, `/admin/applicants/${id}`, 'error', `Screening pipeline error: ${err.message}`);
    }
    return true;
  }

  // ─── Retry all failed screenings: POST /admin/applicants/retry-failed-screenings ───
  if (pathname === '/admin/applicants/retry-failed-screenings' && req.method === 'POST') {
    const eligible = await prisma.jobApplication.findMany({
      where: {
        ...applicationLocationGate,
        questionnaire: { isNot: null },
        OR: [
          { aiEvaluation: null },
          { aiEvaluation: { errorDetail: { not: null } } },
        ],
      },
      include: { questionnaire: true, location: true },
      orderBy: { createdAt: 'asc' },
    }).catch(() => []);
    let ok = 0;
    let stillFailing = 0;
    for (const app of eligible) {
      if (!app.questionnaire) continue;
      try {
        const result = await rerunAndPersistScreening(prisma, app, app.questionnaire);
        if (result.errorDetail) stillFailing++;
        else ok++;
      } catch (err) {
        stillFailing++;
        console.warn('[retry-failed-screenings] error for', app.id, err.message);
      }
    }
    writeAudit(prisma, req, user, {
      action: 'retry',
      resourceType: 'screening_batch',
      resourceLabel: `${ok} ok / ${stillFailing} still failing`,
      details: { ok, stillFailing, eligible: eligible.length },
    });
    const note = stillFailing > 0
      ? `Re-scored ${ok}; ${stillFailing} still failing. Check error details on each.`
      : ok === 0
        ? 'No screenings needed a retry.'
        : `Re-scored ${ok} applicant${ok === 1 ? '' : 's'}.`;
    flashRedirect(res, '/admin/applicants', stillFailing > 0 ? 'error' : 'success', note);
    return true;
  }

  // ─── Send questionnaire invites to applicants who haven't done it yet ───
  if (pathname === '/admin/applicants/send-questionnaire-invites' && req.method === 'POST') {
    const MENUQR_BASE_URL = process.env.MENUQR_BASE_URL || 'https://menuqr.apps.dramanddraught.com';
    const body = await parseBody(req).catch(() => ({}));
    const force = body.force === '1' || body.force === 'on';

    const where = {
      ...applicationLocationGate,
      questionnaire: { is: null },
      status: { in: ['new', 'reviewing'] },
      email: { not: '' },
    };
    if (!force) where.questionnaireInviteSentAt = null;

    const eligible = await prisma.jobApplication.findMany({
      where,
      include: { location: { select: { id: true, name: true, slug: true } } },
      orderBy: { createdAt: 'asc' },
    }).catch(() => []);

    let sent = 0;
    let failed = 0;
    for (const app of eligible) {
      if (!app.email) continue;
      const firstName = (app.name || '').split(' ')[0] || 'there';
      const positionPhrase = app.position
        ? ` for the ${app.position}${app.position === 'Other' && app.positionOther ? ` (${app.positionOther})` : ''} role`
        : '';
      const url = `${MENUQR_BASE_URL}/apply/q/${app.id}`;
      const emailBody = [
        `Hi ${firstName},`,
        '',
        `Thanks again for applying to Dram & Draught – ${app.location.name}${positionPhrase}.`,
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
      try {
        const result = await sendEmailViaGoogle({
          to: app.email,
          subject: 'One more step for your Dram & Draught application',
          body: emailBody,
        });
        if (result && result.ok === false) {
          failed++;
          continue;
        }
        sent++;
        await prisma.jobApplication.update({
          where: { id: app.id },
          data: { questionnaireInviteSentAt: new Date() },
        }).catch(() => {});
      } catch (err) {
        failed++;
        console.warn('[questionnaire-invite] send failed for', app.email, err.message);
      }
    }

    writeAudit(prisma, req, user, {
      action: 'send',
      resourceType: 'questionnaire_invites',
      resourceLabel: `${sent} sent, ${failed} failed`,
      details: { sent, failed, eligible: eligible.length, force },
    });

    const note = failed > 0
      ? `Sent ${sent} invite${sent === 1 ? '' : 's'}; ${failed} failed (check server logs).`
      : sent === 0
        ? 'No applicants needed an invite.'
        : `Sent ${sent} invite${sent === 1 ? '' : 's'}.`;
    flashRedirect(res, '/admin/applicants', failed > 0 ? 'error' : 'success', note);
    return true;
  }

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
    // Default to inline so <object> / <img> previews on the detail page can
    // actually render the PDF. The Download button on the page sends
    // ?download=1 to force the attachment disposition.
    const url = new URL(req.url, 'http://x');
    const forceDownload = url.searchParams.get('download') === '1';
    const disposition = forceDownload
      ? `attachment; filename="${fileName}"`
      : `inline; filename="${fileName}"`;
    res.writeHead(200, {
      'Content-Type': m[1],
      'Content-Disposition': disposition,
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
    const note = body.note ? String(body.note).slice(0, 1000) : null;
    const sendEmail = body.sendEmail === '1' || body.sendEmail === 'on' || body.sendEmail === true;

    await prisma.jobApplication.update({
      where: { id },
      data: {
        status: next,
        decisionBy: user.email || null,
        decisionAt: new Date(),
        decisionNote: note,
      },
    });

    // Rejection side-effects: auto-cancel any scheduled interviews so the
    // candidate stops getting reminder emails, and optionally send a polite
    // rejection note.
    let cancelledCount = 0;
    if (next === 'rejected') {
      try {
        const cancelRes = await prisma.interview.updateMany({
          where: { applicationId: id, status: 'scheduled' },
          data: {
            status: 'cancelled',
            cancelledAt: new Date(),
            cancellationReason: 'Application rejected' + (note ? ` — ${note}` : ''),
          },
        });
        cancelledCount = cancelRes.count || 0;
      } catch (err) {
        console.warn('[applicants] failed to auto-cancel interviews on rejection:', err.message);
      }

      if (sendEmail) {
        sendRejectionEmail(app, note).catch((err) => console.warn('[applicants] rejection email failed:', err.message));
      }
    }

    writeAudit(prisma, req, user, {
      action: 'update',
      resourceType: 'jobApplication',
      resourceId: id,
      resourceLabel: `${app.name} — ${app.position}`,
      details: { from: app.status, to: next, sendEmail: next === 'rejected' ? !!sendEmail : undefined, interviewsCancelled: cancelledCount || undefined },
    }).catch(() => {});

    let flashText = `Moved to ${STATUS_LABELS[next] || next}.`;
    if (next === 'rejected') {
      const bits = [];
      if (cancelledCount > 0) bits.push(`${cancelledCount} interview${cancelledCount === 1 ? '' : 's'} cancelled`);
      if (sendEmail) bits.push('rejection email sent');
      if (bits.length) flashText = `Rejected — ${bits.join(', ')}.`;
    }
    flashRedirect(res, `/admin/applicants/${id}`, 'success', flashText);
    return true;
  }

  // ─── Send Bartender Dashboard onboarding invite ───
  // POST /admin/applicants/:id/onboarding-invite — only valid for hired
  // applicants. Creates an EmployeeInvite row in the bartender DB and emails
  // the candidate the welcome / registration link.
  const onboardingInviteMatch = pathname.match(/^\/admin\/applicants\/([0-9a-f-]{8,})\/onboarding-invite$/i);
  if (onboardingInviteMatch && req.method === 'POST') {
    const id = onboardingInviteMatch[1];
    const app = await prisma.jobApplication.findUnique({
      where: { id },
      include: { location: { select: { slug: true, name: true } } },
    }).catch(() => null);
    if (!app || (!userIsCompanyWide && !allowedLocationIds.has(app.locationId))) {
      sendHTML(res, 404, '<h1>Not found</h1>');
      return true;
    }
    if (app.status !== 'hired') {
      flashRedirect(res, `/admin/applicants/${id}`, 'error', 'Move the applicant to Hired before sending a dashboard invite.');
      return true;
    }
    const body = await parseBody(req);
    const role = String(body.role || '').trim() || null;

    const result = await createDashboardInvite({
      application: app,
      locationSlug: app.location?.slug,
      role,
      adminEmail: user.email || null,
      adminName: user.email ? user.email.split('@')[0] : null,
    });

    if (!result.ok) {
      flashRedirect(res, `/admin/applicants/${id}`, 'error', `Could not send dashboard invite: ${result.error}`);
      return true;
    }

    // Persist invite id/token + role + sentAt on the application row so the
    // detail page can render the status without hitting the bartender DB again.
    await prisma.jobApplication.update({
      where: { id },
      data: {
        dashboardInviteId: result.inviteId,
        dashboardInviteToken: result.token,
        dashboardInviteSentAt: result.sentAt || new Date(),
        dashboardInviteRole: role || app.dashboardInviteRole || null,
      },
    }).catch(() => {});

    writeAudit(prisma, req, user, {
      action: 'create',
      resourceType: 'employeeInvite',
      resourceId: result.inviteId,
      resourceLabel: `${app.name} — ${app.position}`,
      details: { reusedExisting: !!result.reusedExisting, role, emailError: result.emailError || undefined },
    }).catch(() => {});

    const flashText = result.reusedExisting
      ? 'Active invite already existed — link reused, no duplicate email sent.'
      : (result.emailError
        ? `Invite created but email failed: ${result.emailError}. Open the candidate's record to resend.`
        : 'Dashboard invite sent. They will get a registration link by email.');
    flashRedirect(res, `/admin/applicants/${id}`, result.emailError ? 'error' : 'success', flashText);
    return true;
  }

  // ─── Internal notes: POST /admin/applicants/:id/notes ───
  // For XHR autosave calls (header X-Requested-With: XMLHttpRequest), reply
  // with a small JSON body and an explicit 200/500 so the autosave can show
  // a real error indicator instead of guessing. Browser form posts still get
  // the flashRedirect path.
  const notesMatch = pathname.match(/^\/admin\/applicants\/([0-9a-f-]{8,})\/notes$/i);
  if (notesMatch && req.method === 'POST') {
    const id = notesMatch[1];
    const isXhr = String(req.headers['x-requested-with'] || '').toLowerCase() === 'xmlhttprequest';
    const app = await prisma.jobApplication.findUnique({ where: { id } }).catch(() => null);
    if (!app || (!userIsCompanyWide && !allowedLocationIds.has(app.locationId))) {
      if (isXhr) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'not_found' }));
        return true;
      }
      sendHTML(res, 404, '<h1>Not found</h1>');
      return true;
    }
    const body = await parseBody(req);
    try {
      await prisma.jobApplication.update({
        where: { id },
        data: { internalNotes: body.internalNotes ? String(body.internalNotes).slice(0, 8000) : null },
      });
    } catch (err) {
      console.warn('[applicants] notes save failed:', err.message);
      if (isXhr) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: err.message }));
        return true;
      }
      flashRedirect(res, `/admin/applicants/${id}`, 'error', `Notes save failed: ${err.message}`);
      return true;
    }
    if (isXhr) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, savedAt: new Date().toISOString() }));
      return true;
    }
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
    const skipEmail = body.skipEmail === '1' || body.skipEmail === 'on' || body.skipEmail === true;
    const rawContactMethod = String(body.contactMethod || '').trim();
    const contactMethod = VALID_CONTACT_METHODS.has(rawContactMethod) ? rawContactMethod : null;
    const contactNote = String(body.contactNote || '').trim().slice(0, 1000) || null;

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
        contactMethod,
        contactNote,
        status: 'scheduled',
        confirmationSentAt: skipEmail ? null : new Date(),
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
      details: { scheduledAt, type, locationDetail, skipEmail: !!skipEmail, contactMethod },
    }).catch(() => {});

    // Conflict detection — find other scheduled interviews for the same
    // interviewer within ±90 minutes of the new slot, so we can warn (but
    // not block — the user might genuinely want overlapping interviews).
    let conflictWarn = '';
    if (interviewerEmail) {
      try {
        const windowMs = 90 * 60 * 1000;
        const conflicts = await prisma.interview.findMany({
          where: {
            id: { not: interview.id },
            interviewerEmail,
            status: 'scheduled',
            scheduledAt: {
              gte: new Date(scheduledAt.getTime() - windowMs),
              lte: new Date(scheduledAt.getTime() + windowMs),
            },
          },
          include: { application: { select: { name: true } } },
          take: 3,
        });
        if (conflicts.length) {
          conflictWarn = ' ⚠ ' + conflicts.length + ' overlapping interview' + (conflicts.length === 1 ? '' : 's') + ' for ' + interviewerEmail + ' within 90 min: '
            + conflicts.map((c) => (c.application?.name || 'unknown') + ' at ' + formatEasternDateTime(c.scheduledAt)).join('; ');
        }
      } catch (err) {
        console.warn('[applicants] conflict check failed:', err.message);
      }
    }

    let flashText;
    if (skipEmail) {
      flashText = contactMethod
        ? `Interview scheduled. Candidate already contacted via ${CONTACT_METHOD_LABELS[contactMethod]} — no email sent.`
        : 'Interview scheduled. No confirmation email sent.';
    } else {
      // Confirmation emails (fire and forget).
      sendInterviewConfirmation(app, interview).catch((err) => console.warn('[applicants] confirmation email failed:', err.message));
      flashText = 'Interview scheduled. Confirmation email sent.';
    }

    flashRedirect(res, `/admin/applicants/${id}`, conflictWarn ? 'error' : 'success', flashText + conflictWarn);
    return true;
  }

  // ─── Mark interview complete: POST /admin/applicants/interviews/:id/complete ───
  const completeInterviewMatch = pathname.match(/^\/admin\/applicants\/interviews\/([0-9a-f-]{8,})\/complete$/i);
  if (completeInterviewMatch && req.method === 'POST') {
    const id = completeInterviewMatch[1];
    const interview = await prisma.interview.findUnique({
      where: { id },
      include: { application: true },
    }).catch(() => null);
    if (!interview || (!userIsCompanyWide && !allowedLocationIds.has(interview.locationId))) {
      sendHTML(res, 404, '<h1>Not found</h1>');
      return true;
    }
    await prisma.interview.update({
      where: { id },
      data: { status: 'completed' },
    });
    // Auto-advance applicant if still 'interview_scheduled' — manager can
    // still override to interviewed/offer_extended via the menu.
    if (interview.application && interview.application.status === 'interview_scheduled') {
      await prisma.jobApplication.update({
        where: { id: interview.applicationId },
        data: {
          status: 'interviewed',
          decisionBy: user.email || null,
          decisionAt: new Date(),
        },
      }).catch(() => {});
    }
    writeAudit(prisma, req, user, {
      action: 'update',
      resourceType: 'interview',
      resourceId: id,
      resourceLabel: `${interview.application?.name || ''}`,
      details: { completed: true },
    }).catch(() => {});
    flashRedirect(res, `/admin/applicants/${interview.applicationId}`, 'success', 'Interview marked completed. Applicant moved to Interviewed.');
    return true;
  }

  // ─── Mark interview no-show: POST /admin/applicants/interviews/:id/no-show ───
  const noShowInterviewMatch = pathname.match(/^\/admin\/applicants\/interviews\/([0-9a-f-]{8,})\/no-show$/i);
  if (noShowInterviewMatch && req.method === 'POST') {
    const id = noShowInterviewMatch[1];
    const interview = await prisma.interview.findUnique({
      where: { id },
      include: { application: true },
    }).catch(() => null);
    if (!interview || (!userIsCompanyWide && !allowedLocationIds.has(interview.locationId))) {
      sendHTML(res, 404, '<h1>Not found</h1>');
      return true;
    }
    await prisma.interview.update({
      where: { id },
      data: { status: 'no_show' },
    });
    writeAudit(prisma, req, user, {
      action: 'update',
      resourceType: 'interview',
      resourceId: id,
      resourceLabel: `${interview.application?.name || ''}`,
      details: { noShow: true },
    }).catch(() => {});
    flashRedirect(res, `/admin/applicants/${interview.applicationId}`, 'success', 'Interview marked no-show. Applicant status unchanged — use Change status to reject if appropriate.');
    return true;
  }

  // ─── Reschedule interview: POST /admin/applicants/interviews/:id/reschedule ───
  const rescheduleInterviewMatch = pathname.match(/^\/admin\/applicants\/interviews\/([0-9a-f-]{8,})\/reschedule$/i);
  if (rescheduleInterviewMatch && req.method === 'POST') {
    const id = rescheduleInterviewMatch[1];
    const interview = await prisma.interview.findUnique({
      where: { id },
      include: { application: true },
    }).catch(() => null);
    if (!interview || (!userIsCompanyWide && !allowedLocationIds.has(interview.locationId))) {
      sendHTML(res, 404, '<h1>Not found</h1>');
      return true;
    }
    const body = await parseBody(req);
    const newScheduledAt = parseDateTimeLocal(body.scheduledAt);
    if (!newScheduledAt) {
      flashRedirect(res, `/admin/applicants/${interview.applicationId}`, 'error', 'Could not parse the new date/time.');
      return true;
    }
    const notify = body.notifyCandidate === '1' || body.notifyCandidate === 'on';

    await prisma.interview.update({
      where: { id },
      data: {
        scheduledAt: newScheduledAt,
        // Reset reminder flags so the new time gets fresh reminders.
        reminderSent24h: false,
        reminderSent1h: false,
        // Re-stamp confirmationSentAt only if we actually email.
        confirmationSentAt: notify ? new Date() : interview.confirmationSentAt,
      },
    });
    writeAudit(prisma, req, user, {
      action: 'update',
      resourceType: 'interview',
      resourceId: id,
      resourceLabel: `${interview.application?.name || ''}`,
      details: { rescheduledFrom: interview.scheduledAt, rescheduledTo: newScheduledAt, notify: !!notify },
    }).catch(() => {});

    if (notify && interview.application?.email) {
      // Reuse the confirmation template — same body the original send used,
      // with the new time.
      const updated = { ...interview, scheduledAt: newScheduledAt };
      sendInterviewConfirmation(interview.application, updated).catch((err) => console.warn('[applicants] reschedule email failed:', err.message));
    }

    flashRedirect(res, `/admin/applicants/${interview.applicationId}`, 'success', notify
      ? 'Interview rescheduled. Updated confirmation emailed to the candidate.'
      : 'Interview rescheduled. No email sent (you opted out).');
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
    const skipEmail = body.skipEmail === '1' || body.skipEmail === 'on' || body.skipEmail === true;
    const rawContactMethod = String(body.contactMethod || '').trim();
    const contactMethod = VALID_CONTACT_METHODS.has(rawContactMethod) ? rawContactMethod : null;
    const contactNote = String(body.contactNote || '').trim().slice(0, 1000) || null;

    await prisma.interview.update({
      where: { id },
      data: {
        status: 'cancelled',
        cancelledAt: new Date(),
        cancellationReason: reason,
        ...(skipEmail && (contactMethod || contactNote) ? { contactMethod, contactNote } : {}),
      },
    });
    writeAudit(prisma, req, user, {
      action: 'update',
      resourceType: 'interview',
      resourceId: id,
      resourceLabel: `${interview.application?.name || ''}`,
      details: { cancelled: true, reason, skipEmail: !!skipEmail, contactMethod },
    }).catch(() => {});

    let flashText;
    if (skipEmail) {
      flashText = contactMethod
        ? `Interview cancelled. Candidate already notified via ${CONTACT_METHOD_LABELS[contactMethod]} — no email sent.`
        : 'Interview cancelled. No cancellation email sent.';
    } else {
      sendInterviewCancellation(interview.application, interview, reason).catch((err) => console.warn('[applicants] cancellation email failed:', err.message));
      flashText = 'Interview cancelled. Candidate emailed.';
    }
    flashRedirect(res, `/admin/applicants/${interview.applicationId}`, 'success', flashText);
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
        questionnaire: true,
        aiEvaluation: true,
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

    // If we've sent a dashboard invite, fetch its latest state from the
    // bartender DB so the Onboarding card can show Viewed / Completed /
    // Expired without a webhook. Fire-and-forget — if it fails we just don't
    // render the status pill.
    let dashboardInviteStatus = null;
    if (application.dashboardInviteId) {
      dashboardInviteStatus = await fetchInviteStatus(application.dashboardInviteId);
    }

    // History — pulled from the audit log for both jobApplication and any of
    // the applicant's interviews. Most recent first.
    const interviewIds = interviews.map((iv) => iv.id);
    const auditResources = [id, ...interviewIds];
    const auditEvents = await prisma.auditLog.findMany({
      where: { resourceId: { in: auditResources } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }).catch(() => []);

    const flashMsg = decodeFlash(req);
    sendHTML(res, 200, applicantDetail({
      application,
      interviews,
      user,
      flashMsg,
      dashboardInviteStatus,
      dashboardRoleOptions: DASHBOARD_ROLE_OPTIONS,
      auditEvents,
    }));
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
      hasInterview: url.searchParams.get('has_interview') === '1' ? '1' : '',
      sort: url.searchParams.get('sort') || 'newest',
      group: url.searchParams.get('group') || 'none',
    };

    const where = { ...applicationLocationGate };
    if (filters.status && VALID_STATUSES.has(filters.status)) {
      where.status = filters.status;
    } else {
      // Default view excludes archived (rejected / withdrawn) so the main
      // screen stays focused on the active pipeline. Admins can still see
      // them by clicking the Rejected / Withdrawn chip or using ?status=.
      where.status = { notIn: ['rejected', 'withdrawn'] };
    }
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
    if (filters.hasInterview === '1') {
      where.interviews = { some: {} };
    }

    const aiRecFilter = url.searchParams.get('ai_rec') || '';
    const reviewFilter = url.searchParams.get('review') || '';
    filters.aiRec = aiRecFilter;
    filters.review = reviewFilter;

    // Three-state verdict filter. The DB only stores the internal
    // recommendation + humanReviewRequired flag, so we map the manager-facing
    // bucket back to those columns. Legacy values (recommend / dont_recommend)
    // keep working.
    if (aiRecFilter === 'recommend' || aiRecFilter === 'recommend_interview') {
      where.aiEvaluation = {
        ...(where.aiEvaluation || {}),
        recommendation: { in: ['strong_callback', 'callback'] },
        humanReviewRequired: false,
      };
    } else if (aiRecFilter === 'needs_human_review') {
      // Anything flagged for review, regardless of recommendation.
      where.aiEvaluation = { ...(where.aiEvaluation || {}), humanReviewRequired: true };
    } else if (aiRecFilter === 'does_not_meet_role_requirements') {
      // Hard deal-breaker rows: AI recommended hold and no review-only flag
      // would explain it. (Conservative — admins can also browse this group
      // via the chip.)
      where.aiEvaluation = { ...(where.aiEvaluation || {}), recommendation: 'hold' };
    } else if (aiRecFilter === 'dont_recommend') {
      // Legacy two-state filter — kept for bookmarked URLs.
      where.aiEvaluation = { ...(where.aiEvaluation || {}), recommendation: { in: ['maybe', 'hold'] } };
    }
    if (reviewFilter === '1') {
      where.aiEvaluation = { ...(where.aiEvaluation || {}), humanReviewRequired: true };
    }

    // Sort: default newest. Score-based sorts use Prisma's nulls:'last' so
    // applicants without an aiEvaluation row deterministically sort to the
    // end instead of jumping around between Postgres versions.
    let orderBy;
    switch (filters.sort) {
      case 'oldest':     orderBy = { createdAt: 'asc' }; break;
      case 'score_desc': orderBy = [{ aiEvaluation: { weightedScore: { sort: 'desc', nulls: 'last' } } }, { createdAt: 'desc' }]; break;
      case 'score_asc':  orderBy = [{ aiEvaluation: { weightedScore: { sort: 'asc',  nulls: 'last' } } }, { createdAt: 'desc' }]; break;
      case 'name_asc':   orderBy = { name: 'asc' }; break;
      case 'newest':
      default:           orderBy = { createdAt: 'desc' }; break;
    }

    // Pagination via a growing ?limit= param. Default is 200; "Load more"
    // doubles it (up to 2000). Simpler than cursor pagination for an admin
    // list and keeps URLs bookmarkable.
    const limitRaw = parseInt(url.searchParams.get('limit') || '', 10);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(2000, limitRaw) : 200;
    filters.limit = limit;

    const [applications, matchingTotal] = await Promise.all([
      prisma.jobApplication.findMany({
        where,
        orderBy,
        include: {
          location: { select: { name: true, slug: true } },
          questionnaire: { select: { id: true } },
          aiEvaluation: {
            select: {
              recommendation: true,
              weightedScore: true,
              confidence: true,
              humanReviewRequired: true,
              errorDetail: true,
            },
          },
          _count: { select: { interviews: true } },
        },
        take: limit,
      }).catch(() => []),
      prisma.jobApplication.count({ where }).catch(() => 0),
    ]);
    filters.matchingTotal = matchingTotal;

    // Count of applicants who still owe a questionnaire and have not yet been
    // reminded — drives the "Send invites" button label.
    const pendingInviteCount = await prisma.jobApplication.count({
      where: {
        ...applicationLocationGate,
        questionnaire: { is: null },
        questionnaireInviteSentAt: null,
        status: { in: ['new', 'reviewing'] },
        email: { not: '' },
      },
    }).catch(() => 0);

    // Count of applicants whose questionnaire is in but screening failed or
    // never produced a result — drives the "Retry failed screenings" button.
    const failedScreeningCount = await prisma.jobApplication.count({
      where: {
        ...applicationLocationGate,
        questionnaire: { isNot: null },
        OR: [
          { aiEvaluation: null },
          { aiEvaluation: { errorDetail: { not: null } } },
        ],
      },
    }).catch(() => 0);

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
      pendingInviteCount,
      failedScreeningCount,
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

async function sendRejectionEmail(application, reason) {
  if (!application?.email) return;
  const firstName = (application.name || '').split(' ')[0] || 'there';
  const positionLine = application.position
    ? `the ${application.position} role`
    : 'your application';
  const lines = [
    `Hi ${firstName},`,
    '',
    `Thank you for taking the time to apply for ${positionLine} at Dram & Draught. After reviewing everything you sent us, we've decided to move forward with other candidates this time.`,
    reason ? `\nA quick note on our decision: ${reason}` : null,
    '',
    "We appreciate your interest in joining the team, and we'll keep your application on file. If something opens up that looks like a strong fit, we'll be in touch.",
    '',
    'All the best,',
    'Dram & Draught Hiring Team',
  ].filter((v) => v != null);

  await sendEmailViaGoogle({
    to: application.email,
    subject: `Update on your Dram & Draught application`,
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
