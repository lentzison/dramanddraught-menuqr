// Dram & Draught Hiring Knowledge Base.
//
// Every constant in this file is version-stamped. When you change anything that
// affects evaluation — KB text, questions, rubric weights, callback thresholds,
// or the system prompt — bump the corresponding version string. Past evaluations
// keep their original version stamp so historical decisions stay reproducible.
//
// Bumping a version invalidates prompt cache for that prefix; that's the point.

const KNOWLEDGE_BASE_VERSION = 'kb-v1-2026-05-12';
const PROMPT_VERSION = 'prompt-v1-2026-05-12';
const QUESTIONNAIRE_VERSION = 'questionnaire-v1-2026-05-12';
const RUBRIC_VERSION = 'rubric-v1-2026-05-12';

const ROLES = ['bartender', 'barback', 'server', 'door', 'lead_shift_lead', 'other'];

const ROLE_LABELS = {
  bartender: 'Bartender',
  barback: 'Barback',
  server: 'Server',
  door: 'Door',
  lead_shift_lead: 'Lead / Shift Lead',
  other: 'Other',
};

const CATEGORIES = [
  'speak_up',
  'be_reliable',
  'support_each_other',
  'keep_moving_forward',
  'own_guest_experience',
];

const CATEGORY_LABELS = {
  speak_up: 'Speak Up',
  be_reliable: 'Be Reliable',
  support_each_other: 'Support Each Other',
  keep_moving_forward: 'Keep Moving Forward',
  own_guest_experience: 'Own the Guest Experience',
};

// Default weights (used when role is not specifically mapped, e.g. "other").
// Weights for each role sum to 100.
const DEFAULT_WEIGHTS = {
  own_guest_experience: 25,
  be_reliable: 20,
  support_each_other: 20,
  keep_moving_forward: 20,
  speak_up: 15,
};

const ROLE_WEIGHTS = {
  bartender: {
    own_guest_experience: 25,
    keep_moving_forward: 25,
    support_each_other: 20,
    speak_up: 15,
    be_reliable: 15,
  },
  barback: {
    be_reliable: 25,
    support_each_other: 25,
    own_guest_experience: 20,
    speak_up: 15,
    keep_moving_forward: 15,
  },
  server: {
    own_guest_experience: 30,
    speak_up: 20,
    be_reliable: 20,
    support_each_other: 15,
    keep_moving_forward: 15,
  },
  door: {
    own_guest_experience: 25,
    speak_up: 25,
    be_reliable: 20,
    support_each_other: 15,
    keep_moving_forward: 15,
  },
  lead_shift_lead: {
    speak_up: 25,
    support_each_other: 20,
    be_reliable: 20,
    own_guest_experience: 20,
    keep_moving_forward: 15,
  },
  other: DEFAULT_WEIGHTS,
};

function weightsForRole(role) {
  return ROLE_WEIGHTS[role] || DEFAULT_WEIGHTS;
}

