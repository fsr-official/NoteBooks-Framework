> **Document status:** historical implementation record. For current behavior, use [`docs/README.md`](../../README.md), the root [`README.md`](../../../README.md), and the active architecture/release documents.
>
# NoteBooks Deployment Recovery Runbook

This runbook addresses the failures observed on `fsr-official/NoteBooks-Framework` `main` at commit `a75f4a8`. The three blocking causes are independent: the integration migration ordering bug, missing Vercel Action credentials, and an empty webhook URL secret.

## 1. Choose one canonical deployment source

Before changing secrets, decide which pair is authoritative:

```text
GitHub repository: fsr-official/NoteBooks-Framework
Vercel project: the single intended staging/production project
```

The investigation saw a different Vercel project linked to `hsxtheemperor/NoteBooks-Science-Framework`, while the failing GitHub workflows run `fsr-official/NoteBooks-Framework`. Do not maintain two similarly named projects unless their separation is intentional and documented. In the intended Vercel project, confirm the Git integration, repository, branch, root directory `/`, build command `npm run build`, and framework setting `Other`/no framework preset.

If Vercel Git integration already deploys every push, either use that as the deployment authority or use the GitHub Actions deployment workflow. Avoid having both deploy the same branch without a deliberate preview/production policy.

## 2. Fix the fresh-database migration order

The current migration runner sorts files alphabetically. `2026-08-15-add-banned-until.sql` runs before `2026-08-15-init-and-pr-columns.sql`; its `CREATE INDEX ... ON users` statement fails because `users` does not exist yet.

The safest fix is to make `src/db/init_identity_schema.sql` an explicit migration-zero operation in `src/lib/db.ts`, before the dated migration loop. Record it in `schema_migrations` under a stable ID such as `0000-init-identity-schema`. Apply it in the same transaction style as the dated migrations, and then run the existing files. The baseline SQL is already idempotent with `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS`.

Do not simply rename a migration that may already be recorded in an existing deployment database. Applying the baseline once under a new stable ID is safer for both a fresh CI database and an existing database.

An alternative is to copy the base SQL into a file named `src/db/migrations/0000-init-identity-schema.sql`, but keeping one authoritative copy in `init_identity_schema.sql` and teaching the runner to apply it first avoids duplicated schema sources.

Run locally with a clean PostgreSQL database, not only the in-memory test fallback:

```bash
export DATABASE_URL='postgres://postgres:postgres@localhost:5432/postgres'
node src/scripts/migrate-db.js
npm run typecheck
npm run build
npm test -- --run
```

Then rerun the GitHub `Integration Tests` workflow. It must get past `Run DB migrations` before any test result is meaningful.

## 3. Configure the Vercel Action credentials

In the repository `fsr-official/NoteBooks-Framework`, open **Settings → Secrets and variables → Actions** and create repository secrets with these names:

```text
VERCEL_TOKEN
VERCEL_ORG_ID
VERCEL_PROJECT_ID
```

Create the token in the correct Vercel account/team and use the ID of the selected project. Do not print the values, put them in YAML, or test them by echoing them. If the workflow uses a GitHub Environment, place the secrets in that environment or remove the environment requirement.

The current workflow passes `prod: false` to `amondnet/vercel-action@v20`, but the action reports that `prod` is unsupported. Remove that input. For a preview/staging deployment, use the action’s supported `vercel-args` input only if needed, for example `--yes`; do not pass `--prod`. Use `--prod` only for an intentional production deployment.

The corrected action block should have this shape:

```yaml
- name: Deploy to Vercel (staging)
  uses: amondnet/vercel-action@v20
  with:
    vercel-token: ${{ secrets.VERCEL_TOKEN }}
    vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
    vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
    working-directory: ./
    vercel-args: '--yes'
```

The application’s runtime secrets are separate from the GitHub Action secrets. In the selected Vercel project, add the appropriate values for Preview and Production separately: `DATABASE_URL`, `JWT_SECRET`, `GITHUB_REPO`, `GITHUB_BRANCH`, and `APP_URL`. Community and Issues repository names are now read from the generated `GITHUB-REPOSITORIES.md` artifact; `GITHUB_COMMUNITY_REPO` and `GITHUB_ISSUES_REPO` remain compatibility fallbacks only. Add GitHub OAuth, GitHub App/PAT, reCAPTCHA, email, Redis, and webhook variables only when those features are being activated.

