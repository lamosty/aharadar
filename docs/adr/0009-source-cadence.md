# ADR 0009: Per-source cadence (how often each source is fetched)

- **Status**: Accepted
- **Date**: 2026-01-05

## Context

Different connectors have different “natural” frequencies:

- RSS feeds and some communities can be fetched multiple times per day.
- Other sources are noisy or costly and should be fetched less often (e.g. daily or weekly).
- We also want to run the *pipeline* on a schedule (or manually) without being forced to fetch every source every run.

We already have:

- `sources.config_json` for per-source configuration
- `sources.cursor_json` for per-source state
- a pipeline ingest stage that loops through enabled sources

## Decision

Add a **generic per-source cadence** concept enforced by the pipeline ingest stage.

### Representation

In `sources.config_json`, add an optional `cadence` field:

```json
{
  "cadence": { "mode": "interval", "every_minutes": 480 }
}
```

Semantics:

- If `cadence` is missing: the source is treated as “always due” and will be fetched whenever ingest runs.
- If cadence is present: the source is fetched only when it is **due** (see below).

### “Due” rule

Let:

- `now` be the pipeline run’s `windowEnd` (ISO timestamp)
- `last_fetch_at` be the last successful fetch time for this source (ISO timestamp)
- `every_minutes` be the interval from config

The source is due if either:

- `last_fetch_at` is missing, or
- `now - last_fetch_at >= every_minutes`

### Storing `last_fetch_at`

Store `last_fetch_at` in `sources.cursor_json.last_fetch_at` and update it **only after a successful fetch** (`ok|partial`).

If a source is skipped due to cadence, it must **not** update `last_fetch_at`.

## Consequences

- Source cadence becomes configurable without schema changes (uses `config_json`).
- Connectors no longer need bespoke “once per day” guardrails for cadence purposes (cadence is centralized).
- Users can tune cost/noise per source (especially important for expensive providers).

## Non-goals

- Complex cron expressions (may be added later; MVP uses interval cadence).
- A global scheduler implementation (this ADR only defines source-level cadence semantics; scheduling is a separate concern).


