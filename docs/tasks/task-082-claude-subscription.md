# Task 082 — `feat(llm): Claude subscription mode with enhanced triage (experimental)`

- **Owner**: Claude Code Opus 4.5 (implementer)
- **Reviewer**: human
- **Driver**: human (runs commands, merges)

## Goal

Add Claude subscription mode for LLM calls using the Claude Agent SDK, enabling:
1. Use of Claude Max subscription instead of API billing
2. Extended thinking for improved triage quality
3. WebSearch/WebFetch tools for enhanced context on ambiguous items

**EXPERIMENTAL** - For personal use only, not SaaS production.

## Dependencies

- **Task 081a MUST be completed first** - Confirms subscription auth is feasible
- **Task 081** - Provides Anthropic API provider as fallback

## Background

User has Claude Max subscription ($100/month) that is underutilized. The Claude Agent SDK can potentially use subscription credentials for API calls, avoiding per-token billing. This task adds:
- Subscription mode as highest-priority provider option
- Extended thinking for deeper analysis
- Tool use for web research on ambiguous items
- Quota protection to prevent subscription exhaustion

Note: Claude has NO embedding models - embeddings will always use OpenAI.

## Read first (required)

- `CLAUDE.md`
- `docs/claude-integration.md` (from task 081a - must exist)
- `packages/llm/src/router.ts`
- `packages/llm/src/anthropic.ts` (from task 081)
- `packages/pipeline/src/stages/triage.ts`
- Claude Agent SDK documentation

## Scope (allowed files)

- `packages/llm/src/claude_subscription.ts` (new)
- `packages/llm/src/router.ts` (extend)
- `packages/llm/src/usage_tracker.ts` (new)
- `packages/llm/src/index.ts` (exports)
- `packages/pipeline/src/stages/triage.ts` (integrate enhanced mode)

If anything else seems required, **stop and ask**.

## Implementation steps (ordered)

### Part 1: Basic Subscription Mode

#### 1.1 Create `packages/llm/src/claude_subscription.ts`

```typescript
import { query, type QueryOptions } from '@anthropic-ai/claude-agent-sdk';
import type { LlmCallResult, LlmRequest, ModelRef } from './types';

export interface ClaudeSubscriptionConfig {
  enableThinking?: boolean;
  thinkingBudget?: number;
  enabledTools?: ('WebSearch' | 'WebFetch')[];
  maxSearchesPerCall?: number;
}

const DEFAULT_CONFIG: ClaudeSubscriptionConfig = {
  enableThinking: false,
  thinkingBudget: 5000,
  enabledTools: [],
  maxSearchesPerCall: 2,
};

export async function callClaudeSubscription(
  ref: ModelRef,
  request: LlmRequest,
  config: ClaudeSubscriptionConfig = {}
): Promise<LlmCallResult> {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };

  const options: QueryOptions = {
    model: ref.model,
    maxTokens: request.maxOutputTokens ?? 4096,
    systemPrompt: request.system,
  };

  // Add extended thinking if enabled
  if (mergedConfig.enableThinking) {
    options.thinking = {
      type: 'enabled',
      budgetTokens: mergedConfig.thinkingBudget,
    };
  }

  // Add tools if enabled
  if (mergedConfig.enabledTools && mergedConfig.enabledTools.length > 0) {
    options.tools = mergedConfig.enabledTools.map((tool) => ({
      name: tool,
      // Tool definitions from Claude Agent SDK
    }));
  }

  const result = await query({
    prompt: request.user,
    options,
  });

  // Extract response and usage
  // Note: Actual API shape depends on SDK - adjust as needed
  return {
    outputText: extractOutputText(result),
    rawResponse: result,
    inputTokens: result.usage?.inputTokens ?? 0,
    outputTokens: result.usage?.outputTokens ?? 0,
    endpoint: 'claude-subscription',
  };
}

function extractOutputText(result: unknown): string {
  // Implementation depends on SDK response shape
  if (typeof result === 'string') return result;
  if (result && typeof result === 'object' && 'text' in result) {
    return String((result as { text: unknown }).text);
  }
  return JSON.stringify(result);
}
```

#### 1.2 Create `packages/llm/src/usage_tracker.ts`

