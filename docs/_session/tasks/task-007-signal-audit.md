# Task 007 — `refactor(signal): stop emitting per-post signal items`

- **Owner**: Claude Code Opus 4.5 (implementer)
- **Reviewer**: GPT‑5.2 xtra high
- **Driver**: human (runs commands, merges)

## Goal

Now that `x_posts` is the canonical way to ingest X/Twitter posts, make `signal` a **bundle-only amplifier**:

- stop emitting/storing per-post `signal_post_v1` items
- keep `signal_bundle_v1` for debug/audit + (later) corroboration
- remove pipeline special-casing that treated signal posts as canonical candidates

## Read first (required)

- `AGENTS.md`
- `CLAUDE.md`
- `docs/connectors.md` (signal + x_posts semantics)
- `docs/pipeline.md` (candidate selection + signal notes)
- `docs/sessions/recaps/recap-2026-01-05T2133Z-x-posts-cadence-tests-workflow.md` (What’s next #1)
- Code:
  - `packages/connectors/src/signal/fetch.ts`
  - `packages/connectors/src/signal/normalize.ts`
  - `packages/pipeline/src/stages/cluster.ts`
  - `packages/pipeline/src/stages/dedupe.ts`
  - `packages/pipeline/src/stages/digest.ts` (signal bundle exclusion logic)

## Scope (allowed files)

- `docs/connectors.md`
- `docs/pipeline.md`
- `packages/connectors/src/signal/fetch.ts`
- `packages/connectors/src/signal/normalize.ts`
- `packages/pipeline/src/stages/cluster.ts`
- `packages/pipeline/src/stages/dedupe.ts`

If you think anything else is required, **stop and ask** before editing.

## Decisions (already decided)

- `signal` is **bundle-only for now** (no new `signal_post_v1` rows). `x_posts` is the canonical X post ingestion path.
- Do **not** add backfill/compat logic for old DB rows in this task. If local/dev data contains legacy `signal_post_v1`, prefer reset + re-ingest.

## Implementation steps (ordered)

1. Update `docs/connectors.md`:
   - remove or clearly deprecate `signal_post_v1`
   - define `signal` as a derived/bundle-only amplifier connector
   - keep `x_posts` as the canonical X post ingestion path
2. Update `docs/pipeline.md`:
   - update the “Canonical vs signal content” section so `signal` items are not eligible for clustering/digests
   - keep “signal corroboration” as an amplifier feature (URL-only) but not as displayed canonical items
3. Update `packages/connectors/src/signal/fetch.ts`:
   - stop emitting raw items with `kind: "signal_post_v1"`
   - keep bundle emission behavior (store bundles when configured, and always store unparseable responses)
   - keep cursor advancement semantics unchanged (advance `since_time` only when a provider call succeeds)
4. Update `packages/connectors/src/signal/normalize.ts`:
   - remove the `signal_post_v1` normalization path
   - ensure all normalized signal items have `canonicalUrl: null` and `metadata.kind: "signal_bundle_v1"`
5. Update pipeline stages that currently allow signal posts:
   - `packages/pipeline/src/stages/cluster.ts`: remove the `signal_post_v1` allowlist clause so `source_type='signal'` is excluded
   - `packages/pipeline/src/stages/dedupe.ts`: same
6. Do not add backward-compat logic for existing DB rows:
   - if local DB has old `signal_post_v1` items, prefer `./scripts/reset.sh` + re-ingest.

## Acceptance criteria

- [ ] New `signal` ingests create only bundle rows (`source_type='signal'`, `canonical_url is null`, `metadata_json.kind='signal_bundle_v1'`).
- [ ] `cluster` and `dedupe` stages no longer consider any `signal` items as candidates.
- [ ] `pnpm -r typecheck` passes.
- [ ] (If env configured) `pnpm dev:cli -- admin:run-now --source-type signal` does not crash and still records `provider_calls` for signal searches.

## Test plan (copy/paste)

```bash
pnpm -r typecheck

# Optional smoke (requires signal provider env):
pnpm dev:cli -- admin:run-now --source-type signal --max-items-per-source 5
pnpm dev:cli -- admin:signal-debug --kind all --limit 20 --verbose
```

## Commit

- **Message**: `refactor(signal): stop emitting per-post signal items`
- **Files expected**:
  - `docs/connectors.md`
  - `docs/pipeline.md`
  - `packages/connectors/src/signal/fetch.ts`
  - `packages/connectors/src/signal/normalize.ts`
  - `packages/pipeline/src/stages/cluster.ts`
  - `packages/pipeline/src/stages/dedupe.ts`

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
- docs/_session/tasks/task-007-signal-audit.md

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
