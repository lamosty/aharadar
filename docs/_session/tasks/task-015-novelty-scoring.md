# Task 015 — `feat(pipeline): add novelty feature to ranking (topic-scoped, embedding-based)`

- **Owner**: Claude Code Opus 4.5 (implementer)
- **Reviewer**: GPT‑5.2 xtra high
- **Driver**: human (runs commands, merges)

## Goal

Add a deterministic “novelty” feature so older/repeated themes rank lower:

- compute novelty from **embedding similarity** against topic history
- wire it into ranking with a small weight
- expose it in `triage_json.system_features.novelty_v1` for explainability

No LLM calls are required to compute novelty.

## Read first (required)

- `AGENTS.md`
- `CLAUDE.md`
- `docs/pipeline.md` (Rank: novelty definition; keep topic-agnostic)
- Code:
  - `packages/pipeline/src/stages/digest.ts`
  - `packages/pipeline/src/stages/rank.ts`
  - `packages/pipeline/src/scoring/novelty.ts` (currently stub)

## Scope (allowed files)

- `packages/pipeline/src/stages/digest.ts`
- `packages/pipeline/src/stages/rank.ts`
- `packages/pipeline/src/scoring/novelty.ts`

If anything else seems required, **stop and ask**.

## Decisions (already decided)

- Novelty lookback defaults to **30 days**, but must be configurable later via UI/tier.
  - For now, implement an env var: `NOVELTY_LOOKBACK_DAYS` (default `30`).
- Novelty is computed via **Postgres pgvector similarity** (no tokens/LLM).

## Implementation steps (ordered)

1. Implement `packages/pipeline/src/scoring/novelty.ts`:
   - helper(s) to clamp similarity and compute `novelty01 = clamp01(1 - maxSimilarity01)`
2. In `digest.ts`, compute a novelty similarity for each candidate with a vector:
   - Use topic-scoped history within `[windowStart - lookbackDays, windowStart)`
   - For each candidate vector, find the nearest neighbor similarity (max similarity) in that history window:
     - `similarity = 1 - (history_vector <=> candidate_vector)`
   - If the candidate has no vector, novelty is `null` and should not break ranking.
3. Pass novelty into ranking inputs and incorporate into `rankCandidates()`:
   - Add a weight (small default, e.g. `wNovelty = 0.05`)
   - Keep scoring deterministic and stable.
4. Explainability:
   - If `triage_json` exists, add:
     - `system_features.novelty_v1 = { lookback_days, max_similarity, novelty01 }`

## Acceptance criteria

- [ ] Novelty is computed without any provider calls.
- [ ] Novelty is topic-scoped and uses the configured lookback days.
- [ ] `triage_json.system_features.novelty_v1` is present when triage exists.
- [ ] `pnpm -r typecheck` passes.

## Test plan (copy/paste)

```bash
pnpm -r typecheck

# Smoke (requires existing DB with embeddings):
pnpm dev:cli -- admin:run-now
pnpm dev:cli -- review
```

## Commit

- **Message**: `feat(pipeline): add novelty feature to ranking`
- **Files expected**:
  - `packages/pipeline/src/stages/digest.ts`
  - `packages/pipeline/src/stages/rank.ts`
  - `packages/pipeline/src/scoring/novelty.ts`

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
- docs/_session/tasks/task-015-novelty-scoring.md
- docs/pipeline.md

What I changed (1–3 bullets):
- ...

Files changed:
- ...

How to validate:
- pnpm -r typecheck
- <CLI smoke commands you ran>

What I’m unsure about / decisions I made:
- ...
```
