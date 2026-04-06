const { sendHTML, parseBody, redirect, getFlashMsg } = require('../helpers');
const { requireAuth } = require('../auth');
const {
  eventsList,
  eventEditor,
  eventSignupsView,
} = require('../views/adminEventsViews');

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

function parseDateTimeLocal(value) {
  if (!value) return null;
  // `datetime-local` inputs return "YYYY-MM-DDTHH:MM" (local time, no timezone)
  // Interpret as local time on the server.
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseCapacity(value) {
  if (value == null || value === '') return null;
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseCustomQuestions(body) {
  // Expect arrays: custom_label[], custom_type[], custom_required[]
  const labels = Array.isArray(body['custom_label']) ? body['custom_label'] : (body['custom_label'] ? [body['custom_label']] : []);
  const types = Array.isArray(body['custom_type']) ? body['custom_type'] : (body['custom_type'] ? [body['custom_type']] : []);
  // Required is tricky with checkboxes — use individual indexed names
  const questions = [];
  for (let i = 0; i < labels.length; i++) {
    const label = normalizeText(labels[i]);
    if (!label) continue;
    const type = (types[i] || 'text').toLowerCase();
    const validType = ['text', 'textarea', 'number', 'yesno'].includes(type) ? type : 'text';
    const required = body[`custom_required_${i}`] === 'on';
    questions.push({
      id: 'q_' + i + '_' + Math.random().toString(36).slice(2, 8),
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

  const locations = await prisma.location.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
    select: { id: true, slug: true, name: true },
  }).catch(() => []);

  // ─── List all events ───
  if (pathname === '/admin/events') {
    const flashMsg = getFlashMsg(req.url);
    const events = await prisma.event.findMany({
      orderBy: [{ startDate: 'desc' }],
      include: {
        location: { select: { slug: true, name: true } },
        _count: { select: { signups: true } },
      },
    }).catch(async (err) => {
      console.warn('Events list include failed, falling back:', err.message);
      const rows = await prisma.event.findMany({ orderBy: [{ startDate: 'desc' }] }).catch(() => []);
      for (const ev of rows) {
        const loc = locations.find(l => l.id === ev.locationId);
        ev.location = loc ? { slug: loc.slug, name: loc.name } : { slug: '', name: '' };
        ev._count = { signups: await prisma.eventSignup.count({ where: { eventId: ev.id } }).catch(() => 0) };
      }
      return rows;
    });

    sendHTML(res, 200, eventsList(events, user, flashMsg));
    return true;
  }

  // ─── New event form / create ───
  if (pathname === '/admin/events/new') {
    if (req.method === 'POST') {
      const body = await parseBody(req);
      const title = normalizeText(body.title);
      const locationId = normalizeText(body.locationId);
      if (!title || !locationId) {
        redirect(res, '/admin/events/new?msg=error');
        return true;
      }

      const baseSlug = slugify(body.slug || title) || 'event';
      const uniqueSlug = await ensureUniqueSlug(prisma, locationId, baseSlug);

      const startDate = parseDateTimeLocal(body.startDate);
      if (!startDate) {
        redirect(res, '/admin/events/new?msg=error');
        return true;
      }

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
            image: normalizeText(body.image) || null,
            promoteFrom: parseDateTimeLocal(body.promoteFrom),
            promoteUntil: parseDateTimeLocal(body.promoteUntil),
            capacity: parseCapacity(body.capacity),
            collectEmail: body.collectEmail === 'on',
            collectPhone: body.collectPhone === 'on',
            collectPartySize: body.collectPartySize === 'on',
            collectNotes: body.collectNotes === 'on',
            customQuestions: customQuestions.length > 0 ? customQuestions : null,
            confirmationMessage: normalizeText(body.confirmationMessage) || null,
            notifyEmail: normalizeText(body.notifyEmail) || null,
            isActive: body.isActive !== 'off',
            isCancelled: false,
          },
        });
        redirect(res, `/admin/events/${created.id}?msg=created`);
        return true;
      } catch (err) {
        console.error('Error creating event:', err.message || err);
        redirect(res, '/admin/events/new?msg=error');
        return true;
      }
    }

    const flashMsg = getFlashMsg(req.url);
    sendHTML(res, 200, eventEditor(null, locations, user, flashMsg));
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
          ...customDefs.map(q => (answers[q.id] == null ? '' : answers[q.id])),
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

      // Handle delete signup POST
      if (req.method === 'POST') {
        const body = await parseBody(req);
        if (body._action === 'deleteSignup' && body.signupId) {
          await prisma.eventSignup.delete({ where: { id: String(body.signupId) } }).catch(() => null);
          redirect(res, `/admin/events/${eventId}/signups?msg=deleted`);
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

    // POST: update or delete
    if (req.method === 'POST') {
      const body = await parseBody(req);
      const action = body._action || '';

      if (action === 'delete') {
        await prisma.event.delete({ where: { id: eventId } }).catch((err) => {
          console.error('Error deleting event:', err.message);
        });
        redirect(res, '/admin/events?msg=deleted');
        return true;
      }

      // Default = update
      const title = normalizeText(body.title);
      if (!title) { redirect(res, `/admin/events/${eventId}?msg=error`); return true; }

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
            image: normalizeText(body.image) || null,
            promoteFrom: parseDateTimeLocal(body.promoteFrom),
            promoteUntil: parseDateTimeLocal(body.promoteUntil),
            capacity: parseCapacity(body.capacity),
            collectEmail: body.collectEmail === 'on',
            collectPhone: body.collectPhone === 'on',
            collectPartySize: body.collectPartySize === 'on',
            collectNotes: body.collectNotes === 'on',
            customQuestions: customQuestions.length > 0 ? customQuestions : null,
            confirmationMessage: normalizeText(body.confirmationMessage) || null,
            notifyEmail: normalizeText(body.notifyEmail) || null,
            isActive: body.isActive === 'on',
            isCancelled: body.isCancelled === 'on',
          },
        });
        redirect(res, `/admin/events/${eventId}?msg=saved`);
        return true;
      } catch (err) {
        console.error('Error updating event:', err.message || err);
        redirect(res, `/admin/events/${eventId}?msg=error`);
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
