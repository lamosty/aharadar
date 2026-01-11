# Task 112 — `feat(x_posts): per-source prompt profile (light vs heavy)`

- **Owner**: Claude Code Opus 4.5 (implementer)
- **Reviewer**: GPT‑5.2 xtra high
- **Driver**: human (runs commands, merges)

## Goal

Add a **per-source** (therefore per-user + per-topic) configuration option for `x_posts` that controls Grok prompt “detail level”:

- `promptProfile: "light" | "heavy"`

This lets some topics/sources spend more tokens to capture more post text / details, while keeping the default inexpensive.

## Depends on

- Task 110 (`docs/tasks/task-110-x-posts-published-at-timestamp.md`) merged (it defines the canonical output schema + token-safe prompt).

## Read first (required)

- `AGENTS.md`
- `docs/connectors.md` (`x_posts` connector contract)
- `docs/tasks/task-110-x-posts-published-at-timestamp.md` (prompt + schema)
- Code:
  - `packages/connectors/src/x_posts/config.ts`
  - `packages/connectors/src/x_posts/fetch.ts`
  - `packages/connectors/src/x_shared/grok_x_search.ts`
  - Web UI:
    - `packages/web/src/components/SourceConfigForms/XPostsConfigForm.tsx`
    - `packages/web/src/components/SourceConfigForms/types.ts`

## Scope (allowed files)

- `packages/connectors/src/x_posts/config.ts`
- `packages/connectors/src/x_posts/fetch.ts`
- `packages/connectors/src/x_shared/grok_x_search.ts` (only if needed to support per-call prompt sizing)
- `packages/web/src/components/SourceConfigForms/XPostsConfigForm.tsx`
- `packages/web/src/components/SourceConfigForms/types.ts`
- (optional) `docs/connectors.md` (document the new config field)

If anything else seems required, **stop and ask**.

## Decisions (already decided)

- We want a **per-source** setting (not global). In this repo, `sources` are already topic-scoped, so `sources.config_json` satisfies “per topic per user”.
- Default should be cost-friendly.

## Proposed config shape

In the `x_posts` source config JSON:

```json
{
  "promptProfile": "light"
}
```

Semantics:

- **light (default)**:
  - keep `maxTextChars` small (e.g. 480–600)
  - omit optional fields unless tool provides them (per Task 110 prompt)
- **heavy**:
  - allow longer `text` capture (e.g. `maxTextChars` 1500–2500, clamped)
  - keep schema identical (only change truncation limits), to avoid downstream complexity

Guardrails:

- Clamp `maxTextChars` to a safe range (e.g. min 200, max 4000).
- Recommend users reduce `maxResultsPerQuery` when using `heavy` (UI hint only; do not silently override).

## Implementation steps (ordered)

1. **Connector config + parsing**
   - Extend `XPostsSourceConfig` (`packages/connectors/src/x_posts/config.ts`) with:
     - `promptProfile?: "light" | "heavy"`
   - Update `asConfig()` in `packages/connectors/src/x_posts/fetch.ts` to parse it with default `"light"`.
2. **Pass prompt sizing through to Grok provider**
   - Modify `grokXSearch()` to accept an optional `maxTextChars` (or `promptProfile`) parameter.
   - In `x_posts/fetch.ts`, set `maxTextChars` based on `promptProfile` and pass it to `grokXSearch`.
   - Ensure other callers (signal) keep their current behavior (defaults).
3. **Web UI**
   - Extend `XPostsConfig` type in `packages/web/src/components/SourceConfigForms/types.ts` with `promptProfile`.
   - Add a selector in `XPostsConfigForm` under “Options”:
     - “Prompt detail: Light (cheaper) / Heavy (more detail)”
     - Show copy warning about token cost and recommending reducing max results when heavy.
   - Ensure defaults set `promptProfile: "light"` in `getDefaultConfig()` if needed.
4. **Docs**
   - (Optional but preferred) update `docs/connectors.md` x_posts config section to mention `promptProfile`.
5. **Tests**
   - Add or extend a unit test covering `asConfig()` parsing (default + heavy).
   - If `grokXSearch` signature changes, ensure TypeScript catches all call sites.

## Acceptance criteria

- [ ] `x_posts` sources can be configured with `promptProfile: "heavy"` to capture longer post text (within clamp).
- [ ] Default remains cost-friendly (light).
- [ ] Web UI exposes the setting.
- [ ] `pnpm -r typecheck` passes.

## Test plan (copy/paste)

```bash
pnpm -r typecheck
pnpm test
pnpm -r build
```

## Commit

- **Message**: `feat(x_posts): add per-source promptProfile (light/heavy)`
- **Files expected**:
  - `packages/connectors/src/x_posts/config.ts`
  - `packages/connectors/src/x_posts/fetch.ts`
  - `packages/connectors/src/x_shared/grok_x_search.ts` (if needed)
  - `packages/web/src/components/SourceConfigForms/XPostsConfigForm.tsx`
  - `packages/web/src/components/SourceConfigForms/types.ts`
  - (optional) `docs/connectors.md`

## Final step (required): write task report files (no copy/paste)

Follow `docs/workflows/task-template.md`.
