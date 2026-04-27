const { Pool } = require('pg');
const { buildGuestBottleNotesForCatalog } = require('./helpers');

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

  // Check location roles. Join Location so we can resolve back to a menuqr slug.
  const locationResult = await db.query(
    `SELECT ul.role, ul."locationId", l.name AS "locationName"
     FROM "UserLocation" ul
     JOIN "Location" l ON l.id = ul."locationId"
     WHERE ul."userId" = $1`,
    [userId]
  );
  const locations = locationResult.rows.map(row => ({
    role: row.role,
    locationId: row.locationId,
    locationName: row.locationName,
    slug: LOCATION_NAME_TO_SLUG[row.locationName] || null,
  }));
  const locationRoles = locations.map(l => l.role);

  return { supportRoles, locationRoles, locations };
}

const ALLOWED_SUPPORT_ROLES = ['FOUNDER', 'MANAGING_DIRECTOR', 'HR', 'TRAINING', 'FINANCE', 'MARKETING'];
const ALLOWED_LOCATION_ROLES = ['ADMIN', 'GENERAL_MANAGER', 'HEAD_BARTENDER'];
const FRIDAY_FLIGHT_DISCOUNT = 5;
const BARTENDER_FLIGHT_BUILDER_URL = process.env.BARTENDER_FLIGHT_BUILDER_URL || 'https://bartender.dramanddraught.com/admin/spirits/flights';

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

// Reverse: bartender Location.name -> menuqr slug
const LOCATION_NAME_TO_SLUG = Object.entries(SLUG_TO_LOCATION_NAME)
  .reduce((acc, [slug, name]) => { acc[name] = slug; return acc; }, {});

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

function getEasternDate() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
}

function getUpcomingFridayDate(from = getEasternDate()) {
  const base = new Date(from);
  base.setHours(0, 0, 0, 0);
  const day = base.getDay();
  const daysUntilFriday = day === 5 ? 0 : ((5 - day + 7) % 7);
  base.setDate(base.getDate() + daysUntilFriday);
  return base;
}

