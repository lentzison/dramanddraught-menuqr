// Tests for the AI event-design section validator (the part that runs in code,
// independent of the model).
const test = require('node:test');
const assert = require('node:assert/strict');
const { validateSections, validateSection, ALLOWED_TYPES, generateEventSections } = require('../eventDesignAI');

test('drops image-bearing and unknown section types', () => {
  const out = validateSections([
    { type: 'hero', title: 'x' },     // needs image -> not allowed for AI
    { type: 'twocol', body: 'x' },    // needs image -> not allowed
    { type: 'image', src: 'x' },      // not allowed
    { type: 'bogus' },                // unknown
    { type: 'text', body: 'A real intro paragraph.' },
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].type, 'text');
});

test('text requires a body; assigns id, align, bgStyle', () => {
  assert.equal(validateSection({ type: 'text', heading: 'Hi' }), null); // no body
  const t = validateSection({ type: 'text', heading: 'Hi', body: 'Welcome to the party.' });
  assert.equal(t.type, 'text');
  assert.equal(t.align, 'left');
  assert.equal(t.bgStyle, 'default');
  assert.ok(t.id);
});

test('button requires an http(s) url', () => {
  assert.equal(validateSection({ type: 'button', label: 'Go', url: 'javascript:alert(1)' }), null);
  assert.equal(validateSection({ type: 'button', label: 'Go', url: 'mailto:x@y.com' }), null);
  const b = validateSection({ type: 'button', label: 'Tickets', url: 'https://eventbrite.com/e/1' });
  assert.equal(b.url, 'https://eventbrite.com/e/1');
  assert.equal(b.style, 'primary');
});

test('list sections filter empty rows and drop when all empty', () => {
  const d = validateSection({ type: 'details', items: [{ label: 'When', value: 'Sat' }, { label: '', value: '' }] });
  assert.equal(d.items.length, 1);
  assert.equal(validateSection({ type: 'details', items: [{ label: '', value: '' }] }), null);
  assert.equal(validateSection({ type: 'faq', items: [{ question: 'Q', answer: '' }] }), null); // answer required
  const f = validateSection({ type: 'faq', items: [{ question: 'Cost?', answer: 'Free' }] });
  assert.equal(f.items[0].question, 'Cost?');
});

test('cocktailmenu keeps only named drinks', () => {
  const c = validateSection({ type: 'cocktailmenu', title: 'Menu', items: [
    { name: 'Old Fashioned', ingredients: 'bourbon, bitters' },
    { name: '', ingredients: 'nothing' },
  ] });
  assert.equal(c.items.length, 1);
  assert.equal(c.items[0].name, 'Old Fashioned');
});

test('divider needs no fields; MAX_SECTIONS cap enforced', () => {
  assert.equal(validateSection({ type: 'divider' }).type, 'divider');
  const many = Array.from({ length: 20 }, () => ({ type: 'text', body: 'para' }));
  assert.ok(validateSections(many).length <= 8);
});

test('ALLOWED_TYPES excludes image/hero/twocol', () => {
  for (const t of ['image', 'hero', 'twocol']) assert.ok(!ALLOWED_TYPES.includes(t));
  for (const t of ['text', 'details', 'schedule', 'faq', 'cocktailmenu', 'button', 'divider']) assert.ok(ALLOWED_TYPES.includes(t));
});

test('generateEventSections returns {sections,summary} and no-ops without a key', async () => {
  // No API key in test env → graceful empty shape, never throws.
  const savedOpenAI = process.env.OPENAI_API_KEY;
  const savedAnthropic = process.env.ANTHROPIC_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  try {
    const out = await generateEventSections({ title: 'X', description: 'A reasonably long description of the event so it passes the length gate.' });
    assert.deepEqual(out, { sections: [], summary: '' });
    const thin = await generateEventSections({ title: 'X', description: 'too short' });
    assert.deepEqual(thin, { sections: [], summary: '' });
  } finally {
    if (savedOpenAI !== undefined) process.env.OPENAI_API_KEY = savedOpenAI;
    if (savedAnthropic !== undefined) process.env.ANTHROPIC_API_KEY = savedAnthropic;
  }
});