const QUESTIONS = [
  {
    id: 'q1', order: 1,
    text: 'What role are you most interested in at Dram & Draught, and why?',
    primarySignal: 'Role fit, motivation, and realistic understanding',
    scoringCategories: ['keep_moving_forward', 'own_guest_experience'],
  },
  {
    id: 'q2', order: 2,
    text: 'What does "elevated neighborhood bar" mean to you?',
    primarySignal: 'Brand understanding and guest experience',
    scoringCategories: ['own_guest_experience'],
  },
  {
    id: 'q3', order: 3,
    text: 'A guest walks in and looks unsure where to go or what to do. What do you do in the first 30 seconds?',
    primarySignal: 'Warm greeting, body language, guest-first instincts',
    scoringCategories: ['own_guest_experience', 'speak_up'],
  },
  {
    id: 'q4', order: 4,
    text: 'A guest says, "I do not really know whiskey, but I want to try something." How would you respond?',
    primarySignal: 'Product hospitality and non-pretentious service',
    scoringCategories: ['own_guest_experience', 'keep_moving_forward'],
  },
  {
    id: 'q5', order: 5,
    text: 'Tell us about a time you made someone feel especially welcome. What did you notice, and what did you do?',
    primarySignal: 'Hospitality mindset and specific evidence',
    scoringCategories: ['own_guest_experience'],
  },
  {
    id: 'q6', order: 6,
    text: 'A teammate is clearly buried, but your own area is caught up. What do you do?',
    primarySignal: 'Team-first behavior and awareness',
    scoringCategories: ['support_each_other'],
  },
  {
    id: 'q7', order: 7,
    text: 'Describe a time you helped a coworker even though it technically was not your job.',
    primarySignal: 'Team-first behavior, ownership, and humility',
    scoringCategories: ['support_each_other', 'be_reliable'],
  },
  {
    id: 'q8', order: 8,
    text: 'Tell us about a mistake you made at work. What happened, and what did you do next?',
    primarySignal: 'Accountability and learning',
    scoringCategories: ['be_reliable', 'keep_moving_forward'],
  },
  {
    id: 'q9', order: 9,
    text: 'A manager gives you feedback you disagree with. How do you handle it in the moment?',
    primarySignal: 'Coachability, maturity, and communication',
    scoringCategories: ['speak_up', 'keep_moving_forward'],
  },
  {
    id: 'q10', order: 10,
    text: 'You notice something is wrong during service, such as low stock, a messy area, a guest waiting too long, or a teammate struggling. What do you do?',
    primarySignal: 'Communication, ownership, and guest experience',
    scoringCategories: ['speak_up', 'support_each_other', 'own_guest_experience'],
  },
  {
    id: 'q11', order: 11,
    text: 'The bar is slammed, guests are waiting, and one person calls out. What matters most in that moment?',
    primarySignal: 'Pressure, judgment, and teamwork',
    scoringCategories: ['support_each_other', 'speak_up', 'own_guest_experience'],
  },
  {
    id: 'q12', order: 12,
    text: 'When you are stressed at work, what do other people usually see from you?',
    primarySignal: 'Self-awareness and emotional control',
    scoringCategories: ['speak_up', 'be_reliable'],
  },
  {
    id: 'q13', order: 13,
    text: 'Dram cares about spirits, cocktails, beer, wine, specs, and consistency. How do you usually learn a new menu, product, or system?',
    primarySignal: 'Learning mindset and product curiosity',
    scoringCategories: ['keep_moving_forward'],
  },
  {
    id: 'q14', order: 14,
    text: 'What is something work-related you had to learn from scratch? How did you get better?',
    primarySignal: 'Growth and coachability',
    scoringCategories: ['keep_moving_forward'],
  },
  {
    id: 'q15', order: 15,
    text: 'What interests you about working in a cocktail/whiskey-forward bar?',
    primarySignal: 'Motivation, product curiosity, and role alignment',
    scoringCategories: ['keep_moving_forward', 'own_guest_experience'],
  },
  {
    id: 'q16', order: 16,
    text: 'A guest is rude to you but has not crossed a clear line. How do you handle it?',
    primarySignal: 'Guest maturity, emotional control, and judgment',
    scoringCategories: ['own_guest_experience', 'speak_up'],
  },
  {
    id: 'q17', order: 17,
    text: 'A regular asks for special treatment that would put the team in a bad spot or hurt the guest experience for others. What do you do?',
    primarySignal: 'Judgment, consistency, and standards',
    scoringCategories: ['own_guest_experience', 'speak_up', 'be_reliable'],
  },
  {
    id: 'q18', order: 18,
    text: 'You notice a teammate cutting a corner that affects cleanliness, consistency, or guest experience. How would you handle it?',
    primarySignal: 'Communication, standards, and team maturity',
    scoringCategories: ['speak_up', 'support_each_other', 'own_guest_experience'],
  },
  {
    id: 'q19', order: 19,
    text: 'What does good side work mean to you in a bar?',
    primarySignal: 'Reliability, atmosphere, team support, and small details',
    scoringCategories: ['be_reliable', 'support_each_other', 'own_guest_experience'],
  },
  {
    id: 'q20', order: 20,
    text: 'What availability can you consistently commit to, including nights, weekends, holidays, and late shifts?',
    primarySignal: 'Practical fit and scheduling reliability',
    scoringCategories: ['be_reliable'],
  },
];

