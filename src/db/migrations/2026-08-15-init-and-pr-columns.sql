-- Ensure base identity schema and GitHub-related tables/columns exist

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT,
  github_id TEXT,
  google_id TEXT,
  role TEXT NOT NULL DEFAULT 'user',
  totp_secret TEXT,
  backup_codes TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  password_reset_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS volunteer_groups (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_groups (
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  group_id INTEGER REFERENCES volunteer_groups(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, group_id)
);

CREATE TABLE IF NOT EXISTS admin_hierarchy (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  role TEXT NOT NULL,
  appointed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reset_tokens (
  token TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS reset_cooldowns (
  email TEXT PRIMARY KEY,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS community_posts (
  id SERIAL PRIMARY KEY,
  author_email TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  github_discussion_id TEXT,
  pr_number INTEGER,
  pr_url TEXT,
  pr_branch TEXT,
  pr_merged BOOLEAN DEFAULT false,
  pr_merged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS github_installations (
  id bigserial PRIMARY KEY,
  installation_id bigint UNIQUE NOT NULL,
  account_login text,
  account_type text,
  repository text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id bigserial PRIMARY KEY,
  delivery_id text UNIQUE NOT NULL,
  event_type text,
  received_at timestamptz NOT NULL DEFAULT now()
);
