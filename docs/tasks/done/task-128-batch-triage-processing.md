# Task 128: Batch Triage Processing

**Status**: TODO
**Priority**: High (cost/efficiency optimization)
**Scope**: `packages/llm`, `packages/pipeline`

## Problem Statement

Current triage implementation makes **one LLM call per candidate item**. For a digest with 200 candidates, this means:
- 200 separate API calls
- 200x the per-call overhead
- Sequential latency (even if parallelized, still 200 round trips)
- 200 calls against Claude subscription quota (100/hour limit)

This is inefficient and expensive. Modern LLMs can process multiple items in a single context window.

## Goal

Implement batch triage processing that sends **N items per LLM call** (e.g., 10-20), reducing total calls by 10-20x while maintaining the same output quality and schema.

## Current Architecture

### Flow
```
digest.ts:triageCandidates()
  → for each candidate:
      → router.call("triage", ref, request)
        → triage.ts:triageCandidate()
          → runTriageOnce() → single LLM call
          → returns TriageOutput for ONE item
      → triageMap.set(candidateId, result)
```

### Current Prompt Structure (triage.ts)
```
System: "You are a strict JSON generator for content triage..."
User: { candidate: { id, title, body_text, ... } }
Output: { aha_score, reason, is_relevant, ... } // ONE item
```

### Current Schema (TriageOutput)
```typescript
interface TriageOutput {
  schema_version: "triage_v1";
  prompt_id: "triage_v1";
  provider: string;
  model: string;
  aha_score: number;        // 0-100
  reason: string;
  is_relevant: boolean;
  is_novel: boolean;
  categories: string[];
  should_deep_summarize: boolean;
}
```

## Proposed Architecture

### New Flow
```
digest.ts:triageCandidates()
  → chunk candidates into batches of BATCH_SIZE
  → for each batch:
      → triage.ts:triageBatch()
        → runBatchTriageOnce() → single LLM call for N items
        → returns Map<candidateId, TriageOutput>
      → merge into triageMap
```

### New Prompt Structure
```
System: "You are a strict JSON generator for content triage.
        You will receive multiple items. Return a JSON array with
        one result object per input item, in the same order..."

User: {
  batch_id: "batch-001",
  items: [
    { id: "item-1", title: "...", body_text: "..." },
    { id: "item-2", title: "...", body_text: "..." },
    ...
  ]
}

Output: {
  schema_version: "triage_batch_v1",
  batch_id: "batch-001",
  results: [
    { id: "item-1", aha_score: 72, reason: "...", ... },
    { id: "item-2", aha_score: 45, reason: "...", ... },
    ...
  ]
}
```

### New Schema
```typescript
interface TriageBatchOutput {
  schema_version: "triage_batch_v1";
  prompt_id: "triage_batch_v1";
  batch_id: string;
  results: TriageBatchItem[];
}

interface TriageBatchItem {
  id: string;              // Must match input item ID
  aha_score: number;       // 0-100
  reason: string;
  is_relevant: boolean;
  is_novel: boolean;
  categories: string[];
  should_deep_summarize: boolean;
}
```

## Implementation Plan

### Phase 1: Core Batch Triage (triage.ts)

1. **Add batch schema constant**
   ```typescript
   export const TRIAGE_BATCH_JSON_SCHEMA: Record<string, unknown> = {
     type: "object",
     properties: {
       schema_version: { type: "string", const: "triage_batch_v1" },
       batch_id: { type: "string" },
       results: {
         type: "array",
         items: {
           type: "object",
           properties: {
             id: { type: "string" },
             aha_score: { type: "number", minimum: 0, maximum: 100 },
             reason: { type: "string" },
             is_relevant: { type: "boolean" },
             is_novel: { type: "boolean" },
             categories: { type: "array", items: { type: "string" } },
             should_deep_summarize: { type: "boolean" }
           },
           required: ["id", "aha_score", "reason", "is_relevant", "is_novel", "categories", "should_deep_summarize"]
         }
       }
     },
     required: ["schema_version", "batch_id", "results"]
   };
   ```

