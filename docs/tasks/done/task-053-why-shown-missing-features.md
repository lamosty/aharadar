# Task 053: "Why Shown" Missing Ranking Features

## Problem

Feed items show "No ranking features available" in the "Why shown" dropdown. This defeats the purpose of the feature - users want to understand WHY an item was ranked highly.

## Current State

### What's Happening

- `triage_json` is NULL for digest items
- WhyShown component checks `triage_json?.system_features`
- Since it's null, shows "No ranking features available"

### Database Check

```sql
SELECT di.triage_json FROM digest_items di LIMIT 5;
-- All NULL
```

### Why triage_json is NULL

The triage step (LLM-based ranking) was SKIPPED because:

1. Digests were created manually (no LLM triage)
2. OR digests were created with `paidCallsAllowed: false`
3. OR triage step failed/timed out

Looking at digest creation:

- Manual insert didn't run triage
- CLI `admin:digest-now` may have failed on triage (OpenAI model "gpt-5.1" doesn't exist)

## Investigation Needed

### 1. Check triage configuration

**File:** `.env`

```
OPENAI_TRIAGE_MODEL=gpt-5.1
```

Model name is valid (see https://platform.openai.com/docs/models/gpt-5.1). Issue is likely elsewhere.

### 2. Check triage code path

**File:** `packages/pipeline/src/stages/digest.ts`

Line ~735:

```typescript
if (paidCallsAllowed) {
  // Run LLM triage
}
```

Is this being called? What errors occur?

### 3. Check provider calls log

```sql
SELECT purpose, status, error_json
FROM provider_calls
WHERE purpose = 'triage'
ORDER BY started_at DESC
LIMIT 10;
```

## Root Causes & Solutions

### Cause A: Digest created without triage (Most Likely)

**Fix:** Re-run pipeline with triage enabled:

```bash
pnpm dev:cli -- admin:run-now
```

This should run full pipeline including triage (if paidCallsAllowed=true).

### Cause C: Budget exhausted

If monthly/daily credits exhausted, `paidCallsAllowed` becomes false.

**Fix:** Check budgets:

```bash
pnpm dev:cli -- admin:budgets
```

If exhausted, either:

- Wait for reset
- Increase budget in .env
- Run with `--skip-triage` flag (if available)

## What triage_json Should Contain

When triage runs successfully:

```json
{
  "system_features": {
    "novelty_score": 0.85,
    "engagement_potential": 0.72,
    "topic_relevance": 0.91,
    "source_authority": 0.88,
    "recency_boost": 0.95
  },
  "reasoning": "High novelty - first report of this technology...",
  "confidence": 0.87
}
```

## Implementation Steps

### 1. Fix .env model name

```
OPENAI_TRIAGE_MODEL=gpt-4o-mini
```

### 2. Verify credits available

```bash
pnpm dev:cli -- admin:budgets
```

### 3. Re-run pipeline with triage

```bash
pnpm dev:cli -- admin:run-now
```

### 4. Verify triage_json populated

```sql
SELECT di.triage_json
FROM digest_items di
WHERE di.triage_json IS NOT NULL
LIMIT 5;
```

### 5. Check WhyShown displays features

**File:** `packages/web/src/components/WhyShown/WhyShown.tsx`

Verify it reads from correct path:

```tsx
const features = triageJson?.system_features;
```

## Alternative: Heuristic Features

If LLM triage is too expensive, could show heuristic-based features:

- Recency score
- Source weight
- Engagement signals (for Reddit: upvotes; for HN: points)

**File:** `packages/pipeline/src/stages/digest.ts`

Even without LLM, could populate basic features:

```typescript
const heuristicFeatures = {
  recency_score: calculateRecencyScore(item.publishedAt),
  source_weight: source.weight || 1.0,
  engagement: item.metadata?.score || item.metadata?.ups || 0,
};

// Store in triage_json even without LLM
triageJson = { system_features: heuristicFeatures };
```

## Files to Check/Modify

- `.env` - Fix model name
- `packages/pipeline/src/stages/digest.ts` - Triage logic
- `packages/web/src/components/WhyShown/WhyShown.tsx` - Display logic

## Testing

1. Fix .env and re-run pipeline
2. Verify triage_json populated in DB
3. Verify WhyShown shows features
4. Check various source types (HN, Reddit, X)

## Priority

**Medium** - WhyShown is a nice transparency feature but not critical. Fix model name first, then re-run pipeline.

## Quick Fix

If just want to suppress the "No features" message for now:

**File:** `packages/web/src/components/WhyShown/WhyShown.tsx`

```tsx
if (!features || Object.keys(features).length === 0) {
  return null; // Hide instead of showing "no features"
}
```
