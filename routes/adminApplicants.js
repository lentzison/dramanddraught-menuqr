const { sendHTML, parseBody, redirect, getFlashMsg, sendEmailViaGoogle } = require('../helpers');
const { requireAuth, isCompanyWide, getUserLocationSlugs } = require('../auth');
const { applicantsList, applicantDetail, STATUS_LABELS, CONTACT_KINDS, contactBadgeHtml, contactHistoryHtml } = require('../views/adminApplicantsViews');
const { writeAudit } = require('../auditLog');
const { runAiEvaluation } = require('../hiring/aiEvaluation');
const { sendSms } = require('../sms');
const { createAndSendInvite: createDashboardInvite, fetchInviteStatus, ROLE_OPTIONS: DASHBOARD_ROLE_OPTIONS } = require('../bartenderInvite');

async function rerunAndPersistScreening(prisma, application, questionnaire) {
  const evaluation = await runAiEvaluation({ application, questionnaire });
  await prisma.jobApplicationAiEvaluation.upsert({
    where: { applicationId: application.id },
    update: {
      recommendation: evaluation.recommendation,
      verdictBucket: evaluation.verdictBucket || null,
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
      verdictBucket: evaluation.verdictBucket || null,
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
    // AI-vs-manager agreement data: every screening joined with the
    // application's current pipeline status. The view groups by prompt
    // version so threshold/rubric changes can be judged against what
    // managers actually decided. Gated to the user's locations.
    const evalRows = await prisma.jobApplicationAiEvaluation.findMany({
      where: { application: applicationLocationGate },
      select: {
        verdictBucket: true,
        recommendation: true,
        humanReviewRequired: true,
        promptVersion: true,
        errorDetail: true,
        application: { select: { status: true } },
      },
    }).catch(() => []);
    // Pending applicants whose stored verdict predates the current prompt —
    // powers the "re-screen pending" button.
    const { PROMPT_VERSION } = require('../hiring/knowledgeBase');
    const outdatedPendingCount = await prisma.jobApplication.count({
      where: {
        ...applicationLocationGate,
        status: { in: ['new', 'reviewing', 'interview_scheduled'] },
        questionnaire: { isNot: null },
        aiEvaluation: { is: { promptVersion: { not: PROMPT_VERSION } } },
      },
    }).catch(() => 0);
    sendHTML(res, 200, hiringConfigPage({ user, evalRows, outdatedPendingCount }));
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
    // Run in the background and respond immediately — a full re-screen with the
    // newer reasoning model can take longer than the gateway timeout, so we
    // never block the response on it (the screening-retry poller is the safety
    // net for failures). The updated result appears on refresh.
    rerunAndPersistScreening(prisma, app, app.questionnaire)
      .then((result) => {
        writeAudit(prisma, req, user, {
          action: 'retry',
          resourceType: 'screening',
          resourceId: id,
          resourceLabel: app.name,
          details: { ok: !result.errorDetail, error: result.errorDetail || null },
        });
      })
      .catch((err) => console.warn('[retry-screening] error:', err.message));
    flashRedirect(res, `/admin/applicants/${id}`, 'success', 'Re-screening started — this can take 10–30 seconds. Refresh the page shortly to see the updated result.');
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
    const queued = eligible.filter((app) => app.questionnaire);
    // Process the batch in the background (sequentially, to avoid a concurrency
    // spike) and respond immediately so the request can't hit the gateway
    // timeout. Results appear as each finishes.
    (async () => {
      let ok = 0;
      let stillFailing = 0;
      for (const app of queued) {
        try {
          const result = await rerunAndPersistScreening(prisma, app, app.questionnaire);
          if (result.errorDetail) stillFailing++; else ok++;
        } catch (err) {
          stillFailing++;
          console.warn('[retry-failed-screenings] error for', app.id, err.message);
        }
      }
      console.log(`[retry-failed-screenings] background run complete: ${ok} ok / ${stillFailing} still failing`);
    })().catch((err) => console.warn('[retry-failed-screenings] background batch error:', err.message));
    writeAudit(prisma, req, user, {
      action: 'retry',
      resourceType: 'screening_batch',
      resourceLabel: `${queued.length} queued`,
      details: { queued: queued.length, eligible: eligible.length },
    });
    const note = queued.length === 0
      ? 'No screenings needed a retry.'
      : `Re-screening ${queued.length} applicant${queued.length === 1 ? '' : 's'} in the background — refresh in a minute to see results.`;
    flashRedirect(res, '/admin/applicants', 'success', note);
    return true;
  }

  // ─── Re-screen pending applicants on an outdated prompt version ───
  // After a knowledgeBase.js bump, applicants still in the active pipeline
  // keep verdicts from the old prompt. This re-runs them under the current
  // one. (retry-failed-screenings only covers *errored* runs.)
  if (pathname === '/admin/applicants/rescreen-pending' && req.method === 'POST') {
    const { PROMPT_VERSION } = require('../hiring/knowledgeBase');
    const eligible = await prisma.jobApplication.findMany({
      where: {
        ...applicationLocationGate,
        status: { in: ['new', 'reviewing', 'interview_scheduled'] },
        questionnaire: { isNot: null },
        aiEvaluation: { is: { promptVersion: { not: PROMPT_VERSION } } },
      },
      include: { questionnaire: true },
      orderBy: { createdAt: 'asc' },
    }).catch(() => []);
    (async () => {
      let ok = 0;
      let failed = 0;
      for (const app of eligible) {
        try {
          const result = await rerunAndPersistScreening(prisma, app, app.questionnaire);
          if (result.errorDetail) failed++; else ok++;
        } catch (err) {
          failed++;
          console.warn('[rescreen-pending] error for', app.id, err.message);
        }
      }
      console.log(`[rescreen-pending] done: ${ok} ok / ${failed} failed under ${PROMPT_VERSION}`);
    })().catch((err) => console.warn('[rescreen-pending] batch error:', err.message));
    writeAudit(prisma, req, user, {
      action: 'retry',
      resourceType: 'screening_batch',
      resourceLabel: `rescreen-pending: ${eligible.length} queued`,
      details: { queued: eligible.length, promptVersion: PROMPT_VERSION },
    }).catch(() => {});
    const note = eligible.length === 0
      ? 'Every pending applicant is already screened under the current prompt.'
      : `Re-screening ${eligible.length} pending applicant${eligible.length === 1 ? '' : 's'} under the current prompt — runs in the background.`;
    flashRedirect(res, '/admin/applicants/hiring-config', 'success', note);
    return true;
  }

  // ─── Funnel & source report: /admin/applicants/funnel ───
  if (pathname === '/admin/applicants/funnel') {
    const { funnelPage } = require('../views/adminApplicantsViews');
    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const apps = await prisma.jobApplication.findMany({
      where: { ...applicationLocationGate, createdAt: { gte: since } },
      select: {
        source: true,
        status: true,
        locationId: true,
        questionnaire: { select: { id: true } },
        _count: { select: { interviews: true } },
      },
    }).catch(() => []);
    // Apply-page traffic for the same window, gated to the user's locations.
    const allowedSlugs = locations.map((l) => l.slug);
    const applyViews = await prisma.pageView.findMany({
      where: {
        pagePath: { endsWith: '/apply' },
        viewedAt: { gte: since },
        locationSlug: { in: allowedSlugs.length ? allowedSlugs : ['__none__'] },
      },
      select: { visitorId: true, locationSlug: true },
    }).catch(() => []);
    sendHTML(res, 200, funnelPage({ user, apps, applyViews, locations, sinceDays: 90 }));
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
    // INTERNAL note (`note`) is saved to the record and never emailed. A
    // candidate-facing line, if any, comes from a separate explicit field so
    // internal/AI assessment language can never leak into the applicant's email.
    const candidateMessage = body.candidateMessage ? String(body.candidateMessage).replace(/\s+/g, ' ').trim().slice(0, 500) : null;
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

    // Side-effects for terminal decisions (rejected / keep_on_file):
    // auto-cancel any scheduled interviews so the candidate stops getting
    // reminder emails, and optionally send a polite note. "Reject" sends a
    // firm we-went-with-someone-else note; "keep on file" sends a softer
    // we'll-reach-back-out note (the candidate-facing distinction matters).
    let cancelledCount = 0;
    const isTerminalDecision = next === 'rejected' || next === 'keep_on_file';
    if (isTerminalDecision) {
      const reasonLabel = next === 'rejected' ? 'Application rejected' : 'Application kept on file';
      try {
        const cancelRes = await prisma.interview.updateMany({
          where: { applicationId: id, status: 'scheduled' },
          data: {
            status: 'cancelled',
            cancelledAt: new Date(),
            cancellationReason: reasonLabel + (note ? ` — ${note}` : ''),
          },
        });
        cancelledCount = cancelRes.count || 0;
      } catch (err) {
        console.warn(`[applicants] failed to auto-cancel interviews on ${next}:`, err.message);
      }

      if (sendEmail) {
        const sendFn = next === 'rejected' ? sendRejectionEmail : sendKeepOnFileEmail;
        // Pass ONLY the explicit candidate-facing message — never the internal note.
        sendFn(app, candidateMessage).catch((err) => console.warn(`[applicants] ${next} email failed:`, err.message));
      }
    }

    writeAudit(prisma, req, user, {
      action: 'update',
      resourceType: 'jobApplication',
      resourceId: id,
      resourceLabel: `${app.name} — ${app.position}`,
      details: { from: app.status, to: next, sendEmail: isTerminalDecision ? !!sendEmail : undefined, interviewsCancelled: cancelledCount || undefined },
    }).catch(() => {});

    let flashText = `Moved to ${STATUS_LABELS[next] || next}.`;
    if (next === 'offer_extended') {
      flashText = 'Moved to Offer Extended — send the offer & onboarding invite from the Bartender Dashboard (see the Offer & hire checklist).';
    }
    if (isTerminalDecision) {
      const headline = next === 'rejected' ? 'Rejected' : 'Kept on file';
      const emailLabel = next === 'rejected' ? 'rejection email sent' : 'keep-on-file email sent';
      const bits = [];
      if (cancelledCount > 0) bits.push(`${cancelledCount} interview${cancelledCount === 1 ? '' : 's'} cancelled`);
      if (sendEmail) bits.push(emailLabel);
      flashText = bits.length ? `${headline} — ${bits.join(', ')}.` : `${headline}.`;
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
    // Larger cap — the body can carry a base64 training-schedule attachment.
    const body = await parseBody(req, { maxBytes: 12 * 1024 * 1024 });
    const role = String(body.role || '').trim() || null;
    const emailSubject = body.emailSubject ? String(body.emailSubject).slice(0, 300) : null;
    const emailBody = body.emailBody ? String(body.emailBody).slice(0, 20000) : null;

    // Optional training-schedule attachment: sent from the form as a base64
    // data URL in a hidden field (file → base64 via JS, like the image widgets).
    let attachments;
    const attData = String(body.attachmentData || '');
    const attName = String(body.attachmentName || '').slice(0, 200);
    const m = /^data:([^;]+);base64,(.+)$/.exec(attData);
    if (m && attName) {
      attachments = [{ filename: attName, mimeType: m[1], base64Data: m[2] }];
    }

    const result = await createDashboardInvite({
      application: app,
      locationSlug: app.location?.slug,
      role,
      adminEmail: user.email || null,
      adminName: user.email ? user.email.split('@')[0] : null,
      emailSubject,
      emailBody,
      attachments,
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

  // ─── Log a call/contact attempt: POST /admin/applicants/:id/contact ───
  // Outreach tracking that sits alongside the pipeline status, so the team can
  // see who's been called / left a voicemail / reached and not call repeatedly.
  const contactMatch = pathname.match(/^\/admin\/applicants\/([0-9a-f-]{8,})\/contact$/i);
  if (contactMatch && req.method === 'POST') {
    const id = contactMatch[1];
    const isXhr = String(req.headers['x-requested-with'] || '').toLowerCase() === 'xmlhttprequest';
    const app = await prisma.jobApplication.findUnique({ where: { id } }).catch(() => null);
    if (!app || (!userIsCompanyWide && !allowedLocationIds.has(app.locationId))) {
      if (isXhr) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'not_found' })); return true; }
      sendHTML(res, 404, '<h1>Not found</h1>');
      return true;
    }
    const body = await parseBody(req);
    const kind = String(body.kind || '').trim();
    const log = Array.isArray(app.contactLog) ? app.contactLog.filter((e) => e && CONTACT_KINDS[e.kind]) : [];
    if (kind === 'undo') {
      log.pop();
    } else if (CONTACT_KINDS[kind]) {
      log.push({ at: new Date().toISOString(), by: user.email || null, kind });
    } else {
      if (isXhr) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'bad_kind' })); return true; }
      flashRedirect(res, `/admin/applicants/${id}`, 'error', 'Unknown contact type.');
      return true;
    }
    // Keep the log bounded.
    const trimmed = log.slice(-100);
    try {
      await prisma.jobApplication.update({ where: { id }, data: { contactLog: trimmed } });
    } catch (err) {
      console.warn('[applicants] contact log save failed:', err.message);
      if (isXhr) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: err.message })); return true; }
      flashRedirect(res, `/admin/applicants/${id}`, 'error', `Contact log failed: ${err.message}`);
      return true;
    }
    writeAudit(prisma, req, user, {
      action: kind === 'undo' ? 'contact_undo' : 'contact_log',
      resourceType: 'jobApplication',
      resourceId: id,
      resourceLabel: `${app.name} — ${kind}`,
    }).catch(() => {});
    const updated = { id, contactLog: trimmed };
    if (isXhr) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, badgeHtml: contactBadgeHtml(updated), historyHtml: contactHistoryHtml(updated) }));
      return true;
    }
    flashRedirect(res, `/admin/applicants/${id}`, 'success', kind === 'undo' ? 'Removed last call.' : `Logged: ${CONTACT_KINDS[kind].label}.`);
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

  // ─── Interview scorecard: POST /admin/applicants/interviews/:id/scorecard ───
  // Structured post-interview feedback on the same five categories the AI
  // screener scores, plus an overall call. This is the ground truth the
  // calibration reports compare the screener against.
  const scorecardMatch = pathname.match(/^\/admin\/applicants\/interviews\/([0-9a-f-]{8,})\/scorecard$/i);
  if (scorecardMatch && req.method === 'POST') {
    const id = scorecardMatch[1];
    const interview = await prisma.interview.findUnique({
      where: { id },
      include: { application: true },
    }).catch(() => null);
    if (!interview || (!userIsCompanyWide && !allowedLocationIds.has(interview.locationId))) {
      sendHTML(res, 404, '<h1>Not found</h1>');
      return true;
    }
    const body = await parseBody(req);
    const { CATEGORIES } = require('../hiring/knowledgeBase');
    const scores = {};
    for (const cat of CATEGORIES) {
      const raw = parseFloat(body[`score_${cat}`]);
      if (Number.isFinite(raw) && raw >= 1 && raw <= 5) {
        scores[cat] = Math.round(raw * 2) / 2;
      }
    }
    const VALID_OVERALL = new Set(['strong_yes', 'yes', 'maybe', 'no']);
    const overall = VALID_OVERALL.has(String(body.overall)) ? String(body.overall) : null;
    const notes = String(body.notes || '').trim().slice(0, 4000) || null;
    if (!overall && Object.keys(scores).length === 0 && !notes) {
      flashRedirect(res, `/admin/applicants/${interview.applicationId}`, 'error', 'Scorecard was empty — pick an overall call or score at least one category.');
      return true;
    }
    await prisma.interview.update({
      where: { id },
      data: {
        scorecard: { scores, overall, notes },
        scorecardBy: user.email || null,
        scorecardAt: new Date(),
      },
    });
    writeAudit(prisma, req, user, {
      action: 'update',
      resourceType: 'interview_scorecard',
      resourceId: id,
      resourceLabel: `${interview.application?.name || ''}`,
      details: { overall, scoredCategories: Object.keys(scores).length },
    }).catch(() => {});
    flashRedirect(res, `/admin/applicants/${interview.applicationId}`, 'success', 'Interview scorecard saved.');
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
      // Default view shows only the active pipeline. Terminal statuses —
      // hired (filed under the Hired chip) and archived (rejected /
      // keep_on_file / withdrawn) — drop off the main screen. Admins reach
      // them via the matching chip or ?status=.
      where.status = { notIn: ['hired', 'rejected', 'keep_on_file', 'withdrawn'] };
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
              verdictBucket: true,
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
    const counts = { new: 0, reviewing: 0, interview_scheduled: 0, interviewed: 0, offer_extended: 0, hired: 0, rejected: 0, keep_on_file: 0, withdrawn: 0 };
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

  // Companion SMS — hospitality candidates answer texts far more reliably
  // than email. No-op unless TWILIO_* env vars are configured.
  if (application.phone) {
    const smsBits = [
      `Dram & Draught: your ${typeLabel} for the ${application.position} role is confirmed for ${dateStr} (Eastern).`,
      interview.locationDetail ? `Where: ${interview.locationDetail}` : null,
      'Details are in your email. Reply there if anything changes.',
    ].filter(Boolean);
    sendSms({ to: application.phone, body: smsBits.join(' ') })
      .then((r) => { if (!r.ok && !r.skipped) console.warn('[applicants] confirmation SMS failed:', r.reason); })
      .catch((err) => console.warn('[applicants] confirmation SMS failed:', err.message));
  }
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

// "Keep on file" is softer than a rejection — we don't have a spot for them
// right now, but we'd genuinely like to reach back out when one opens up.
async function sendKeepOnFileEmail(application, reason) {
  if (!application?.email) return;
  const firstName = (application.name || '').split(' ')[0] || 'there';
  const positionLine = application.position
    ? `the ${application.position} role`
    : 'your application';
  const lines = [
    `Hi ${firstName},`,
    '',
    `Thank you for taking the time to apply for ${positionLine} at Dram & Draught. We don't have the right spot open for you right now, but we'd like to keep your application on file.`,
    '',
    "When a position opens up that looks like a good fit, we'll reach back out. No need to reapply in the meantime — we'll have your info ready to go.",
    reason ? `\nA quick note from our team: ${reason}` : null,
    '',
    'Thanks again for your interest in joining us.',
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
