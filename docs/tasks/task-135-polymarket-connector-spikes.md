# Task 135: Polymarket connector — daily interesting + spikes (Gamma only)

- **Owner**: Claude Code Opus 4.5 (implementer)
- **Reviewer**: GPT‑5.2 xtra high (architect/reviewer)
- **Driver**: human

## Goal

Update the existing Polymarket connector to emit **new interesting markets** and **spike markets** for a daily digest, using **Gamma only** and **unauthenticated** access. Spikes must surface even for older markets by bumping `published_at` at spike time.

## Read first (contracts + code)

- `AGENTS.md`
- `docs/connectors.md` (after Task 134)
- `docs/pipeline.md` (candidate selection uses `published_at`)
- Existing connector:
  - `packages/connectors/src/polymarket/config.ts`
  - `packages/connectors/src/polymarket/fetch.ts`
  - `packages/connectors/src/polymarket/normalize.ts`

## Scope (allowed files)

- `packages/connectors/src/polymarket/config.ts`
- `packages/connectors/src/polymarket/fetch.ts`
- `packages/connectors/src/polymarket/normalize.ts`

If anything else seems required, stop and ask before changing.

## Decisions (already decided)

- Canonical connector; ingest **markets** as items.
- Gamma API only; **no auth**.
- Include `restricted` markets but label via metadata.
- Emit items if **new** OR **spike**, and **baseline filters** pass.
- For spikes, set `published_at` to spike observation time (windowEnd/now).
- Backward-compat: accept `probability_change_threshold` as alias.

## Implementation steps (ordered)

1) **Config parsing** (`config.ts`)

- Extend `PolymarketSourceConfig` to include:
  - `min_volume_24h?: number`
  - `include_restricted?: boolean`
  - `include_new_markets?: boolean`
  - `include_spike_markets?: boolean`
  - `spike_probability_change_threshold?: number` (pp)
  - `spike_volume_change_threshold?: number` (% change)
  - `spike_min_volume_24h?: number`
  - `spike_min_liquidity?: number`
- Keep existing fields (`min_volume`, `min_liquidity`, `probability_change_threshold`, etc.).
- Backward compat:
  - `probability_change_threshold` should map to `spike_probability_change_threshold` if the new field is absent.
- Clamp sensible bounds (>=0; max_markets_per_fetch 1–200).

2) **Cursor shape + helpers** (`fetch.ts`)

- Extend cursor parsing to include `last_volume_24h` (map of condition_id → USD).
- Add helpers to:
  - parse `volume24hr` (USD)
  - compute probability change (pp)
  - compute volume change (% and absolute)

3) **Fetch + selection logic** (`fetch.ts`)

- Fetch Gamma `/markets` (still `active=true`; honor `include_resolved`).
- Baseline filters (apply to all):
  - `min_volume`, `min_liquidity`, `min_volume_24h`
  - If `include_restricted` is false and `market.restricted === true`, skip
- Determine **new**:
  - `isNew = !seen_condition_ids.has(conditionId) AND createdAt within window (>= windowStart)`
- Determine **spike** (only if include_spike_markets):
  - Require baseline `spike_min_volume_24h` / `spike_min_liquidity` if set
  - Probability spike: `abs(probChangePP) >= spike_probability_change_threshold`
  - Volume spike: `abs(volume24hChangePct) >= spike_volume_change_threshold`
- Emit if `isNew || isSpike` AND baseline filters pass.
- Prioritize spikes then new markets; cap at `max_markets_per_fetch`:
  - Sort spikes by max(change magnitude) desc
  - Sort new by `createdAt` desc
- Update cursor:
  - Always store latest `last_prices` and `last_volume_24h`
  - Keep last 500 ids / price / volume entries
  - `last_fetch_at = now`

4) **Normalize** (`normalize.ts`)

- Accept the derived candidate object (wrap raw market + computed fields).
- Set `published_at`:
  - new market → `market.createdAt`
  - spike market → `observedAt` (use windowEnd or fetch time)
- Metadata additions:
  - `is_new`, `is_spike`, `spike_reason`
  - `probability_change_pp`, `volume_24h_change_pct`, `volume_24h_change_abs`
  - `market_created_at`, `market_updated_at`
  - `is_restricted`
- Keep canonical URL logic (event slug when present).
- Title/body:
  - If spike: include brief spike context (pp or volume %)
  - Else: current probability summary is fine

5) **Error handling**

- Keep existing retry/backoff.
- If API schema missing expected fields, fail with a clear error message (no silent nulls).

## Acceptance criteria

- Connector emits **new** markets (created within window) and **spike** markets only.
- Spikes **re-enter** daily window by bumping `published_at` at spike time.
- Cursor stores previous prices and 24h volume for change detection.
- `metadata.is_restricted` exists when market is restricted.
- No auth required; Gamma only.

## Test plan (copy/paste commands)

```bash
pnpm -r typecheck
```

## Commit

- **Message**: `feat(connectors): add polymarket spike + new market detection`
- **Files expected**:
  - `packages/connectors/src/polymarket/config.ts`
  - `packages/connectors/src/polymarket/fetch.ts`
  - `packages/connectors/src/polymarket/normalize.ts`

