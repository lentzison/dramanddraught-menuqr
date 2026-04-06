-- AlterTable: extend Event with fields needed for public signup pages
ALTER TABLE "Event" ADD COLUMN "slug" TEXT;
ALTER TABLE "Event" ADD COLUMN "promoteFrom" TIMESTAMP(3);
ALTER TABLE "Event" ADD COLUMN "promoteUntil" TIMESTAMP(3);
ALTER TABLE "Event" ADD COLUMN "capacity" INTEGER;
ALTER TABLE "Event" ADD COLUMN "collectEmail" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Event" ADD COLUMN "collectPhone" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Event" ADD COLUMN "collectPartySize" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Event" ADD COLUMN "collectNotes" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Event" ADD COLUMN "customQuestions" JSONB;
ALTER TABLE "Event" ADD COLUMN "confirmationMessage" TEXT;
ALTER TABLE "Event" ADD COLUMN "notifyEmail" TEXT;
ALTER TABLE "Event" ADD COLUMN "isCancelled" BOOLEAN NOT NULL DEFAULT false;

-- Backfill slug for any existing rows using id so the unique constraint can apply.
UPDATE "Event" SET "slug" = LEFT("id"::text, 8) WHERE "slug" IS NULL;

-- Make slug required now that rows are backfilled.
ALTER TABLE "Event" ALTER COLUMN "slug" SET NOT NULL;

-- Unique + indexes
CREATE UNIQUE INDEX "Event_locationId_slug_key" ON "Event"("locationId", "slug");
CREATE INDEX "Event_slug_idx" ON "Event"("slug");

-- CreateTable: EventSignup
CREATE TABLE "EventSignup" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "partySize" INTEGER,
    "notes" TEXT,
    "customAnswers" JSONB,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EventSignup_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EventSignup_eventId_createdAt_idx" ON "EventSignup"("eventId", "createdAt");

ALTER TABLE "EventSignup" ADD CONSTRAINT "EventSignup_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
