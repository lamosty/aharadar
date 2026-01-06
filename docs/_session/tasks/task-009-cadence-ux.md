# Task 009 — `feat(cli): add helper to set per-source cadence`

- **Owner**: Claude Code Opus 4.5 (implementer)
- **Reviewer**: GPT‑5.2 xtra high
- **Driver**: human (runs commands, merges)

## Goal

Add a small CLI helper so humans don’t have to hand-edit JSON to set cadence:

- set `sources.config_json.cadence = { mode: "interval", every_minutes: N }`
- optionally clear cadence

This should make it easy to set `x_posts` daily cadence (1440 minutes) while allowing other sources to run more frequently.

## Read first (required)

- `AGENTS.md`
- `CLAUDE.md`
- `docs/adr/0009-source-cadence.md` (contract)
- `docs/sessions/recaps/recap-2026-01-05T2133Z-x-posts-cadence-tests-workflow.md` (What’s next #3)
- Code:
  - `packages/cli/src/commands/admin.ts` (sources commands live here)
  - `packages/db/src/repos/sources.ts` (optional: add a repo method for updating config_json)
  - `packages/pipeline/src/stages/ingest.ts` (how cadence is parsed + enforced)

## Scope (allowed files)

- `packages/cli/src/commands/admin.ts`
- (optional, preferred) `packages/db/src/repos/sources.ts`

If anything else seems required, **stop and ask**.

## Decisions (already decided)

- The CLI helper must support:
  - single-source updates via `--source-id`
  - bulk updates via `--topic` + `--source-type` (for real human UX)

## Contract (do not improvise)

From ADR 0009:

- cadence config lives in `sources.config_json.cadence`:

```json
{ "mode": "interval", "every_minutes": 480 }
```

## Implementation steps (ordered)

1. Add a new admin command (name suggestion):
   - `admin:sources-set-cadence (--source-id <uuid> | --topic <id-or-name> --source-type <type>[,<type>...]) (--every-minutes <int> | --clear) [--dry-run]`
2. Implementation:
   - resolve the target sources:
     - if `--source-id` is set: target exactly that source
     - else: require `--topic` and `--source-type` and target all matching sources in that topic
   - support `--dry-run` that prints what would change but does not write to DB
   - parse and validate `every_minutes` (positive integer)
   - update `config_json`:
     - set: `cadence: { mode: "interval", every_minutes }`
     - clear: remove `cadence` key
   - persist back to the `sources` table (`config_json`)
3. Print a clear confirmation including:
   - source id
   - previous cadence (if any)
   - new cadence (or “cleared”)

## Acceptance criteria

- [ ] `pnpm -r typecheck` passes.
- [ ] You can set cadence on an existing source id and confirm it is persisted (via `admin:sources-list` output).
- [ ] You can set cadence in bulk for a topic + source type (e.g. all `x_posts` sources in a topic).
- [ ] Running `admin:run-now` twice respects cadence (second run shows “skipped … not_due” for that source).

## Test plan (copy/paste)

```bash
pnpm -r typecheck

# Find a source id:
pnpm dev:cli -- admin:sources-list

# Set cadence (example: daily):
pnpm dev:cli -- admin:sources-set-cadence --source-id <uuid> --every-minutes 1440

# Bulk set cadence (example: daily for all x_posts sources in a topic):
pnpm dev:cli -- admin:sources-set-cadence --topic default --source-type x_posts --every-minutes 1440

# Run twice and confirm second ingest skips due to cadence:
pnpm dev:cli -- admin:run-now --source-id <uuid> --max-items-per-source 1
pnpm dev:cli -- admin:run-now --source-id <uuid> --max-items-per-source 1
```

## Commit

- **Message**: `feat(cli): add helper to set per-source cadence`
- **Files expected**:
  - `packages/cli/src/commands/admin.ts`
  - (optional) `packages/db/src/repos/sources.ts`

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
- docs/_session/tasks/task-009-cadence-ux.md
- docs/adr/0009-source-cadence.md

What I changed (1–3 bullets):
- ...

Files changed:
- ...

How to validate:
- pnpm -r typecheck
- <CLI smoke commands you ran>

What I’m unsure about / decisions I made:
- ...

Then:
1) Tell me “LGTM” or “Changes required”
2) If changes required, give exact edits (files + what to change)
3) Suggest follow-up tasks (if any)
```
