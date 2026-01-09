# Opus task specs (active)

This directory contains **copy/paste-ready task specs** for Claude Code Opus 4.5.

Start here:

- Workflow: `docs/workflows/ai-collab.md`
- Worklist: `docs/_session/opus-worklist.md`
- Task specs in this directory are the canonical source of truth for Opus execution.

Task files (in recommended order):

1. `task-001-cadence-gating.md`
2. `task-002-grok-provider-refactor.md`
3. `task-003-x-posts-scaffold.md`
4. `task-004-x-posts-fetch.md`
5. `task-005-x-posts-normalize.md`
6. `task-006-tests.md`
7. `task-007-signal-audit.md`
8. `task-008-x-content-migration.md`
9. `task-009-cadence-ux.md`
10. `task-010-exclude-tests-from-dist.md`
11. `task-011-signal-corroboration.md`
12. `task-012-canonical-cluster-reps.md`
13. `task-013-budget-hard-enforcement.md`
14. `task-014-scheduler-queue-wiring.md`
15. `task-015-novelty-scoring.md`
16. `task-016-source-weights-admin-ux.md`
17. `task-017-why-shown-ranking-breakdown.md`
18. `task-018-rss-connector.md`
19. `task-019-youtube-connector.md` (deferred)
20. `task-020-hn-connector.md`
21. `task-021-connector-tests.md` (rss/hn only for now)
22. `task-022-rank-tests.md`
23. `task-023-scheduler-window-tests.md`
24. `task-024-budget-gating-tests.md`
25. `task-025-rss-edge-case-tests.md`
26. `task-026-hn-edge-case-tests.md`
27. `task-027-integration-tests-harness.md`
28. `task-028-api-scaffold.md`
29. `task-029-api-digests-items.md`
30. `task-030-api-feedback.md`
31. `task-031-api-admin-run.md`
32. `task-032-integration-queue-worker.md`
33. `task-033-shared-queues-package.md`
34. `task-034-web-ui-spec.md`
35. `task-035-web-scaffold.md`
36. `task-036-web-data-layer.md`
37. `task-037-web-digests-list.md`
38. `task-038-web-digest-detail.md`
39. `task-039-web-item-detail.md`
40. `task-040-api-admin-sources.md`
41. `task-041-api-admin-budgets.md`
42. `task-042-web-admin-ui.md`
43. `task-043-web-e2e-playwright.md`

## SaaS Infrastructure Tasks

44. `task-078-user-api-keys.md` - Encrypted storage for user-provided API keys
45. `task-079-dollar-cost-tracking.md` - Real USD cost tracking for LLM calls
46. `task-080-usage-ui.md` - Settings UI for API keys + usage dashboard

## New Connector & Documentation Tasks

47. `task-083-youtube-connector.md` - Complete YouTube connector with transcript preview
48. `task-084-rss-connector-types.md` - Add RSS-based connector types (podcast, substack, etc.)
49. `task-085-telegram-connector.md` - Add Telegram public channel connector
50. `task-086-docs-refresh.md` - Update outdated docs, create new required docs
51. `task-087-financial-data-research.md` - RESEARCH: Financial/trading data sources

## Source discovery UX + free alternatives (new)

52. `task-104-congress-trading-free-vendor.md` - Congress trading: free public disclosures default + paid Quiver opt-in
53. `task-105-source-picker-categorized-modal.md` - Web: categorized, searchable source picker modal (paid sources less prominent)
54. `task-106-x-as-free-data-sources.md` - Web/docs: make X (via Grok) an explicit “data source” path + generic recipes

## Debug / regression tasks (new)

55. `task-107-web-digest-detail-whyshown-triage.md` - Fix digest detail WhyShown + show triage reason
56. `task-108-api-digest-detail-include-bodytext-metadata.md` - API: include bodyText/metadata + effective contentItemId in `GET /digests/:id`
57. `task-109-web-digest-detail-x-posts-display.md` - Web: render x_posts text + display name in digest detail
58. `task-110-x-posts-published-at-timestamp.md` - Fix x_posts published_at handling + decide timestamp strategy
59. `task-111-deprioritize-signal.md` - De-prioritize/disable signal features by default (since unused)
60. `task-112-x-posts-prompt-profile-per-source.md` - Per-source x_posts promptProfile (light/heavy) for cost vs detail
61. `task-113-all-topics-feed.md` - Make "All topics" real in feed + URL sync + topic badges
62. `task-114-feedback-undo-saved.md` - Undo feedback + meaningful skip/save + saved view
63. `task-115-whyshown-source-weight.md` - Show full source-weight breakdown in WhyShown
64. `task-116-api-keys-load-loop.md` - Fix API Keys settings re-fetch loop

## Ops / Observability tasks (new)

65. `task-117-worker-ops-status.md` - Worker health endpoint + ops status API
66. `task-118-bullmq-dashboard-service.md` - Add BullMQ dashboard service
67. `task-119-web-admin-ops-links.md` - Admin Ops page with status + links

## Topic digest scheduling + depth (new)

68. `task-120-topic-digest-cadence-spec.md` - Docs: contract for topic-level digest cadence + depth
69. `task-121-db-topic-digest-settings.md` - DB: store topic digest schedule + depth; purge catch_up digests
70. `task-122-api-topic-digest-settings.md` - API/Web: expose topic digest settings; remove catch_up
71. `task-123-worker-scheduler-topic-cadence.md` - Worker: schedule digests per topic cadence (+ bounded backfill)
72. `task-124-pipeline-digest-plan-sizing.md` - Pipeline: compile digest plan from topic settings (size + budgets)
73. `task-125-pipeline-fair-candidate-selection.md` - Pipeline: fairness sampling + triage allocation + diversity
74. `task-126-feed-sorting-best-latest-trending.md` - Feed: Best default; Latest/Trending explicit
75. `task-127-web-topic-digest-settings-ui.md` - Web: topic digest cadence + depth settings UI
