# `_session/results` — Opus run outputs (local artifacts)

This directory is for **generated** task reports from the Opus implementer so the driver/reviewer can inspect results **without copy/pasting terminal output**.

These files are **not committed** (see `.gitignore`).

## Expected files

- `latest.md` — overwritten each time a task completes (single-task report)
- `final-recap.md` — overwritten at the end of a multi-task Opus run (batch recap)

## How Opus should use this

- After each task commit:
  - write/update `docs/_session/results/latest.md`
  - (optional) also write a per-task file if useful, e.g. `task-028-api-scaffold.md`
- If multiple tasks are run back-to-back:
  - write `docs/_session/results/final-recap.md` once at the end, listing all tasks and commits
