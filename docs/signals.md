# Signals — Deferred Feature

**Status**: Deferred (removed from MVP)

## What were signals?

The `signal` connector was designed as a **derived/amplifier** connector for search-based trend and alert detection. Unlike canonical content connectors (Reddit, HN, RSS, `x_posts`), signals:

- Did not produce first-class content items shown in feeds
- Stored "bundles" of search results for auditing and debugging
- Were intended to provide corroboration/boosting signals for ranking

## Why signals were deferred

1. **Redundancy with `x_posts`**: The `x_posts` connector provides canonical X/Twitter content via Grok. This addresses the primary use case (following accounts, monitoring keywords) more directly.

2. **Complexity vs. value**: Signal corroboration added ranking complexity without proven value. The feature was disabled by default (`ENABLE_SIGNAL_CORROBORATION=0`) and never activated in production.

3. **Bundle-only semantics were confusing**: Users expected to see X content in their feeds, not hidden bundles. The `x_posts` connector solved this by treating posts as first-class items.

4. **Cost without clear benefit**: Signals used the same Grok/xAI credits as `x_posts` but didn't surface content users could act on directly.

## What was removed

- `packages/connectors/src/signal/*` — connector implementation
- Signal source type from UI (source picker, config forms)
- Signal corroboration logic in digest/ranking
- Signal-specific CLI commands (`admin:signal-*`)
- Database rows: existing signal sources, items, and provider calls (via migration)

## Re-introducing signals in the future

If signals become valuable again, consider:

1. **Clear use case**: Define a concrete user journey that benefits from trend/alert detection separate from canonical content.

2. **Corroboration MVP**: If URL corroboration is the goal, design a simpler version:
   - External trend feeds (not Grok-based)
   - Pre-computed daily signal snapshots
   - Lightweight matching without full bundle storage

3. **Different abstraction**: Consider signals as a pipeline feature (scoring input) rather than a connector (storage abstraction).

4. **Implementation path**:
   - Restore `packages/connectors/src/signal/` from git history
   - Re-add `signal` to `SourceType` union
   - Re-add signal corroboration functions to `digest.ts`
   - Re-add UI components and CLI commands

## Historical references

- ADR 0003: Signal connector design (superseded by ADR 0010)
- ADR 0010: `x_posts` canonical via Grok
- Git history: Full signal implementation prior to this removal
