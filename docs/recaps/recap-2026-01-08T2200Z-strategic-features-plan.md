# Session Recap: 2026-01-08T2200Z - Strategic Features Plan

## Summary

Major planning session completed. Designed 4 strategic areas for AhaRadar as it moves toward production and potential SaaS offering.

## 4 Strategic Areas Planned

### 1. Monitoring & Reporting (Tasks 075-077b)
- **Logging**: pino structured logging with correlation IDs
- **Metrics**: Prometheus + Grafana dashboards
- **Storage**: DB size, disk usage, row count monitoring
- **Costs**: USD tracking (calculated from tokens x pricing config)
- **Alerts**: Budget thresholds, pipeline failures, storage limits

### 2. User API Keys (Tasks 078-080)
- **Security**: AES-256-GCM encryption with master key from env
- **Storage**: `user_api_keys` table (encrypted_key, iv, key_suffix)
- **Router**: Per-user key resolution in LLM router
- **UI**: Settings page for key management + usage dashboard
- **Note**: Optional feature for self-hosters, SaaS model TBD

### 3. Claude Integration - EXPERIMENTAL (Tasks 081a-082)
- **Research First**: Task 081a - verify SDK auth works for background services
- **Two Modes**: Subscription (personal) vs API (pay-per-token)
- **Thinking**: Extended thinking enabled (like OpenAI reasoning)
- **Enhanced**: WebSearch/WebFetch tools for richer triage
- **Protection**: Quota tracking with auto-fallback to OpenAI
- **Limitation**: Claude has NO embeddings - always use OpenAI
- **Scope**: OpenAI stays as production provider for SaaS

### 4. Connectors (Tasks 083-085, 087)
- **YouTube**: RSS + transcript preview (first ~3000 chars only)
- **RSS Types**: Podcasts, Substack, Medium, arXiv, Lobsters, Product Hunt, GitHub Releases
- **Telegram**: Public channels via Bot API (not personal account)
- **X_Posts**: Already fully implemented (via Grok)
- **Research**: Task 087 - financial data (Polymarket, SEC, insider trading)

### Documentation (Task 086)
- **Create**: security.md, providers.md, deployment.md
- **Update**: spec.md, architecture.md, data-model.md, connectors.md

## Key Decisions Made

| Decision | Rationale |
|----------|-----------|
| USD costs from token counts | APIs don't return dollar amounts |
| Store `cost_estimate_usd` only | Don't need full pricing breakdown |
| Pricing config in JSON file | Update via PR when prices change |
| No web Readability fallback | RSS only - simpler and legal |
| YouTube transcript preview | Full transcripts = future power-user plugin |
| Claude = experimental | OpenAI stays production for SaaS |
| AES-256-GCM for keys | Standard, production-ready encryption |

## Task Files Created

```
# Phase 1: Observability
task-075-observability-logging.md       # pino structured logging
task-076-observability-metrics.md       # Prometheus + Grafana
task-077-observability-alerts.md        # Alerting rules
task-077b-storage-monitoring.md         # DB/disk size tracking

# Phase 2: User API Keys + Costs
task-078-user-api-keys.md               # Encrypted key storage
task-079-dollar-cost-tracking.md        # USD pricing config + tracking
task-080-usage-ui.md                    # Settings page + usage dashboard

# Phase 3: Claude Integration (Experimental)
task-081a-claude-sdk-auth-spike.md      # RESEARCH: Verify SDK auth works
task-081-anthropic-provider.md          # Standard API provider
task-082-claude-subscription.md         # Subscription mode + enhanced triage

# Phase 4: Connectors
task-083-youtube-connector.md           # RSS + transcript extraction
task-084-rss-connector-types.md         # Podcast, Substack, Medium, arXiv, etc.
task-085-telegram-connector.md          # Bot API for public channels

# Documentation
task-086-docs-refresh.md                # security.md, providers.md, etc.

# Research (can parallelize)
task-087-financial-data-research.md     # Polymarket, insider trading, SEC, etc.
```

## Implementation Order

1. Observability (foundation for everything)
2. User API Keys + costs
3. Claude SDK auth spike -> then Claude integration
4. YouTube connector
5. RSS connector types
6. Telegram connector
7. Docs refresh
8. (Parallel) Financial data research

## Key Files

- **Full Plan**: `~/.claude/plans/floating-gathering-lerdorf.md`
- **This Recap**: `docs/recaps/recap-2026-01-08T2200Z-strategic-features-plan.md`
- **Tasks**: `docs/tasks/task-075-*` through `task-087-*`

---

## Seed Prompt for Next Session

```
Continue work on AhaRadar strategic features. Major planning session completed.

## 4 Strategic Areas Planned

**1. Monitoring & Reporting (Tasks 075-077b)**
- pino structured logging with correlation IDs
- Prometheus metrics + Grafana dashboards
- Storage monitoring (DB size, disk usage, row counts)
- USD cost tracking (calculated from tokens x pricing config)
- Alerts: budget thresholds, pipeline failures, storage limits

**2. User API Keys (Tasks 078-080)**
- AES-256-GCM encryption with master key from env
- user_api_keys table (encrypted_key, iv, key_suffix)
- Per-user key resolution in LLM router
- Settings UI for key management + usage dashboard
- Note: Optional feature for self-hosters, SaaS model TBD

**3. Claude Integration - EXPERIMENTAL (Tasks 081a-082)**
- Task 081a FIRST: Research spike to verify SDK auth works for bg services
- Two modes: Subscription (personal) vs API (pay-per-token)
- Extended thinking enabled (like OpenAI reasoning)
- Enhanced mode: WebSearch/WebFetch tools for richer triage
- Quota protection with auto-fallback to OpenAI
- Note: Claude has NO embeddings - always use OpenAI for embeddings
- Note: OpenAI stays as production provider for SaaS

**4. Connectors (Tasks 083-085, 087)**
- YouTube: RSS + transcript preview (first ~3000 chars, NOT full transcript)
- RSS-based types with custom UI: Podcasts, Substack, Medium, arXiv, Lobsters, Product Hunt, GitHub Releases
- Telegram: Public channels via Bot API (not personal account)
- X_Posts: Already fully implemented (via Grok)
- Task 087: Research financial data (Polymarket, SEC filings, insider trading)

**Documentation (Task 086)**
- Create: security.md, providers.md, deployment.md
- Update: spec.md, architecture.md, data-model.md, connectors.md

## Key Decisions
- USD costs calculated from tokens (APIs don't return dollar amounts)
- Store cost_estimate_usd in provider_calls (not full pricing breakdown)
- Pricing config in JSON file (updated via PR when prices change)
- No web Readability fallback - RSS only
- YouTube full transcripts = future power-user plugin

## Implementation Order
1. Observability (foundation for everything)
2. User API Keys + costs
3. Claude SDK auth spike -> then Claude integration
4. YouTube connector
5. RSS connector types
6. Telegram connector
7. Docs refresh
8. (Parallel) Financial data research

## Files
- Full plan: ~/.claude/plans/floating-gathering-lerdorf.md
- Recap: docs/recaps/recap-2026-01-08T2200Z-strategic-features-plan.md
- Tasks: docs/tasks/task-075-* through task-087-*
```
