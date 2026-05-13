-- Tracks when an applicant was emailed the questionnaire link (backfill flow).

ALTER TABLE "JobApplication"
  ADD COLUMN "questionnaireInviteSentAt" TIMESTAMP(3);
