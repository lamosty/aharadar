# Task 020 — `feat(hn): ingest stories via Hacker News Firebase API`

- **Owner**: Claude Code Opus 4.5 (implementer)
- **Reviewer**: GPT‑5.2 xtra high
- **Driver**: human (runs commands, merges)

## Goal

Implement the `hn` connector MVP ingestion using the public Hacker News Firebase API:

- fetch story IDs from the configured feed
- fetch item JSON for up to N stories
- normalize each story into `ContentItemDraft`

Comments are explicitly **out-of-scope** for this task.

## Read first (required)

- `AGENTS.md`
- `CLAUDE.md`
- `docs/connectors.md` (HN connector spec)
- Code:
  - `packages/connectors/src/hn/config.ts`
  - `packages/connectors/src/hn/fetch.ts`
  - `packages/connectors/src/hn/normalize.ts`

## Scope (allowed files)

- `packages/connectors/src/hn/config.ts`
- `packages/connectors/src/hn/fetch.ts`
- `packages/connectors/src/hn/normalize.ts`

If anything else seems required, **stop and ask**.

## Decisions (already decided)

- Use the **official Firebase API** (not Algolia):
  - base: `https://hacker-news.firebaseio.com/v0/`
  - feeds: `topstories`, `newstories`
  - item: `item/<id>.json`
- Comments are skipped for MVP.

## Implementation steps (ordered)

1. Parse config (accept both snake_case and camelCase keys):
   - `feed` (default `"top"`, allowed `"top" | "new"`)
   - ignore `includeComments` / `maxCommentCount` for MVP (no comment fetching)
2. Fetch story IDs:
   - `GET https://hacker-news.firebaseio.com/v0/${feed}stories.json`
3. Fetch story items:
   - for first N IDs (bound by `limits.maxItems`), fetch `item/<id>.json`
   - concurrency-limit the requests (e.g. 10 at a time) to avoid hammering the API
4. Cursoring (best-effort):
   - store `cursor_json.last_run_at = windowEnd` (ISO) (optional)
5. Emit one raw item per story with the full item JSON (bounded; safe fields only if needed).
6. Implement `normalizeHn()`:
   - `sourceType`: `"hn"`
   - `externalId`: story id (string)
   - `canonicalUrl`: `url` if present else `https://news.ycombinator.com/item?id=<id>`
   - `title`: story title
   - `bodyText`: `text` (strip HTML tags) if present
   - `publishedAt`: from `time` unix seconds (ISO)
   - `author`: `by`
   - `metadata`: score, descendants, type, etc.

## Acceptance criteria

- [ ] `pnpm -r typecheck` passes.
- [ ] `admin:run-now --source-type hn` ingests items for a configured HN source.
- [ ] No comment fetching is performed.

## Test plan (copy/paste)

```bash
pnpm -r typecheck

# Example:
pnpm dev:cli -- admin:sources-add --type hn --name "hn:top" --config '{"feed":"top"}'
pnpm dev:cli -- admin:run-now --source-type hn --max-items-per-source 50
pnpm dev:cli -- inbox --table
```

## Commit

- **Message**: `feat(hn): ingest stories via Firebase API`
- **Files expected**:
  - `packages/connectors/src/hn/config.ts`
  - `packages/connectors/src/hn/fetch.ts`
  - `packages/connectors/src/hn/normalize.ts`

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
- docs/_session/tasks/task-020-hn-connector.md

What I changed (1–3 bullets):
- ...

Files changed:
- ...

How to validate:
- pnpm -r typecheck
- <CLI smoke commands you ran>
```