function toDateOnlySql(date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizeDbDate(value) {
  if (!value) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function formatCurrency(value) {
  const numeric = typeof value === 'number' ? value : parseFloat(value);
  if (!Number.isFinite(numeric)) return null;
  const fixed = numeric % 1 === 0 ? numeric.toFixed(0) : numeric.toFixed(2);
  return `$${fixed}`;
}

function parseMaybeNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const numeric = typeof value === 'number' ? value : parseFloat(String(value));
  return Number.isFinite(numeric) ? numeric : null;
}

function buildSpiritFlightBuilderUrl(locationId = '', flightDate = '') {
  const params = new URLSearchParams();
  if (locationId) params.set('locationId', locationId);
  if (flightDate) params.set('flightDate', flightDate);
  const query = params.toString();
  return `${BARTENDER_FLIGHT_BUILDER_URL}${query ? `?${query}` : ''}`;
}

async function getSpiritFlight(locationSlug) {
  try {
    const db = getPool();
    const locationId = await getLocationIdByMenuqrSlug(locationSlug);
    if (!locationId) return { items: [], item: null, error: `Unknown or inactive location: ${locationSlug}` };

    const flightDate = toDateOnlySql(getUpcomingFridayDate());
    const result = await db.query(`
      SELECT
        f.id,
        f.theme,
        f.description,
        f."flightDate",
        f."regularPriceOverride",
        f."fridayPriceOverride",
        p."displayOrder",
        COALESCE(NULLIF(TRIM(p."displayName"), ''), sp.name) AS "spiritName",
        NULLIF(TRIM(p.description), '') AS "pourDescription",
        COALESCE(NULLIF(TRIM(p."tastingNotes"), ''), NULLIF(TRIM(sd."tastingNotes"), ''), NULLIF(TRIM(sd.description), '')) AS "tastingNotes",
        COALESCE(p."pourSizeOz", 1) AS "pourSizeOz",
        slp."oneOzPrice"
      FROM "SpiritFlight" f
      JOIN "SpiritFlightPour" p ON p."flightId" = f.id
      JOIN "SpiritLocationPrice" slp ON slp."locationProductId" = p."locationProductId"
      JOIN "SpiritProduct" sp ON sp."productId" = slp."productId"
      LEFT JOIN "SpiritDetail" sd ON sd."productId" = sp."productId"
      WHERE f."locationId" = $1
        AND f.status = 'ACTIVE'
        AND f."isFridayFlight" = true
        AND f."flightDate" <= $2::date
        AND (f."flightEndDate" >= $2::date OR (f."flightEndDate" IS NULL AND f."flightDate" = $2::date))
      ORDER BY f."displayOrder" ASC, f.theme ASC, p."displayOrder" ASC
    `, [locationId, flightDate]);

    if (!result.rows.length) {
      return { items: [], item: null, error: null };
    }

    // Group rows by flight id
    const flightsMap = new Map();
    for (const row of result.rows) {
      if (!flightsMap.has(row.id)) {
        flightsMap.set(row.id, {
          id: row.id,
          theme: row.theme,
          description: row.description || null,
          flightDate: normalizeDbDate(row.flightDate),
          regularPriceOverride: row.regularPriceOverride ? parseFloat(row.regularPriceOverride) : null,
          fridayPriceOverride: row.fridayPriceOverride ? parseFloat(row.fridayPriceOverride) : null,
          pours: [],
        });
      }
      flightsMap.get(row.id).pours.push(row);
    }

    const items = [];
    for (const flight of flightsMap.values()) {
      const calculatedRegular = flight.pours.reduce((sum, row) => {
        const price = row.oneOzPrice ? parseFloat(row.oneOzPrice) : 0;
        return sum + (Number.isFinite(price) ? price : 0);
      }, 0);
      const regularPrice = flight.regularPriceOverride != null ? flight.regularPriceOverride : calculatedRegular;
      const fridayPrice = flight.fridayPriceOverride != null ? flight.fridayPriceOverride : Math.max(regularPrice - FRIDAY_FLIGHT_DISCOUNT, 0);

      const guestNotesSeed = flight.pours.map((row) => ({
        name: row.spiritName,
        bottleSize: `${parseFloat(row.pourSizeOz || '1').toFixed(0)} oz pour`,
        costPerOz: row.oneOzPrice ? formatCurrency(row.oneOzPrice) : null,
        notes: row.tastingNotes || '',
      }));
      const enhancedPours = await buildGuestBottleNotesForCatalog(
        guestNotesSeed,
        Boolean(process.env.OPENAI_API_KEY)
      ).catch(() => guestNotesSeed);

      items.push({
        id: flight.id,
        theme: flight.theme,
        description: flight.description,
        flightDate: flight.flightDate,
        price: formatCurrency(fridayPrice),
        fridayPriceLabel: formatCurrency(fridayPrice),
        regularPriceLabel: formatCurrency(regularPrice),
        builderUrl: buildSpiritFlightBuilderUrl(locationId, flightDate),
        pours: flight.pours.map((row, index) => ({
          spiritName: row.spiritName,
          pourSize: `${parseFloat(row.pourSizeOz || '1').toFixed(0)} oz`,
          description: row.pourDescription || null,
          tastingNotes: row.tastingNotes || null,
          guestNotes: enhancedPours[index]?.guestNotes || null,
          displayOrder: row.displayOrder,
        })),
      });
    }

    // Backward compat: item is the first flight
    return {
      items,
      item: items[0] || null,
      error: null,
    };
  } catch (err) {
    console.error('Error fetching spirit flight:', err.message);
    return { items: [], item: null, error: err.message };
  }
}

async function getUpcomingSpiritFlightsAdmin() {
  try {
    const db = getPool();
    const start = getUpcomingFridayDate();
    const end = new Date(start);
    end.setDate(end.getDate() + (7 * 7));
    const fromDate = toDateOnlySql(start);
    const toDate = toDateOnlySql(end);

    const [locationsResult, flightsResult] = await Promise.all([
      db.query(
        'SELECT id, name FROM "Location" WHERE "isActive" = true AND "isBarSupport" = false ORDER BY name ASC'
      ),
      db.query(`
        SELECT
          f.id,
          f."locationId",
          l.name AS "locationName",
          f.theme,
          f.description,
          f."flightDate",
          COUNT(p.id)::int AS "pourCount",
          COALESCE(SUM(slp."oneOzPrice"), 0) AS "regularPrice"
        FROM "SpiritFlight" f
        JOIN "Location" l ON l.id = f."locationId"
        LEFT JOIN "SpiritFlightPour" p ON p."flightId" = f.id
        LEFT JOIN "SpiritLocationPrice" slp ON slp."locationProductId" = p."locationProductId"
        WHERE f.status = 'ACTIVE'
          AND f."flightDate" BETWEEN $1::date AND $2::date
        GROUP BY f.id, l.name
        ORDER BY f."flightDate" ASC, l.name ASC
      `, [fromDate, toDate]),
    ]);

    return {
      locations: locationsResult.rows.map((row) => ({
        id: row.id,
        name: row.name,
        builderUrl: buildSpiritFlightBuilderUrl(row.id),
      })),
      items: flightsResult.rows.map((row) => {
        const regularPrice = row.regularPrice ? parseFloat(row.regularPrice) : 0;
        const fridayPrice = Math.max(regularPrice - FRIDAY_FLIGHT_DISCOUNT, 0);
        const flightDate = normalizeDbDate(row.flightDate);
        return {
          id: row.id,
          locationId: row.locationId,
          locationName: row.locationName,
          theme: row.theme,
          description: row.description || null,
          flightDate,
          pourCount: row.pourCount || 0,
          regularPriceLabel: formatCurrency(regularPrice),
          fridayPriceLabel: formatCurrency(fridayPrice),
          builderUrl: buildSpiritFlightBuilderUrl(row.locationId, flightDate),
        };
      }),
      error: null,
    };
  } catch (err) {
    console.error('Error fetching spirit flight admin overview:', err.message);
    return { locations: [], items: [], error: err.message };
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

async function getSpiritList(locationSlug) {
  try {
    const db = getPool();
    const extLocId = await getExternalLocationId(db, locationSlug);
    if (extLocId == null) {
      return { items: [], error: `Could not resolve location: ${locationSlug}` };
    }

    const result = await db.query(`
      SELECT
        sp."productId",
        sp.name,
        sp."primaryCategory",
        sp."subCategory",
        sp."bottleSize",
        sp."imageUrl",
        slp."oneOzPrice",
        slp."oneHalfOzPrice",
        slp."twoOzPrice",
        slp."isAllocated",
        sd.abv,
        sd.region,
        sd.distillery,
        sd.style,
        sd.description,
        sd."tastingNotes",
        sd."noseNotes",
        sd."palateNotes",
        sd."finishNotes"
      FROM "SpiritProduct" sp
      JOIN "SpiritLocationPrice" slp ON slp."productId" = sp."productId"
      LEFT JOIN "SpiritDetail" sd ON sd."productId" = sp."productId"
      WHERE slp."locationExternalId" = $1
        AND sp."isActive" = true
        AND slp."isActive" = true
      ORDER BY sp."primaryCategory" ASC, sp.name ASC
    `, [extLocId]);

    return {
      items: result.rows.map((row) => ({
        productId: row.productId,
        name: row.name,
        primaryCategory: row.primaryCategory || 'Other',
        subCategory: row.subCategory || null,
        bottleSize: row.bottleSize || null,
        imageUrl: row.imageUrl || null,
        oneOzPrice: parseMaybeNumber(row.oneOzPrice),
        oneHalfOzPrice: parseMaybeNumber(row.oneHalfOzPrice),
        twoOzPrice: parseMaybeNumber(row.twoOzPrice),
        isAllocated: Boolean(row.isAllocated),
        abv: parseMaybeNumber(row.abv),
        region: row.region || null,
        distillery: row.distillery || null,
        style: row.style || null,
        description: row.description || null,
        tastingNotes: row.tastingNotes || null,
        noseNotes: row.noseNotes || null,
        palateNotes: row.palateNotes || null,
        finishNotes: row.finishNotes || null,
      })),
      error: null,
    };
  } catch (err) {
    console.error('Error fetching spirit list:', err.message);
    return { items: [], error: err.message };
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

async function getFeaturedFlights(locationSlug) {
  try {
    const db = getPool();
    const locationId = await getLocationIdByMenuqrSlug(locationSlug);
    if (!locationId) return { items: [], error: `Unknown or inactive location: ${locationSlug}` };

    const today = toDateOnlySql(getEasternDate());
    const isFriday = getEasternDate().getDay() === 5;

    // Include non-Friday flights AND extended Friday flights (those with a date range active today)
    const result = await db.query(`
      SELECT
        f.id,
        f.theme,
        f.description,
        f."isFridayFlight",
        f."displayOrder",
        f."regularPriceOverride",
        f."fridayPriceOverride",
        p."displayOrder" AS "pourDisplayOrder",
        COALESCE(NULLIF(TRIM(p."displayName"), ''), sp.name) AS "spiritName",
        NULLIF(TRIM(p.description), '') AS "pourDescription",
        COALESCE(NULLIF(TRIM(p."tastingNotes"), ''), NULLIF(TRIM(sd."tastingNotes"), ''), NULLIF(TRIM(sd.description), '')) AS "tastingNotes",
        COALESCE(p."pourSizeOz", 1) AS "pourSizeOz",
        slp."oneOzPrice"
      FROM "SpiritFlight" f
      JOIN "SpiritFlightPour" p ON p."flightId" = f.id
      JOIN "SpiritLocationPrice" slp ON slp."locationProductId" = p."locationProductId"
      JOIN "SpiritProduct" sp ON sp."productId" = slp."productId"
      LEFT JOIN "SpiritDetail" sd ON sd."productId" = sp."productId"
      WHERE f."locationId" = $1
        AND f.status = 'ACTIVE'
        AND (
          f."isFridayFlight" = false
          OR (f."isFridayFlight" = true AND f."flightEndDate" IS NOT NULL
              AND f."flightDate" <= $2::date AND f."flightEndDate" >= $2::date)
        )
      ORDER BY f."displayOrder" ASC, f.theme ASC, p."displayOrder" ASC
    `, [locationId, today]);

    if (!result.rows.length) return { items: [], error: null };

    // Group rows by flight id
    const flightsMap = new Map();
    for (const row of result.rows) {
      if (!flightsMap.has(row.id)) {
        flightsMap.set(row.id, {
          id: row.id,
          theme: row.theme,
          description: row.description || null,
          isFridayFlight: row.isFridayFlight,
          regularPriceOverride: row.regularPriceOverride ? parseFloat(row.regularPriceOverride) : null,
          fridayPriceOverride: row.fridayPriceOverride ? parseFloat(row.fridayPriceOverride) : null,
          pours: [],
        });
      }
      flightsMap.get(row.id).pours.push(row);
    }

    const flights = [];
    for (const flight of flightsMap.values()) {
      const calculatedPrice = flight.pours.reduce((sum, row) => {
        const price = row.oneOzPrice ? parseFloat(row.oneOzPrice) : 0;
        return sum + (Number.isFinite(price) ? price : 0);
      }, 0);
      const regularPrice = flight.regularPriceOverride != null ? flight.regularPriceOverride : calculatedPrice;

      let priceLabel;
      let fridayPriceLabel = null;
      if (flight.isFridayFlight) {
        const fridayPrice = flight.fridayPriceOverride != null ? flight.fridayPriceOverride : Math.max(regularPrice - FRIDAY_FLIGHT_DISCOUNT, 0);
        if (isFriday) {
          priceLabel = formatCurrency(fridayPrice);
          fridayPriceLabel = formatCurrency(fridayPrice);
        } else {
          priceLabel = formatCurrency(regularPrice);
        }
      } else {
        priceLabel = formatCurrency(regularPrice);
      }

      // Build guest notes for pours
      const guestNotesSeed = flight.pours.map((row) => ({
        name: row.spiritName,
        bottleSize: `${parseFloat(row.pourSizeOz || '1').toFixed(0)} oz pour`,
        costPerOz: row.oneOzPrice ? formatCurrency(row.oneOzPrice) : null,
        notes: row.tastingNotes || '',
      }));
      const enhancedPours = await buildGuestBottleNotesForCatalog(
        guestNotesSeed,
        Boolean(process.env.OPENAI_API_KEY)
      ).catch(() => guestNotesSeed);

      flights.push({
        id: flight.id,
        theme: flight.theme,
        description: flight.description,
        isFridayFlight: flight.isFridayFlight,
        priceLabel,
        fridayPriceLabel,
        regularPriceLabel: formatCurrency(regularPrice),
        pours: flight.pours.map((row, index) => ({
          spiritName: row.spiritName,
          pourSize: `${parseFloat(row.pourSizeOz || '1').toFixed(0)} oz`,
          description: row.pourDescription || null,
          tastingNotes: row.tastingNotes || null,
          guestNotes: enhancedPours[index]?.guestNotes || null,
          displayOrder: row.pourDisplayOrder,
        })),
      });
    }

    return { items: flights, error: null };
  } catch (err) {
    console.error('Error fetching featured flights:', err.message);
    return { items: [], error: err.message };
  }
}

async function hasFeaturedFlights(locationSlug) {
  try {
    const db = getPool();
    const locationId = await getLocationIdByMenuqrSlug(locationSlug);
    if (!locationId) return false;

    const today = toDateOnlySql(getEasternDate());
    const result = await db.query(`
      SELECT 1 FROM "SpiritFlight"
      WHERE "locationId" = $1 AND status = 'ACTIVE'
        AND (
          "isFridayFlight" = false
          OR ("isFridayFlight" = true AND "flightEndDate" IS NOT NULL
              AND "flightDate" <= $2::date AND "flightEndDate" >= $2::date)
        )
      LIMIT 1
    `, [locationId, today]);

    return result.rows.length > 0;
  } catch (err) {
    console.error('Error checking featured flights:', err.message);
    return false;
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
  getSpiritList,
  getHalfPriceSpirits,
  getLocationIdByMenuqrSlug,
  getSpiritFlight,
  getFeaturedFlights,
  hasFeaturedFlights,
  getUpcomingSpiritFlightsAdmin,
  buildSpiritFlightBuilderUrl,
};
