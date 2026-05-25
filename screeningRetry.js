// Background retry for failed AI screening runs.
//
// The questionnaire POST fires `runAiEvaluation` fire-and-forget. If Claude
// returns an error or the network blips, the JobApplicationAiEvaluation row
// gets a populated `errorDetail` field and the candidate never sees a verdict
// without a manual admin retry. This cron looks for those rows, retries up
// to MAX_RETRIES times per row, and stops trying after MAX_AGE_HOURS so we
// don't loop on permanent failures.

const { runAiEvaluation } = require('./hiring/aiEvaluation');

const POLL_INTERVAL_MS = 15 * 60 * 1000; // every 15 minutes
const MAX_RETRIES_PER_RUN = 5;          // ceiling per cron tick
const MAX_AGE_HOURS = 24;               // stop retrying after this

async function persistRetry(prisma, application, evaluation) {
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
}

async function runScreeningRetry(prisma) {
  if (!prisma) return;
  const cutoff = new Date(Date.now() - MAX_AGE_HOURS * 60 * 60 * 1000);
  // Two failure modes to recover from:
  //  (a) Eval row exists with errorDetail set — Claude returned something we
  //      couldn't parse, or hit a transient API error.
  //  (b) Questionnaire exists but no eval row was ever created — the initial
  //      fire-and-forget call crashed before the upsert ran.
  try {
    const failedEvals = await prisma.jobApplicationAiEvaluation.findMany({
      where: {
        errorDetail: { not: null },
        updatedAt: { gte: cutoff },
      },
      orderBy: { updatedAt: 'asc' },
      take: MAX_RETRIES_PER_RUN,
      include: {
        application: {
          include: { questionnaire: true },
        },
      },
    });

    const orphans = await prisma.jobApplication.findMany({
      where: {
        questionnaire: { isNot: null },
        aiEvaluation: { is: null },
        // Don't chase rejected/withdrawn — they're not actionable anymore.
        status: { notIn: ['rejected', 'withdrawn'] },
      },
      include: { questionnaire: true },
      orderBy: { createdAt: 'desc' },
      take: MAX_RETRIES_PER_RUN,
    });

    const targets = [];
    for (const ev of failedEvals) {
      if (ev.application && ev.application.questionnaire) {
        targets.push({ application: ev.application, questionnaire: ev.application.questionnaire });
      }
    }
    for (const app of orphans) {
      if (app.questionnaire) {
        targets.push({ application: app, questionnaire: app.questionnaire });
      }
    }

    if (targets.length === 0) return;

    let ok = 0;
    let failed = 0;
    for (const t of targets) {
      try {
        const evaluation = await runAiEvaluation({ application: t.application, questionnaire: t.questionnaire });
        await persistRetry(prisma, t.application, evaluation);
        if (evaluation.errorDetail) failed += 1;
        else ok += 1;
      } catch (err) {
        console.warn('[screening-retry]', t.application.id, 'failed:', err.message);
        failed += 1;
      }
    }
    console.log(`[screening-retry] ${ok} recovered, ${failed} still failing`);
  } catch (err) {
    console.warn('[screening-retry] poll failed:', err.message);
  }
}

function scheduleScreeningRetry(prisma) {
  // Wait 2 minutes after boot so the rest of the app settles, then poll.
  setTimeout(() => runScreeningRetry(prisma), 2 * 60 * 1000);
  setInterval(() => runScreeningRetry(prisma), POLL_INTERVAL_MS);
}

module.exports = { runScreeningRetry, scheduleScreeningRetry };
