# AhaRadar Alert Runbook

This document provides response procedures for all AhaRadar alerts.

## Quick Reference

| Alert                    | Severity | Category | First Response       |
| ------------------------ | -------- | -------- | -------------------- |
| BudgetWarning            | Warning  | Budget   | Review LLM usage     |
| BudgetCritical           | Critical | Budget   | Check fallback tier  |
| DailyBudgetWarning       | Warning  | Budget   | Check daily patterns |
| PipelineFailureSpike     | Warning  | Pipeline | Check worker logs    |
| PipelineStageSlow        | Warning  | Pipeline | Check resources      |
| IngestStalled            | Warning  | Pipeline | Check scheduler      |
| QueueBacklog             | Warning  | Queue    | Check worker health  |
| QueueBacklogCritical     | Critical | Queue    | Scale workers        |
| APIHighErrorRate         | Warning  | API      | Check API logs       |
| APIHighErrorRateCritical | Critical | API      | Immediate triage     |
| APIHighLatency           | Warning  | API      | Check DB/deps        |
| DatabaseSizeWarning      | Warning  | Storage  | Review retention     |
| DatabaseSizeCritical     | Critical | Storage  | Scale storage        |
| ProviderCallsTableLarge  | Warning  | Storage  | Archive records      |

---

## Budget Alerts

### BudgetWarning (80%)

**Severity**: Warning
**Condition**: Monthly credit usage exceeds 80%
**Evaluation**: Every 1 minute, fires after 5 minutes

**Actions**:

1. Check current usage in Grafana dashboard (LLM Usage section)
2. Query provider_calls for unusual patterns:
   ```sql
   SELECT purpose, COUNT(*), SUM(credits_used)
   FROM provider_calls
   WHERE created_at > NOW() - INTERVAL '24 hours'
   GROUP BY purpose
   ORDER BY SUM(credits_used) DESC;
   ```
3. Review recent digest generation frequency
4. Consider reducing digest frequency or item counts
5. If legitimate usage spike, prepare budget increase request

### BudgetCritical (100%)

**Severity**: Critical
**Condition**: Monthly budget exhausted
**Evaluation**: Every 1 minute, fires immediately

**Actions**:

1. Pipeline will automatically use fallback tier (lower-quality model)
2. Verify critical digests are still generating
3. Investigate cause of high usage:
   ```sql
   SELECT DATE_TRUNC('day', created_at) as day,
          purpose,
          SUM(credits_used) as total_credits
   FROM provider_calls
   WHERE created_at > NOW() - INTERVAL '7 days'
   GROUP BY 1, 2
   ORDER BY 1 DESC, 3 DESC;
   ```
4. Budget resets on 1st of month
5. Consider emergency budget increase if business-critical

### DailyBudgetWarning (90%)

**Severity**: Warning
**Condition**: Daily credit consumption exceeds 90% of daily budget
**Evaluation**: Every 1 minute, fires after 5 minutes

**Actions**:

1. Check if there's a scheduled bulk operation running
2. Review hourly usage pattern:
   ```sql
   SELECT DATE_TRUNC('hour', created_at) as hour,
          COUNT(*) as calls,
          SUM(credits_used) as credits
   FROM provider_calls
   WHERE created_at > NOW() - INTERVAL '24 hours'
   GROUP BY 1
   ORDER BY 1 DESC;
   ```
3. If unexpected, check for loops or retry storms
4. Consider pausing non-critical operations

---

## Pipeline Alerts

### PipelineFailureSpike

**Severity**: Warning
**Condition**: More than 3 pipeline failures in the last hour
**Evaluation**: Every 1 minute, fires immediately

**Actions**:

1. Check worker logs for error messages:
   ```bash
   docker compose logs worker --tail 100 | grep -i error
   ```
2. Common causes:
   - LLM API rate limits
   - Database connection issues
   - Invalid source configuration
3. Query recent failures:
   ```sql
   SELECT id, topic_id, started_at, error
   FROM digests
   WHERE status = 'failed'
   ORDER BY started_at DESC
   LIMIT 10;
   ```
4. If rate limiting, consider backoff configuration

### PipelineStageSlow

**Severity**: Warning
**Condition**: p95 stage duration exceeds 5 minutes
**Evaluation**: Every 1 minute, fires after 10 minutes

**Actions**:

