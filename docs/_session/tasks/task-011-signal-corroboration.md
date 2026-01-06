# Task 011 — `feat(pipeline): add URL-only signal corroboration boost`

- **Owner**: Claude Code Opus 4.5 (implementer)
- **Reviewer**: GPT‑5.2 xtra high
- **Driver**: human (runs commands, merges)

## Goal

Implement an **explainable, deterministic, URL-only** “signal corroboration” boost in ranking:

- when recent `signal` bundle items reference an external URL,
- candidates whose primary URL matches that URL get a small ranking boost.

No domain-specific heuristics; keep it generic and transparent.

## Read first (required)

- `AGENTS.md`
- `CLAUDE.md`
- `docs/pipeline.md` (Rank: “Signal corroboration (Proposed)”)
- `docs/connectors.md` (signal bundle metadata: `primary_url`, `extracted_urls`, `signal_results`)
- Code:
  - `packages/pipeline/src/stages/digest.ts` (candidate selection + heuristic scoring + triage + ranking)
  - `packages/pipeline/src/stages/rank.ts` (rankCandidates)
  - `packages/shared/src/url.ts` (or wherever `canonicalizeUrl` lives; use canonicalization + hashing)

## Scope (allowed files)

- `packages/pipeline/src/stages/digest.ts`
- `packages/pipeline/src/stages/rank.ts`
- (optional) one helper module under `packages/pipeline/src/scoring/` for corroboration logic

If anything else seems required, **stop and ask**.

## Implementation steps (ordered)

1. In `digest.ts`, load recent signal bundles for the topic/window:
   - `source_type = 'signal'`
   - exclude deleted/duplicates
   - prefer bundle semantics: `canonical_url is null` and/or `metadata_json->>'kind' = 'signal_bundle_v1'`
2. Extract a set of corroboration URLs from each bundle:
   - `metadata.primary_url` (string)
   - `metadata.extracted_urls` (string[])
   - `metadata.signal_results[].url` (string) if present
   - filter to **external URLs only**:
     - ignore X-like URLs (`x.com`, `twitter.com`, `t.co`) so “corroboration” boosts canonical external content, not X posts themselves
   - canonicalize URLs (use shared canonicalization) and hash them (`sha256Hex`) for stable matching
3. For each candidate (cluster or item), compute a `signal_corroboration_v1` feature:
   - determine the candidate primary URL using the existing “primary url” logic (canonical_url > metadata.primary_url > metadata.extracted_urls[0])
   - if the candidate primary URL is X-like (`x.com|twitter.com|t.co`), treat as **not eligible** for corroboration in MVP
   - canonicalize + hash and test membership in the signal URL set
   - output a numeric feature `signalCorroboration01` (0 or 1 for MVP)
4. Update `rankCandidates()` to incorporate this new feature with a small default weight (e.g. `wSignal = 0.05`):
   - keep weights configurable via params override
   - keep scoring deterministic
5. Make it explainable:
   - if `triage_json` exists, attach a nested `system_features.signal_corroboration_v1` object with:
     - `matched` (boolean)
     - `matched_url` (string | null)
     - `signal_url_sample` (string[]; small cap)

## Acceptance criteria

- [ ] Candidates whose primary URL is referenced by a recent signal bundle get a measurable score boost (deterministic).
- [ ] The boost is explainable via `triage_json.system_features.signal_corroboration_v1` on digest items.
- [ ] `pnpm -r typecheck` passes.

## Test plan (copy/paste)

```bash
pnpm -r typecheck

# Smoke (requires existing signal + canonical sources in DB):
pnpm dev:cli -- admin:run-now
pnpm dev:cli -- inbox --table
```

## Commit

- **Message**: `feat(pipeline): add URL-only signal corroboration boost`
- **Files expected**:
  - `packages/pipeline/src/stages/digest.ts`
  - `packages/pipeline/src/stages/rank.ts` (and optional helper)

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
- docs/_session/tasks/task-011-signal-corroboration.md
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

Then:
1) Tell me “LGTM” or “Changes required”
2) If changes required, give exact edits (files + what to change)
3) Suggest follow-up tasks (if any)
```
