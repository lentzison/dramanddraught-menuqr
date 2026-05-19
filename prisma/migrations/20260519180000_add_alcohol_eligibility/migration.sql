-- Replace the under-21 hard rule with a legal-eligibility question that
-- accepts yes / no / unsure. age21 stays for legacy applicants — new
-- bartender applications must answer the eligibility question explicitly.

ALTER TABLE "JobApplication"
  ADD COLUMN "alcoholEligibility" TEXT;
