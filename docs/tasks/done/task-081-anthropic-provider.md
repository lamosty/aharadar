# ✅ DONE

# Task 081 — `feat(llm): add Anthropic as standard API provider`

- **Owner**: Claude Code Opus 4.5 (implementer)
- **Reviewer**: human
- **Driver**: human (runs commands, merges)

## Goal

Add Anthropic as a standard pay-per-token API provider alongside OpenAI. This enables using Claude models for triage/enrichment via the standard Anthropic API with `ANTHROPIC_API_KEY`.

## Background

Currently AhaRadar only supports OpenAI-compatible endpoints via `packages/llm/src/openai_compat.ts`. Adding Anthropic as a native provider:
- Enables Claude model usage with standard API billing
- Provides foundation for future Claude subscription mode (task 082)
- Offers model diversity for different task types

Note: Claude has NO embedding models - embeddings will always use OpenAI.

## Read first (required)

- `CLAUDE.md`
- `packages/llm/src/router.ts` (current routing)
- `packages/llm/src/types.ts` (LLM types)
- `packages/llm/src/openai_compat.ts` (existing provider pattern)
- `packages/db/src/repos/provider_call_repo.ts` (cost tracking)
- Anthropic SDK docs: https://docs.anthropic.com/en/api/messages

## Scope (allowed files)

- `packages/llm/src/anthropic.ts` (new)
- `packages/llm/src/router.ts` (extend)
- `packages/llm/src/types.ts` (extend if needed)
- `packages/llm/src/pricing.ts` (new or extend)
- `packages/llm/src/index.ts` (exports)
- `packages/llm/package.json` (add dependency)

If anything else seems required, **stop and ask**.

## Implementation steps (ordered)

### 1. Add Anthropic SDK dependency

```bash
cd packages/llm
pnpm add @anthropic-ai/sdk
```

### 2. Create `packages/llm/src/anthropic.ts`

```typescript
import Anthropic from '@anthropic-ai/sdk';
import type { LlmCallResult, LlmRequest, ModelRef } from './types';

export interface AnthropicConfig {
  apiKey: string;
}

export async function callAnthropicApi(
  ref: ModelRef,
  request: LlmRequest,
  config: AnthropicConfig
): Promise<LlmCallResult> {
  const client = new Anthropic({ apiKey: config.apiKey });

  const response = await client.messages.create({
    model: ref.model,
    max_tokens: request.maxOutputTokens ?? 4096,
    temperature: request.temperature ?? 0,
    system: request.system,
    messages: [{ role: 'user', content: request.user }],
  });

  // Extract text content
  const outputText = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');

  return {
    outputText,
    rawResponse: response,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    endpoint: 'https://api.anthropic.com/v1/messages',
  };
}
```

### 3. Create `packages/llm/src/pricing.ts`

```typescript
// Pricing per 1M tokens as of 2025
export interface ModelPricing {
  inputPer1M: number;
  outputPer1M: number;
}

export const ANTHROPIC_PRICING: Record<string, ModelPricing> = {
  'claude-opus-4-5-20251101': { inputPer1M: 15.0, outputPer1M: 75.0 },
  'claude-sonnet-4-5-20251101': { inputPer1M: 3.0, outputPer1M: 15.0 },
  'claude-sonnet-4-20250514': { inputPer1M: 3.0, outputPer1M: 15.0 },
  'claude-haiku-3-5-20241022': { inputPer1M: 0.80, outputPer1M: 4.0 },
  // Aliases
  'claude-opus-4-5': { inputPer1M: 15.0, outputPer1M: 75.0 },
  'claude-sonnet-4-5': { inputPer1M: 3.0, outputPer1M: 15.0 },
  'claude-sonnet-4': { inputPer1M: 3.0, outputPer1M: 15.0 },
  'claude-haiku-3-5': { inputPer1M: 0.80, outputPer1M: 4.0 },
};

export function calculateAnthropicCost(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const pricing = ANTHROPIC_PRICING[model];
  if (!pricing) {
    console.warn(`Unknown Anthropic model for pricing: ${model}, using Sonnet pricing`);
    return calculateAnthropicCost('claude-sonnet-4-5', inputTokens, outputTokens);
  }
  const inputCost = (inputTokens / 1_000_000) * pricing.inputPer1M;
  const outputCost = (outputTokens / 1_000_000) * pricing.outputPer1M;
  return inputCost + outputCost;
}
```

### 4. Update `packages/llm/src/router.ts`

Extend to support both OpenAI and Anthropic providers:

