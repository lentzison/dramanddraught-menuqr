-- New three-way signup mode. Backfills from the legacy isVendorEvent boolean
-- so existing data routes to the right bucket without code changes.

ALTER TABLE "Event"
  ADD COLUMN "signupType" TEXT NOT NULL DEFAULT 'guest';

UPDATE "Event"
  SET "signupType" = 'vendor'
  WHERE "isVendorEvent" = true;
