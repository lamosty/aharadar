# Task template (for Opus implementer)

---

## Task: `feat(abtests): backend runner + API`

- **Owner**: Claude Code Opus 4.5 (implementer)
- **Reviewer**: GPT‑5.2 xtra high (architect/reviewer)
- **Driver**: human (runs commands, merges)

### Goal

Add a queued AB‑test runner that triages the **same cluster candidates** across multiple model variants, stores results, and exposes admin API endpoints to create/list/view runs. AB tests must **bypass credits** (dev‑only) while still recording provider calls for audit.

### Read first (contracts + code)

- `AGENTS.md`
- `CLAUDE.md`
- `docs/abtests.md`
- `docs/llm.md`
- `docs/pipeline.md`
- `docs/data-model.md`
- `packages/pipeline/src/stages/digest.ts`
- `packages/llm/src/triage.ts`
- `packages/queues/src/index.ts`
- `packages/worker/src/workers/pipeline.worker.ts`
- `packages/api/src/routes/admin.ts`

### Scope (allowed files)

- `packages/queues/src/index.ts`
- `packages/worker/src/workers/pipeline.worker.ts`
- `packages/pipeline/src/abtests/*` (new folder)
- `packages/pipeline/src/index.ts`
- `packages/llm/src/triage.ts`
- `packages/api/src/routes/admin.ts`
- `packages/api/src/routes/*.ts` (if you choose a dedicated abtests route)
- `packages/db/src/repos/abtests.ts`
- `packages/shared/src/*` (only if needed for shared types)

If anything else seems required, stop and ask before changing.

### Decisions (if any)

- AB tests are **cluster‑based**; use the same candidate query logic as digest selection.
- AB tests **bypass credits**: do not call `computeCreditsStatus`; record provider calls with `cost_estimate_credits = 0` and `meta_json.abtest_run_id`.
- Provider calls should keep `purpose = "triage"` and include `meta_json.abtest_run_id` + `variant_id` + `abtest_item_id` for filtering.
- Feature must be **opt‑in** (experimental): guarded by `ENABLE_ABTESTS=true` env; API returns 404/403 when disabled.
- AB tests run **only via admin/manual**, not scheduler.
- Reuse the existing **pipeline queue** with job name `run_abtest`.
- Sampling should match app behavior: use **stratified sampling** (not top‑by‑heuristic only).

### Implementation steps (ordered)

1. Add queue support:
   - Introduce `RUN_ABTEST_JOB_NAME` + `RunAbtestJobData` in `packages/queues/src/index.ts`.
   - Keep same queue name (`pipeline`) to avoid extra infra.
2. Update worker:
   - Extend the pipeline worker to handle both `run_window` and `run_abtest` jobs.
   - If `ENABLE_ABTESTS` is false, log + mark job failed with a clear message.
3. Add AB‑test runner module:
   - Create `packages/pipeline/src/abtests/run_abtest.ts` (or similar) with a single entry `runAbtestOnce(...)`.
   - Reuse **cluster candidate selection** from `digest.ts` (refactor into a shared helper if needed).
   - Sample candidates using the same stratified sampling policy (fair coverage).
   - Persist `abtest_run`, `abtest_variants`, and `abtest_items` before model calls.
   - For each variant, call `triageCandidate` with per‑variant overrides (provider, model, **reasoning_effort**, max_output_tokens).
   - Store outputs in `abtest_results` plus provider_calls (credits=0, `meta_json.abtest_run_id` + `variant_id` + `abtest_item_id`).
   - Update `abtest_runs.status` through `queued → running → completed|failed`.
4. Enable per‑variant reasoning override:
   - Extend `triageCandidate` to accept an optional `reasoningEffort` override (falls back to env if undefined).
   - Ensure passing `null/undefined` omits reasoning ("none" test case).
5. Admin API:
   - `POST /admin/abtests` → validate window/topic; validate variants array; enqueue job; return `{ runId, jobId }`.
   - `GET /admin/abtests` → list recent runs.
   - `GET /admin/abtests/:id` → run detail including variants, items, results.

### Acceptance criteria

- [ ] AB‑test run can be enqueued and completes via worker.
- [ ] Results are stored per variant and item; provider_calls records show `abtest_run_id` meta and credits=0.
- [ ] API endpoints list and return run details.
- [ ] Reasoning effort can be varied per variant (low vs none) without mutating global env.

### Test plan (copy/paste commands)

```bash
pnpm -r typecheck
# Optional: run worker + API locally, create an abtest via POST /admin/abtests
```

### Commit

- **Message**: `feat(abtests): backend runner + API`
- **Files expected**:
  - `packages/queues/src/index.ts`
  - `packages/worker/src/workers/pipeline.worker.ts`
  - `packages/pipeline/src/abtests/*`
  - `packages/pipeline/src/index.ts`
  - `packages/llm/src/triage.ts`
  - `packages/api/src/routes/admin.ts` (and/or new abtests route)
  - `packages/db/src/repos/abtests.ts`

Commit instructions:

- Make exactly **one commit** per task spec (unless the spec explicitly asks for multiple).
- If you had to touch files outside **Scope**, stop and ask before committing.
- If you believe the task’s decisions are outdated/risky, raise it (see “Open questions / uncertainties”) and ask the driver before deviating.
- Subagents / skills:
  - If you spawn subagents, they may not reliably perform git commits.
  - The **main Opus loop** must always be the one to run `git add` / `git commit` and write the report files.

### Final step (required): write task report files (no copy/paste)

After committing, write a short task report to:

- `docs/_session/results/latest.md` (overwrite each task)

If you execute multiple tasks back-to-back, also write a single end-of-run recap to:

- `docs/_session/results/final-recap.md` (overwrite once at the end)

Then print only the file path(s) you wrote (so the driver can open them), e.g.:

```text
WROTE REPORT: docs/_session/results/latest.md
WROTE FINAL RECAP: docs/_session/results/final-recap.md
```

`latest.md` format:

```text
TASK REPORT

Repo: /Users/lamosty/projects/aharadar
Branch: <branch-name>
Commit(s): <commit-hash(es)>
Commit message: <type(scope)>: <message>
Subagents used (if any): <none | list skill/subagent names>

Task spec followed:
- <path to this task spec>
- <ADR paths if relevant>

What I changed (1–3 bullets):
- ...

Files changed:
- <list>

How to validate:
- pnpm -r typecheck
- <any CLI smoke commands>

Open questions / uncertainties:
- ...
```

`final-recap.md` format (batch runs only):

```text
FINAL RECAP

Tasks completed (in order):
1) <task spec path> — <commit> — <1-line summary>
2) ...

Files changed (union):
- ...

How to validate (full):
- pnpm -r typecheck
- pnpm test
- pnpm test:integration (if applicable)
- <any required smoke commands>

Open questions / uncertainties (all tasks):
- ...
```
