# Task template (for Opus implementer)

---

## Task: `feat(web): abtest admin UI`

- **Owner**: Claude Code Opus 4.5 (implementer)
- **Reviewer**: GPT‑5.2 xtra high (architect/reviewer)
- **Driver**: human (runs commands, merges)

### Goal

Add admin UI for AB tests: list runs, create a run (variants + window), and view results with side‑by‑side variant output per cluster.

### Read first (contracts + code)

- `AGENTS.md`
- `CLAUDE.md`
- `docs/abtests.md`
- `packages/web/src/app/app/admin/page.tsx`
- `packages/web/src/app/app/admin/run/page.tsx`
- `packages/web/src/lib/api.ts`
- `packages/web/src/lib/hooks.ts`
- `packages/web/src/components/Feed/*` (UI patterns)

### Scope (allowed files)

- `packages/web/src/app/app/admin/page.tsx`
- `packages/web/src/components/AppShell/nav-model.ts`
- `packages/web/src/app/app/admin/abtests/*` (new pages + CSS)
- `packages/web/src/lib/api.ts`
- `packages/web/src/lib/hooks.ts`
- `packages/web/src/messages/en.json`
- `packages/web/src/components/*` (only if new shared components needed)

If anything else seems required, stop and ask before changing.

### Decisions (if any)

- Results view should show **one row per cluster** with **variant columns** (aha score + reason + flags).
- AB tests are **admin‑only** and **opt‑in**; if API returns disabled/404, show a clear message.
- Default variants in the form:
  - gpt‑5.1 (reasoning=low)
  - gpt‑5.1 (reasoning=none)
  - gpt‑5‑mini (reasoning=none)
- Default candidate count can be 120 (editable in the form); backend still enforces its own caps.

### Implementation steps (ordered)

1. Add API client types + functions in `packages/web/src/lib/api.ts`:
   - list runs, create run, get run detail.
2. Add hooks in `packages/web/src/lib/hooks.ts` for the above.
3. Add admin nav card + sidebar entry for AB tests.
4. Create pages:
   - `/app/admin/abtests` (list + link to create)
   - `/app/admin/abtests/new` (form for window, topic, candidate count, variants)
   - `/app/admin/abtests/[id]` (detail view with item rows + variant columns)
5. Detail view UX:
   - Show representative title, source, published date, and link.
   - For each variant: aha score, reason, is_relevant, is_novel, should_deep_summarize, categories.
   - Provide a “copy JSON” affordance per variant (small button or disclosure).
6. Respect existing design system: reuse styling patterns from admin/run and feed items.

### Acceptance criteria

- [ ] Admin can create an AB test and see job ID/run status.
- [ ] List page shows past runs.
- [ ] Detail page shows per‑item, per‑variant outputs side‑by‑side.
- [ ] Disabled feature shows a clear message (e.g., “AB tests are disabled”).

### Test plan (copy/paste commands)

```bash
pnpm -r typecheck
# Manual: pnpm dev:web + verify /app/admin/abtests flows
```

### Commit

- **Message**: `feat(web): add abtest admin UI`
- **Files expected**:
  - `packages/web/src/app/app/admin/page.tsx`
  - `packages/web/src/components/AppShell/nav-model.ts`
  - `packages/web/src/app/app/admin/abtests/*`
  - `packages/web/src/lib/api.ts`
  - `packages/web/src/lib/hooks.ts`
  - `packages/web/src/messages/en.json`

Commit instructions:

- Make exactly **one commit** per task spec (unless the spec explicitly asks for multiple).
- If you had to touch files outside **Scope**, stop and ask before committing.
- If you believe the task’s decisions are outdated/risky, raise it (see “Open questions / uncertainties”) and ask the driver before deviating.
- Subagents / skills:
  - If you spawn subagents, they may not reliably perform git commits.
  - The **main Opus loop** must always be the one to run `git add` / `git commit` and write the report files.

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
Commit message: <type(scope)>: <message>
Subagents used (if any): <none | list skill/subagent names>

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
