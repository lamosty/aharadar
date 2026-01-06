# Task 003 — `feat(connectors): add x_posts connector scaffold`

- **Owner**: Claude Code Opus 4.5 (implementer)
- **Reviewer**: GPT‑5.2 xtra high
- **Driver**: human (runs commands, merges)

## Goal

Add a new canonical connector `type="x_posts"` as a scaffold:

- registered in the connectors registry
- compiles + typechecks
- safe “no-op” fetch initially (returns zero items)

This sets up the code structure so we can implement fetch/normalize in later tasks.

## Read first (required)

- `AGENTS.md`
- `CLAUDE.md`
- `docs/adr/0010-x-posts-canonical-via-grok.md`
- `docs/connectors.md` (the `x_posts` section)
- Code:
  - `packages/connectors/src/registry.ts`
  - `packages/connectors/src/types.ts`

## Scope (allowed files)

- new: `packages/connectors/src/x_posts/*`
- `packages/connectors/src/registry.ts`
- `packages/connectors/src/index.ts` (only if needed for exports)
- (only if required) `@aharadar/shared` SourceType typing to include `"x_posts"`

If you think you need to touch other packages, **stop and ask**.

## Implementation steps (ordered)

1. Create `packages/connectors/src/x_posts/` with:
   - `config.ts`: `XPostsSourceConfig` (similar shape to signal config; include `vendor`, `accounts`, `keywords`, `queries`, `maxResultsPerQuery`, `excludeReplies`, `excludeRetweets`)
   - `fetch.ts`: `fetchXPosts(params)` returning `{ rawItems: [], nextCursor: { ...params.cursor } }`
   - `normalize.ts`: `normalizeXPosts(raw, params)` that throws `new Error("x_posts normalize not implemented")` (it won’t be called until fetch returns items)
   - `index.ts`: export `xPostsConnector` implementing the shared `Connector` interface
2. Register `xPostsConnector` in `packages/connectors/src/registry.ts`.
3. Ensure TypeScript types allow `sourceType: "x_posts"` (update shared SourceType union if necessary).

## Acceptance criteria

- [ ] `pnpm -r typecheck` passes
- [ ] Creating a source row with `type="x_posts"` does not crash ingestion with “No connector registered”
- [ ] Running `admin:run-now --source-type x_posts` is a no-op (0 items) but does not error

## Test plan (copy/paste)

```bash
pnpm -r typecheck

# If you already have a DB with sources, add one x_posts source and run:
pnpm dev:cli -- admin:run-now --source-type x_posts
```

## Commit

- **Message**: `feat(connectors): add x_posts connector scaffold`
- **Files expected**:
  - `packages/connectors/src/x_posts/*`
  - `packages/connectors/src/registry.ts`
  - (optional) `packages/shared/src/...` SourceType typing

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
- docs/_session/tasks/task-003-x-posts-scaffold.md
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