2. **Add batch prompt builders**
   ```typescript
   function buildBatchSystemPrompt(ref: ModelRef, isRetry: boolean): string
   function buildBatchUserPrompt(candidates: TriageCandidateInput[], batchId: string, tier: BudgetTier): string
   ```

3. **Add batch triage function**
   ```typescript
   export async function triageBatch(params: {
     router: LlmRouter;
     tier: BudgetTier;
     candidates: TriageCandidateInput[];
     batchId: string;
   }): Promise<Map<string, TriageOutput>>
   ```

4. **Add batch result normalization**
   ```typescript
   function normalizeBatchOutput(
     value: Record<string, unknown>,
     ref: ModelRef,
     expectedIds: string[]
   ): Map<string, TriageOutput> | null
   ```

### Phase 2: Batch Size Configuration

1. **Environment variables**
   ```bash
   # .env
   TRIAGE_BATCH_SIZE=15                    # Items per batch (default: 15)
   TRIAGE_BATCH_MAX_INPUT_CHARS=50000      # Max chars per batch (safety limit)
   TRIAGE_BATCH_ENABLED=true               # Feature flag
   ```

2. **Batch size calculation**
   ```typescript
   function calculateBatchSize(candidates: TriageCandidateInput[]): number {
     const configSize = parseIntEnv(process.env.TRIAGE_BATCH_SIZE) ?? 15;
     const maxChars = parseIntEnv(process.env.TRIAGE_BATCH_MAX_INPUT_CHARS) ?? 50000;

     // Calculate actual size based on content length
     let currentChars = 0;
     let count = 0;
     for (const c of candidates) {
       const itemChars = (c.title?.length ?? 0) + (c.bodyText?.length ?? 0);
       if (currentChars + itemChars > maxChars && count > 0) break;
       currentChars += itemChars;
       count++;
       if (count >= configSize) break;
     }
     return Math.max(1, count);
   }
   ```

### Phase 3: Integration with digest.ts

1. **Update triageCandidates function**
   ```typescript
   async function triageCandidates(params: {
     db: DbClient;
     userId: string;
     candidates: ScoredCandidate[];
     windowStart: string;
     windowEnd: string;
     mode: BudgetTier;
     maxCalls: number;
     llmConfig?: LlmRuntimeConfig;
   }): Promise<Map<string, TriageOutput>> {
     const batchEnabled = process.env.TRIAGE_BATCH_ENABLED !== "false";

     if (batchEnabled) {
       return triageCandidatesBatched(params);
     } else {
       return triageCandidatesSequential(params); // Current implementation
     }
   }
   ```

2. **Implement batched version**
   ```typescript
   async function triageCandidatesBatched(params: ...): Promise<Map<string, TriageOutput>> {
     const triageMap = new Map<string, TriageOutput>();
     const batches = chunkCandidates(params.candidates, calculateBatchSize);

     for (const [batchIndex, batch] of batches.entries()) {
       const batchId = `batch-${batchIndex}`;
       try {
         const results = await triageBatch({
           router,
           tier: params.mode,
           candidates: batch.map(toTriageInput),
           batchId
         });

         for (const [id, output] of results) {
           triageMap.set(id, output);
         }

         // Record single provider call for the batch
         await params.db.providerCalls.insert({
           purpose: "triage_batch",
           meta: { batchId, itemCount: batch.length, ... }
         });
       } catch (err) {
         // Fallback: retry batch items individually
         log.warn({ batchId, err }, "Batch triage failed, falling back to individual");
         for (const candidate of batch) {
           try {
             const result = await triageCandidate({ router, tier, candidate });
             triageMap.set(candidate.id, result.output);
           } catch (itemErr) {
             log.warn({ candidateId: candidate.id }, "Individual triage also failed");
           }
         }
       }
     }

     return triageMap;
   }
   ```

### Phase 4: Error Handling & Fallbacks

1. **Partial batch failure**: If LLM returns fewer results than input items:
   - Log warning with missing IDs
   - Retry missing items individually
   - Continue with partial results

2. **Validation failure**: If batch output fails schema validation:
   - Try to extract valid items from partial response
   - Retry entire batch once with isRetry=true
   - Fall back to individual triage for remaining items

