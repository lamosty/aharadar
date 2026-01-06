# Task 018 — `feat(rss): implement RSS/Atom fetch + deterministic normalization`

- **Owner**: Claude Code Opus 4.5 (implementer)
- **Reviewer**: GPT‑5.2 xtra high
- **Driver**: human (runs commands, merges)

## Goal

Implement the `rss` connector end-to-end so it can ingest a standard RSS/Atom feed into canonical `content_items`:

- `fetch()` downloads and parses the feed into post-level raw items
- `normalize()` maps each entry into a deterministic `ContentItemDraft`
- cursoring reduces re-processing (best-effort; idempotent upserts still guarantee correctness)

## Read first (required)

- `AGENTS.md`
- `CLAUDE.md`
- `docs/connectors.md` (RSS connector contract + URL canonicalization rules)
- `docs/pipeline.md` (ingest stage + idempotency + cadence)
- Code:
  - `packages/connectors/src/rss/fetch.ts`
  - `packages/connectors/src/rss/normalize.ts`
  - `packages/pipeline/src/stages/ingest.ts` (idempotent upsert rules)
  - `packages/shared/src/url.ts` (canonicalizeUrl)

## Scope (allowed files)

- `packages/connectors/src/rss/config.ts`
- `packages/connectors/src/rss/fetch.ts`
- `packages/connectors/src/rss/normalize.ts`
- (optional) `packages/connectors/src/rss/parse.ts` (new helper to parse RSS/Atom payloads)
- (optional) `packages/connectors/package.json` + `pnpm-lock.yaml` (if adding a small XML parser dep)

If anything else seems required, **stop and ask**.

## Decisions (already decided)

- Use `fast-xml-parser` (or equivalent small dependency) to parse RSS/Atom robustly.

## Implementation steps (ordered)

1. Parse config (accept both snake_case and camelCase keys, like the reddit connector does):
   - `feed_url` / `feedUrl` (required)
   - `max_item_count` / `maxItemCount` (default 50; clamp 1..200)
   - `prefer_content_encoded` / `preferContentEncoded` (default true)
2. Fetch the feed URL (HTTP GET):
   - set a polite `User-Agent` header (e.g. `aharadar/0.x`)
   - parse XML into a normalized internal entry list
3. Cursoring (best-effort, not a hard contract):
   - read `cursor_json.last_published_at` (ISO) and `cursor_json.recent_guids` (string[])
   - return only entries that are newer than `last_published_at` OR whose GUID is not in `recent_guids`
   - set `nextCursor` with:
     - updated `last_published_at` (max published date seen, ISO)
     - `recent_guids` (cap to last ~200, most recent first)
4. Emit one raw item per entry, e.g.:
   - `guid`, `link`, `title`, `author`, `published_at`, `content_html`/`content_text`, `feed_url`
5. Implement `normalizeRss()`:
   - `sourceType`: `"rss"`
   - `externalId`: GUID if present (else null)
   - `canonicalUrl`: entry link if present
   - `title`: entry title
   - `bodyText`: prefer content over summary/description; strip HTML tags to plain text (best-effort)
   - `publishedAt`: entry published date ISO if present else null (do not fabricate)
   - `author`: author if present
   - `metadata`: include `feed_url`, categories/tags (if present), and any stable IDs
   - `raw`: optional: store a bounded raw entry payload for debugging

## Acceptance criteria

- [ ] `pnpm -r typecheck` passes.
- [ ] Creating an `rss` source and running `admin:run-now --source-type rss` ingests items.
- [ ] Re-running the same window does not create duplicates (upsert idempotency).
- [ ] Cursoring reduces reprocessing (second run fetches fewer/zero new items when nothing changed).

## Test plan (copy/paste)

```bash
pnpm -r typecheck

# Example (adjust feed URL):
pnpm dev:cli -- admin:sources-add --type rss --name "rss:example" --config '{"feedUrl":"https://example.com/feed.xml"}'
pnpm dev:cli -- admin:run-now --source-type rss --max-items-per-source 50
pnpm dev:cli -- inbox --table
```

## Commit

- **Message**: `feat(rss): implement RSS/Atom fetch + normalization`
- **Files expected**:
  - `packages/connectors/src/rss/config.ts`
  - `packages/connectors/src/rss/fetch.ts`
  - `packages/connectors/src/rss/normalize.ts`
  - (optional) `packages/connectors/src/rss/parse.ts`
  - (optional) `packages/connectors/package.json`
  - (optional) `pnpm-lock.yaml`

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
- docs/_session/tasks/task-018-rss-connector.md

What I changed (1–3 bullets):
- ...

Files changed:
- ...

How to validate:
- pnpm -r typecheck
- <CLI smoke commands you ran>
```
