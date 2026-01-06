# Opus implementation plan — `x_posts` canonical connector + per-source cadence

> **Status**: Archived (historical).
>
> This document predates the current “task specs” workflow. The canonical source of truth is now:
>
> - Opus task specs: `docs/_session/tasks/`
> - Contracts + ADRs: `docs/*` and `docs/adr/*`

> **Audience**: Claude Code Opus 4.5 (implementer), with GPT-5.2 as reviewer/architect.
>
> **Goal**: Implement a canonical X/Twitter connector (`type="x_posts"`) while still using Grok as the access method, and add a **generic per-source cadence** mechanism so each source can run on its own schedule (daily / 3× daily / weekly / etc).
>
> **Non-negotiables (repo invariants)**:
>
> - Topic-agnostic (no domain-specific rules)
> - Provider-agnostic (no hardcoded LLM/provider assumptions; keep vendor interfaces)
> - Budgets are credits (monthly + optional daily throttle)
> - TypeScript strict; no implicit `any`
> - Commit-sized chunks; one logical change per commit
> - No secrets committed

## 0) Read first (required)

1. `AGENTS.md`
2. `CLAUDE.md`
3. `docs/connectors.md`
4. `docs/pipeline.md`
5. `docs/data-model.md`
6. ADRs:
   - `docs/adr/0003-x-strategy-grok-signal.md`
   - `docs/adr/0007-budget-units-credits.md`
   - `docs/adr/0008-topics-collections.md`

## 1) Decisions (already chosen)

### 1.1 We are adding a canonical connector: `type="x_posts"`

- Tweets/posts are treated as **canonical content items** (like Reddit/RSS/HN).
- We still use Grok as the _access method_ for now because the official X API is not price/UX-friendly.
- `signal` remains a separate connector type for derived/trend/alert semantics (not canonical ingestion).

### 1.2 Every source can declare its own cadence (how often it should fetch)

We will run the pipeline on some schedule (or manually), but **ingest** will only call a connector’s `fetch()` when that source is “due” based on its cadence.

Examples:

- `x_posts`: once per day
- `rss`: maybe 3×/day (or hourly)
- `youtube`: daily
- `reddit`: 3×/day

## 2) Contracts to update first (docs before code)

Create/Update docs and ADRs **before** implementing code so the contracts are the source of truth.

### 2.1 ADRs

- Add **ADR 0009**: “Source cadence gating” (how cadence is represented and enforced).
- Add **ADR 0010**: “Canonical X posts connector (`x_posts`) via Grok” (and how `signal` relates).
- Update ADR 0003 status/reference (see ADR 0010 for canonical X posts).

### 2.2 `docs/connectors.md`

Add a new canonical connector spec:

#### `type = "x_posts"` (canonical)

**Purpose**
Ingest X/Twitter posts as canonical items, using a provider-backed access method (initially Grok).

**config_json (Proposed)**

```json
{
  "vendor": "grok",
  "accounts": ["someaccount", "anotheraccount"],
  "keywords": ["optional keywords"],
  "queries": ["optional advanced queries"],
  "maxResultsPerQuery": 20,
  "excludeReplies": true,
  "excludeRetweets": true,
  "cadence": { "mode": "interval", "every_minutes": 1440 }
}
```

Notes:

- `queries` is the escape hatch; otherwise compile queries from `accounts/keywords` using the same hygienic filters we already use.
- `cadence` is a **common** per-source field enforced by the pipeline ingest stage (ADR 0009).

**cursor_json (MVP)**

```json
{
  "since_id": null,
  "since_time": "2025-12-17T08:00:00Z"
}
```

**Fetch**

- Use the provider client to fetch recent posts per query, bounded by `limits.maxItems`.
- The fetch function must return `rawItems` **one per post** (not bundles).

**Normalize**

- Each post becomes one `ContentItemDraft`:
  - `source_type`: `"x_posts"`
  - `canonical_url`: the status URL (`https://x.com/<handle>/status/<id>`)
  - `external_id`: status id (parsed from URL) if possible; fallback to stable hash of `(vendor|query|day_bucket|url)`
  - `title`: null
  - `body_text`: post text excerpt (no paraphrasing)
  - `author`: `@<handle>` when parseable
  - `published_at`: best-effort; if you only have a day bucket, keep null (do not fabricate a timestamp)
  - `metadata_json`: include provider/vendor, query, extracted_urls, etc.

Also update the existing `signal` spec:

- For MVP, **signals should be derived/bundle-like** and should not claim canonical URLs (keep `canonical_url=null`).
- If we keep per-post signal rows for debugging, they must be clearly separated and excluded from digests by default (but preferred approach: keep signals as bundles only once `x_posts` exists).

### 2.3 `docs/pipeline.md`

Add an explicit rule to ingestion:

- **Ingest cadence gating**: before calling `connector.fetch()`, check the source cadence and skip if not due.

Also clarify:

