-- Link an imported event back to its originating public (Dram) event id, so the
-- public site can transfer ownership to that row instead of duplicating it.
ALTER TABLE "Event"
  ADD COLUMN "importedFromPublicId" INTEGER;
