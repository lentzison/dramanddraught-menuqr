// AI evaluation service. Runs an applicant's questionnaire through Claude,
// then recomputes the weighted score and recommendation in code (never trusting
// the AI's claimed values for the final decision).

const Anthropic = require('@anthropic-ai/sdk');
const {
  KNOWLEDGE_BASE_VERSION,
  PROMPT_VERSION,
  CATEGORIES,
  CATEGORY_LABELS,
  QUESTIONS,
  weightsForRole,
  buildSystemPrompt,
  buildResponseSchema,
  THRESHOLDS,
  ROLE_MINIMUMS,
  minimumsForRole,
  missingRequiredAvailability,
  requiredAvailabilityForRole,
  MIN_ANSWER_LENGTH,
} = require('./knowledgeBase');

const MODEL = 'claude-opus-4-7';

// Keywords that mean "stop, flag for human review" — accommodation,
// disability, medical, religious, pregnancy, family obligations.
// Conservative on purpose; false positives just route to a human.
const HUMAN_REVIEW_KEYWORDS = [
  /\baccommodat(e|ion|ions|ed|ing)\b/i,
  /\bdisabilit(y|ies)\b/i,
  /\bdisabled\b/i,
  /\bmedical\b/i,
  /\billness\b/i,
  /\bpregnan(t|cy)\b/i,
  /\bmaternity\b/i,
  /\breligious\b/i,
  /\bobservance\b/i,
  /\bchildcare\b/i,
  /\bchild ?care\b/i,
  /\bsabbath\b/i,
  /\bADA\b/,
];

function detectHumanReviewSignals(answers) {
  const hits = new Set();
  for (const [qid, text] of Object.entries(answers || {})) {
    if (!text) continue;
    for (const pattern of HUMAN_REVIEW_KEYWORDS) {
      if (pattern.test(text)) {
        hits.add(`Answer to ${qid} mentions potentially sensitive personal information; manager should review.`);
        break;
      }
    }
  }
  return Array.from(hits);
}

// Recompute weighted score from category scores using OUR authoritative weights.
// The AI's claimed weighted score is ignored for the final decision.
function recomputeWeightedScore(categoryScores, role) {
  const weights = weightsForRole(role);
  let totalWeight = 0;
  let weightedSum = 0;
  for (const cat of CATEGORIES) {
    const entry = categoryScores.find((c) => c && c.category === cat);
    if (!entry || typeof entry.score !== 'number') continue;
    const w = weights[cat] || 0;
    weightedSum += entry.score * w;
    totalWeight += w;
  }
  if (totalWeight === 0) return 0;
  return Math.round((weightedSum / totalWeight) * 100) / 100;
}

// Code-enforced recommendation (v4 thresholds — three-state verdict).
// Internal value stays one of {strong_callback, callback, maybe, hold} so
// older callers keep working; the manager-facing bucket is computed by
// `verdictBucketFromInternal()` below using extra signals (role minimums,
// hard role-requirement gaps).
function determineRecommendation({ weightedScore, categoryScores, aiRecommendation, dealBreakers }) {
  const scores = (categoryScores || []).map((c) => c && typeof c.score === 'number' ? c.score : 0);
  const minScore = scores.length ? Math.min(...scores) : 0;

  if (dealBreakers && dealBreakers.length) return 'hold';
  if (aiRecommendation === 'hold') return 'hold';
  if (minScore > 0 && minScore < THRESHOLDS.reviewMinCategory) return 'hold';
  if (weightedScore < THRESHOLDS.recommend.weighted) return 'maybe';
  if (weightedScore >= THRESHOLDS.strongRecommend.weighted && minScore >= THRESHOLDS.strongRecommend.minCategory) return 'strong_callback';
  if (weightedScore >= THRESHOLDS.recommend.weighted && minScore >= THRESHOLDS.recommend.minCategory) return 'callback';
  return 'maybe';
}

// Walk the role minimums against the normalized category scores and report
// any that fall below. Used to route the manager-facing verdict to
// "needs_review" instead of "recommend" when a role-critical category is shy.
function evaluateRoleMinimums(role, categoryScores) {
  const mins = minimumsForRole(role);
  const violations = [];
  for (const [category, threshold] of Object.entries(mins)) {
    const entry = (categoryScores || []).find((c) => c && c.category === category);
    const score = entry && typeof entry.score === 'number' ? entry.score : 0;
    if (score < threshold) {
      violations.push({ category, score, threshold });
    }
  }
  return violations;
}

