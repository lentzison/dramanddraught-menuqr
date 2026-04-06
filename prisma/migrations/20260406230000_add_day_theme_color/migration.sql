-- AlterTable: optional theme color per day so admins can pick a color
-- to theme the public specials page header for each day.
ALTER TABLE "DayTheme" ADD COLUMN "themeColor" TEXT;
