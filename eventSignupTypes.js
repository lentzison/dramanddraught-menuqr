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

// Form copy that adapts to the signup mode. The admin can still override
// individual question labels via the custom-questions feature; these are
// the defaults used by the rendered form.
function signupFormCopy(event) {
  const t = effectiveSignupType(event);
  if (t === 'vendor') {
    return {
      heading: 'Apply to vendor',
      submitLabel: 'Submit application',
      nameLabel: 'Your name *',
      nameHint: 'Person we should contact about your booth.',
      emailLabel: 'Email *',
      phoneLabel: 'Phone',
      partySizeLabel: 'How many people will staff your booth?',
      notesLabel: 'Tell us about your vendor table',
      notesPlaceholder: 'What are you bringing? Booth needs? Any setup notes.',
      pendingHeading: 'Application received',
      pendingMessage: 'Thanks for applying. The team reviews vendor applications and emails you within a few days with a decision.',
    };
  }
  if (t === 'participant') {
    return {
      heading: 'Sign up to take part',
      submitLabel: 'Submit signup',
      nameLabel: 'Your name *',
      nameHint: 'Your name as you\'d like it to appear if announced.',
      emailLabel: 'Email *',
      phoneLabel: 'Phone',
      partySizeLabel: 'How many people are coming with you?',
      notesLabel: 'Tell us about what you\'re bringing',
      notesPlaceholder: 'Cocktail concept, dish description, performance length, equipment you\'ll bring, etc.',
      pendingHeading: 'Signup received',
      pendingMessage: 'Thanks for signing up. We review participant signups and email you within a few days with a decision.',
    };
  }
  return {
    heading: 'Sign up',
    submitLabel: 'Submit signup',
    nameLabel: 'Your name *',
    nameHint: '',
    emailLabel: 'Email *',
    phoneLabel: 'Phone',
    partySizeLabel: 'Party size',
    notesLabel: 'Notes for the team',
    notesPlaceholder: 'Anything we should know? Allergies, accessibility, etc.',
    pendingHeading: 'Signup received',
    pendingMessage: 'Thanks for signing up! Check your email for confirmation details.',
  };
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
  signupFormCopy,
};
