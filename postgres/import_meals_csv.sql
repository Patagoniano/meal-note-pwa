DROP TABLE IF EXISTS meal_records_import_staging;

CREATE TABLE meal_records_import_staging (
  id text,
  meal_name text,
  meal_type text,
  start_value text,
  end_value text,
  duration_minutes text,
  alcohol text,
  note text,
  has_photo text,
  created_at text,
  updated_at text,
  synced_at text,
  synced_from text
);

COPY meal_records_import_staging (
  id,
  meal_name,
  meal_type,
  start_value,
  end_value,
  duration_minutes,
  alcohol,
  note,
  has_photo,
  created_at,
  updated_at,
  synced_at,
  synced_from
)
FROM '/tmp/meal_note_import.csv'
WITH (FORMAT csv, HEADER true);

INSERT INTO meal_records (
  id,
  meal_name,
  meal_type,
  start_at,
  end_at,
  duration_minutes,
  alcohol,
  note,
  has_photo,
  created_at,
  updated_at,
  synced_at,
  synced_from,
  imported_at
)
SELECT
  id,
  NULLIF(meal_name, ''),
  meal_type,
  start_value::timestamptz,
  end_value::timestamptz,
  NULLIF(duration_minutes, '')::integer,
  lower(COALESCE(NULLIF(alcohol, ''), 'false')) IN ('true', '1', 'yes', 'y'),
  NULLIF(note, ''),
  lower(COALESCE(NULLIF(has_photo, ''), 'false')) IN ('true', '1', 'yes', 'y'),
  NULLIF(created_at, '')::timestamptz,
  NULLIF(updated_at, '')::timestamptz,
  NULLIF(synced_at, '')::timestamptz,
  NULLIF(synced_from, ''),
  now()
FROM meal_records_import_staging
WHERE id IS NOT NULL
  AND id <> ''
ON CONFLICT (id) DO UPDATE SET
  meal_name = EXCLUDED.meal_name,
  meal_type = EXCLUDED.meal_type,
  start_at = EXCLUDED.start_at,
  end_at = EXCLUDED.end_at,
  duration_minutes = EXCLUDED.duration_minutes,
  alcohol = EXCLUDED.alcohol,
  note = EXCLUDED.note,
  has_photo = EXCLUDED.has_photo,
  created_at = EXCLUDED.created_at,
  updated_at = EXCLUDED.updated_at,
  synced_at = EXCLUDED.synced_at,
  synced_from = EXCLUDED.synced_from,
  imported_at = now();

DROP TABLE meal_records_import_staging;
