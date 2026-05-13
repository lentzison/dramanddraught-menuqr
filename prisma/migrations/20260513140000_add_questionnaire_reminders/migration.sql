-- Auto-reminder bookkeeping for the post-application questionnaire.

ALTER TABLE "JobApplication"
  ADD COLUMN "questionnaireReminder24hSent" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "questionnaireReminder72hSent" BOOLEAN NOT NULL DEFAULT false;