- `x_posts` is canonical and participates in embed/dedupe/cluster/digest like other sources.
- `signal` items are derived amplifiers and are excluded from clustering/dedupe unless explicitly configured (keep it simple for now).

### 2.4 `docs/cli.md` (optional but recommended)

Add a short section for “cadence”:

- show how to set cadence via `admin:sources-add --config '{...}'`
- (optional) add a convenience CLI command to patch an existing source config, but it’s not required if you can edit via `admin:sources-add`/SQL.

## 3) Implementation plan (commit-sized)

### Commit A — Docs + ADRs only

Files:

- `docs/adr/0009-source-cadence.md` (new)
- `docs/adr/0010-x-posts-canonical-via-grok.md` (new)
- `docs/adr/0003-x-strategy-grok-signal.md` (update status/links)
- `docs/connectors.md` (add `x_posts`, adjust `signal`)
- `docs/pipeline.md` (add cadence gating semantics)
- `docs/cli.md` (optional)

Acceptance:

- Docs describe the new contracts clearly enough for an engineer to implement without guessing.

### Commit B — Per-source cadence gating (runtime behavior)

Goal: Implement a generic “should we fetch this source now?” check in `ingestEnabledSources()`.

#### Contract (ADR 0009)

Add to `sources.config_json` (optional):

```json
{
  "cadence": { "mode": "interval", "every_minutes": 480 }
}
```

Semantics:

- If `cadence` is missing: treat as “always due” (fetch whenever pipeline ingests).
- If cadence exists: only fetch if last successful fetch time is older than `every_minutes`.

Where to store last successful fetch time:

- Use `sources.cursor_json.last_fetch_at` (ISO string) and update it **only after a successful fetch** (status `ok|partial`).
- Do **not** advance `last_fetch_at` when a source is skipped due to cadence.

Implementation details:

1. In `packages/pipeline/src/stages/ingest.ts`, parse cadence from `source.config_json`.
2. Determine `nowIso` as the run’s `windowEnd` (not wall-clock `Date.now()`), so behavior is deterministic per run.
3. If not due:
   - do not call connector.fetch()
   - do not start a `fetch_runs` row (or if you do, ensure it does not affect “last_fetch_at” logic)
   - return a per-source result with `status="ok"`, `fetched=0`, `upserted=0`, and a clear reason (optional field or log).
4. If due and fetch succeeds:
   - merge `last_fetch_at: windowEnd` into the cursor you persist via `db.sources.updateCursor()`.

Tests:

- `pnpm -r typecheck`
- Manual: run pipeline twice in a row; confirm a source with cadence does not re-fetch on the second run.

### Commit C — Add canonical connector `x_posts`

Files (suggested structure):

- `packages/connectors/src/x_posts/`
  - `config.ts`
  - `fetch.ts`
  - `normalize.ts`
  - `provider.ts` (or shared provider module reused with signal)
  - `index.ts`
- `packages/connectors/src/registry.ts` (register connector)

Implementation notes:

- Reuse the existing Grok “x*search” provider code if possible, but avoid naming everything “signal*\*”.
- Keep provider env vars provider-agnostic:
  - allow `GROK_API_KEY`, `GROK_BASE_URL`, `GROK_MODEL` fallbacks (no secrets in docs).

Normalize rules (important):

- `canonical_url` must be stable and canonicalized.
- `external_id` should be the status id when possible.
- `published_at`: keep null unless you have a true timestamp.
- Extract URLs from the post text into `metadata_json.extracted_urls`.

### Commit D — Migration/backfill plan (choose ONE)

Pick one approach (do not silently add multi-path behavior):

**Option D1 (recommended early-phase): reset/re-ingest**

- If you can tolerate resetting local DB, avoid complex migrations.
- After merging, run `./scripts/reset.sh` and re-create sources with `x_posts`.

**Option D2: explicit backfill command**

- Add a CLI admin command to “convert” existing stored X signal posts/bundles into `x_posts` sources/items without calling Grok again.
- This must be explicit, opt-in, and documented.

### Commit E — Cleanup (optional)

After `x_posts` is working:

- make `signal` X-specific post output go away (signals back to bundles-only), unless you want to keep it for other signal provider use-cases.

## 4) Acceptance checklist (end state)

- [ ] You can create a source with `type="x_posts"` and it ingests post-level content items.
- [ ] Cadence works for any source type (not just X).
- [ ] X posts are treated like canonical content in clustering/digest.
- [ ] Signals remain derived (no canonical URL) unless explicitly configured.
- [ ] Typecheck passes: `pnpm -r typecheck`

## 5) What to ask GPT-5.2 to review

After each commit, provide:

- `git diff --stat`
- `git diff` for the key files
- Example CLI output from:
  - `pnpm dev:cli -- admin:sources-list`
  - `pnpm dev:cli -- admin:run-now --source-type x_posts`
  - (optional) `pnpm dev:cli -- inbox`
