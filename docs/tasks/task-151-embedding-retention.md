# Task 151 — `feat(pipeline,db): embedding retention + vector budget cleanup`

- **Owner**: Claude Code Opus 4.5 (implementer)
- **Reviewer**: GPT‑5.2 xtra high (architect/reviewer)
- **Driver**: human (runs commands, merges)

## Goal

Bound embedding storage growth while preserving ranking quality. Add a retention policy and cleanup job so embeddings do not grow without limit, and keep a clean handoff path for a future Knowledge Hub.

## Read first (contracts + code)

- `AGENTS.md`
- `docs/spec.md`
- `docs/architecture.md`
- `docs/data-model.md`
- `docs/pipeline.md`
- `docs/budgets.md`
- `packages/db/src/repos/embeddings.ts`
- `packages/pipeline/src/stages/*`
- `packages/worker/src/*`

## Scope (allowed files)

- `docs/data-model.md`
- `docs/pipeline.md`
- `packages/shared/src/types/*`
- `packages/db/src/repos/embeddings.ts`
- `packages/pipeline/src/stages/*`
- `packages/worker/src/*`
- `packages/api/src/routes/admin.ts`
- `packages/web/src/app/app/admin/*`

If anything else seems required, stop and ask before changing.

## Decisions (if any)

- Retention policy shape (pick one):
  - Time-based only (e.g., keep embeddings for last N days)
  - Volume-based only (e.g., keep last N items per topic)
  - Hybrid (time + volume cap)
- Keep embeddings indefinitely for:
  - liked/saved items (default: yes)
  - Knowledge Hub exported items (default: yes)
- Minimum retention window for novelty/cluster lookback (default: >= theme lookback + novelty lookback)

If unclear, stop and ask the driver.

## Implementation steps (ordered)

1. Add `embedding_retention_v1` to topic `custom_settings` with defaults and clamp ranges.
2. Add a cleanup routine to remove embeddings that are outside the retention policy and are not protected (liked/saved/exported).
3. Ensure clustering/novelty stages only depend on recent embeddings; document any tradeoffs.
4. Add a daily (or per-run) cleanup job hook in worker/scheduler.
5. Update docs to describe retention behavior and Knowledge Hub handoff expectations.

## Acceptance criteria

- [ ] Embedding growth is bounded by retention policy.
- [ ] Liked/saved (and future Knowledge Hub) items are preserved.
- [ ] No change to ranking correctness within the retained window.
- [ ] Docs updated with the new retention policy.

## Test plan (copy/paste commands)

```bash
pnpm -C packages/shared typecheck
pnpm -C packages/db typecheck
pnpm -C packages/pipeline typecheck
pnpm -C packages/worker typecheck
```

## Commit

- **Message**: `feat(pipeline,db): add embedding retention policy`
- **Files expected**:
  - `packages/shared/src/types/*`
  - `packages/db/src/repos/embeddings.ts`
  - `packages/pipeline/src/stages/*`
  - `packages/worker/src/*`
  - `docs/pipeline.md`
  - `docs/data-model.md`
