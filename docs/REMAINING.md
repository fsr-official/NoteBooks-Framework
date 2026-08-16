# Remaining Work Before Production Readiness

This file now separates the work into two tracks:
- Backend work: production hardening and trust-boundary completion.
- Frontend/UI-UX work: polishing the actual website experience and browser testing flow.

The goal is to get the backend into a resilient production-ready state first, while opening a parallel frontend track so the real site can be tested and strengthened soon after.

## Current status snapshot

Completed since the last pass:
- Runtime config validation and startup fail-fast checks were added in src/lib/runtime-config.ts and wired into src/server/server.ts.
- The GitHub App automation path was hardened to avoid duplicate PR creation and unsafe re-merges in src/lib/github-app.ts.
- The app startup and route foundations are now substantially healthier than the earlier baseline.
- Cross-origin worker isolation was fixed for TikZJax/SharedArrayBuffer runtime compatibility so the browser can load the site more reliably.
- The project is passing the targeted regression tests for backend safety and runtime behavior.

The remaining work is now explicitly separated so it is no longer mixed with frontend polish.

---

## Backend production work still remaining

This section covers the operational, trust, and production-readiness work that must be completed before the platform can be treated as a serious backend service.

### 1. Production environment policy is still incomplete

Files involved:
- src/lib/runtime-config.ts
- src/server/server.ts
- src/lib/permissions.ts
- src/api/_shared.ts

Remaining work:
- Finalize the deployment matrix for local, staging, and production.
- Enforce secret rotation policy and required variable documentation.
- Ensure all production deployments fail before boot if required credentials are missing.
- Separate dev defaults from production-safe defaults in deployment automation.

Status:
- Startup validation is in much better shape, but deployment policy still needs a full production review.

### 2. Database layer still needs real production operations hardening

