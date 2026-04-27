const { sendHTML, parseBody, redirect, getFlashMsg } = require('../helpers');
const { requireAuth, isCompanyWide, getUserLocationSlugs, canAccessLocation } = require('../auth');
const { menuLocationsList, menuLocationEditor } = require('../views/adminMenuViews');
const { sanitizeImageSrc } = require('../views/imageUploadWidget');
const { writeAudit } = require('../auditLog');

function parsePriceInput(value) {
  if (value == null || value === '') return null;
  const str = String(value).replace(/[$,\s]/g, '');
  if (!str) return null;
  const num = Number(str);
  if (!Number.isFinite(num) || num < 0) return null;
  // Clamp to 2 decimal places
  return Math.round(num * 100) / 100;
}

function normalizeText(value) {
  return String(value || '').trim();
}

async function swapOrder(prisma, model, a, b, orderField = 'displayOrder') {
  // Swap two records' displayOrder values atomically
  const tempOrder = a[orderField];
  await prisma[model].update({ where: { id: a.id }, data: { [orderField]: b[orderField] } });
  await prisma[model].update({ where: { id: b.id }, data: { [orderField]: tempOrder } });
}

async function handleAdminMenu(req, res, pathname, prisma) {
  if (!pathname.startsWith('/admin/menu')) return false;

  const user = requireAuth(req, res);
  if (!user) { redirect(res, '/admin/login'); return true; }
  if (!prisma) { sendHTML(res, 500, '<p>DB not available</p>'); return true; }

  const userIsCompanyWide = isCompanyWide(user);
  const userSlugs = userIsCompanyWide ? null : getUserLocationSlugs(user);

  // ─── List locations ───
  if (pathname === '/admin/menu') {
    const flashMsg = getFlashMsg(req.url);
    const where = { isActive: true };
    if (!userIsCompanyWide) {
      where.slug = { in: userSlugs.length > 0 ? userSlugs : ['__none__'] };
    }
    let locations;
    try {
      locations = await prisma.location.findMany({
        where,
        orderBy: { name: 'asc' },
        include: { _count: { select: { menuCategories: true } } },
      });
    } catch (err) {
      // Fall back: plain query + manual per-location counts
      console.warn('Admin menu _count include failed, falling back:', err.message);
      locations = await prisma.location.findMany({
        where,
        orderBy: { name: 'asc' },
      }).catch(() => []);
      for (const loc of locations) {
        loc._count = {
          menuCategories: await prisma.menuCategory.count({ where: { locationId: loc.id } }).catch(() => 0),
        };
      }
    }
    sendHTML(res, 200, menuLocationsList(locations, user, flashMsg));
    return true;
  }

  // ─── Per-location editor ───
  const locMatch = pathname.match(/^\/admin\/menu\/([a-z0-9-]+)$/);
  if (locMatch) {
    const slug = locMatch[1];
    if (!canAccessLocation(user, slug)) { redirect(res, '/admin/menu'); return true; }
    const location = await prisma.location.findUnique({ where: { slug } }).catch(() => null);
    if (!location) { sendHTML(res, 404, '<h1>Location not found</h1>'); return true; }

    if (req.method === 'POST') {
      const body = await parseBody(req);
      const action = body._action || '';

      const flashError = (detail) => `/admin/menu/${slug}?msg=${encodeURIComponent('error|' + detail)}`;

      try {
        if (action === 'addCategory') {
          const name = normalizeText(body.name);
          if (!name) { redirect(res, flashError('Category name is required.')); return true; }
          const max = await prisma.menuCategory.findFirst({
            where: { locationId: location.id },
            orderBy: { displayOrder: 'desc' },
            select: { displayOrder: true },
          });
          const nextOrder = max ? max.displayOrder + 1 : 0;
          const created = await prisma.menuCategory.create({
            data: {
              locationId: location.id,
              name,
              description: normalizeText(body.description) || null,
              displayOrder: nextOrder,
              isActive: true,
            },
          });
          writeAudit(prisma, req, user, {
            action: 'create', resourceType: 'menu_category', resourceId: created.id,
            resourceLabel: created.name, locationSlug: slug,
          });
          redirect(res, `/admin/menu/${slug}?msg=saved`);
          return true;
        }

        if (action === 'editCategory') {
          const categoryId = String(body.categoryId || '');
          const name = normalizeText(body.name);
          if (!categoryId || !name) { redirect(res, flashError('Category name is required.')); return true; }
          await prisma.menuCategory.update({
            where: { id: categoryId },
            data: {
              name,
              description: normalizeText(body.description) || null,
              isActive: body.isActive === 'on',
            },
          });
          writeAudit(prisma, req, user, {
            action: 'update', resourceType: 'menu_category', resourceId: categoryId,
            resourceLabel: name, locationSlug: slug,
          });
          redirect(res, `/admin/menu/${slug}?msg=saved`);
          return true;
        }

        if (action === 'deleteCategory') {
          const categoryId = String(body.categoryId || '');
          if (categoryId) {
            const cat = await prisma.menuCategory.findUnique({ where: { id: categoryId } }).catch(() => null);
            // Cascade will remove items via Prisma relation
            await prisma.menuCategory.delete({ where: { id: categoryId } });
            writeAudit(prisma, req, user, {
              action: 'delete', resourceType: 'menu_category', resourceId: categoryId,
              resourceLabel: cat ? cat.name : null, locationSlug: slug,
            });
          }
          redirect(res, `/admin/menu/${slug}?msg=deleted`);
          return true;
        }

        if (action === 'moveCategory') {
          const categoryId = String(body.categoryId || '');
          const direction = String(body.direction || '');
          const current = await prisma.menuCategory.findUnique({ where: { id: categoryId } });
          if (!current || current.locationId !== location.id) {
            redirect(res, `/admin/menu/${slug}`); return true;
          }
          const neighbor = await prisma.menuCategory.findFirst({
            where: {
              locationId: location.id,
              displayOrder: direction === 'up'
                ? { lt: current.displayOrder }
                : { gt: current.displayOrder },
            },
            orderBy: { displayOrder: direction === 'up' ? 'desc' : 'asc' },
          });
          if (neighbor) {
            await swapOrder(prisma, 'menuCategory', current, neighbor);
          }
          redirect(res, `/admin/menu/${slug}?msg=reordered`);
          return true;
        }

        if (action === 'addItem') {
          const categoryId = String(body.categoryId || '');
          const name = normalizeText(body.name);
          if (!categoryId || !name) { redirect(res, flashError('Item name is required.')); return true; }
          const category = await prisma.menuCategory.findUnique({ where: { id: categoryId } });
          if (!category || category.locationId !== location.id) {
            redirect(res, `/admin/menu/${slug}`); return true;
          }
          const max = await prisma.menuItem.findFirst({
            where: { categoryId },
            orderBy: { displayOrder: 'desc' },
            select: { displayOrder: true },
          });
          const nextOrder = max ? max.displayOrder + 1 : 0;
          const createdItem = await prisma.menuItem.create({
            data: {
              categoryId,
              name,
              description: normalizeText(body.description) || null,
              price: parsePriceInput(body.price),
              image: sanitizeImageSrc(body.image),
              isFeatured: body.isFeatured === 'on',
              isAvailable: true,
              displayOrder: nextOrder,
            },
          });
          writeAudit(prisma, req, user, {
            action: 'create', resourceType: 'menu_item', resourceId: createdItem.id,
            resourceLabel: createdItem.name, locationSlug: slug,
          });
          redirect(res, `/admin/menu/${slug}?msg=saved`);
          return true;
        }

        if (action === 'editItem') {
          const itemId = String(body.itemId || '');
          const name = normalizeText(body.name);
          if (!itemId || !name) { redirect(res, flashError('Item name is required.')); return true; }
          // Verify item belongs to this location
          const item = await prisma.menuItem.findUnique({
            where: { id: itemId },
            include: { category: true },
          });
          if (!item || item.category.locationId !== location.id) {
            redirect(res, `/admin/menu/${slug}`); return true;
          }
          await prisma.menuItem.update({
            where: { id: itemId },
            data: {
              name,
              description: normalizeText(body.description) || null,
              price: parsePriceInput(body.price),
              image: sanitizeImageSrc(body.image),
              isFeatured: body.isFeatured === 'on',
              isAvailable: body.isAvailable === 'on',
            },
          });
          writeAudit(prisma, req, user, {
            action: 'update', resourceType: 'menu_item', resourceId: itemId,
            resourceLabel: name, locationSlug: slug,
          });
          redirect(res, `/admin/menu/${slug}?msg=saved`);
          return true;
        }

        if (action === 'deleteItem') {
          const itemId = String(body.itemId || '');
          if (itemId) {
            const item = await prisma.menuItem.findUnique({
              where: { id: itemId },
              include: { category: true },
            });
            if (item && item.category.locationId === location.id) {
              await prisma.menuItem.delete({ where: { id: itemId } });
              writeAudit(prisma, req, user, {
                action: 'delete', resourceType: 'menu_item', resourceId: itemId,
                resourceLabel: item.name, locationSlug: slug,
              });
            }
          }
          redirect(res, `/admin/menu/${slug}?msg=deleted`);
          return true;
        }

        if (action === 'duplicateItem') {
          const itemId = String(body.itemId || '');
          const original = await prisma.menuItem.findUnique({
            where: { id: itemId },
            include: { category: true },
          });
          if (!original || original.category.locationId !== location.id) {
            redirect(res, `/admin/menu/${slug}`); return true;
          }
          const max = await prisma.menuItem.findFirst({
            where: { categoryId: original.categoryId },
            orderBy: { displayOrder: 'desc' },
            select: { displayOrder: true },
          });
          const nextOrder = (max ? max.displayOrder : -1) + 1;
          await prisma.menuItem.create({
            data: {
              categoryId: original.categoryId,
              name: `${original.name} (copy)`,
              description: original.description,
              price: original.price,
              image: original.image,
              isFeatured: original.isFeatured,
              isAvailable: original.isAvailable,
              displayOrder: nextOrder,
            },
          });
          redirect(res, `/admin/menu/${slug}?msg=created`);
          return true;
        }

        if (action === 'moveItem') {
          const itemId = String(body.itemId || '');
          const direction = String(body.direction || '');
          const current = await prisma.menuItem.findUnique({
            where: { id: itemId },
            include: { category: true },
          });
          if (!current || current.category.locationId !== location.id) {
            redirect(res, `/admin/menu/${slug}`); return true;
          }
          const neighbor = await prisma.menuItem.findFirst({
            where: {
              categoryId: current.categoryId,
              displayOrder: direction === 'up'
                ? { lt: current.displayOrder }
                : { gt: current.displayOrder },
            },
            orderBy: { displayOrder: direction === 'up' ? 'desc' : 'asc' },
          });
          if (neighbor) {
            await swapOrder(prisma, 'menuItem', current, neighbor);
          }
          redirect(res, `/admin/menu/${slug}?msg=reordered`);
          return true;
        }

        // Unknown action
        redirect(res, `/admin/menu/${slug}`);
        return true;
      } catch (err) {
        console.error('Admin menu action error:', err.message || err);
        redirect(res, flashError(err.message || 'Database error.'));
        return true;
      }
    }

    // GET: load menu and render editor
    const categories = await prisma.menuCategory.findMany({
      where: { locationId: location.id },
      include: {
        items: { orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }] },
      },
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
    });
    const flashMsg = getFlashMsg(req.url);
    sendHTML(res, 200, menuLocationEditor(location, categories, user, flashMsg));
    return true;
  }

  return false;
}

module.exports = { handleAdminMenu };
