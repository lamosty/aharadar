# Task 077: Grafana Alerting Rules

- **Owner**: Claude Code Opus 4.5 (implementer)
- **Reviewer**: GPT-5.2 xtra high
- **Driver**: human (runs commands, merges)
- **Status**: Open
- **Priority**: Medium
- **Depends on**: Task 076 (metrics + Grafana)

## Goal

Configure Grafana alerting for critical conditions: budget exhaustion, pipeline failures, queue backlogs, and API errors. Document alert runbooks for operators.

## Read first (required)

- `CLAUDE.md`
- `docs/pipeline.md`
- `docs/spec.md` (budget section)
- Task 076 implementation (metrics available)
- Code:
  - `packages/db/src/queries/provider_calls.ts` (budget tracking)

## Scope (allowed files)

- new: `infra/grafana/provisioning/alerting/` (alert rules)
- new: `docs/alerts.md` (runbook documentation)
- `infra/grafana/provisioning/dashboards/dashboard.yml` (if updates needed)
- `infra/grafana/dashboards/aharadar-overview.json` (alert annotations)

If anything else seems required, **stop and ask**.

## Alert definitions

### Budget alerts

| Alert | Condition | Severity | For |
|-------|-----------|----------|-----|
| BudgetWarning | credits_consumed > 80% monthly | warning | 5m |
| BudgetCritical | credits_consumed >= 100% monthly | critical | 0m |
| DailyBudgetWarning | credits_consumed > 90% daily | warning | 5m |

### Pipeline alerts

| Alert | Condition | Severity | For |
|-------|-----------|----------|-----|
| PipelineFailureSpike | pipeline failures > 3 in 1 hour | warning | 0m |
| PipelineStageSlow | p95 stage duration > 5 minutes | warning | 10m |
| IngestStalled | ingest_items_total unchanged for 1 hour | warning | 60m |

### Queue alerts

| Alert | Condition | Severity | For |
|-------|-----------|----------|-----|
| QueueBacklog | queue_depth > 50 | warning | 5m |
| QueueBacklogCritical | queue_depth > 100 | critical | 5m |
| JobsStuck | oldest job age > 30 minutes | warning | 5m |

### API alerts

| Alert | Condition | Severity | For |
|-------|-----------|----------|-----|
| APIHighErrorRate | 5xx rate > 5% | warning | 5m |
| APIHighErrorRateCritical | 5xx rate > 15% | critical | 2m |
| APIHighLatency | p99 latency > 5s | warning | 5m |

## Implementation steps (ordered)

### 1. Create alert rules directory structure

```
infra/grafana/provisioning/alerting/
  rules.yml           # Alert rule definitions
  contact-points.yml  # Notification channels
  policies.yml        # Notification policies
```

### 2. Create alert rules

Create `infra/grafana/provisioning/alerting/rules.yml`:

```yaml
apiVersion: 1
groups:
  - orgId: 1
    name: AhaRadar Alerts
    folder: AhaRadar
    interval: 1m
    rules:
      # Budget alerts
      - uid: budget-warning
        title: Budget Warning (80%)
        condition: A
        data:
          - refId: A
            queryType: ''
            relativeTimeRange:
              from: 600
              to: 0
            datasourceUid: prometheus
            model:
              expr: |
                (sum(credits_consumed_total) / 1000000) > 0.8
              intervalMs: 1000
              maxDataPoints: 43200
        for: 5m
        labels:
          severity: warning
          category: budget
        annotations:
          summary: Monthly budget usage exceeded 80%
          description: |
            Current usage: {{ $value | printf "%.1f" }}%
            Action: Review LLM usage patterns

      # Pipeline alerts
      - uid: pipeline-failure-spike
        title: Pipeline Failure Spike
        condition: A
        data:
          - refId: A
            datasourceUid: prometheus
            model:
              expr: |
                sum(increase(pipeline_runs_total{status="error"}[1h])) > 3
        for: 0m
        labels:
          severity: warning
          category: pipeline
        annotations:
          summary: Multiple pipeline failures detected
          description: More than 3 pipeline failures in the last hour

      # Queue alerts
      - uid: queue-backlog
        title: Queue Backlog
        condition: A
        data:
          - refId: A
            datasourceUid: prometheus
            model:
              expr: queue_depth > 50
        for: 5m
        labels:
          severity: warning
          category: queue
        annotations:
          summary: Queue depth exceeds threshold
          description: |
            Current depth: {{ $value }}
            Action: Check worker health, consider scaling

      # API alerts
      - uid: api-high-error-rate
        title: API High Error Rate
        condition: A
        data:
          - refId: A
            datasourceUid: prometheus
            model:
              expr: |
                sum(rate(http_requests_total{status_code=~"5.."}[5m]))
                /
                sum(rate(http_requests_total[5m]))
                > 0.05
        for: 5m
        labels:
          severity: warning
          category: api
        annotations:
          summary: API error rate exceeds 5%
          description: Check API logs for error details
```

