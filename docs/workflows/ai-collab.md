# AI collaboration workflow (User ↔ Opus implementer ↔ GPT-5.2 reviewer)

This repo is built with AI agents. This document defines a **repeatable flow** for using:

- **Claude Code Opus 4.5** as the *implementer*
- **GPT‑5.2 xtra high** as the *architect/reviewer*
- **You** as the *driver* (runs commands, decides tradeoffs, merges commits)

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

### 4) Opus prints a GPT‑5.2 review prompt (required)

After the commit, Opus must print a copy/paste-ready prompt for GPT‑5.2 xtra high:

```text
REVIEW PROMPT (paste into GPT‑5.2 xtra high)

You are GPT‑5.2 xtra high acting as a senior reviewer/architect in this repo.
Please review my just-finished change for correctness, spec compliance, and unintended side effects.

Repo: /Users/lamosty/projects/aharadar
Branch: <branch-name>
Commit(s): <commit-hash(es)>

Task spec followed:
- <path to spec/ADR> (ex: docs/_session/opus-implementation-x_posts-and-cadence.md)
- <ADR paths if relevant>

What I changed (1–3 bullets):
- ...

Files changed:
- <list>

How to validate (commands I ran or you should run):
- pnpm -r typecheck
- <any CLI smoke commands>

Please check:
- Contracts: docs/* + ADRs adhered to (no guessing)
- Provider-agnosticism preserved
- Topic-agnostic invariants preserved
- Budgets/cadence semantics correct
- Idempotency preserved (no duplicate creation on reruns)
- No silent backward-compat hacks
- Typescript strict, no implicit any
- No surprising behavior changes outside the intended scope

What I’m unsure about / decisions I made:
- ...

Then:
1) Tell me “LGTM” or “Changes required”
2) If changes required, give exact edits (files + what to change)
3) Suggest follow-up tasks (if any)
```

### 5) GPT‑5.2 reviews → Opus applies fixes

If changes are required, Opus should apply them in a follow-up commit (or amend if you prefer).

## “We don’t have tests yet” (important)

Until tests exist, compensate by:
- keeping tasks small
- running typecheck every time
- using CLI smoke tests

Add tests early once core plumbing stabilizes (see worklist).


