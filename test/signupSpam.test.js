const test = require('node:test');
const assert = require('node:assert/strict');
const {
  makeFormToken, verifyFormToken, detectSpam, detectSpamInRow, looksRandomToken, MIN_AGE_MS, MAX_AGE_MS,
} = require('../signupSpam');

test('form token round-trips after the minimum age', () => {
  const t0 = 1_700_000_000_000;
  const token = makeFormToken('evt-1', t0);
  assert.equal(verifyFormToken(token, 'evt-1', t0 + MIN_AGE_MS + 1).ok, true);
});

test('form token rejects instant submits, expiry, tampering, wrong event', () => {
  const t0 = 1_700_000_000_000;
  const token = makeFormToken('evt-1', t0);
  assert.equal(verifyFormToken(token, 'evt-1', t0 + 500).reason, 'too_fast');
  assert.equal(verifyFormToken(token, 'evt-1', t0 + MAX_AGE_MS + 1).reason, 'expired');
  assert.equal(verifyFormToken(token, 'evt-2', t0 + 10_000).reason, 'invalid');
  assert.equal(verifyFormToken(token.slice(0, -1) + 'x', 'evt-1', t0 + 10_000).reason, 'invalid');
  assert.equal(verifyFormToken('', 'evt-1').reason, 'missing');
  assert.equal(verifyFormToken('garbage', 'evt-1').reason, 'invalid');
  assert.equal(verifyFormToken('123', 'evt-1').reason, 'invalid');
});

test('random-token names from the Aug 2026 bot run are flagged', () => {
  for (const n of ['VMSeyc2uvW', 'phpp0uFemw', '9phLEvBKQm', 'IT4DicSKin', 'A4WiJYQCH4', 'lMos4RqTUy']) {
    assert.equal(looksRandomToken(n), true, n);
  }
});

test('real names and business names are not flagged', () => {
  for (const n of ['Cameron foots', 'Noir Candle Collection', 'Cher', 'R2D2', 'Jamie Maness', 'Daniel Corcoran', 'jd2', 'ARTIST', 'lowercase123']) {
    assert.equal(looksRandomToken(n), false, n);
  }
});

test('detectSpam: bot submission shape', () => {
  const reasons = detectSpam({
    name: 'VMSeyc2uvW',
    notes: null,
    customAnswers: { goods: 'ePH89LwfkgQZZDkMO0JIKASjiKcsk733zak7sU8PJflcHCDVdyudKvL' },
  });
  assert.deepEqual(reasons, ['random name', 'random answer (goods)']);
});

test('detectSpam: honeypot alone is enough', () => {
  assert.deepEqual(detectSpam({ name: 'Jane Doe', honeypot: 'http://x' }), ['honeypot filled']);
});

test('detectSpam: genuine vendor application passes', () => {
  const reasons = detectSpam({
    name: 'Daniel Corcoran',
    notes: 'I have a passion for art and enjoy creating.',
    customAnswers: {
      goods: 'I sell creamed honey. Creamed honey is a spreadable honey.',
      img: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD',
      site: 'https://example.com/shop',
      multi: ['data:image/png;base64,iVBORw0KGgo'],
    },
  });
  assert.deepEqual(reasons, []);
});

test('detectSpamInRow works on stored rows', () => {
  assert.equal(detectSpamInRow({ name: 'bMMY0G43Tq', customAnswers: null }).length, 1);
  assert.equal(detectSpamInRow({ name: 'Kiana Jones', customAnswers: { a: 'Cupcakes, CakeCups' } }).length, 0);
});
