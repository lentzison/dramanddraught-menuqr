// AI event-page designer. Turns an imported event's title + description into
// page-builder "sections" (the same JSON the manual Page Builder produces) so
// imported events arrive with a real designed page instead of a bare blurb.
//
// Env-gated and best-effort: with no API key (or on any error/timeout) it
// returns [] and the import proceeds with just the description. Output is
// strictly validated against the section schema in code — we never trust the
// model's shapes — and only the NON-IMAGE section types are produced (the model
// has no images to supply; image/hero/twocol require a real src and would be
// dropped anyway).
//
// Provider mirrors the hiring screener: OpenAI by default (structured outputs),
// Anthropic when AI_REVIEW_PROVIDER=anthropic. Reuses the same API-key envs.

const crypto = require('crypto');

const PROVIDER = (process.env.AI_REVIEW_PROVIDER || 'openai').toLowerCase();
const OPENAI_MODEL = process.env.OPENAI_EVENT_MODEL || process.env.OPENAI_REVIEW_MODEL || 'gpt-5.5';
const ANTHROPIC_MODEL = 'claude-opus-4-8';
const TIMEOUT_MS = parseInt(process.env.EVENT_DESIGN_TIMEOUT_MS || '45000', 10);

const ALLOWED_TYPES = ['text', 'details', 'schedule', 'faq', 'cocktailmenu', 'button', 'divider'];
const MAX_SECTIONS = 8;

function sectionId() {
  return `s_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`;
}

const str = (v, max) => (v == null ? '' : String(v)).trim().slice(0, max);

