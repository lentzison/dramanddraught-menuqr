UPDATE "DailySpecial" ds
SET
  name = btrim(
    regexp_replace(
      regexp_replace(ds.name, '#', '', 'g'),
      '\s{2,}',
      ' ',
      'g'
    )
  ),
  "updatedAt" = NOW()
FROM "DayTheme" dt
WHERE ds."dayThemeId" = dt.id
  AND dt."dayOfWeek" = 'TUESDAY'
  AND ds.name LIKE '%#%';
