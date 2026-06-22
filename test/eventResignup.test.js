'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { generateEventPage } = require('../views/eventPage');

const location = { slug: 'raleigh', name: 'Raleigh' };
const baseEvent = {
  id: 'e1', slug: 'art-market', title: 'Neighborhood Art Market',
  startDate: new Date('2026-07-25T18:00:00Z'), endDate: new Date('2026-07-25T22:00:00Z'),
  description: 'Art market', signupType: 'vendor', signupsEnabled: true, capacity: null,
  collectEmail: true, collectPhone: true, collectPartySize: false, collectNotes: true,
  customQuestions: [{ id: 'q_imgs', label: 'Work samples', type: 'images-multi', max: 5 }],
  sections: [], bannerStyle: 'featured', themeKey: null, ticketUrl: null, isCancelled: false,
};

test('resignup mode renders a prefilled update form with the hidden token', () => {
  const html = generateEventPage(location, baseEvent, 3, {
    prevValues: {
      name: 'Jane Maker', email: 'jane@example.com', phone: '', notes: 'Ceramics & prints',
      q_imgs: ['data:image/png;base64,AAAA', 'data:image/png;base64,BBBB'],
    },
    resignup: { token: 'tok_abc123' },
  });
  assert.ok(html.includes('name="resignupToken"'), 'has the resignupToken hidden field');
  assert.ok(html.includes('tok_abc123'), 'carries the token value');
  assert.ok(/You're on the list/.test(html), 'shows the confirmation banner');
  assert.ok(html.includes('Update my submission'), 'update button label');
  assert.ok(html.includes('Jane Maker'), 'name is prefilled');
  assert.ok(html.includes('Ceramics &amp; prints'), 'notes are prefilled (escaped)');
  // images-multi prefill: the hidden field carries the stored array as JSON.
  assert.ok(html.includes('data:image/png;base64,AAAA'), 'prior images are prefilled');
  assert.ok(!html.includes('${'), 'no unresolved template expressions');
});

test('normal mode (no resignup) does not include the resignup form', () => {
  const html = generateEventPage(location, baseEvent, 3, {});
  assert.ok(!html.includes('name="resignupToken"'), 'no resignupToken in a normal render');
  assert.ok(!/You're on the list/.test(html), 'no resignup banner in a normal render');
});
