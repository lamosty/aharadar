# ✅ DONE

# Task 077b: Storage Monitoring

- **Owner**: Claude Code Opus 4.5 (implementer)
- **Reviewer**: GPT-5.2 xtra high
- **Driver**: human (runs commands, merges)
- **Status**: Open
- **Priority**: Medium
- **Depends on**: Task 076 (Prometheus + Grafana)

## Goal

Monitor database size, table growth, and disk usage. Add alerts before storage becomes critical. Identify tables/columns that may need retention policies.

## Read first (required)

- `CLAUDE.md`
- `docs/data-model.md`
- Task 076 implementation (Prometheus/Grafana setup)
- Code:
  - `packages/db/migrations/` (table definitions)
  - `docker-compose.yml` (current postgres setup)

## Scope (allowed files)

- new: `infra/postgres-exporter/` (optional, if using exporter approach)
- new: `packages/api/src/routes/storage.ts` (custom storage metrics endpoint)
- `packages/api/src/main.ts` (register storage route)
- `infra/prometheus/prometheus.yml` (add postgres scrape config)
- `infra/grafana/dashboards/aharadar-overview.json` (add storage panels)
- `infra/grafana/provisioning/alerting/rules.yml` (add storage alerts)
- `docs/alerts.md` (add storage runbook)
- `docker-compose.yml` (if adding postgres_exporter)

If anything else seems required, **stop and ask**.

## Storage metrics to collect

### Database-level metrics

| Metric                         | Description                  | Source                   |
| ------------------------------ | ---------------------------- | ------------------------ |
| `postgres_database_size_bytes` | Total database size          | pg_database_size()       |
| `postgres_table_size_bytes`    | Size per table (with labels) | pg_total_relation_size() |
| `postgres_index_size_bytes`    | Index size per table         | pg_indexes_size()        |

### Row count metrics

| Metric               | Description         | Source                         |
| -------------------- | ------------------- | ------------------------------ |
| `postgres_row_count` | Estimated row count | pg_stat_user_tables.n_live_tup |

Key tables to monitor:

- `provider_calls` (grows with every LLM call)
- `content_items` (grows with ingestion)
- `digests` (grows with pipeline runs)
- `signals` (grows with relevance scoring)
- `embeddings` (grows with vector storage)

### Disk metrics

| Metric               | Description      | Source                  |
| -------------------- | ---------------- | ----------------------- |
| `disk_usage_bytes`   | Used disk space  | node_exporter or custom |
| `disk_free_bytes`    | Free disk space  | node_exporter or custom |
| `disk_usage_percent` | Usage percentage | calculated              |

## Implementation options

### Option A: Custom API endpoint (simpler)

Add a `/api/storage/metrics` endpoint that queries Postgres directly and returns Prometheus format.

Pros:

- No additional container
- Direct control over queries
- Simpler setup

Cons:

- Adds load to API
- Manual metric definition

### Option B: postgres_exporter (standard)

Use official postgres_exporter container.

Pros:

- Standard approach
- Rich default metrics
- No custom code

Cons:

- Additional container
- More complex config

**Recommendation**: Start with Option A for simplicity, migrate to Option B if needed.

## Implementation steps (ordered)

### 1. Create storage metrics endpoint

Create `packages/api/src/routes/storage.ts`:

```typescript
import { FastifyPluginAsync } from "fastify";
import { createDb } from "@aharadar/db";

export const storageRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/storage/metrics", async (request, reply) => {
    const db = createDb(process.env.DATABASE_URL!);

    try {
      // Database size
      const dbSize = await db.execute(sql`
        SELECT pg_database_size(current_database()) as size
      `);

      // Table sizes
      const tableSizes = await db.execute(sql`
        SELECT
          schemaname,
          relname as table_name,
          pg_total_relation_size(relid) as total_size,
          pg_indexes_size(relid) as index_size,
          n_live_tup as row_count
        FROM pg_stat_user_tables
        ORDER BY pg_total_relation_size(relid) DESC
      `);

      // Format as Prometheus metrics
      let output = "";

      // Database size
      output += `# HELP postgres_database_size_bytes Total database size in bytes\n`;
      output += `# TYPE postgres_database_size_bytes gauge\n`;
      output += `postgres_database_size_bytes ${dbSize.rows[0].size}\n\n`;

      // Table sizes
      output += `# HELP postgres_table_size_bytes Table size in bytes\n`;
      output += `# TYPE postgres_table_size_bytes gauge\n`;
      for (const row of tableSizes.rows) {
        output += `postgres_table_size_bytes{table="${row.table_name}"} ${row.total_size}\n`;
      }
      output += "\n";

      // Row counts
      output += `# HELP postgres_row_count Estimated row count\n`;
      output += `# TYPE postgres_row_count gauge\n`;
      for (const row of tableSizes.rows) {
        output += `postgres_row_count{table="${row.table_name}"} ${row.row_count}\n`;
      }

      reply.type("text/plain").send(output);
    } finally {
      await db.close();
    }
  });
};
```

### 2. Register storage route

Update `packages/api/src/main.ts`:

- Import and register `storageRoutes` under `/api`
- Route should be public (or protected, depending on preference)

### 3. Update Prometheus scrape config

Update `infra/prometheus/prometheus.yml`:

```yaml
scrape_configs:
  # ... existing configs ...

  - job_name: "aharadar-storage"
    static_configs:
      - targets: ["host.docker.internal:3001"]
    metrics_path: /api/storage/metrics
    scrape_interval: 60s # Less frequent for DB queries
