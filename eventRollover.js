// Recurring-event rollover. When a recurring event's current occurrence ends,
// we advance to the next date: archive the old occurrence (its signups stay on
// record), repoint the Event at the next occurrence, MIRROR that occurrence's
// dates onto the Event row (so every existing reader keeps working), top up the
// future-occurrence buffer from the rule, and email everyone who has ever signed
// up across the series inviting them to sign up again at the same stable URL.
//
// Runs both on a 5-minute poll (auto, after an occurrence ends) and on demand
// from the admin "Roll over now" button.

const crypto = require('crypto');
const { sendEmailViaGoogle } = require('./helpers');
const { generateOccurrences, normalizeRecurrenceRule } = require('./recurrence');

const BASE_URL = (process.env.MENUQR_BASE_URL || 'https://menuqr.apps.dramanddraught.com').replace(/\/+$/, '');

function formatEastern(date) {
  if (!date) return '';
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    weekday: 'long', month: 'long', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

// Count occurrences that already exist for an event (to honor rule.count).
function occurrenceCount(prisma, eventId) {
  return prisma.eventOccurrence.count({ where: { eventId } });
}

// Ensure there's at least one un-rolled occurrence strictly after `afterDate`,
// generating from the rule if the event is recurring and the rule isn't spent.
// Returns the next occurrence row (existing or freshly created) or null.
async function ensureNextOccurrence(prisma, event, afterDate, { manualDate } = {}) {
  // Already have a future occurrence queued?
  const existing = await prisma.eventOccurrence.findFirst({
    where: { eventId: event.id, rolledOverAt: null, startDate: { gt: afterDate } },
    orderBy: { startDate: 'asc' },
  });
  if (existing) return existing;

  // Manual date wins (manual "roll over to this specific date").
  let next = null;
  if (manualDate && manualDate > afterDate) {
    next = { startDate: manualDate, endDate: null, origin: 'manual' };
  } else if (event.isRecurring) {
    const rule = normalizeRecurrenceRule(event.recurrenceRule);
    if (rule) {
      if (rule.count) {
        const have = await occurrenceCount(prisma, event.id);
        if (have >= rule.count) return null; // series complete
      }
      const gen = generateOccurrences(rule, afterDate, 1);
      if (gen.length) next = { ...gen[0], origin: 'rule' };
    }
  }
  if (!next) return null;

  const maxSeq = await prisma.eventOccurrence.aggregate({
    where: { eventId: event.id }, _max: { sequence: true },
  });
  return prisma.eventOccurrence.create({
    data: {
      eventId: event.id,
      startDate: next.startDate,
      endDate: next.endDate,
      sequence: (maxSeq._max.sequence || 0) + 1,
      origin: next.origin || 'rule',
    },
  });
}

// Dedup signups by lowercased email, excluding series opt-outs. Keeps a
// representative signup per email so we can derive an unsubscribe token.
async function seriesRecipients(prisma, eventId) {
  const [signups, optOuts] = await Promise.all([
    prisma.eventSignup.findMany({
      where: { eventId, email: { not: null }, status: { not: 'rejected' } },
      select: { id: true, name: true, email: true, unsubscribeToken: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.eventSeriesOptOut.findMany({ where: { eventId }, select: { email: true } }),
  ]);
  const optedOut = new Set(optOuts.map((o) => (o.email || '').toLowerCase()));
  const byEmail = new Map();
  for (const s of signups) {
    const key = (s.email || '').toLowerCase();
    if (!key || optedOut.has(key) || byEmail.has(key)) continue;
    byEmail.set(key, s);
  }
  return [...byEmail.values()];
}

async function ensureUnsubToken(prisma, signup) {
  if (signup.unsubscribeToken) return signup.unsubscribeToken;
  const token = crypto.randomBytes(20).toString('hex');
  try {
    await prisma.eventSignup.update({ where: { id: signup.id }, data: { unsubscribeToken: token } });
  } catch (err) {
    console.warn('[event rollover] unsub token write failed for', signup.id, err.message);
  }
  return token;
}

function inviteBody({ event, occurrence, firstName, eventUrl, unsubscribeUrl }) {
  const when = formatEastern(occurrence.startDate);
  const locName = event.location?.name || 'Dram & Draught';
  const lines = [
    `Hi ${firstName || 'there'},`,
    '',
    `${event.title} is happening again — and we'd love to have you back.`,
    '',
    `When: ${when} (Eastern)`,
    `Where: ${locName}`,
    '',
    `Signups for this date are now open. Grab your spot here:`,
    eventUrl,
    '',
    "Hope to see you there.",
    '— Dram & Draught',
  ];
  if (unsubscribeUrl) {
    lines.push('', `Don't want these invites for this event? Opt out: ${unsubscribeUrl}`);
  }
  return lines.join('\n');
}

async function sendSeriesInvites(prisma, event, occurrence) {
  if (!event.location?.slug || !event.slug) return 0;
  const recipients = await seriesRecipients(prisma, event.id);
  if (!recipients.length) return 0;
  const eventUrl = `${BASE_URL}/${event.location.slug}/events/${event.slug}`;

  let sent = 0;
  for (const r of recipients) {
    const token = await ensureUnsubToken(prisma, r);
    const unsubscribeUrl = token
      ? `${BASE_URL}/api/public/events/series-unsubscribe?token=${encodeURIComponent(token)}`
      : null;
    const firstName = (r.name || '').split(/\s+/)[0] || '';
    try {
      await sendEmailViaGoogle({
        to: [r.email],
        subject: `We're doing it again: ${event.title}`,
        body: inviteBody({ event, occurrence, firstName, eventUrl, unsubscribeUrl }),
      });
      sent++;
    } catch (err) {
      console.warn('[event rollover] invite send failed for', r.email, err.message);
    }
  }
  return sent;
}

/**
 * Advance a recurring event to its next occurrence.
 * @returns {Promise<{ok:boolean, reason?:string, occurrence?:object, invitesSent?:number}>}
 */
async function rolloverEvent(prisma, event, { trigger = 'auto', manualDate = null, sendInvites = true } = {}) {
  // Need the full event with current occurrence + location.
  const full = event.currentOccurrence && event.location
    ? event
    : await prisma.event.findUnique({ where: { id: event.id }, include: { currentOccurrence: true, location: true } });
  if (!full) return { ok: false, reason: 'not-found' };

  const prev = full.currentOccurrence;
  const afterDate = prev ? (prev.endDate || prev.startDate) : new Date(0);

  const next = await ensureNextOccurrence(prisma, full, afterDate, { manualDate });
  if (!next) return { ok: false, reason: 'no-next-date' };
  if (full.currentOccurrenceId === next.id) return { ok: false, reason: 'already-current' };

  // Archive previous + repoint Event, mirroring dates so every reader stays correct.
  await prisma.$transaction([
    ...(prev ? [prisma.eventOccurrence.update({ where: { id: prev.id }, data: { rolledOverAt: new Date() } })] : []),
    prisma.event.update({
      where: { id: full.id },
      data: {
        currentOccurrenceId: next.id,
        startDate: next.startDate,
        endDate: next.endDate,
        // Keep the event publicly visible / accepting signups for the new date.
        promoteUntil: next.endDate || next.startDate,
        promoteFrom: null,
      },
    }),
  ]);

  // Top up the buffer: make sure one more future occurrence exists beyond `next`.
  await ensureNextOccurrence(prisma, full, next.endDate || next.startDate, {}).catch(() => {});

  // Series invites — once per occurrence (idempotent across auto + manual).
  let invitesSent = 0;
  if (sendInvites && !next.inviteSentAt) {
    // Claim first so a concurrent run / double-click can't double-send.
    try {
      await prisma.eventOccurrence.update({ where: { id: next.id }, data: { inviteSentAt: new Date() } });
      invitesSent = await sendSeriesInvites(prisma, full, next);
    } catch (err) {
      console.warn('[event rollover] invite phase failed:', err.message);
    }
  }

  console.log(`[event rollover] ${trigger} rolled "${full.title}" → ${formatEastern(next.startDate)} (${invitesSent} invites)`);
  return { ok: true, occurrence: next, invitesSent };
}

// Auto job: roll any recurring event whose current occurrence has ended.
async function runRollovers(prisma) {
  if (!prisma) return;
  // Small grace so we don't roll the instant it starts — wait until it's clearly over.
  const cutoff = new Date(Date.now() - 30 * 60 * 1000);
  try {
    const due = await prisma.event.findMany({
      where: {
        isRecurring: true,
        isCancelled: false,
        currentOccurrence: {
          is: {
            rolledOverAt: null,
            OR: [
              { endDate: { not: null, lte: cutoff } },
              { endDate: null, startDate: { lte: cutoff } },
            ],
          },
        },
      },
      include: { currentOccurrence: true, location: true },
    });
    for (const ev of due) {
      await rolloverEvent(prisma, ev, { trigger: 'auto' }).catch((err) =>
        console.warn('[event rollover] failed for', ev.id, err.message));
    }
    if (due.length) console.log(`[event rollover] auto-checked ${due.length} event(s)`);
  } catch (err) {
    console.warn('[event rollover] run failed:', err.message);
  }
}

function scheduleEventRollovers(prisma) {
  // After reminders boot (which start at 45s), then every 5 minutes.
  setTimeout(() => runRollovers(prisma), 60 * 1000);
  setInterval(() => runRollovers(prisma), 5 * 60 * 1000);
}

// Keep an event's occurrence rows consistent with its current dates + rule.
// Called after every create/update in the admin so:
//   - a current occurrence always exists (mirrors Event.startDate/endDate)
//   - recurring events keep a small buffer of future occurrences materialized
//   - rule edits regenerate future, un-attended occurrences (never past/current)
async function materializeOccurrences(prisma, eventId) {
  const event = await prisma.event.findUnique({
    where: { id: eventId }, include: { currentOccurrence: true },
  });
  if (!event) return;

  // 1. Ensure a current occurrence exists and mirrors the event's live dates.
  if (!event.currentOccurrenceId) {
    const occ = await prisma.eventOccurrence.create({
      data: { eventId, startDate: event.startDate, endDate: event.endDate, sequence: 1, origin: 'manual' },
    });
    await prisma.event.update({ where: { id: eventId }, data: { currentOccurrenceId: occ.id } });
    event.currentOccurrenceId = occ.id;
    event.currentOccurrence = occ;
  } else {
    await prisma.eventOccurrence.update({
      where: { id: event.currentOccurrenceId },
      data: { startDate: event.startDate, endDate: event.endDate },
    }).catch(() => {});
  }

  const current = event.currentOccurrence;
  const afterDate = current ? (current.endDate || current.startDate) : event.startDate;

  // 2. Clear future, RULE-generated, un-attended occurrences so rule edits /
  //    toggling-off apply cleanly. Manually-added one-off dates and anything
  //    with signups are always preserved.
  const futures = await prisma.eventOccurrence.findMany({
    where: { eventId, rolledOverAt: null, origin: 'rule', startDate: { gt: afterDate } },
    include: { _count: { select: { signups: true } } },
  });
  for (const f of futures) {
    if ((f._count?.signups || 0) === 0) {
      await prisma.eventOccurrence.delete({ where: { id: f.id } }).catch(() => {});
    }
  }

  // 3. Recurring → top up one future occurrence from the rule.
  if (event.isRecurring) {
    await ensureNextOccurrence(prisma, event, afterDate, {}).catch(() => {});
  }
}

// Reconcile an event's future MANUAL occurrences with an explicit list of dates
// (the "specific dates" repeat mode). Creates missing dates, removes future
// manual dates the admin dropped (only if they have no signups), and never
// touches the current/past occurrences. Each new occurrence inherits the event's
// start→end duration when one is set.
async function syncManualOccurrences(prisma, eventId, dates) {
  const event = await prisma.event.findUnique({ where: { id: eventId }, include: { currentOccurrence: true } });
  if (!event) return;
  const durationMs = event.startDate && event.endDate
    ? Math.max(0, new Date(event.endDate).getTime() - new Date(event.startDate).getTime())
    : null;
  const currentStart = event.currentOccurrence ? new Date(event.currentOccurrence.startDate).getTime() : null;

  const desired = (Array.isArray(dates) ? dates : [])
    .filter((d) => d instanceof Date && !Number.isNaN(d.getTime()))
    .filter((d) => currentStart == null || d.getTime() !== currentStart);
  const desiredTimes = new Set(desired.map((d) => d.getTime()));

  const existing = await prisma.eventOccurrence.findMany({
    where: { eventId, origin: 'manual', rolledOverAt: null },
    include: { _count: { select: { signups: true } } },
  });
  const existingFuture = existing.filter((o) => o.id !== event.currentOccurrenceId);
  const existingTimes = new Set(existingFuture.map((o) => new Date(o.startDate).getTime()));

  let seq = (await prisma.eventOccurrence.aggregate({ where: { eventId }, _max: { sequence: true } }))._max.sequence || 0;
  for (const d of desired) {
    if (existingTimes.has(d.getTime())) continue;
    seq += 1;
    await prisma.eventOccurrence.create({
      data: {
        eventId, startDate: d,
        endDate: durationMs != null ? new Date(d.getTime() + durationMs) : null,
        sequence: seq, origin: 'manual',
      },
    }).catch((err) => console.warn('[events] sync manual occurrence failed:', err.message));
  }
  for (const o of existingFuture) {
    if (!desiredTimes.has(new Date(o.startDate).getTime()) && (o._count?.signups || 0) === 0) {
      await prisma.eventOccurrence.delete({ where: { id: o.id } }).catch(() => {});
    }
  }
}

// Send the "sign up again" invite to the whole series on demand (a manual
// "let past signups know" button), independent of a rollover. Targets the
// event's current (live) occurrence. Returns the number of emails sent.
async function announceToSeries(prisma, eventId) {
  const event = await prisma.event.findUnique({
    where: { id: eventId }, include: { currentOccurrence: true, location: true },
  });
  if (!event || !event.currentOccurrence) return 0;
  const sent = await sendSeriesInvites(prisma, event, event.currentOccurrence);
  await prisma.eventOccurrence.update({
    where: { id: event.currentOccurrence.id }, data: { inviteSentAt: new Date() },
  }).catch(() => {});
  return sent;
}

module.exports = {
  rolloverEvent, runRollovers, scheduleEventRollovers,
  ensureNextOccurrence, seriesRecipients, materializeOccurrences,
  syncManualOccurrences, announceToSeries,
};
