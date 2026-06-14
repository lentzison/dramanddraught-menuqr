-- AlterTable
ALTER TABLE "Interview" ADD COLUMN "scorecard" JSONB;
ALTER TABLE "Interview" ADD COLUMN "scorecardBy" TEXT;
ALTER TABLE "Interview" ADD COLUMN "scorecardAt" TIMESTAMP(3);
