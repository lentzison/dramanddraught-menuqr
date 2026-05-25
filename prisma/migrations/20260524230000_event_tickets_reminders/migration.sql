-- Phase D: Eventbrite ticket links + signup reminder emails.

ALTER TABLE "Event"
  ADD COLUMN "ticketUrl" TEXT,
  ADD COLUMN "ticketProvider" TEXT,
  ADD COLUMN "remindersEnabled" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "EventSignup"
  ADD COLUMN "reminderSent24h" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "reminderSent1h" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "remindersOptOut" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "unsubscribeToken" TEXT;

-- Backfill: signups created before this migration shouldn't get a sudden
-- "reminder" email for events that already passed — mark both flags true on
-- historical rows so the reminder poll skips them.
UPDATE "EventSignup" es
  SET "reminderSent24h" = true, "reminderSent1h" = true
  FROM "Event" e
  WHERE es."eventId" = e.id
    AND e."startDate" < NOW();
