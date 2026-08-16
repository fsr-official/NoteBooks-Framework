# Staging deployment (read-only File Service)

This guide describes how to deploy a staging instance with the File Service set to read-only, suitable for public testing.

1) Recommended environment variables for staging

- `DATABASE_URL` — production-like Postgres for identity and installations.
- `JWT_SECRET` — secret for tokens.
- `GITHUB_APP_ID` and `GITHUB_APP_PRIVATE_KEY` — if you want GitHub App automation enabled on staging.
- `USE_READ_ONLY_FILE_SERVICE=true` — when set, the app should avoid write paths to external storage.

2) Vercel deploy (recommended quick start)

- Add the repo to Vercel and set the environment variables in the Vercel project settings.
- Use the `Deploy Staging` GitHub Action in `.github/workflows/deploy-staging.yml` (it uses `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`).

3) Safety considerations

- Keep `GITHUB_APP_PRIVATE_KEY` secret and scoped only to staging via repository secrets.
- If you enable auto-merge (`GITHUB_APP_AUTO_MERGE=true`), ensure only trusted maintainers can approve posts.
