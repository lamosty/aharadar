# Task 118 — `feat(ops): add BullMQ dashboard service`

- **Owner**: Claude Code Opus 4.5 (implementer)
- **Reviewer**: GPT-5.2 xtra high
- **Driver**: human (runs commands, merges)

## Goal

Add a BullMQ dashboard UI (bull-board) so operators can inspect queue state, jobs, retries, and failures. This should be a separate service with a stable URL that the web Admin Ops page can link to.

## Read first (required)

- `AGENTS.md`
- `docs/architecture.md`
- `docs/adr/0004-queue-redis-bullmq.md`
- `docs/alerts.md`
- `docker-compose.yml`
- Code:
  - `packages/queues/src/index.ts`
  - `packages/worker/src/queues.ts`
  - `packages/api/src/lib/queue.ts`

## Scope (allowed files)

- `packages/**` (new `queue-ui` package or similar)
- `docker-compose.yml`
- `Dockerfile` (if adding a new target)
- `package.json` (root scripts)
- `.env.example`
- (optional) `docs/README.md` or `docs/alerts.md` for quick ops notes

If anything else seems required, stop and ask.

## Decisions (driver required)

- Where to host bull-board:
  - **Option A (recommended):** separate service/package (e.g., `@aharadar/queue-ui`) with its own port.
  - **Option B:** mount bull-board inside the API server (Fastify adapter), behind the existing admin key.
- Default local port (suggested): `3101`.
- Auth: no auth in local dev, rely on network boundaries. If API-mounted, reuse admin auth.

## Implementation steps (ordered)

1. Add a new small server package (if Option A):
   - Depends on `@bull-board/api` + `@bull-board/express` (or fastify).
   - Reuses `REDIS_URL` to connect to the `pipeline` queue.
   - Serves UI at `/` (or `/queue`), with JSON API under `/api`.
2. Add scripts:
   - Root: `dev:queue-ui` to run locally.
   - Package: `dev` + `start` scripts.
3. Add Docker support:
   - Update `Dockerfile` with a new target stage (e.g., `queue-ui`).
   - Add a `queue-ui` service to `docker-compose.yml`:
     - depends on `redis`
     - exposes port (e.g., `3101:3101`)
4. Update `.env.example` with `QUEUE_UI_PORT` and/or `OPS_QUEUE_DASHBOARD_URL` (if the app uses this link).
5. (Optional) Add a short note in docs for how to access the dashboard.

## Acceptance criteria

- [ ] BullMQ dashboard is reachable locally and shows the `pipeline` queue.
- [ ] Docker compose starts the dashboard service with Redis connectivity.
- [ ] `pnpm -r typecheck` passes.

## Test plan (copy/paste)

```bash
pnpm -r typecheck

# Local dev (Option A):
# pnpm dev:queue-ui
# open http://localhost:3101

# Docker:
# docker compose up -d redis queue-ui
# open http://localhost:3101
```

## Commit

- **Message**: `feat(ops): add BullMQ dashboard service`
- **Files expected**:
  - `packages/queue-ui/**` (or equivalent)
  - `Dockerfile`
  - `docker-compose.yml`
  - `package.json`
  - `.env.example`

## Final step (required): write task report files (no copy/paste)

Follow `docs/workflows/task-template.md`.