## 4. Configure or disable Notify App

`notify-app-example.yml` is intentionally manual-only and non-blocking for the current milestone. The former automatic path failed because `${{ secrets.APP_WEBHOOK_URL }}` expanded to an empty string and the runner executed `curl ... ""`.

If update notifications are wanted later, add the repository secret `APP_WEBHOOK_URL` containing the deployed application’s intended webhook endpoint and configure the corresponding server-side webhook secret contract. The current workflow already skips cleanly when the URL is absent; restore an automatic trigger only after the endpoint is verified.

The guarded form is:

```yaml
env:
  APP_WEBHOOK_URL: ${{ secrets.APP_WEBHOOK_URL }}
run: |
  if [ -z "$APP_WEBHOOK_URL" ]; then
    echo "APP_WEBHOOK_URL is not configured; skipping notification"
    exit 0
  fi
  curl --fail-with-body --retry 3 --max-time 15 \
    -H "Content-Type: application/json" \
    --data @- "$APP_WEBHOOK_URL" <<EOF
  {
    "signal": "github-${{ github.run_id }}",
    "type": "directory",
    "path": ".",
    "reason": "Push to main branch",
    "commitHash": "${{ github.sha }}",
    "branch": "${{ github.ref_name }}",
    "actor": "${{ github.actor }}",
    "timestamp": "$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
  }
  EOF
```

The unquoted heredoc is intentional here because the timestamp must be evaluated by the shell. Do not place any secret value in the JSON body or logs.

## 5. Push in a controlled order

Commit the migration fix and the workflow fixes together, or use separate small commits if you want isolated rollback. Push to a branch first and verify the Pull Request checks. After the checks pass, merge or push to `main` according to the repository policy.

The expected workflow sequence is:

```text
CI                         success
Integration Tests          success
Deploy Staging             success
Notify App of Updates      success, or cleanly skipped when disabled
```

The ordinary CI job already passed on the failing commit because it does not create a Postgres service or run migrations. Therefore, a successful ordinary CI run alone is not sufficient; the Integration Tests job must be green.

## 6. Verify the Vercel deployment

After Deploy Staging succeeds, open the deployment URL from the Action output and test:

```text
/
/settings
/dashboard              → should redirect to /settings#personal-space
/community
/issues
/api/config
/api/registry
```

Then verify authenticated database-backed paths with a real staging account. Do not test live PR creation until GitHub OAuth linkage, administrator TOTP, database persistence, and GitHub write permissions are all confirmed.

If the Vercel dashboard still shows a failed deployment ID, confirm that you are viewing the same Vercel team and project used by `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID`. A 404 from another account or team does not prove that the deployment itself is healthy or unhealthy.

## 7. Clean up warnings after deployment is green

After the blockers are fixed, update GitHub Actions to a currently supported Node version, preferably Node 22 or the project’s tested version, and rerun the suite. The application has migrated from the deprecated `@otplib` v12 API to `otplib` v13, and the production audit is clean after pinning the compatible `undici` 6.28.x patch through `overrides`. Continue running `npm run deps:check`; do not run `npm audit fix --force` blindly because it can introduce breaking changes.

## Final checklist

| Check | Required result |
|---|---|
| Canonical GitHub/Vercel project pair selected | One documented source of deployment truth |
| Migration zero applied before dated migrations | Fresh Postgres migration succeeds |
| `VERCEL_TOKEN` available to the workflow | Vercel action starts instead of failing input validation |
| Unsupported `prod` input removed | Staging/preview target is explicit and correct |
| `APP_WEBHOOK_URL` configured or workflow disabled/guarded | Notify workflow does not call `curl` with an empty URL |
| Vercel Preview/Production runtime variables configured | Database and protected features can operate |
| Integration Tests green | Fresh-schema behavior is verified |
| Staging smoke routes green | Deployment serves the expected application |