// Short-answer floor — any answer under MIN_ANSWER_LENGTH (excluding Q20)
// cannot serve as evidence for a category score above 2. If a category's
// mapped questions are majority short, cap its score at 2.
function capCategoriesForShortAnswers(categoryScores, answers) {
  const shortQs = new Set();
  for (const q of QUESTIONS) {
    if (q.id === 'q20') continue;
    const a = (answers && answers[q.id]) || '';
    if (a.trim().length < MIN_ANSWER_LENGTH) shortQs.add(q.id);
  }
  if (shortQs.size === 0) return { capped: categoryScores, notes: [] };

  const notes = [];
  const capped = categoryScores.map((entry) => {
    if (!entry) return entry;
    const mapped = QUESTIONS.filter((q) => q.scoringCategories.includes(entry.category) && q.id !== 'q20');
    if (mapped.length === 0) return entry;
    const shortCount = mapped.filter((q) => shortQs.has(q.id)).length;
    const ratio = shortCount / mapped.length;
    if (ratio >= 0.5 && entry.score > 2) {
      notes.push(`Capped ${entry.category} from ${entry.score} to 2: ${shortCount}/${mapped.length} mapped answers are below ${MIN_ANSWER_LENGTH} chars.`);
      return { ...entry, score: 2 };
    }
    return entry;
  });
  return { capped, notes };
}

// Identifies hard role-requirement gaps (deal-breakers). Returns an array of
// reasons (empty when clean). These route the verdict to
// "does_not_meet_role_requirements", not "needs_review".
function detectDealBreakers(application, role) {
  const reasons = [];
  const positionLower = String(application.position || '').toLowerCase();

  // Legal eligibility for alcohol-service duties (Bartender only).
  // alcoholEligibility is the new authoritative field; fall back to age21
  // for applications submitted before the form change.
  if (positionLower === 'bartender') {
    const elig = application.alcoholEligibility;
    if (elig === 'no') {
      reasons.push('Applicant is not legally eligible to perform alcohol-service duties for this Bartender role.');
    } else if (elig == null && application.age21 === false) {
      reasons.push('Applying for Bartender while under 21 (legal eligibility, legacy).');
    }
    // "unsure" intentionally not a deal-breaker — routes to human review.
  }

  // Structured availability grid must cover the role's required shifts.
  const missing = missingRequiredAvailability(role, application.availability);
  for (const slot of missing) {
    reasons.push(`Availability gap: ${slot} (required for ${role}).`);
  }

  return reasons;
}

// Manager-facing verdict bucket. The internal recommendation, deal-breakers,
// human-review flags, and role-minimum violations all feed into this single
// decision the manager sees.
function verdictBucketFromInternal({
  internalRecommendation,
  dealBreakers,
  humanReviewRequired,
  roleMinimumViolations,
}) {
  // Hard role-requirement gap → does_not_meet.
  if (dealBreakers && dealBreakers.length) return 'does_not_meet_role_requirements';
  // Anything triggering human review → needs_review.
  if (humanReviewRequired) return 'needs_human_review';
  // Role minimum violation → needs_review.
  if (roleMinimumViolations && roleMinimumViolations.length) return 'needs_human_review';
  // Clean recommend (strong_callback or callback) with no flags above.
  if (internalRecommendation === 'strong_callback' || internalRecommendation === 'callback') {
    return 'recommend_interview';
  }
  // Everything else (maybe, hold without role-requirement gap) lands in
  // needs_review so a manager always decides.
  return 'needs_human_review';
}

