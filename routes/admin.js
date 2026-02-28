const { sendHTML, parseBody, redirect, unauthorized, isAdmin, fallbackLocations, getLocations } = require('../helpers');
const { authenticate, createSession, destroySession, requireAuth } = require('../auth');
const { loginPage } = require('../views/adminLayout');

async function handleAdmin(req, res, pathname, prisma) {
  // ─── Login ───
  if (pathname === '/admin/login') {
    if (req.method === 'POST') {
      const body = await parseBody(req);
      const result = await authenticate(body.email, body.password);
      if (result.error) {
        sendHTML(res, 200, loginPage(result.error));
        return true;
      }
      createSession(res, result.user);
      redirect(res, '/admin/specials');
      return true;
    }
    sendHTML(res, 200, loginPage());
    return true;
  }

  // ─── Logout ───
  if (pathname === '/admin/logout') {
    destroySession(req, res);
    redirect(res, '/admin/login');
    return true;
  }

  // ─── Existing admin routes (Basic Auth) ───
  if (pathname === '/admin') {
    if (!isAdmin(req)) return unauthorized(res) || true;
    const locs = await getLocations(prisma);
    const list = locs.map(l => `<li><a href="/admin/location/${l.slug}">${l.name}</a></li>`).join('');
    sendHTML(res, 200, `<h1>Admin: Locations</h1><p><a href="/admin/seed">Seed default locations</a></p><ul>${list}</ul>`);
    return true;
  }

  if (pathname === '/admin/seed') {
    if (!isAdmin(req)) return unauthorized(res) || true;
    if (!prisma) { sendHTML(res, 500, '<p>DB not available</p>'); return true; }
    for (const l of fallbackLocations) {
      await prisma.location.upsert({
        where: { slug: l.slug },
        update: {
          name: l.name, city: l.city, state: l.state, address: l.address || null,
          zipCode: l.zipCode || null, phone: l.phone || null, email: l.email || null,
          specialText: l.specialText || null, hours: l.hours || {}, features: l.features || [], isActive: true,
        },
        create: {
          name: l.name, slug: l.slug, city: l.city, state: l.state, address: l.address || null,
          zipCode: l.zipCode || null, phone: l.phone || null, email: l.email || null,
          specialText: l.specialText || null, hours: l.hours || {}, features: l.features || [], isActive: true,
        }
      });
    }
    sendHTML(res, 200, '<p>Seed complete</p><p><a href="/admin">Back to Admin</a></p>');
    return true;
  }

  if (pathname.startsWith('/admin/location/')) {
    if (!isAdmin(req)) return unauthorized(res) || true;
    const slug = pathname.split('/').pop();
    let loc = null;
    if (prisma) {
      loc = await prisma.location.findUnique({ where: { slug } }).catch(() => null);
    }
    if (!loc) { sendHTML(res, 404, '<h1>Not found</h1>'); return true; }

    if (req.method === 'POST') {
      const body = await parseBody(req);
      await prisma.location.update({
        where: { slug },
        data: {
          name: body.name || loc.name,
          address: body.address || null,
          city: body.city || loc.city,
          state: body.state || loc.state,
          zipCode: body.zipCode || null,
          email: body.email || null,
          phone: body.phone || null,
          specialText: body.specialText || null,
          menuUrl: body.menuUrl || null,
          features: (body.features || '').split(',').map(s => s.trim()).filter(Boolean),
          hours: (() => { try { return JSON.parse(body.hours || '{}'); } catch { return loc.hours; } })(),
          links: (() => { try { return JSON.parse(body.links || '[]'); } catch { return loc.links; } })(),
        }
      });
      sendHTML(res, 200, `<p>Saved</p><p><a href="/admin/location/${slug}">Back</a> | <a href="/${slug}">View</a></p>`);
      return true;
    }

    const form = `
      <h1>Edit ${loc.name}</h1>
      <form method="POST">
        <label>Name <input name="name" value="${loc.name}" /></label><br/>
        <label>Slug <input name="slug" value="${loc.slug}" disabled /></label><br/>
        <label>Address <input name="address" value="${loc.address || ''}" /></label><br/>
        <label>City <input name="city" value="${loc.city}" /></label><br/>
        <label>State <input name="state" value="${loc.state}" /></label><br/>
        <label>Zip <input name="zipCode" value="${loc.zipCode || ''}" /></label><br/>
        <label>Email <input name="email" value="${loc.email || ''}" /></label><br/>
        <label>Phone <input name="phone" value="${loc.phone || ''}" /></label><br/>
        <label>Special Text <input name="specialText" value="${loc.specialText || ''}" /></label><br/>
        <label>Menu URL <input name="menuUrl" value="${loc.menuUrl || ''}" /></label><br/>
        <label>Features (comma-separated)<br/>
          <input name="features" value="${(loc.features || []).join(', ')}" />
        </label><br/>
        <label>Link Buttons (JSON array of {label,url})<br/>
          <textarea name="links" rows="10" cols="80">${JSON.stringify(loc.links || [], null, 2)}</textarea>
        </label><br/>
        <label>Hours (JSON)<br/>
          <textarea name="hours" rows="8" cols="60">${JSON.stringify(loc.hours || {}, null, 2)}</textarea>
        </label><br/>
        <button type="submit">Save</button>
      </form>
      <p><a href="/admin">Back to list</a></p>
    `;
    sendHTML(res, 200, form);
    return true;
  }

  return false;
}

module.exports = { handleAdmin };
