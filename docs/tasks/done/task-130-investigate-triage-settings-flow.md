# Task 130: Investigate Triage Settings Flow

**Status**: DONE
**Priority**: High (blocking triage from working)
**Scope**: `packages/llm`, `packages/pipeline`, `packages/worker`, `packages/api`

## Problem Statement

LLM settings from UI/DB are not being applied to triage calls:

- DB has `reasoning_effort = 'none'`, but API calls show `reasoning: {effort: "medium"}`
- DB has `triage_batch_enabled = false`, but batching was still attempted
- Token limit is 350 despite reasoning being on (should be 2000 for medium)

## Recent Commits (may or may not fix issue)

```
a57b967 fix(llm,pipeline): pass reasoningEffort from llmConfig to triage
53ec2a9 fix(pipeline): respect llmConfig for batch triage settings
2228508 fix(llm): improve batch triage token handling for reasoning models
a2f25af feat(pipeline): integrate batch triage into digest
c53a9c5 feat(llm): add batch triage processing
```

## Investigation Steps

### 1. Trace the full settings flow

```
llm_settings table
  -> db.llmSettings.get()
  -> worker/api loads settings
  -> builds LlmRuntimeConfig
  -> passes to runDigest()
  -> triageCandidates() receives llmConfig
  -> triageBatch/triageCandidate receives reasoningEffortOverride
  -> runTriageOnce/runBatchTriageOnce uses it
  -> router.call() receives reasoningEffort param
  -> openai_compat.ts builds request with reasoning param
```

### 2. Add debug logging

Add temporary logs at each step to trace where values are lost:

```typescript
// In worker
console.log('[DEBUG] llmSettings from DB:', llmSettings);
console.log('[DEBUG] llmConfig built:', llmConfig);

// In digest.ts triageCandidates
console.log('[DEBUG] llmConfig.reasoningEffort:', params.llmConfig?.reasoningEffort);
console.log('[DEBUG] llmConfig.triageBatchEnabled:', params.llmConfig?.triageBatchEnabled);

// In triage.ts
console.log('[DEBUG] reasoningEffortOverride:', params.reasoningEffortOverride);
console.log('[DEBUG] effectiveReasoningEffort:', effectiveReasoningEffort);
console.log('[DEBUG] maxOutputTokens:', maxOutputTokens);
```

### 3. Check specific areas

#### 3a. Worker loading settings
- File: `packages/worker/src/workers/pipeline.worker.ts`
- Does it load `llmSettings.reasoning_effort`?
- Does it map to `llmConfig.reasoningEffort`?

#### 3b. API manual digest endpoint
- File: `packages/api/src/routes/admin.ts` (or wherever manual digest is triggered)
- Does it load llm_settings?
- Does it pass llmConfig to runDigest?

#### 3c. digest.ts receiving llmConfig
- File: `packages/pipeline/src/stages/digest.ts`
- Is `params.llmConfig` actually populated?
- Is `params.llmConfig.reasoningEffort` the expected value?

#### 3d. triage.ts using the override
- File: `packages/llm/src/triage.ts`
- Is `reasoningEffortOverride` being passed?
- Is it being used over env var?

#### 3e. openai_compat.ts sending to API
- File: `packages/llm/src/openai_compat.ts`
- Is `reasoning: { effort: X }` being sent?
- Or is it being omitted and model uses default?

### 4. Key questions

1. **Is llmConfig even being passed to runDigest?**
   - Manual digest via API might not load settings

2. **Is "none" being treated as falsy?**
   - `reasoningEffort === "none"` might evaluate wrongly somewhere

3. **Is the model overriding our setting?**
   - gpt-5-mini might have hardcoded reasoning that can't be disabled

4. **Is there caching?**
   - Old compiled code being used somewhere?

### 5. Test scenarios

After fixing, verify:

1. Set `reasoning_effort = 'none'` in UI
   - API calls should NOT have `reasoning` param (or `effort: "none"`)
   - Token limit should be 350

2. Set `reasoning_effort = 'medium'` in UI
   - API calls should have `reasoning: { effort: "medium" }`
   - Token limit should be 2000

3. Set `triage_batch_enabled = false` in UI
   - Should NOT see `triage_batch` calls, only `triage`

4. Set `triage_batch_enabled = true` in UI
   - Should see `triage_batch` calls

## Files to Check

- `packages/worker/src/workers/pipeline.worker.ts` - Worker loading settings
- `packages/api/src/routes/admin.ts` - API manual digest endpoint
- `packages/pipeline/src/stages/digest.ts` - triageCandidates function
- `packages/llm/src/triage.ts` - triageCandidate, triageBatch functions
- `packages/llm/src/router.ts` - LlmRuntimeConfig handling
- `packages/llm/src/openai_compat.ts` - Building OpenAI request
- `packages/db/src/repos/llm_settings.ts` - DB schema

## DB Settings Query

```sql
SELECT * FROM llm_settings;
```

## Provider Calls Query

```sql
SELECT purpose, provider, model, status,
       meta_json->>'batchId' as batch_id,
       error_json->>'message' as error
FROM provider_calls
WHERE purpose LIKE 'triage%'
ORDER BY started_at DESC
LIMIT 10;
```

## Resolution

**Fixed in commits:**
- `3f7bcfe` - fix(llm,cli): apply db llm settings and honor reasoning=none
- `d754a58` - fix(llm): apply db settings across QA and abtests
- (pending) - fix(llm): map reasoning=none to minimal for unsupported models

**Root cause:** Different OpenAI models support different reasoning_effort values:
- `gpt-5.1`, `gpt-5.2`: support `none`, `minimal`, `low`, `medium`, `high`
- `gpt-5-mini`, `gpt-5`: only support `minimal`, `low`, `medium`, `high` (NOT `none`)

When sending `reasoning: { effort: "none" }` to `gpt-5-mini`, the API returns:
> "Unsupported value: 'none' is not supported with the 'gpt-5-mini' model"

**Fix:** In `openai_compat.ts`, detect model capabilities and map accordingly:
```typescript
function getEffectiveReasoningEffort(model: string, effort: string | undefined): string | undefined {
  if (!effort) return undefined;
  if (effort === "none" && !modelSupportsReasoningNone(model)) {
    // Use "minimal" as the closest to "none" for models that don't support it
    return "minimal";
  }
  return effort;
}
```

Also updated token budget for "none" from 350 to 600 to accommodate "minimal" reasoning overhead.

**Tested successfully (OpenAI provider):**
- `reasoning_effort = 'none'` → maps to `minimal` for gpt-5-mini ✓
- `reasoning_effort = 'low'` → works ✓
- `reasoning_effort = 'medium'` → works ✓
- `reasoning_effort = 'high'` → works ✓

**Other providers - reasoning_effort handling:**
| Provider | Uses reasoning_effort? | Notes |
|----------|----------------------|-------|
| openai (API) | ✅ Yes | Fixed - maps "none" → "minimal" for unsupported models |
| anthropic (API) | ❌ No | Claude uses extended thinking blocks, not reasoning_effort |
| claude-subscription | ❌ No | Uses `enableThinking` flag via system prompt |
| codex-subscription | ❌ No | Uses config file (`~/.codex/config.toml`) for reasoning |

**Sources:**
- [Azure OpenAI reasoning models](https://learn.microsoft.com/en-us/azure/ai-foundry/openai/how-to/reasoning)
- [Vellum - How to use Reasoning Effort](https://www.vellum.ai/llm-parameters/reasoning-effort)
- [GitHub: How to set custom reasoning effort in Codex](https://github.com/openai/codex/issues/2715)
