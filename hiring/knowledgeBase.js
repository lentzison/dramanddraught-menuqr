// Dram & Draught Hiring Knowledge Base.
//
// Every constant in this file is version-stamped so historical evaluations
// remain reproducible. Bump the version when its section changes:
//   KNOWLEDGE_BASE_VERSION   — the KB text shown to the screener
//   PROMPT_VERSION           — the screener system prompt structure / rules
//   QUESTIONNAIRE_VERSION    — question wording, ordering, or scoring anchors
//   RUBRIC_VERSION           — role weights, thresholds, or rubric definitions

const KNOWLEDGE_BASE_VERSION = 'kb-v4-2026-05-19';
const PROMPT_VERSION = 'prompt-v3-2026-05-19';
const QUESTIONNAIRE_VERSION = 'questionnaire-v2-2026-05-14';
const RUBRIC_VERSION = 'rubric-v4-2026-05-19';

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

// Default weights — used when role isn't specifically mapped. Each row sums to 100.
const DEFAULT_WEIGHTS = {
  own_guest_experience: 25,
  be_reliable: 20,
  support_each_other: 20,
  keep_moving_forward: 20,
  speak_up: 15,
};

// Role-specific weights (v2). Bartender + Server tuned per real-data review:
//   Bartender — Be Reliable bumped 15→20 (no-shows break the bar) and Support
//   Each Other dropped 20→15 (matters less than for support roles).
//   Server — guest experience boosted 20→30 to match brand emphasis.
const ROLE_WEIGHTS = {
  bartender: {
    own_guest_experience: 25,
    keep_moving_forward: 25,
    be_reliable: 20,
    speak_up: 15,
    support_each_other: 15,
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
    be_reliable: 20,
    support_each_other: 20,
    speak_up: 15,
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

// Callback thresholds (v3). Recommend floor at 3.7 — paired with v2's rubric
// rewrite (per-question anchors, short-answer floor, achievable 5s) that
// re-spreads scores instead of clustering them at 3.
const THRESHOLDS = {
  strongRecommend: { weighted: 4.2, minCategory: 3.5 },
  recommend:       { weighted: 3.7, minCategory: 3.0 },
  // anything below recommend → don't_recommend
  holdMinCategory: 2.5, // any category below this → forced don't_recommend
  reviewBand:      0.15, // weighted score within ±band of recommend threshold → flag review
};

const MIN_ANSWER_LENGTH = 15; // chars — questions below this can't push a category above 2 (Q20 exempt)

// Each question carries per-question scoring anchors that the screener uses
// to calibrate evidence. Keep anchors specific and behavioral; avoid generic
// adjectives like "good" or "thorough."
const QUESTIONS = [
  {
    id: 'q1', order: 1,
    text: 'What role are you most interested in at Dram & Draught, and why?',
    primarySignal: 'Role fit, motivation, and realistic understanding',
    scoringCategories: ['keep_moving_forward', 'own_guest_experience'],
    scoringAnchors: {
      5: 'Specific reason tied to learning, hospitality, or curiosity. Names what excites them about THIS role at THIS brand.',
      3: 'Likes the role generally; reason is plausible but generic.',
      1: 'Just wants money / "seems cool" / wants title without naming the work; or no reason at all.',
    },
    notes: 'If the applicant mentions multiple roles, treat role flexibility as positive evidence for Keep Moving Forward.',
  },
  {
    id: 'q2', order: 2,
    text: 'What does "elevated neighborhood bar" mean to you?',
    primarySignal: 'Brand understanding and guest experience',
    scoringCategories: ['own_guest_experience'],
    scoringAnchors: {
      5: 'Balances polished standards with relaxed warmth; mentions consistency, atmosphere, or making regulars feel at home.',
      3: 'Picks one side (either polished or casual) without recognising the balance.',
      1: 'Equates it with expensive drinks or with a dive bar; shows no awareness of the balance.',
    },
  },
  {
    id: 'q3', order: 3,
    text: 'A guest walks in and looks unsure where to go or what to do. What do you do in the first 30 seconds?',
    primarySignal: 'Warm greeting, body language, guest-first instincts',
    scoringCategories: ['own_guest_experience', 'speak_up'],
    scoringAnchors: {
      5: 'Greets immediately even if busy; mentions eye contact / acknowledgement; offers direction.',
      3: 'Greets when free; doesn\'t mention urgency or body language.',
      1: 'Waits to be asked; says "depends on whether it\'s my section"; ignores until available.',
    },
  },
  {
    id: 'q4', order: 4,
    text: 'A guest says, "I do not really know whiskey, but I want to try something." How would you respond?',
    primarySignal: 'Product hospitality and non-pretentious service',
    scoringCategories: ['own_guest_experience', 'keep_moving_forward'],
    scoringAnchors: {
      5: 'Asks guiding questions about flavor preferences before recommending; mentions specific products / styles; frames whiskey approachably.',
      3: 'Recommends a single product with no discovery; not condescending.',
      1: 'Dismissive, condescending, jargon-heavy, or refuses to engage; says they\'d defer to someone else with no ownership.',
    },
  },
  {
    id: 'q5', order: 5,
    text: 'Tell us about ONE specific guest you remember making feel welcome. What did you notice about them, and what did you do?',
    primarySignal: 'Hospitality mindset, attention to detail, and a specific example',
    scoringCategories: ['own_guest_experience'],
    scoringAnchors: {
      5: 'Concrete story with a person, a cue they noticed, and a specific action they took. Demonstrates reading the room.',
      3: 'Describes their general approach but no specific guest. Or names a guest but the action is generic ("kept their water full").',
      1: '"I do it with everyone" / "I\'m always nice" / no example at all.',
    },
  },
  {
    id: 'q6', order: 6,
    text: 'A teammate is clearly buried, but your own area is caught up. What do you do?',
    primarySignal: 'Team-first behavior and awareness',
    scoringCategories: ['support_each_other'],
    scoringAnchors: {
      5: 'Names what they\'d actually do (clear glassware, restock, greet, run drinks); frames it as shared guest experience.',
      3: 'Says they\'d "help out" generally with no specifics.',
      1: '"Stay in my section" / waits for manager to tell them / "not my job."',
    },
  },
  {
    id: 'q7', order: 7,
    text: 'Describe a time you helped a coworker even though it technically was not your job.',
    primarySignal: 'Team-first behavior, ownership, and humility',
    scoringCategories: ['support_each_other', 'be_reliable'],
    scoringAnchors: {
      5: 'Concrete example, no resentment, helped because the team or guest needed it.',
      3: 'Generic story; willingness implied but no clear example.',
      1: 'No example, complains about helping, or says they avoid doing other people\'s work.',
    },
  },
  {
    id: 'q8', order: 8,
    text: 'Tell us about a real mistake you made at work — something a guest or teammate noticed. What happened, and what did you do next?',
    primarySignal: 'Accountability and learning from real failure',
    scoringCategories: ['be_reliable', 'keep_moving_forward'],
    scoringAnchors: {
      5: 'Owns a specific mistake, names what they did to fix it in the moment, and what they changed afterward.',
      3: 'Mistake is named but the fix or learning is vague.',
      1: '"I never make mistakes" / blames others / dodges the question / no example.',
    },
    notes: '"Something a guest or teammate noticed" is the guardrail — answers that claim no mistakes ever should land at 1.',
  },
  {
    id: 'q9', order: 9,
    text: 'A manager gives you feedback you genuinely disagree with. What would you say in the moment, and what would you do afterward? Give us a real example if you have one.',
    primarySignal: 'Coachability, maturity, and direct communication',
    scoringCategories: ['speak_up', 'keep_moving_forward'],
    scoringAnchors: {
      5: 'Listens first, names that they\'d ask a clarifying question or follow up privately, applies feedback even when they disagree. Bonus for a real example.',
      3: '"Thank them and try to do it" with no follow-up or processing — polite but passive.',
      1: 'Argues in the moment, gets defensive, says managers are usually wrong, or ignores feedback.',
    },
    notes: 'The 5-anchor requires real engagement with the disagreement, not just nodding along. Score 3 if the answer is only "smile and nod."',
  },
  {
    id: 'q10', order: 10,
    text: 'You notice something is wrong during service, such as low stock, a messy area, a guest waiting too long, or a teammate struggling. What do you do?',
    primarySignal: 'Communication, ownership, and guest experience',
    scoringCategories: ['speak_up', 'support_each_other', 'own_guest_experience'],
    scoringAnchors: {
      5: 'Acts immediately; specifies what they fix vs. escalate; communicates clearly with the team.',
      3: 'Handles it if assigned; doesn\'t mention communication.',
      1: 'Assumes someone else will / says nothing / only handles if told.',
    },
  },
  {
    id: 'q11', order: 11,
    text: 'The bar is slammed, guests are waiting, and one person calls out. What matters most in that moment?',
    primarySignal: 'Pressure, judgment, and teamwork',
    scoringCategories: ['support_each_other', 'speak_up', 'own_guest_experience'],
    scoringAnchors: {
      5: 'Names prioritization, communication, staying composed, taking care of guests, supporting the team.',
      3: 'Mentions just one of: staying calm OR speed OR teamwork.',
      1: 'Panics, blames the absent person, focuses only on their own section, stops communicating.',
    },
  },
  {
    id: 'q12', order: 12,
    text: 'When a shift gets stressful, how do your teammates know what you need from them? What does your communication actually look like?',
    primarySignal: 'Self-awareness, emotional control, and team communication under pressure',
    scoringCategories: ['speak_up', 'be_reliable'],
    scoringAnchors: {
      5: 'Names specific communication behaviors (asks for a hand, flags what they need, calls out priorities); shows awareness that energy affects others.',
      3: '"I stay calm" with no signal of how they communicate; teammates would have to guess.',
      1: '"People can tell I\'m annoyed" / "I shut down" / "I snap" / no plan to manage stress.',
    },
    notes: 'Old version of this question rewarded suppression. New version forces a description of communication behaviors. Score 3 if the answer is just "I stay calm."',
  },
  {
    id: 'q13', order: 13,
    text: 'Dram cares about spirits, cocktails, beer, wine, specs, and consistency. How do you usually learn a new menu, product, or system?',
    primarySignal: 'Learning mindset and product curiosity',
    scoringCategories: ['keep_moving_forward'],
    scoringAnchors: {
      5: 'Specific learning process: notes, repetition, asking questions, practicing during slow hours. Mentions consistency.',
      3: '"I just pick it up" with effort implied but no method.',
      1: 'No plan; no curiosity; says they don\'t need product knowledge.',
    },
  },
  {
    id: 'q14', order: 14,
    text: 'Tell us about a specific work skill, menu, or system you had to learn from scratch. What was your process, and how did you know you were getting better?',
    primarySignal: 'Growth, coachability, and a real learning story',
    scoringCategories: ['keep_moving_forward'],
    scoringAnchors: {
      5: 'Concrete skill, clear process, names how they measured progress (fewer questions, faster service, positive feedback).',
      3: 'Names a skill but the process or progress check is generic.',
      1: 'Can\'t name anything; says they already knew everything; vague.',
    },
    notes: 'The "how did you know you were getting better" phrasing is the guardrail against vague non-answers like "I learned the alphabet."',
  },
  {
    id: 'q15', order: 15,
    text: 'What interests you about working in a cocktail/whiskey-forward bar?',
    primarySignal: 'Motivation, product curiosity, and role alignment',
    scoringCategories: ['keep_moving_forward', 'own_guest_experience'],
    scoringAnchors: {
      5: 'Genuine curiosity about spirits, service craft, or guest education. Connects to hospitality.',
      3: '"I like whiskey" without elaboration.',
      1: 'Wants status without learning; no connection to hospitality; only mentions money.',
    },
  },
  {
    id: 'q16', order: 16,
    text: 'A guest is rude to you but has not crossed a clear line. How do you handle it?',
    primarySignal: 'Guest maturity, emotional control, and judgment',
    scoringCategories: ['own_guest_experience', 'speak_up'],
    scoringAnchors: {
      5: 'Stays calm, doesn\'t match the guest\'s energy, keeps service professional, gets support if needed, protects the room.',
      3: 'Says they\'d "stay professional" with no detail.',
      1: 'Responds rudely, escalates, takes it personally, lets it affect other guests.',
    },
  },
  {
    id: 'q17', order: 17,
    text: 'A regular asks for special treatment that would put the team in a bad spot or hurt the guest experience for others. What do you do?',
    primarySignal: 'Judgment, consistency, and standards',
    scoringCategories: ['own_guest_experience', 'speak_up', 'be_reliable'],
    scoringAnchors: {
      5: 'Stays warm but holds the standard; explains briefly; gets manager support if needed; protects the whole room.',
      3: 'Says no to the regular but doesn\'t mention how (tone, escalation).',
      1: 'Gives in because they\'re a regular; is rude or dismissive.',
    },
  },
  {
    id: 'q18', order: 18,
    text: 'You notice a teammate cutting a corner that affects cleanliness, consistency, or guest experience. How would you handle it?',
    primarySignal: 'Communication, standards, and team maturity',
    scoringCategories: ['speak_up', 'support_each_other', 'own_guest_experience'],
    scoringAnchors: {
      5: 'Addresses respectfully and directly; helps fix it; escalates only if needed; focuses on standards not blame.',
      3: 'Says they\'d "talk to them" with no detail on how.',
      1: 'Ignores it / talks behind their back / publicly embarrasses them / says it\'s not their problem.',
    },
  },
  {
    id: 'q19', order: 19,
    text: 'What does good side work mean to you in a bar?',
    primarySignal: 'Reliability, atmosphere, team support, and small details',
    scoringCategories: ['be_reliable', 'support_each_other', 'own_guest_experience'],
    scoringAnchors: {
      5: 'Names specific tasks (restocking, glassware, bathrooms, station reset) and ties them to the next shift / guest experience.',
      3: 'Acknowledges side work matters but doesn\'t connect it to service.',
      1: 'Treats it as busywork; says it\'s closing tasks; beneath them.',
    },
  },
  {
    id: 'q20', order: 20,
    text: 'What availability can you consistently commit to, including nights, weekends, holidays, and late shifts?',
    primarySignal: 'Practical fit and scheduling reliability',
    scoringCategories: ['be_reliable'],
    scoringAnchors: {
      5: 'Clear, realistic availability; honest about limits; matches role requirements.',
      3: 'Mostly available but vague on weekends or late shifts.',
      1: '"Depends" / "flexible" with no specifics / can\'t work Friday or Saturday / overpromises.',
    },
    notes: 'If the answer is ambiguous ("depends", "flexible without specifics") flag the application for human review. Cannot-work-Friday-or-Saturday is a deal-breaker — set recommendation to don\'t_recommend.',
  },
];

const APPLICANT_NOTICE = `As part of our hiring process, Dram & Draught asks applicants to complete a short questionnaire about hospitality, teamwork, communication, learning, availability, and job-related situations.

A note on availability: we ask that the availability you provide here stays consistent through your first 90 days of employment. Availability is a key part of how we make hiring decisions. If it changes before, during, or even after that period, we will review whether the updated availability still meets the needs of the business.

Please keep answers focused on job-related experience and behavior. Do not include medical information, age, religious or family details, childcare situation, disability status, national origin, or other protected personal information — it will not be used in scoring and we may have to redact it.

If you need an accommodation or an alternative way to complete this questionnaire, please contact us at hiring@dramanddraught.com. Asking for an accommodation will not be used against you in scoring.`;

// Knowledge base text passed to the screener. Keep stable bytes for prompt
// caching — render order matters; everything dynamic goes in the user prompt.
const KNOWLEDGE_BASE = `# Dram & Draught Hiring Knowledge Base (v2)

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
1. Speak Up — clear, honest, direct communication. Asks early. Speaks up when something is wrong. Treats feedback as information.
2. Be Reliable — shows up on time, honest about availability, takes ownership, follows through.
3. Support Each Other — jumps in and helps. Watches the whole room. Respects every role.
4. Keep Moving Forward — coachable, curious, learns spirits/cocktails/beer/wine/service.
5. Own the Guest Experience — greets warmly, reads the room, notices details, handles issues with maturity.

## Five pillars of hospitality
- Smile / body language
- Warm greeting
- Great service
- Knowledge of products
- Setting the ideal atmosphere

## Role expectations (summary)
- Bartender: hospitality first, build consistent cocktails, learn specs, respect support roles.
- Barback: protect flow of service, urgency, anticipation, cleanliness, restocking, communication.
- Server: warm greeting, paces service, learns menu and products, communicates clearly.
- Door: first impressions, safety, pacing, calm under pressure, never power trips.
- Lead / Shift Lead: models values, communicates early, coaches without embarrassing people.

## Non-negotiables (hard deal-breakers)
The following force a "don't_recommend" recommendation regardless of category scores:
1. Cannot work any Friday or Saturday night.
2. Applying for Bartender while under 21 (legal eligibility).
3. Stated availability does not cover the role's required shifts (nights, weekends, late shifts).

The following flag the application for human review (do not auto-decide):
1. Earliest start date more than 60 days out. **Use the precomputed "days from today" value injected into the user prompt — do not compute calendar math yourself. If the user prompt explicitly says the start date is within the 60-day window, do not flag.**
2. Q20 answer is ambiguous ("depends", "flexible" with no specifics).
3. Two or more answers contradict each other (especially around availability, role interest, willingness to follow standards, or escalation judgement).
4. Applicant mentions a current or former employee by name.
5. Applicant discloses protected or sensitive information (race, religion, medical, family, accommodation needs, etc.). Ignore that information for scoring; flag for review.
6. Any single category scores below 2.0.
7. Final weighted score lands within ±0.15 of the recommend threshold (borderline).
8. Most of the answers mapped to a category read as polished but generic / template-like (see "Generic answer cap" below). This is a follow-up trigger, not a penalty.

## Scoring rubric (1–5 per category)
- 5: Strong, specific, job-related evidence. Names a real example or behavior; concrete; would notice details on shift.
- 4: Good evidence and clear alignment; slightly less specific than a 5.
- 3: Answer addresses the question with at least one concrete detail, but lacks a specific example OR shows mixed signals. Most candidates should NOT land here — push to 2 or 4 if evidence allows.
- 2: Vague, generic, defensive, low ownership, or possible concern. Needs serious follow-up.
- 1: Clear job-related concern — dismissive guest attitude, "that's not my job," defensive to feedback, cannot meet required shifts, escalates conflict.

5s should be achievable for strong candidates. If no answer in a category would warrant a 5, you are likely being too conservative — re-read for specific evidence.

## Short-answer floor
Any answer under 15 characters (excluding Q20) cannot serve as positive evidence for a category score above 2. If a category's evidence is composed primarily of such short answers, score that category at 2 or below.

## Generic answer cap
If an answer uses only generic intent language without a specific action, tradeoff, example, or observable behavior, it cannot support a category score above 3. Length alone is not specificity — a long polished answer with no concrete behavior is still capped at 3.

Examples of generic-only answers (cap at 3 for the supporting category):
- "I would treat the guest with respect and professionalism."
- "I am a team player."
- "I would help however I can."
- "I stay positive under pressure."
- "I make sure everyone has a great time."

A concise answer can still support a higher score if it contains concrete, job-relevant behavior (e.g. "I would offer a non-alcoholic alternative and quietly tell the floor lead").

## Evidence caps
- **No specific past example anywhere in the category**: if every mapped answer for a category is purely hypothetical ("I would…", "I always…", "I try to…") with no real past situation cited, cap that category at 3.5.
- **Mostly generic**: if a majority of the mapped answers for a category land in the generic-cap pattern above, cap that category at 3.0.
- **Contradiction**: if answers conflict with each other on availability, role interest, willingness to follow standards, or escalation judgment, do not pick a side — flag for human review and cap the affected categories at 3.0 until reviewed.

## AI-likeness / template feel
If an application reads as templated, polished-but-vague, or AI-assisted across multiple answers, **do NOT score it down for that reason on its own**. Some strong candidates use writing help; some non-native English speakers, anxious applicants, or younger applicants write in a stiff register. Score on the evidence (or lack of it), not on vibe.

When you notice a templated / low-specificity pattern across most of a category's answers:
1. Apply the Generic answer cap and Evidence caps above based on actual evidence, not on tone.
2. Add a human-review reason "highly generic or template-like" with the suggested action "ask behavioral follow-up in interview, do not penalize directly".
3. Include at least one suggested interview question that pushes the candidate to describe a specific past situation in detail.

## Strong vs weak evidence
Strong answers usually include: a specific example, ownership language, calm under pressure, guest empathy, team support, clear communication, willingness to learn, respect for standards, awareness of details.

Weak answers include: vague self-praise ("I'm a team player", "I work hard"), "that's not my job", defensive about feedback, dismissive about guests, unclear or unrealistic availability, wants title without learning, blames others.

A weak answer is not a poorly-written answer. Never penalize grammar, spelling, accent, or writing style unless the answer is impossible to understand.

## Callback thresholds (code-enforced)
These are computed on the recomputed weighted score using authoritative role weights. The screener's claimed recommendation is advisory; code re-derives.
- Recommend: weighted ≥ 3.7 AND every category ≥ 3.0 AND no hard deal-breaker.
- Don't recommend: anything else, including any category < 2.5.

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
5. If an applicant mentions needing an accommodation, flag the application for human review and do not score that fact negatively.
6. Do not invent facts. If evidence is missing, say "insufficient evidence."
7. Use the applicant's own answers as evidence — quote them when listing evidence.
8. Score each of the five categories from 1 to 5 using the per-question anchors provided in the user prompt.
9. Apply the role-specific category weights provided.
10. Honor the short-answer floor: any answer under 15 characters (excluding Q20 availability) cannot serve as evidence for a category score above 2. If a category's evidence is dominated by such answers, score it at 2 or below.
11. Honor the hard deal-breakers — when present, set recommendation to "hold" (the code will surface this as "don't_recommend"). Deal-breakers: cannot work Friday or Saturday; bartender applicant under 21; stated availability does not cover required shifts.
12. Flag for human review when: any category < 2.0; weighted score within ±0.15 of the recommend threshold; applicant mentions a current/former employee by name; availability is ambiguous; two or more answers contradict each other.
13. Score distribution: 5s should be achievable for strong, specific answers. If no category warrants a 5, re-read for evidence before defaulting to 3s — most candidates should not cluster at 3.
14. Return only valid JSON matching the response schema.

Remember: the manager makes the final decision. Your output is advisory.

${KNOWLEDGE_BASE}`;
}

// JSON schema the screener must populate.
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
  THRESHOLDS,
  MIN_ANSWER_LENGTH,
  buildSystemPrompt,
  buildResponseSchema,
};
