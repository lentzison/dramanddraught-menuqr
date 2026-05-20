-- Add the "why a manager might like this candidate" summary required by
-- rubric v6. Nullable so the migration is additive — older evaluations
-- simply won't have it set.

ALTER TABLE "JobApplicationAiEvaluation"
  ADD COLUMN "positiveSignalSummary" TEXT;
