# ✅ DONE

# Task 076: Prometheus Metrics and Grafana Dashboards

- **Owner**: Claude Code Opus 4.5 (implementer)
- **Reviewer**: GPT-5.2 xtra high
- **Driver**: human (runs commands, merges)
- **Status**: Open
- **Priority**: High
- **Depends on**: Task 075 (structured logging)

## Goal

Add Prometheus metrics collection to API and Worker. Create Grafana dashboards for monitoring pipeline health, API performance, and credit consumption.

## Read first (required)

- `CLAUDE.md`
- `docs/architecture.md`
- `docs/pipeline.md`
- Code:
  - `packages/api/src/main.ts`
  - `packages/api/src/routes/` (route structure)
  - `packages/worker/src/main.ts`
  - `packages/worker/src/workers/pipeline.worker.ts`
  - `packages/db/src/queries/provider_calls.ts` (credit tracking)
  - `docker-compose.yml`

## Scope (allowed files)

- new: `packages/api/src/metrics.ts`
- new: `packages/worker/src/metrics.ts`
- new: `packages/shared/src/metrics.ts` (shared metric types/helpers)
- new: `infra/prometheus/prometheus.yml`
- new: `infra/grafana/provisioning/datasources/prometheus.yml`
- new: `infra/grafana/provisioning/dashboards/dashboard.yml`
- new: `infra/grafana/dashboards/aharadar-overview.json`
- `packages/api/src/main.ts`
- `packages/api/src/routes/health.ts` (add /metrics endpoint)
- `packages/api/package.json`
- `packages/worker/src/main.ts`
- `packages/worker/src/workers/pipeline.worker.ts`
- `packages/worker/package.json`
- `docker-compose.yml`

If anything else seems required, **stop and ask**.

## Key metrics to implement

### API metrics (`packages/api/src/metrics.ts`)

```typescript
import { Registry, Counter, Histogram, Gauge } from "prom-client";

// HTTP request metrics
http_request_duration_seconds: Histogram;
labels: (method, route, status_code);

http_requests_total: Counter;
labels: (method, route, status_code);

// Active connections
http_active_connections: Gauge;
```

### Worker metrics (`packages/worker/src/metrics.ts`)

```typescript
// Pipeline execution
pipeline_run_duration_seconds: Histogram;
labels: (stage, status(success | error));

pipeline_runs_total: Counter;
labels: (stage, status);

// Ingestion
ingest_items_total: Counter;
labels: (source_type, status(success | skipped | error));

// LLM calls
llm_call_duration_seconds: Histogram;
labels: (provider, model, purpose);

llm_calls_total: Counter;
labels: (provider, model, purpose, status);

// Credits (from provider_calls table)
credits_consumed_total: Counter;
labels: (provider, purpose);

// Queue depth
queue_depth: Gauge;
labels: queue_name;
```

## Implementation steps (ordered)

### 1. Add prom-client dependency

Update `packages/api/package.json` and `packages/worker/package.json`:

```json
"dependencies": {
  "prom-client": "^15.1.0"
}
```

### 2. Create shared metrics helpers

Create `packages/shared/src/metrics.ts`:

- Export common label names
- Export metric name constants
- Helper for creating registries

### 3. Create API metrics module

Create `packages/api/src/metrics.ts`:

- Initialize prom-client Registry
- Create HTTP metrics
- Export middleware for recording request metrics
- Export handler for `/metrics` endpoint

### 4. Wire API metrics

Update `packages/api/src/main.ts`:

- Add metrics middleware
- Track request duration and status

Update `packages/api/src/routes/health.ts`:

- Add GET `/metrics` endpoint returning Prometheus format

### 5. Create Worker metrics module

Create `packages/worker/src/metrics.ts`:

- Initialize prom-client Registry
- Create pipeline metrics
- Create ingestion metrics
- Create LLM call metrics
- Create queue depth gauge

### 6. Wire Worker metrics

Update `packages/worker/src/workers/pipeline.worker.ts`:

- Record pipeline stage duration
- Record item counts
- Record errors

Update `packages/worker/src/main.ts`:

- Periodically update queue depth gauge
- Expose metrics via simple HTTP server on port 9091

### 7. Create Prometheus configuration

