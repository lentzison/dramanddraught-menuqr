// Shared helpers for the three event signup modes (guest / vendor /
// participant). Reads the new Event.signupType column when present and
// falls back to the legacy Event.isVendorEvent boolean so existing rows
// behave the same way they did before the migration.
//
//   guest        — standard RSVP, instant confirmation.
//   vendor       — outside business / artist applying for a slot.
//                  Routed to the approval queue.
//   participant  — anyone signing up to take part in the event (cocktail
//                  competition entrant, performer, contestant).
//                  Routed to the approval queue.

const SIGNUP_TYPES = ['guest', 'vendor', 'participant'];

const SIGNUP_TYPE_LABELS = {
  guest: 'Guest RSVP',
  vendor: 'Vendor application',
  participant: 'Participant signup',
};

const SIGNUP_TYPE_DESCRIPTIONS = {
  guest: 'People signing up to attend the event. Confirms instantly. Form asks party size + notes.',
  vendor: 'Outside businesses / artists applying for a booth or slot. Routed to an approval queue. Form asks vendor name, what they\'re bringing, sample images.',
  participant: 'Anyone signing up to take part — bartenders entering a comp, performers, contestants, etc. Routed to an approval queue. Form asks affiliation + what they\'re bringing.',
};

function effectiveSignupType(event) {
  if (event && typeof event.signupType === 'string' && SIGNUP_TYPES.includes(event.signupType)) {
    return event.signupType;
  }
  if (event && event.isVendorEvent === true) return 'vendor';
  return 'guest';
}

function needsApproval(event) {
  const t = effectiveSignupType(event);
  return t === 'vendor' || t === 'participant';
}

function isVendor(event)      { return effectiveSignupType(event) === 'vendor'; }
function isParticipant(event) { return effectiveSignupType(event) === 'participant'; }
function isGuest(event)       { return effectiveSignupType(event) === 'guest'; }

// What one submission is called in admin copy — "application" for vendors,
// "entry" for competition participants, plain "signup" for guests.
function signupNoun(event) {
  const t = effectiveSignupType(event);
  if (t === 'vendor') return 'application';
  if (t === 'participant') return 'entry';
  return 'signup';
}

module.exports = {
  SIGNUP_TYPES,
  SIGNUP_TYPE_LABELS,
  SIGNUP_TYPE_DESCRIPTIONS,
  effectiveSignupType,
  needsApproval,
  isVendor,
  isParticipant,
  isGuest,
  signupNoun,
};
