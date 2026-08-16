con

# Phase Plan: Staged Upgrade to the Unified Architecture

This document turns the architecture summary in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) into a practical delivery sequence. The platform is split into a public read-only File Service and a set of account-bearing write-path services, and the rollout should respect that trust boundary.

## Phase 0 — Architecture freeze and decision lock

Goal: make the target design explicit before implementation begins.

- Confirm the final path-based domain model: /science, /commerce, /humanities, /community, /issues, /volunteers, /admin.
- Confirm the public trust boundary: the File Service remains anonymous and read-only.
- Confirm the shared identity model: a single Postgres-style identity store for the write-path services.
- Confirm the decision set: GitHub App for automated writes, GitHub OAuth for admins/moderators, JWT-based local auth for community/issue/volunteer accounts, and Redis only for sessions and ephemeral caches.
- Confirm governance expectations: public takedown discussion and a committee-based decision process.
- Confirm the technical standards: GPL-3.0 licensing, DOM sanitization, CSRF protections, and interactive markdown block restrictions.

Acceptance gate: architecture is signed off, open risks are documented, and no implementation begins without the final trust boundaries in place.

## Phase 1 — File Service stabilization and raw-read pipeline

Goal: make the public content layer fast and resilient before account-bearing capabilities are enabled.

- Replace the old GitHub API-driven content path with a raw CDN-first delivery model.
- Standardize `files.json` schema metadata and support legacy manifests without breaking clients.
- Preserve read-only public behavior for note previews, search, cross-repo aggregation, and offline browsing.
- Keep a refresh pipeline that invalidates manifest state on content change without exposing write credentials to the public layer.
- Harden reliability: last-known-good manifests, fallback behavior, cache headers, and graceful 404 handling.

Acceptance gate: the public layer is stable, fetch-resilient, and independent from write-path services.

## Phase 2 — Shared identity and session foundation

Goal: create the single source of truth for who a user is and what they are allowed to do.

- Stand up the Postgres-class identity store for users, volunteer memberships, and admin hierarchy.
- Add local account auth, JWT sessions, and TOTP-based volunteer verification.
- Add GitHub OAuth for admin and moderator identity.
- Add cookie hardening and CSRF protections across all state-changing routes.
- Centralize rate limiting and logging for write-path APIs.

Acceptance gate: users can authenticate consistently across the write-path sections with correct permission enforcement.

## Phase 3 — Community and issue system rollout

Goal: enable public community discourse and issue tracking without letting those flows leak into the File Service.

- Set up the shared `notebooks-community` Discussions repo and categories for each subject plus policy discussion.
- Wire bot-authored forum posting through the GitHub App and keep public attribution consistent.
- Establish moderation controls with GitHub OAuth and minimal lock/pin/delete permissions.
- Set up the suggestions/issue repo and triage labels for reports, bugs, and upgrade requests.
- Implement the public takedown request flow and committee resolution path.

Acceptance gate: a registered user can post, a moderator can triage, and a public dispute flow is visible and reviewable.

## Phase 4 — Volunteer and admin submission pipeline

Goal: enable fieldwork contribution and subject review.

- Turn on the volunteers section with strict verification and mandatory 2FA.
- Add PR-based contribution intake for notes, reference books, and AI-parsed materials.
- Apply subject-scoped admin review and merge rights.
- Define Technical Admin and Overall Admin authority boundaries.
- Make automated repo writes go through the single GitHub App and shared rate-limit-aware client.

Acceptance gate: a verified volunteer can submit work and a subject or overall admin can review it through the proper workflow.

## Phase 5 — Interactive content and AI-assisted markdown intake

Goal: support richer educational content while keeping public rendering safe.

- Add a minimal infrastructure for approved markdown blocks such as quizzes, flashcards, accordions, and Desmos embeds.
- Maintain a strict allowlist and sanitization policy.
- Document the `ai-markdown-parser` workflow and versioned skill files.
- Add review gates around AI-generated structured Markdown before publication.

Acceptance gate: new interactive blocks are render-safe and content review remains controlled.

## Phase 6 — Production hardening, launch, and rollback

Goal: cut over only when each layer is stable under real traffic.

- Validate refresh flows, rate limits, cache behavior, and public read paths.
- Validate auth flows, cookie scope, CSRF enforcement, and GitHub App use.
- Validate governance and moderation flows for takedown disputes.
- Add monitoring for health, invalidations, failed fetches, and error spikes.
- Run a staged dark launch and cutover with rollback plan and content freeze protections.

Acceptance gate: launch is backed by operational evidence, monitoring, and rollback procedures.

---

## Progress Snapshot (automatically maintained by the developer agent)

- **Completed:** Phase 1 (File Service stabilization), Phase 2 (identity & auth foundation), Phase 3 (Community initial), core GitHub App helper and wiring.
- **In-progress:** Phase 4 (Volunteer/admin submission pipeline) — PR intake automation and safe merge paths; staging deploy wiring.
- **Pending / Next:** Phase 4 completing PR persistence and webhook verification (this change), Phase 5 (interactive content), Phase 6 (hardening & launch).

## Unified TODO (short actionable list)

- [X]  Phase 1: File Service stabilization — implemented and tested.
- [X]  Phase 2: Shared identity and session foundation — implemented and tested.
- [X]  Phase 3: Community endpoints, moderation, and basic GitHub App helpers — implemented and tested.
- [X]  Add GitHub App helper library and basic automation wiring.
- [X]  Add webhook receiver to persist installations.
- [X]  Add CI workflows and staging docs.
- [X]  Add webhook signature verification (this PR) — implemented.
- [X]  Persist PR metadata in DB when creating PRs from community posts (this PR) — implemented.
- [ ]  Persist installation IDs and add webhook handler to handle updates/removed events (expand).
- [ ]  Add webhook signature verification for other webhook types and verify delivery retries.
- [ ]  Add DB-backed PR metadata indexing and admin UI for PR review/merge history.
- [ ]  Add mocked integration tests for GitHub App flows (Octokit mocks).
- [ ]  Add production CI secrets and rotateable key management instructions.
- [ ]  Deploy staging with read-only File Service and test GitHub App flows in staging.

Notes: the repository contains `docs/phases/*` skeletons with per-phase checklists to guide further work.

## Recommended delivery order

1. Phase 0 — architecture freeze
2. Phase 1 — File Service stabilization
3. Phase 2 — identity and auth foundation
4. Phase 3 — Community and Issues
5. Phase 4 — Volunteers and Admin
6. Phase 5 — interactive content pipeline
7. Phase 6 — production hardening and launch

This order keeps the public-facing reading experience stable before user accounts and write actions are introduced, reducing risk while aligning the platform to the intended target architecture.

## Scope boundaries

Included:

- path-based routing across a single domain
- three public read-only sections
- four account-bearing sections sharing one identity model
- GitHub App automation and shared rate-limit patterns
- governance, moderation, and content-review work
- volunteer contribution and admin review flows
- production readiness and rollback planning

Excluded:

- collapsing back into a monolith
- introducing a second identity source
- granting write credentials to the File Service
- changing the confirmed trust boundaries

## Exit criteria for each phase

Each phase should finish with a real validation pass: working functionality, operational checks, and a documented rollback path. The project should only move forward when the previous phase is stable enough to support the next layer of risk.
