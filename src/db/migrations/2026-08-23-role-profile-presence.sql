CREATE TABLE IF NOT EXISTS app_roles (
  role_key TEXT PRIMARY KEY,
  label TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO app_roles (role_key, label, description) VALUES
  ('super_admin', 'Super Admin', 'Full project administration and role management.'),
  ('framework_coding_mod', 'NoteBooks-Framework [Coding] Mod', 'Moderates framework and coding contributions.'),
  ('content_mod', 'NoteBooks-Content Mod', 'Moderates content quality and publishing workflows.'),
  ('community_mod', 'Community Mod', 'Moderates community discussions and member safety.'),
  ('issues_mod', 'Issues Mod', 'Moderates issue proposals and issue workflow.'),
  ('science_supervisor', 'NoteBooks-Science Supervisor', 'Supervises the Science stream.'),
  ('commerce_supervisor', 'NoteBooks-Commerce Supervisor', 'Supervises the Commerce stream.'),
  ('humanities_supervisor', 'NoteBooks-Humanities Supervisor', 'Supervises the Humanities stream.'),
  ('science_volunteer', 'NoteBooks-Science Volunteer', 'Contributes approved Science stream work.'),
  ('commerce_volunteer', 'NoteBooks-Commerce Volunteer', 'Contributes approved Commerce stream work.'),
  ('humanities_volunteer', 'NoteBooks-Humanities Volunteer', 'Contributes approved Humanities stream work.'),
  ('framework_coding_volunteer', 'NoteBooks-Framework [Coding] Volunteer', 'Contributes approved framework and coding work.'),
  ('ai_notegen_volunteer', 'AI-NoteGen Volunteer', 'Supports AI-assisted note generation.'),
  ('ai_notechk_volunteer', 'AI-NoteChk Volunteer', 'Supports AI-assisted note checking.'),
  ('verified_member', 'Verified Member', 'A verified community member.')
ON CONFLICT (role_key) DO UPDATE SET label = EXCLUDED.label, description = EXCLUDED.description;

ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_color TEXT NOT NULL DEFAULT '#21d4a5';
ALTER TABLE users ADD COLUMN IF NOT EXISTS presence_status TEXT NOT NULL DEFAULT 'online';
ALTER TABLE users ADD COLUMN IF NOT EXISTS presence_updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_public BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE users ADD CONSTRAINT users_presence_status_check CHECK (presence_status IN ('online', 'dnd'));

CREATE TABLE IF NOT EXISTS user_roles (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_key TEXT NOT NULL REFERENCES app_roles(role_key) ON DELETE RESTRICT,
  assigned_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role_key)
);

CREATE INDEX IF NOT EXISTS user_roles_role_key_idx ON user_roles(role_key);
CREATE INDEX IF NOT EXISTS users_profile_public_idx ON users(profile_public) WHERE profile_public = true;
CREATE INDEX IF NOT EXISTS users_presence_status_idx ON users(presence_status);

INSERT INTO user_roles (user_id, role_key)
SELECT id, CASE WHEN role = 'admin' THEN 'super_admin' ELSE 'verified_member' END
FROM users
ON CONFLICT (user_id, role_key) DO NOTHING;

ALTER TABLE app_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE app_roles FROM anon, authenticated;
REVOKE ALL ON TABLE user_roles FROM anon, authenticated;