### 3. Create contact points

Create `infra/grafana/provisioning/alerting/contact-points.yml`:

```yaml
apiVersion: 1
contactPoints:
  - orgId: 1
    name: default-email
    receivers:
      - uid: email-placeholder
        type: email
        settings:
          addresses: "alerts@example.com"
        disableResolveMessage: false

  - orgId: 1
    name: webhook-placeholder
    receivers:
      - uid: webhook-placeholder
        type: webhook
        settings:
          url: "http://localhost:8080/alerts"
          httpMethod: POST
        disableResolveMessage: false
```

### 4. Create notification policies

Create `infra/grafana/provisioning/alerting/policies.yml`:

```yaml
apiVersion: 1
policies:
  - orgId: 1
    receiver: default-email
    group_by:
      - alertname
      - category
    group_wait: 30s
    group_interval: 5m
    repeat_interval: 4h
    routes:
      - receiver: default-email
        matchers:
          - severity = critical
        group_wait: 0s
        repeat_interval: 1h
```

### 5. Update Grafana provisioning config

Ensure Grafana loads alerting config. May need to update `docker-compose.yml` volumes:

```yaml
grafana:
  volumes:
    - ./infra/grafana/provisioning:/etc/grafana/provisioning:ro
```

### 6. Create runbook documentation

Create `docs/alerts.md`:

```markdown
# AhaRadar Alert Runbook

## Budget Alerts

### BudgetWarning (80%)
**Severity**: Warning
**Condition**: Monthly credit usage exceeds 80%

**Actions**:
1. Check `provider_calls` table for unusual patterns
2. Review recent digest generation frequency
3. Consider reducing digest frequency or item counts
4. If legitimate usage, prepare for budget increase

### BudgetCritical (100%)
**Severity**: Critical
**Condition**: Monthly budget exhausted

**Actions**:
1. Pipeline will automatically use fallback tier
2. Check if critical digests are still generating
3. Investigate cause of high usage
4. Budget resets on 1st of month

## Pipeline Alerts

### PipelineFailureSpike
...

## Queue Alerts

### QueueBacklog
...

## API Alerts

### APIHighErrorRate
...
```

### 7. Add alert annotations to dashboard

Update `infra/grafana/dashboards/aharadar-overview.json`:
- Add alert state indicators to relevant panels
- Add alert history annotations

## Acceptance criteria

- [ ] Alerts visible in Grafana UI (Alerting > Alert rules)
- [ ] Contact points configured (can be placeholders)
- [ ] Alert fires when test condition met
- [ ] `docs/alerts.md` documents all alerts with runbook
- [ ] Alert annotations visible on dashboard panels
- [ ] `pnpm -r typecheck` passes

## Test plan (copy/paste)

```bash
# Start services
pnpm dev:services
docker compose up -d prometheus grafana

# Wait for Grafana to start
sleep 10

# Check alert rules loaded
curl -s -u admin:admin http://localhost:3002/api/v1/provisioning/alert-rules | jq length

# Open Grafana alerts
open http://localhost:3002/alerting/list

# Test alert (manually trigger condition)
# Example: Create artificial queue backlog metric
# Then verify alert fires in UI
```

## Commit

- **Message**: `feat(observability): add Grafana alerting rules and runbook`
- **Files expected**:
  - `infra/grafana/provisioning/alerting/rules.yml`
  - `infra/grafana/provisioning/alerting/contact-points.yml`
  - `infra/grafana/provisioning/alerting/policies.yml`
  - `infra/grafana/dashboards/aharadar-overview.json`
  - `docs/alerts.md`

## Notes

- Grafana Alerting is simpler than separate Alertmanager for small deployments
- Contact points are placeholders; configure actual endpoints in production
- Consider Slack/Discord webhook for real-time notifications
- Alert thresholds may need tuning based on actual usage patterns
- Keep runbook updated as system evolves
