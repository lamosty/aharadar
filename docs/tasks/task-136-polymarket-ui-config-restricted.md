# Task 136: Polymarket UI — config fields + restricted badge

- **Owner**: Claude Code Opus 4.5 (implementer)
- **Reviewer**: GPT‑5.2 xtra high (architect/reviewer)
- **Driver**: human

## Goal

Expose the new Polymarket config fields in the source config form and display a **Restricted** badge in the feed/digest UI when `metadata.is_restricted` is true.

## Read first (contracts + code)

- `AGENTS.md`
- `docs/connectors.md` (after Task 134)
- `packages/web/src/components/SourceConfigForms/PolymarketConfigForm.tsx`
- `packages/web/src/components/SourceConfigForms/types.ts`
- `packages/web/src/components/SourceConfigForms/SourceConfigForm.tsx` (defaults)
- Feed UI:
  - `packages/web/src/components/Feed/FeedItem.tsx`
  - `packages/web/src/components/Feed/FeedItem.module.css`
- Digest detail UI:
  - `packages/web/src/components/DigestDetail/DigestDetailReader.tsx`
  - `packages/web/src/components/DigestDetail/DigestDetailCondensed.tsx`
  - `packages/web/src/components/DigestDetail/DigestDetailTimeline.tsx`

## Scope (allowed files)

- `packages/web/src/components/SourceConfigForms/PolymarketConfigForm.tsx`
- `packages/web/src/components/SourceConfigForms/types.ts`
- `packages/web/src/components/SourceConfigForms/SourceConfigForm.tsx`
- `packages/web/src/components/Feed/FeedItem.tsx`
- `packages/web/src/components/Feed/FeedItem.module.css`
- `packages/web/src/components/DigestDetail/DigestDetailReader.tsx`
- `packages/web/src/components/DigestDetail/DigestDetailCondensed.tsx`
- `packages/web/src/components/DigestDetail/DigestDetailTimeline.tsx`

If anything else seems required, stop and ask before changing.

## Decisions (already decided)

- `is_restricted` should be shown in UI (badge/label).
- Config should default to **include restricted**.

## Implementation steps (ordered)

1) **Config types**

- Update `PolymarketConfig` to include new fields:
  - `min_volume_24h?`
  - `include_restricted?`
  - `include_new_markets?`
  - `include_spike_markets?`
  - `spike_probability_change_threshold?`
  - `spike_volume_change_threshold?`
  - `spike_min_volume_24h?`
  - `spike_min_liquidity?`

2) **Default config values** (`SourceConfigForm.tsx`)

- Add sensible defaults for daily digests (low-noise), e.g.:
  - `min_volume = 10000`, `min_liquidity = 5000`, `min_volume_24h = 2000`
  - `include_new_markets = true`, `include_spike_markets = true`, `include_restricted = true`
  - `spike_probability_change_threshold = 10`, `spike_volume_change_threshold = 100`
  - `spike_min_volume_24h = 10000`, `spike_min_liquidity = 5000`

3) **Polymarket config form UI**

- Add form fields + tooltips for all new config values.
- Group fields into sections:
  - Baseline filters
  - Inclusion toggles (new/spikes/restricted)
  - Spike thresholds
- Make sure the UI stays compact and explain each field in a short tooltip.

4) **Restricted badge in feed**

- In `FeedItem.tsx`, read `metadata.is_restricted`.
- If true, render a small "Restricted" pill near the source badge or meta line.
- Add minimal styling in `FeedItem.module.css` (neutral color, not alarming).

5) **Restricted badge in digest detail**

- Add the same badge in each digest detail layout (Reader/Condensed/Timeline) near the source metadata line.

## Acceptance criteria

- Polymarket source form exposes all new config fields with clear hints.
- Default config is set to a reasonable daily preset.
- Restricted markets display a visible "Restricted" badge in feed + digest detail views.

## Test plan (copy/paste commands)

```bash
pnpm -r typecheck
```

## Commit

- **Message**: `feat(web): add polymarket config fields and restricted badge`
- **Files expected**:
  - `packages/web/src/components/SourceConfigForms/PolymarketConfigForm.tsx`
  - `packages/web/src/components/SourceConfigForms/types.ts`
  - `packages/web/src/components/SourceConfigForms/SourceConfigForm.tsx`
  - `packages/web/src/components/Feed/FeedItem.tsx`
  - `packages/web/src/components/Feed/FeedItem.module.css`
  - `packages/web/src/components/DigestDetail/DigestDetailReader.tsx`
  - `packages/web/src/components/DigestDetail/DigestDetailCondensed.tsx`
  - `packages/web/src/components/DigestDetail/DigestDetailTimeline.tsx`