```typescript
import type { BudgetTier } from "@aharadar/shared";
import { callOpenAiCompat } from "./openai_compat";
import { callAnthropicApi } from "./anthropic";
import type { LlmCallResult, LlmRequest, LlmRouter, ModelRef, TaskType } from "./types";

type Provider = 'openai' | 'anthropic';

function resolveProvider(env: NodeJS.ProcessEnv, task: TaskType): Provider {
  // Check for task-specific provider override
  const taskKey = `LLM_${task.toUpperCase()}_PROVIDER`;
  const taskProvider = env[taskKey]?.toLowerCase();
  if (taskProvider === 'anthropic' || taskProvider === 'openai') {
    return taskProvider;
  }

  // Check for global provider preference
  const globalProvider = env.LLM_PROVIDER?.toLowerCase();
  if (globalProvider === 'anthropic' || globalProvider === 'openai') {
    return globalProvider;
  }

  // Default to openai for backward compatibility
  return 'openai';
}

function resolveAnthropicModel(env: NodeJS.ProcessEnv, task: TaskType, tier: BudgetTier): string {
  const tierKey = tier.toUpperCase();
  const byTier = env[`ANTHROPIC_${task.toUpperCase()}_MODEL_${tierKey}`];
  if (byTier?.trim()) return byTier.trim();

  const byTask = env[`ANTHROPIC_${task.toUpperCase()}_MODEL`];
  if (byTask?.trim()) return byTask.trim();

  const fallback = env.ANTHROPIC_MODEL;
  if (fallback?.trim()) return fallback.trim();

  // Sensible defaults by tier
  const defaults: Record<BudgetTier, string> = {
    low: 'claude-haiku-3-5',
    normal: 'claude-sonnet-4-5',
    high: 'claude-sonnet-4-5',
  };
  return defaults[tier];
}

export function createEnvLlmRouter(env: NodeJS.ProcessEnv = process.env): LlmRouter {
  const openaiApiKey = env.OPENAI_API_KEY;
  const anthropicApiKey = env.ANTHROPIC_API_KEY;

  // Validate at least one provider is configured
  if (!openaiApiKey && !anthropicApiKey) {
    throw new Error('Missing required env var: OPENAI_API_KEY or ANTHROPIC_API_KEY');
  }

  return {
    chooseModel(task: TaskType, tier: BudgetTier): ModelRef {
      const provider = resolveProvider(env, task);

      if (provider === 'anthropic') {
        if (!anthropicApiKey) {
          throw new Error('ANTHROPIC_API_KEY required when using Anthropic provider');
        }
        return {
          provider: 'anthropic',
          model: resolveAnthropicModel(env, task, tier),
          endpoint: 'https://api.anthropic.com/v1/messages',
        };
      }

      // OpenAI path (existing logic)
      if (!openaiApiKey) {
        throw new Error('OPENAI_API_KEY required when using OpenAI provider');
      }
      return {
        provider: 'openai',
        model: resolveOpenAiModel(env, task, tier),
        endpoint: resolveOpenAiEndpoint(env),
      };
    },

    async call(task: TaskType, ref: ModelRef, request: LlmRequest): Promise<LlmCallResult> {
      if (ref.provider === 'anthropic') {
        return callAnthropicApi(ref, request, { apiKey: anthropicApiKey! });
      }
      return callOpenAiCompat({
        apiKey: openaiApiKey!,
        endpoint: ref.endpoint,
        model: ref.model,
        request,
      });
    },
  };
}
```

### 5. Update exports in `packages/llm/src/index.ts`

```typescript
export { callAnthropicApi } from './anthropic';
export { calculateAnthropicCost, ANTHROPIC_PRICING } from './pricing';
```

### 6. Add environment variables to `.env.example`

```bash
# Anthropic API (optional - enables Claude models)
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-sonnet-4-5
# Per-task overrides (optional)
ANTHROPIC_TRIAGE_MODEL_LOW=claude-haiku-3-5
ANTHROPIC_TRIAGE_MODEL_NORMAL=claude-sonnet-4-5
ANTHROPIC_TRIAGE_MODEL_HIGH=claude-sonnet-4-5

# Provider selection
LLM_PROVIDER=openai  # or "anthropic"
LLM_TRIAGE_PROVIDER=  # task-specific override
```

## Acceptance criteria

- [ ] `pnpm -r typecheck` passes
- [ ] `pnpm -r build` passes
- [ ] Can run triage with Anthropic API when `ANTHROPIC_API_KEY` is set
- [ ] Token usage tracked correctly in `LlmCallResult`
- [ ] Cost calculation works for Anthropic models
- [ ] Falls back to OpenAI if Anthropic not configured
- [ ] Provider selection works via env vars

## Test plan (copy/paste)

```bash
# 1. Install dependencies
cd packages/llm
pnpm add @anthropic-ai/sdk
pnpm build

# 2. Set up env vars
export ANTHROPIC_API_KEY="sk-ant-..."
export LLM_TRIAGE_PROVIDER=anthropic
export ANTHROPIC_TRIAGE_MODEL_NORMAL=claude-haiku-3-5  # cheap for testing

# 3. Run typecheck
pnpm -r typecheck

# 4. Start services and run pipeline
pnpm dev:services
pnpm dev:cli -- admin:run-now --topic <topic-id>

# 5. Check provider_calls table for Anthropic entries
psql -d aharadar -c "SELECT provider, model, input_tokens, output_tokens FROM provider_calls ORDER BY called_at DESC LIMIT 5;"

# 6. Verify cost tracking
psql -d aharadar -c "SELECT SUM(cost_usd) FROM provider_calls WHERE provider = 'anthropic';"
```

## Notes

- This is standard pay-per-token API usage, not subscription mode
- Claude has NO embedding models - embeddings always use OpenAI
- Task 082 will add subscription mode on top of this foundation
- Consider adding retry logic for rate limits (429 errors)
- Anthropic has different rate limits than OpenAI - may need throttling
