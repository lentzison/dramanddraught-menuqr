-- Vendor events: route signups through a GM approval queue.
ALTER TABLE "Event" ADD COLUMN "isVendorEvent" BOOLEAN NOT NULL DEFAULT false;

-- Approval workflow on signups. Existing/regular-event signups default to "approved"
-- so public flows are unchanged. Vendor-event signups are inserted as "pending".
ALTER TABLE "EventSignup" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'approved';
ALTER TABLE "EventSignup" ADD COLUMN "approvedBy" TEXT;
ALTER TABLE "EventSignup" ADD COLUMN "approvedAt" TIMESTAMP(3);
ALTER TABLE "EventSignup" ADD COLUMN "rejectionReason" TEXT;

CREATE INDEX "EventSignup_eventId_status_idx" ON "EventSignup"("eventId", "status");