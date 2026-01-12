# Task template (for Opus implementer)

Copy/paste this template into a new section in `docs/tasks/opus-worklist.md` (or a standalone `_session` doc) for each commit-sized task.

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

Commit instructions:

- Make exactly **one commit** per task spec (unless the spec explicitly asks for multiple).
- If you had to touch files outside **Scope**, stop and ask before committing.
- If you believe the task’s decisions are outdated/risky, raise it (see “Open questions / uncertainties”) and ask the driver before deviating.
- Subagents / skills:
  - If you spawn subagents, they may not reliably perform git commits.
  - The **main Opus loop** must always be the one to run `git add` / `git commit`.
