---
name: turnstile-spin
description: Integrate Cloudflare Turnstile into existing NoteBooks Framework forms and server handlers. Use when adding, reviewing, or troubleshooting CAPTCHA protection.
---

# Turnstile integration

For Cloudflare's current setup workflow, first read https://developers.cloudflare.com/turnstile/spin/prompt.md and follow the existing-widget flow when a sitekey is supplied. Do not create a replacement widget unless requested.

## This project

- The account UI is in `src/components/account-auth.tsx`; the widget wrapper is `src/components/auth-captcha.tsx`.
- Auth signup, password login, confirmation resend, and password reset pass `captchaToken` to Supabase Auth. Supabase project CAPTCHA protection must be enabled with provider Turnstile and the widget secret.
- Email changes are verified by `src/app/api/account/email/route.ts` before the Supabase SDK call. Keep the PKCE confirmation flow intact.
- `src/app/api/account/auth-rate-limit/route.ts` and `src/lib/auth-rate-limit.ts` rate-limit app-driven signup, login, signup OTP verify/resend, password reset, and email changes through Upstash. Production requires the existing Upstash REST environment variables; fail closed if unavailable.
- The email signup OTP is eight digits. Keep `src/components/account-auth.tsx`, `supabase/config.toml`, and `supabase/templates/confirmation.html` consistent when its configured length changes.
- `src/lib/turnstile-verification.ts` makes server-side requests to Cloudflare Siteverify. Require `success`, expected action, and the expected hostname before continuing.
- The public site key is `NEXT_PUBLIC_TURNSTILE_SITE_KEY`; the server-only secret is `TURNSTILE_SECRET_KEY`. Never print or expose the secret.
- Production email actions must fail closed if the site key or server verification is unavailable. Local development may omit the widget only when local Supabase CAPTCHA protection is disabled.

## Verification

Run focused Turnstile tests, `pnpm typecheck`, `pnpm test`, and `pnpm build`. Do not claim live end-to-end validation until a fresh token succeeds against the deployed protected handler and replay of that token is rejected. Never trigger an email during validation unless the user explicitly requests it.
