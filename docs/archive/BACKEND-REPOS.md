Backend repository mapping and mount configuration

- Community repository (discussions/posts): `fsr-official/NoteBooks-Community` (env: `GITHUB_COMMUNITY_REPO`)
- Issues repository (PRs/issues target): `fsr-official/NoteBooks-Issues` (env: `GITHUB_ISSUES_REPO`)

Subject-specific repository mapping (optional):
- Provide `SUBJECT_REPOS` environment variable as comma-separated `key=owner/repo` pairs.
  - Example: `SUBJECT_REPOS="science=fsr-science/NCERT-Science,commerce=fsr-commerce/NCERT-Commerce,hum=fsr-humanities/NCERT-Humanities"`
  - When set, the `/files.json` and `/api/files.json` manifest will present top-level folders for each subject and include the repo name as a child entry so clients can display segregated mounts.

Mount prefix (optional):
- Use `MOUNT_PREFIX` or `APP_BASE_PATH` to mount the workspace manifest under a top-level path (e.g., `/science`). This wraps the generated manifest under that prefix.

Notes:
- Admin role and ban endpoints are available at `/api/admin?action=assign-role|revoke-role|ban|unban` and are protected by `permissions.requireRole('admin')`.
- Admin actions are audited to `logs/admin-actions.log` as JSON lines.
