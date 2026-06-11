-- Recurring events: a stable Event row whose live date rolls forward through
-- EventOccurrence rows. Signups are tied to the occurrence they belong to.
-- (gen_random_uuid() is built into Postgres 13+, matching the existing
--  add_tuesday_tequila_classics migration — no pgcrypto extension needed.)

-- 1. Recurrence fields on Event
ALTER TABLE "Event"
  ADD COLUMN "isRecurring" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "recurrenceRule" JSONB,
  ADD COLUMN "currentOccurrenceId" TEXT;

-- 2. EventOccurrence
CREATE TABLE "EventOccurrence" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "sequence" INTEGER NOT NULL DEFAULT 1,
    "rolledOverAt" TIMESTAMP(3),
    "origin" TEXT NOT NULL DEFAULT 'manual',
    "inviteSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventOccurrence_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "EventOccurrence_eventId_startDate_idx" ON "EventOccurrence"("eventId", "startDate");
ALTER TABLE "EventOccurrence" ADD CONSTRAINT "EventOccurrence_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 3. EventSeriesOptOut
CREATE TABLE "EventSeriesOptOut" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventSeriesOptOut_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EventSeriesOptOut_token_key" ON "EventSeriesOptOut"("token");
CREATE UNIQUE INDEX "EventSeriesOptOut_eventId_email_key" ON "EventSeriesOptOut"("eventId", "email");
CREATE INDEX "EventSeriesOptOut_eventId_idx" ON "EventSeriesOptOut"("eventId");
ALTER TABLE "EventSeriesOptOut" ADD CONSTRAINT "EventSeriesOptOut_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 4. occurrenceId on EventSignup (nullable forever; SetNull preserves history)
ALTER TABLE "EventSignup" ADD COLUMN "occurrenceId" TEXT;
CREATE INDEX "EventSignup_occurrenceId_idx" ON "EventSignup"("occurrenceId");
ALTER TABLE "EventSignup" ADD CONSTRAINT "EventSignup_occurrenceId_fkey"
  FOREIGN KEY ("occurrenceId") REFERENCES "EventOccurrence"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 5. Backfill: one occurrence per existing event, from its current dates.
INSERT INTO "EventOccurrence" ("id", "eventId", "startDate", "endDate", "sequence", "origin", "createdAt")
SELECT gen_random_uuid()::text, e."id", e."startDate", e."endDate", 1, 'manual', NOW()
FROM "Event" e;

-- 6. Point each Event at its freshly-created occurrence.
UPDATE "Event" e
SET "currentOccurrenceId" = o."id"
FROM "EventOccurrence" o
WHERE o."eventId" = e."id";

-- 7. Backfill every existing signup onto its event's occurrence.
UPDATE "EventSignup" s
SET "occurrenceId" = e."currentOccurrenceId"
FROM "Event" e
WHERE s."eventId" = e."id";

-- 8. currentOccurrence FK + unique (added last, after the column is populated).
CREATE UNIQUE INDEX "Event_currentOccurrenceId_key" ON "Event"("currentOccurrenceId");
ALTER TABLE "Event" ADD CONSTRAINT "Event_currentOccurrenceId_fkey"
  FOREIGN KEY ("currentOccurrenceId") REFERENCES "EventOccurrence"("id") ON DELETE SET NULL ON UPDATE CASCADE;
