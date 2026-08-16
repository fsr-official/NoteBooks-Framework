# CI secret rotation and key management

Recommendations for managing and rotating CI secrets (GitHub App private keys, tokens):

- Use the GitHub App UI to generate/install a new private key and add it to repository secrets as `GITHUB_APP_PRIVATE_KEY`.
- Rotate the key by adding the new key to secrets first, then update the App to use the new key, then remove old keys.
- Automate detection of expired/removed keys by adding a health check endpoint that attempts an App authentication on a schedule.
- Store long-lived tokens (e.g. `VERCEL_TOKEN`) only in organization secrets and restrict repository access.
- Periodically audit repository and org secrets and require 2FA for maintainers who can view secrets.

Example rotation steps:

1. Generate new App private key in GitHub App settings.
2. Add new PEM to GitHub repository secrets as `GITHUB_APP_PRIVATE_KEY_NEW`.
3. Update deployment workflow to use `GITHUB_APP_PRIVATE_KEY_NEW` and deploy to staging.
4. Verify workflows succeed in staging, then rename secrets (or swap) to make the new key primary.
5. Revoke old key in GitHub App settings.
