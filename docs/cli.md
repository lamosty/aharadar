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
- ranked list of items (cluster title + aha score + short reason)

### `aharadar review`

Starts the review loop for the latest digest:
- one item at a time
- immediate keypress feedback

### `aharadar search "<query>"`

Semantic search across history (MVP may be “best effort”).

### `aharadar admin run-now`

Triggers a run for “now” window (or specified range).

### `aharadar admin budgets`

Shows current budget usage (current month + current run) derived from `provider_calls`.

Also shows warnings when:
- monthly used ≥ 80% / 95%
- daily throttle used ≥ 80% / 95%

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
- top matching preference theme (derived from liked items embedding similarity)
- novelty indicator (e.g., “new vs your recent history”)
- provenance (sources contributing to the cluster)

## Error / edge behavior

- If deep summary is missing (budget dial-down): show triage only.
- If a source fails during ingestion: do not block CLI; show what exists.
- If canonical URL is missing: show source-native link (e.g., HN item link).