const APPLICANT_NOTICE = `As part of our hiring process, Dram & Draught asks applicants to complete a short questionnaire about hospitality, teamwork, communication, learning, availability, and job-related situations.

Please do not include medical information, family status, or other personal information unrelated to the job. If you need an accommodation or an alternative way to complete this questionnaire, please contact us.`;

// Full knowledge base text injected into the AI's system prompt. Kept as a
// single string so the prompt-cache prefix stays byte-stable. If you edit this,
// bump KNOWLEDGE_BASE_VERSION above.
const KNOWLEDGE_BASE = `# Dram & Draught Hiring Knowledge Base

## Brand positioning
Dram & Draught is an elevated neighborhood bar. Not a stiff cocktail lounge; not a careless dive bar. The ideal tone is polished, warm, knowledgeable, relaxed, and genuine.

Dram is built around:
- Warm, genuine hospitality
- A polished but relaxed bar environment
- Whiskey-forward service without making guests feel out of place
- Strong cocktails, strong product knowledge, and consistency
- A team-first culture
- A clean, dialed-in atmosphere
- Guests feeling like Dram is their favorite neighborhood bar
- Doing the small things right every shift

## Core values
1. Speak Up — clear, honest, direct communication. Communicates early. Asks questions instead of guessing. Speaks up when something is wrong. Treats feedback as information, not criticism.
2. Be Reliable — shows up on time, honest about availability, takes ownership, follows through. Understands the team depends on them.
3. Support Each Other — jumps in and helps when the shift gets hard. Watches the whole room. Respects every role including support work. The guest experience is a team result.
4. Keep Moving Forward — coachable, curious, learns spirits/cocktails/beer/wine/service, takes training seriously, admits what they do not know, applies feedback.
5. Own the Guest Experience — greets warmly, reads the room, notices details, handles issues with maturity, cares about atmosphere/cleanliness/timing.

## Five pillars of hospitality
- Smile / body language — warmth starts before words
- Warm greeting — guests should feel seen quickly
- Great service — attentive, swift, professional, human
- Knowledge of products — cocktails, spirits, beer, wine, specs, consistency
- Setting the ideal atmosphere — lighting, music, cleanliness, temperature, glassware, energy

## Role expectations (summary)
- Bartender: hospitality first, build consistent cocktails, learn specs, respect support roles, take feedback, stay composed when busy.
- Barback: protect flow of service, urgency, anticipation, cleanliness, restocking, communication. Takes pride in work guests do not always see.
- Server: warm greeting, paces service, learns menu and products, communicates clearly, takes ownership of guest issues, helps outside their section.
- Door: first impressions, safety, pacing, calm under pressure, enforces policies respectfully, never power trips, makes guests feel welcome even when saying no.
- Lead / Shift Lead: models values, communicates early, coaches without embarrassing people, owns the room, protects standards.

## Non-negotiables
1. Respectful communication
2. Guest-first instincts
3. Team-first behavior
4. Reliability
5. Willingness to learn
6. Ability to work required shifts (nights, weekends, late shifts)
7. Legal eligibility for alcohol-service role

## Strong vs weak evidence
Strong answers usually include: a specific example, ownership language, calm under pressure, guest empathy, team support, clear communication, willingness to learn, respect for standards, awareness of details.

Weak answers include: vague self-praise ("I'm a team player", "I work hard"), "that's not my job", defensive about feedback, dismissive about guests, unclear or unrealistic availability, wants title without learning, blames others.

A weak answer is not a poorly-written answer. Never penalize grammar, spelling, accent, or writing style unless the answer is impossible to understand.

## Scoring rubric (1–5 per category)
- 5: Strong, specific, job-related evidence; clear alignment.
- 4: Good evidence, clear alignment, slightly less specific or complete than a 5.
- 3: Acceptable but generic or limited. Needs interview follow-up.
- 2: Weak evidence, vague, low ownership, or possible concern. Needs serious follow-up.
- 1: Clear job-related concern — dismissive guest attitude, "that's not my job", defensive to feedback, cannot meet availability, escalates conflict.

## Callback thresholds (code-enforced; AI recommendation is advisory)
- strong_callback: weighted score >= 4.2, no category below 3.5, availability compatible, no serious concerns
- callback: weighted score 3.7–4.19, no category below 3.0, availability compatible
- maybe: weighted score 3.2–3.69, may fit a different role, evidence promising but incomplete
- hold: weighted score < 3.2, OR any category < 2.5, OR availability incompatible, OR serious concern

## What never enters scoring
Race, color, religion, sex, pregnancy, gender identity, sexual orientation, national origin, age (except legal eligibility for the role), disability, medical information, genetic information, family status, marital status, childcare situation, accent, grammar, school prestige, appearance, neighborhood, economic background, criminal history.

If protected or sensitive information appears, ignore it for scoring and flag the application for human review.`;