```

### 4. Add storage panels to Grafana dashboard

Update `infra/grafana/dashboards/aharadar-overview.json`:

Add new row "Storage":

**Panel: Database Size**

- Type: Stat
- Query: `postgres_database_size_bytes`
- Unit: bytes(SI)
- Thresholds: 5GB yellow, 10GB red

**Panel: Table Sizes**

- Type: Bar gauge
- Query: `postgres_table_size_bytes`
- Sort: Descending
- Top 10 tables

**Panel: Row Counts Over Time**

- Type: Time series
- Query: `postgres_row_count{table=~"provider_calls|content_items|digests"}`
- Show growth trend

**Panel: Storage Growth Rate**

- Type: Stat
- Query: `rate(postgres_database_size_bytes[24h]) * 86400`
- Unit: bytes/day

### 5. Add storage alerts

Update `infra/grafana/provisioning/alerting/rules.yml`:

```yaml
# Storage alerts
- uid: storage-db-size-warning
  title: Database Size Warning
  condition: A
  data:
    - refId: A
      datasourceUid: prometheus
      model:
        expr: postgres_database_size_bytes > 5368709120 # 5GB
  for: 5m
  labels:
    severity: warning
    category: storage
  annotations:
    summary: Database size exceeds 5GB
    description: |
      Current size: {{ $value | humanize1024 }}
      Action: Review retention policies

- uid: storage-db-size-critical
  title: Database Size Critical
  condition: A
  data:
    - refId: A
      datasourceUid: prometheus
      model:
        expr: postgres_database_size_bytes > 10737418240 # 10GB
  for: 5m
  labels:
    severity: critical
    category: storage
  annotations:
    summary: Database size exceeds 10GB
    description: Immediate action required

- uid: storage-provider-calls-high
  title: Provider Calls Table Large
  condition: A
  data:
    - refId: A
      datasourceUid: prometheus
      model:
        expr: postgres_row_count{table="provider_calls"} > 1000000
  for: 0m
  labels:
    severity: warning
    category: storage
  annotations:
    summary: provider_calls table exceeds 1M rows
    description: Consider implementing retention policy
```

### 6. Update runbook

Update `docs/alerts.md` with storage section:

````markdown
## Storage Alerts

### DatabaseSizeWarning (5GB)

**Severity**: Warning
**Condition**: Total database size exceeds 5GB

**Actions**:

1. Check which tables are largest:
   ```sql
   SELECT relname, pg_size_pretty(pg_total_relation_size(relid))
   FROM pg_stat_user_tables
   ORDER BY pg_total_relation_size(relid) DESC
   LIMIT 10;
   ```
````

2. Review `provider_calls` for old records
3. Check `content_items` for duplicates
4. Consider VACUUM FULL on large tables

### DatabaseSizeCritical (10GB)

**Severity**: Critical
**Condition**: Database size exceeds 10GB

**Actions**:

1. All of warning actions
2. Implement emergency retention:
   ```sql
   DELETE FROM provider_calls
   WHERE created_at < NOW() - INTERVAL '90 days';
   ```
3. Scale storage if on cloud
4. Notify stakeholders

### ProviderCallsTableLarge (1M rows)

**Severity**: Warning
**Condition**: provider_calls exceeds 1M rows

**Actions**:

1. Review if historical data is needed
2. Consider archiving old records
3. Implement automated retention job
4. Note: meta_json/error_json may contain large blobs

## Storage Housekeeping

### Recommended retention policies

- `provider_calls`: 90 days (archive to cold storage)
- `digests`: 30 days (keep summaries)
- `signals`: 7 days (rebuild from items)
- `embeddings`: Keep with content_items

### Manual cleanup commands

```sql
-- Check table bloat
SELECT schemaname, relname, n_dead_tup, n_live_tup
FROM pg_stat_user_tables
WHERE n_dead_tup > 10000;

-- Reclaim space
VACUUM ANALYZE;
```

````

## Future considerations

Note for future task:
- **Storage audit for JSON fields**: `meta_json` and `error_json` in `provider_calls` may contain large payloads. Consider:
  - Compressing JSON before storage
  - Moving to separate table with foreign key
  - Implementing TTL-based cleanup
  - Sampling instead of storing all calls

## Acceptance criteria

- [ ] `/api/storage/metrics` returns valid Prometheus format
- [ ] Prometheus successfully scrapes storage metrics
- [ ] Grafana dashboard shows storage panels
- [ ] Storage alerts configured (DB size, row counts)
- [ ] `docs/alerts.md` updated with storage runbook
- [ ] `pnpm -r typecheck` passes
- [ ] `pnpm -r build` passes

## Test plan (copy/paste)

```bash
# Build and start
pnpm -r typecheck
pnpm -r build
pnpm dev:services
docker compose up -d prometheus grafana

# Start API
pnpm dev:api &

# Test storage metrics endpoint
curl -s localhost:3001/api/storage/metrics

# Should output something like:
# postgres_database_size_bytes 52428800
# postgres_table_size_bytes{table="content_items"} 12345678
# postgres_row_count{table="provider_calls"} 5432

# Check Prometheus scrape
curl -s 'localhost:9090/api/v1/query?query=postgres_database_size_bytes' | jq

# Open Grafana
open http://localhost:3002
# Check Storage row in dashboard
````

## Commit

- **Message**: `feat(observability): add storage monitoring and alerts`
- **Files expected**:
  - `packages/api/src/routes/storage.ts`
  - `packages/api/src/main.ts`
  - `infra/prometheus/prometheus.yml`
  - `infra/grafana/dashboards/aharadar-overview.json`
  - `infra/grafana/provisioning/alerting/rules.yml`
  - `docs/alerts.md`

## Notes

- Storage metrics don't need high-frequency scraping (60s is fine)
- Row count is estimated (pg_stat); exact count requires table scan
- Consider adding node_exporter for disk metrics in production
- Large JSON fields in provider_calls may skew size metrics
