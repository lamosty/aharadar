# Task 005 — `feat(x_posts): normalize posts into canonical content_items`

- **Owner**: Claude Code Opus 4.5 (implementer)
- **Reviewer**: GPT‑5.2 xtra high
- **Driver**: human (runs commands, merges)

## Goal

Normalize `x_posts` raw items into canonical content items so they flow through:

ingest → embed → dedupe/cluster → digest → review

## Depends on

- Task 003 (x_posts scaffold) merged
- Task 004 (x_posts fetch) merged

## Read first (required)

- `AGENTS.md`
- `CLAUDE.md`
- `docs/connectors.md` (x_posts normalize rules)
- `docs/data-model.md` (idempotent upsert rules)
- Code:
  - `packages/connectors/src/x_posts/normalize.ts`
  - `packages/pipeline/src/stages/ingest.ts` (upsert rules)
  - shared `canonicalizeUrl()` behavior: `packages/shared/src/utils/url_canonicalize.ts`

## Scope (allowed files)

- `packages/connectors/src/x_posts/normalize.ts`
- optional helpers under `packages/connectors/src/x_posts/`

## Critical constraints (don’t get these wrong)

- `canonicalUrl` MUST be the **status URL** (`https://x.com/<handle>/status/<id>`). This is the stable dedupe identity.
- `externalId` should be the **status id** when parseable from the URL.
- Do not fabricate timestamps:
  - If you only have a day bucket, keep `publishedAt = null`.
- Keep text as returned (no paraphrasing).

## Implementation steps (ordered)

1. Parse the raw item:
   - required: `url` (status URL) and `text` excerpt
2. Canonicalize URL:
   - pass through `canonicalizeUrl()` (handled later by pipeline too, but normalize should provide the right canonicalUrl).
3. Parse:
   - status id from `/status/<digits>`
   - handle from the URL path (best-effort)
4. Produce `ContentItemDraft`:
   - `sourceType`: `"x_posts"`
   - `canonicalUrl`: status URL
   - `externalId`: status id (preferred) else stable hash
   - `title`: null
   - `bodyText`: excerpt
   - `author`: `@handle` when parseable else null
   - `publishedAt`: null unless true timestamp exists
   - `metadata`: include:
     - `vendor`, `provider`, `query`, `day_bucket`
     - `extracted_urls` from text (best-effort)
     - `primary_url` (prefer first extracted non-x url, else status url)

## Acceptance criteria

- [ ] Running `admin:run-now --source-type x_posts` creates `content_items` with:
  - `source_type='x_posts'`
  - `canonical_url` set (status URL)
  - stable idempotency across re-runs (no duplicates)
- [ ] `pnpm -r typecheck` passes

## Test plan (copy/paste)

```bash
pnpm -r typecheck
pnpm dev:cli -- admin:run-now --source-type x_posts --max-items-per-source 20
pnpm dev:cli -- admin:digest-now --max-items 50 --source-type x_posts
pnpm dev:cli -- inbox
```

## Commit

- **Message**: `feat(x_posts): normalize posts into canonical content_items`
- **Files expected**:
  - `packages/connectors/src/x_posts/normalize.ts`

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
- docs/_session/tasks/task-005-x-posts-normalize.md
- docs/adr/0010-x-posts-canonical-via-grok.md

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
