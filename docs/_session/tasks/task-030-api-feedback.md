# Task 030 — `feat(api): implement feedback endpoint`

- **Owner**: Claude Code Opus 4.5 (implementer)
- **Reviewer**: GPT‑5.2 xtra high
- **Driver**: human (runs commands, merges)

## Goal

Implement `POST /api/feedback` to record user feedback events in `feedback_events` (topic-agnostic).

## Read first (required)

- `AGENTS.md`
- `CLAUDE.md`
- `docs/api.md`
- `docs/data-model.md` (feedback_events)
- Code:
  - `packages/api/src/routes/feedback.ts`
  - `packages/db/src/repos/feedback_events.ts`
  - `packages/shared/src/types/feedback.ts`

## Scope (allowed files)

- `packages/api/src/routes/feedback.ts`
- (optional) a tiny request-validation helper under `packages/api/src/` if needed

If anything else seems required, **stop and ask**.

## Decisions (already decided)

- Request shape (per `docs/api.md`):
  - `{ "contentItemId": "uuid", "digestId": "uuid", "action": "like" }`
- Response shape:
  - `{ "ok": true }` on success
- Actions are constrained to:
  - `"like" | "dislike" | "save" | "skip"`

## Implementation steps (ordered)

1. Parse JSON body and validate:
   - `contentItemId` is a UUID string
   - `digestId` is optional but if present must be a UUID string
   - `action` is one of the allowed strings
2. Resolve singleton `userId` (same approach as other API routes).
3. Insert feedback event via `db.feedbackEvents.insert(...)`.
4. Return `{ ok: true }`.
5. On validation errors, return 400 with the JSON error envelope.

## Acceptance criteria

- [ ] `pnpm -r typecheck` passes.
- [ ] `pnpm -r build` passes.
- [ ] `POST /api/feedback` inserts a row and returns `{ ok: true }`.
- [ ] Invalid payloads return a JSON error envelope.

## Test plan (copy/paste)

```bash
pnpm -r typecheck
pnpm -r build

# Manual smoke (requires DB seeded and API running):
# curl -X POST -H "X-API-Key: ..." -H "Content-Type: application/json" \
#   -d '{"contentItemId":"...","digestId":"...","action":"like"}' \
#   http://localhost:<port>/api/feedback
```

## Commit

- **Message**: `feat(api): implement feedback endpoint`
- **Files expected**:
  - `packages/api/src/routes/feedback.ts`

## Final step (required): print task report

After committing, print this block **filled in**:

```text
TASK REPORT (copy/paste to driver chat)

Repo: /Users/lamosty/projects/aharadar
Branch: <branch-name>
Commit(s): <commit-hash(es)>

Task spec followed:
- docs/_session/tasks/task-030-api-feedback.md
- docs/api.md

What I changed (1–3 bullets):
- ...

Files changed:
- ...

How to validate:
- pnpm -r typecheck
- pnpm -r build
- <curl smoke commands you ran>
```
