-- Profile countries were free text; now they are ISO 3166-1 alpha-2 codes like those of events.
-- Other values stay as they are and keep being shown as typed. Snapshots of sellers keep what
-- was true when they were taken.
UPDATE users SET country = CASE
    WHEN lower(trim(country)) IN ('de', 'd', 'deu', 'ger', 'brd', 'deutschland', 'germany') THEN 'DE'
    -- translate: lower() leaves Ö alone in databases with the C locale
    WHEN translate(lower(trim(country)), 'Ö', 'ö') IN ('at', 'a', 'aut', 'österreich', 'oesterreich', 'austria') THEN 'AT'
    WHEN lower(trim(country)) IN ('ch', 'che', 'schweiz', 'switzerland', 'suisse', 'svizzera') THEN 'CH'
    WHEN lower(trim(country)) IN ('li', 'lie', 'liechtenstein') THEN 'LI'
    WHEN lower(trim(country)) IN ('lu', 'lux', 'luxemburg', 'luxembourg') THEN 'LU'
    ELSE country
  END
WHERE country IS NOT NULL;
