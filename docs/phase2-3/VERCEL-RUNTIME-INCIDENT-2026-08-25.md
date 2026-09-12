# Vercel Runtime Incident: CommonJS/ESM Startup Failures

**Incident window:** 2026-08-25 20:32:20–20:32:30 UTC
**Project:** `notebooks-framework`
**Affected deployment:** `dpl_7dhwXcLDSrPbiRQUByYk6z8YQ1yU`
**Environment:** production
**Source:** Vercel Runtime Logs dashboard

## Observed failure

All four sampled public API requests returned HTTP 500 with `FUNCTION_INVOCATION_FAILED` before route-specific handlers could respond:

- `/api/dashboard`
- `/api/themes`
- `/api/session`
- `/api/config`

The runtime exception was:

```text
Error [ERR_REQUIRE_ESM]: require() of ES Module
/var/task/node_modules/@scure/base/index.js from
/var/task/node_modules/@otplib/plugin-base32-scure/dist/index.cjs not supported.
Instead change the require of index.js in
/var/task/node_modules/@otplib/plugin-base32-scure/dist/index.cjs
to a dynamic import() which is available in all CommonJS modules.
```

The exception occurred during CommonJS server-function initialization. Because the TOTP module was imported through the shared application composition path, even routes that do not perform TOTP work were unable to initialize.

## Root cause

The deployed application used `otplib@13.5.0`. Its CommonJS entrypoint reaches `@otplib/plugin-base32-scure`, whose CommonJS file attempts to require the ESM-only `@scure/base` package. This is incompatible with the CommonJS serverless function wrapper used by the affected deployment.

## Remediation applied

The TOTP implementation now uses `otplib@12.0.1`, whose default preset uses the CommonJS-compatible `@otplib/plugin-thirty-two` path instead of `@scure/base`. The wrapper was migrated from the otplib 13 functional API to the otplib 12 `authenticator` API:

- `authenticator.generateSecret()` creates the secret.
- `authenticator.keyuri(account, issuer, secret)` creates the provisioning URI.
- `authenticator.generate(secret)` creates test tokens.
- `authenticator.verify({ token, secret })` validates tokens and returns a boolean.

The unrelated Octokit ESM issue was also addressed independently by pinning `@octokit/rest` to `20.0.2` and `@octokit/auth-app` to `6.0.0`, retaining lazy loading through `src/lib/octokit-loader.ts`.

## Verification requirements

A fresh deployment must be built from the commit containing the otplib migration. After deployment, verify that `/version.json` reports the new commit prefix and that all of the following return successfully:

```text
/api/health
/api/config
/api/session
/api/themes
/api/dashboard
/settings
```

If another `ERR_REQUIRE_ESM` error occurs, obtain a new runtime-log export from the new deployment rather than reusing this incident’s logs. Record the first failing module path and package version before changing dependencies again.

## References

[1]: https://vercel.com/docs/logs/runtime "Vercel Runtime Logs"
[2]: https://www.npmjs.com/package/otplib "otplib package"
[3]: https://www.npmjs.com/package/@scure/base "@scure/base package"
