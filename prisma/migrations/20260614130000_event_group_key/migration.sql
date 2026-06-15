-- Cross-location event grouping.
ALTER TABLE "Event" ADD COLUMN "groupKey" TEXT;
CREATE INDEX "Event_groupKey_idx" ON "Event"("groupKey");
