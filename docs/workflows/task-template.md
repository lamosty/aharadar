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

### Final step (required): print GPT‑5.2 review prompt

After committing, print this block **filled in**:

```text
REVIEW PROMPT (paste into GPT‑5.2 xtra high)

You are GPT‑5.2 xtra high acting as a senior reviewer/architect in this repo.
Please review my just-finished change for correctness, spec compliance, and unintended side effects.

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

What I’m unsure about / decisions I made:
- ...
```


