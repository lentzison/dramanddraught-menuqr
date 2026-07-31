// Brand loader
// ---------------------------------------------------------------------------
// Selects which brand this menuqr instance runs as. One deployment = one brand,
// chosen by the BRAND env var (defaults to "dram"). Everything brand-specific
// reads from getBrand() so a new bar is a config file + env change, not a code
// change.
//
//   BRAND=dram    node index.js   → Dram & Draught
//   BRAND=example node index.js   → the placeholder second brand
//
// A few origin URLs can also be overridden per-deployment via env (these win
// over the config file so the same brand can run on different hosts):
//   PUBLIC_WEB_ORIGIN  → brand.urls.public
// ---------------------------------------------------------------------------

const fs = require('fs');
const path = require('path');

let cached = null;

function loadBrand() {
  const key = (process.env.BRAND || 'dram').trim().toLowerCase();
  const dir = path.join(__dirname, 'brands', key);
  const file = path.join(dir, 'brand.config.js');

  if (!fs.existsSync(file)) {
    const available = fs.existsSync(path.join(__dirname, 'brands'))
      ? fs.readdirSync(path.join(__dirname, 'brands'))
      : [];
    throw new Error(
      `[brand] Unknown BRAND="${key}". No config at ${file}. ` +
        `Available brands: ${available.join(', ') || '(none)'}.`
    );
  }

  const brand = require(file);

  // Env overrides for origins that legitimately vary per host.
  if (process.env.PUBLIC_WEB_ORIGIN) {
    brand.urls = { ...brand.urls, public: process.env.PUBLIC_WEB_ORIGIN };
  }

  return brand;
}

function getBrand() {
  if (!cached) cached = loadBrand();
  return cached;
}

module.exports = { getBrand };
