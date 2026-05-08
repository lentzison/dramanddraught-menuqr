-- Employment applications + interview scheduling + reminders.

ALTER TABLE "Location" ADD COLUMN "isHiring" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "JobApplication" (
  "id" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "phone" TEXT,
  "position" TEXT NOT NULL,
  "positionOther" TEXT,
  "age21" BOOLEAN NOT NULL DEFAULT false,
  "earliestStart" TIMESTAMP(3),
  "availability" JSONB,
  "yearsExperience" INTEGER,
  "priorEmployers" TEXT,
  "certifications" TEXT,
  "spiritKnowledge" TEXT,
  "whyDD" TEXT,
  "referredBy" TEXT,
  "resumeData" TEXT,
  "resumeFileName" TEXT,
  "resumeMimeType" TEXT,
  "status" TEXT NOT NULL DEFAULT 'new',
  "decisionBy" TEXT,
  "decisionAt" TIMESTAMP(3),
  "decisionNote" TEXT,
  "internalNotes" TEXT,
  "ipAddress" TEXT,
  "visitorId" TEXT,
  "sessionId" TEXT,
  "source" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "JobApplication_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "JobApplication_locationId_fkey" FOREIGN KEY ("locationId")
    REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "JobApplication_locationId_status_idx"     ON "JobApplication"("locationId", "status");
CREATE INDEX "JobApplication_locationId_createdAt_idx"  ON "JobApplication"("locationId", "createdAt");
CREATE INDEX "JobApplication_email_idx"                 ON "JobApplication"("email");
CREATE INDEX "JobApplication_visitorId_idx"             ON "JobApplication"("visitorId");

CREATE TABLE "Interview" (
  "id" TEXT NOT NULL,
  "applicationId" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  "scheduledAt" TIMESTAMP(3) NOT NULL,
  "durationMinutes" INTEGER NOT NULL DEFAULT 30,
  "type" TEXT NOT NULL DEFAULT 'in_person',
  "locationDetail" TEXT,
  "interviewerEmail" TEXT,
  "candidateNote" TEXT,
  "internalNotes" TEXT,
  "status" TEXT NOT NULL DEFAULT 'scheduled',
  "cancelledAt" TIMESTAMP(3),
  "cancellationReason" TEXT,
  "reminderSent24h" BOOLEAN NOT NULL DEFAULT false,
  "reminderSent1h" BOOLEAN NOT NULL DEFAULT false,
  "confirmationSentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Interview_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Interview_applicationId_fkey" FOREIGN KEY ("applicationId")
    REFERENCES "JobApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Interview_locationId_fkey" FOREIGN KEY ("locationId")
    REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "Interview_applicationId_idx"                       ON "Interview"("applicationId");
CREATE INDEX "Interview_scheduledAt_status_idx"                  ON "Interview"("scheduledAt", "status");
CREATE INDEX "Interview_locationId_status_scheduledAt_idx"       ON "Interview"("locationId", "status", "scheduledAt");
