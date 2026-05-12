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

// Code-enforced recommendation. Trusts the AI's "hold" verdict; otherwise
// re-derives from the recomputed weighted score + minimum category score.
function determineRecommendation({ weightedScore, categoryScores, aiRecommendation, hasSeriousConcern, availabilityCompatible }) {
  const scores = (categoryScores || []).map((c) => c && typeof c.score === 'number' ? c.score : 0);
  const minScore = scores.length ? Math.min(...scores) : 0;

  if (availabilityCompatible === false) return 'hold';
  if (hasSeriousConcern) return 'hold';
  if (aiRecommendation === 'hold') return 'hold';
  if (minScore > 0 && minScore < 2.5) return 'hold';
  if (weightedScore < 3.2) return 'hold';
  if (weightedScore >= 4.2 && minScore >= 3.5) return 'strong_callback';
  if (weightedScore >= 3.7 && minScore >= 3.0) return 'callback';
  return 'maybe';
}

function buildUserPrompt({ application, questionnaire, roleWeights }) {
  const role = application.position
    ? String(application.position).toLowerCase().replace(/[^a-z]+/g, '_')
    : 'other';
  const availabilityText = application.availability
    ? JSON.stringify(application.availability)
    : '(not provided)';
  const answerLines = QUESTIONS.map((q) => {
    const text = (questionnaire.answers || {})[q.id] || '(no answer)';
    return `Q${q.order} (${q.id}) [signals: ${q.scoringCategories.join(', ')}]: ${q.text}\nA: ${text}`;
  }).join('\n\n');
  const weightLines = CATEGORIES
    .map((c) => `${c} (${CATEGORY_LABELS[c]}): ${roleWeights[c]}`)
    .join('\n');
  return `Evaluate this applicant for Dram & Draught.

Application details:
- Applicant role: ${application.position || '(unspecified)'}${application.positionOther ? ` — "${application.positionOther}"` : ''}
- Normalized role key: ${role}
- Availability grid: ${availabilityText}
- Q20 self-reported availability is included below in the answers.

Role-specific category weights (sum to 100):
${weightLines}

Use this scoring rubric:
1 = clear job-related concern
2 = weak evidence or concern
3 = acceptable but limited evidence
4 = good evidence and likely alignment
5 = strong evidence and strong alignment

Questionnaire answers:

${answerLines}

Return ONLY valid JSON matching the required schema. Score every category. Quote the applicant's own words when listing evidence or concerns. Suggest 3-5 interview follow-ups, especially for any category scored 3 or below.`;
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
  // what the AI claimed.
  const normalizedCategoryScores = CATEGORIES.map((category) => {
    const fromAi = (parsed.categoryScores || []).find((c) => c && c.category === category) || {};
    const score = Number.isInteger(fromAi.score) ? Math.max(1, Math.min(5, fromAi.score)) : 0;
    return {
      category,
      score,
      weight: roleWeights[category] || 0,
      evidence: Array.isArray(fromAi.evidence) ? fromAi.evidence.slice(0, 8).map(String) : [],
      rationale: typeof fromAi.rationale === 'string' ? fromAi.rationale : '',
      concerns: Array.isArray(fromAi.concerns) ? fromAi.concerns.slice(0, 8).map(String) : [],
    };
  });

  const weightedScore = recomputeWeightedScore(normalizedCategoryScores, role);

  // Merge AI-flagged human-review reasons with code-detected ones.
  const codeFlags = detectHumanReviewSignals(questionnaire.answers);
  const aiFlags = Array.isArray(parsed.humanReviewReasons) ? parsed.humanReviewReasons.map(String) : [];
  const humanReviewReasons = Array.from(new Set([...aiFlags, ...codeFlags]));
  const humanReviewRequired = humanReviewReasons.length > 0 || parsed.humanReviewRequired === true;

  // Detect a serious concern that should force a hold.
  const concerns = Array.isArray(parsed.jobRelatedConcerns) ? parsed.jobRelatedConcerns.map(String) : [];
  const hasSeriousConcern = concerns.some((c) => /can(?:not|'t)\s+(work|meet|commit)|legal eligibility|underage|under 21/i.test(c));

  const recommendation = determineRecommendation({
    weightedScore,
    categoryScores: normalizedCategoryScores,
    aiRecommendation: parsed.recommendation,
    hasSeriousConcern,
    availabilityCompatible: undefined,
  });

  const confidence = ['high', 'medium', 'low'].includes(parsed.confidence) ? parsed.confidence : 'medium';

  return {
    errorDetail: null,
    recommendation,
    weightedScore,
    confidence,
    humanReviewRequired,
    humanReviewReasons,
    candidateSummary: String(parsed.candidateSummary || '').slice(0, 4000),
    overallRationale: String(parsed.overallRationale || '').slice(0, 4000),
    jobRelatedConcerns: concerns,
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
  recomputeWeightedScore,
  determineRecommendation,
  MODEL,
};
