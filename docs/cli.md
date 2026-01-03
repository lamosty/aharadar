# Aha Radar — CLI UX Spec (MVP)

The CLI is the MVP UI: a fast **review queue** optimized for “aha-per-minute”.

## MVP goals

- Show the newest digest items (ranked).
- Allow fast feedback: like/dislike/save/skip.
- Provide provenance: open original source link(s).
- Show “why shown”: use triage reason + personalization signals.

## Data model assumptions

The CLI primarily displays `digest_items`:

- cluster-based by default (one row per cluster/story)
- item detail view can show top member `content_items` for the cluster

## Commands (Proposed)

### `aharadar inbox`

Shows latest digest(s):

- digest window time
- ranked list of items (cards by default: title + reason + link)
- use `--table` for a compact tabular view
- use `--topic <id-or-name>` to select a topic when multiple exist

### `aharadar review`

Starts the review loop for the latest digest:

- one item at a time
- immediate keypress feedback
- scoped to a single topic (pass `--topic <id-or-name>` when multiple topics exist)

### `aharadar search "<query>"`

Semantic search across history (MVP may be “best effort”).

Notes:

- Results are **topic-scoped** when you pass `--topic <id-or-name>` (recommended when you have multiple topics).
- Semantic search requires embeddings to be enabled (see `docs/llm.md` for required embedding env vars like `OPENAI_EMBED_MODEL`).

Examples:

```bash
pnpm dev:cli -- search "vector database indexing"
pnpm dev:cli -- search --topic default "pipeline errors"
```

### `aharadar admin:run-now`

Triggers a run for “now” window (or specified range).

Options:

- `--max-items-per-source N`: override the default per-source ingest cap (default: 50).
- `--max-digest-items N`: override the default digest size (otherwise the CLI picks a dev-friendly size based on what ingest upserted, capped).
- `--source-type <type>[,<type>...]`: only ingest enabled sources matching these `sources.type` values (e.g. `reddit`, `signal`).
- `--source-id <uuid>`: only ingest a specific source by id (repeat by passing multiple times).
- `--topic <id-or-name>`: run ingestion + digest for a single topic (recommended when you have multiple topics).

Example:

```bash
pnpm dev:cli -- admin:run-now --max-items-per-source 200
```

Examples (run subsets):

```bash
# Run canonical content sources more frequently (e.g. 2–3×/day)
pnpm dev:cli -- admin:run-now --source-type reddit --max-items-per-source 200

# Run signals explicitly (signal connector is also internally once-per-day per source)
pnpm dev:cli -- admin:run-now --source-type signal
```

### `aharadar admin:embed-now`

Embeds existing content items **without running ingest** (no connector fetch). This enables semantic search and downstream clustering/dedupe/personalization work.

Options:

- `--max-items N`: override the per-run embedding cap (otherwise uses `OPENAI_EMBED_MAX_ITEMS_PER_RUN`).
- `--topic <id-or-name>`: embed content for a single topic.

Example:

```bash
pnpm dev:cli -- admin:embed-now --topic default
```

### `aharadar admin:digest-now`

Recompute the digest **without running ingest** (no connector fetch). Uses existing `content_items` already stored in the DB.

Options:

- `--max-items N`: number of digest items to persist (if omitted: dev-friendly default = all candidates (capped)).
- `--source-type <type>[,<type>...]`: only consider candidates from these source types (e.g. `reddit`).
- `--source-id <uuid>`: only consider candidates from a specific source id.
- `--topic <id-or-name>`: build digest for a single topic.

Example:

```bash
pnpm dev:cli -- admin:digest-now --source-type reddit
pnpm dev:cli -- inbox
```

### `aharadar admin:sources-list`

Lists all configured sources for the current user (debug/dev convenience).

### `aharadar admin:sources-add --type <type> --name <name> [--topic <id-or-name>] [--config <json>] [--cursor <json>]`

Creates a source row for the current user (debug/dev convenience).

Example (reddit):

```bash
pnpm dev:cli -- admin:sources-add --type reddit --name "reddit:MachineLearning" --config '{"subreddits":["MachineLearning"],"listing":"new"}'
```

### `aharadar admin:budgets`

Shows current budget usage (current month + current run) derived from `provider_calls`.

Also shows warnings when:

- monthly used ≥ 80% / 95%
- daily throttle used ≥ 80% / 95%

### `aharadar admin:signal-debug [--limit N] [--verbose] [--json] [--raw]`

Prints the latest stored `signal` bundles (from `content_items`) and recent `provider_calls` for `purpose='signal_search'` to help debug what `x_search` is returning.

### `aharadar admin:signal-reset-cursor [--clear] [--since-time <ISO>]`

Resets `cursor_json` for all `signal` sources:

- Use `--clear` to remove `since_time` (forces the next run to use the pipeline window start).
- Use `--since-time <ISO>` to set an explicit lower bound for the next run.

### `aharadar admin:topics-list`

Lists topics for the current user.

### `aharadar admin:topics-add --name <name> [--description <text>]`

Creates a topic for the current user.

## Review keybindings (Proposed)

- `j` / `k`: next / previous item
- `l`: like
- `d`: dislike
- `s`: save
- `x`: skip
- `o`: open canonical URL in browser
- `w`: show “why shown”
- `enter`: expand details
- `?`: help
- `q`: quit

## “Why shown” content (MVP)

Display a short explanation assembled from:

- triage `reason`
- embedding-based preference match (similarity to topic preference profile; and/or similar liked items)
- novelty indicator (e.g., “new vs your recent history”)
- provenance (sources contributing to the cluster)

## Error / edge behavior

- If deep summary is missing (budget dial-down): show triage only.
- If a source fails during ingestion: do not block CLI; show what exists.
- If canonical URL is missing: show source-native link (e.g., HN item link).
