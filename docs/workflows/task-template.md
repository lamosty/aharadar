# Task template (for Opus implementer)

Copy/paste this template into a new section in `docs/_session/opus-worklist.md` (or a standalone `_session` doc) for each commit-sized task.

---

## Task: `<type(scope)>: <message>`

- **Owner**: Claude Code Opus 4.5 (implementer)
- **Reviewer**: GPT‑5.2 xtra high (architect/reviewer)
- **Driver**: human (runs commands, merges)

### Goal

<1–2 sentences>

### Read first (contracts + code)

- `AGENTS.md`
- `CLAUDE.md`
- <docs/ files>
- <packages/... files>

### Scope (allowed files)

- <file paths Opus may edit>

If anything else seems required, stop and ask before changing.

### Decisions (if any)

- <explicit choices; if unclear STOP and ask>

> If you are generating a **batch** of Opus tasks, run the Driver Q&A gate and record answers before handing tasks to Opus:
>
> - `docs/workflows/opus-task-generator.md`

### Implementation steps (ordered)

1. ...
2. ...
3. ...

### Acceptance criteria

- [ ] ...
- [ ] ...

### Test plan (copy/paste commands)

```bash
pnpm -r typecheck
<any CLI smoke test>
```

### Commit

- **Message**: `<type(scope)>: <message>`
- **Files expected**: <list>

### Final step (required): write task report files (no copy/paste)

After committing, write a short task report to:

- `docs/_session/results/latest.md` (overwrite each task)

If you execute multiple tasks back-to-back, also write a single end-of-run recap to:

- `docs/_session/results/final-recap.md` (overwrite once at the end)

Then print only the file path(s) you wrote (so the driver can open them), e.g.:

```text
WROTE REPORT: docs/_session/results/latest.md
WROTE FINAL RECAP: docs/_session/results/final-recap.md
```

`latest.md` format:

```text
TASK REPORT

Repo: /Users/lamosty/projects/aharadar
Branch: <branch-name>
Commit(s): <commit-hash(es)>

Task spec followed:
- <path to this task spec>
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

`final-recap.md` format (batch runs only):

```text
FINAL RECAP

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
