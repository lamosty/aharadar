# Task 026 — `test(hn): cover HN normalization edge cases`

- **Owner**: Claude Code Opus 4.5 (implementer)
- **Reviewer**: GPT‑5.2 xtra high
- **Driver**: human (runs commands, merges)

## Goal

Expand HN normalization test coverage with additional edge cases so future refactors are safe:

- missing `id` / missing `time`
- non-`story` types (job/poll/etc.) should normalize without throwing
- HTML stripping robustness (script/style blocks removed, entities decoded)

No network calls in tests.

## Read first (required)

- `AGENTS.md`
- `CLAUDE.md`
- `docs/connectors.md` (HN connector semantics)
- Code:
  - `packages/connectors/src/hn/normalize.ts`
  - `packages/connectors/src/hn/normalize.test.ts` (existing)

## Scope (allowed files)

- `packages/connectors/src/hn/normalize.test.ts` (extend)
- (optional) `packages/connectors/src/hn/normalize.ts` (only if tests reveal a bug)

If anything else seems required, **stop and ask**.

## Implementation steps (ordered)

1. Add a raw fixture with missing `id` and assert:
   - `externalId === null`
   - `canonicalUrl === null`
   - does not throw
2. Add fixtures for non-story types (`job`, `poll`) and assert:
   - `metadata.type` is preserved
   - normalization succeeds
3. Add a fixture where `text` includes:
   - `<script>...</script>` and `<style>...</style>`
   - HTML entities (`&amp;`, `&#x27;`, etc.)
   - block tags (`<p>`, `<br>`)
   Assert `bodyText` is clean and deterministic.

## Acceptance criteria

- [ ] `pnpm test` passes.
- [ ] Tests run without `.env` and without network.
- [ ] Edge cases above are covered.
- [ ] `pnpm -r typecheck` passes.

## Test plan (copy/paste)

```bash
pnpm -r typecheck
pnpm test
```

## Commit

- **Message**: `test(hn): cover HN normalization edge cases`
- **Files expected**:
  - `packages/connectors/src/hn/normalize.test.ts`
  - (optional) `packages/connectors/src/hn/normalize.ts`

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
- docs/_session/tasks/task-026-hn-edge-case-tests.md
- docs/connectors.md

What I changed (1–3 bullets):
- ...

Files changed:
- ...

How to validate:
- pnpm -r typecheck
- pnpm test
```


