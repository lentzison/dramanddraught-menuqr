// Data-retention purge for closed job applications.
//
// Two stages, both restricted to non-hired terminal statuses (rejected,
// keep_on_file, withdrawn) — hired applicants become employees and their
// records stay intact:
//
//   Stage 1 — resume strip (default 18 months after the decision): the
//   base64 resume blob (up to 5 MB per row) is deleted. Keeps the database
//   lean and stops holding documents we no longer need.
//
//   Stage 2 — anonymize (default 30 months): name/email/phone and the other
//   free-text PII (essays, employers, contact log, notes, questionnaire
//   answers, AI narrative text and raw payload) are redacted. Scores,
//   verdicts, statuses, and version stamps are KEPT so the calibration
//   reports stay meaningful in aggregate.
//
// Timing is based on decisionAt (when the application was closed), falling
// back to createdAt. Runs once per day in the 4 AM Eastern hour. Configure:
//   DATA_RETENTION_DISABLED=1            turn the whole job off
//   RETENTION_RESUME_MONTHS=18           stage 1 horizon
//   RETENTION_ANONYMIZE_MONTHS=30        stage 2 horizon

const TERMINAL_NON_HIRED = ['rejected', 'keep_on_file', 'withdrawn'];

const DISABLED = process.env.DATA_RETENTION_DISABLED === '1';
const RESUME_MONTHS = Math.max(1, parseInt(process.env.RETENTION_RESUME_MONTHS || '18', 10) || 18);
const ANONYMIZE_MONTHS = Math.max(1, parseInt(process.env.RETENTION_ANONYMIZE_MONTHS || '30', 10) || 30);

let lastRunDateKey = null;

function easternHour(date = new Date()) {
  return parseInt(date.toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false }), 10);
}

function easternDateKey(date = new Date()) {
  return date.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

function monthsAgo(n) {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d;
}

// Closed-before filter: decisionAt older than the cutoff, or (legacy rows
// with no decisionAt) createdAt older than the cutoff.
function closedBefore(cutoff) {
  return {
    OR: [
      { decisionAt: { lte: cutoff } },
      { decisionAt: null, createdAt: { lte: cutoff } },
    ],
  };
}

async function stripResumes(prisma) {
  const cutoff = monthsAgo(RESUME_MONTHS);
  const res = await prisma.jobApplication.updateMany({
    where: {
      status: { in: TERMINAL_NON_HIRED },
      resumeData: { not: null },
      ...closedBefore(cutoff),
    },
    data: { resumeData: null, resumeFileName: null, resumeMimeType: null },
  });
  return res.count || 0;
}

async function anonymizeApplications(prisma) {
  const cutoff = monthsAgo(ANONYMIZE_MONTHS);
  // The "already anonymized" sentinel is the redacted email domain — rows we
  // processed before are excluded so the job stays idempotent.
  const targets = await prisma.jobApplication.findMany({
    where: {
      status: { in: TERMINAL_NON_HIRED },
      email: { not: { endsWith: '@redacted.invalid' } },
      ...closedBefore(cutoff),
    },
    select: { id: true },
    take: 500,
  });
  for (const { id } of targets) {
    const shortId = id.slice(0, 8);
    await prisma.jobApplication.update({
      where: { id },
      data: {
        name: `Applicant ${shortId}`,
        email: `redacted-${shortId}@redacted.invalid`,
        phone: null,
        positionOther: null,
        priorEmployers: null,
        certifications: null,
        spiritKnowledge: null,
        whyDD: null,
        referredBy: null,
        resumeData: null,
        resumeFileName: null,
        resumeMimeType: null,
        internalNotes: null,
        decisionNote: null,
        contactLog: [],
        ipAddress: null,
        visitorId: null,
        sessionId: null,
      },
    });
    // Free-text questionnaire answers carry PII; the version stamp stays so
    // historical counts by questionnaire version remain correct.
    await prisma.jobApplicationQuestionnaire.updateMany({
      where: { applicationId: id },
      data: { answers: { redacted: true } },
    }).catch(() => {});
    // Keep scores/verdict/version for aggregates; drop narrative text and the
    // raw payload, which quote the applicant.
    await prisma.jobApplicationAiEvaluation.updateMany({
      where: { applicationId: id },
      data: {
        candidateSummary: '(redacted by retention policy)',
        positiveSignalSummary: null,
        overallRationale: '(redacted by retention policy)',
        humanReviewReasons: [],
        jobRelatedConcerns: [],
        suggestedInterviewQuestions: [],
        categoryScores: [],
        rawAiPayload: null,
      },
    }).catch(() => {});
  }
  return targets.length;
}

async function runDataRetention(prisma) {
  if (!prisma || DISABLED) return;
  if (easternHour() !== 4) return;
  const todayKey = easternDateKey();
  if (lastRunDateKey === todayKey) return;
  lastRunDateKey = todayKey;

  try {
    const stripped = await stripResumes(prisma);
    const anonymized = await anonymizeApplications(prisma);
    if (stripped || anonymized) {
      console.log(`[data-retention] stripped ${stripped} resume(s) (> ${RESUME_MONTHS} mo), anonymized ${anonymized} application(s) (> ${ANONYMIZE_MONTHS} mo)`);
    }
  } catch (err) {
    console.warn('[data-retention] run failed:', err.message);
  }
}

// A rejected background run must never reach the process-level handler as an
// unhandled rejection; log it with its job name and let the next tick retry.
function guard(err) {
  console.error('[data-retention] run failed:', err && err.stack ? err.stack : err);
}

function scheduleDataRetention(prisma) {
  if (DISABLED) {
    console.log('[data-retention] disabled via DATA_RETENTION_DISABLED=1');
    return;
  }
  runDataRetention(prisma).catch(guard);
  setInterval(() => runDataRetention(prisma).catch(guard), 30 * 60 * 1000);
}

module.exports = { runDataRetention, scheduleDataRetention, stripResumes, anonymizeApplications };
