WITH desired_specials(sort_index, name, description, detail_text) AS (
  VALUES
    (0, 'Tommy''s Margarita', 'Lunazul Blanco, Lime, Agave', 'Tequila Bright Shaken'),
    (1, 'Oaxaca Old Fashioned', 'Reposado Tequila, Mezcal, Agave, Bitters', 'Agave Spirit-Forward Stirred'),
    (2, 'Siesta', 'Lunazul Blanco, Campari, Grapefruit, Lime, Sugar', 'Tequila Bitter Shaken'),
    (3, 'Mexican Firing Squad', 'Lunazul Blanco, Lime, Grenadine, Bitters', 'Tequila Fruity Shaken'),
    (4, 'Matador', 'Lunazul Blanco, Pineapple, Lime', 'Tequila Tropical Shaken'),
    (5, 'Rosita', 'Reposado Tequila, Sweet Vermouth, Dry Vermouth, Campari, Bitters', 'Agave Bitter Stirred')
),
missing AS (
  SELECT
    dt.id AS day_theme_id,
    ds.sort_index,
    ds.name,
    ds.description,
    ds.detail_text
  FROM "DayTheme" dt
  CROSS JOIN desired_specials ds
  LEFT JOIN "DailySpecial" existing
    ON existing."dayThemeId" = dt.id
   AND lower(existing.name) = lower(ds.name)
  WHERE dt."dayOfWeek" = 'TUESDAY'
    AND existing.id IS NULL
),
shift_counts AS (
  SELECT day_theme_id, COUNT(*) AS missing_count
  FROM missing
  GROUP BY day_theme_id
)
UPDATE "DailySpecial" AS ds_current
SET
  "displayOrder" = ds_current."displayOrder" + sc.missing_count,
  "updatedAt" = NOW()
FROM shift_counts sc
WHERE ds_current."dayThemeId" = sc.day_theme_id
  AND ds_current."displayOrder" >= 30;

WITH desired_specials(sort_index, name, description, detail_text) AS (
  VALUES
    (0, 'Tommy''s Margarita', 'Lunazul Blanco, Lime, Agave', 'Tequila Bright Shaken'),
    (1, 'Oaxaca Old Fashioned', 'Reposado Tequila, Mezcal, Agave, Bitters', 'Agave Spirit-Forward Stirred'),
    (2, 'Siesta', 'Lunazul Blanco, Campari, Grapefruit, Lime, Sugar', 'Tequila Bitter Shaken'),
    (3, 'Mexican Firing Squad', 'Lunazul Blanco, Lime, Grenadine, Bitters', 'Tequila Fruity Shaken'),
    (4, 'Matador', 'Lunazul Blanco, Pineapple, Lime', 'Tequila Tropical Shaken'),
    (5, 'Rosita', 'Reposado Tequila, Sweet Vermouth, Dry Vermouth, Campari, Bitters', 'Agave Bitter Stirred')
),
missing AS (
  SELECT
    dt.id AS day_theme_id,
    ds.sort_index,
    ds.name,
    ds.description,
    ds.detail_text
  FROM "DayTheme" dt
  CROSS JOIN desired_specials ds
  LEFT JOIN "DailySpecial" existing
    ON existing."dayThemeId" = dt.id
   AND lower(existing.name) = lower(ds.name)
  WHERE dt."dayOfWeek" = 'TUESDAY'
    AND existing.id IS NULL
)
INSERT INTO "DailySpecial" (
  "dayThemeId",
  "name",
  "description",
  "price",
  "category",
  "displayOrder",
  "section",
  "detailText"
)
SELECT
  m.day_theme_id,
  m.name,
  m.description,
  '$9',
  'cocktail',
  30 + ROW_NUMBER() OVER (PARTITION BY m.day_theme_id ORDER BY m.sort_index) - 1,
  'Tequila Classics',
  m.detail_text
FROM missing m
ORDER BY m.day_theme_id, m.sort_index;