Files involved:
- src/lib/db.ts
- src/db/init_identity_schema.sql
- src/db/migrations/*

Remaining work:
- Add production SSL, pooling, retry policy, and startup health checks.
- Enforce migration ordering and staging verification before production use.
- Add backup/restore and retention documentation.
- Review indexes and query patterns for users, community_posts, admin_hierarchy, and webhook persistence.

Status:
- The schema and migrations are usable for development, but they are not yet production-operations hardened.

### 3. GitHub App lifecycle still needs full webhook validation against real payloads

Files involved:
- src/api/webhooks/github-app.ts
- src/lib/github-app.ts
- src/api/community.ts

Remaining work:
- Validate installation, repository, and permission-change events against real payloads.
- Confirm duplicate-delivery handling with GitHub retry semantics and replay windows.
- Add installation removal and repo membership edge-case handling.
- Log webhook state transitions with admin-reviewable metadata.

Status:
- The app auth flow and receiver are good, but production validation has not yet been fully exercised against live GitHub events.

### 4. PR and merge flow still needs lifecycle persistence and admin review

Files involved:
- src/api/community.ts
- src/lib/github-app.ts
- src/api/admin.ts
- src/api/submit-pr.ts

Remaining work:
- Persist PR lifecycle metadata beyond the current fields in community_posts.
- Add failure states for merge conflicts, branch mismatch, repo permission denial, and stale PRs.
- Add admin review messaging and audit trails for rejected or failed automations.
- Maintain a single source of truth for repository and installation identification across the write flow.

Status:
- The duplicate creation and unsafe re-merge issues have been fixed, but full lifecycle tracking still needs stronger production review support.

### 5. Auth and authorization still need product-grade enforcement

Files involved:
- src/lib/permissions.ts
- src/api/auth.ts
- src/api/admin.ts
- src/api/totp.ts
- src/api/oauth.ts

Remaining work:
- Add full JWT issuer/audience validation and stronger expiry policy.
- Review refresh/session handling if the app continues as JWT-based for long-lived sessions.
- Add CSRF protection and secure cookie policy for any cookie-based auth flows.
- Finalize the role matrix for volunteers, moderators, and admins.
- Harden GitHub OAuth and account recovery flows with stricter admin trust rules.

Status:
- The basics are working, but the authorization model is still not complete enough for production trust boundaries.

### 6. Rate limiting and abuse protection still need one backend policy

Files involved:
- src/server/server.ts
- src/api/auth.ts
- src/api/community.ts
- src/api/submit-pr.ts

Remaining work:
- Standardize rate limits across all /api/* routes.
- Split limits by auth, webhook, admin, and submission traffic.
- Add per-user and per-IP controls for failed logins, TOTP failures, and repeated PR submissions.
- Record abuse events in structured logs.

Status:
- Some route protection exists, but a single documented production-wide policy is still missing.

### 7. Audit logging and metrics need to become production monitoring

Files involved:
- src/lib/metrics.ts
- src/server/server.ts
- src/api/admin.ts
- logs/*

Remaining work:
- Upgrade metrics into a real operational monitoring surface.
- Add structured logs for auth, moderation, admin actions, GitHub App actions, and webhook failures.
- Add retention and rotation policy for logs and admin actions.
- Connect health checks to DB, GitHub API, and webhook signals.

Status:
- The project has basic metrics and health responses, but they are not yet robust enough for production observability.

### 8. Moderation and community governance still need operational maturity

Files involved:
- src/api/community.ts
- src/api/admin.ts
- src/db/init_identity_schema.sql

Remaining work:
- Add hold/flag/review queue semantics and immutable moderation records.
- Restrict moderation actions to trusted admin roles.
- Add privacy-safe handling for user identity in public moderation flows.
- Finalize a written governance policy for disputed posts and takedowns.

Status:
- Moderation functions exist and work at a basic level, but they are not yet governance-ready.

### 9. Volunteer and subject-scoped submission pipeline still needs stricter enforcement

Files involved:
- src/api/community.ts
- src/api/submit-pr.ts
- src/api/pr-review.ts
- src/server/server.ts

Remaining work:
- Enforce subject-scoped repository rules and access checks consistently.
- Add review queue semantics for PRs, comments, and approval outcomes.
- Add invalid-submission handling and auto-close logic.
- Add review-history tracking for volunteer and admin submissions.

Status:
- The pipeline works, but it is not yet hardened enough for broad volunteer operations.

### 10. Privacy, retention, and account lifecycle still need policy controls

Files involved:
- src/api/auth.ts
- src/api/totp.ts
- src/db/init_identity_schema.sql
- src/api/forum.ts

Remaining work:
- Define storage policy for emails, GitHub IDs, TOTP secrets, backup codes, and moderation records.
- Ensure public APIs never return sensitive identity fields.
- Publish a retention and account-deactivation workflow.
- Review public exposure risk from moderation and contributor flows.

Status:
- The app stores needed identity data, but privacy and retention controls are still incomplete.

### 11. Security review checklist still needs a formal pass

Files involved:
- src/server/server.ts
- src/api/*
- src/lib/*

Remaining work:
- Validate input sanitization and route-level validation across all write paths.
- Review path protections, outbound fetch safety, secret scanning, dependency advisories, and host policies.
- Confirm least-privilege enforcement across admin routes and write actions.

Status:
- Security basics are in place, but a formal production security review is still outstanding.

### 12. Staging validation and rollback rehearsal still remain

Files involved:
- docs/PHASE-PLANS.md
- docs/archive/ARCHITECTURE.md
- deployment configuration

Remaining work:
- Validate the app in a staging environment with production-like secrets and system constraints.
- Rehearse rollback steps for GitHub App config, DB migrations, and deployment changes.
- Confirm correct behavior under real traffic and webhook replay conditions.

Status:
- Local validation is strong, but staging-level production rehearsal is still not complete.

### Backend deliverables before launch

- [ ] Production environment matrix and fail-fast secret policy
- [ ] Production-grade DB operations and migration policy
- [ ] Full GitHub App lifecycle validation against real webhook payloads
- [ ] PR lifecycle persistence and admin review state
- [ ] Role/permission matrix enforcement for all write paths
- [ ] Unified rate limiting and abuse protection policy
- [ ] Structured logging and production monitoring
- [ ] Moderation governance and review queue maturity
- [ ] Volunteer submission policy and subject-scoped enforcement
- [ ] Privacy + retention + account deactivation policy
- [ ] Security review and remediation pass
- [ ] Staging rehearsal and rollback checklist

### Recommended backend rollout order

1. Final production env and secret policy
2. DB production operations and migration safety
3. Webhook lifecycle validation and admin observability
4. PR lifecycle and review/audit maturity
5. Auth and permission hardening
6. Moderation, volunteer policy, and privacy controls
7. Staging validation and rollback rehearsal

---

## Frontend and UI/UX work to start in parallel

This section covers the actual website experience, browser validation, and UI work that should begin soon so the app can be tested as a real user-facing product instead of only as a backend system.

### 1. Core website structure and information flow

Remaining work:
- Define the landing page hierarchy and site narrative.
- Make the subject pages feel distinct while still consistent with the brand.
- Ensure the primary user journeys are obvious: browse, read, contribute, review, and ask for help.

Status:
- The app shell exists and routes load, but the site still needs a clearer UX structure and narrative flow.

### 2. Homepage and landing page UX

Remaining work:
- Improve the hero section, subject entry points, trust signals, and first-run clarity.
- Add stronger guidance for subject access, community use, and issue reporting.
- Make the homepage feel like a real app rather than a shell with raw route plumbing.

Status:
- Functional but not yet product-ready from a public UX perspective.

### 3. Subject page experience

Remaining work:
- Refine each subject section for readability, hierarchy, and navigation.
- Add consistent content cards, category grouping, and clear action affordances.
- Ensure subject-level pages feel intentional and not generic.

Status:
- Subject routes are working, but the experience still needs stronger product-level design decisions.

### 4. Community and issue UX

Remaining work:
- Make community posting, moderation states, and issue submissions intuitive.
- Add clearer visual states for approval, rejection, and review in progress.
- Ensure users can understand what is public, pending, or administrative without confusion.

Status:
- Backend flows exist, but the frontend workflow needs better user-facing clarity and testing.

### 5. Authentication and account experience

Remaining work:
- Improve login, signup, TOTP enrollment, and account recovery flows.
- Add better validation messaging and success/failure states.
- Reduce friction in onboarding while maintaining security boundaries.

Status:
- Auth works functionally, but the UX is still rough and should be tightened before user testing.

### 6. Mobile and responsive behavior

Remaining work:
- Run the app across common mobile viewports and breakpoints.
- Fix layout issues, spacing, touch targets, and subject navigation on small screens.
- Ensure critical flows remain usable without desktop assumptions.

Status:
- The app has the basics, but mobile testing is still an outstanding frontend requirement.

### 7. Visual consistency and design polish

Remaining work:
- Standardize typography, spacing, cards, buttons, forms, and navigation.
- Improve theme consistency across light and dark modes.
- Define a coherent visual language for academic content and admin workflows.

Status:
- The site is functional, but it still lacks a consistent visual identity and product polish.

### 8. Browser and runtime frontend validation

Remaining work:
- Test the site in real browsers for rendering, route persistence, worker behavior, and CSS issues.
- Validate the TikZJax, Markdown, Mermaid, and MathJax rendering flows under browser conditions.
- Confirm asset loading, caching, and offline fallback behavior work in practice.

Status:
- Browser runtime issues have been improved, but a broader real-browser validation pass is still needed.

### 9. Accessibility and usability pass

Remaining work:
- Improve keyboard navigation, focus states, form labeling, and contrast.
- Ensure content is readable and usable for a broad range of users.
- Review the site from a novice user perspective.

Status:
- Not yet complete; this should be part of the frontend validation pass.

### 10. Frontend testing and QA checklist

Remaining work:
- Test homepage flow, subject access, community posting, issue creation, authentication, and admin surfaces.
- Validate content rendering across browsers and network conditions.
- Capture known bugs and regressions for the product-ready pass.

Status:
- The frontend is not yet fully QA-tested as a real product experience.

### Frontend deliverables

- [ ] Landing page and core site narrative
- [ ] Subject page UX and navigation refinement
- [ ] Community and issue workflow UX
- [ ] Authentication UX and recovery flow improvements
- [ ] Mobile responsiveness and viewport QA
- [ ] Visual consistency and theme polish
- [ ] Browser runtime validation across real user flows
- [ ] Accessibility review and usability improvements
- [ ] Frontend QA checklist and regression tracking

### Recommended frontend sequence

1. Strengthen homepage and subject page structure
2. Improve auth and contribution UX
3. Fix mobile and responsive issues
4. Validate browser rendering and worker/runtime behavior
5. Run accessibility and usability pass
6. Final product QA before launch

---

## Recommended combined execution order

1. Finish backend production hardening and operational guardrails.
2. Run a full browser-facing smoke test on the live site.
3. Start frontend polish and UX improvements in parallel with backend validation.
4. Use the front-end pass to strengthen the actual website experience and catch product-level issues.
5. Only then do the final launch readiness checks for both backend and frontend together.

## Final note

This project should not be treated as a pure backend-only system or a pure frontend-only product. It is a hybrid platform: the backend must be production-safe before a serious launch, while the frontend must be strengthened soon after so the real website can be tested as a customer-facing experience.

The backend remains the critical trust and operations layer. The frontend now gets its own explicit track so it can move forward without being blocked by backend hardening work, while still preserving a clear launch-readiness sequence.
