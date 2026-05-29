-- How a banner image is presented on the public event page:
-- "hero" (full-bleed background behind the title) or "featured" (image below
-- the themed text hero). Defaults to "hero".
ALTER TABLE "Event"
  ADD COLUMN "bannerStyle" TEXT NOT NULL DEFAULT 'hero';
