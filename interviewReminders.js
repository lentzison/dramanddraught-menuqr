const { sendEmailViaGoogle } = require('./helpers');

function formatEastern(date) {
  if (!date) return '';
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    weekday: 'long', month: 'long', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

function reminderBody(application, interview, kind) {
  const when = formatEastern(interview.scheduledAt);
  const typeLabel = interview.type === 'phone' ? 'phone call' : interview.type === 'video' ? 'video call' : 'in-person interview';
  const lines = [
    `Hi ${application.name.split(' ')[0] || 'there'},`,
    '',
    kind === '24h'
      ? `This is a reminder that your ${typeLabel} for the ${application.position} role is tomorrow.`
      : `Quick reminder: your ${typeLabel} for the ${application.position} role is in about an hour.`,
    '',
    `When: ${when} (Eastern), ${interview.durationMinutes} minutes`,
    interview.locationDetail ? `Where: ${interview.locationDetail}` : null,
    interview.interviewerEmail ? `Interviewer: ${interview.interviewerEmail}` : null,
    interview.candidateNote ? `\nNote from us: ${interview.candidateNote}` : null,
    '',
    "If anything's changed on your end, just reply to this email.",
    '',
    'Dram & Draught',
  ].filter((v) => v != null);
  return lines.join('\n');
}

async function sendReminder(prisma, interview, kind) {
  const application = interview.application;
  if (!application?.email) return;
  const recipients = [application.email];
  if (interview.interviewerEmail && interview.interviewerEmail !== application.email) {
    recipients.push(interview.interviewerEmail);
  }
  const subject = kind === '24h'
    ? `Reminder: interview tomorrow — Dram & Draught`
    : `Heads up — interview in 1 hour`;

  try {
    await sendEmailViaGoogle({
      to: recipients,
      subject,
      body: reminderBody(application, interview, kind),
    });
    await prisma.interview.update({
      where: { id: interview.id },
      data: kind === '24h' ? { reminderSent24h: true } : { reminderSent1h: true },
    });
  } catch (err) {
    console.warn(`[interview reminders] ${kind} send failed for ${interview.id}:`, err.message);
  }
}

async function runInterviewReminders(prisma) {
  if (!prisma) return;
  const now = Date.now();
  // 24h window: scheduledAt between now+22h and now+25h, not yet 24h-sent
  const lo24 = new Date(now + 22 * 60 * 60 * 1000);
  const hi24 = new Date(now + 25 * 60 * 60 * 1000);
  // 1h window: scheduledAt between now+30min and now+90min, not yet 1h-sent
  const lo1 = new Date(now + 30 * 60 * 1000);
  const hi1 = new Date(now + 90 * 60 * 1000);

  try {
    const due24 = await prisma.interview.findMany({
      where: {
        status: 'scheduled',
        reminderSent24h: false,
        scheduledAt: { gte: lo24, lte: hi24 },
      },
      include: { application: true },
    });
    for (const iv of due24) await sendReminder(prisma, iv, '24h');

    const due1 = await prisma.interview.findMany({
      where: {
        status: 'scheduled',
        reminderSent1h: false,
        scheduledAt: { gte: lo1, lte: hi1 },
      },
      include: { application: true },
    });
    for (const iv of due1) await sendReminder(prisma, iv, '1h');

    if (due24.length || due1.length) {
      console.log(`[interview reminders] sent ${due24.length} 24h, ${due1.length} 1h`);
    }
  } catch (err) {
    console.warn('[interview reminders] run failed:', err.message);
  }
}

function scheduleInterviewReminders(prisma) {
  // Run once shortly after boot, then every 5 minutes.
  setTimeout(() => runInterviewReminders(prisma), 30 * 1000);
  setInterval(() => runInterviewReminders(prisma), 5 * 60 * 1000);
}

module.exports = { runInterviewReminders, scheduleInterviewReminders };
