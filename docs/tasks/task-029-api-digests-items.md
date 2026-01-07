# Task 029 — `feat(api): implement digests + items read endpoints`

- **Owner**: Claude Code Opus 4.5 (implementer)
- **Reviewer**: GPT‑5.2 xtra high
- **Driver**: human (runs commands, merges)

## Goal

Implement the first real read endpoints for the API (DB-backed, topic-agnostic):

- `GET /api/digests?from=<iso>&to=<iso>`
- `GET /api/digests/:id`
- `GET /api/items/:id`

All endpoints must:

- enforce API key auth (from Task 028)
- return consistent JSON envelopes
- avoid leaking raw DB internals (only fields we intend to expose)

## Read first (required)

- `AGENTS.md`
- `CLAUDE.md`
- `docs/api.md`
- `docs/data-model.md`
- Code:
  - `packages/api/src/main.ts` (from Task 028)
  - `packages/api/src/routes/digests.ts`
  - `packages/api/src/routes/items.ts`
  - `packages/db/src/repos/*` (especially `digests`, `content_items`, `digest_items`, `topics`, `users`)

## Scope (allowed files)

- `packages/api/src/main.ts` (routing wiring as needed)
- `packages/api/src/routes/digests.ts`
- `packages/api/src/routes/items.ts`
- (optional) `packages/api/src/lib/db.ts` (small shared DB helper)

If anything else seems required, **stop and ask**.

## Decisions

- **Already decided**:
  - API is single-user MVP for now; use the singleton user + their default topic (unless driver decides otherwise).
  - Use the JSON error envelope from Task 028.
- **Already decided (driver)**:
  1. If the DB has no users/topics yet: return a “not initialized” error (do **not** auto-create).
  2. Default range for `GET /api/digests` when `from/to` are omitted: last **7 days** (and cap results).

## Implementation steps (ordered)

1. Add DB access:
   - create DB from `DATABASE_URL` (prefer shared runtime env loader)
   - pick singleton `userId` and default `topicId` (per decision above)
2. Implement `GET /api/digests`:
   - parse optional `from/to` (ISO); validate and return 400 on invalid
   - query digests for the singleton `(userId, topicId)` in `[from,to]` (or default recent range)
   - return a list with digest metadata (at minimum: `id`, `mode`, `windowStart`, `windowEnd`, `createdAt`)
3. Implement `GET /api/digests/:id`:
   - fetch digest row by id and ensure it belongs to singleton user/topic
   - fetch digest_items ordered by `rank`
   - include each item’s `score` and `triageJson` (and `summaryJson` if present)
4. Implement `GET /api/items/:id`:
   - fetch content_items row by id (ensure it belongs to singleton user)
   - return canonical fields (title/url/publishedAt/author/metadata)
5. Ensure all endpoints return:
   - success: `{ ok: true, ... }`
   - errors: `{ ok: false, error: { code, message } }`

## Acceptance criteria

- [ ] `pnpm -r typecheck` passes.
- [ ] `pnpm -r build` passes.
- [ ] Endpoints return data for a populated DB and return sensible errors for missing ids.
- [ ] Auth is enforced (except `/api/health` if configured that way).

## Test plan (copy/paste)

```bash
pnpm -r typecheck
pnpm -r build

# Manual smoke against local services + seeded DB:
# ADMIN_API_KEY=... DATABASE_URL=... REDIS_URL=... node packages/api/dist/main.js
# curl -H "X-API-Key: ..." http://localhost:<port>/api/digests
```

## Commit

- **Message**: `feat(api): implement digests + items read endpoints`
- **Files expected**:
  - `packages/api/src/routes/digests.ts`
  - `packages/api/src/routes/items.ts`
  - (optional) `packages/api/src/lib/db.ts`

## Final step (required): print task report

After committing, print this block **filled in**:

```text
TASK REPORT (copy/paste to driver chat)

Repo: /Users/lamosty/projects/aharadar
Branch: <branch-name>
Commit(s): <commit-hash(es)>

Task spec followed:
- docs/_session/tasks/task-029-api-digests-items.md
- docs/api.md

What I changed (1–3 bullets):
- ...

Files changed:
- ...

How to validate:
- pnpm -r typecheck
- pnpm -r build
- <curl smoke commands you ran>

Open questions / uncertainties:
- ...
```
