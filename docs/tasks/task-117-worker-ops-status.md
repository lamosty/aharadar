# Task 117 — `feat(worker,api): worker health + ops status endpoints`

- **Owner**: Claude Code Opus 4.5 (implementer)
- **Reviewer**: GPT-5.2 xtra high
- **Driver**: human (runs commands, merges)

## Goal

Expose a reliable "worker running" signal plus ops-facing status endpoints so the web admin UI can show:

- Worker up/down status + last scheduler tick time
- Queue depth/active counts (via existing BullMQ data)
- Stable links to ops tools (Grafana, Prometheus, BullMQ dashboard)

This is read-only status/links only (no start/stop controls).

## Read first (required)

- `AGENTS.md`
- `docs/architecture.md`
- `docs/api.md`
- `docs/alerts.md`
- Code:
  - `packages/worker/src/main.ts`
  - `packages/worker/src/metrics.ts`
  - `packages/api/src/routes/admin.ts`
  - `packages/shared/src/config/runtime_env.ts`

## Scope (allowed files)

- `packages/worker/**`
- `packages/api/**`
- `packages/shared/**`
- `.env.example`
- `docs/api.md`
- (optional) `docs/alerts.md` (if runbook needs a quick note)

If anything else seems required, stop and ask.

## Decisions (driver required)

- Health mechanism: prefer a lightweight HTTP health endpoint in the worker (default) vs Redis/DB heartbeat.
- Endpoint shape: `GET /api/admin/ops-status` (single payload) vs separate `worker-status` + `ops-links` endpoints.
- Env names for ops links (recommended):
  - `OPS_GRAFANA_URL`
  - `OPS_PROMETHEUS_URL`
  - `OPS_QUEUE_DASHBOARD_URL`
  - optional `OPS_LOGS_URL`

## Implementation steps (ordered)

1. Add a worker health endpoint alongside metrics:
   - Extend `packages/worker/src/metrics.ts` to respond to `GET /health` (and/or `/ready`) with JSON:
     ```json
     { "ok": true, "startedAt": "...", "lastSchedulerTickAt": "..." }
     ```
   - Track `startedAt` and `lastSchedulerTickAt` in `packages/worker/src/main.ts`.
   - Update `lastSchedulerTickAt` on each scheduler tick (after successful tick).
2. Add ops status endpoints in the API (admin only):
   - If using a single endpoint: `GET /api/admin/ops-status` returns:
     ```json
     {
       "ok": true,
       "worker": { "ok": true|false, "lastSchedulerTickAt": "..." },
       "queue": { "active": N, "waiting": N },
       "links": { "grafana": "...", "prometheus": "...", "queue": "...", "logs": "..." }
     }
     ```
   - If using separate endpoints, ensure the web can fetch the same fields with at most 2 calls.
   - Use a short timeout (<= 1s) when probing worker health.
3. Add env parsing for optional ops links and worker health URL:
   - Example: `WORKER_HEALTH_URL` default `http://localhost:9091/health`.
   - Add to `.env.example`.
4. Document the new endpoint(s) in `docs/api.md`.

## Acceptance criteria

- [ ] Worker exposes `/health` (or equivalent) with `startedAt` and `lastSchedulerTickAt`.
- [ ] API returns worker status + queue counts + ops links via admin endpoint(s).
- [ ] Missing ops URLs are handled gracefully (null/undefined in response).
- [ ] `pnpm -r typecheck` passes.

## Test plan (copy/paste)

```bash
pnpm -r typecheck

# Local manual smoke (driver-run):
# 1) Start worker: pnpm dev:worker
# 2) curl http://localhost:9091/health
# 3) Start API and hit /api/admin/ops-status
```

## Commit

- **Message**: `feat(ops): add worker health and ops status endpoints`
- **Files expected**:
  - `packages/worker/**`
  - `packages/api/**`
  - `packages/shared/**`
  - `.env.example`
  - `docs/api.md`

## Final step (required): write task report files (no copy/paste)

Follow `docs/workflows/task-template.md`.
