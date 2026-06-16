-- One-time, date-specific overrides of a day's specials theme.
-- A DayTheme row with overrideDate set applies ONLY on that Eastern calendar
-- date (stored as noon Eastern, in UTC) and takes precedence over the recurring
-- theme (overrideDate IS NULL) for the same day-of-week + location. After the
-- date passes the public page reverts to the recurring theme automatically.
ALTER TABLE "DayTheme" ADD COLUMN "overrideDate" TIMESTAMP(3);

-- Replace the old (dayOfWeek, locationId) unique with two partial uniques so a
-- day/location can have exactly one recurring theme PLUS many dated overrides.
DROP INDEX "DayTheme_dayOfWeek_locationId_key";
CREATE UNIQUE INDEX "DayTheme_recurring_key" ON "DayTheme"("dayOfWeek", "locationId") WHERE "overrideDate" IS NULL;
CREATE UNIQUE INDEX "DayTheme_override_key" ON "DayTheme"("dayOfWeek", "locationId", "overrideDate") WHERE "overrideDate" IS NOT NULL;
CREATE INDEX "DayTheme_overrideDate_idx" ON "DayTheme"("overrideDate");
