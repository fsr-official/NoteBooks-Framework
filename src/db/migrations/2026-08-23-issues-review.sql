-- Additive Issues review and Community triage linkage.
ALTER TABLE IF EXISTS issue_proposals
  ADD COLUMN IF NOT EXISTS source_snapshot_text TEXT,
  ADD COLUMN IF NOT EXISTS source_snapshot_captured_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS current_source_commit TEXT,
  ADD COLUMN IF NOT EXISTS source_is_stale BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE IF EXISTS community_messages
  ADD COLUMN IF NOT EXISTS issue_proposal_id BIGINT REFERENCES issue_proposals(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_community_messages_issue_proposal ON community_messages (issue_proposal_id, created_at DESC);

CREATE TABLE IF NOT EXISTS issue_proposal_comments (
  id BIGSERIAL PRIMARY KEY,
  proposal_id BIGINT NOT NULL REFERENCES issue_proposals(id) ON DELETE CASCADE,
  author_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  author_email TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS issue_proposal_reviews (
  id BIGSERIAL PRIMARY KEY,
  proposal_id BIGINT NOT NULL REFERENCES issue_proposals(id) ON DELETE CASCADE,
  reviewer_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reviewer_email TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('triaged', 'request_changes', 'approved', 'rejected')),
  note TEXT NOT NULL DEFAULT '',
  proposed_content TEXT,
  original_commit TEXT,
  current_commit TEXT,
  current_source_text TEXT,
  source_is_stale BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_issue_proposal_comments_proposal ON issue_proposal_comments (proposal_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_issue_proposal_reviews_proposal ON issue_proposal_reviews (proposal_id, created_at DESC);

ALTER TABLE IF EXISTS issue_proposal_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS issue_proposal_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON issue_proposal_comments FROM PUBLIC;
REVOKE ALL ON issue_proposal_reviews FROM PUBLIC;
