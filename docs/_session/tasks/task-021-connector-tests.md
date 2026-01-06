# Task 021 — `test(connectors): add hermetic unit tests for rss/hn parsing`

- **Owner**: Claude Code Opus 4.5 (implementer)
- **Reviewer**: GPT‑5.2 xtra high
- **Driver**: human (runs commands, merges)

## Goal

Add a small set of hermetic unit tests for the new connectors so we can refactor confidently:

- RSS/Atom parsing: ensure stable extraction of title/link/published/content
- HN normalization: ensure canonical URL fallback works and published_at conversion is correct

No network calls in tests.

## Read first (required)

- `AGENTS.md`
- `CLAUDE.md`
- existing tests + vitest config:
  - `vitest.config.ts`
  - `packages/connectors/src/x_posts/normalize.test.ts`
- code under test:
  - `packages/connectors/src/rss/*`
  - `packages/connectors/src/hn/*`

## Scope (allowed files)

- `packages/connectors/src/rss/*.test.ts` (new)
- `packages/connectors/src/hn/*.test.ts` (new)
- (optional) tiny parsing helpers to make testing possible (pure functions)

If anything else seems required, **stop and ask**.

## Implementation steps (ordered)

1. Add fixture strings (inline in tests) for:
   - a minimal RSS 2.0 feed with 2 items
2. Test the parsing helpers (preferred) or the fetch/normalize pair (if pure):
   - no fetch() network calls; call pure parsing functions directly
3. Add HN normalization tests using a minimal raw item object:
   - `url` present vs missing (fallback to `news.ycombinator.com/item?id=...`)
   - `time` unix seconds → ISO string

## Acceptance criteria

- [ ] `pnpm test` passes.
- [ ] Tests run without `.env` and without network.

## Test plan (copy/paste)

```bash
pnpm -r typecheck
pnpm test
```

## Commit

- **Message**: `test(connectors): add hermetic tests for rss/hn`
- **Files expected**:
  - `packages/connectors/src/rss/*.test.ts`
  - `packages/connectors/src/hn/*.test.ts`

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
- docs/_session/tasks/task-021-connector-tests.md

What I changed (1–3 bullets):
- ...

Files changed:
- ...

How to validate:
- pnpm -r typecheck
- pnpm test
```


