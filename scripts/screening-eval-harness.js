#!/usr/bin/env node
// Screening eval harness — regression-test prompt/KB changes against real,
// already-screened applications before they hit live applicants.
//
// Re-runs the CURRENT screener (current prompt, KB, rubric, model) on past
// questionnaires and compares the fresh verdict to (a) the stored verdict
// from whatever prompt version originally ran, and (b) the manager's actual
// pipeline decision when one exists. Nothing is written to the database.
//
// Usage:
//   node scripts/screening-eval-harness.js                 # 20 most recent screened apps
//   node scripts/screening-eval-harness.js --limit 50
//   node scripts/screening-eval-harness.js --decided-only  # only apps with a terminal/advanced status
//
// Cost note: each application is one (cached-prompt) model call, so a
// --limit 20 run costs roughly what 20 live screenings cost. Run after any
// knowledgeBase.js change; eyeball the CHANGED rows before deploying.

require('dotenv').config();
const prisma = require('../db');
const { runAiEvaluation } = require('../hiring/aiEvaluation');
const { PROMPT_VERSION } = require('../hiring/knowledgeBase');

const ADVANCED = new Set(['interview_scheduled', 'interviewed', 'offer_extended', 'hired']);
const DECIDED = new Set([...ADVANCED, 'rejected', 'keep_on_file', 'withdrawn']);

function bucketOf(ev) {
  if (!ev) return '(none)';
  if (ev.errorDetail) return 'screening_error';
  if (ev.verdictBucket) return ev.verdictBucket;
  if (ev.humanReviewRequired) return 'needs_human_review';
  if (ev.recommendation === 'strong_callback' || ev.recommendation === 'callback') return 'recommend_interview';
  return 'needs_human_review';
}

function managerOutcome(status) {
  if (status === 'hired') return 'hired';
  if (ADVANCED.has(status)) return 'advanced';
  if (status === 'rejected') return 'rejected';
  if (DECIDED.has(status)) return 'closed';
  return 'pending';
}

async function main() {
  const args = process.argv.slice(2);
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx >= 0 ? Math.max(1, parseInt(args[limitIdx + 1], 10) || 20) : 20;
  const decidedOnly = args.includes('--decided-only');

  const where = { questionnaire: { isNot: null }, aiEvaluation: { isNot: null } };
  if (decidedOnly) where.status = { in: Array.from(DECIDED) };

  const applications = await prisma.jobApplication.findMany({
    where,
    include: { questionnaire: true, aiEvaluation: true },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  if (!applications.length) {
    console.log('No screened applications found to evaluate against.');
    return;
  }

  console.log(`Re-running ${applications.length} screening(s) under ${PROMPT_VERSION} (dry run — nothing is persisted)\n`);

  let changed = 0;
  const rows = [];
  for (const app of applications) {
    const storedBucket = bucketOf(app.aiEvaluation);
    const outcome = managerOutcome(app.status);
    let freshBucket;
    let freshScore = null;
    try {
      const fresh = await runAiEvaluation({ application: app, questionnaire: app.questionnaire });
      freshBucket = fresh.errorDetail ? 'screening_error' : fresh.verdictBucket;
      freshScore = fresh.weightedScore;
    } catch (err) {
      freshBucket = `error: ${err.message.slice(0, 60)}`;
    }
    const isChanged = freshBucket !== storedBucket;
    if (isChanged) changed++;
    rows.push({
      id: app.id.slice(0, 8),
      name: app.name,
      position: app.position,
      stored: `${storedBucket} (${app.aiEvaluation.promptVersion}, ${app.aiEvaluation.weightedScore})`,
      fresh: `${freshBucket}${freshScore != null ? ` (${freshScore})` : ''}`,
      manager: outcome,
      flag: isChanged ? 'CHANGED' : '',
    });
    console.log(`${isChanged ? '≠' : '='} ${app.id.slice(0, 8)} ${String(app.name).slice(0, 24).padEnd(24)} ${String(app.position).padEnd(14)} stored=${storedBucket} fresh=${freshBucket} manager=${outcome}`);
  }

  console.log(`\n${changed}/${applications.length} verdict(s) changed under the current prompt.`);

  // Agreement of the FRESH verdicts with manager decisions, where one exists.
  const decided = rows.filter((r) => r.manager !== 'pending' && !r.fresh.startsWith('error'));
  if (decided.length) {
    const recommendAdvanced = decided.filter((r) => r.fresh.startsWith('recommend_interview') && (r.manager === 'advanced' || r.manager === 'hired')).length;
    const recommendTotal = decided.filter((r) => r.fresh.startsWith('recommend_interview')).length;
    console.log(`Fresh "recommend interview" verdicts that managers actually advanced: ${recommendAdvanced}/${recommendTotal || 0}`);
  }
  console.log('\nReview CHANGED rows above before deploying a prompt/KB bump.');
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
