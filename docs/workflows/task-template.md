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

### Final step (required): print task report (and final recap for batch runs)

After committing, print this block **filled in**:

```text
TASK REPORT (copy/paste to driver chat)

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

#### Batch runs (important): final recap

If you execute **multiple tasks back-to-back** in one Opus session, also print a single **FINAL RECAP** block **once at the very end** (after the last task/commit), so the driver can copy/paste just once.

During the run, you may print only a short progress line after each task, e.g.:

```text
COMMITTED: <hash> — <task spec path> — <short summary>
```

Final recap format:

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
