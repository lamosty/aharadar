# Task 004 — `feat(x_posts): fetch post-level raw items via provider`

- **Owner**: Claude Code Opus 4.5 (implementer)
- **Reviewer**: GPT‑5.2 xtra high
- **Driver**: human (runs commands, merges)

## Goal

Implement `x_posts` fetching so it emits **one raw item per post** returned by the provider (Grok initially). No bundles.

Cadence (how often to fetch) must be handled by the pipeline ingest stage (ADR 0009), not by the connector.

## Depends on

- Task 001 (cadence gating) merged
- Task 002 (provider extraction) merged
- Task 003 (x_posts scaffold) merged

## Read first (required)

- `AGENTS.md`
- `CLAUDE.md`
- `docs/adr/0010-x-posts-canonical-via-grok.md`
- `docs/adr/0009-source-cadence.md`
- `docs/connectors.md` (x_posts spec)
- Code:
  - `packages/connectors/src/x_posts/fetch.ts`
  - shared Grok provider module (from Task 002)
  - `packages/connectors/src/signal/fetch.ts` (reference for query compilation + limits)

## Scope (allowed files)

- `packages/connectors/src/x_posts/fetch.ts`
- `packages/connectors/src/x_posts/config.ts` (if required)
- (optional) shared helper module if you need to reuse query compilation between signal and x_posts

Do not change pipeline logic here.

## Implementation steps (ordered)

1. Parse config for queries:
   - If `queries` is present, use it.
   - Else compile queries from `accounts/keywords` with the same hygiene filters (`excludeReplies`, `excludeRetweets`).
2. Respect `limits.maxItems` by splitting budget across queries:
   - `perQueryBudget = floor(maxItems / queryCount)` bounded to at least 1
   - `limit = min(config.maxResultsPerQuery, perQueryBudget)`
3. For each query:
   - Call the provider `grokXSearch({ query, limit, sinceId, sinceTime, ... })`
   - Parse provider `assistantJson.results` array
   - For each result item, push a raw item shaped like:

```json
{
  "kind": "x_post_v1",
  "provider": "x_search",
  "vendor": "grok",
  "query": "...",
  "windowStart": "...",
  "windowEnd": "...",
  "date": "YYYY-MM-DD",
  "url": "https://x.com/.../status/...",
  "text": "..."
}
```

4. Cursor behavior:
   - If any provider call succeeds, advance `since_time` to `windowEnd` (best-effort).
   - Do not add bespoke “once per day” guards here (cadence does that).
5. Provider call accounting:
   - Return `providerCalls` in `fetchResult.meta` similar to signal fetch (so pipeline persists `provider_calls` rows).

## Acceptance criteria

- [ ] `fetch()` returns post-level raw items (not bundles).
- [ ] Respects `limits.maxItems`.
- [ ] `pnpm -r typecheck` passes.
- [ ] Manual smoke: `admin:run-now --source-type x_posts` fetches (if env configured) and does not crash.

## Test plan (copy/paste)

```bash
pnpm -r typecheck
pnpm dev:cli -- admin:run-now --source-type x_posts --max-items-per-source 20
```

## Commit

- **Message**: `feat(x_posts): fetch post-level raw items via provider`
- **Files expected**:
  - `packages/connectors/src/x_posts/fetch.ts`
  - (optional) config/helper adjustments

## Final step (required): print GPT‑5.2 review prompt

After committing, print this block **filled in**:

```text
REVIEW PROMPT (paste into GPT‑5.2 xtra high)

You are GPT‑5.2 xtra high acting as a senior reviewer/architect in this repo.
Please review my just-finished change for correctness, spec compliance, and unintended side effects.

Repo: /Users/lamosty/projects/aharadar
Branch: <branch-name>
Commit(s): <commit-hash(es)>

Task spec followed:
- docs/_session/tasks/task-004-x-posts-fetch.md
- docs/adr/0010-x-posts-canonical-via-grok.md
- docs/adr/0009-source-cadence.md

What I changed (1–3 bullets):
- ...

Files changed:
- ...

How to validate:
- pnpm -r typecheck
- <CLI smoke commands you ran>

What I’m unsure about / decisions I made:
- ...

Then:
1) Tell me “LGTM” or “Changes required”
2) If changes required, give exact edits (files + what to change)
3) Suggest follow-up tasks (if any)
```