1. Check which stage is slow in Grafana dashboard
2. Common slow stages:
   - **triage**: LLM API latency
   - **embed**: Embedding API rate limits
   - **digest**: Large content batches
3. Check system resources:
   ```bash
   docker stats
   ```
4. Review LLM call durations:
   ```sql
   SELECT purpose,
          AVG(EXTRACT(EPOCH FROM (finished_at - started_at))) as avg_seconds
   FROM provider_calls
   WHERE created_at > NOW() - INTERVAL '1 hour'
   GROUP BY purpose;
   ```

### IngestStalled

**Severity**: Warning
**Condition**: No new items ingested for 1 hour
**Evaluation**: Every 1 minute, fires after 60 minutes

**Actions**:

1. Check if scheduler is running:
   ```bash
   docker compose ps
   ```
2. Check source configurations:
   ```sql
   SELECT id, name, connector_type, enabled,
          last_fetch_at, cadence_minutes
   FROM sources
   WHERE enabled = true
   ORDER BY last_fetch_at DESC NULLS LAST;
   ```
3. Test source manually:
   ```bash
   pnpm dev -- run --topic <topic_id> --force
   ```
4. Check for API rate limits on connectors (Reddit, HN, etc.)

---

## Queue Alerts

### QueueBacklog

**Severity**: Warning
**Condition**: Queue depth exceeds 50 jobs
**Evaluation**: Every 1 minute, fires after 5 minutes

**Actions**:

1. Check queue status in Grafana dashboard
2. Verify worker is processing:
   ```bash
   docker compose logs worker --tail 50
   ```
3. Check for slow jobs:
   ```bash
   # Connect to Redis
   redis-cli
   > LLEN bull:pipeline:wait
   > LLEN bull:pipeline:active
   ```
4. Consider scaling workers if load is legitimate

### QueueBacklogCritical

**Severity**: Critical
**Condition**: Queue depth exceeds 100 jobs
**Evaluation**: Every 1 minute, fires after 5 minutes

**Actions**:

1. All actions from QueueBacklog alert
2. Check for stuck jobs:
   ```bash
   redis-cli
   > HGETALL bull:pipeline:stalled
   ```
3. Consider restarting worker:
   ```bash
   docker compose restart worker
   ```
4. If persistent, investigate root cause before scaling

---

## API Alerts

### APIHighErrorRate

**Severity**: Warning
**Condition**: 5xx error rate exceeds 5%
**Evaluation**: Every 1 minute, fires after 5 minutes

**Actions**:

1. Check API logs:
   ```bash
   docker compose logs api --tail 100 | grep -i error
   ```
2. Common causes:
   - Database connection pool exhaustion
   - External service failures
   - Memory issues
3. Check recent error patterns:
   ```bash
   # If using structured logging
   docker compose logs api | jq 'select(.level >= 50)'
   ```

### APIHighErrorRateCritical

**Severity**: Critical
**Condition**: 5xx error rate exceeds 15%
**Evaluation**: Every 1 minute, fires after 2 minutes

**Actions**:

1. **Immediate triage** - API may be effectively down
2. Check if API process is running:
   ```bash
   docker compose ps api
   ```
3. Check system resources:
   ```bash
   docker stats api
   ```
4. Consider restart:
   ```bash
   docker compose restart api
   ```
5. Check database connectivity:
   ```bash
   docker compose exec postgres pg_isready
   ```

### APIHighLatency

**Severity**: Warning
**Condition**: p99 latency exceeds 5 seconds
**Evaluation**: Every 1 minute, fires after 5 minutes

**Actions**:

1. Check slow endpoints in Grafana dashboard
2. Check database query performance:
   ```sql
   SELECT query, calls, mean_time, total_time
   FROM pg_stat_statements
   ORDER BY mean_time DESC
   LIMIT 10;
   ```
3. Check for table bloat:
   ```sql
   SELECT schemaname, relname, n_dead_tup, n_live_tup
   FROM pg_stat_user_tables
   WHERE n_dead_tup > 10000;
   ```
4. Consider running VACUUM:
   ```sql
   VACUUM ANALYZE;
   ```

---

## Storage Alerts

### DatabaseSizeWarning (5GB)

**Severity**: Warning
**Condition**: Total database size exceeds 5GB
**Evaluation**: Every 1 minute, fires after 5 minutes

**Actions**:

