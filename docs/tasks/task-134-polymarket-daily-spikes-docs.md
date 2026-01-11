# Task 134: Polymarket daily "interesting + spikes" contract (docs)

## Priority: High

## Goal

Update the Polymarket connector contract to support a daily digest focused on (a) new interesting markets and (b) large price/volume spikes, while keeping the connector **canonical** (not signal), **Gamma-only**, and **unauthenticated**.

## Background

We already have a working Polymarket connector. The app now needs daily discovery of interesting markets and spike alerts with **low noise**. This requires explicit contract updates for config fields, cursor state, spike semantics, and UI labeling of restricted markets.

## Read first (contracts + code)

- `AGENTS.md`
- `docs/connectors.md`
- `docs/pipeline.md` (candidate selection uses `published_at`)
- `docs/signals.md` (signals are deferred; Polymarket is canonical)
- Existing connector: `packages/connectors/src/polymarket/*`

## Scope (allowed files)

- `docs/connectors.md`
- `docs/tasks/README.md` (append task entries)

If anything else seems required, stop and ask before changing.

## Decisions (already decided)

- Polymarket is **canonical** content, not `signal`.
- Ingest **markets** (not events) as items; event slug may be used for URL if present.
- **Gamma-only**, no auth, no CLOB.
- Include `restricted` markets **but label them in UI** (metadata flag + UI badge).
- Daily digest should include:
  - New markets created within the digest window (if they meet absolute baseline filters), and/or
  - Spike markets where probability or 24h volume moves significantly (relative change **after** an absolute baseline).
- For **spike** items, set `published_at` to the spike observation time so they appear in the daily window.
- For **new** markets, keep `published_at = market.createdAt` and store createdAt separately in metadata.

## Required contract changes

### 1) Config schema (update `docs/connectors.md` Polymarket section)

Add fields (keep existing ones):

```json
{
  "categories": ["politics", "economics", "crypto"],
  "min_volume": 10000,
  "min_liquidity": 5000,
  "min_volume_24h": 2000,
  "include_restricted": true,
  "include_resolved": false,
  "max_markets_per_fetch": 50,

  "include_new_markets": true,
  "include_spike_markets": true,

  "spike_probability_change_threshold": 10,
  "spike_volume_change_threshold": 100,
  "spike_min_volume_24h": 10000,
  "spike_min_liquidity": 5000
}
```

Field semantics:

- **Baseline filters** (applies to all):
  - `min_volume` (total USD)
  - `min_liquidity` (USD)
  - `min_volume_24h` (USD)
- **Inclusion toggles**:
  - `include_new_markets` (default true)
  - `include_spike_markets` (default true)
  - `include_restricted` (default true)
- **Spike thresholds** (relative, % or pp):
  - `spike_probability_change_threshold` = percentage points since last fetch
  - `spike_volume_change_threshold` = % change in 24h volume since last fetch
  - `spike_min_volume_24h` / `spike_min_liquidity` = absolute baseline required before spike qualifies

> Note: Keep backward compatibility by allowing old `probability_change_threshold` to act as alias.

### 2) Cursor schema

Add prior values for spike detection:

```json
{
  "last_fetch_at": "2026-01-11T08:00:00Z",
  "seen_condition_ids": ["id1", "id2"],
  "last_prices": { "condition_id_1": 0.65 },
  "last_volume_24h": { "condition_id_1": 12345 }
}
```

### 3) Fetch semantics

- Fetch markets from Gamma only.
- Determine **new** vs **spike** using cursor + window.
- Emit items when (new || spike) AND baseline filters pass.
- Cap output by `max_markets_per_fetch`, prioritizing spikes then newest markets.

### 4) Normalize semantics

- `sourceType = "polymarket"`
- `external_id = "pm_{condition_id}"`
- `published_at`:
  - new market: market.createdAt
  - spike market: spike observation time (windowEnd or fetch time)
- Add metadata:
  - `is_new`, `is_spike`, `spike_reason`
  - `probability_change_pp`, `volume_24h_change_pct`, `volume_24h_change_abs`
  - `market_created_at`, `market_updated_at`
  - `is_restricted`

### 5) UI requirement

- `is_restricted` must be displayed in UI as a badge/label.

### 6) Recommended daily config examples

- **Daily interesting + spikes** (low noise):

```json
{
  "min_volume": 10000,
  "min_liquidity": 5000,
  "min_volume_24h": 2000,
  "include_new_markets": true,
  "include_spike_markets": true,
  "spike_probability_change_threshold": 10,
  "spike_volume_change_threshold": 100,
  "spike_min_volume_24h": 10000,
  "spike_min_liquidity": 5000
}
```

- **Spikes only** (alerts):

```json
{
  "include_new_markets": false,
  "include_spike_markets": true,
  "spike_probability_change_threshold": 15,
  "spike_volume_change_threshold": 150,
  "spike_min_volume_24h": 25000
}
```

## Acceptance criteria

- `docs/connectors.md` reflects the new config fields, cursor state, and spike/new semantics.
- `docs/tasks/README.md` lists the new tasks.

## Commit

- **Message**: `docs(polymarket): define daily interesting + spike contract`
- **Files expected**: `docs/connectors.md`, `docs/tasks/README.md`

