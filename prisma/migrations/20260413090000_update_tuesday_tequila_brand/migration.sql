UPDATE "DailySpecial" ds
SET
  description = regexp_replace(ds.description, '(?i)exc?otico', 'Lunazul', 'g'),
  "updatedAt" = NOW()
FROM "DayTheme" dt
WHERE ds."dayThemeId" = dt.id
  AND dt."dayOfWeek" = 'TUESDAY'
  AND ds.description IS NOT NULL
  AND ds.description ~* 'exc?otico';
