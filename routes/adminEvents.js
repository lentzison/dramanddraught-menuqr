const { sendHTML, parseBody, redirect, getFlashMsg } = require('../helpers');
const { requireAuth } = require('../auth');
const {
  eventsList,
  eventEditor,
  eventSignupsView,
} = require('../views/adminEventsViews');
const { sanitizeImageSrc } = require('../views/imageUploadWidget');

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

// Build a section object from form fields based on its type. Generates a fresh id when not provided.
function buildSectionFromForm(body, existingId = null) {
  const type = String(body.type || 'text').toLowerCase();
  const id = existingId || `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
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
      const flashError = (detail) => '/admin/events/new?msg=' + encodeURIComponent('error|' + detail);
      const title = normalizeText(body.title);
      const locationId = normalizeText(body.locationId);
      if (!title) { redirect(res, flashError('Event name is required.')); return true; }
      if (!locationId) { redirect(res, flashError('Please pick a location.')); return true; }

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
            signupsEnabled: body.signupsEnabled !== 'off',
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
        redirect(res, flashError(err.message || 'Database error.'));
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

    // POST: update, delete, or section CRUD
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

      if (action === 'moveSection') {
        const sectionId = String(body.sectionId || '');
        const direction = String(body.direction || '');
        const sections = [...getSections(event)];
        const idx = sections.findIndex(s => s.id === sectionId);
        if (idx === -1) { redirect(res, `/admin/events/${eventId}#sections`); return true; }
        const swapWith = direction === 'up' ? idx - 1 : idx + 1;
        if (swapWith >= 0 && swapWith < sections.length) {
          [sections[idx], sections[swapWith]] = [sections[swapWith], sections[idx]];
          await prisma.event.update({ where: { id: eventId }, data: { sections } });
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
          },
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