function buildUserPrompt({ application, questionnaire, roleWeights }) {
  const role = application.position
    ? String(application.position).toLowerCase().replace(/[^a-z]+/g, '_')
    : 'other';
  const availabilityText = application.availability
    ? JSON.stringify(application.availability)
    : '(not provided)';
  const answers = questionnaire.answers || {};

  const answerLines = QUESTIONS.map((q) => {
    const text = answers[q.id] || '(no answer)';
    const lengthFlag = (q.id !== 'q20' && text && text.trim().length < MIN_ANSWER_LENGTH)
      ? `\n  ⚠ SHORT ANSWER (${text.trim().length} chars) — cannot evidence a category above 2.`
      : '';
    const anchors = q.scoringAnchors
      ? `\n  Anchors:\n    5 = ${q.scoringAnchors[5]}\n    3 = ${q.scoringAnchors[3]}\n    1 = ${q.scoringAnchors[1]}`
      : '';
    const notes = q.notes ? `\n  Note: ${q.notes}` : '';
    return `Q${q.order} (${q.id}) [signals: ${q.scoringCategories.join(', ')}]: ${q.text}${anchors}${notes}\nA: ${text}${lengthFlag}`;
  }).join('\n\n');

  const weightLines = CATEGORIES
    .map((c) => `${c} (${CATEGORY_LABELS[c]}): ${roleWeights[c]}`)
    .join('\n');

  // Application-level facts the screener should know up front.
  const contextLines = [];
  // Bartender legal-eligibility — prefer the explicit alcoholEligibility
  // answer; fall back to age21 for legacy applications.
  if (application.position === 'Bartender') {
    if (application.alcoholEligibility === 'no') {
      contextLines.push('⚠ DEAL-BREAKER: Bartender applicant answered "No" to legal alcohol-service eligibility. Force recommendation to "hold".');
    } else if (application.alcoholEligibility === 'unsure') {
      contextLines.push('⚠ HUMAN REVIEW: Bartender applicant answered "Unsure" on legal alcohol-service eligibility. Flag for human review; do NOT recommend without manager confirmation.');
    } else if (application.alcoholEligibility == null && application.age21 === false) {
      contextLines.push('⚠ DEAL-BREAKER: Bartender applicant (legacy) is under 21. Force recommendation to "hold".');
    }
  }

  // Structured-availability gap check — list any required slots the role needs
  // that the applicant's grid does not cover. The screener should treat these
  // as hard role-requirement gaps (route to "hold"); the code maps that to
  // "does_not_meet_role_requirements" in the manager-facing verdict.
  const missingAvail = missingRequiredAvailability(role, application.availability);
  if (missingAvail.length) {
    contextLines.push(`⚠ DEAL-BREAKER: Structured availability does not cover required ${role} shifts — missing: ${missingAvail.join('; ')}.`);
  } else if ((requiredAvailabilityForRole(role) || []).length > 0) {
    contextLines.push(`Availability check: structured grid covers all required ${role} shifts.`);
  }

  // Compute days-from-today server-side so the model never has to estimate
  // calendar math (it was hallucinating "more than 60 days out" for dates
  // only days away — see https://github.com/dramanddraught/menuqr issue).
  // Use Eastern wall-clock so the boundary matches how we display dates.
  const todayEastern = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  todayEastern.setHours(0, 0, 0, 0);
  let earliestStartDaysOut = null;
  if (application.earliestStart) {
    const start = new Date(application.earliestStart);
    start.setHours(0, 0, 0, 0);
    const diffMs = start.getTime() - todayEastern.getTime();
    earliestStartDaysOut = Math.round(diffMs / (1000 * 60 * 60 * 24));
    if (Number.isFinite(earliestStartDaysOut)) {
      if (earliestStartDaysOut > 60) {
        contextLines.push(`⚠ HUMAN REVIEW: earliest start is ${earliestStartDaysOut} days from today (>60 days). Flag for human review.`);
      } else if (earliestStartDaysOut < 0) {
        contextLines.push(`Earliest start is ${Math.abs(earliestStartDaysOut)} days in the past. Use the application's createdAt as the effective start window; do NOT flag based on start date.`);
      } else {
        contextLines.push(`Earliest start is ${earliestStartDaysOut} day${earliestStartDaysOut === 1 ? '' : 's'} from today (within the 60-day window). Do NOT flag this for human review based on start date.`);
      }
    }
  }
  const contextBlock = contextLines.length
    ? `\nApplication-level flags (computed server-side — use these directly, do NOT compute calendar math yourself):\n${contextLines.map((l) => `- ${l}`).join('\n')}\n`
    : '';

  const todayLine = todayEastern.toISOString().slice(0, 10);

  return `Evaluate this applicant for Dram & Draught.

Application details:
- Today (Eastern): ${todayLine}
- Applicant role: ${application.position || '(unspecified)'}${application.positionOther ? ` — "${application.positionOther}"` : ''}
- Normalized role key: ${role}
- 21+ confirmed: ${application.age21 === true ? 'yes' : application.age21 === false ? 'NO' : 'unknown'}
- Earliest start: ${application.earliestStart ? `${new Date(application.earliestStart).toISOString().slice(0, 10)}${earliestStartDaysOut != null ? ` (${earliestStartDaysOut} day${earliestStartDaysOut === 1 ? '' : 's'} from today)` : ''}` : '(not provided)'}
- Availability grid: ${availabilityText}
- Q20 self-reported availability is included below in the answers.
${contextBlock}
Role-specific category weights (sum to 100):
${weightLines}

Scoring rubric (1–5 per category):
1 = clear job-related concern (dismissive, can't meet shifts, blames, "not my job")
2 = weak / vague / generic; possible concern
3 = addresses the question with at least one concrete detail but lacks a specific example. Most candidates should NOT cluster here — push to 2 or 4 if evidence allows.
4 = good specific evidence, clear alignment
5 = strong specific evidence, real example, behavioral detail

Short-answer floor: any answer below ${MIN_ANSWER_LENGTH} characters (excluding Q20) cannot evidence a category above 2. The user prompt above pre-flags these.

Use the per-question anchors below each question to calibrate scores. Quote the applicant's own words when listing evidence or concerns.

Questionnaire answers:

${answerLines}

Return ONLY valid JSON matching the required schema. Score every category. Suggest 3–5 interview follow-ups, especially for any category scored 3 or below.`;
}

