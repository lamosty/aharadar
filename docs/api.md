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

### `POST /api/items/:id/read`

Marks an item as read (used to keep inbox clean without feedback).

Request (optional pack association):

```json
{ "packId": "uuid" }
```

Response:

```json
{ "ok": true, "readAt": "2026-01-26T12:34:56Z" }
```

### `DELETE /api/items/:id/read`

Clears read state for an item.

Response:

```json
{ "ok": true, "deleted": 1 }
```

### `POST /api/catchup-packs`

Generate (or fetch existing) catch-up pack for a topic + timeframe.

Request:

```json
{
  "topicId": "uuid",
  "timeframeDays": 7,
  "timeBudgetMinutes": 60
}
```

Response:

```json
{ "ok": true, "pack": { "id": "uuid", "status": "pending" } }
```

### `GET /api/catchup-packs/:id`

Returns a pack with tiers + item details when ready.

### `GET /api/catchup-packs?topicId=<uuid>`

Returns recent packs for a topic (default: current topic).

### `DELETE /api/catchup-packs/:id`

Delete a catch-up pack record.

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

### `GET /api/admin/sources`

Returns list of sources for the singleton user/topic.

Response:

```json
{
  "ok": true,
  "sources": [
    {
      "id": "uuid",
      "type": "rss",
      "name": "Example Feed",
      "isEnabled": true,
      "config": { "cadence": { "mode": "interval", "every_minutes": 480 }, "weight": 1.5 },
      "createdAt": "2025-01-01T00:00:00Z"
    }
  ]
}
```

### `PATCH /api/admin/sources/:id`

Update source fields. Supports partial updates with patch semantics.

Request:

```json
{
  "name": "New Name",
  "isEnabled": false,
  "configPatch": {
    "cadence": { "mode": "interval", "every_minutes": 480 },
    "weight": 1.5
  }
}
```

All fields are optional. For `configPatch`, setting a field to `null` removes it from config.

Response:

```json
{
  "ok": true,
  "source": {
    "id": "uuid",
    "type": "rss",
    "name": "New Name",
    "isEnabled": false,
    "config": { "cadence": { "mode": "interval", "every_minutes": 480 }, "weight": 1.5 },
    "createdAt": "2025-01-01T00:00:00Z"
  }
}
```

Errors:

- 400 for invalid UUID, invalid body
- 403 if source doesn't belong to current user/topic
- 404 if source not found

### `GET /api/admin/budgets`

Returns the current budget status (credits usage).

Response:

```json
{
  "ok": true,
  "budgets": {
    "monthlyUsed": 1500,
    "monthlyLimit": 10000,
    "monthlyRemaining": 8500,
    "dailyUsed": 200,
    "dailyLimit": 500,
    "dailyRemaining": 300,
    "paidCallsAllowed": true,
    "warningLevel": "none"
  }
}
```

Notes:

- `dailyLimit` and `dailyRemaining` are `null` if `DAILY_THROTTLE_CREDITS` is not configured
- `warningLevel` can be `"none"`, `"approaching"` (>=80%), or `"critical"` (>=95%)
- `paidCallsAllowed` is `false` when monthly or daily credits are exhausted

### `GET /api/admin/config` and `PUT /api/admin/config`

Optional MVP admin endpoints to manage:

- schedule

### `GET /api/admin/ops-status`

Returns worker health status, queue counts, and ops dashboard links. Admin-only endpoint.

Response:

```json
{
  "ok": true,
  "worker": {
    "ok": true,
    "startedAt": "2025-01-09T10:00:00.000Z",
    "lastSchedulerTickAt": "2025-01-09T12:30:00.000Z"
  },
  "queue": {
    "active": 1,
    "waiting": 5
  },
  "links": {
    "grafana": "https://grafana.example.com/d/worker",
    "prometheus": "https://prometheus.example.com",
    "queue": "http://localhost:3101",
    "logs": "https://logs.example.com"
  }
}
```

Notes:

- `worker.ok` is `false` if the worker is unreachable (1s timeout)
- `worker.startedAt` and `worker.lastSchedulerTickAt` are only present when worker is reachable
- `links` only includes URLs that are configured via env vars (`OPS_GRAFANA_URL`, `OPS_PROMETHEUS_URL`, `OPS_QUEUE_DASHBOARD_URL`, `OPS_LOGS_URL`)
- Worker health probe URL is configurable via `WORKER_HEALTH_URL` (default: `http://localhost:9091/health`)

Errors:

- 401 if not authenticated
- 403 if not admin role

## Topics API

### `GET /api/topics`

Returns list of topics for the authenticated user.

### `POST /api/topics`

Create a new topic.

### `PATCH /api/topics/:id`

Update topic name or description.

### `DELETE /api/topics/:id`

Delete a topic and all associated sources.

### `PATCH /api/topics/:id/digest-settings`

Update digest schedule settings (frequency, mode, depth).

Note: `decay_hours` is automatically derived from `digest_interval_minutes` using the formula `round(interval / 60)`.

### Deprecated / Removed

- **`PATCH /api/topics/:id/viewing-profile`**: Removed. Decay is now derived from digest interval.
- **`profileOptions`**: No longer returned in topic responses.
- **`viewingProfile` / `decayHours`**: Still present in responses for backward compatibility, but not settable via API. Decay is auto-derived from `digest_interval_minutes`.

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
