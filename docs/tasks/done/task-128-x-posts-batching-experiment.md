# Task 128 — `feat(connectors,web): x_posts batching experiment + configurable output tokens`

- **Owner**: Claude Code Opus 4.5 (implementer)
- **Reviewer**: GPT‑5.2 xtra high
- **Driver**: human (runs commands, merges)

## Goal

Add an **opt-in batching mode** for the `x_posts` connector so multiple accounts can be queried in a **single Grok x_search call**, reducing tool-call cost. Expose batching controls in the X connector UI and add a safe way to scale **max output tokens** for batched calls.

This enables side-by-side experiments (e.g., one topic with batch size 1 vs another with manual groups of 2+) without code changes.

## Read first (required)

- `AGENTS.md`
- `docs/connectors.md` (x_posts config contract)
- `docs/adr/0010-x-posts-canonical-via-grok.md`
- Code:
  - `packages/connectors/src/x_posts/fetch.ts`
  - `packages/connectors/src/x_posts/config.ts`
  - `packages/connectors/src/x_shared/grok_x_search.ts`
  - `packages/web/src/components/SourceConfigForms/XPostsConfigForm.tsx`
  - `packages/web/src/components/SourceConfigForms/types.ts`
  - `packages/web/src/lib/source_catalog.ts`

## Scope (allowed files)

- `packages/connectors/src/x_posts/fetch.ts`
- `packages/connectors/src/x_posts/config.ts`
- `packages/connectors/src/x_shared/grok_x_search.ts`
- `packages/web/src/components/SourceConfigForms/XPostsConfigForm.tsx`
- `packages/web/src/components/SourceConfigForms/types.ts`
- `packages/web/src/messages/en.json`
- (Optional) `docs/connectors.md` (update x_posts config block)

If anything else seems required, stop and ask before changing.

## Decisions (Driver Q&A)

- **Batching mode**: manual groups only (no auto batching).
- **Limit scaling**: `limit = perAccountLimit * groupSize`, capped at **200** (documented in UI + docs).
- **Max output tokens**: per‑account override in source config, multiplied by group size, then capped by an env hard cap.

## Implementation steps (ordered)

1. **Extend x_posts config** (`packages/connectors/src/x_posts/config.ts`):
   - Add optional batching config (manual only):
     ```ts
     batching?: {
       mode: "off" | "manual";
       groups?: string[][]; // manual explicit account groups
     };
     maxOutputTokensPerAccount?: number; // optional override per account
     ```
   - Keep defaults backward‑compatible (`mode: "off"`).

2. **Update UI config form** (`XPostsConfigForm.tsx` + types + i18n):
   - Add a section “Batching (experimental)” with:
     - Toggle or select: Off / Manual
     - Manual: textarea or repeatable inputs; each line is a comma‑separated group of handles
   - Add optional “Max output tokens per account” advanced input (number).
   - Validate groups (non‑empty handles, trimmed, no `@`).
   - Show note: total per-call limit is capped at **200** results even when batching.
   - If batching groups are large, warn that results may be truncated by this cap.

3. **Implement batching logic in fetch** (`x_posts/fetch.ts`):
   - If `batching.mode === "manual"` and groups are provided, use those groups.
   - Otherwise keep current per-account queries.
   - For each group, build a single query:
     ```
     (from:a OR from:b OR from:c) -filter:replies -filter:retweets (kw1 OR kw2)
     ```
   - Pass `allowedXHandles` as the **group** array.
   - Scale `limit` for batched groups:
     - `perAccountLimit = config.maxResultsPerQuery`
     - `limit = min(perAccountLimit * groupSize, params.limits.maxItems, 200)`

4. **Allow max output tokens override** (`x_shared/grok_x_search.ts`):
   - Add `maxOutputTokens?: number` param.
   - If provided, use it (with a safety clamp via env hard cap).
   - Otherwise fall back to existing env behavior.
   - New env hard cap: `X_POSTS_MAX_OUTPUT_TOKENS_HARD_CAP` (fallback to current defaults).

5. **Compute per-call max tokens** (`x_posts/fetch.ts`):
   - If `maxOutputTokensPerAccount` is set:
     - `maxOutputTokens = min(maxOutputTokensPerAccount * groupSize, HARD_CAP_ENV)`
   - Pass `maxOutputTokens` to `grokXSearch`.

6. **Add experiment metadata** in provider calls:
   - Include `batch_mode`, `batch_size`, `batch_handles_count`, `max_output_tokens` in `providerCalls.meta` for easy comparison.

## Acceptance criteria

- [ ] Default behavior unchanged when batching is off.
- [ ] Manual batching uses explicit group definitions.
- [ ] Per-account max output tokens override is respected by Grok calls.
- [ ] Provider call meta includes batching fields for analysis.
- [ ] `pnpm -r typecheck` passes.

## Test plan (copy/paste)

```bash
pnpm -r typecheck
# manual smoke
pnpm dev:api
pnpm dev:web
# Create two x_posts sources: batch size 1 vs 2, compare provider_calls logs.
```

## Commit

- **Message**: `feat(connectors,web): add x_posts batching experiment`
- **Files expected**:
  - `packages/connectors/src/x_posts/fetch.ts`
  - `packages/connectors/src/x_posts/config.ts`
  - `packages/connectors/src/x_shared/grok_x_search.ts`
  - `packages/web/src/components/SourceConfigForms/XPostsConfigForm.tsx`
  - `packages/web/src/components/SourceConfigForms/types.ts`
  - `packages/web/src/messages/en.json`
  - (optional) `docs/connectors.md`
