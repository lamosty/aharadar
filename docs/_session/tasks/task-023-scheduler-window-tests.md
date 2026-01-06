# Task 023 — `test(pipeline): cover scheduler window generation`

- **Owner**: Claude Code Opus 4.5 (implementer)
- **Reviewer**: GPT‑5.2 xtra high
- **Driver**: human (runs commands, merges)

## Goal

Add hermetic unit tests for scheduler window generation to lock UTC window semantics and avoid regressions:

- `parseSchedulerConfig`
- `generateDueWindows` for both:
  - `fixed_3x_daily`
  - `since_last_run`
- `getSchedulableTopics` (singleton user MVP behavior)

## Read first (required)

- `AGENTS.md`
- `CLAUDE.md`
- `docs/pipeline.md` (window semantics)
- Code:
  - `packages/pipeline/src/scheduler/cron.ts`

## Scope (allowed files)

- `packages/pipeline/src/scheduler/cron.ts`
- `packages/pipeline/src/scheduler/cron.test.ts` (new)

If anything else seems required, **stop and ask**.

## Decisions (already decided)

- All scheduler window boundaries use **UTC** for now.
- `fixed_3x_daily` windows are:
  - `[00:00,08:00)`, `[08:00,16:00)`, `[16:00,24:00)` (UTC)
- `since_last_run` window semantics:
  - `windowStart = last digest window_end` for (user, topic)
  - if no digest exists: `windowStart = now - 24h`
  - `windowEnd = now`
  - do not emit a window if duration < 1 minute

## Implementation steps (ordered)

1. Add tests for `parseSchedulerConfig`:
   - missing env var → `fixed_3x_daily`
   - `SCHEDULER_WINDOW_MODE=since_last_run` → `since_last_run`
   - unknown string → `fixed_3x_daily`
2. Add tests for `generateDueWindows` in `fixed_3x_daily` mode:
   - choose representative `now` timestamps and assert exact UTC boundaries
   - when `db.query(...)` finds an existing digest row, returns `[]`
   - when no existing digest, returns one window with `mode: "normal"`
3. Add tests for `generateDueWindows` in `since_last_run` mode:
   - with a last digest: start at `lastDigest.window_end`
   - without a last digest: start at `now - 24h`
   - if `(now - windowStart) < 60s`, returns `[]`
4. Add tests for `getSchedulableTopics`:
   - when `db.users.getFirstUser()` returns null, returns `[]`
   - otherwise, returns all topics for that user as `{ userId, topicId }`

## Acceptance criteria

- [ ] `pnpm test` passes.
- [ ] Tests run without `.env` and without network.
- [ ] UTC window semantics are locked by tests.
- [ ] `pnpm -r typecheck` passes.

## Test plan (copy/paste)

```bash
pnpm -r typecheck
pnpm test
```

## Commit

- **Message**: `test(pipeline): cover scheduler window generation`
- **Files expected**:
  - `packages/pipeline/src/scheduler/cron.ts` (optional tiny testability tweaks only)
  - `packages/pipeline/src/scheduler/cron.test.ts`

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
- docs/_session/tasks/task-023-scheduler-window-tests.md
- docs/pipeline.md

What I changed (1–3 bullets):
- ...

Files changed:
- ...

How to validate:
- pnpm -r typecheck
- pnpm test

What I’m unsure about / decisions I made:
- ...

Then:
1) Tell me “LGTM” or “Changes required”
2) If changes required, give exact edits (files + what to change)
3) Suggest follow-up tasks (if any)
```


