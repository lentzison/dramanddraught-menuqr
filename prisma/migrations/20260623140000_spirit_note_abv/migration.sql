-- ABV override for the printable spirit list, used when the Bartender catalog
-- has no ABV on file (often AI-looked-up, always admin-reviewed). Never written
-- back to Bartender.
ALTER TABLE "SpiritNote" ADD COLUMN "abv" DOUBLE PRECISION;