// Extract the JSON object from the model's text content. messages.create()
// returns content as an array of blocks; the structured-output JSON arrives as
// a text block.
function parseModelJson(message) {
  for (const block of message.content || []) {
    if (block.type === 'text' && typeof block.text === 'string') {
      const t = block.text.trim();
      try {
        return JSON.parse(t);
      } catch (_) {
        // Fall through and try the next block / regex extraction.
      }
      const match = t.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          return JSON.parse(match[0]);
        } catch (_) {
          // continue
        }
      }
    }
  }
  throw new Error('No JSON object found in model response.');
}

function normalizeRoleKey(position) {
  if (!position) return 'other';
  const k = String(position).toLowerCase().replace(/[^a-z]+/g, '_').replace(/^_+|_+$/g, '');
  if (k === 'head_bartender' || k === 'general_manager' || k === 'manager') return 'lead_shift_lead';
  if (['bartender', 'barback', 'server', 'door', 'lead_shift_lead'].includes(k)) return k;
  if (k.includes('host') || k === 'floor_manager') return 'lead_shift_lead';
  return 'other';
}

async function callClaude({ apiKey, systemPrompt, userPrompt, responseSchema }) {
  const client = new Anthropic({ apiKey });
  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 8000,
    system: [
      {
        type: 'text',
        text: systemPrompt,
        cache_control: { type: 'ephemeral' },
      },
    ],
    output_config: {
      format: {
        type: 'json_schema',
        schema: responseSchema,
      },
    },
    messages: [{ role: 'user', content: userPrompt }],
  });
  return message;
}

