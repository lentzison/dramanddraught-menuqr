// AI assist for the printable spirit list: shorten a spirit's (often long)
// Bartender catalog name into a short, still-recognizable menu name. The admin
// reviews/edits every suggestion before saving; nothing here writes to the
// Bartender catalog.
//
// Mirrors the provider plumbing in eventDesignAI.js: OpenAI by default,
// Anthropic when AI_REVIEW_PROVIDER=anthropic. Never throws.

const PROVIDER = (process.env.AI_REVIEW_PROVIDER || 'openai').toLowerCase();
const OPENAI_MODEL = process.env.OPENAI_SPIRIT_MODEL || process.env.OPENAI_REVIEW_MODEL || 'gpt-5.5';
const ANTHROPIC_MODEL = 'claude-opus-4-8';
const TIMEOUT_MS = parseInt(process.env.SPIRIT_AI_TIMEOUT_MS || '30000', 10);

function buildPrompt(spirit) {
  const facts = [];
  if (spirit.primaryCategory) facts.push(`Category: ${spirit.primaryCategory}`);
  if (spirit.style) facts.push(`Style: ${spirit.style}`);
  if (spirit.region) facts.push(`Region: ${spirit.region}`);
  if (spirit.distillery) facts.push(`Distillery: ${spirit.distillery}`);
  return [
    'You shorten spirit names for a craft whiskey bar\'s printed list.',
    '',
    `Full catalog name: ${spirit.name || ''}`,
    facts.length ? `Facts: ${facts.join(' · ')}` : '',
    '',
    'Return a SHORT, clearly recognizable menu name. Keep the brand and the specific expression or age statement. Drop bottle size (e.g. 750ml), proof/ABV, and generic category words (e.g. "Kentucky Straight Bourbon Whiskey", "Islay Single Malt Scotch") UNLESS they are needed to tell two bottlings apart. Keep it accurate — never invent an expression that isn\'t in the full name.',
    'Examples:',
    '  "Buffalo Trace Kentucky Straight Bourbon Whiskey 750ml" -> "Buffalo Trace"',
    '  "Lagavulin 16 Year Old Islay Single Malt Scotch Whisky" -> "Lagavulin 16"',
    '  "Angel\'s Envy Port Finished Bourbon" -> "Angel\'s Envy Port Finish"',
    '',
    'Return ONLY JSON: {"name": "<short name>"}',
  ].filter(Boolean).join('\n');
}

async function callOpenAI(prompt, apiKey, system) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: OPENAI_MODEL,
        max_completion_tokens: parseInt(process.env.SPIRIT_AI_MAX_TOKENS || '200', 10),
        reasoning_effort: process.env.SPIRIT_AI_EFFORT || 'low',
        messages: [
          { role: 'system', content: system || 'You return precise answers as valid JSON only.' },
          { role: 'user', content: prompt },
        ],
        response_format: { type: 'json_object' },
      }),
    });
    if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}`);
    const data = await res.json();
    const text = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    return JSON.parse(text || '{}');
  } finally {
    clearTimeout(timer);
  }
}

async function callAnthropic(prompt, apiKey) {
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey });
  const message = await client.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: 200,
    messages: [{ role: 'user', content: prompt + '\n\nReturn ONLY the JSON object, no prose.' }],
  });
  for (const block of message.content || []) {
    if (block.type === 'text') {
      const m = block.text.match(/\{[\s\S]*\}/);
      if (m) return JSON.parse(m[0]);
    }
  }
  return {};
}

// Returns { name } — a short recognizable name — or { name:'', error }.
async function shortenName(spirit) {
  const apiKey = PROVIDER === 'anthropic' ? process.env.ANTHROPIC_API_KEY : process.env.OPENAI_API_KEY;
  if (!apiKey || typeof fetch !== 'function') return { name: '', error: 'AI is not configured (no API key).' };
  if (!spirit || !spirit.name) return { name: '', error: 'Missing spirit.' };
  try {
    const prompt = buildPrompt(spirit);
    const parsed = PROVIDER === 'anthropic'
      ? await callAnthropic(prompt, apiKey)
      : await callOpenAI(prompt, apiKey, 'You shorten product names precisely. Return only valid JSON.');
    const name = (parsed && typeof parsed.name === 'string') ? parsed.name.trim().slice(0, 120) : '';
    return { name };
  } catch (err) {
    return { name: '', error: err.message || 'AI request failed.' };
  }
}

function buildAbvPrompt(spirit) {
  const facts = [];
  if (spirit.primaryCategory) facts.push(`Category: ${spirit.primaryCategory}`);
  if (spirit.style) facts.push(`Style: ${spirit.style}`);
  if (spirit.region) facts.push(`Region: ${spirit.region}`);
  if (spirit.distillery) facts.push(`Distillery: ${spirit.distillery}`);
  return [
    'You provide the alcohol-by-volume (ABV) for a specific spirit bottling on a craft whiskey bar\'s list.',
    '',
    `Bottle: ${spirit.name || ''}`,
    facts.length ? `Facts: ${facts.join(' · ')}` : '',
    '',
    'Give the ABV of THIS exact bottling as a percentage number (e.g. 40, 43, 46.5). Most whiskeys are 40–65%. Use the standard/most-common ABV for this specific expression. If you are not confident of the ABV for this exact bottling, return null instead of guessing — a wrong ABV is worse than a blank one.',
    'Return ONLY JSON: {"abv": <number or null>}',
  ].filter(Boolean).join('\n');
}

// Returns { abv } — a percentage number (or null if unknown) — or { abv:null, error }.
async function lookupAbv(spirit) {
  const apiKey = PROVIDER === 'anthropic' ? process.env.ANTHROPIC_API_KEY : process.env.OPENAI_API_KEY;
  if (!apiKey || typeof fetch !== 'function') return { abv: null, error: 'AI is not configured (no API key).' };
  if (!spirit || !spirit.name) return { abv: null, error: 'Missing spirit.' };
  try {
    const prompt = buildAbvPrompt(spirit);
    const parsed = PROVIDER === 'anthropic'
      ? await callAnthropic(prompt, apiKey)
      : await callOpenAI(prompt, apiKey, 'You report spirit ABV percentages accurately. Return null rather than guess. Return only valid JSON.');
    let abv = null;
    if (parsed && parsed.abv != null) {
      const n = Number.parseFloat(parsed.abv);
      if (Number.isFinite(n) && n > 0 && n <= 100) abv = Math.round(n * 10) / 10;
    }
    return { abv };
  } catch (err) {
    return { abv: null, error: err.message || 'AI request failed.' };
  }
}

module.exports = { shortenName, lookupAbv };
