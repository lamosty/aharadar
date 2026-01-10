# Task 129 — `refactor(signal): remove signal connector + document deferral`

- **Owner**: Claude Code Opus 4.5 (implementer)
- **Reviewer**: GPT‑5.2 xtra high
- **Driver**: human (runs commands, merges)

## Goal

Remove the **signal** connector and related pipeline logic entirely. Keep **x_posts** as the only Grok/X integration. Add a doc describing why signals are deferred and how they could be reintroduced later.

## Read first (required)

- `AGENTS.md`
- `docs/connectors.md`
- `docs/adr/0010-x-posts-canonical-via-grok.md`
- Code:
  - `packages/connectors/src/signal/*`
  - `packages/connectors/src/registry.ts`
  - `packages/shared/src/types/connector.ts`
  - `packages/pipeline/src/stages/digest.ts`
  - `packages/pipeline/src/stages/dedupe.ts`
  - `packages/pipeline/src/stages/cluster.ts`
  - `packages/pipeline/src/budgets/credits.ts`
  - `packages/web/src/lib/source_catalog.ts`
  - `packages/web/src/components/SourceConfigForms/SignalConfigForm.tsx`

## Scope (allowed files)

- `packages/db/migrations/*.sql` (new migration to purge signal rows)
- `packages/connectors/src/signal/*` (delete)
- `packages/connectors/src/registry.ts`
- `packages/connectors/src/index.ts`
- `packages/shared/src/types/connector.ts`
- `packages/pipeline/src/stages/digest.ts`
- `packages/pipeline/src/stages/dedupe.ts`
- `packages/pipeline/src/stages/cluster.ts`
- `packages/pipeline/src/budgets/credits.ts`
- `packages/web/src/lib/source_catalog.ts`
- `packages/web/src/components/SourceConfigForms/SignalConfigForm.tsx`
- `packages/web/src/components/SourceConfigForms/SourceConfigForm.tsx`
- `packages/web/src/components/SourceConfigForms/types.ts`
- `packages/web/src/messages/en.json`
- `docs/connectors.md`
- `docs/signals.md` (new)

If anything else seems required, stop and ask before changing.

## Decisions (Driver Q&A)

- **Purge existing signal rows** in DB via migration (sources/items/provider_calls).
- Remove any **signal-related tests** if present.

## Implementation steps (ordered)

1. **Purge signal data (migration)**:
   - Create a migration that deletes:
     - `sources` where `type = 'signal'` (cascade should remove content_items, fetch_runs, content_item_sources).
     - `provider_calls` where `purpose` starts with `signal_` (e.g., `signal_search`, `signal_parse`).
     - Any remaining `content_items` with `source_type = 'signal'` (defensive).

2. **Remove signal connector implementation**:
   - Delete `packages/connectors/src/signal/*` and remove exports/registry entries.
   - Remove `signal` from `SourceType` union in `packages/shared/src/types/connector.ts`.

3. **Remove signal from UI**:
   - Remove from source catalog + picker.
   - Remove SignalConfigForm and any references.

4. **Remove signal pipeline logic**:
   - Delete signal corroboration code paths in `packages/pipeline/src/stages/digest.ts`.
   - Remove any signal exclusion checks in `dedupe.ts` / `cluster.ts`.
   - Update `PAID_CONNECTOR_TYPES` to only include `x_posts` (no `signal`).

5. **Docs**:
   - Add `docs/signals.md` explaining why signals are deferred, tradeoffs, and future re‑intro plan.
   - Update `docs/connectors.md` to remove signal config and link to the deferral doc.

## Acceptance criteria

- [ ] No `signal` source type in UI or types.
- [ ] No signal connector code remains.
- [ ] Pipeline no longer references signal bundles or corroboration.
- [ ] Docs clearly state signals are deferred.
- [ ] `pnpm -r typecheck` passes.

## Test plan (copy/paste)

```bash
pnpm -r typecheck
```

## Commit

- **Message**: `refactor(signal): remove signal connector`
- **Files expected**:
  - `packages/db/migrations/*.sql` (new)
  - `packages/connectors/src/signal/*` (deleted)
  - `packages/connectors/src/registry.ts`
  - `packages/connectors/src/index.ts`
  - `packages/shared/src/types/connector.ts`
  - `packages/pipeline/src/stages/digest.ts`
  - `packages/pipeline/src/stages/dedupe.ts`
  - `packages/pipeline/src/stages/cluster.ts`
  - `packages/pipeline/src/budgets/credits.ts`
  - `packages/web/src/lib/source_catalog.ts`
  - `packages/web/src/components/SourceConfigForms/*`
  - `packages/web/src/messages/en.json`
  - `docs/connectors.md`
  - `docs/signals.md`