3. **ID mismatch**: If returned IDs don't match input IDs:
   - Log error with details
   - Attempt fuzzy matching by position (risky)
   - Fall back to individual triage

4. **Context overflow**: If batch is too large:
   - Catch token limit errors
   - Split batch in half and retry
   - Continue recursively until batches succeed

### Phase 5: Provider-Specific Considerations

1. **Claude Subscription (outputFormat)**
   - Use `TRIAGE_BATCH_JSON_SCHEMA` for structured output
   - Extract from `StructuredOutput` tool use (already implemented)
   - Batch reduces calls against hourly quota significantly

2. **OpenAI (Responses API)**
   - Works with standard JSON output
   - May benefit from `response_format: { type: "json_object" }`
   - Consider using `json_schema` parameter if available

3. **Anthropic API**
   - Standard prompt-based JSON extraction
   - Existing `extractJsonFromText` handles markdown wrapping

### Phase 6: Observability

1. **Logging**
   ```typescript
   log.info({
     batchId,
     inputCount: batch.length,
     outputCount: results.size,
     durationMs,
     provider: ref.provider,
     model: ref.model
   }, "Batch triage complete");
   ```

2. **Metrics** (future)
   - `triage_batch_size_histogram`
   - `triage_batch_duration_seconds`
   - `triage_batch_success_rate`
   - `triage_individual_fallback_count`

3. **Provider calls table**
   - New purpose: `triage_batch`
   - Meta includes: `batchId`, `itemCount`, `successCount`

## Testing Strategy

### Unit Tests (triage.ts)
1. `buildBatchUserPrompt` generates correct JSON structure
2. `normalizeBatchOutput` handles valid batch responses
3. `normalizeBatchOutput` rejects invalid/partial responses
4. `calculateBatchSize` respects char limits
5. ID matching works correctly

### Integration Tests
1. Batch triage with mock LLM returns correct map
2. Partial failure triggers individual fallback
3. Context overflow splits batch correctly
4. Provider calls recorded correctly for batches

### Manual Testing
1. Run digest with `TRIAGE_BATCH_ENABLED=true`
2. Verify reduced API call count in `provider_calls` table
3. Compare triage quality between batch and individual
4. Test with Claude subscription quota limits

## Migration & Rollout

1. **Feature flag**: `TRIAGE_BATCH_ENABLED=false` by default
2. **Shadow mode**: Run both, compare results (optional)
3. **Gradual rollout**: Enable for specific topics first
4. **Full rollout**: Set `TRIAGE_BATCH_ENABLED=true` as default

## Success Criteria

- [ ] Batch triage reduces API calls by 10-20x
- [ ] No degradation in triage quality (aha_score distribution similar)
- [ ] Fallback to individual triage works reliably
- [ ] Claude subscription quota lasts 10-20x longer
- [ ] Provider calls table correctly tracks batch calls
- [ ] Feature flag allows easy rollback

## Estimated Effort

| Phase | Effort |
|-------|--------|
| Phase 1: Core batch triage | Medium |
| Phase 2: Batch size config | Small |
| Phase 3: digest.ts integration | Medium |
| Phase 4: Error handling | Medium |
| Phase 5: Provider tuning | Small |
| Phase 6: Observability | Small |
| Testing | Medium |

**Total**: ~1-2 sessions

## Files to Modify

- `packages/llm/src/triage.ts` - Add batch functions
- `packages/pipeline/src/stages/digest.ts` - Use batch triage
- `packages/db/src/repos/provider_calls.ts` - Handle batch purpose
- `.env.example` - Add batch config vars
- `docs/llm.md` - Document batch schema

## Open Questions

1. **Optimal batch size**: Start with 15, tune based on real-world content size distribution?
2. **Parallel batches**: Process multiple batches concurrently, or sequential to respect rate limits?
3. **Quality validation**: How to verify batch triage quality matches individual? A/B test?
4. **Retry budget**: How many individual retries before giving up on a batch?

## References

- Current triage implementation: `packages/llm/src/triage.ts`
- Digest triage loop: `packages/pipeline/src/stages/digest.ts:triageCandidates()`
- LLM spec: `docs/llm.md`
- Claude subscription fix: Task 128 predecessor work (this session)
