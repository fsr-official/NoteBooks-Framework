-- Additive Community governance and message lifecycle foundation.
CREATE TABLE IF NOT EXISTS community_message_reports (
  id BIGSERIAL PRIMARY KEY,
  message_id BIGINT NOT NULL REFERENCES community_messages(id) ON DELETE CASCADE,
  reporter_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reporter_email TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed')),
  resolved_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (message_id, reporter_email)
);

CREATE TABLE IF NOT EXISTS community_moderation_events (
  id BIGSERIAL PRIMARY KEY,
  message_id BIGINT REFERENCES community_messages(id) ON DELETE SET NULL,
  channel_id INTEGER REFERENCES community_channels(id) ON DELETE SET NULL,
  actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  actor_email TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('flag', 'remove', 'restore', 'edit', 'report_resolve', 'report_dismiss')),
  reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_community_reports_status ON community_message_reports (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_community_reports_message ON community_message_reports (message_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_community_moderation_events_message ON community_moderation_events (message_id, created_at DESC);

ALTER TABLE IF EXISTS community_message_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS community_moderation_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON community_message_reports FROM PUBLIC;
REVOKE ALL ON community_moderation_events FROM PUBLIC;
