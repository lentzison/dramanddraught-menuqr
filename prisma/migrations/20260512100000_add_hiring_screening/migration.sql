-- Hiring screening: post-application questionnaire + AI evaluation tables.

CREATE TABLE "JobApplicationQuestionnaire" (
  "id" TEXT NOT NULL,
  "applicationId" TEXT NOT NULL,
  "answers" JSONB NOT NULL,
  "version" TEXT NOT NULL,
  "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "JobApplicationQuestionnaire_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "JobApplicationQuestionnaire_applicationId_key" UNIQUE ("applicationId"),
  CONSTRAINT "JobApplicationQuestionnaire_applicationId_fkey" FOREIGN KEY ("applicationId")
    REFERENCES "JobApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "JobApplicationAiEvaluation" (
  "id" TEXT NOT NULL,
  "applicationId" TEXT NOT NULL,
  "recommendation" TEXT NOT NULL,
  "weightedScore" DOUBLE PRECISION NOT NULL,
  "confidence" TEXT NOT NULL,
  "humanReviewRequired" BOOLEAN NOT NULL DEFAULT false,
  "humanReviewReasons" JSONB NOT NULL,
  "candidateSummary" TEXT NOT NULL,
  "overallRationale" TEXT NOT NULL,
  "jobRelatedConcerns" JSONB NOT NULL,
  "suggestedInterviewQuestions" JSONB NOT NULL,
  "possibleBetterRoleFit" TEXT,
  "categoryScores" JSONB NOT NULL,
  "modelName" TEXT NOT NULL,
  "promptVersion" TEXT NOT NULL,
  "knowledgeBaseVersion" TEXT NOT NULL,
  "rawAiPayload" JSONB,
  "errorDetail" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "JobApplicationAiEvaluation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "JobApplicationAiEvaluation_applicationId_key" UNIQUE ("applicationId"),
  CONSTRAINT "JobApplicationAiEvaluation_applicationId_fkey" FOREIGN KEY ("applicationId")
    REFERENCES "JobApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE
);