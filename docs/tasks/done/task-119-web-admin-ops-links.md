# Task 119 — `feat(web): add Admin Ops panel (links + status)`

- **Owner**: Claude Code Opus 4.5 (implementer)
- **Reviewer**: GPT-5.2 xtra high
- **Driver**: human (runs commands, merges)

## Goal

Add an Admin "Ops" page that centralizes operational links and status:

- Worker status (up/down + last scheduler tick)
- Queue status (active/waiting counts)
- Links to BullMQ dashboard, Grafana, Prometheus, and optional logs

This page is read-only; no start/stop buttons.

## Read first (required)

- `AGENTS.md`
- `docs/web.md`
- `docs/api.md`
- Code:
  - `packages/web/src/app/app/admin/page.tsx`
  - `packages/web/src/components/QueueStatus.tsx`
  - `packages/web/src/lib/api.ts`
  - `packages/web/src/lib/hooks.ts`

## Scope (allowed files)

- `packages/web/**`
- (optional) `docs/web.md` (route map update)
- (optional) `docs/api.md` (if endpoint name/shape changed)

If anything else seems required, stop and ask.

## Dependencies (must exist first)

- Ops status + links endpoint(s) from Task 117.
- BullMQ dashboard service from Task 118 (for link target).

## Decisions (confirmed)

- Add `/app/admin/ops` with read-only status + links (no action buttons).
- Add a new card/link on `/app/admin` pointing to the Ops page.

## Implementation steps (ordered)

1. Add a new Admin page at `/app/admin/ops`:
   - Display a status card for the worker (green/red indicator, last tick timestamp).
   - Display queue counts (active/waiting).
   - Show a "Tools" section with external links.
2. Add a card link on `/app/admin` to the new Ops page.
3. Add data hooks:
   - If Task 117 provides a single `GET /api/admin/ops-status`, use that.
   - Otherwise combine `queue-status` + `worker-status` + `ops-links`.
4. Add new i18n strings in `packages/web/src/messages/en.json`.
5. Update `docs/web.md` route map to include `/app/admin/ops` and a short description.

## Acceptance criteria

- [ ] Admin Ops page renders with status and links.
- [ ] If endpoints return no links, the page handles it gracefully (hides link section or shows "not configured").
- [ ] Queue and worker status poll/update (reuse existing polling patterns).
- [ ] `pnpm -r typecheck` passes.

## Test plan (copy/paste)

```bash
pnpm -r typecheck
pnpm dev:web

# Navigate to /app/admin/ops and confirm links/status render
```

## Commit

- **Message**: `feat(web): add admin ops panel with status + links`
- **Files expected**:
  - `packages/web/**`
  - (optional) `docs/web.md`

## Final step (required): write task report files (no copy/paste)

Follow `docs/workflows/task-template.md`.
