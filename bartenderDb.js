const { Pool } = require('pg');

const BARTENDER_DB_URL = process.env.BARTENDER_DB_URL || 'postgresql://bartenderuser:asswipe12@srv-captain--bartender:5432/postgres';

let pool = null;

function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: BARTENDER_DB_URL,
      max: 3,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
    pool.on('error', (err) => {
      console.error('Bartender DB pool error:', err.message);
    });
  }
  return pool;
}

async function findUserByEmail(email) {
  const db = getPool();
  const result = await db.query(
    'SELECT id, email, password, "firstName", "lastName", "isApproved" FROM "User" WHERE email = $1 LIMIT 1',
    [email.toLowerCase().trim()]
  );
  return result.rows[0] || null;
}

async function getUserRoles(userId) {
  const db = getPool();
  // Check bar support roles (company-wide access)
  const supportResult = await db.query(
    'SELECT role FROM "UserBarSupportRole" WHERE "userId" = $1',
    [userId]
  );
  const supportRoles = supportResult.rows.map(r => r.role);

  // Check location roles
  const locationResult = await db.query(
    'SELECT role FROM "UserLocation" WHERE "userId" = $1',
    [userId]
  );
  const locationRoles = locationResult.rows.map(r => r.role);

  return { supportRoles, locationRoles };
}

const ALLOWED_SUPPORT_ROLES = ['FOUNDER', 'MANAGING_DIRECTOR', 'HR', 'TRAINING', 'FINANCE', 'MARKETING'];
const ALLOWED_LOCATION_ROLES = ['ADMIN', 'GENERAL_MANAGER', 'HEAD_BARTENDER'];

async function getBarSupportEmails() {
  return getBarSupportEmailsForLocation(null);
}

function normalizeLocationSlug(slug) {
  return String(slug || '').trim().toLowerCase();
}

async function getLocationIdByMenuqrSlug(locationSlug) {
  const slug = normalizeLocationSlug(locationSlug);
  const locationName = SLUG_TO_LOCATION_NAME[slug];
  if (!locationName) return null;

  try {
    const db = getPool();
    const result = await db.query(
      'SELECT id FROM "Location" WHERE name = $1 AND "isActive" = true LIMIT 1',
      [locationName],
    );
    return result.rows[0]?.id || null;
  } catch (err) {
    console.warn('Error resolving bartender location id by slug:', err.message);
    return null;
  }
}

async function getBarSupportEmailsForLocation(locationSlug = null) {
  const db = getPool();
  const locationId = locationSlug ? await getLocationIdByMenuqrSlug(locationSlug) : null;
  const result = await db.query(
    `SELECT DISTINCT u.email
     FROM "User" u
     LEFT JOIN "UserBarSupportRole" s ON s."userId" = u.id
     LEFT JOIN "UserLocation" l ON l."userId" = u.id
     WHERE u."isApproved" = true
       AND (
         s.role = ANY($1::text[])
         OR (
           l.role = ANY($2::text[])
           AND ($3::text IS NULL OR l."locationId"::text = $3)
         )
       )
     ORDER BY u.email ASC`,
    [ALLOWED_SUPPORT_ROLES, ALLOWED_LOCATION_ROLES, locationId],
  );
  return (result.rows || []).map((row) => String(row.email || '').trim().toLowerCase()).filter(Boolean);
}

function hasAccess(roles) {
  const hasSupportRole = roles.supportRoles.some(r => ALLOWED_SUPPORT_ROLES.includes(r));
  const hasLocationRole = roles.locationRoles.some(r => ALLOWED_LOCATION_ROLES.includes(r));
  return hasSupportRole || hasLocationRole;
}

// Map menuqr slugs to bartender location names
const SLUG_TO_LOCATION_NAME = {
  'greensboro': 'Greensboro',
  'raleigh': 'Raleigh',
  'durham': 'Durham',
  'winston-salem': 'Winston-Salem',
  'cary': 'Cary',
  'charlotte': 'Charlotte',
  'wilmington': 'Wilmington',
};

