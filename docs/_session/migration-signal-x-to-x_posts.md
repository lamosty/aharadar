# Migration: Legacy signal-stored X content to x_posts

## Problem statement

Before the `x_posts` canonical connector was introduced, X/Twitter posts were stored as `signal_post_v1` items via the `signal` connector. Now that `x_posts` exists and `signal` is bundle-only, old signal-stored X content won't appear in new digests.

## Recommended approach: Reset + Re-ingest (dev/local)

For local/dev environments, the simplest approach is to reset the DB and re-ingest:

```bash
# 1. Reset the database (drops all data)
./scripts/reset.sh

# 2. Run migrations
./scripts/migrate.sh

# 3. Recreate sources (including x_posts sources for X accounts)
# Example: create an x_posts source for monitoring specific X accounts
pnpm dev:cli -- admin:sources-add --topic <topic-name> --type x_posts --config '{
  "vendor": "grok",
  "accounts": ["account1", "account2"],
  "cadence": { "mode": "interval", "every_minutes": 1440 }
}'

# 4. Run ingestion
pnpm dev:cli -- admin:run-now --topic <topic-name>
```

## Stance: No backfill by default

Per the repo velocity rule (CLAUDE.md: "no premature fallbacks"), **we do not implement a backfill/migration tool by default**.

Rationale:
- Dev/local can always reset + re-ingest (clean state is fine)
- A backfill tool adds complexity and risk (data transformation, idempotency, etc.)
- The value is low for MVP (fresh ingestion is sufficient)

## If we later need backfill...

If a production scenario requires migrating existing `signal_post_v1` rows to `x_posts`, a backfill tool would:

1. **Query** all `content_items` where `source_type='signal'` and `metadata_json->>'kind'='signal_post_v1'`
2. **For each row**:
   - Parse the `canonical_url` to extract the X status URL
   - Create a new `content_items` row with `source_type='x_posts'` and the normalized fields
   - Link to an appropriate `x_posts` source (may need to create one if none exists)
3. **Risks**:
   - Duplicate detection: must check if the same URL already exists as `x_posts`
   - Source association: old signal items came from `signal` sources, not `x_posts` sources
   - Embeddings: may need to recompute embeddings for the new items
4. **Recommendation**: Only implement if explicitly requested and production data is at stake.

## Related docs

- `docs/connectors.md` — x_posts and signal connector semantics
- `docs/adr/0010-x-posts-canonical-via-grok.md` — why x_posts is canonical
