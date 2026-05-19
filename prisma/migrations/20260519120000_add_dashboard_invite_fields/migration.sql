-- Track the bartender dashboard onboarding invite we send after hiring.
-- Token and id mirror the bartender EmployeeInvite row so we can poll status
-- and avoid double-sends.

ALTER TABLE "JobApplication"
  ADD COLUMN "dashboardInviteId"     TEXT,
  ADD COLUMN "dashboardInviteToken"  TEXT,
  ADD COLUMN "dashboardInviteSentAt" TIMESTAMP(3),
  ADD COLUMN "dashboardInviteRole"   TEXT;
