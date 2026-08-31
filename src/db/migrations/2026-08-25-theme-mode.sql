ALTER TABLE IF EXISTS browser_sessions
  ADD COLUMN IF NOT EXISTS selected_theme_mode TEXT NOT NULL DEFAULT 'dark';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'browser_sessions_theme_mode_check'
      AND conrelid = 'browser_sessions'::regclass
  ) THEN
    ALTER TABLE browser_sessions
      ADD CONSTRAINT browser_sessions_theme_mode_check
      CHECK (selected_theme_mode IN ('dark', 'light'));
  END IF;
END $$;
