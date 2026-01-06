# AI collaboration workflow (User ↔ Opus implementer ↔ GPT-5.2 reviewer)

This repo is built with AI agents. This document defines a **repeatable flow** for using:

- **Claude Code Opus 4.5** as the _implementer_
- **GPT‑5.2 xtra high** as the _architect/reviewer_
- **You** as the _driver_ (runs commands, decides tradeoffs, merges commits)

This workflow is designed to maximize speed **without** losing correctness.

## Where things live

- **Source of truth contracts**: `docs/*` + `docs/adr/*`
- **Collaboration flow + templates**: `docs/workflows/*`
- **Current active work orders** (ephemeral but committed for continuity): `docs/_session/*`
  - Current worklist: `docs/_session/opus-worklist.md`

## Non‑negotiables (must hold for every change)

These are repo invariants (see `AGENTS.md` / `CLAUDE.md`):

- Topic‑agnostic (no domain-specific logic)
- Provider‑agnostic (no hardcoding providers/models; keep vendor interfaces)
- Budgets are in credits (monthly + optional daily throttle; exhaustion → warn + fallback to `low`)
- TypeScript strict (no implicit `any`)
- No secrets committed
- Commit-sized changes (one logical change per commit)

## Default cadence of work

For “core plumbing” refactors (e.g. pipeline ingest, connector semantics), prefer **one Opus instance at a time**.

Parallel Opus sessions are fine only when they touch **non-overlapping surfaces** (different packages/files). If you parallelize, use **git worktrees** or separate clones so sessions do not stomp each other.

## The standard loop (one task)

### 1) Write/confirm the task spec (before coding)

If the change affects contracts, write/update docs/ADRs **first** and commit them as a docs-only commit.

Use:

- `docs/workflows/task-template.md` (copy/paste)
- `docs/_session/opus-worklist.md` (queue tasks)

#### 1a) Driver Q&A gate (required when generating a batch of tasks)

When GPT‑5.2 xtra high generates or refreshes a batch of Opus task specs, it must run a short “Driver Q&A gate”:

- ask the driver the relevant decisions **before** Opus starts
- wait for answers
- update the task specs/docs to record the decisions (docs-only commit), then proceed

Checklist + recommended question block:

- `docs/workflows/opus-task-generator.md`

### 2) Opus implements (one commit-sized chunk)

Rules for Opus:

- Stay within the declared file scope.
- If a contract is unclear: **stop and ask** (don’t guess).
- Keep interfaces stable unless the spec/ADR explicitly changes them.

### 3) Opus runs checks + smoke test

Minimum:

```bash
pnpm -r typecheck
```

Plus a task-specific CLI smoke test (e.g., `pnpm dev:cli -- admin:run-now ...`).

### 4) Opus prints a task report (required) + final recap for batch runs

After each commit, Opus must print a copy/paste-ready **task report** (no special “review prompt” preamble needed):

```text
TASK REPORT (copy/paste to driver chat)

Repo: /Users/lamosty/projects/aharadar
Branch: <branch-name>
Commit(s): <commit-hash(es)>

Task spec followed:
- <path to task spec>
- <ADR paths if relevant>

What I changed (1–3 bullets):
- ...

Files changed:
- <list>

How to validate:
- pnpm -r typecheck
- <any CLI smoke commands>

Open questions / uncertainties:
- ...
```

If Opus executes **multiple tasks back-to-back** in one run, Opus must also print a single **FINAL RECAP** block once at the end, so the driver can copy/paste just once:

```text
FINAL RECAP (copy/paste once)

Tasks completed (in order):
1) <task spec path> — <commit> — <1-line summary>
2) ...

Files changed (union):
- ...

How to validate (full):
- pnpm -r typecheck
- pnpm test
- pnpm test:integration (if applicable)
- <any required smoke commands>

Open questions / uncertainties (all tasks):
- ...
```

### 5) GPT‑5.2 reviews → Opus applies fixes

If changes are required, Opus should apply them in a follow-up commit (or amend if you prefer).

## “We don’t have tests yet” (important)

Until tests exist, compensate by:

- keeping tasks small
- running typecheck every time
- using CLI smoke tests

Add tests early once core plumbing stabilizes (see worklist).