async function getBreakEvenBottles(locationSlug) {
  try {
    const db = getPool();
    const locationName = SLUG_TO_LOCATION_NAME[locationSlug];
    if (!locationName) return { items: [], error: `Unknown location slug: ${locationSlug}` };

    // Get the bartender Location ID
    const locResult = await db.query(
      'SELECT id FROM "Location" WHERE name = $1 AND "isActive" = true LIMIT 1',
      [locationName]
    );
    if (locResult.rows.length === 0) return { items: [], error: `Active location not found: ${locationName}` };
    const locationId = locResult.rows[0].id;

    // Get active bottles for this Sunday only (nearest Sunday: today if Sun, else upcoming)
    const result = await db.query(`
      SELECT "productName", "bottleSize", cost, "sellPrice", notes, "weekStartDate"
      FROM "BreakEvenBottle"
      WHERE "locationId" = $1
        AND status = 'ACTIVE'
        AND "weekStartDate" = (
          CURRENT_DATE + ((7 - EXTRACT(DOW FROM CURRENT_DATE)::int) % 7) * INTERVAL '1 day'
        )::date
      ORDER BY "productName" ASC
    `, [locationId]);

    return {
      items: result.rows.map(row => ({
      name: row.productName,
      bottleSize: row.bottleSize ? `${parseFloat(row.bottleSize)}ml` : null,
      costPerOz: row.sellPrice ? `$${parseFloat(row.sellPrice).toFixed(0)}/oz` : null,
      bottleCost: row.cost ? `$${parseFloat(row.cost).toFixed(0)}` : null,
      notes: row.notes || null,
      weekStartDate: row.weekStartDate,
      })),
      error: null,
    };
  } catch (err) {
    console.error('Error fetching break-even bottles:', err.message);
    return { items: [], error: err.message };
  }
}

async function getOnTap(locationSlug) {
  try {
    const db = getPool();
    const locationName = SLUG_TO_LOCATION_NAME[locationSlug];
    if (!locationName) return { items: [], error: `Unknown location slug: ${locationSlug}` };

    const locResult = await db.query(
      'SELECT id FROM "Location" WHERE name = $1 AND "isActive" = true LIMIT 1',
      [locationName]
    );
    if (locResult.rows.length === 0) return { items: [], error: `Active location not found: ${locationName}` };
    const locationId = locResult.rows[0].id;

    const result = await db.query(`
      SELECT
        tap."tapNumber", tap."tapName", tap."tapType",
        keg."beerName", keg.brewery, keg.style, keg.abv, keg.ibu,
        keg."pricePerServing", keg."servingSizeOz", keg.notes
      FROM "Tap" tap
      LEFT JOIN "Keg" keg ON tap."currentKegId" = keg.id
      WHERE tap."locationId" = $1 AND tap."isActive" = true
      ORDER BY COALESCE(tap."displayOrder", tap."tapNumber"), tap."tapNumber"
    `, [locationId]);

    return {
      items: result.rows.map(row => ({
      tapNumber: row.tapNumber,
      tapName: row.tapName,
      tapType: row.tapType,
      beerName: row.beerName || null,
      brewery: row.brewery || null,
      style: row.style || null,
      abv: row.abv ? parseFloat(row.abv) : null,
      ibu: row.ibu || null,
      price: row.pricePerServing ? `$${parseFloat(row.pricePerServing).toFixed(0)}` : null,
      servingSize: row.servingSizeOz ? `${parseFloat(row.servingSizeOz)}oz` : null,
      notes: row.notes || null,
      })),
      error: null,
    };
  } catch (err) {
    console.error('Error fetching on-tap data:', err.message);
    return { items: [], error: err.message };
  }
}

async function getSpiritCategories() {
  try {
    const db = getPool();
    const [catResult, styleResult] = await Promise.all([
      db.query('SELECT name FROM "SpiritCategoryRef" ORDER BY name ASC'),
      db.query('SELECT DISTINCT style FROM "SpiritDetail" WHERE style IS NOT NULL AND style != \'\' ORDER BY style ASC'),
    ]);
    return {
      categories: catResult.rows.map(r => r.name),
      styles: styleResult.rows.map(r => r.style),
    };
  } catch (err) {
    console.warn('Error fetching spirit categories:', err.message);
    return { categories: [], styles: [] };
  }
}

async function getExternalLocationId(db, locationSlug) {
  const locationName = SLUG_TO_LOCATION_NAME[normalizeLocationSlug(locationSlug)];
  if (!locationName) return null;
  const locResult = await db.query(
    'SELECT id FROM "Location" WHERE name = $1 AND "isActive" = true LIMIT 1',
    [locationName],
  );
  if (locResult.rows.length === 0) return null;
  const locationId = locResult.rows[0].id;
  const lemResult = await db.query(
    'SELECT "externalLocationId" FROM "LocationExternalMapping" WHERE "locationId" = $1 AND source = \'dram_pricing\' LIMIT 1',
    [locationId],
  );
  return lemResult.rows[0] ? lemResult.rows[0].externalLocationId : null;
}

