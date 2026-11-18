# NoteBooks AI Assistant: Tiered Model Routing

Design spec for the AI Assistant in NoteBooks. Users pick a difficulty tier (Low / Medium / High / Extra). Each tier maps to a model chain and a hard token cap. Requests are served through a pool of 5 Groq API keys with automatic fallback.

> **Status:** Low / Medium / High / Extra selection is implemented in the reader and enforced by `/api/ai/chat`. The server chooses a tier's primary model, output ceiling, and reasoning setting; it falls back to the second model on throttling or transient provider failures. Input history and note excerpts are trimmed to an approximate per-tier budget. Low is available anonymously; higher tiers require sign-in. Existing request-rate limits still apply; tier-specific daily quotas and shared model cooldowns are not implemented. Provider limits below were gathered Nov 2026 and may drift; verify them against the Groq console and response headers before relying on them.

---

## 1. Goals and constraints

- Free-tier only (for now). All inference goes through GroqCloud.
- Four user-facing tiers with different model and token budget.
- Survive exam-period traffic surges without hard failures.
- Keep AI requests behind a single route: `/api/ai/chat`.
- API keys never reach the client.

The binding constraint is **tokens per minute (TPM)**, not model context window. A model may accept 128K tokens, but a free key allows only 6K to 12K per minute.

---

## 2. Groq free-tier limits (reference)

Limits are **per organization** and **per model**. Extra keys on the same account do not add capacity. Separate accounts (separate orgs) do.

| Model | RPM | RPD | TPM | TPD |
|---|---|---|---|---|
| `llama-3.1-8b-instant` | 30 | 14,400 | 6K | 500K |
| `llama-3.3-70b-versatile` | 30 | 1,000 | 12K | 100K |
| `openai/gpt-oss-20b` | 30 | 1,000 | 8K | 200K |
| `openai/gpt-oss-120b` | 30 | 1,000 | 8K | 200K |
| `groq/compound` | 30 | 250 | 70K | n/a |

Sources disagree slightly on some models (Qwen3 32B, Llama 4 Scout), so they are excluded from the default registry. Add them only after checking the console.

Developer tier (card on file, no minimum spend) gives roughly 10x limits. This is the upgrade path if traffic outgrows the free pool.

---

## 3. Model groups

Models are grouped by the job they do, not by vendor. Tiers are built from groups.

| Group | Model | Use for |
|---|---|---|
| `fast` | `llama-3.1-8b-instant` | Definitions, reformatting, short Q&A, callout/Markdown cleanup |
| `balanced` | `openai/gpt-oss-20b` | Explanations, summaries, simple derivations |
| `prose` | `llama-3.3-70b-versatile` | Clear, well-written long explanations |
| `deep` | `openai/gpt-oss-120b` | JEE-style numericals, multi-step proofs |
| `agentic` | `groq/compound` | Optional web-search / large-context mode (opt-in, not a tier) |

---

## 4. Tiers

Rule: `maxIn + maxOut` must stay well under the model's TPM. Groq checks a request against TPM up front, so assume input plus max output both count. Keeping one request near the full TPM blocks that key for a minute.

For `gpt-oss-*`, reasoning tokens count as output. `maxOut` must cover reasoning plus the final answer.

| Tier | Chain (primary, then fallback) | maxIn | maxOut | Reasoning effort |
|---|---|---|---|---|
| **Low** | `llama-3.1-8b-instant`, `gpt-oss-20b` | 1,500 | 512 | n/a |
| **Medium** | `gpt-oss-20b`, `llama-3.1-8b-instant` | 2,500 | 1,000 | low |
| **High** | `llama-3.3-70b-versatile`, `gpt-oss-120b` | 4,000 | 1,500 | n/a |
| **Extra** | `gpt-oss-120b`, `llama-3.3-70b-versatile` | 3,500 | 3,000 | high |

Notes:
- Low is the default tier for everything.
- `llama-3.3-70b` has only 100K TPD per key, roughly 100 exchanges per key per day. Protect it by keeping High behind a daily per-user quota (see section 8).
- Extra uses about 6.5K tokens per request against an 8K TPM key, so each key serves about one Extra request per minute. With 5 keys that is about 5 per minute total.
- Do not stuff whole chapters into the prompt. Retrieve the 2 to 3 relevant sections (the per-repo `files.json` manifests make chunking easy) and send only those.

---

## 5. Key pool

- 5 API keys from 5 separate Groq accounts, so 5 independent rate-limit buckets.
- Stored as server-side env vars: `GROQ_API_KEY_1` ... `GROQ_API_KEY_5`.
- Combined free capacity (examples): gpt-oss-120b about 5,000 requests/day and 1M tokens/day.

