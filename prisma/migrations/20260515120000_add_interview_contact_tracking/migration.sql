-- Track manual outreach so admins can advance a candidate without sending an email
-- (e.g. they called or texted the candidate to confirm an interview).

ALTER TABLE "Interview"
  ADD COLUMN "contactMethod" TEXT,
  ADD COLUMN "contactNote"   TEXT;
