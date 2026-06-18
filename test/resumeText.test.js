'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { scrapePdfOperators, extractPdfText, extractResumeText } = require('../hiring/resumeText');

// Regression guard for the outage: a malformed PDF content stream — a "[" with a
// long run of "(" and no closing "]TJ" — used to cause catastrophic regex
// backtracking (ReDoS) that pinned a CPU core and froze the whole server.
// The hardened regex must handle it in a few milliseconds.
test('scrapePdfOperators does not hang on a pathological "[((((..." stream', () => {
  const evil = '[' + '('.repeat(60) + ' no closing bracket so the array never matches';
  const started = process.hrtime.bigint();
  const parts = scrapePdfOperators(evil);
  const ms = Number(process.hrtime.bigint() - started) / 1e6;
  assert.ok(Array.isArray(parts), 'returns an array');
  assert.ok(ms < 1000, `should finish fast, took ${ms.toFixed(1)}ms`);
});

test('scrapePdfOperators survives mixed unbalanced parens + brackets quickly', () => {
  const evil = ('[(' + 'a'.repeat(200) + '(((' + ')'.repeat(50)).repeat(20) + ' TJ';
  const started = process.hrtime.bigint();
  scrapePdfOperators(evil);
  const ms = Number(process.hrtime.bigint() - started) / 1e6;
  assert.ok(ms < 1000, `should finish fast, took ${ms.toFixed(1)}ms`);
});

test('scrapePdfOperators still extracts normal Tj and TJ text', () => {
  assert.deepStrictEqual(scrapePdfOperators('(Hello World) Tj'), ['Hello World']);
  // TJ array: parenthesized strings interleaved with kerning numbers → joined.
  assert.deepStrictEqual(scrapePdfOperators('[(Hel) -20 (lo World)] TJ'), ['Hello World']);
});

test('extractPdfText pulls text from an uncompressed (raw) content stream', () => {
  const longLine = '(The quick brown fox jumps over the lazy dog repeatedly) Tj';
  const pdf = Buffer.from('%PDF-1.4\nstream\n' + longLine + '\nendstream\n', 'latin1');
  const text = extractPdfText(pdf);
  assert.ok(text && text.includes('quick brown fox'), 'extracts the visible text');
});

test('extractResumeText returns null for non-resume / empty input (never throws)', () => {
  assert.strictEqual(extractResumeText(null), null);
  assert.strictEqual(extractResumeText({}), null);
  assert.strictEqual(extractResumeText({ resumeData: 'not-a-data-url' }), null);
});

test('extractResumeText handles a plain-text resume data URL', () => {
  const body = 'Jane Doe — 8 years bartending, craft cocktail program lead, opener experience.';
  const dataUrl = 'data:text/plain;base64,' + Buffer.from(body, 'utf8').toString('base64');
  const out = extractResumeText({ resumeData: dataUrl, resumeFileName: 'resume.txt' });
  assert.ok(out && out.includes('bartending'));
});
