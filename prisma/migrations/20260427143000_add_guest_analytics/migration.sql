-- Add richer campaign, QR, and known-guest analytics.

ALTER TABLE "EventSignup" ADD COLUMN "visitorId" TEXT;
ALTER TABLE "EventSignup" ADD COLUMN "sessionId" TEXT;
ALTER TABLE "EventSignup" ADD COLUMN "source" TEXT;

ALTER TABLE "GuestFeedback" ADD COLUMN "visitorId" TEXT;
ALTER TABLE "GuestFeedback" ADD COLUMN "sessionId" TEXT;
ALTER TABLE "GuestFeedback" ADD COLUMN "source" TEXT;

ALTER TABLE "VisitorSession" ADD COLUMN "medium" TEXT;
ALTER TABLE "VisitorSession" ADD COLUMN "campaign" TEXT;
ALTER TABLE "VisitorSession" ADD COLUMN "qrId" TEXT;

CREATE TABLE "GuestVisitorLink" (
  "id" TEXT NOT NULL,
  "emailHash" TEXT NOT NULL,
  "emailMasked" TEXT NOT NULL,
  "visitorId" TEXT NOT NULL,
  "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL,
  "firstLocationSlug" TEXT,
  "lastLocationSlug" TEXT,
  "firstSource" TEXT,
  "lastSource" TEXT,
  "giftCardOptIn" BOOLEAN NOT NULL DEFAULT false,
  "newsletterOptIn" BOOLEAN NOT NULL DEFAULT false,
  "feedbackCount" INTEGER NOT NULL DEFAULT 0,
  "eventSignupCount" INTEGER NOT NULL DEFAULT 0,

  CONSTRAINT "GuestVisitorLink_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AnalyticsEvent" (
  "id" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "visitorId" TEXT,
  "sessionId" TEXT,
  "emailHash" TEXT,
  "emailMasked" TEXT,
  "locationId" TEXT,
  "locationSlug" TEXT,
  "source" TEXT,
  "medium" TEXT,
  "campaign" TEXT,
  "qrId" TEXT,
  "pagePath" TEXT,
  "entityType" TEXT,
  "entityId" TEXT,
  "entityName" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AnalyticsEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EventSignup_visitorId_idx" ON "EventSignup"("visitorId");
CREATE INDEX "EventSignup_source_idx" ON "EventSignup"("source");

CREATE INDEX "GuestFeedback_visitorId_idx" ON "GuestFeedback"("visitorId");
CREATE INDEX "GuestFeedback_source_idx" ON "GuestFeedback"("source");

CREATE INDEX "VisitorSession_campaign_idx" ON "VisitorSession"("campaign");
CREATE INDEX "VisitorSession_qrId_idx" ON "VisitorSession"("qrId");

CREATE UNIQUE INDEX "GuestVisitorLink_emailHash_visitorId_key" ON "GuestVisitorLink"("emailHash", "visitorId");
CREATE INDEX "GuestVisitorLink_emailHash_idx" ON "GuestVisitorLink"("emailHash");
CREATE INDEX "GuestVisitorLink_visitorId_idx" ON "GuestVisitorLink"("visitorId");
CREATE INDEX "GuestVisitorLink_lastSeenAt_idx" ON "GuestVisitorLink"("lastSeenAt");
CREATE INDEX "GuestVisitorLink_lastLocationSlug_idx" ON "GuestVisitorLink"("lastLocationSlug");

CREATE INDEX "AnalyticsEvent_eventType_createdAt_idx" ON "AnalyticsEvent"("eventType", "createdAt");
CREATE INDEX "AnalyticsEvent_visitorId_idx" ON "AnalyticsEvent"("visitorId");
CREATE INDEX "AnalyticsEvent_emailHash_idx" ON "AnalyticsEvent"("emailHash");
CREATE INDEX "AnalyticsEvent_locationSlug_createdAt_idx" ON "AnalyticsEvent"("locationSlug", "createdAt");
CREATE INDEX "AnalyticsEvent_source_idx" ON "AnalyticsEvent"("source");
CREATE INDEX "AnalyticsEvent_campaign_idx" ON "AnalyticsEvent"("campaign");
CREATE INDEX "AnalyticsEvent_qrId_idx" ON "AnalyticsEvent"("qrId");
CREATE INDEX "AnalyticsEvent_entityType_entityId_idx" ON "AnalyticsEvent"("entityType", "entityId");
