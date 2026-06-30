CREATE TABLE IF NOT EXISTS meal_records (
  id text PRIMARY KEY,
  meal_name text,
  meal_type text NOT NULL,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  duration_minutes integer,
  alcohol boolean NOT NULL DEFAULT false,
  note text,
  has_photo boolean NOT NULL DEFAULT false,
  created_at timestamptz,
  updated_at timestamptz,
  synced_at timestamptz,
  synced_from text,
  imported_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS meal_records_start_at_idx ON meal_records (start_at);
CREATE INDEX IF NOT EXISTS meal_records_meal_type_idx ON meal_records (meal_type);
CREATE INDEX IF NOT EXISTS meal_records_alcohol_idx ON meal_records (alcohol);
