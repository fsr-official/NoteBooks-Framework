-- Browser sessions are state containers, not authentication credentials.
CREATE TABLE IF NOT EXISTS browser_sessions (
  id BIGSERIAL PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  selected_theme_slug TEXT,
  custom_theme JSONB NOT NULL DEFAULT '{}'::jsonb,
  preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_browser_sessions_user_last_seen
  ON browser_sessions (user_id, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_browser_sessions_expiry
  ON browser_sessions (expires_at);
