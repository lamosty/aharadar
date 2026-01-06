# Task 016 — `feat(cli+pipeline): source weights + bulk source admin helpers`

- **Owner**: Claude Code Opus 4.5 (implementer)
- **Reviewer**: GPT‑5.2 xtra high
- **Driver**: human (runs commands, merges)

## Goal

Add a practical UX layer for tuning sources without hand-editing JSON:

1. **Source weights** (affect ranking)
2. **Bulk enable/disable** sources (admin UX)

## Read first (required)

- `AGENTS.md`
- `CLAUDE.md`
- `docs/pipeline.md` (Rank: “Source weight” is a listed feature)
- Code:
  - `packages/pipeline/src/stages/digest.ts`
  - `packages/pipeline/src/stages/rank.ts`
  - `packages/cli/src/commands/admin.ts`
  - `packages/db/src/repos/sources.ts`

## Scope (allowed files)

- `packages/pipeline/src/stages/digest.ts`
- `packages/pipeline/src/stages/rank.ts`
- `packages/cli/src/commands/admin.ts`
- `packages/db/src/repos/sources.ts` (optional helper methods)
- (optional) `docs/pipeline.md` (one short note about the config shape)

If anything else seems required, **stop and ask**.

## Decisions (already decided)

- Use **both** weights:
  - **per-source-type** weight (defaults to 1.0; used for optional fine-tuning later)
  - **per-source** weight (does most of the real tuning)
- Effective weight:
  - `effectiveWeight = clamp(typeWeight * sourceWeight)`
- Config locations (MVP):
  - per-source: `sources.config_json.weight` (number, default 1.0)
  - per-source-type: env var `SOURCE_TYPE_WEIGHTS_JSON` (JSON object mapping `source.type` → number), default `{}` (meaning all types weight=1.0)

## Implementation steps (ordered)

### A) Source weights (pipeline)

1. Read a numeric weight for each candidate source:
   - recommended config key: `sources.config_json.weight`
   - default = `1.0`
   - validate/clamp to a safe range (e.g. `[0.1, 3.0]`)
2. Incorporate weight into ranking:
   - parse per-source-type weight from `SOURCE_TYPE_WEIGHTS_JSON`:
     - missing/invalid JSON → treat as `{}` (all types = 1.0)
     - missing type key → 1.0
   - compute `effectiveWeight = clamp(typeWeight * sourceWeight)`
   - simplest: multiply final score by `effectiveWeight`
   - store explainability (if triage exists):
     - `triage_json.system_features.source_weight_v1 = { type_weight, source_weight, effective_weight }`

### B) Bulk source admin helpers (CLI)

3. Add an admin command to set weights:
   - `admin:sources-set-weight (--source-id <uuid> | --topic <id-or-name> --source-type <type>[,<type>...]) --weight <number> [--dry-run]`
4. Add an admin command to enable/disable sources:
   - `admin:sources-set-enabled (--source-id <uuid> | --topic <id-or-name> --source-type <type>[,<type>...]) --enabled <true|false> [--dry-run]`
5. Print a summary:
   - how many sources matched
   - how many would change vs were already in desired state
   - list source ids + names (capped)

## Acceptance criteria

- [ ] You can set a weight for a single source and see ranking reflect it on next digest.
- [ ] You can set weights in bulk for a topic + source type.
- [ ] You can enable/disable sources in bulk for a topic + source type.
- [ ] `pnpm -r typecheck` passes.

## Test plan (copy/paste)

```bash
pnpm -r typecheck

# List sources:
pnpm dev:cli -- admin:sources-list

# Set a weight:
pnpm dev:cli -- admin:sources-set-weight --source-id <uuid> --weight 0.5

# Bulk disable:
pnpm dev:cli -- admin:sources-set-enabled --topic default --source-type rss --enabled false --dry-run
pnpm dev:cli -- admin:sources-set-enabled --topic default --source-type rss --enabled false

# Re-run pipeline to observe changes:
pnpm dev:cli -- admin:run-now --topic default
pnpm dev:cli -- inbox --table
```

## Commit

- **Message**: `feat(cli+pipeline): source weights + bulk source admin helpers`
- **Files expected**:
  - `packages/pipeline/src/stages/digest.ts`
  - `packages/pipeline/src/stages/rank.ts`
  - `packages/cli/src/commands/admin.ts`
  - (optional) `packages/db/src/repos/sources.ts`
  - (optional) `docs/pipeline.md`

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
- docs/_session/tasks/task-016-source-weights-admin-ux.md
- docs/pipeline.md

What I changed (1–3 bullets):
- ...

Files changed:
- ...

How to validate:
- pnpm -r typecheck
- <CLI smoke commands you ran>
```
