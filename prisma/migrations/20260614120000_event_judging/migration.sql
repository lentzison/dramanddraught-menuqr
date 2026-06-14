-- Competition judging layer on events.
-- AlterTable: Event
ALTER TABLE "Event" ADD COLUMN "judgingCriteria" JSONB;
ALTER TABLE "Event" ADD COLUMN "judges" JSONB;
ALTER TABLE "Event" ADD COLUMN "judgeToken" TEXT;
ALTER TABLE "Event" ADD COLUMN "judgingOpen" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Event" ADD COLUMN "finalistTarget" INTEGER;
CREATE UNIQUE INDEX "Event_judgeToken_key" ON "Event"("judgeToken");

-- AlterTable: EventSignup
ALTER TABLE "EventSignup" ADD COLUMN "isFinalist" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "EventSignup" ADD COLUMN "scorecards" JSONB;
