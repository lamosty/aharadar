# Aha Radar — Minimal HTTP API (Optional MVP)

The MVP can be CLI-only, but a minimal API is useful for:
- remote CLI usage (without DB credentials on the client)
- optional minimal web viewer later
- admin trigger endpoints (“run now”)

## Auth (MVP)

- Static admin API key stored in env.
- Client sends `X-API-Key: <key>`.

## Endpoints (Proposed)

### `GET /api/health`

Returns:
```json
{ "ok": true }
```

### `GET /api/digests?from=<iso>&to=<iso>`

Returns:
- list of digests within `[from, to]` (default: recent)

### `GET /api/digests/:id`

Returns:
- digest metadata
- ranked digest items (triage + summary if present)

### `GET /api/items/:id`

Returns:
- a `content_item` plus any cluster context (optional)

### `POST /api/feedback`

Request:
```json
{
  "contentItemId": "uuid",
  "digestId": "uuid",
  "action": "like"
}
```

Response:
```json
{ "ok": true }
```

### `POST /api/admin/run`

Triggers a pipeline run (async) for a window.

Request (Proposed):
```json
{
  "mode": "normal",
  "windowStart": "2025-12-17T08:00:00Z",
  "windowEnd": "2025-12-17T13:00:00Z"
}
```

`mode` values (Proposed):
- `low` | `normal` | `high` | `catch_up`

Response:
```json
{ "ok": true, "jobId": "string" }
```

### `GET /api/admin/config` and `PUT /api/admin/config`

Optional MVP admin endpoints to manage:
- sources
- schedule
- budgets

## Error responses (Proposed)

All errors return:
```json
{
  "ok": false,
  "error": {
    "code": "string",
    "message": "string"
  }
}
```

## Non-goals (MVP)

- No multi-user auth/sessions.
- No public exposure without a reverse proxy and TLS.