async function getSpiritCatalog(locationSlug, filters = {}) {
  try {
    const db = getPool();
    const extLocId = await getExternalLocationId(db, locationSlug);
    if (extLocId == null) return [];

    const conditions = [
      'sp."isActive" = true',
      'slp."isActive" = true',
      'slp."locationExternalId" = $1',
    ];
    const params = [extLocId];
    let paramIdx = 2;

    if (filters.category) {
      conditions.push(`sp."primaryCategory" = $${paramIdx}`);
      params.push(filters.category);
      paramIdx++;
    }
    if (filters.priceMin != null) {
      conditions.push(`slp."oneOzPrice" >= $${paramIdx}`);
      params.push(filters.priceMin);
      paramIdx++;
    }
    if (filters.priceMax != null) {
      conditions.push(`slp."oneOzPrice" <= $${paramIdx}`);
      params.push(filters.priceMax);
      paramIdx++;
    }
    if (filters.style) {
      conditions.push(`sd.style = $${paramIdx}`);
      params.push(filters.style);
      paramIdx++;
    }

    const result = await db.query(`
      SELECT
        sp."productId", sp.name, sp."primaryCategory",
        sd.style, sd.region,
        slp."oneOzPrice", slp."twoOzPrice",
        sp."imageUrl"
      FROM "SpiritProduct" sp
      JOIN "SpiritDetail" sd ON sd."productId" = sp."productId"
      JOIN "SpiritLocationPrice" slp ON slp."productId" = sp."productId"
      WHERE ${conditions.join(' AND ')}
      ORDER BY sp."primaryCategory" ASC, sp.name ASC
    `, params);

    return result.rows.map(r => ({
      productId: r.productId,
      name: r.name,
      primaryCategory: r.primaryCategory,
      style: r.style || null,
      region: r.region || null,
      oneOzPrice: r.oneOzPrice ? parseFloat(r.oneOzPrice) : null,
      twoOzPrice: r.twoOzPrice ? parseFloat(r.twoOzPrice) : null,
      imageUrl: r.imageUrl || null,
    }));
  } catch (err) {
    console.warn('Error fetching spirit catalog:', err.message);
    return [];
  }
}

async function getHalfPriceSpirits(locationSlug, config) {
  try {
    if (!config) return { items: [], error: null };
    const db = getPool();
    const extLocId = await getExternalLocationId(db, locationSlug);
    if (extLocId == null) return { items: [], error: `Could not resolve location: ${locationSlug}` };

    const baseConditions = [
      'sp."isActive" = true',
      'slp."isActive" = true',
      'slp."locationExternalId" = $1',
    ];
    const params = [extLocId];
    let paramIdx = 2;

    // Picks are the source of truth for what guests see
    const hasPicks = config.picks && config.picks.length > 0;
    if (!hasPicks) {
      return { items: [], error: null };
    }

    const picksParamRef = `$${paramIdx}::int[]`;
    params.push(config.picks.map(Number));
    paramIdx++;

    // Build excludes clause
    let excludeClause = '';
    if (config.excludes && config.excludes.length > 0) {
      excludeClause = ` AND sp."productId" != ALL($${paramIdx}::int[])`;
      params.push(config.excludes.map(Number));
      paramIdx++;
    }

    const selectionClause = `sp."productId" = ANY(${picksParamRef})`;

    const result = await db.query(`
      SELECT
        sp."productId", sp.name, sp."primaryCategory",
        sd.style, sd.region,
        slp."oneOzPrice", slp."twoOzPrice", slp."oneHalfOzPrice",
        sp."imageUrl"
      FROM "SpiritProduct" sp
      JOIN "SpiritDetail" sd ON sd."productId" = sp."productId"
      JOIN "SpiritLocationPrice" slp ON slp."productId" = sp."productId"
      WHERE ${baseConditions.join(' AND ')}
        AND ${selectionClause}${excludeClause}
      ORDER BY sp."primaryCategory" ASC, sp.name ASC
    `, params);

    return {
      items: result.rows.map(r => ({
        productId: r.productId,
        name: r.name,
        primaryCategory: r.primaryCategory,
        style: r.style || null,
        region: r.region || null,
        oneOzPrice: r.oneOzPrice ? parseFloat(r.oneOzPrice) : null,
        twoOzPrice: r.twoOzPrice ? parseFloat(r.twoOzPrice) : null,
        oneHalfOzPrice: r.oneHalfOzPrice ? parseFloat(r.oneHalfOzPrice) : null,
        imageUrl: r.imageUrl || null,
      })),
      error: null,
    };
  } catch (err) {
    console.error('Error fetching half-price spirits:', err.message);
    return { items: [], error: err.message };
  }
}

module.exports = {
  findUserByEmail,
  getUserRoles,
  hasAccess,
  getBreakEvenBottles,
  getOnTap,
  getBarSupportEmails,
  getBarSupportEmailsForLocation,
  getSpiritCategories,
  getSpiritCatalog,
  getHalfPriceSpirits,
};
