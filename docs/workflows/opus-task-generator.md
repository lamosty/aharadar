# Opus task generator — Driver Q&A gate (required)

This repo uses a three-role workflow:

- **Driver (human)**: runs commands, chooses tradeoffs
- **Task generator (GPT‑5.2 xtra high)**: writes/updates Opus task specs under `docs/tasks/`
  - **Use git to commit** after updating task specs/docs (one docs-only commit before Opus runs)
  - **Use subagents** to save context (spawn Task agents for exploration/implementation)
- **Implementer (Claude Code Opus 4.5)**: executes one task spec per commit

This document defines a required “Driver Q&A gate” step for the task generator so we don’t go down the wrong path.

## When to use this

Use this whenever GPT‑5.2 xtra high:

- generates a new batch of Opus tasks, or
- refreshes/edits an existing batch of tasks, or
- is about to enqueue Opus work that affects cross-cutting contracts (signal semantics, budgets, scheduling, migrations).

## The rule (required)

After generating the task list/specs, the task generator must:

1. **Ask the driver the questions below** (only those relevant; mark others as “N/A for this batch”).
2. **Wait for answers**.
3. **Update the task specs/docs** to record the decisions (usually in each task’s `Decisions` section) **before** Opus starts implementation.
4. Commit the docs-only changes (so the decisions are preserved).

## Driver Q&A checklist (ask these)

### Signal vs canonical content

- Should `signal` be **bundle-only** (amplifier/debug) or should it also emit **per-post** user-facing items?
- If implementing “signal corroboration”, should corroboration consider:
  - **external URLs only** (ignore `x.com` / `twitter.com` / `t.co`) or
  - include X-like URLs too?

### Migration / backfill stance (early-phase velocity rule)

- For legacy/stored data shape changes, is **reset + re-ingest** acceptable for local/dev?
- If a backfill tool is desired later:
  - what is the target canonical type (e.g. convert legacy `signal` artifacts into `x_posts`)?
  - is backfill expected to be “best-effort” or strict?

### Cadence UX / admin ergonomics

- Should cadence helpers target:
  - single source (`--source-id`) only, or
  - also bulk flows (`--topic`, `--source-type`, etc.)?

### Cluster representative policy (UX)

- When choosing a “representative” item for a cluster, which heuristic should win (MVP default should be deterministic)?
  - prefer titled items (`title is not null`) vs
  - prefer non-`x_posts` vs
  - some other rule?

### Budgets / credits enforcement

- When credits are exhausted, should the system:
  - keep ingesting **non-paid** sources + produce a **heuristic** digest, or
  - stop the pipeline entirely, or
  - run ingest only but skip digest/LLM?
- Credits accounting:
  - sum only `provider_calls.status='ok'` (default) or include errors too?
- Daily throttle boundary:
  - use UTC (default until accounts exist) or `APP_TIMEZONE` now?

### Scheduler / windows / queue

- Queue choice:
  - commit to Redis + BullMQ now (and accept ADR 0004), or defer?
- Window semantics:
  - fixed windows (e.g. 3× daily) vs “since last run”?
- Should window mode be configurable (env/config), and what is the default?

## Output format (recommended)

When asking, paste a block like:

```text
DRIVER Q&A GATE (answer before Opus starts)

Signal:
- ...

Migration:
- ...

Cadence UX:
- ...

Budgets:
- ...

Scheduler/windows:
- ...
```

Then, after answers arrive, update the task specs and explicitly mark decisions as “already decided”.
