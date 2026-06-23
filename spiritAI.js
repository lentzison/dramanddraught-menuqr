// AI assist for the printable spirit list. For a single spirit it returns a
// concise tasting description (for the printed menu) plus advisory "flags" on
// any provided facts (region / distillery / age / ABV) that look inaccurate or
// uncertain. The model is assistive, not authoritative — the admin reviews and
// approves every result before it's saved or printed; nothing here writes to
// the Bartender catalog.
//
// Mirrors the provider plumbing in eventDesignAI.js: OpenAI by default,
// Anthropic when AI_REVIEW_PROVIDER=anthropic. Never throws.

const PROVIDER = (process.env.AI_REVIEW_PROVIDER || 'openai').toLowerCase();
const OPENAI_MODEL = process.env.OPENAI_SPIRIT_MODEL || process.env.OPENAI_REVIEW_MODEL || 'gpt-5.5';
const ANTHROPIC_MODEL = 'claude-opus-4-8';
const TIMEOUT_MS = parseInt(process.env.SPIRIT_AI_TIMEOUT_MS || '30000', 10);

function factLine(spirit) {
  const parts = [];
  if (spirit.primaryCategory) parts.push(`Category: ${spirit.primaryCategory}`);
  if (spirit.style) parts.push(`Style: ${spirit.style}`);
  if (spirit.region) parts.push(`Region: ${spirit.region}`);
  if (spirit.distillery) parts.push(`Distillery: ${spirit.distillery}`);
  if (spirit.abv != null && spirit.abv !== '') parts.push(`ABV: ${spirit.abv}%`);
  return parts.length ? parts.join(' · ') : '(no extra facts on file)';
}

function buildPrompt(spirit) {
  return [
    'You are a spirits expert helping a craft whiskey bar (Dram & Draught) write its printed spirit list.',
    '',
    `Spirit: ${spirit.name || 'Unknown'}`,
    `Known facts on file — ${factLine(spirit)}`,
    '',
    'Do two things:',
    '1. Write ONE concise tasting description for the printed menu: about 10–18 words, evocative and sensory (aroma/palate/finish), no marketing fluff, no price, no the spirit name repeated at the start. If you are not reasonably sure what this specific bottling tastes like, write a careful, general-but-accurate note for its category/style rather than inventing specifics.',
    '2. Review the known facts above. List any that appear inaccurate, internally inconsistent, or that you are NOT confident about (e.g. wrong region for that distillery, implausible ABV). Be conservative — only flag genuine concerns. If everything looks fine, return an empty list.',
    '',
    'Return ONLY a JSON object: {"description": "<one sentence>", "flags": ["<short concern>", ...]}',
  ].join('\n');
}

async function callOpenAI(prompt, apiKey) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: OPENAI_MODEL,
        max_completion_tokens: parseInt(process.env.SPIRIT_AI_MAX_TOKENS || '600', 10),
        reasoning_effort: process.env.SPIRIT_AI_EFFORT || 'low',
        messages: [
          { role: 'system', content: 'You are a precise spirits expert. Return only valid JSON.' },
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
    max_tokens: 700,
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

// Returns { description, flags } for one spirit. Never throws; on any failure
// returns empty values + an error flag so the caller/UI can surface it.
async function draftSpirit(spirit) {
  const apiKey = PROVIDER === 'anthropic' ? process.env.ANTHROPIC_API_KEY : process.env.OPENAI_API_KEY;
  if (!apiKey || typeof fetch !== 'function') {
    return { description: '', flags: [], error: 'AI is not configured (no API key).' };
  }
  if (!spirit || !spirit.name) return { description: '', flags: [], error: 'Missing spirit.' };
  try {
    const prompt = buildPrompt(spirit);
    const parsed = PROVIDER === 'anthropic' ? await callAnthropic(prompt, apiKey) : await callOpenAI(prompt, apiKey);
    const description = (parsed && typeof parsed.description === 'string') ? parsed.description.trim().slice(0, 400) : '';
    let flags = [];
    if (parsed && Array.isArray(parsed.flags)) {
      flags = parsed.flags.filter((f) => typeof f === 'string' && f.trim()).map((f) => f.trim().slice(0, 200)).slice(0, 6);
    }
    return { description, flags };
  } catch (err) {
    return { description: '', flags: [], error: err.message || 'AI request failed.' };
  }
}

module.exports = { draftSpirit };
