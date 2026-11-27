-- Friends' ranking and accounts (docs/superpowers/specs/2026-11-27-ranking-design.md).
-- No body weight, sex, kilograms or workout details are stored here.

CREATE TABLE members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nick TEXT NOT NULL,
  nick_lower TEXT NOT NULL UNIQUE,
  client_salt TEXT NOT NULL,      -- PBKDF2 salt the phone uses (base64url)
  iterations INTEGER NOT NULL,    -- PBKDF2 iterations (raise for new passwords)
  server_salt TEXT NOT NULL,      -- per-member random salt (hex)
  hash TEXT NOT NULL,             -- SHA-256(server_salt || derived key), hex
  must_change INTEGER NOT NULL DEFAULT 0,
  share_workouts INTEGER NOT NULL DEFAULT 0,
  share_bench INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,    -- SHA-256 of the session token; the token itself is never stored
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  last_used INTEGER NOT NULL
);
CREATE INDEX sessions_member ON sessions(member_id);

CREATE TABLE scores (
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  metric TEXT NOT NULL,           -- 'workouts' | 'bench' (more lifts later)
  period TEXT NOT NULL,           -- '2026-W48' | '2026-11'
  value REAL NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (member_id, metric, period)
);
CREATE INDEX scores_period ON scores(metric, period);

CREATE TABLE attempts (
  key TEXT NOT NULL,              -- 'nick:<lower>' | 'ip:<sha256>' | 'join:<sha256>'
  at INTEGER NOT NULL
);
CREATE INDEX attempts_key ON attempts(key, at);