```typescript
export interface ClaudeUsageLimits {
  callsPerHour: number;
  searchesPerHour: number;
  thinkingTokensPerHour: number;
}

export interface ClaudeUsageState {
  callsThisHour: number;
  searchesThisHour: number;
  thinkingTokensThisHour: number;
  lastResetAt: Date;
}

const DEFAULT_LIMITS: ClaudeUsageLimits = {
  callsPerHour: 100,
  searchesPerHour: 20,
  thinkingTokensPerHour: 50000,
};

// In-memory tracker (consider Redis for multi-process)
let usageState: ClaudeUsageState = {
  callsThisHour: 0,
  searchesThisHour: 0,
  thinkingTokensThisHour: 0,
  lastResetAt: new Date(),
};

function maybeResetHour(): void {
  const now = new Date();
  const hoursSinceReset =
    (now.getTime() - usageState.lastResetAt.getTime()) / (1000 * 60 * 60);

  if (hoursSinceReset >= 1) {
    usageState = {
      callsThisHour: 0,
      searchesThisHour: 0,
      thinkingTokensThisHour: 0,
      lastResetAt: now,
    };
  }
}

export function canUseClaudeSubscription(limits = DEFAULT_LIMITS): boolean {
  maybeResetHour();
  return usageState.callsThisHour < limits.callsPerHour;
}

export function canUseWebSearch(limits = DEFAULT_LIMITS): boolean {
  maybeResetHour();
  return usageState.searchesThisHour < limits.searchesPerHour;
}

export function canUseThinking(budgetTokens: number, limits = DEFAULT_LIMITS): boolean {
  maybeResetHour();
  return (
    usageState.thinkingTokensThisHour + budgetTokens <= limits.thinkingTokensPerHour
  );
}

export function recordUsage(opts: {
  calls?: number;
  searches?: number;
  thinkingTokens?: number;
}): void {
  maybeResetHour();
  usageState.callsThisHour += opts.calls ?? 0;
  usageState.searchesThisHour += opts.searches ?? 0;
  usageState.thinkingTokensThisHour += opts.thinkingTokens ?? 0;
}

export function getUsageState(): Readonly<ClaudeUsageState> {
  maybeResetHour();
  return { ...usageState };
}
```

#### 1.3 Update router priority in `packages/llm/src/router.ts`

```typescript
type Provider = 'claude-subscription' | 'anthropic' | 'openai';

function resolveProvider(env: NodeJS.ProcessEnv, task: TaskType): Provider {
  // Check if subscription mode is enabled and available
  if (env.CLAUDE_USE_SUBSCRIPTION === 'true') {
    if (canUseClaudeSubscription()) {
      return 'claude-subscription';
    }
    console.warn('Claude subscription quota exceeded, falling back to API');
  }

  // Check for task-specific provider override
  const taskKey = `LLM_${task.toUpperCase()}_PROVIDER`;
  const taskProvider = env[taskKey]?.toLowerCase();
  if (taskProvider === 'anthropic' || taskProvider === 'openai') {
    return taskProvider;
  }

  // Check for global provider preference (anthropic > openai if key available)
  if (env.ANTHROPIC_API_KEY) {
    return 'anthropic';
  }

  return 'openai';
}
```

### Part 2: Enhanced Triage with Tools

#### 2.1 Add enhanced triage logic

Create enhanced triage wrapper that uses WebSearch for ambiguous items:

```typescript
// In packages/llm/src/claude_subscription.ts

export interface EnhancedTriageConfig {
  enableEnhanced: boolean;
  minScoreForEnhancement: number;  // e.g., 40
  maxScoreForEnhancement: number;  // e.g., 60
  sourceTypesAllowed: string[];    // e.g., ['x_posts', 'signal']
}

export async function enhancedTriage(
  ref: ModelRef,
  request: LlmRequest,
  triageScore: number,
  sourceType: string,
  config: EnhancedTriageConfig
): Promise<LlmCallResult> {
  // Only enhance if score is ambiguous and source type qualifies
  const shouldEnhance =
    config.enableEnhanced &&
    triageScore >= config.minScoreForEnhancement &&
    triageScore <= config.maxScoreForEnhancement &&
    config.sourceTypesAllowed.includes(sourceType) &&
    canUseWebSearch();

  if (!shouldEnhance) {
    // Regular triage without enhancement
    return callClaudeSubscription(ref, request, {
      enableThinking: true,
      thinkingBudget: 3000,
    });
  }

  // Enhanced triage with web search
  const enhancedPrompt = `${request.user}

IMPORTANT: This item has an ambiguous relevance score. Use WebSearch to gather additional context about the topic, author, or related developments. Then provide a more informed assessment.`;

  const result = await callClaudeSubscription(
    ref,
    { ...request, user: enhancedPrompt },
    {
      enableThinking: true,
      thinkingBudget: 5000,
      enabledTools: ['WebSearch', 'WebFetch'],
      maxSearchesPerCall: 2,
    }
  );

  recordUsage({ searches: 1 });
  return result;
}
```

### Part 3: Environment Configuration

Add these env vars to `.env.example`:

