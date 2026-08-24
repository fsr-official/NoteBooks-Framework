-- Additive Community channel and messaging foundation.
-- Existing community_posts, profiles, and legacy forum code remain untouched.
CREATE TABLE IF NOT EXISTS community_channels (
  id SERIAL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'role')),
  allowed_role_keys TEXT[] NOT NULL DEFAULT '{}',
  archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS community_channel_members (
  channel_id INTEGER NOT NULL REFERENCES community_channels(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  membership_status TEXT NOT NULL DEFAULT 'member' CHECK (membership_status IN ('member', 'muted', 'banned')),
  last_read_at TIMESTAMPTZ,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (channel_id, user_id)
);

CREATE TABLE IF NOT EXISTS community_messages (
  id BIGSERIAL PRIMARY KEY,
  channel_id INTEGER NOT NULL REFERENCES community_channels(id) ON DELETE CASCADE,
  author_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  author_email TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'flagged', 'removed')),
  reply_to_id BIGINT REFERENCES community_messages(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  edited_at TIMESTAMPTZ,
  moderation_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_community_channels_active ON community_channels (archived, slug);
CREATE INDEX IF NOT EXISTS idx_community_messages_channel_time ON community_messages (channel_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_community_channel_members_user ON community_channel_members (user_id, channel_id);

INSERT INTO community_channels (slug, name, description, visibility, allowed_role_keys)
VALUES
  ('general', 'General', 'Open Community conversation and questions.', 'public', '{}'),
  ('announcements', 'Announcements', 'Important NoteBooks updates and notices.', 'public', '{}'),
  ('science', 'Science', 'Discussion around the Science stream.', 'public', '{}'),
  ('commerce', 'Commerce', 'Discussion around the Commerce stream.', 'public', '{}'),
  ('humanities', 'Humanities', 'Discussion around the Humanities stream.', 'public', '{}'),
  ('help', 'Help', 'Ask for help using NoteBooks and its libraries.', 'public', '{}'),
  ('issue-triage', 'Issue Triage', 'Discuss reported issues and source improvements.', 'role', '{issues_mod,community_mod,super_admin,verified_member}')
ON CONFLICT (slug) DO NOTHING;

ALTER TABLE IF EXISTS community_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS community_channel_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS community_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON community_channels FROM PUBLIC;
REVOKE ALL ON community_channel_members FROM PUBLIC;
REVOKE ALL ON community_messages FROM PUBLIC;
