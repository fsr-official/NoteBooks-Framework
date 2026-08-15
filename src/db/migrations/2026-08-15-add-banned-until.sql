-- Add banned_until column to users for account suspension

ALTER TABLE IF EXISTS users
  ADD COLUMN IF NOT EXISTS banned_until TIMESTAMPTZ;

-- Add index for quick lookup
CREATE INDEX IF NOT EXISTS idx_users_banned_until ON users (banned_until);
