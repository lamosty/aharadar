# Task 027 — `test(integration): add docker-backed pipeline smoke test`

- **Owner**: Claude Code Opus 4.5 (implementer)
- **Reviewer**: GPT‑5.2 xtra high
- **Driver**: human (runs commands, merges)

## Goal

Add a **separate** integration test harness that requires Docker services, without breaking the default hermetic unit test loop.

We want one high-value integration test that exercises the DB-backed digest path (no LLM, no network):

- Apply SQL migrations to a fresh Postgres instance (pgvector-enabled)
- Seed minimal rows (user/topic/source/content_items/content_item_sources)
- Run `persistDigestFromContentItems(..., paidCallsAllowed=false)` and assert a digest + digest_items are created

## Read first (required)

- `AGENTS.md`
- `CLAUDE.md`
- `docs/pipeline.md`
- `docs/budgets.md` (why we run `paidCallsAllowed=false` for integration smoke)
- Code:
  - `packages/db/migrations/*.sql`
  - `packages/db/src/db.ts` (`createDb`)
  - `packages/pipeline/src/stages/digest.ts` (`persistDigestFromContentItems`)
  - `vitest.config.ts`

## Scope (allowed files)

- Root:
  - `package.json` (add `test:integration` script)
  - `vitest.config.ts` (ensure integration tests are excluded from default `pnpm test`)
  - `vitest.integration.config.ts` (new)
- Tests + helpers (pick a minimal location, but keep TS strict):
  - one new `*.int.test.ts` file (integration-only)
  - (optional) one tiny test helper to apply migrations + seed data

If anything else seems required, **stop and ask**.

## Decisions (already decided)

1. **Harness approach**: use **Testcontainers** (Node) for Docker-backed integration tests.
   - Rationale: most reliable + hermetic; integration tests are run explicitly (not on every edit).
2. **First integration slice**: **Postgres-only** digest-path smoke test.
   - Rationale: highest ROI and least flakey; we can add a separate follow-up integration test for Redis + BullMQ worker wiring.

## Implementation steps (ordered)

1. Ensure default tests remain hermetic:
   - keep `pnpm test` fast and not Docker-dependent
   - exclude `**/*.int.test.ts` from `vitest.config.ts`
2. Add a new integration vitest config (`vitest.integration.config.ts`) that includes only `**/*.int.test.ts` tests.
3. Add `pnpm test:integration` script to run the integration config.
4. Implement a Postgres-backed integration test:
   - start Postgres via **Testcontainers** using `pgvector/pgvector:pg16`
   - apply migrations by reading `packages/db/migrations/*.sql` in order and executing them
   - seed:
     - `users`, `topics` (default), one `sources` row attached to the topic
     - 2–3 `content_items` inside the window
     - `content_item_sources` mappings
   - call `persistDigestFromContentItems({ paidCallsAllowed: false, mode: "low", ... })`
   - assert:
     - returned result is non-null
     - digest row exists
     - at least 1 digest_item exists
5. Add cleanup (close DB, stop container if used).

## Acceptance criteria

- [ ] `pnpm test` passes and does **not** require Docker.
- [ ] `pnpm test:integration` runs and passes when Docker is available.
- [ ] Integration test does **not** call network and does **not** require LLM keys (uses `paidCallsAllowed=false`).
- [ ] `pnpm -r typecheck` passes.

## Test plan (copy/paste)

```bash
pnpm -r typecheck
pnpm test

# Requires Docker (and possibly running services, depending on driver decision):
pnpm test:integration
```

## Commit

- **Message**: `test(integration): add docker-backed pipeline smoke test`
- **Files expected**:
  - `package.json`
  - `vitest.config.ts`
  - `vitest.integration.config.ts`
  - `<new integration test file>`

## Final step (required): print GPT‑5.2 review prompt

After committing, print this block **filled in**:

```text
REVIEW PROMPT (paste into GPT‑5.2 xtra high)

You are GPT‑5.2 xtra high acting as a senior reviewer/architect in this repo.
Please review my just-finished change for correctness, spec compliance, and unintended side effects.

Repo: /Users/lamosty/projects/aharadar
Branch: <branch-name>
Commit(s): <commit-hash(es)>

Task spec followed:
- docs/_session/tasks/task-027-integration-tests-harness.md
- docs/pipeline.md
- docs/budgets.md

What I changed (1–3 bullets):
- ...

Files changed:
- ...

How to validate:
- pnpm -r typecheck
- pnpm test
- pnpm test:integration

What I’m unsure about / decisions I made:
- ...
```
