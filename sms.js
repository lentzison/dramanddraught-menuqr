// Minimal SMS sender via the Twilio REST API — no SDK dependency.
//
// Env-gated: when TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM_NUMBER
// are not all set, every send is a silent no-op ({ ok: false, skipped: true })
// so callers can fire-and-forget without checking configuration first.
//
// Hospitality applicants answer texts far more reliably than email, so the
// hiring flow sends SMS alongside (never instead of) the existing emails:
// questionnaire link on application, questionnaire reminders, interview
// confirmations and reminders.

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || '';
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || '';
const TWILIO_FROM_NUMBER = process.env.TWILIO_FROM_NUMBER || '';

function smsEnabled() {
  return Boolean(TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_FROM_NUMBER);
}

// Normalize a US phone number to E.164 (+1XXXXXXXXXX). Returns null when the
// input can't be a valid US number — callers skip the send rather than letting
// Twilio reject it.
function normalizeUsPhone(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/\D+/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
}

async function sendSms({ to, body }) {
  if (!smsEnabled()) return { ok: false, skipped: true, reason: 'SMS not configured (TWILIO_* env vars missing)' };
  const phone = normalizeUsPhone(to);
  if (!phone) return { ok: false, reason: `unusable phone number: ${String(to).slice(0, 30)}` };

  const params = new URLSearchParams({
    To: phone,
    From: TWILIO_FROM_NUMBER,
    Body: String(body || '').slice(0, 1500),
  });
  const auth = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64');
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(TWILIO_ACCOUNT_SID)}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return { ok: false, reason: `Twilio HTTP ${res.status}: ${text.slice(0, 200)}` };
  }
  return { ok: true };
}

module.exports = { sendSms, smsEnabled, normalizeUsPhone };
