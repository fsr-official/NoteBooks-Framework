CREATE TABLE IF NOT EXISTS system_events (
  id BIGSERIAL PRIMARY KEY,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'repository_added', 'repository_removed',
    'file_added', 'file_updated', 'file_removed',
    'folder_added', 'folder_removed',
    'issue_added', 'issue_updated',
    'community_post_published',
    'service_degraded', 'service_down', 'service_recovered'
  )),
  summary TEXT NOT NULL,
  repository TEXT,
  branch TEXT,
  path TEXT,
  source_url TEXT,
  dedupe_key TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_system_events_created ON system_events (created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS system_workflow_jobs (
  id BIGSERIAL PRIMARY KEY,
  job_type TEXT NOT NULL CHECK (job_type IN ('community_post', 'issue_proposal')),
  source_id BIGINT NOT NULL,
  target_repository TEXT NOT NULL,
  dedupe_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'delivered', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_at TIMESTAMPTZ,
  remote_id TEXT,
  remote_url TEXT,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (job_type, source_id)
);
CREATE INDEX IF NOT EXISTS idx_system_workflow_jobs_ready
  ON system_workflow_jobs (available_at, id)
  WHERE status IN ('pending', 'processing');

CREATE TABLE IF NOT EXISTS system_workflow_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS system_uptime_checks (
  id BIGSERIAL PRIMARY KEY,
  check_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('up', 'degraded', 'down')),
  response_ms INTEGER CHECK (response_ms IS NULL OR response_ms >= 0),
  duration_seconds INTEGER NOT NULL DEFAULT 0 CHECK (duration_seconds >= 0),
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_system_uptime_checks_time
  ON system_uptime_checks (checked_at DESC, id DESC);

ALTER TABLE issue_proposals
  ADD COLUMN IF NOT EXISTS publication_state TEXT NOT NULL DEFAULT 'queued';
UPDATE issue_proposals
SET publication_state = CASE WHEN note_books_issue_number IS NULL THEN 'queued' ELSE 'published' END
WHERE publication_state = 'queued';
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'issue_proposals_publication_state_check'
  ) THEN
    ALTER TABLE issue_proposals
      ADD CONSTRAINT issue_proposals_publication_state_check
      CHECK (publication_state IN ('queued', 'published', 'failed'));
  END IF;
END $$;

ALTER TABLE system_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_workflow_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_workflow_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_uptime_checks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON system_events, system_workflow_jobs, system_workflow_state, system_uptime_checks FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON system_events, system_workflow_jobs, system_workflow_state, system_uptime_checks FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON system_events, system_workflow_jobs, system_workflow_state, system_uptime_checks FROM authenticated;
  END IF;
END $$;