```bash
# Claude Subscription Mode (experimental)
CLAUDE_USE_SUBSCRIPTION=false          # Enable subscription mode
CLAUDE_TRIAGE_THINKING=true            # Enable extended thinking
CLAUDE_TRIAGE_THINKING_BUDGET=5000     # Tokens for thinking

# Enhanced Triage (experimental)
CLAUDE_ENHANCED_TRIAGE=false           # Enable web search for ambiguous items
CLAUDE_ENHANCED_TOOLS=WebSearch,WebFetch
CLAUDE_MAX_SEARCHES_PER_ITEM=2
CLAUDE_ENHANCED_MIN_SCORE=40           # Min score to trigger enhancement
CLAUDE_ENHANCED_MAX_SCORE=60           # Max score to trigger enhancement
CLAUDE_ENHANCED_SOURCE_TYPES=x_posts,signal

# Quota Protection
CLAUDE_CALLS_PER_HOUR=100
CLAUDE_SEARCHES_PER_HOUR=20
CLAUDE_THINKING_TOKENS_PER_HOUR=50000
```

### Part 4: Integration with Triage Stage

Update `packages/pipeline/src/stages/triage.ts` to use enhanced mode when available:

```typescript
import {
  callClaudeSubscription,
  enhancedTriage,
  EnhancedTriageConfig,
} from '@aharadar/llm';

// In triage function, after initial scoring:
if (shouldUseEnhancedTriage(item, initialScore, env)) {
  const config: EnhancedTriageConfig = {
    enableEnhanced: env.CLAUDE_ENHANCED_TRIAGE === 'true',
    minScoreForEnhancement: parseInt(env.CLAUDE_ENHANCED_MIN_SCORE ?? '40'),
    maxScoreForEnhancement: parseInt(env.CLAUDE_ENHANCED_MAX_SCORE ?? '60'),
    sourceTypesAllowed: (env.CLAUDE_ENHANCED_SOURCE_TYPES ?? '').split(','),
  };

  result = await enhancedTriage(ref, request, initialScore, item.sourceType, config);
}
```

## Acceptance criteria

- [ ] `pnpm -r typecheck` passes
- [ ] `pnpm -r build` passes
- [ ] Basic subscription mode works for triage calls
- [ ] Extended thinking can be enabled via env var
- [ ] Enhanced mode triggers web search for ambiguous items (40-60 score)
- [ ] Quota protection prevents excessive usage
- [ ] Graceful fallback to Anthropic API when quota exceeded
- [ ] Graceful fallback to OpenAI if Anthropic unavailable
- [ ] All subscription usage logged for monitoring

## Test plan (copy/paste)

```bash
# Prerequisites:
# - Task 081a completed and Go decision made
# - Task 081 completed (Anthropic API provider)
# - Claude CLI logged in: `claude login`

# 1. Build
pnpm -r build
pnpm -r typecheck

# 2. Enable subscription mode
export CLAUDE_USE_SUBSCRIPTION=true
export CLAUDE_TRIAGE_THINKING=true

# 3. Start services
pnpm dev:services

# 4. Run pipeline with a topic
pnpm dev:cli -- admin:run-now --topic <topic-id>

# 5. Check logs for subscription usage
grep "claude-subscription" logs/*.log

# 6. Test quota protection (run many times)
for i in {1..50}; do
  pnpm dev:cli -- admin:run-now --topic <topic-id> --limit 5
done
# Should see fallback messages after quota exhaustion

# 7. Test enhanced triage
export CLAUDE_ENHANCED_TRIAGE=true
export CLAUDE_ENHANCED_SOURCE_TYPES=x_posts
pnpm dev:cli -- admin:run-now --topic <topic-id>
# Check for web search usage in ambiguous items

# 8. Monitor usage
curl http://localhost:3001/api/admin/claude-usage  # if endpoint added
```

## Monitoring

Add logging for subscription usage:

```typescript
console.log('[claude-subscription] Call made', {
  model: ref.model,
  thinkingEnabled: config.enableThinking,
  toolsUsed: config.enabledTools,
  quotaRemaining: {
    calls: limits.callsPerHour - state.callsThisHour,
    searches: limits.searchesPerHour - state.searchesThisHour,
  },
});
```

Consider adding an admin endpoint to view current usage:

```typescript
// GET /api/admin/claude-usage
{
  "hourlyUsage": {
    "calls": 45,
    "searches": 8,
    "thinkingTokens": 25000
  },
  "limits": {
    "callsPerHour": 100,
    "searchesPerHour": 20,
    "thinkingTokensPerHour": 50000
  },
  "resetAt": "2025-01-08T15:00:00Z"
}
```

## Notes

- **EXPERIMENTAL** - For personal use only, not SaaS production
- Claude has NO embedding models - always use OpenAI for embeddings
- Subscription mode bypasses normal cost tracking (no per-token billing)
- Web search results may include unreliable sources - triage prompt should note this
- Extended thinking adds latency but improves quality for complex items
- Consider using Redis for usage tracking if running multiple processes
- Monitor subscription usage in Anthropic dashboard to avoid overages
- If subscription auth breaks, the system should gracefully fall back to API

## Future enhancements

- Persist usage stats to database for historical analysis
- Add circuit breaker for repeated auth failures
- Implement exponential backoff for rate limits
- Add A/B testing: subscription vs API quality comparison
- WebFetch for full article context on high-value items
