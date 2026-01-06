# Task 025 — `test(rss): cover RSS edge cases (dates + content:encoded)`

- **Owner**: Claude Code Opus 4.5 (implementer)
- **Reviewer**: GPT‑5.2 xtra high
- **Driver**: human (runs commands, merges)

## Goal

Expand RSS/Atom test coverage with the specific edge cases called out in the latest recap:

- missing dates (should not throw; published_at can be null)
- invalid dates (should not throw; treat as missing)
- `content:encoded` vs `description` extraction behavior
- (optional) cursoring behavior around `last_published_at` + GUIDs

No network calls in tests (stub `fetch` if needed).

## Read first (required)

- `AGENTS.md`
- `CLAUDE.md`
- `docs/connectors.md` (RSS connector semantics)
- Code:
  - `packages/connectors/src/rss/fetch.ts` (`parseFeed`, `fetchRss`)
  - `packages/connectors/src/rss/config.ts`
  - `packages/connectors/src/rss/parse.test.ts` (existing)

## Scope (allowed files)

- `packages/connectors/src/rss/fetch.ts` (allowed if tests reveal a bug)
- `packages/connectors/src/rss/config.ts` (only if needed for testability)
- `packages/connectors/src/rss/parse.test.ts` (extend)
- (optional) `packages/connectors/src/rss/fetch.test.ts` (new)

If anything else seems required, **stop and ask**.

## Implementation steps (ordered)

1. Add an RSS fixture item that includes BOTH:
   - `<content:encoded><![CDATA[...]]></content:encoded>`
   - `<description>...</description>`
   And assert `parseFeed(...)` extracts:
   - `contentHtml` from `content:encoded`
   - `summary` from `description`
2. Add tests for missing and invalid dates:
   - missing `<pubDate>` should yield `published=null` and should not throw
   - invalid `<pubDate>` should not throw in `fetchRss` (treat as missing; `published_at=null`)
3. If testing `fetchRss`, stub global `fetch()` to return the fixture XML and call `fetchRss(...)` with a minimal config.
4. (Optional) Add a small cursoring test:
   - ensure `recent_guids` cap and de-dup behavior stays stable

## Acceptance criteria

- [ ] `pnpm test` passes.
- [ ] Tests run without `.env` and without network (stub fetch).
- [ ] Missing/invalid RSS dates do not crash the connector.
- [ ] `pnpm -r typecheck` passes.

## Test plan (copy/paste)

```bash
pnpm -r typecheck
pnpm test
```

## Commit

- **Message**: `test(rss): cover RSS edge cases (dates + content:encoded)`
- **Files expected**:
  - `packages/connectors/src/rss/parse.test.ts`
  - (optional) `packages/connectors/src/rss/fetch.test.ts`
  - (optional) `packages/connectors/src/rss/fetch.ts`

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
- docs/_session/tasks/task-025-rss-edge-case-tests.md
- docs/connectors.md

What I changed (1–3 bullets):
- ...

Files changed:
- ...

How to validate:
- pnpm -r typecheck
- pnpm test

What I’m unsure about / decisions I made:
- ...
```


