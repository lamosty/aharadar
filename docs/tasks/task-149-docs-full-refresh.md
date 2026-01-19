# Task 149 — `docs: full documentation + README refresh`

- **Owner**: Claude Code Opus 4.5 (implementer)
- **Reviewer**: GPT-5.2 xtra high
- **Driver**: human (runs commands, merges)

## Goal

Bring all documentation and main README files fully in sync with the current repo state,
features, and workflows. Remove outdated statements, fix inconsistencies, and ensure the
docs present a coherent, accurate view of Aha Radar today.

## Read first (required)

- `AGENTS.md`
- `README.md`
- Docs index + core contracts:
  - `docs/README.md`
  - `docs/spec.md`
  - `docs/architecture.md`
  - `docs/data-model.md`
  - `docs/pipeline.md`
  - `docs/connectors.md`
  - `docs/llm.md`
  - `docs/budgets.md`
  - `docs/cli.md`
  - `docs/api.md`
  - `docs/abtests.md`
- Workflow/process docs:
  - `docs/workflows/ai-collab.md`
  - `docs/workflows/opus-task-generator.md`
  - `docs/workflows/task-template.md`
- ADRs and recent recaps:
  - `docs/adr/*`
  - Latest in `docs/recaps/`

## Scope (allowed files)

- `README.md`
- `docs/**/*.md` (including `docs/README.md`, `docs/tasks/README.md`, `docs/learnings/README.md`)

If anything else seems required, stop and ask before changing.

## Decisions (locked)

1. **Docs-only**: do not modify runtime code, config, or scripts in this task.
2. **Truth over aspiration**: document current behavior and repo structure; do not introduce
   new features or contracts in docs without confirming in code/ADRs.
3. **Topic-agnostic + provider-agnostic** language remains mandatory.

## Implementation steps (ordered)

1. **Inventory & diff**
   - Scan all docs and README files for outdated statements, mismatched package lists,
     or references to removed/renamed components.
   - Cross-check against actual repo structure (`packages/`, `scripts/`, `docker/`, `infra/`).

2. **Update main READMEs**
   - `README.md`: current status, quickstart, dev workflow, and accurate package/service list.
   - `docs/README.md`: reading order, doc map, decision checklist accuracy.
   - `docs/tasks/README.md`: task list accuracy + any section headers that are stale.
   - `docs/learnings/README.md`: ensure its purpose and structure are current.

3. **Refresh core docs for accuracy**
   - `docs/spec.md`, `docs/architecture.md`, `docs/pipeline.md`, `docs/data-model.md`,
     `docs/connectors.md`, `docs/llm.md`, `docs/budgets.md`, `docs/cli.md`, `docs/api.md`,
     `docs/abtests.md`.
   - Align terminology (Aha Score vs AI score, tiers, budget naming, connector naming).
   - Ensure package names match the repo (`packages/api`, `packages/web`, `packages/queues`, etc.).

4. **Workflows + ADR alignment**
   - Verify workflow docs describe current AI/collab process.
   - Ensure ADR references and statuses match decisions reflected in docs.

5. **Consistency pass**
   - Add/refresh lightweight TOCs for longer docs if missing.
   - Fix broken internal links and inconsistent headings.
   - Remove duplicated or contradictory descriptions across docs.

6. **Notes for uncertainties**
   - If any doc statements cannot be verified, flag them explicitly in the doc or ask the driver
     before changing the contract language.

## Acceptance criteria

- [ ] All README files and docs under `docs/` reviewed and updated for accuracy.
- [ ] No stale references to removed/renamed packages, connectors, or workflows.
- [ ] Terminology is consistent across docs (scores, budgets, connectors, pipelines).
- [ ] Docs index and task list accurately reflect current repo structure.
- [ ] Internal links are valid and headings follow a consistent structure.
- [ ] No runtime/code changes were required.

## Test plan (copy/paste)

```bash
# Docs-only change; no automated tests required.
# Optional: run formatter if it is already part of the repo workflow.
```

## Commit

- **Message**: `docs: refresh documentation and readmes`
- **Files expected**:
  - `README.md`
  - `docs/README.md`
  - `docs/spec.md`
  - `docs/architecture.md`
  - `docs/data-model.md`
  - `docs/pipeline.md`
  - `docs/connectors.md`
  - `docs/llm.md`
  - `docs/budgets.md`
  - `docs/cli.md`
  - `docs/api.md`
  - `docs/abtests.md`
  - `docs/tasks/README.md`
  - `docs/learnings/README.md`
  - `docs/workflows/ai-collab.md`
  - `docs/workflows/opus-task-generator.md`
  - `docs/workflows/task-template.md`
  - `docs/adr/*` (only if needed to reflect confirmed decisions)

Commit instructions:

```bash
git add README.md docs/
git commit -m "docs: refresh documentation and readmes"
```