Create `infra/prometheus/prometheus.yml`:

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: "aharadar-api"
    static_configs:
      - targets: ["host.docker.internal:3001"]
    metrics_path: /api/metrics

  - job_name: "aharadar-worker"
    static_configs:
      - targets: ["host.docker.internal:9091"]
    metrics_path: /metrics
```

### 8. Create Grafana provisioning

Create `infra/grafana/provisioning/datasources/prometheus.yml`:

```yaml
apiVersion: 1
datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true
```

Create `infra/grafana/provisioning/dashboards/dashboard.yml`:

```yaml
apiVersion: 1
providers:
  - name: "AhaRadar"
    folder: ""
    type: file
    options:
      path: /var/lib/grafana/dashboards
```

### 9. Create Grafana dashboard

Create `infra/grafana/dashboards/aharadar-overview.json`:

Dashboard panels:

- **Row: API Health**
  - Request rate (req/s by route)
  - Request latency (p50, p95, p99)
  - Error rate (5xx %)
  - Active connections

- **Row: Pipeline**
  - Pipeline runs over time
  - Stage duration distribution
  - Items ingested per source type
  - Error rate by stage

- **Row: LLM Usage**
  - LLM calls over time
  - Call duration by provider/model
  - Credits consumed (daily/monthly)
  - Budget utilization %

- **Row: Queue**
  - Queue depth over time
  - Job completion rate
  - Job failure rate

### 10. Update docker-compose.yml

Add prometheus and grafana services:

```yaml
prometheus:
  image: prom/prometheus:v2.47.0
  ports:
    - "9090:9090"
  volumes:
    - ./infra/prometheus/prometheus.yml:/etc/prometheus/prometheus.yml:ro
    - prometheus_data:/prometheus
  command:
    - "--config.file=/etc/prometheus/prometheus.yml"
    - "--storage.tsdb.path=/prometheus"
  extra_hosts:
    - "host.docker.internal:host-gateway"

grafana:
  image: grafana/grafana:10.2.0
  ports:
    - "3002:3000"
  volumes:
    - ./infra/grafana/provisioning:/etc/grafana/provisioning:ro
    - ./infra/grafana/dashboards:/var/lib/grafana/dashboards:ro
    - grafana_data:/var/lib/grafana
  environment:
    - GF_SECURITY_ADMIN_PASSWORD=admin
    - GF_USERS_ALLOW_SIGN_UP=false
  depends_on:
    - prometheus

volumes:
  prometheus_data:
  grafana_data:
```

## Acceptance criteria

- [ ] `curl localhost:3001/api/metrics` returns Prometheus format
- [ ] `curl localhost:9091/metrics` returns Worker metrics
- [ ] Prometheus scrapes both targets successfully
- [ ] Grafana dashboard loads with all panels
- [ ] `docker compose up -d prometheus grafana` works
- [ ] `pnpm -r typecheck` passes
- [ ] `pnpm -r build` passes

## Test plan (copy/paste)

```bash
# Build everything
pnpm -r typecheck
pnpm -r build

# Start services
pnpm dev:services
docker compose up -d prometheus grafana

# Start API and worker
pnpm dev:api &
pnpm dev:worker &

# Test metrics endpoints
curl -s localhost:3001/api/metrics | head -20
curl -s localhost:9091/metrics | head -20

# Check Prometheus targets
curl -s localhost:9090/api/v1/targets | jq '.data.activeTargets[].health'

# Open Grafana
open http://localhost:3002
# Login: admin/admin
# Dashboard should be pre-loaded
```

## Commit

- **Message**: `feat(observability): add Prometheus metrics and Grafana dashboards`
- **Files expected**:
  - `packages/api/src/metrics.ts`
  - `packages/api/src/main.ts`
  - `packages/api/src/routes/health.ts`
  - `packages/api/package.json`
  - `packages/worker/src/metrics.ts`
  - `packages/worker/src/main.ts`
  - `packages/worker/src/workers/pipeline.worker.ts`
  - `packages/worker/package.json`
  - `packages/shared/src/metrics.ts`
  - `infra/prometheus/prometheus.yml`
  - `infra/grafana/provisioning/**`
  - `infra/grafana/dashboards/aharadar-overview.json`
  - `docker-compose.yml`

## Notes

- Worker metrics server should be minimal (just metrics endpoint)
- Consider using `prom-client` default metrics for Node.js runtime stats
- Dashboard JSON can be exported from Grafana UI after manual creation
- Use consistent label names across API and Worker for unified queries