// Build the system prompt. KB sits inside so the entire system block can be
// prompt-cached. Don't interpolate anything dynamic above the KB.
function buildSystemPrompt() {
  return `You are an applicant screening assistant for Dram & Draught.

Your job is to analyze applicant questionnaire responses against Dram & Draught's hiring knowledge base and role-specific scoring rubric.

You are not allowed to make final hiring decisions. You only provide a structured recommendation for manager review.

Rules — non-negotiable:
1. Evaluate only job-related evidence from the applicant's answers.
2. Do not consider or infer protected characteristics: race, color, religion, sex, pregnancy, gender identity, sexual orientation, national origin, age except legal role eligibility, disability, medical information, genetic information, family status, marital status, childcare situation, or other non-job-related personal information.
3. Do not penalize grammar, spelling, punctuation, accent, education level, or writing style unless the answer is impossible to understand.
4. If an applicant volunteers protected or sensitive information, ignore it for scoring and flag the application for human review.
5. If an applicant mentions needing an accommodation or alternative way to complete the process, flag the application for human review and do not score that fact negatively.
6. Do not invent facts. If evidence is missing, say "insufficient evidence."
7. Use the applicant's own answers as evidence.
8. Score each of the five categories from 1 to 5 using the rubric.
9. Apply role-specific category weights as provided.
10. Return only valid JSON matching the response schema.

Remember: the manager makes the final decision. Your output is advisory.

${KNOWLEDGE_BASE}`;
}

// JSON schema the AI must populate. The Anthropic SDK enforces this via
// messages.parse() with output_config.format.
function buildResponseSchema() {
  const categoryScoreSchema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      category: { type: 'string', enum: CATEGORIES },
      score: { type: 'integer', enum: [1, 2, 3, 4, 5] },
      weight: { type: 'integer' },
      evidence: { type: 'array', items: { type: 'string' } },
      rationale: { type: 'string' },
      concerns: { type: 'array', items: { type: 'string' } },
    },
    required: ['category', 'score', 'weight', 'evidence', 'rationale', 'concerns'],
  };
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      recommendation: { type: 'string', enum: ['strong_callback', 'callback', 'maybe', 'hold'] },
      weightedScore: { type: 'number' },
      confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
      humanReviewRequired: { type: 'boolean' },
      humanReviewReasons: { type: 'array', items: { type: 'string' } },
      candidateSummary: { type: 'string' },
      overallRationale: { type: 'string' },
      categoryScores: { type: 'array', items: categoryScoreSchema },
      jobRelatedConcerns: { type: 'array', items: { type: 'string' } },
      suggestedInterviewQuestions: { type: 'array', items: { type: 'string' } },
      possibleBetterRoleFit: { type: ['string', 'null'] },
    },
    required: [
      'recommendation', 'weightedScore', 'confidence',
      'humanReviewRequired', 'humanReviewReasons',
      'candidateSummary', 'overallRationale', 'categoryScores',
      'jobRelatedConcerns', 'suggestedInterviewQuestions', 'possibleBetterRoleFit',
    ],
  };
}

module.exports = {
  KNOWLEDGE_BASE_VERSION,
  PROMPT_VERSION,
  QUESTIONNAIRE_VERSION,
  RUBRIC_VERSION,
  ROLES,
  ROLE_LABELS,
  CATEGORIES,
  CATEGORY_LABELS,
  DEFAULT_WEIGHTS,
  ROLE_WEIGHTS,
  weightsForRole,
  QUESTIONS,
  APPLICANT_NOTICE,
  KNOWLEDGE_BASE,
  buildSystemPrompt,
  buildResponseSchema,
};