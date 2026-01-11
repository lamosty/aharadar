# Task template (for Opus implementer)

---

## Task: `feat(db): add abtest schema + repos`

- **Owner**: Claude Code Opus 4.5 (implementer)
- **Reviewer**: GPT‑5.2 xtra high (architect/reviewer)
- **Driver**: human (runs commands, merges)

### Goal

Add persistent AB‑test storage (runs/variants/items/results) plus DB repos and docs updates so backend/UI can query past experiments.

### Read first (contracts + code)

- `AGENTS.md`
- `CLAUDE.md`
- `docs/data-model.md`
- `docs/llm.md`
- `docs/pipeline.md`
- `docs/README.md`

### Scope (allowed files)

- `docs/data-model.md`
- `docs/README.md`
- `docs/abtests.md` (new)
- `packages/db/migrations/0018_abtests.sql` (new)
- `packages/db/src/db.ts`
- `packages/db/src/index.ts`
- `packages/db/src/repos/abtests.ts` (new)
- `packages/db/src/repos/*.ts` (only if needed for shared helpers)

If anything else seems required, stop and ask before changing.

### Decisions (if any)

- Store AB tests **separately** from digests; do not reuse `digests` or `digest_items`.
- AB tests are **cluster‑based** (store `cluster_id` + representative content item snapshot).
- Results are **persistent** so past experiments can be browsed.

### Implementation steps (ordered)

1. Add `docs/abtests.md` describing the AB‑test concept, run lifecycle, and DB entities (runs/variants/items/results).
2. Update `docs/README.md` to link `docs/abtests.md` in the docs index.
3. Update `docs/data-model.md` to include AB‑test tables and indexes (contract‑level).
4. Create migration `0018_abtests.sql` with tables + indexes:
   - `abtest_runs` (user_id, topic_id, window_start/end, status, config_json, created/started/completed)
   - `abtest_variants` (run_id, name, provider, model, reasoning_effort, max_output_tokens, order)
   - `abtest_items` (run_id, candidate_id, cluster_id/content_item_id, representative_content_item_id, source_id/type, title/url/author/published_at/body_text snapshot)
   - `abtest_results` (abtest_item_id, variant_id, triage_json, input_tokens, output_tokens, status, error_json, created_at)
5. Add a DB repo `abtests.ts` with minimal, typed helpers:
   - createRun / updateRunStatus
   - insertVariants
   - insertItems
   - insertResults
   - listRuns (recent)
   - getRunDetail (run + variants + items + results)
6. Wire repo into `packages/db/src/db.ts` and export from `packages/db/src/index.ts`.

### Acceptance criteria

- [ ] Migration adds the four AB‑test tables + indexes.
- [ ] DB repo exposes typed helpers for create/list/detail and inserts.
- [ ] Docs describe the AB‑test data model and are discoverable from `docs/README.md`.

### Test plan (copy/paste commands)

```bash
pnpm -r typecheck
```

### Commit

- **Message**: `feat(db): add abtest schema + repos`
- **Files expected**:
  - `docs/abtests.md`
  - `docs/README.md`
  - `docs/data-model.md`
  - `packages/db/migrations/0018_abtests.sql`
  - `packages/db/src/db.ts`
  - `packages/db/src/index.ts`
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