// Top-level entry point. Returns the persisted (post-verification) evaluation
// object — ready to be passed to prisma.jobApplicationAiEvaluation.create.
async function runAiEvaluation({ application, questionnaire }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      errorDetail: 'ANTHROPIC_API_KEY not configured; AI evaluation skipped.',
      recommendation: 'hold',
      weightedScore: 0,
      confidence: 'low',
      humanReviewRequired: true,
      humanReviewReasons: ['AI evaluation could not run (configuration missing). Manager review required.'],
      candidateSummary: '',
      overallRationale: 'AI evaluation skipped — ANTHROPIC_API_KEY is not set on the server.',
      jobRelatedConcerns: [],
      suggestedInterviewQuestions: [],
      possibleBetterRoleFit: null,
      categoryScores: CATEGORIES.map((c) => ({ category: c, score: 0, weight: 0, evidence: [], rationale: 'Not evaluated.', concerns: [] })),
      modelName: MODEL,
      promptVersion: PROMPT_VERSION,
      knowledgeBaseVersion: KNOWLEDGE_BASE_VERSION,
      rawAiPayload: null,
    };
  }

  const role = normalizeRoleKey(application.position);
  const roleWeights = weightsForRole(role);

  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt({ application, questionnaire, roleWeights });
  const responseSchema = buildResponseSchema();

  let parsed = null;
  let rawMessage = null;
  let errorDetail = null;
  try {
    rawMessage = await callClaude({ apiKey, systemPrompt, userPrompt, responseSchema });
    parsed = parseModelJson(rawMessage);
  } catch (err) {
    errorDetail = `First attempt failed: ${err.message}`;
    // Retry once with a stricter instruction appended to the user prompt.
    try {
      rawMessage = await callClaude({
        apiKey,
        systemPrompt,
        userPrompt: userPrompt + '\n\nIMPORTANT: Your previous response was not valid JSON. Return ONLY a single JSON object matching the schema. No prose, no markdown fences, no explanation.',
        responseSchema,
      });
      parsed = parseModelJson(rawMessage);
      errorDetail = null;
    } catch (err2) {
      errorDetail = `${errorDetail}; retry failed: ${err2.message}`;
    }
  }

  if (!parsed) {
    return {
      errorDetail: errorDetail || 'AI returned no usable JSON.',
      recommendation: 'hold',
      weightedScore: 0,
      confidence: 'low',
      humanReviewRequired: true,
      humanReviewReasons: ['AI evaluation did not return valid JSON. Manager review required.'],
      candidateSummary: '',
      overallRationale: 'AI evaluation failed to produce a structured response.',
      jobRelatedConcerns: [],
      suggestedInterviewQuestions: [],
      possibleBetterRoleFit: null,
      categoryScores: CATEGORIES.map((c) => ({ category: c, score: 0, weight: roleWeights[c] || 0, evidence: [], rationale: 'Not evaluated.', concerns: [] })),
      modelName: MODEL,
      promptVersion: PROMPT_VERSION,
      knowledgeBaseVersion: KNOWLEDGE_BASE_VERSION,
      rawAiPayload: rawMessage ? { content: rawMessage.content } : null,
    };
  }

  // Normalize and re-weight category scores using OUR weights, regardless of
  // what the AI claimed. We now also persist citation fields (supporting
  // answer ids, strongest evidence quote, concern evidence, confidence,
  // suggested follow-up question) so the manager can audit per-category.
  let normalizedCategoryScores = CATEGORIES.map((category) => {
    const fromAi = (parsed.categoryScores || []).find((c) => c && c.category === category) || {};
    const score = Number.isInteger(fromAi.score) ? Math.max(1, Math.min(5, fromAi.score)) : 0;
    return {
      category,
      score,
      weight: roleWeights[category] || 0,
      evidence: Array.isArray(fromAi.evidence) ? fromAi.evidence.slice(0, 8).map(String) : [],
      rationale: typeof fromAi.rationale === 'string' ? fromAi.rationale : '',
      concerns: Array.isArray(fromAi.concerns) ? fromAi.concerns.slice(0, 8).map(String) : [],
      supportingAnswerIds: Array.isArray(fromAi.supportingAnswerIds)
        ? fromAi.supportingAnswerIds.slice(0, 6).map((s) => String(s).slice(0, 16))
        : [],
      strongestEvidence: typeof fromAi.strongestEvidence === 'string'
        ? fromAi.strongestEvidence.slice(0, 600)
        : '',
      concernEvidence: typeof fromAi.concernEvidence === 'string'
        ? fromAi.concernEvidence.slice(0, 600)
        : null,
      perCategoryConfidence: ['high', 'medium', 'low'].includes(fromAi.confidence) ? fromAi.confidence : null,
      followUpQuestion: typeof fromAi.followUpQuestion === 'string'
        ? fromAi.followUpQuestion.slice(0, 400)
        : '',
    };
  });

  // Apply the short-answer floor deterministically (in addition to the
  // prompt-level guidance to the screener).
  const capResult = capCategoriesForShortAnswers(normalizedCategoryScores, questionnaire.answers);
  normalizedCategoryScores = capResult.capped;

  const weightedScore = recomputeWeightedScore(normalizedCategoryScores, role);

  // Code-detected deal-breakers (hard role-requirement gaps).
  const codeDealBreakers = detectDealBreakers(application, role);

  // AI may surface deal-breakers in concerns (e.g. "cannot work Fridays").
  const concerns = Array.isArray(parsed.jobRelatedConcerns) ? parsed.jobRelatedConcerns.map(String) : [];
  const aiDealBreakers = concerns.filter((c) => /can(?:not|'t)\s+(work|meet|commit)|legal eligibility|underage|under 21|no friday|no saturday|cannot work (friday|saturday|weekends)/i.test(c));
  const dealBreakers = Array.from(new Set([...codeDealBreakers, ...aiDealBreakers]));

  // Role-specific category minimums — don't ship a recommend if a role-critical
  // category is shy of its floor. Routes to needs_review with a clear reason.
  const roleMinimumViolations = evaluateRoleMinimums(role, normalizedCategoryScores);

  // Merge human-review reasons: AI flags + code keyword scan + cap notes +
  // borderline-band rule + role-minimum violations + legal-eligibility
  // "Unsure".
  const codeFlags = detectHumanReviewSignals(questionnaire.answers);
  const aiFlags = Array.isArray(parsed.humanReviewReasons) ? parsed.humanReviewReasons.map(String) : [];
  const reviewFlags = [...aiFlags, ...codeFlags, ...capResult.notes];
  // Any category < 2.0 triggers review.
  if (normalizedCategoryScores.some((c) => c.score > 0 && c.score < 2)) {
    reviewFlags.push('A category scored below 2 — needs manager review before any decision.');
  }
  // Borderline band around the recommend threshold.
  if (weightedScore >= THRESHOLDS.recommend.weighted - THRESHOLDS.reviewBand
      && weightedScore <= THRESHOLDS.recommend.weighted + THRESHOLDS.reviewBand) {
    reviewFlags.push(`Weighted score ${weightedScore.toFixed(2)} is within ±${THRESHOLDS.reviewBand} of the recommend threshold — borderline.`);
  }
  // Role-minimum violations.
  for (const v of roleMinimumViolations) {
    reviewFlags.push(`${CATEGORY_LABELS[v.category] || v.category} score ${v.score.toFixed(1)} is below the ${role} role minimum of ${v.threshold}.`);
  }
  // Legal-eligibility "unsure" — manager confirms.
  if (String(application.position || '').toLowerCase() === 'bartender' && application.alcoholEligibility === 'unsure') {
    reviewFlags.push('Bartender applicant answered "Unsure" on legal eligibility — manager should confirm before any interview offer.');
  }
  const humanReviewReasons = Array.from(new Set(reviewFlags));
  const humanReviewRequired = humanReviewReasons.length > 0 || parsed.humanReviewRequired === true;

  const recommendation = determineRecommendation({
    weightedScore,
    categoryScores: normalizedCategoryScores,
    aiRecommendation: parsed.recommendation,
    dealBreakers,
  });

  const verdictBucket = verdictBucketFromInternal({
    internalRecommendation: recommendation,
    dealBreakers,
    humanReviewRequired,
    roleMinimumViolations,
  });

  const confidence = ['high', 'medium', 'low'].includes(parsed.confidence) ? parsed.confidence : 'medium';

  return {
    errorDetail: null,
    recommendation,
    verdictBucket,
    weightedScore,
    confidence,
    humanReviewRequired,
    humanReviewReasons,
    candidateSummary: String(parsed.candidateSummary || '').slice(0, 4000),
    overallRationale: String(parsed.overallRationale || '').slice(0, 4000),
    jobRelatedConcerns: Array.from(new Set([...concerns, ...codeDealBreakers])),
    suggestedInterviewQuestions: Array.isArray(parsed.suggestedInterviewQuestions)
      ? parsed.suggestedInterviewQuestions.slice(0, 10).map(String)
      : [],
    possibleBetterRoleFit: parsed.possibleBetterRoleFit ? String(parsed.possibleBetterRoleFit) : null,
    categoryScores: normalizedCategoryScores,
    modelName: MODEL,
    promptVersion: PROMPT_VERSION,
    knowledgeBaseVersion: KNOWLEDGE_BASE_VERSION,
    rawAiPayload: parsed,
  };
}

module.exports = {
  runAiEvaluation,
  normalizeRoleKey,
  detectHumanReviewSignals,
  detectDealBreakers,
  recomputeWeightedScore,
  determineRecommendation,
  capCategoriesForShortAnswers,
  MODEL,
};
