# Task 001 — `feat(pipeline): gate ingestion by per-source cadence`

- **Owner**: Claude Code Opus 4.5 (implementer)
- **Reviewer**: GPT‑5.2 xtra high
- **Driver**: human (runs commands, merges)

## Goal

Implement the generic **per-source cadence gating** described in ADR 0009, so each source can control how often it is fetched (daily / 3× daily / weekly / etc.) independent of pipeline run frequency.

## Read first (required)

- `AGENTS.md`
- `CLAUDE.md`
- `docs/adr/0009-source-cadence.md`
- Code:
  - `packages/pipeline/src/stages/ingest.ts`

## Scope (allowed files)

- `packages/pipeline/src/stages/ingest.ts`
- Optional (only if it improves clarity): one small helper under `packages/pipeline/src/stages/` (e.g. `cadence.ts`)

If you think you need to change anything else, **stop and ask** before editing.

## Contract (do not improvise)

From ADR 0009:

- Cadence config lives in `sources.config_json.cadence`:

```json
{ "mode": "interval", "every_minutes": 480 }
```

- Last successful fetch time lives in `sources.cursor_json.last_fetch_at` (ISO string).
- If cadence is missing: treat as **always due**.
- If not due: do **not** call `connector.fetch()`, do **not** update cursor, do **not** record provider_calls.
- If due and fetch succeeds (`ok|partial`): persist cursor with `last_fetch_at = windowEnd` merged into `nextCursor`.
- Use `windowEnd` as “now” (deterministic per run).

## Implementation steps (ordered)

1. **Parse cadence** from `source.config_json`:
   - Supported MVP shape: `{ mode: "interval", every_minutes: number }`
   - Validate `every_minutes` is a positive finite integer; if invalid, treat cadence as missing (always due) and log a warning.
2. **Parse `last_fetch_at`** from `source.cursor_json`:
   - If missing or invalid, treat as never fetched → due.
3. **Compute due** using `now = windowEnd`:
   - due if `now - last_fetch_at >= every_minutes * 60_000`
4. **Integrate into `ingestEnabledSources()`**:
   - Check “due” **before** starting a fetch run and before calling the connector.
   - If not due: append an `IngestSourceResult` entry with `status="ok"` and all counts zero. (No fetch_run, no cursor update.)
5. When due and fetch succeeds (`ok|partial`):
   - Merge `last_fetch_at: windowEnd` into the cursor you persist:
     - `updateCursor(source.id, { ...nextCursor, last_fetch_at: windowEnd })`
   - Ensure you do **not** overwrite unrelated cursor fields.

## Acceptance criteria

- [ ] A source with `cadence.every_minutes = 1440` is fetched at most once per day even if `admin:run-now` is run multiple times.
- [ ] `cursor_json.last_fetch_at` only changes after successful fetch (`ok|partial`), never on skip.
- [ ] Sources without cadence behave exactly as before.

## Test plan (copy/paste)

```bash
pnpm -r typecheck

# Run twice and confirm cadence prevents second fetch for that source type/source.
pnpm dev:cli -- admin:run-now --source-type <type> --max-items-per-source 1
pnpm dev:cli -- admin:run-now --source-type <type> --max-items-per-source 1
```

## Commit

- **Message**: `feat(pipeline): gate ingestion by per-source cadence`
- **Files expected**:
  - `packages/pipeline/src/stages/ingest.ts` (and optionally one helper file)

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
- docs/_session/tasks/task-001-cadence-gating.md
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
