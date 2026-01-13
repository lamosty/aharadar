# Task 140 — `feat(pipeline): content‑rich cluster display representative`

- **Owner**: Claude Code Opus 4.5 (implementer)
- **Reviewer**: GPT‑5.2 xtra high
- **Driver**: human (runs commands, merges)

## Goal

Clusters currently display a representative item chosen by **title + recency**. This can
surface short or less informative items (e.g., tweets) even when a richer article exists
in the cluster. We want a **content‑rich display representative** for UI, summaries, and
digests, without changing the scoring model.

## Read first (required)

- `AGENTS.md`
- `docs/pipeline.md`
- `docs/data-model.md`
- Code:
  - `packages/pipeline/src/stages/cluster.ts`
  - `packages/pipeline/src/stages/digest.ts`
  - `packages/cli/src/commands/inbox.ts`
  - `packages/cli/src/commands/review.ts`
  - `packages/api/src/routes/items.ts`
  - `packages/api/src/routes/digests.ts`

## Decisions (approved)

1) **Display representative heuristic** (in this order):
   - Prefer items with a **title**
   - Prefer **non‑x_posts** when a canonical article exists in cluster
   - Prefer **longer body_text**
   - Prefer **canonical_url** presence
   - Then **recency**
2) **No per‑member triage** (avoid extra LLM cost).
3) Representative used for **display**; scoring logic unchanged.

## Scope (allowed files)

- `packages/pipeline/src/stages/cluster.ts`
- `packages/pipeline/src/stages/digest.ts`
- `packages/cli/src/commands/inbox.ts`
- `packages/cli/src/commands/review.ts`
- Optional helper (if you want to reduce duplication):
  - `packages/db/src/repos/clusters.ts` (create if needed)
- Docs (update if representative policy is described):
  - `docs/pipeline.md`
  - `docs/data-model.md`

## Implementation requirements

### 1) Update cluster representative (required)

When attaching a new item to an existing cluster, **recompute the cluster representative**
using the heuristic above. Update `clusters.representative_content_item_id` accordingly.

- Must be deterministic (add stable tie‑breaker by `id`).
- Do **not** require extra LLM calls.

Suggested SQL ordering (conceptual):

```sql
order by
  (case when ci.title is not null then 0 else 1 end) asc,
  (case when ci.source_type != 'x_posts' and ci.canonical_url is not null then 0 else 1 end) asc,
  length(coalesce(ci.body_text, '')) desc,
  (case when ci.canonical_url is not null then 0 else 1 end) asc,
  coalesce(ci.published_at, ci.fetched_at) desc,
  ci.id asc
```

### 2) Digest representative selection (required)

In `packages/pipeline/src/stages/digest.ts`, update the **cluster representative selection
within the window** to use the same heuristic ordering as above (still constrained to the
window).

### 3) CLI representative selection (required)

Update cluster representative selection logic in:

- `packages/cli/src/commands/inbox.ts`
- `packages/cli/src/commands/review.ts`

so they use the same heuristic.

### 4) API usage (expected impact)

- The API feed and digest detail already use `clusters.representative_content_item_id`.
- Once the representative is updated in the cluster stage, UI will improve without
  additional changes.

## Acceptance criteria

- [ ] Clusters display richer items (articles over tweets when available)
- [ ] Representative selection is deterministic
- [ ] No changes to scoring math
- [ ] CLI and digest pipeline use the same heuristic ordering

## Test plan (copy/paste)

```bash
pnpm -r typecheck
pnpm test
```

## Commit (suggested)

- **Message**: `feat(pipeline): pick content‑rich cluster representatives`
- **Files expected**:
  - `packages/pipeline/src/stages/cluster.ts`
  - `packages/pipeline/src/stages/digest.ts`
  - `packages/cli/src/commands/inbox.ts`
  - `packages/cli/src/commands/review.ts`
  - `docs/pipeline.md` (if updated)
  - `docs/data-model.md` (if updated)
