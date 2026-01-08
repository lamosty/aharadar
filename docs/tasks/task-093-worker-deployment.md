# Task 093: Worker Service Deployment (Scheduler Runner)

## Priority: High

## Goal

Add Docker-managed worker service to run the pipeline scheduler. The worker runs continuously, checks every 5 minutes for due windows, and processes pipeline jobs via BullMQ.

## Background

The BullMQ queue infrastructure and worker code already exist. The worker has an internal 5-minute scheduler tick that checks for due windows and enqueues pipeline jobs. What's missing is the Docker service definition and local dev commands to actually run the worker.

Currently, pipeline runs must be triggered manually via the Admin UI - this task automates that.

## Read First

- `packages/worker/src/main.ts` - Worker entry point with scheduler tick
- `packages/worker/src/workers/pipeline.worker.ts` - Pipeline job processor
- `packages/pipeline/src/scheduler/cron.ts` - Window scheduling logic
- `docker-compose.yml` - Existing Docker services

## Architecture Decision

**Approach:** Docker-managed, always-running worker

- Worker runs continuously inside Docker container
- Internal 5-minute tick checks for due windows (already implemented)
- `restart: unless-stopped` handles crashes
- Same setup locally (macOS) and production (Ubuntu server)
- No external cron dependency

**Why this approach:**
- Most portable (Docker works same everywhere)
- Already implemented (just need Docker config)
- App-internal scheduling = simpler ops
- BullMQ handles retries, persistence, job deduplication

## Scope

### 1. Add worker service to docker-compose.yml

```yaml
worker:
  build:
    context: .
    dockerfile: Dockerfile
    target: worker
  depends_on:
    - postgres
    - redis
  environment:
    - DATABASE_URL=postgresql://aharadar:aharadar@postgres:5432/aharadar
    - REDIS_URL=redis://redis:6379
    - SCHEDULER_TICK_MINUTES=5
  restart: unless-stopped
  networks:
    - aharadar
```

### 2. Update Dockerfile for worker target

Add a `worker` target stage that runs the worker process:

```dockerfile
# Worker target
FROM base AS worker
WORKDIR /app
COPY --from=builder /app .
CMD ["pnpm", "--filter", "@aharadar/worker", "start"]
```

### 3. Add local dev command

In root `package.json`:
```json
{
  "scripts": {
    "dev:worker": "pnpm --filter @aharadar/worker dev"
  }
}
```

In `packages/worker/package.json`:
```json
{
  "scripts": {
    "dev": "tsx watch src/main.ts",
    "start": "node dist/main.js"
  }
}
```

### 4. Update documentation

Add to README or CLAUDE.md commands section:
```bash
# Local development (3 terminals)
pnpm dev:services    # Start Postgres + Redis
pnpm dev:api         # Start API server
pnpm dev:worker      # Start scheduler worker

# Or all via Docker
docker compose up -d
```

## Files to Modify

| File | Change |
|------|--------|
| `docker-compose.yml` | Add worker service definition |
| `Dockerfile` | Add worker target stage |
| `package.json` (root) | Add `dev:worker` script |
| `packages/worker/package.json` | Add `dev` and `start` scripts |
| `CLAUDE.md` | Update commands section |

## Out of Scope

- Health check endpoint (future enhancement)
- BullMQ dashboard UI (future enhancement)
- Scheduler pause/resume API (future enhancement)
- Alerting for stuck jobs (future enhancement)

## Test Plan

1. **Local dev test:**
   ```bash
   pnpm dev:services
   pnpm dev:worker  # In separate terminal
   # Watch logs - should see "Scheduler tick" every 5 min
   ```

2. **Docker test:**
   ```bash
   docker compose up -d
   docker compose logs -f worker
   # Should see scheduler running
   ```

3. **End-to-end test:**
   - Add a source with due window
   - Wait for scheduler tick (or reduce SCHEDULER_TICK_MINUTES=1 for testing)
   - Verify job appears in queue and digest is generated

4. **Restart test:**
   ```bash
   docker compose restart worker
   # Verify it comes back up and resumes scheduling
   ```

## Acceptance Criteria

- [ ] `pnpm dev:worker` starts worker in watch mode
- [ ] Worker logs show "Scheduler tick" every 5 minutes
- [ ] Docker compose includes worker service
- [ ] `docker compose up -d` starts worker alongside other services
- [ ] Worker survives restart (`docker compose restart worker`)
- [ ] Due windows are detected and jobs are enqueued
- [ ] Pipeline runs complete and create digests
- [ ] `pnpm typecheck` passes

## Commit

- **Message**: `feat(worker): add Docker service and local dev command for scheduler`
- **Files expected**: See "Files to Modify" section

## Future Enhancements

- Add health check endpoint to worker for Docker healthcheck
- Add BullMQ dashboard (bull-board) for job monitoring
- Add scheduler pause/resume API for maintenance
- Add alerting for stuck jobs or queue depth
- Configurable tick interval via UI (currently env var only)
