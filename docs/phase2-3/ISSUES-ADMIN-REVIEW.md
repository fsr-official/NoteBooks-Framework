# Issues and Admin Review

## Scope

The Issues/admin collaboration slice connects source-aware Markdown reports to a reviewable proposal lifecycle. Community `issue-triage` messages may carry an `issueProposalId`, but the canonical proposal remains stored in `issue_proposals`; chat is context, not the authoritative change record.

## Proposal evidence

A proposal retains the source repository, branch, path, selected start/end lines, selected text, source commit, snippet hash, and immutable source snapshot. The review service can load the current repository file through the server-side GitHub client, compare the selected current range with the stored snapshot, and mark a proposal stale when the source commit or selected text no longer matches.

Approval is rejected with a conflict response when the source has changed. This prevents an administrator from approving a change against evidence that no longer represents the current repository state.

## Review entities

| Entity | Purpose |
|---|---|
| `issue_proposal_comments` | Authenticated discussion attached to one proposal. |
| `issue_proposal_reviews` | Append-only reviewer decisions, notes, proposed content, commit context, and stale status. |
| `issue_proposals` additions | Immutable snapshot text, capture timestamp, current commit, and stale indicator. |
| `community_messages.issue_proposal_id` | Optional link from `issue-triage` messages to a canonical proposal. |

Supported decisions are `triaged`, `request_changes`, `approved`, and `rejected`. A request for changes maps the proposal back to the triage state while preserving the reviewer record.

## API boundaries

| Method | Endpoint | Access | Purpose |
|---|---|---|---|
| `GET` | `/api/issues/review` | Administrator security gate | Lists bounded proposal review items. |
| `GET` | `/api/issues/:id/diff` | Administrator security gate | Loads original snapshot, current file, selected current lines, and stale state. |
| `GET` | `/api/issues/:id/comments` | Authenticated | Reads proposal discussion. |
| `POST` | `/api/issues/:id/comments` | Authenticated | Adds a bounded reviewer/contributor comment. |
| `POST` | `/api/issues/:id/review` | Administrator security gate | Records a decision, note, proposed content, and source state. |
| `POST` | `/api/issues/:id/pr` | Administrator security gate | Opens a repository PR only for an approved proposal. |

The PR route now rejects proposals that are not approved and returns an existing active lifecycle record on retry rather than intentionally creating a duplicate PR. The branch name is deterministic per proposal. GitHub OAuth identity, server-side GitHub credentials, and TOTP remain separate administrator requirements; no browser-held PAT is introduced.

## Admin UI

The admin control centre now includes an Issue proposal review card. It displays source metadata and stored evidence, loads a source diff on demand, supports reviewer comments, accepts proposed replacement content, and provides `Request changes`, `Reject`, and `Approve and open PR` actions. The client only receives data after the server-side administrator security gate succeeds.

The UI renders review text through DOM text nodes rather than trusting proposal content as HTML. Current source and proposed content are shown in bounded preformatted areas to preserve line-oriented review context.

## Verification

The source-evidence and Issues review boundaries pass focused regression tests. The final project suite passes with **30 test files and 86 tests**. Typecheck, client/server builds, portal and service-worker syntax checks, and the inline admin script syntax check pass. The service-worker cache is `webman-v20`. Community `issue-triage` messages support an optional validated proposal link, and approved reviews require replacement content before the PR endpoint can be invoked.

The active Supabase project contains the Issues review migration. The remaining production activation requirements are to configure Vercel's server-side database URL, link the administrator's GitHub identity, enroll TOTP, configure a narrowly scoped GitHub App or PAT, and exercise one staging proposal through review and PR creation. No real PR or merge operation was performed by local verification.

## Next boundary

The next hardening slice should add webhook reconciliation for PR and issue state, review-level audit events, stronger idempotency around partially created branches, a visual admin browser test, and explicit staging smoke tests with safe GitHub credentials.
