# Task 036 — `feat(web): data layer (API client + caching + offline basics)`

- **Owner**: Claude Code Opus 4.5 (implementer)
- **Reviewer**: GPT‑5.2 xtra high
- **Driver**: human (runs commands, merges)

## Goal

Implement the web app’s data layer so navigation/actions feel instant:

- typed API client
- caching + optimistic updates for feedback
- skeleton loading states
- basic offline/poor-network UX (banner + cached reads)

## Read first (required)

- `AGENTS.md`
- `CLAUDE.md`
- `docs/web.md`
- `docs/api.md`
- Code:
  - `packages/api/src/routes/*` (existing endpoints)

## Scope (allowed files)

- `packages/web/**`
- (optional) small additions to `packages/api` only if required by the UI (stop and ask if scope expands)

## Decisions (already decided — do not re-ask)

- UI should be snappy:
  - skeletons for loads
  - optimistic updates for feedback
- Offline handling:
  - basic now (banner + cached content); improve later

## Implementation steps (ordered)

1. Add a typed API client in `packages/web` for:
   - `GET /api/health`
   - `GET /api/digests`
   - `GET /api/digests/:id`
   - `GET /api/items/:id`
   - `POST /api/feedback`
   - `POST /api/admin/run`
2. Decide how the browser authenticates for local-only MVP:
   - Recommended: a local “Dev settings” screen that stores API base URL + API key in localStorage.
   - Keep the implementation structured so it can be replaced by real auth later.
3. Add caching:
   - prefer a standard query cache (e.g., React Query) with request de-dup + stale-while-revalidate.
4. Add optimistic feedback:
   - immediate UI update on click
   - rollback if request fails
5. Add skeleton components for list/detail pages to reuse.
6. Add offline banner:
   - show when `navigator.onLine=false` or when fetch errors indicate network failure
   - prefer cached data when available and mark it “cached/stale”.

## Acceptance criteria

- [ ] `pnpm -r typecheck` passes.
- [ ] Web pages can fetch digests/items and render.
- [ ] Feedback updates feel instant and remain correct after refresh.
- [ ] Offline banner appears and cached reads still work (best-effort).

## Test plan (copy/paste)

```bash
pnpm -r typecheck
pnpm -r build
pnpm dev:web
```

## Commit

- **Message**: `feat(web): add data layer with caching + offline basics`
- **Files expected**:
  - `packages/web/**`

## Final step (required): write task report files (no copy/paste)

Follow `docs/workflows/task-template.md`.