// Coerce one model-proposed section into our exact stored shape, or null.
function validateSection(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const type = String(raw.type || '').toLowerCase();
  if (!ALLOWED_TYPES.includes(type)) return null;
  const id = sectionId();
  const bgStyle = ['default', 'gold', 'dark', 'transparent'].includes(String(raw.bgStyle)) ? raw.bgStyle : 'default';

  if (type === 'text') {
    const body = str(raw.body, 4000);
    if (!body) return null;
    return { id, type, bgStyle, heading: str(raw.heading, 120) || null, body, align: 'left' };
  }
  if (type === 'divider') return { id, type };
  if (type === 'button') {
    const url = str(raw.url, 2000);
    if (!/^https?:\/\//i.test(url)) return null;
    return { id, type, bgStyle, label: str(raw.label, 80) || 'Learn More', url, style: raw.style === 'secondary' ? 'secondary' : 'primary' };
  }
  if (type === 'details') {
    const items = (Array.isArray(raw.items) ? raw.items : [])
      .map((it) => ({ label: str(it && it.label, 80), value: str(it && it.value, 200) }))
      .filter((it) => it.label || it.value).slice(0, 10);
    if (!items.length) return null;
    return { id, type, bgStyle, title: str(raw.title, 120) || null, items };
  }
  if (type === 'schedule') {
    const items = (Array.isArray(raw.items) ? raw.items : [])
      .map((it) => ({ time: str(it && it.time, 40), title: str(it && it.title, 120), description: str(it && it.description, 300) }))
      .filter((it) => it.time || it.title).slice(0, 20);
    if (!items.length) return null;
    return { id, type, bgStyle, title: str(raw.title, 120) || null, items };
  }
  if (type === 'faq') {
    const items = (Array.isArray(raw.items) ? raw.items : [])
      .map((it) => ({ question: str(it && it.question, 200), answer: str(it && it.answer, 1000) }))
      .filter((it) => it.question && it.answer).slice(0, 12);
    if (!items.length) return null;
    return { id, type, bgStyle, title: str(raw.title, 120) || null, items };
  }
  if (type === 'cocktailmenu') {
    const items = (Array.isArray(raw.items) ? raw.items : [])
      .map((it) => ({
        name: str(it && it.name, 120), ingredients: str(it && it.ingredients, 300),
        abv: str(it && it.abv, 40), creator: str(it && it.creator, 120), vibe: str(it && it.vibe, 200),
      }))
      .filter((it) => it.name).slice(0, 24);
    if (!items.length) return null;
    return { id, type, bgStyle, title: str(raw.title, 120) || null, subtitle: str(raw.subtitle, 200) || null, items };
  }
  return null;
}

function validateSections(arr) {
  if (!Array.isArray(arr)) return [];
  const out = [];
  for (const s of arr) {
    const v = validateSection(s);
    if (v) out.push(v);
    if (out.length >= MAX_SECTIONS) break;
  }
  return out;
}

function buildPrompt({ title, description, dateText, locationName, ticketUrl }) {
  return `You design a public event page for Dram & Draught (an elevated neighborhood bar). Turn the event below into an ordered list of page "sections".

Event title: ${title || '(untitled)'}
Location: ${locationName || '(unspecified)'}
When: ${dateText || '(see description)'}
${ticketUrl ? `Ticket/registration URL: ${ticketUrl}` : ''}

Source description (may contain marketing copy):
"""
${(description || '').slice(0, 6000)}
"""

Rules:
- Use ONLY these section types: text, details, schedule, faq, cocktailmenu, button, divider.
- Ground everything in the description. Do NOT invent facts (prices, times, drink names, rules) that aren't stated or strongly implied. If you don't know, leave it out.
- A good default order: a short "text" intro (1-2 short paragraphs, warm but not hypey), then a "details" block (date/time, location, cost/entry, age policy — only fields actually known), then "schedule" if the description implies a timeline, then "faq" for anything a guest would ask, then a "button" only if a ticket/registration URL was provided.
- Include a "cocktailmenu" section ONLY if the description actually lists specific cocktails; otherwise omit it (a human will add it).
- Keep copy concise. Plain text only (no HTML, no markdown headers). For bold use **double asterisks** sparingly.
- 2 to 6 sections total. Omit anything you can't fill from the description.

Return JSON: { "sections": [ ... ] } where each section matches its type's fields:
- text: { type, heading?, body }
- details: { type, title?, items: [{ label, value }] }
- schedule: { type, title?, items: [{ time, title, description? }] }
- faq: { type, title?, items: [{ question, answer }] }
- cocktailmenu: { type, title?, subtitle?, items: [{ name, ingredients?, abv?, creator?, vibe? }] }
- button: { type, label, url }
- divider: { type }`;
}

const RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    sections: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: true,
        properties: {
          type: { type: 'string', enum: ALLOWED_TYPES },
          heading: { type: ['string', 'null'] },
          title: { type: ['string', 'null'] },
          subtitle: { type: ['string', 'null'] },
          body: { type: ['string', 'null'] },
          label: { type: ['string', 'null'] },
          url: { type: ['string', 'null'] },
          items: { type: ['array', 'null'], items: { type: 'object', additionalProperties: true } },
        },
        required: ['type'],
      },
    },
  },
  required: ['sections'],
};

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
        max_completion_tokens: parseInt(process.env.EVENT_DESIGN_MAX_TOKENS || '6000', 10),
        reasoning_effort: process.env.EVENT_DESIGN_EFFORT || 'low',
        messages: [
          { role: 'system', content: 'You are a precise event-page designer. Return only valid JSON matching the schema.' },
          { role: 'user', content: prompt },
        ],
        response_format: { type: 'json_schema', json_schema: { name: 'event_sections', strict: false, schema: RESPONSE_SCHEMA } },
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
    max_tokens: 6000,
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

// Public entry. Returns a validated sections array (possibly empty). Never throws.
async function generateEventSections({ title, description, dateText, locationName, ticketUrl }) {
  const desc = String(description || '').trim();
  if (desc.length < 40) return []; // too thin to design from
  const apiKey = PROVIDER === 'anthropic' ? process.env.ANTHROPIC_API_KEY : process.env.OPENAI_API_KEY;
  if (!apiKey || typeof fetch !== 'function') return [];
  const prompt = buildPrompt({ title, description: desc, dateText, locationName, ticketUrl });
  try {
    const parsed = PROVIDER === 'anthropic' ? await callAnthropic(prompt, apiKey) : await callOpenAI(prompt, apiKey);
    return validateSections(parsed && parsed.sections);
  } catch (err) {
    console.warn('[event-design] generation failed:', err.message);
    return [];
  }
}

module.exports = { generateEventSections, validateSections, validateSection, ALLOWED_TYPES };
