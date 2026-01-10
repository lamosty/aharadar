# Task 125: Digest Observability and Atomicity

## Problem Statement

Currently, digests can be created in a "partial" state without the user knowing:

1. **Silent budget failures**: When credits run out mid-run, some sources are skipped (x_posts) but the digest is still created. User sees a digest and assumes it ran completely.

2. **No visibility into digest status**: The digest list/detail pages show items but don't indicate:
   - Which sources were fetched vs skipped
   - Why sources were skipped (budget, errors, etc.)
   - Credit usage for the digest run
   - Whether the digest is complete or partial

3. **Unexpected re-runs**: When user adjusts budget, queued/pending jobs re-run and fetch previously-skipped sources, creating confusion.

4. **User-facing gaps**: Normal users can't see their digest history or credit usage - they have no insight into what the system is doing.

## User Story

> "When I see a digest on the digests page, I want to know it fully ran without issues. If something went wrong, I want to see clear errors. I should be able to see which sources ran, which didn't, and how many credits were used."

## Current State

### Database Schema (`digests` table)
```sql
- id, user_id, topic_id
- window_start, window_end
- mode (low/normal/high)
- created_at
```

Missing:
- `status` (complete, partial, failed)
- `credits_used`
- `source_results` (JSON with per-source status)
- `error_message`

### Current Behavior
1. Pipeline runs ingest → embed → dedupe → cluster → digest
2. If budget exhausted, paid sources skipped with `skipReason: "budget_exhausted"`
3. Digest is created anyway with whatever items were available
4. No record of which sources succeeded/failed
5. No record of credits used for this specific digest

## Proposed Solution

### 1. Schema Changes

Add columns to `digests` table:
```sql
ALTER TABLE digests ADD COLUMN status TEXT NOT NULL DEFAULT 'complete';
-- Values: 'complete', 'partial', 'failed'

ALTER TABLE digests ADD COLUMN credits_used NUMERIC(12,6) NOT NULL DEFAULT 0;

ALTER TABLE digests ADD COLUMN source_results JSONB NOT NULL DEFAULT '[]';
-- Array of: { sourceId, sourceName, sourceType, status, skipReason?, itemsFetched, creditsUsed }

ALTER TABLE digests ADD COLUMN error_message TEXT;
```

### 2. Pipeline Changes

**Pre-run budget check** (`packages/pipeline/src/scheduler/run.ts`):
- Before starting, estimate if budget is sufficient for all paid sources
- If not, either: (a) fail immediately, or (b) proceed but mark as "partial"

**Track per-source results**:
- Collect `IngestSourceResult` from ingest stage
- Sum credits from `provider_calls` made during this run
- Store in `digests.source_results`

**Atomicity options**:
- Option A: Don't create digest if any paid source was skipped (strict)
- Option B: Create digest but mark status='partial' (current + visibility)
- Option C: User-configurable behavior

### 3. UI Changes

**Digest List Page** (`/app/digests`):
- Add status badge (complete/partial/failed)
- Show credits used
- Show source count: "4/4 sources" or "3/4 sources (1 skipped)"

**Digest Detail Page** (`/app/digests/[id]`):
- New "Run Details" section showing:
  - Status with explanation
  - Credit usage breakdown
  - Per-source results table (name, type, status, items, credits)
  - Errors if any

**User Dashboard** (future):
- Credit usage history
- Digest history across all topics

### 4. API Changes

**GET /api/digests** - include status, credits_used in response
**GET /api/digests/[id]** - include full source_results

## Key Files

- `packages/db/migrations/` - new migration for schema changes
- `packages/db/src/repos/digests.ts` - update CRUD methods
- `packages/pipeline/src/scheduler/run.ts` - track results, set status
- `packages/pipeline/src/stages/digest.ts` - pass results through
- `packages/api/src/routes/digests.ts` - expose new fields
- `packages/web/src/app/app/digests/page.tsx` - list view updates
- `packages/web/src/app/app/digests/[id]/page.tsx` - detail view updates

## Questions to Decide

1. **Atomicity policy**: Should we prevent digest creation if any source was skipped? Or allow partial digests with clear marking?

2. **Pre-run budget check**: Should we check budget BEFORE running and refuse to start if insufficient? This prevents wasted free-source fetches.

3. **Credit estimation**: Can we estimate credits needed before running? (num_paid_sources × avg_credits_per_source)

4. **User-facing metrics**: What level of detail should normal users see? Just status, or full breakdown?

## Acceptance Criteria

- [ ] Digests table has status, credits_used, source_results columns
- [ ] Pipeline records per-source results and credit usage
- [ ] Digest list shows status indicator (complete/partial/failed)
- [ ] Digest detail shows source results breakdown
- [ ] Budget-skipped sources are clearly indicated
- [ ] Users can see their credit usage per digest

## Related

- Task 121: Topic digest scheduling (digest_interval_minutes)
- ADR 0009: Source cadence (being removed)
- Budget tracking in `provider_calls` table
