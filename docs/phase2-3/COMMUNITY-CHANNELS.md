> **Document status:** historical implementation record. For current behavior, use [`docs/README.md`](../../README.md), the root [`README.md`](../../../README.md), and the active architecture/release documents.
>
# Community Channels and Messaging

## Scope

Community channels are an additive layer over the existing `community_posts`, profile/presence, moderation, and dormant forum contracts. The first release provides public conversation channels, one role-restricted issue-triage channel, authenticated messages, and per-user read markers.

The initial seeded channels are `general`, `announcements`, `science`, `commerce`, `humanities`, `help`, and `issue-triage`. The first six are public. `issue-triage` is visible to `verified_member`, `issues_mod`, `community_mod`, and `super_admin` roles; administrator compatibility also recognizes the legacy `admin` role.

## Durable model

| Entity | Purpose |
|---|---|
| `community_channels` | Channel identity, description, visibility, allowed role keys, and archive state. |
| `community_channel_members` | Optional membership state, including muted/banned status and the user’s last-read timestamp. |
| `community_messages` | Authored channel messages, reply references, moderation status, timestamps, and audit-compatible moderation reason fields. |

The migration is additive and preserves legacy `subject` fields and existing Community post/PR fields. Row-level security is enabled and public table grants are revoked; the application server remains the controlled data boundary.

## API contract

| Method | Endpoint | Access | Behavior |
|---|---|---|---|
| `GET` | `/api/community/channels` | Public plus role-aware filtering | Lists active channels visible to the requester. |
| `GET` | `/api/community/channels/:slug/messages` | Public channels are public; role channels require a permitted role | Returns bounded, non-removed messages in chronological display order. |
| `POST` | `/api/community/channels/:slug/messages` | Authenticated and permitted users | Validates length and interactive blocks, sanitizes content, and creates a message. |
| `POST` | `/api/community/channels/:slug/read` | Authenticated and permitted users | Records the user’s read timestamp for unread-state support. |

Message responses expose a display-safe author label rather than the author’s email address. The API rejects unauthenticated writes, empty or oversized messages, invalid replies, and banned channel members. Moderation transitions remain a separate follow-up slice so ordinary messaging does not bypass the existing administrator security boundary.

## UI

The Community portal now includes a channel workspace with a channel list, active room, message history, authenticated composer, read-state update, and responsive mobile layout. Public visitors can read public channels. Sending is disabled until a valid authenticated session is available. Existing feed, profile, presence, and issue navigation remain present below the channel workspace.

## Verification

The focused channel suite passes with three tests covering public visibility, role-restricted visibility, authentication, message validation, message creation, message listing, and read markers. The full project suite passes with **29 test files and 82 tests**. Typecheck, client/server builds, JavaScript syntax checks, and the v17 service-worker contract also pass. A production-shaped local HTTP smoke test returned `200` for the Community page, channel endpoint, portal JavaScript, and stylesheet; unauthenticated message creation returned `401` and unauthenticated issue-triage access returned `401`.

## Next phase

The next implementation slice should add channel moderation and governance: report/flag actions, moderator queues, message removal with immutable audit events, edit/delete rules, rate limits, unread counts rather than only read timestamps, and browser verification of signed-in and signed-out Community journeys. The Issues/admin phase can then connect issue-triage messages to source-aware Issue proposals and admin diff review without making chat the authoritative issue record.


## Governance and moderation

Community governance is now additive to the channel/message layer. `community_message_reports` stores one open report per reporter/message pair, while `community_moderation_events` is append-only and records message moderation and report-resolution actions. The event table is deliberately separate from mutable message state so moderator history remains auditable.

Authenticated members can report a message with a bounded reason. Moderators are limited to `super_admin`, `community_mod`, `issues_mod`, and `content_mod` roles, with legacy `admin` compatibility preserved by the authorization helper. Moderators can list open reports and resolve or dismiss them. They can also flag, remove, or restore messages. Removed messages are excluded from ordinary message history; their moderation records remain available to the governance layer.

The portal shows a Report action only for signed-in users, loads a server-authorized moderator queue, and provides resolution controls when the server confirms moderator access. Channel navigation displays per-channel unread counts for signed-in users, and opening a channel records a read marker. Public visitors continue to see public channel history but do not receive private unread state or write controls.

## Verification update

The focused Community channel suite now covers public and role-restricted channel visibility, authenticated message creation, validation, read markers, unread counts, report creation, moderator queue authorization, message removal, and report resolution. The final full suite passes with **29 test files and 83 tests**. Typecheck, client/server builds, portal and worker syntax checks, and the v18 service-worker release contract pass.

The next product boundary is the source-aware Issues/admin workflow: link `issue-triage` messages to Markdown evidence, add moderator/reviewer comments, show original/current/proposed diffs, and route approved changes through protected Octokit PR creation. Real-time transport, message edit/delete UX, unread notification fan-out, and deeper rate limiting remain future hardening slices rather than hidden assumptions in this release.
