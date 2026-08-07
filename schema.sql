CREATE TABLE IF NOT EXISTS songs (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  tempo INTEGER NOT NULL,
  time_sig_num INTEGER NOT NULL,
  time_sig_den INTEGER NOT NULL,
  key_tonic INTEGER NOT NULL,
  key_mode TEXT NOT NULL,
  key_label TEXT NOT NULL,
  key_confidence REAL NOT NULL,
  duration_seconds REAL NOT NULL,
  source_format TEXT NOT NULL,
  notes_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_songs_created_at ON songs (created_at DESC);
