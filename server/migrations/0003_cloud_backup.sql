-- Cloud backup (docs/superpowers/specs/2026-11-28-cloud-backup-design.md).
-- The server holds only ciphertext (in R2) and wrapped keys; it can never read a backup.

CREATE TABLE backup_keys (
  member_id INTEGER PRIMARY KEY REFERENCES members(id) ON DELETE CASCADE,
  pw_wrapped TEXT NOT NULL,       -- backup key wrapped with the password (JSON, v:1)
  admin_wrapped TEXT NOT NULL,    -- backup key wrapped for the admin recovery key (JSON, v:1, kid)
  key_id TEXT NOT NULL,           -- public id of the backup key; uploads must carry the same id
  updated_at INTEGER NOT NULL
);

-- Index of R2 objects: retention (3 newest per member) and the free-tier caps.
CREATE TABLE backups (
  object_key TEXT PRIMARY KEY,    -- backups/<memberId>/<timestamp>.bin
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  size INTEGER NOT NULL
);
CREATE INDEX backups_member ON backups(member_id, created_at);

-- Usage counters for the caps: 'up:<id>:<day>', 'up:all:<month>', 'down:<id>:<month>', 'stats:<id>:<day>'.
CREATE TABLE counters (
  key TEXT PRIMARY KEY,
  n INTEGER NOT NULL,
  at INTEGER NOT NULL             -- last change; rows older than 40 days are deleted
);

-- Anonymous exercise list: totals only, no member id, no dates, no weights.
CREATE TABLE exercise_stats (
  exercise_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sets INTEGER NOT NULL
);
