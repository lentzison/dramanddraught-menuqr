const { sendHTML, parseBody, redirect, getFlashMsg, sendEmailViaGoogle } = require('../helpers');
const { requireAuth, isCompanyWide, getUserLocationSlugs, canAccessLocation } = require('../auth');
const {
  eventsList,
  eventEditor,
  eventSignupsView,
  eventSignupDecisionView,
} = require('../views/adminEventsViews');
const { sanitizeImageSrc } = require('../views/imageUploadWidget');
const { writeAudit } = require('../auditLog');
const { SIGNUP_TYPES, effectiveSignupType, needsApproval } = require('../eventSignupTypes');
const { normalizeThemeKey } = require('../views/eventThemes');

function normalizeText(value) {
  return String(value || '').trim();
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

function formatEventDateForEmail(event) {
  return event?.startDate
    ? new Date(event.startDate).toLocaleString('en-US', {
        timeZone: 'America/New_York',
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : '';
}

function buildVendorDecisionEmail(event, signup, decision, rejectionReason = '') {
  const isApprove = decision === 'approve';
  const dateStr = formatEventDateForEmail(event);
  const subject = isApprove
    ? `You're confirmed: ${event.title}`
    : `Update on your application: ${event.title}`;
  const bodyLines = isApprove
    ? [
        `Hi ${signup?.name || 'there'},`,
        '',
        `Great news — your application for "${event.title}" at ${event.location?.name || ''} has been approved.`,
        dateStr ? `Event: ${dateStr}` : null,
        '',
        "We'll be in touch with load-in details closer to the date.",
        '',
        `— Dram & Draught ${event.location?.name || ''}`,
      ].filter(Boolean)
    : [
        `Hi ${signup?.name || 'there'},`,
        '',
        `Thanks for applying to be a vendor at "${event.title}". Unfortunately we're not able to include you in this event.`,
        rejectionReason ? '' : null,
        rejectionReason ? `Notes from our team: ${rejectionReason}` : null,
        '',
        "We appreciate your interest and hope to work with you at a future event.",
        '',
        `— Dram & Draught ${event.location?.name || ''}`,
      ].filter(Boolean);
  return { subject, body: bodyLines.join('\n') };
}

// Look up the Eastern Time UTC offset (in minutes) for a given calendar date.
// Returns -240 (EDT) in summer, -300 (EST) in winter, automatically handling DST.
function getEasternOffsetMinutes(year, month, day) {
  // Make a UTC noon timestamp on that day, then format it in Eastern with timeZoneName.
  // The short name is "EDT" or "EST" depending on DST status.
  const probe = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  const formatted = probe.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    timeZoneName: 'short',
  });
  // formatted ends with "EDT" or "EST"
  return formatted.endsWith('EDT') ? -240 : -300;
}

function parseDateTimeLocal(value) {
  if (!value) return null;
  // `datetime-local` inputs return "YYYY-MM-DDTHH:MM" (no timezone).
  // The admin enters the wall-clock time they want at the location, which
  // for this business is Eastern. We must NOT use `new Date(value)` because
  // that would interpret the input as the server's local timezone (UTC in
  // production), shifting the time by 4 or 5 hours.
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return null;
  const year = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  const day = parseInt(m[3], 10);
  const hour = parseInt(m[4], 10);
  const minute = parseInt(m[5], 10);
  if ([year, month, day, hour, minute].some((n) => Number.isNaN(n))) return null;
  const offsetMin = getEasternOffsetMinutes(year, month, day);
  // Build the equivalent UTC timestamp: UTC = Eastern wall - offset
  // (offset is negative for Eastern, so subtracting a negative adds)
  const utcMs = Date.UTC(year, month - 1, day, hour, minute, 0) - offsetMin * 60 * 1000;
  const d = new Date(utcMs);
  return Number.isNaN(d.getTime()) ? null : d;
}

function normalizeTicketUrl(value) {
  const v = normalizeText(value);
  if (!v) return null;
  // Bare http(s) URLs only — silently drop anything else so we never render
  // a junk href on the event page.
  if (!/^https?:\/\//i.test(v)) return null;
  return v;
}

function detectTicketProvider(value) {
  const v = normalizeTicketUrl(value);
  if (!v) return null;
  if (/eventbrite\.(com|ca|co\.uk)/i.test(v)) return 'eventbrite';
  return 'other';
}

function parseCapacity(value) {
  if (value == null || value === '') return null;
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Allowed background style values for sections that support theming.
function normalizeBgStyle(value) {
  const v = String(value || '').toLowerCase();
  return ['default', 'gold', 'dark', 'transparent'].includes(v) ? v : 'default';
}

// Helper for section types that have repeating rows (schedule, faq).
function pickArray(body, key) {
  const v = body[key];
  if (Array.isArray(v)) return v;
  if (v == null || v === '') return [];
  return [v];
}

function generateSectionId() {
  return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// Build a section object from form fields based on its type. Generates a fresh id when not provided.
function buildSectionFromForm(body, existingId = null) {
  const type = String(body.type || 'text').toLowerCase();
  const id = existingId || generateSectionId();
  const bgStyle = normalizeBgStyle(body.bgStyle);

  if (type === 'text') {
    return {
      id, type, bgStyle,
      heading: normalizeText(body.heading) || null,
      body: normalizeText(body.body) || null,
      align: ['left', 'center', 'right'].includes(String(body.align)) ? body.align : 'left',
    };
  }
  if (type === 'image') {
    const src = sanitizeImageSrc(body.src);
    if (!src) return null;
    return { id, type, src, caption: normalizeText(body.caption) || null, alt: normalizeText(body.alt) || null };
  }
  if (type === 'details') {
    const labels = pickArray(body, 'detail_label');
    const values = pickArray(body, 'detail_value');
    const items = [];
    for (let i = 0; i < labels.length; i++) {
      const label = normalizeText(labels[i]);
      const value = normalizeText(values[i]);
      if (label || value) items.push({ label, value });
    }
    return { id, type, bgStyle, title: normalizeText(body.title) || null, items };
  }
  if (type === 'button') {
    const url = normalizeText(body.url);
    if (!url) return null;
    return {
      id, type, bgStyle,
      label: normalizeText(body.label) || 'Learn More',
      url: url.slice(0, 2000),
      style: ['primary', 'secondary'].includes(String(body.style)) ? body.style : 'primary',
    };
  }
  if (type === 'video') {
    const url = normalizeText(body.url);
    if (!url) return null;
    return { id, type, bgStyle, url: url.slice(0, 2000), caption: normalizeText(body.caption) || null };
  }
  if (type === 'divider') {
    return { id, type };
  }
  if (type === 'hero') {
    const src = sanitizeImageSrc(body.src);
    if (!src) return null;
    return {
      id, type,
      src,
      eyebrow: normalizeText(body.eyebrow) || null,
      title: normalizeText(body.title) || null,
      subtitle: normalizeText(body.subtitle) || null,
    };
  }
  if (type === 'twocol') {
    const src = sanitizeImageSrc(body.src);
    if (!src) return null;
    return {
      id, type, bgStyle,
      src,
      alt: normalizeText(body.alt) || null,
      imagePosition: String(body.imagePosition) === 'right' ? 'right' : 'left',
      heading: normalizeText(body.heading) || null,
      body: normalizeText(body.body) || null,
    };
  }
  if (type === 'schedule') {
    const times = pickArray(body, 'sched_time');
    const titles = pickArray(body, 'sched_title');
    const descs = pickArray(body, 'sched_desc');
    const items = [];
    for (let i = 0; i < Math.max(times.length, titles.length); i++) {
      const time = normalizeText(times[i]);
      const title = normalizeText(titles[i]);
      const description = normalizeText(descs[i]);
      if (time || title || description) items.push({ time, title, description });
    }
    return { id, type, bgStyle, title: normalizeText(body.title) || null, items };
  }
  if (type === 'faq') {
    const questions = pickArray(body, 'faq_question');
    const answers = pickArray(body, 'faq_answer');
    const items = [];
    for (let i = 0; i < Math.max(questions.length, answers.length); i++) {
      const question = normalizeText(questions[i]);
      const answer = normalizeText(answers[i]);
      if (question || answer) items.push({ question, answer });
    }
    return { id, type, bgStyle, title: normalizeText(body.title) || null, items };
  }
  return null;
}

function getSections(event) {
  return Array.isArray(event.sections) ? event.sections : [];
}

function cloneSection(section) {
  if (!section || typeof section !== 'object') return null;
  return {
    ...JSON.parse(JSON.stringify(section)),
    id: generateSectionId(),
  };
}

function parseCustomQuestions(body) {
  // Expect arrays: custom_label[], custom_type[], custom_required[], custom_id[].
  // custom_id is preserved from existing questions so saved EventSignup
  // customAnswers (keyed by question id) keep matching after edits. New rows
  // submit an empty custom_id and we generate one.
  const labels = Array.isArray(body['custom_label']) ? body['custom_label'] : (body['custom_label'] ? [body['custom_label']] : []);
  const types = Array.isArray(body['custom_type']) ? body['custom_type'] : (body['custom_type'] ? [body['custom_type']] : []);
  const ids = Array.isArray(body['custom_id']) ? body['custom_id'] : (body['custom_id'] != null ? [body['custom_id']] : []);
  const questions = [];
  for (let i = 0; i < labels.length; i++) {
    const label = normalizeText(labels[i]);
    if (!label) continue;
    const type = (types[i] || 'text').toLowerCase();
    const validType = ['text', 'textarea', 'number', 'yesno', 'image'].includes(type) ? type : 'text';
    const required = body[`custom_required_${i}`] === 'on';
    const existingId = String(ids[i] || '').trim();
    questions.push({
      id: existingId || ('q_' + i + '_' + Math.random().toString(36).slice(2, 8)),
      label,
      type: validType,
      required,
    });
  }
  return questions;
}

async function ensureUniqueSlug(prisma, locationId, baseSlug, excludeId = null) {
  let slug = baseSlug;
  let i = 2;
  // Loop until we find an unused slug
  while (true) {
    const existing = await prisma.event.findFirst({
      where: {
        locationId,
        slug,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });
    if (!existing) return slug;
    slug = `${baseSlug}-${i}`;
    i++;
    if (i > 100) return `${baseSlug}-${Date.now().toString(36)}`;
  }
}

async function handleAdminEvents(req, res, pathname, prisma) {
  if (!pathname.startsWith('/admin/events')) return false;

  const user = requireAuth(req, res);
  if (!user) { redirect(res, '/admin/login'); return true; }
  if (!prisma) { sendHTML(res, 500, '<p>DB not available</p>'); return true; }

  const userIsCompanyWide = isCompanyWide(user);
  const userSlugs = userIsCompanyWide ? null : getUserLocationSlugs(user);

  const locWhere = { isActive: true };
  if (!userIsCompanyWide) {
    locWhere.slug = { in: userSlugs.length > 0 ? userSlugs : ['__none__'] };
  }
  const locations = await prisma.location.findMany({
    where: locWhere,
    orderBy: { name: 'asc' },
    select: { id: true, slug: true, name: true },
  }).catch(() => []);
  const allowedLocationIds = new Set(locations.map(l => l.id));

  // ─── List all events ───
  if (pathname === '/admin/events') {
    const flashMsg = getFlashMsg(req.url);
    const urlObj = new URL(req.url, 'http://x');
    const filter = (urlObj.searchParams.get('filter') || 'upcoming').toLowerCase();
    const validFilters = new Set(['upcoming', 'past', 'hidden', 'cancelled', 'all']);
    const safeFilter = validFilters.has(filter) ? filter : 'upcoming';
    const eventWhere = userIsCompanyWide
      ? {}
      : { locationId: { in: Array.from(allowedLocationIds).length > 0 ? Array.from(allowedLocationIds) : ['__none__'] } };
    // For Upcoming filter the most useful sort is ascending by startDate;
    // for everything else the latest-first feel is what admins expect.
    const orderBy = safeFilter === 'upcoming' ? [{ startDate: 'asc' }] : [{ startDate: 'desc' }];
    const events = await prisma.event.findMany({
      where: eventWhere,
      orderBy,
      include: {
        location: { select: { slug: true, name: true } },
        _count: { select: { signups: true } },
      },
    }).catch(async (err) => {
      console.warn('Events list include failed, falling back:', err.message);
      const rows = await prisma.event.findMany({ where: eventWhere, orderBy }).catch(() => []);
      for (const ev of rows) {
        const loc = locations.find(l => l.id === ev.locationId);
        ev.location = loc ? { slug: loc.slug, name: loc.name } : { slug: '', name: '' };
        ev._count = { signups: await prisma.eventSignup.count({ where: { eventId: ev.id } }).catch(() => 0) };
      }
      return rows;
    });

    sendHTML(res, 200, eventsList(events, user, flashMsg, safeFilter));
    return true;
  }

  // ─── New event form / create ───
  if (pathname === '/admin/events/new') {
    if (req.method === 'POST') {
      const body = await parseBody(req);
      const flashError = (detail) => '/admin/events/new?msg=' + encodeURIComponent('error|' + detail);
      const title = normalizeText(body.title);
      const locationId = normalizeText(body.locationId);
      if (!title) { redirect(res, flashError('Event name is required.')); return true; }
      if (!locationId) { redirect(res, flashError('Please pick a location.')); return true; }
      if (!userIsCompanyWide && !allowedLocationIds.has(locationId)) {
        redirect(res, flashError('You can only create events for your own location.'));
        return true;
      }

      const baseSlug = slugify(body.slug || title) || 'event';
      const uniqueSlug = await ensureUniqueSlug(prisma, locationId, baseSlug);

      const startDate = parseDateTimeLocal(body.startDate);
      if (!startDate) { redirect(res, flashError('Event date and time are required.')); return true; }

      const customQuestions = parseCustomQuestions(body);

      try {
        const created = await prisma.event.create({
          data: {
            locationId,
            slug: uniqueSlug,
            title,
            description: normalizeText(body.description) || null,
            startDate,
            endDate: parseDateTimeLocal(body.endDate),
            image: sanitizeImageSrc(body.image),
            promoteFrom: parseDateTimeLocal(body.promoteFrom),
            promoteUntil: parseDateTimeLocal(body.promoteUntil),
            capacity: parseCapacity(body.capacity),
            signupsEnabled: body.signupsEnabled === 'on',
            collectEmail: body.collectEmail === 'on',
            collectPhone: body.collectPhone === 'on',
            collectPartySize: body.collectPartySize === 'on',
            collectNotes: body.collectNotes === 'on',
            customQuestions: customQuestions.length > 0 ? customQuestions : null,
            confirmationMessage: normalizeText(body.confirmationMessage) || null,
            notifyEmail: normalizeText(body.notifyEmail) || null,
            isActive: body.isActive === 'on',
            isCancelled: false,
            signupType: SIGNUP_TYPES.includes(String(body.signupType)) ? String(body.signupType) : 'guest',
            // Keep isVendorEvent in sync so existing read paths still work
            // until they're all migrated to read signupType directly.
            isVendorEvent: String(body.signupType) === 'vendor',
            ticketUrl: normalizeTicketUrl(body.ticketUrl),
            ticketProvider: detectTicketProvider(body.ticketUrl),
            remindersEnabled: body.remindersEnabled === 'on',
            themeKey: normalizeThemeKey(body.themeKey),
          },
        });
        // Find slug for audit context
        const loc = locations.find(l => l.id === locationId);
        writeAudit(prisma, req, user, {
          action: 'create', resourceType: 'event', resourceId: created.id,
          resourceLabel: created.title, locationSlug: loc ? loc.slug : null,
        });
        redirect(res, `/admin/events/${created.id}?msg=created`);
        return true;
      } catch (err) {
        console.error('Error creating event:', err.message || err);
        redirect(res, flashError(err.message || 'Database error.'));
        return true;
      }
    }

    const flashMsg = getFlashMsg(req.url);
    sendHTML(res, 200, eventEditor(null, locations, user, flashMsg));
    return true;
  }

  // ─── Per-event QR code (PNG by default, ?fmt=svg for vector) ───
  // GET /admin/events/:id/qr?fmt=png|svg&size=600
  const qrMatch = pathname.match(/^\/admin\/events\/([a-zA-Z0-9-]+)\/qr$/);
  if (qrMatch) {
    const eventId = qrMatch[1];
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: { location: { select: { slug: true } } },
    }).catch(() => null);
    if (!event) { sendHTML(res, 404, '<h1>Event not found</h1>'); return true; }
    if (!userIsCompanyWide && !canAccessLocation(user, event.location?.slug)) {
      redirect(res, '/admin/events');
      return true;
    }
    if (!event.location?.slug || !event.slug) {
      sendHTML(res, 400, '<h1>Event has no public URL yet</h1>');
      return true;
    }

    const QRCode = require('qrcode');
    const urlObj = new URL(req.url, 'http://x');
    const fmt = (urlObj.searchParams.get('fmt') || 'png').toLowerCase();
    const size = Math.min(2000, Math.max(200, parseInt(urlObj.searchParams.get('size') || '800', 10)));
    const baseUrl = process.env.MENUQR_BASE_URL || 'https://menuqr.apps.dramanddraught.com';
    const target = `${baseUrl}/${event.location.slug}/events/${event.slug}`;
    const filename = `event-${event.slug}-qr.${fmt === 'svg' ? 'svg' : 'png'}`;

    try {
      if (fmt === 'svg') {
        const svg = await QRCode.toString(target, {
          type: 'svg',
          margin: 2,
          color: { dark: '#0f1012', light: '#ffffff' },
        });
        res.writeHead(200, {
          'Content-Type': 'image/svg+xml',
          'Content-Disposition': `inline; filename="${filename}"`,
          'Cache-Control': 'public, max-age=300',
        });
        res.end(svg);
      } else {
        const png = await QRCode.toBuffer(target, {
          type: 'png',
          margin: 2,
          width: size,
          color: { dark: '#0f1012', light: '#ffffff' },
        });
        res.writeHead(200, {
          'Content-Type': 'image/png',
          'Content-Length': png.length,
          'Content-Disposition': `inline; filename="${filename}"`,
          'Cache-Control': 'public, max-age=300',
        });
        res.end(png);
      }
    } catch (err) {
      console.warn('[adminEvents] QR generation failed:', err.message);
      sendHTML(res, 500, '<h1>Could not generate QR</h1>');
    }
    return true;
  }

  // ─── Edit event / view signups ───
  const editMatch = pathname.match(/^\/admin\/events\/([a-zA-Z0-9-]+)(?:\/(signups|signups\/export|delete))?$/);
  if (editMatch) {
    const eventId = editMatch[1];
    const subpath = editMatch[2] || '';

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: { location: { select: { slug: true, name: true } } },
    }).catch(() => null);
    if (!event) { sendHTML(res, 404, '<h1>Event not found</h1><p><a href="/admin/events">Back to events</a></p>'); return true; }
    if (!userIsCompanyWide && !canAccessLocation(user, event.location?.slug)) {
      redirect(res, '/admin/events');
      return true;
    }

    // Signups CSV export
    if (subpath === 'signups/export') {
      const signups = await prisma.eventSignup.findMany({
        where: { eventId },
        orderBy: { createdAt: 'asc' },
      });
      const customDefs = Array.isArray(event.customQuestions) ? event.customQuestions : [];
      const headers = ['Date', 'Name', 'Email', 'Phone', 'Party Size', 'Notes', ...customDefs.map(q => q.label)];
      const csvEscape = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
      const rows = signups.map(s => {
        const answers = s.customAnswers || {};
        return [
          s.createdAt ? s.createdAt.toISOString() : '',
          s.name || '',
          s.email || '',
          s.phone || '',
          s.partySize || '',
          s.notes || '',
          ...customDefs.map(q => {
            const v = answers[q.id];
            if (v == null) return '';
            // images-multi: CSV shouldn't carry base64 blobs. Just summarize.
            if (Array.isArray(v)) return `${v.length} image${v.length === 1 ? '' : 's'} attached`;
            return v;
          }),
        ].map(csvEscape).join(',');
      });
      const csv = headers.map(csvEscape).join(',') + '\n' + rows.join('\n');
      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="event-${event.slug}-signups.csv"`,
      });
      res.end(csv);
      return true;
    }

    // Signups view
    if (subpath === 'signups') {
      const flashMsg = getFlashMsg(req.url);
      const parsedDecisionUrl = new URL(req.url, 'http://admin.local');
      const decision = String(parsedDecisionUrl.searchParams.get('decision') || '').toLowerCase();
      const decisionSignupId = String(parsedDecisionUrl.searchParams.get('signupId') || '').trim();

      if (req.method === 'GET' && (decision === 'approve' || decision === 'reject') && decisionSignupId) {
        const signup = await prisma.eventSignup.findFirst({
          where: { id: decisionSignupId, eventId },
        }).catch(() => null);
        if (!signup) {
          redirect(res, `/admin/events/${eventId}/signups?msg=` + encodeURIComponent('error|Signup not found.'));
          return true;
        }
        const email = buildVendorDecisionEmail(event, signup, decision);
        sendHTML(res, 200, eventSignupDecisionView(event, signup, decision, email, user, flashMsg));
        return true;
      }

      // Handle signup actions: delete / approve / reject (approve + reject are
      // only surfaced in the UI for vendor events).
      if (req.method === 'POST') {
        const body = await parseBody(req);
        const action = body._action || '';
        const signupId = body.signupId ? String(body.signupId) : '';

        if (action === 'deleteSignup' && signupId) {
          await prisma.eventSignup.delete({ where: { id: signupId } }).catch(() => null);
          redirect(res, `/admin/events/${eventId}/signups?msg=deleted`);
          return true;
        }

        if ((action === 'approveSignup' || action === 'rejectSignup') && signupId) {
          const decisionParam = action === 'approveSignup' ? 'approve' : 'reject';
          redirect(res, `/admin/events/${eventId}/signups?decision=${decisionParam}&signupId=${encodeURIComponent(signupId)}`);
          return true;
        }

        if (action === 'sendDecision' && signupId) {
          const decisionValue = String(body.decision || '').toLowerCase();
          const isApprove = decisionValue === 'approve';
          if (!isApprove && decisionValue !== 'reject') {
            redirect(res, `/admin/events/${eventId}/signups?msg=` + encodeURIComponent('error|Invalid decision.'));
            return true;
          }
          const reason = isApprove ? null : (String(body.rejectionReason || '').trim().slice(0, 500) || null);
          const subject = String(body.emailSubject || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 200);
          const emailBody = String(body.emailBody || '').replace(/\r\n/g, '\n').trim().slice(0, 5000);
          if (!subject || !emailBody) {
            const signup = await prisma.eventSignup.findFirst({ where: { id: signupId, eventId } }).catch(() => null);
            if (!signup) {
              redirect(res, `/admin/events/${eventId}/signups?msg=` + encodeURIComponent('error|Signup not found.'));
              return true;
            }
            const fallback = buildVendorDecisionEmail(event, signup, decisionValue, reason || '');
            sendHTML(res, 400, eventSignupDecisionView(event, signup, decisionValue, {
              subject: subject || fallback.subject,
              body: emailBody || fallback.body,
            }, user, 'error|Subject and email body are required.'));
            return true;
          }

          const targetSignup = await prisma.eventSignup.findFirst({ where: { id: signupId, eventId } }).catch(() => null);
          if (!targetSignup) {
            redirect(res, `/admin/events/${eventId}/signups?msg=` + encodeURIComponent('error|Signup not found.'));
            return true;
          }

          let updated = null;
          try {
            updated = await prisma.eventSignup.update({
              where: { id: signupId },
              data: {
                status: isApprove ? 'approved' : 'rejected',
                approvedBy: user.email,
                approvedAt: new Date(),
                rejectionReason: reason,
              },
            });
          } catch (err) {
            console.error('Error updating signup status:', err.message);
            redirect(res, `/admin/events/${eventId}/signups?msg=` + encodeURIComponent('error|Could not update status.'));
            return true;
          }

          writeAudit(prisma, req, user, {
            action: isApprove ? 'approve' : 'reject',
            resourceType: 'eventSignup',
            resourceId: signupId,
            resourceLabel: `${updated?.name || ''} — ${event.title}`,
            locationSlug: event.location?.slug || null,
            details: { ...(reason ? { reason } : {}), emailSubject: subject, emailFrom: user.email },
          });

          // Best-effort email to the vendor with the decision, sent as the admin
          // who made the call when domain-wide delegation allows it.
          if (updated && updated.email) {
            try {
              await sendEmailViaGoogle({
                to: updated.email,
                subject,
                body: emailBody,
                from: user.email,
              }).catch((err) => console.warn('Vendor decision email failed:', err.message));
            } catch (err) {
              console.warn('Vendor decision email error:', err.message);
            }
          }

          redirect(res, `/admin/events/${eventId}/signups?msg=` + encodeURIComponent(isApprove ? 'approved' : 'rejected'));
          return true;
        }
      }

      const signups = await prisma.eventSignup.findMany({
        where: { eventId },
        orderBy: { createdAt: 'desc' },
      });
      sendHTML(res, 200, eventSignupsView(event, signups, user, flashMsg));
      return true;
    }

    // POST: update, delete, or section CRUD
    if (req.method === 'POST') {
      const body = await parseBody(req);
      const action = body._action || '';

      if (action === 'delete') {
        await prisma.event.delete({ where: { id: eventId } }).catch((err) => {
          console.error('Error deleting event:', err.message);
        });
        writeAudit(prisma, req, user, {
          action: 'delete', resourceType: 'event', resourceId: eventId,
          resourceLabel: event.title, locationSlug: event.location?.slug || null,
        });
        redirect(res, '/admin/events?msg=deleted');
        return true;
      }

      if (action === 'duplicate') {
        // Make a copy of this event with a fresh slug. Doesn't copy signups.
        const baseSlug = await ensureUniqueSlug(prisma, event.locationId, event.slug + '-copy');
        try {
          const copy = await prisma.event.create({
            data: {
              locationId: event.locationId,
              slug: baseSlug,
              title: event.title + ' (copy)',
              description: event.description,
              startDate: event.startDate,
              endDate: event.endDate,
              image: event.image,
              promoteFrom: event.promoteFrom,
              promoteUntil: event.promoteUntil,
              capacity: event.capacity,
              signupsEnabled: event.signupsEnabled,
              collectEmail: event.collectEmail,
              collectPhone: event.collectPhone,
              collectPartySize: event.collectPartySize,
              collectNotes: event.collectNotes,
              customQuestions: event.customQuestions || undefined,
              sections: event.sections || undefined,
              confirmationMessage: event.confirmationMessage,
              notifyEmail: event.notifyEmail,
              isActive: false, // Default new copies to inactive so they don't go live immediately
              isCancelled: false,
            },
          });
          writeAudit(prisma, req, user, {
            action: 'duplicate', resourceType: 'event', resourceId: copy.id,
            resourceLabel: copy.title, locationSlug: event.location?.slug || null,
            details: { copiedFromId: eventId },
          });
          redirect(res, `/admin/events/${copy.id}?msg=created`);
          return true;
        } catch (err) {
          console.error('Error duplicating event:', err.message || err);
          redirect(res, `/admin/events/${eventId}?msg=` + encodeURIComponent('error|' + (err.message || 'Could not duplicate.')));
          return true;
        }
      }

      // ─── Section actions ───
      if (action === 'addSection') {
        const newSection = buildSectionFromForm(body);
        if (!newSection) { redirect(res, `/admin/events/${eventId}?msg=error#sections`); return true; }
        const next = [...getSections(event), newSection];
        await prisma.event.update({ where: { id: eventId }, data: { sections: next } });
        redirect(res, `/admin/events/${eventId}?msg=saved#sections`);
        return true;
      }

      if (action === 'editSection') {
        const sectionId = String(body.sectionId || '');
        if (!sectionId) { redirect(res, `/admin/events/${eventId}#sections`); return true; }
        const sections = getSections(event);
        const idx = sections.findIndex(s => s.id === sectionId);
        if (idx === -1) { redirect(res, `/admin/events/${eventId}#sections`); return true; }
        const updated = buildSectionFromForm(body, sectionId);
        if (!updated) { redirect(res, `/admin/events/${eventId}?msg=error#sections`); return true; }
        const next = [...sections];
        next[idx] = updated;
        await prisma.event.update({ where: { id: eventId }, data: { sections: next } });
        redirect(res, `/admin/events/${eventId}?msg=saved#sections`);
        return true;
      }

      if (action === 'deleteSection') {
        const sectionId = String(body.sectionId || '');
        const next = getSections(event).filter(s => s.id !== sectionId);
        await prisma.event.update({ where: { id: eventId }, data: { sections: next } });
        redirect(res, `/admin/events/${eventId}?msg=deleted#sections`);
        return true;
      }

      if (action === 'duplicateSection') {
        const sectionId = String(body.sectionId || '');
        const sections = getSections(event);
        const idx = sections.findIndex(s => s.id === sectionId);
        if (idx === -1) { redirect(res, `/admin/events/${eventId}#sections`); return true; }
        const copy = cloneSection(sections[idx]);
        if (!copy) { redirect(res, `/admin/events/${eventId}?msg=error#sections`); return true; }
        const next = [...sections];
        next.splice(idx + 1, 0, copy);
        await prisma.event.update({ where: { id: eventId }, data: { sections: next } });
        redirect(res, `/admin/events/${eventId}?msg=saved#sections`);
        return true;
      }

      if (action === 'moveSection') {
        const sectionId = String(body.sectionId || '');
        const direction = String(body.direction || '');
        const sections = [...getSections(event)];
        const idx = sections.findIndex(s => s.id === sectionId);
        if (idx === -1) { redirect(res, `/admin/events/${eventId}#sections`); return true; }
        if (direction === 'top' && idx > 0) {
          const [item] = sections.splice(idx, 1);
          sections.unshift(item);
          await prisma.event.update({ where: { id: eventId }, data: { sections } });
        } else if (direction === 'bottom' && idx < sections.length - 1) {
          const [item] = sections.splice(idx, 1);
          sections.push(item);
          await prisma.event.update({ where: { id: eventId }, data: { sections } });
        } else {
          const swapWith = direction === 'up' ? idx - 1 : idx + 1;
          if (swapWith >= 0 && swapWith < sections.length) {
            [sections[idx], sections[swapWith]] = [sections[swapWith], sections[idx]];
            await prisma.event.update({ where: { id: eventId }, data: { sections } });
          }
        }
        redirect(res, `/admin/events/${eventId}?msg=reordered#sections`);
        return true;
      }

      // Default = update event metadata
      const editFlashError = (detail) => `/admin/events/${eventId}?msg=` + encodeURIComponent('error|' + detail);
      const title = normalizeText(body.title);
      if (!title) { redirect(res, editFlashError('Event name is required.')); return true; }

      const customQuestions = parseCustomQuestions(body);
      const newSlug = body.slug ? slugify(body.slug) : event.slug;
      const slug = newSlug !== event.slug
        ? await ensureUniqueSlug(prisma, event.locationId, newSlug || slugify(title), eventId)
        : event.slug;

      try {
        await prisma.event.update({
          where: { id: eventId },
          data: {
            title,
            slug,
            description: normalizeText(body.description) || null,
            startDate: parseDateTimeLocal(body.startDate) || event.startDate,
            endDate: parseDateTimeLocal(body.endDate),
            image: sanitizeImageSrc(body.image),
            promoteFrom: parseDateTimeLocal(body.promoteFrom),
            promoteUntil: parseDateTimeLocal(body.promoteUntil),
            capacity: parseCapacity(body.capacity),
            signupsEnabled: body.signupsEnabled === 'on',
            collectEmail: body.collectEmail === 'on',
            collectPhone: body.collectPhone === 'on',
            collectPartySize: body.collectPartySize === 'on',
            collectNotes: body.collectNotes === 'on',
            customQuestions: customQuestions.length > 0 ? customQuestions : null,
            confirmationMessage: normalizeText(body.confirmationMessage) || null,
            notifyEmail: normalizeText(body.notifyEmail) || null,
            isActive: body.isActive === 'on',
            isCancelled: body.isCancelled === 'on',
            signupType: SIGNUP_TYPES.includes(String(body.signupType)) ? String(body.signupType) : (event.signupType || 'guest'),
            isVendorEvent: String(body.signupType) === 'vendor',
            ticketUrl: normalizeTicketUrl(body.ticketUrl),
            ticketProvider: detectTicketProvider(body.ticketUrl),
            remindersEnabled: body.remindersEnabled === 'on',
            themeKey: normalizeThemeKey(body.themeKey),
          },
        });
        writeAudit(prisma, req, user, {
          action: 'update', resourceType: 'event', resourceId: eventId,
          resourceLabel: title, locationSlug: event.location?.slug || null,
        });
        redirect(res, `/admin/events/${eventId}?msg=saved`);
        return true;
      } catch (err) {
        console.error('Error updating event:', err.message || err);
        redirect(res, editFlashError(err.message || 'Database error.'));
        return true;
      }
    }

    // GET: show editor
    const flashMsg = getFlashMsg(req.url);
    const signupCount = await prisma.eventSignup.count({ where: { eventId } }).catch(() => 0);
    sendHTML(res, 200, eventEditor(event, locations, user, flashMsg, signupCount));
    return true;
  }

  return false;
}

module.exports = { handleAdminEvents };
