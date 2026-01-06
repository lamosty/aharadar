# Opus worklist (current) — Aha Radar backlog

This file is the **active queue** of tasks to hand to Claude Code Opus 4.5.

Notes:

- This started as “`x_posts` + cadence” work; it now tracks the broader backlog (pipeline, connectors, tests, API, CLI, UI, etc.).
- We intentionally keep older task entries here for history/context even after they land.

Workflow: follow `docs/workflows/ai-collab.md`.

Task specs live in: `docs/_session/tasks/` (copy/paste-ready).

## Pre-req (as needed)

If a task changes a contract, ensure the relevant `docs/*` and/or `docs/adr/*` updates are committed **before** handing implementation to Opus (docs-first).

## Execution strategy

For these “core plumbing” tasks, run **one Opus instance at a time** (recommended). Parallel work is possible but not required.

Every task must end with:

- `pnpm -r typecheck`
- a CLI smoke test
- printing the **GPT‑5.2 review prompt** (see `docs/workflows/ai-collab.md`)

---

## Tasks (in order)

1. **Task 001**: cadence gating
   - `docs/_session/tasks/task-001-cadence-gating.md`
2. **Task 002**: refactor Grok provider for reuse
   - `docs/_session/tasks/task-002-grok-provider-refactor.md`
3. **Task 003**: add `x_posts` connector scaffold
   - `docs/_session/tasks/task-003-x-posts-scaffold.md`
4. **Task 004**: implement `x_posts` fetch
   - `docs/_session/tasks/task-004-x-posts-fetch.md`
5. **Task 005**: implement `x_posts` normalize
   - `docs/_session/tasks/task-005-x-posts-normalize.md`
6. **Task 006**: add minimal tests
   - `docs/_session/tasks/task-006-tests.md`

## Follow-up tasks (next window)

7. **Task 007**: audit `signal` now that `x_posts` exists (bundle-only amplifier)
   - `docs/_session/tasks/task-007-signal-audit.md`
8. **Task 008**: migration strategy for legacy signal-stored X content (docs-only stance)
   - `docs/_session/tasks/task-008-x-content-migration.md`
9. **Task 009**: cadence UX CLI helper
   - `docs/_session/tasks/task-009-cadence-ux.md`
10. **Task 010**: exclude tests from `dist/` (optional polish)

- `docs/_session/tasks/task-010-exclude-tests-from-dist.md`

11. **Task 011**: URL-only signal corroboration boost

- `docs/_session/tasks/task-011-signal-corroboration.md`

12. **Task 012**: prefer canonical cluster representatives in digests (avoid tweet-as-face)

- `docs/_session/tasks/task-012-canonical-cluster-reps.md`

13. **Task 013**: budget hard enforcement (credits exhaustion → warn + fallback low)

- `docs/_session/tasks/task-013-budget-hard-enforcement.md`

14. **Task 014**: scheduler/queue wiring (BullMQ + real cron windows)

- `docs/_session/tasks/task-014-scheduler-queue-wiring.md`

## Next batch (prepared; run after current tasks land)

15. **Task 015**: novelty scoring (topic-scoped, embedding-based) + ranking integration

- `docs/_session/tasks/task-015-novelty-scoring.md`

16. **Task 016**: source weights + bulk admin helpers (enable/disable + set weight)

- `docs/_session/tasks/task-016-source-weights-admin-ux.md`

17. **Task 017**: review “why shown” ranking breakdown (novelty/corroboration/weights)

- `docs/_session/tasks/task-017-why-shown-ranking-breakdown.md`

## Core connectors batch (prepare before API/UI)

18. **Task 018**: RSS connector (fetch + normalize)

- `docs/_session/tasks/task-018-rss-connector.md`

19. **Task 019**: YouTube connector (channel feed ingestion; no transcripts)

- `docs/_session/tasks/task-019-youtube-connector.md`

20. **Task 020**: HN connector (Firebase API stories; no comments)

- `docs/_session/tasks/task-020-hn-connector.md`

21. **Task 021**: hermetic unit tests for rss/hn parsing

- `docs/_session/tasks/task-021-connector-tests.md`

## Deferred (later)

- Task 019 is currently **deferred** (YouTube ingestion). Keep the connector stubbed for now.

---

## Tests + API batch (prepared; run after current tasks land)

22. **Task 022**: rank math + weights parsing unit tests

- `docs/_session/tasks/task-022-rank-tests.md`

23. **Task 023**: scheduler window generation unit tests

- `docs/_session/tasks/task-023-scheduler-window-tests.md`

24. **Task 024**: credits status + budget gating unit tests

- `docs/_session/tasks/task-024-budget-gating-tests.md`

25. **Task 025**: RSS edge-case unit tests (dates + content:encoded)

- `docs/_session/tasks/task-025-rss-edge-case-tests.md`

26. **Task 026**: HN normalization edge-case unit tests

- `docs/_session/tasks/task-026-hn-edge-case-tests.md`

27. **Task 027**: optional integration test harness (`pnpm test:integration`)

- `docs/_session/tasks/task-027-integration-tests-harness.md`

28. **Task 028**: API scaffold + API key auth + health

- `docs/_session/tasks/task-028-api-scaffold.md`

29. **Task 029**: API digests + items read endpoints

- `docs/_session/tasks/task-029-api-digests-items.md`

30. **Task 030**: API feedback endpoint

- `docs/_session/tasks/task-030-api-feedback.md`

33. **Task 033**: shared BullMQ queue package (`@aharadar/queues`)

- `docs/_session/tasks/task-033-shared-queues-package.md`

31. **Task 031**: API admin run endpoint (enqueue to BullMQ)

- `docs/_session/tasks/task-031-api-admin-run.md`

32. **Task 032**: integration test for Redis + BullMQ worker end-to-end

- `docs/_session/tasks/task-032-integration-queue-worker.md`

---

## Web UI/UX batch (Next.js)

34. **Task 034**: UI/UX spec (routes + requirements)

- `docs/_session/tasks/task-034-web-ui-spec.md`

35. **Task 035**: scaffold web app + design system + shell

- `docs/_session/tasks/task-035-web-scaffold.md`

36. **Task 036**: data layer (API client + caching + offline basics)

- `docs/_session/tasks/task-036-web-data-layer.md`

37. **Task 037**: digests list (condensed + reader modes)

- `docs/_session/tasks/task-037-web-digests-list.md`

38. **Task 038**: digest detail + why shown + feedback

- `docs/_session/tasks/task-038-web-digest-detail.md`

39. **Task 039**: item detail page

- `docs/_session/tasks/task-039-web-item-detail.md`

40. **Task 040**: add admin sources endpoints for UI

- `docs/_session/tasks/task-040-api-admin-sources.md`

41. **Task 041**: add budgets/status endpoint for UI

- `docs/_session/tasks/task-041-api-admin-budgets.md`

42. **Task 042**: admin UI (sources + budgets + run now)

- `docs/_session/tasks/task-042-web-admin-ui.md`

43. **Task 043**: Playwright E2E (hermetic via API mocking)

- `docs/_session/tasks/task-043-web-e2e-playwright.md`
