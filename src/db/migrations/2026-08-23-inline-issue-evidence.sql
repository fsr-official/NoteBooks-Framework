-- Additive evidence fields for source-aware Markdown Issue proposals.
-- The server remains the only write boundary; values are revalidated before insert.
ALTER TABLE IF EXISTS issue_proposals
  ADD COLUMN IF NOT EXISTS source_start_line INTEGER,
  ADD COLUMN IF NOT EXISTS source_end_line INTEGER,
  ADD COLUMN IF NOT EXISTS source_text TEXT,
  ADD COLUMN IF NOT EXISTS source_commit TEXT,
  ADD COLUMN IF NOT EXISTS source_snippet_hash TEXT;

ALTER TABLE IF EXISTS issue_proposals
  ADD CONSTRAINT issue_proposals_source_line_check
  CHECK (
    (source_start_line IS NULL AND source_end_line IS NULL)
    OR (source_start_line >= 1 AND source_end_line >= source_start_line AND source_end_line - source_start_line < 500)
  );

CREATE INDEX IF NOT EXISTS idx_issue_proposals_source_evidence
  ON issue_proposals (source_repository, source_path, source_start_line);
