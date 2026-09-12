-- Phase-2 persistence foundation for Supabase/PostgreSQL.
-- All application writes remain server-side through src/lib/db.ts.

ALTER TABLE IF EXISTS community_posts
  ADD COLUMN IF NOT EXISTS author_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_community_posts_author_user_id ON community_posts (author_user_id);

CREATE TABLE IF NOT EXISTS dashboard_activity (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  area TEXT NOT NULL CHECK (area IN ('workspace', 'community', 'issues', 'themes', 'account', 'admin')),
  action TEXT NOT NULL,
  stream TEXT,
  repository TEXT,
  file_path TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dashboard_activity_user_created ON dashboard_activity (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dashboard_activity_area_created ON dashboard_activity (area, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dashboard_activity_stream_created ON dashboard_activity (stream, created_at DESC);

CREATE TABLE IF NOT EXISTS theme_presets (
  id BIGSERIAL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  tokens JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_theme_presets_active ON theme_presets (is_active, name);

CREATE TABLE IF NOT EXISTS theme_preferences (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  visitor_key TEXT,
  preset_slug TEXT REFERENCES theme_presets(slug) ON DELETE SET NULL,
  tokens JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT theme_preferences_owner_check CHECK (user_id IS NOT NULL OR visitor_key IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_theme_preferences_user ON theme_preferences (user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_theme_preferences_visitor ON theme_preferences (visitor_key) WHERE visitor_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_theme_preferences_updated ON theme_preferences (updated_at DESC);

CREATE TABLE IF NOT EXISTS issue_proposals (
  id BIGSERIAL PRIMARY KEY,
  author_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  author_email TEXT,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  stream TEXT,
  source_repository TEXT NOT NULL,
  source_branch TEXT NOT NULL DEFAULT 'main',
  source_path TEXT NOT NULL,
  source_raw_url TEXT,
  note_books_issue_number INTEGER,
  note_books_issue_url TEXT,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'triaged', 'approved', 'rejected', 'pr_open', 'merged', 'closed', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_issue_proposals_status_created ON issue_proposals (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_issue_proposals_source ON issue_proposals (source_repository, source_path);
CREATE INDEX IF NOT EXISTS idx_issue_proposals_author ON issue_proposals (author_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS issue_votes (
  id BIGSERIAL PRIMARY KEY,
  issue_id BIGINT NOT NULL REFERENCES issue_proposals(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  value SMALLINT NOT NULL CHECK (value IN (-1, 1)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT issue_votes_one_per_user UNIQUE (issue_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_issue_votes_user ON issue_votes (user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_issue_votes_issue ON issue_votes (issue_id, value);

CREATE TABLE IF NOT EXISTS pr_lifecycle (
  id BIGSERIAL PRIMARY KEY,
  issue_id BIGINT NOT NULL REFERENCES issue_proposals(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'github',
  target_repository TEXT NOT NULL,
  target_branch TEXT NOT NULL DEFAULT 'main',
  source_branch TEXT NOT NULL,
  pr_number INTEGER,
  pr_url TEXT,
  state TEXT NOT NULL DEFAULT 'created' CHECK (state IN ('created', 'open', 'approved', 'rejected', 'merged', 'closed', 'failed')),
  provider_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pr_lifecycle_issue ON pr_lifecycle (issue_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pr_lifecycle_target ON pr_lifecycle (target_repository, state, updated_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_pr_lifecycle_provider_pr ON pr_lifecycle (provider, target_repository, pr_number) WHERE pr_number IS NOT NULL;

CREATE TABLE IF NOT EXISTS audit_events (
  id BIGSERIAL PRIMARY KEY,
  actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_events_created ON audit_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_actor_created ON audit_events (actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_resource ON audit_events (resource_type, resource_id, created_at DESC);

-- Defense in depth for any future Supabase Data API exposure. The current
-- Express server uses its server-side database credential and application auth.
DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['dashboard_activity', 'theme_presets', 'theme_preferences', 'issue_proposals', 'issue_votes', 'pr_lifecycle', 'audit_events'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE format('REVOKE ALL ON TABLE %I FROM anon, authenticated', table_name);
    END IF;
  END LOOP;
END $$;
