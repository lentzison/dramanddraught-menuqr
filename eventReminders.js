// Event signup reminder emails — T-24h and T-1h, mirroring the
// interviewReminders.js pattern (flag-then-send, tight windows, 5-min poll).
//
// Only fires for signups that:
//   - belong to events with remindersEnabled = true and isCancelled = false
//   - have status = 'approved' (we don't remind vendors who haven't been
//     accepted yet — that would be misleading)
//   - have an email on file
//   - have remindersOptOut = false
//   - have the matching reminderSent24h / reminderSent1h flag still false

const crypto = require('crypto');
const { sendEmailViaGoogle } = require('./helpers');
const { effectiveSignupType, isVendor, isParticipant } = require('./eventSignupTypes');
const { getBrand } = require('./brand');

const BASE_URL = (process.env.MENUQR_BASE_URL || getBrand().urls.menuqr).replace(/\/+$/, '');

function formatEastern(date) {
  if (!date) return '';
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    weekday: 'long', month: 'long', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

function ensureUnsubscribeToken(prisma, signup) {
  if (signup.unsubscribeToken) return signup.unsubscribeToken;
  const token = crypto.randomBytes(20).toString('hex');
  // Best-effort write — if it fails we still send with no working unsub link
  // rather than skipping the reminder entirely. Caller already updated the
  // sent-flag before calling us so a missed token write is recoverable.
  return prisma.eventSignup
    .update({ where: { id: signup.id }, data: { unsubscribeToken: token } })
    .then(() => token)
    .catch((err) => {
      console.warn('[event reminders] token write failed for', signup.id, err.message);
      return token;
    });
}

function reminderBody({ event, signup, kind, unsubscribeUrl }) {
  const when = formatEastern(event.startDate);
  const type = effectiveSignupType(event);
  const firstName = (signup.name || '').split(/\s+/)[0] || 'there';
  const location = event.location;
  const locName = location?.name || 'Dram & Draught';
  const role = isVendor({ signupType: type }) ? 'vendor slot'
    : isParticipant({ signupType: type }) ? 'spot'
    : 'spot';

  const opener = kind === '24h'
    ? `Quick reminder — ${event.title} is tomorrow.`
    : `Heads up — ${event.title} starts in about an hour.`;

  const lines = [
    `Hi ${firstName},`,
    '',
    opener,
    '',
    `When: ${when} (Eastern)`,
    locName && location?.city ? `Where: ${locName} — ${location.city}${location.state ? ', ' + location.state : ''}` : `Where: ${locName}`,
    `Your ${role} is confirmed under: ${signup.name}`,
  ];

  if (signup.partySize && signup.partySize > 1) {
    lines.push(`Party size: ${signup.partySize}`);
  }

  if (event.ticketUrl) {
    lines.push('', `Tickets / details: ${event.ticketUrl}`);
  }

  lines.push('', "Looking forward to seeing you. If plans change, just reply to this email and we'll update the list.", '');
  lines.push('— Dram & Draught');
  if (unsubscribeUrl) {
    lines.push('', `Stop reminders for this signup: ${unsubscribeUrl}`);
  }
  return lines.join('\n');
}

async function sendReminder(prisma, signup, kind) {
  const event = signup.event;
  if (!event || !signup.email) return;

  // Flag-first: write before send so a crash mid-send can't double-fire.
  try {
    await prisma.eventSignup.update({
      where: { id: signup.id },
      data: kind === '24h' ? { reminderSent24h: true } : { reminderSent1h: true },
    });
  } catch (err) {
    console.warn(`[event reminders] ${kind} flag-write failed for ${signup.id}:`, err.message);
    return;
  }

  const token = await ensureUnsubscribeToken(prisma, signup);
  const unsubscribeUrl = token
    ? `${BASE_URL}/api/public/events/unsubscribe?token=${encodeURIComponent(token)}`
    : null;

  const subject = kind === '24h'
    ? `Tomorrow: ${event.title}`
    : `Starting soon: ${event.title}`;

  try {
    await sendEmailViaGoogle({
      to: [signup.email],
      subject,
      body: reminderBody({ event, signup, kind, unsubscribeUrl }),
    });
  } catch (err) {
    console.warn(`[event reminders] ${kind} send failed for ${signup.id}:`, err.message);
  }
}

async function runEventReminders(prisma) {
  if (!prisma) return;
  const now = Date.now();
  // Match interviewReminders cadence: 5-min poll, 30-min window for 24h
  // (23h45–24h15) and 20-min window for 1h (50–70m).
  const lo24 = new Date(now + 23 * 60 * 60 * 1000 + 45 * 60 * 1000);
  const hi24 = new Date(now + 24 * 60 * 60 * 1000 + 15 * 60 * 1000);
  const lo1 = new Date(now + 50 * 60 * 1000);
  const hi1 = new Date(now + 70 * 60 * 1000);

  try {
    const due24 = await prisma.eventSignup.findMany({
      where: {
        status: 'approved',
        reminderSent24h: false,
        remindersOptOut: false,
        email: { not: null },
        event: {
          isCancelled: false,
          remindersEnabled: true,
          startDate: { gte: lo24, lte: hi24 },
        },
      },
      include: { event: { include: { location: true } } },
    });
    // Only remind signups for the event's CURRENT occurrence — archived
    // (past-occurrence) signups are kept on record but must not be reminded for
    // a new date they never signed up for.
    const current24 = due24.filter((s) => s.occurrenceId === s.event.currentOccurrenceId);
    for (const s of current24) await sendReminder(prisma, s, '24h');

    const due1 = await prisma.eventSignup.findMany({
      where: {
        status: 'approved',
        reminderSent1h: false,
        remindersOptOut: false,
        email: { not: null },
        event: {
          isCancelled: false,
          remindersEnabled: true,
          startDate: { gte: lo1, lte: hi1 },
        },
      },
      include: { event: { include: { location: true } } },
    });
    const current1 = due1.filter((s) => s.occurrenceId === s.event.currentOccurrenceId);
    for (const s of current1) await sendReminder(prisma, s, '1h');

    if (current24.length || current1.length) {
      console.log(`[event reminders] sent ${current24.length} 24h, ${current1.length} 1h`);
    }
  } catch (err) {
    console.warn('[event reminders] run failed:', err.message);
  }
}

// A rejected background run must never reach the process-level handler as an
// unhandled rejection; log it with its job name and let the next tick retry.
function guard(err) {
  console.error('[event-reminders] run failed:', err && err.stack ? err.stack : err);
}

function scheduleEventReminders(prisma) {
  // First run 45s after boot (after interview reminders, to spread email API
  // load), then every 5 minutes.
  setTimeout(() => runEventReminders(prisma).catch(guard), 45 * 1000);
  setInterval(() => runEventReminders(prisma).catch(guard), 5 * 60 * 1000);
}

module.exports = { runEventReminders, scheduleEventReminders };
