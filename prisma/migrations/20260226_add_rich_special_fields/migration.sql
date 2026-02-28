-- AlterTable
ALTER TABLE "DailySpecial" ADD COLUMN "section" TEXT,
ADD COLUMN "detailText" TEXT,
ADD COLUMN "badges" TEXT,
ADD COLUMN "timeWindow" TEXT,
ADD COLUMN "isFeatured" BOOLEAN NOT NULL DEFAULT false;
