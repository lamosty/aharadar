# Task 013 — `feat(budgets): enforce credits exhaustion (warn + fallback_low)`

- **Owner**: Claude Code Opus 4.5 (implementer)
- **Reviewer**: GPT‑5.2 xtra high
- **Driver**: human (runs commands, merges)

## Goal

Implement the MVP “hard enforcement” behavior for credits budgets:

- budgets are tracked in **credits** using `provider_calls.cost_estimate_credits`
- warn when approaching exhaustion
- when exhausted: **fallback to `low`** and **skip paid provider calls** (LLM + embeddings + provider-backed connectors), while still attempting a heuristic digest from already-ingested canonical content

Keep it deterministic, topic-agnostic, and provider-agnostic.

## Read first (required)

- `AGENTS.md`
- `CLAUDE.md`
- `docs/budgets.md` (credits exhaustion policy)
- `docs/pipeline.md` (budget behavior + “always attempt some digest”)
- `docs/adr/0007-budget-units-credits.md`
- Code:
  - `packages/shared/src/config/runtime_env.ts` (MONTHLY_CREDITS, DAILY_THROTTLE_CREDITS, DEFAULT_TIER)
  - `packages/pipeline/src/scheduler/run.ts` (pipeline orchestration)
  - `packages/pipeline/src/stages/digest.ts` (triage calls are here)
  - `packages/pipeline/src/stages/llm_enrich.ts` (deep summary)
  - `packages/pipeline/src/stages/embed.ts` (embeddings)
  - `packages/pipeline/src/stages/ingest.ts` (paid connector fetch lives here)

## Scope (allowed files)

- `packages/pipeline/src/scheduler/run.ts`
- `packages/pipeline/src/stages/ingest.ts`
- `packages/pipeline/src/stages/embed.ts`
- `packages/pipeline/src/stages/digest.ts`
- `packages/pipeline/src/stages/llm_enrich.ts`
- (optional) one new helper module under `packages/pipeline/src/` (e.g. `budgets/credits.ts`)
- (optional) `packages/cli/src/commands/admin.ts` (only for a small debug/status command if needed)

If you think you need to change DB schema/migrations, **stop and ask**.

## Decisions (already decided)

- Credits accounting uses **only successful** provider calls:
  - sum `provider_calls.cost_estimate_credits` where `status = 'ok'`
  - note for future: we may choose to count some errors too (retries/timeouts) if needed.
- Daily throttle boundaries use **UTC for now** (no user accounts/timezones yet).
  - note for future: use per-user timezone (or `APP_TIMEZONE`) once accounts exist.
- When exhausted:
  - continue ingesting **non-paid connectors** (reddit/rss/hn/etc.) so the inbox still updates
  - skip paid provider calls (LLM + embeddings + provider-backed connectors like `signal`/`x_posts`)
  - still persist a digest using heuristic scoring (triage_json may be null); users can still open links.

## Contract (do not improvise)

From `docs/budgets.md` + `docs/pipeline.md`:

- credits are the unit
- warn as budget is approached
- when exhausted:
  - skip paid provider calls (signals + LLM; treat embeddings and provider-backed connectors as paid too)
  - continue scheduled runs but force tier=`low` (unless configured to stop; stop is optional and can be deferred)
  - still attempt to output some digest (triage-only/heuristic is acceptable)

## Implementation steps (ordered)

1. Add a “credits status” helper that can compute:
   - monthly used credits (sum of `provider_calls.cost_estimate_credits` where `status='ok'` in the current month; use UTC boundaries for MVP)
   - daily used credits if `DAILY_THROTTLE_CREDITS` is set (sum where `status='ok'` within current day; UTC boundaries for MVP)
   - remaining monthly/daily credits
   - a boolean: `paidCallsAllowed`
   - an effective tier override: if exhausted, force `low`
2. Integrate budget gating into pipeline execution:
   - Ingest:
     - continue fetching non-paid connectors as normal
     - skip provider-backed connectors when `paidCallsAllowed=false` (at minimum: `source.type in ("signal","x_posts")`)
   - Embed: if `paidCallsAllowed=false`, skip actual embedding calls but still allow hash-only backfills
   - Digest triage: if `paidCallsAllowed=false`, skip LLM triage (heuristic-only scoring; `triage_json` stays null)
   - Deep summary: if `paidCallsAllowed=false` or tier is `low`, skip
3. Warnings:
   - on each run, print a concise warning when crossing thresholds (e.g., >=80% or >=95% used)
   - do not spam: only warn once per run
4. Keep behavior deterministic:
   - use `windowEnd` as “now” for determining current day/month boundaries (MVP simplification)

## Acceptance criteria

- [ ] When credits are exhausted, the pipeline produces a digest without making paid calls (no new `provider_calls` for triage/deep_summary/embedding/signal/x_posts).
- [ ] When credits are exhausted, non-paid connectors can still ingest (pipeline still updates content_items).
- [ ] When credits are exhausted, tier is forced to `low`.
- [ ] When credits are near exhaustion, warnings are printed in CLI logs (or a debug command exposes status).
- [ ] `pnpm -r typecheck` passes.

## Test plan (copy/paste)

```bash
pnpm -r typecheck

# Smoke (set MONTHLY_CREDITS very low; set per-call credit envs non-zero; then run):
pnpm dev:cli -- admin:run-now

# Optional: inspect provider_calls table to confirm no new paid calls were made when exhausted.
pnpm dev:cli -- admin:signal-debug --kind all --limit 10
```

## Commit

- **Message**: `feat(budgets): enforce credits exhaustion (warn + fallback_low)`
- **Files expected**:
  - `packages/pipeline/src/scheduler/run.ts`
  - `packages/pipeline/src/stages/ingest.ts`
  - `packages/pipeline/src/stages/embed.ts`
  - `packages/pipeline/src/stages/digest.ts`
  - `packages/pipeline/src/stages/llm_enrich.ts`
  - (optional) `packages/pipeline/src/budgets/credits.ts`
  - (optional) `packages/cli/src/commands/admin.ts`

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
- docs/_session/tasks/task-013-budget-hard-enforcement.md
- docs/budgets.md
- docs/pipeline.md
- docs/adr/0007-budget-units-credits.md

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