Risks:
- Groq's terms may treat multiple accounts as limit evasion. Check before relying on this. A ban could remove the whole pool at once.
- Keep at least one fallback provider configured (even a stub) so the assistant degrades instead of dying.
- Never log full keys. Log the key index only.

---

## 6. Registry config

All model and tier data lives in one file. Tiers are views over the registry.

```ts
// src/ai/models.ts
export const MODELS = {
  "llama-3.1-8b-instant":    { group: "fast",     tpm: 6000,  rpd: 14400 },
  "openai/gpt-oss-20b":      { group: "balanced", tpm: 8000,  rpd: 1000 },
  "llama-3.3-70b-versatile": { group: "prose",    tpm: 12000, rpd: 1000 },
  "openai/gpt-oss-120b":     { group: "deep",     tpm: 8000,  rpd: 1000 },
} as const;

export type ModelId = keyof typeof MODELS;
export type TierName = "low" | "medium" | "high" | "extra";

export const TIERS: Record<TierName, {
  chain: ModelId[];
  maxIn: number;
  maxOut: number;
  effort?: "low" | "medium" | "high";
}> = {
  low:    { chain: ["llama-3.1-8b-instant", "openai/gpt-oss-20b"],     maxIn: 1500, maxOut: 512 },
  medium: { chain: ["openai/gpt-oss-20b", "llama-3.1-8b-instant"],     maxIn: 2500, maxOut: 1000, effort: "low" },
  high:   { chain: ["llama-3.3-70b-versatile", "openai/gpt-oss-120b"], maxIn: 4000, maxOut: 1500 },
  extra:  { chain: ["openai/gpt-oss-120b", "llama-3.3-70b-versatile"], maxIn: 3500, maxOut: 3000, effort: "high" },
};
```

---

## 7. Routing algorithm

`POST /api/ai/chat` with `{ tier, history, message, context, noteTitle, visitorId, webSearch }`.

1. Validate the tier (default `low`). Check the user's daily quota for that tier (section 8).
2. Retrieve and truncate context so the prompt fits `maxIn`.
3. Set `max_completion_tokens = maxOut`, and `reasoning_effort` if the tier defines one.
4. For each model in `chain`:
   1. Build the list of keys not currently cooling for that model.
   2. Pick the next key round-robin and call Groq.
   3. On `429`: read `retry-after`, put the `(key, model)` pair on cooldown for that duration, and try the next key.
   4. On `5xx` or timeout: retry once on a different key, then move on.
   5. On success: read `x-ratelimit-remaining-tokens` / `x-ratelimit-remaining-requests`. If remaining tokens are under about 10% of the limit, pre-emptively cool that pair for a short window.
5. If every model in the chain is exhausted, return `503` with `{ error: "tier_busy", suggest: <next lower tier> }`.

Cooldown state: a map keyed by `keyIndex:modelId` with an expiry timestamp.
- Serverless instances do not share memory. Either store it in Redis/KV or a small Supabase table, or rely purely on reactive 429 handling (acceptable at current scale).

---

## 8. Abuse and quota control

- Require login (Google OAuth is already in the stack). Anonymous users get Low only.
- Per-user daily caps by tier, for example: Low 100, Medium 40, High 15, Extra 5. Tune from real usage.
- Per-user rate limit (requests per minute) in front of the route.
- Enforce `maxIn` and `maxOut` server-side. Never trust a client-supplied cap.
- Surge mode: during announced exam windows, temporarily lower caps and hide Extra.

---

## 9. Environment variables

```
GROQ_API_KEY_1=
GROQ_API_KEY_2=
GROQ_API_KEY_3=
GROQ_API_KEY_4=
GROQ_API_KEY_5=
# Optional
COOLDOWN_STORE_URL=      # Redis/KV/Supabase for shared cooldown state
FALLBACK_PROVIDER_KEY=   # secondary provider, if configured
```

---

## 10. Observability

Log per request (no prompt content, no keys): tier, model used, key index, input/output tokens, latency, status, fallback depth. Track:
- 429 rate per `(key, model)`
- Tier-busy (503) rate
- Daily token burn per model against TPD limits

These tell you when to raise caps, add models, or move to the Developer tier.

---

## 11. Open items

- [ ] Verify each model's current limits in the console and update section 2.
- [ ] Confirm Groq's terms on multiple accounts.
- [ ] Decide on a shared cooldown store (Redis/KV vs Supabase vs reactive only).
- [ ] Decide whether `groq/compound` ships as an opt-in "Web" mode.
- [ ] Pick per-user daily quotas after a week of real traffic.
- [ ] Add a fallback provider.