1. Check which tables are largest:
   ```sql
   SELECT relname,
          pg_size_pretty(pg_total_relation_size(relid)) as total_size,
          pg_size_pretty(pg_indexes_size(relid)) as index_size
   FROM pg_stat_user_tables
   ORDER BY pg_total_relation_size(relid) DESC
   LIMIT 10;
   ```
2. Review `provider_calls` for old records
3. Check `content_items` for duplicates
4. Plan retention policy implementation

### DatabaseSizeCritical (10GB)

**Severity**: Critical
**Condition**: Database size exceeds 10GB
**Evaluation**: Every 1 minute, fires after 5 minutes

**Actions**:

1. All of warning actions
2. Implement emergency retention if needed:

   ```sql
   -- Delete old provider call records (90+ days)
   DELETE FROM provider_calls
   WHERE created_at < NOW() - INTERVAL '90 days';

   -- Reclaim space
   VACUUM FULL provider_calls;
   ```

3. Scale storage if on cloud (increase volume size)
4. Notify stakeholders about storage constraints

### ProviderCallsTableLarge (1M rows)

**Severity**: Warning
**Condition**: provider_calls exceeds 1 million rows
**Evaluation**: Every 1 minute, fires immediately

**Actions**:

1. Review if historical data is needed:
   ```sql
   SELECT MIN(created_at), MAX(created_at), COUNT(*)
   FROM provider_calls;
   ```
2. Consider archiving old records:

   ```sql
   -- Create archive table
   CREATE TABLE provider_calls_archive (LIKE provider_calls INCLUDING ALL);

   -- Move old records
   INSERT INTO provider_calls_archive
   SELECT * FROM provider_calls
   WHERE created_at < NOW() - INTERVAL '30 days';

   DELETE FROM provider_calls
   WHERE created_at < NOW() - INTERVAL '30 days';
   ```

3. Note: `meta_json`/`error_json` columns may contain large blobs

---

## Storage Housekeeping

### Recommended Retention Policies

| Table          | Retention          | Notes                        |
| -------------- | ------------------ | ---------------------------- |
| provider_calls | 90 days            | Archive to cold storage      |
| digests        | 30 days            | Keep summaries longer        |
| signals        | 7 days             | Rebuild from items if needed |
| embeddings     | With content_items | Linked lifecycle             |
| content_items  | 30 days            | Based on source freshness    |

### Manual Cleanup Commands

```sql
-- Check table bloat
SELECT schemaname, relname, n_dead_tup, n_live_tup,
       ROUND(100.0 * n_dead_tup / NULLIF(n_live_tup + n_dead_tup, 0), 2) as dead_pct
FROM pg_stat_user_tables
WHERE n_dead_tup > 10000
ORDER BY n_dead_tup DESC;

-- Reclaim space (non-blocking)
VACUUM ANALYZE;

-- Reclaim space (blocking, full)
VACUUM FULL <table_name>;

-- Check index bloat
SELECT
    schemaname, tablename, indexname,
    pg_size_pretty(pg_relation_size(indexrelid)) as index_size
FROM pg_stat_user_indexes
ORDER BY pg_relation_size(indexrelid) DESC
LIMIT 10;

-- Rebuild bloated indexes
REINDEX TABLE <table_name>;
```

---

## Alert Configuration

### Contact Points

Alerts are sent to configured contact points in `infra/grafana/provisioning/alerting/contact-points.yml`.

**Default configuration** (placeholder):

- Email: `alerts@example.com`
- Webhook: `http://localhost:8080/alerts`

**To configure Slack**:

1. Create Slack webhook in your workspace
2. Update `contact-points.yml` with webhook URL
3. Restart Grafana

### Notification Policies

- **Critical alerts**: Immediate notification, repeat every 1 hour
- **Budget alerts**: Grouped, repeat every 2 hours
- **Storage alerts**: Grouped, repeat every 6 hours
- **Other alerts**: 30s wait, repeat every 4 hours

---

## Accessing Alerts

### Grafana UI

1. Open Grafana: http://localhost:3002
2. Navigate to: Alerting > Alert rules
3. View firing alerts: Alerting > Alert rules (filter by state)

### API

```bash
# List all alert rules
curl -s -u admin:admin http://localhost:3002/api/v1/provisioning/alert-rules | jq

# Check alert rule count
curl -s -u admin:admin http://localhost:3002/api/v1/provisioning/alert-rules | jq length
```
