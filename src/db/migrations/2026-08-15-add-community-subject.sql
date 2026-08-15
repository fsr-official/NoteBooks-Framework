-- Add subject column to community_posts to track subject context

ALTER TABLE IF EXISTS community_posts
  ADD COLUMN IF NOT EXISTS subject TEXT;

CREATE INDEX IF NOT EXISTS idx_community_posts_subject ON community_posts (subject);
