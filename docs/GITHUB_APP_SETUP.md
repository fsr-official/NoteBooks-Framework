# GitHub App setup and CI secrets

This document explains how to configure the GitHub App credentials required for automation and how to store them in GitHub Actions secrets.

Required secrets (GitHub repository / organization secrets):
- `GITHUB_APP_ID` — the numeric App ID (e.g. 12345).
- `GITHUB_APP_PRIVATE_KEY` — the PEM private key for the app (multi-line). Store as a secret exactly as downloaded (beginning with -----BEGIN RSA PRIVATE KEY----- or -----BEGIN PRIVATE KEY-----).
- `DATABASE_URL` — optional, used by migrations/tests in CI if you have a real DB.
- `JWT_SECRET` — required by tests and the app.

Recommended additional secrets for staging deploy:
- `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` — when using Vercel for staging deploys.

How to add secrets with the `gh` CLI (example):

```bash
gh secret set GITHUB_APP_ID --body "12345"
gh secret set GITHUB_APP_PRIVATE_KEY --body "$(cat github-app-private-key.pem)"
gh secret set JWT_SECRET --body "$(openssl rand -hex 32)"
gh secret set DATABASE_URL --body "postgres://user:pass@host:5432/db"
```

Notes:
- The `GITHUB_APP_PRIVATE_KEY` is multiline — the GitHub Secrets UI and `gh` accept multiline content.
- For local development, set `GITHUB_APP_ID` and `GITHUB_APP_PRIVATE_KEY` in your shell or in your `.env` (do not commit secrets).
- CI will pass `GITHUB_APP_PRIVATE_KEY` into `GITHUB_APP` helpers; the code reads `process.env.GITHUB_APP_PRIVATE_KEY`.
