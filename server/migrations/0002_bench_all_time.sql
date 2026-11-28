-- Bench is an all-time record (owner, 2026-11-28): one row per member and exercise.
-- Per-period bench rows are dropped; workouts stay per week/month in scores.
CREATE TABLE records (
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  exercise TEXT NOT NULL,          -- 'bench' (more lifts later)
  value REAL NOT NULL,             -- best DOTS points ever
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (member_id, exercise)
);
CREATE INDEX records_exercise ON records(exercise, value);
DELETE FROM scores WHERE metric = 'bench';
