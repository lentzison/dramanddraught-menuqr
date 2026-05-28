-- Spots-left urgency control, day-of check-in, and waitlist support.

-- How the public "X spots left" indicator behaves: always | near-full | hidden.
ALTER TABLE "Event"
  ADD COLUMN "spotsLeftMode" TEXT NOT NULL DEFAULT 'always';

-- Day-of attendance check-in timestamp (null = not checked in).
-- (status already supports a new "waitlisted" value; no schema change needed.)
ALTER TABLE "EventSignup"
  ADD COLUMN "checkedInAt" TIMESTAMP(3);
