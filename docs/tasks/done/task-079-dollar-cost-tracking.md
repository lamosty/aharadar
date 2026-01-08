# ✅ DONE

# Task 079 — `feat(shared,db,pipeline): real USD cost tracking for LLM calls`

- **Owner**: Claude Code Opus 4.5 (implementer)
- **Reviewer**: human
- **Driver**: human (runs commands, merges)

## Goal

Track real USD costs for LLM provider calls instead of abstract credits. This enables accurate billing visibility, budget enforcement based on actual spend, and cost optimization decisions.

## Background

Currently:
- `provider_calls` table tracks usage with `cost_estimate_credits` (abstract units)
- No direct mapping to actual USD costs
- Users cannot see real spend in dollars
- Hard to compare costs across providers/models

Desired:
- Store USD cost per LLM call at call time
- Maintain a pricing table for all supported models
- Query aggregated costs by period, provider, model
- Support for future billing/budget features

## Read first (required)

- `CLAUDE.md`
- `docs/data-model.md`
- `packages/db/migrations/` (existing patterns)
- `packages/llm/src/` (LLM call patterns)

## Scope (allowed files)

- `packages/shared/src/pricing.ts` (new)
- `packages/db/migrations/0009_cost_usd_column.sql` (new)
- `packages/db/src/repos/provider_calls.ts` (extend)
- `packages/llm/src/` (update call sites to calculate/store cost)
- `packages/shared/src/types/` (if new types needed)

If anything else seems required, **stop and ask**.

## Implementation steps (ordered)

### 1. Create the pricing module

File: `packages/shared/src/pricing.ts`

```typescript
/**
 * Model pricing data for USD cost calculation.
 * Prices are per 1 million tokens.
 *
 * Last updated: 2025-01 (update periodically as prices change)
 */

export interface ModelPricing {
  provider: string;
  model: string;
  inputPer1MTokens: number;   // USD per 1M input tokens
  outputPer1MTokens: number;  // USD per 1M output tokens
  effectiveDate?: string;     // When this pricing became effective
}

export const MODEL_PRICING: ModelPricing[] = [
  // OpenAI
  { provider: 'openai', model: 'gpt-4o', inputPer1MTokens: 2.50, outputPer1MTokens: 10.00 },
  { provider: 'openai', model: 'gpt-4o-2024-11-20', inputPer1MTokens: 2.50, outputPer1MTokens: 10.00 },
  { provider: 'openai', model: 'gpt-4o-mini', inputPer1MTokens: 0.15, outputPer1MTokens: 0.60 },
  { provider: 'openai', model: 'gpt-4o-mini-2024-07-18', inputPer1MTokens: 0.15, outputPer1MTokens: 0.60 },
  { provider: 'openai', model: 'gpt-4-turbo', inputPer1MTokens: 10.00, outputPer1MTokens: 30.00 },
  { provider: 'openai', model: 'gpt-4-turbo-preview', inputPer1MTokens: 10.00, outputPer1MTokens: 30.00 },
  { provider: 'openai', model: 'gpt-3.5-turbo', inputPer1MTokens: 0.50, outputPer1MTokens: 1.50 },
  { provider: 'openai', model: 'text-embedding-3-small', inputPer1MTokens: 0.02, outputPer1MTokens: 0 },
  { provider: 'openai', model: 'text-embedding-3-large', inputPer1MTokens: 0.13, outputPer1MTokens: 0 },
  { provider: 'openai', model: 'text-embedding-ada-002', inputPer1MTokens: 0.10, outputPer1MTokens: 0 },

  // Anthropic
  { provider: 'anthropic', model: 'claude-3-5-sonnet-20241022', inputPer1MTokens: 3.00, outputPer1MTokens: 15.00 },
  { provider: 'anthropic', model: 'claude-3-5-sonnet-latest', inputPer1MTokens: 3.00, outputPer1MTokens: 15.00 },
  { provider: 'anthropic', model: 'claude-3-5-haiku-20241022', inputPer1MTokens: 0.80, outputPer1MTokens: 4.00 },
  { provider: 'anthropic', model: 'claude-3-5-haiku-latest', inputPer1MTokens: 0.80, outputPer1MTokens: 4.00 },
  { provider: 'anthropic', model: 'claude-3-opus-20240229', inputPer1MTokens: 15.00, outputPer1MTokens: 75.00 },
  { provider: 'anthropic', model: 'claude-3-sonnet-20240229', inputPer1MTokens: 3.00, outputPer1MTokens: 15.00 },
  { provider: 'anthropic', model: 'claude-3-haiku-20240307', inputPer1MTokens: 0.25, outputPer1MTokens: 1.25 },

  // xAI (Grok)
  { provider: 'xai', model: 'grok-beta', inputPer1MTokens: 5.00, outputPer1MTokens: 15.00 },
  { provider: 'xai', model: 'grok-2-1212', inputPer1MTokens: 2.00, outputPer1MTokens: 10.00 },
  { provider: 'xai', model: 'grok-2-vision-1212', inputPer1MTokens: 2.00, outputPer1MTokens: 10.00 },

  // Google (for future use)
  { provider: 'google', model: 'gemini-1.5-pro', inputPer1MTokens: 1.25, outputPer1MTokens: 5.00 },
  { provider: 'google', model: 'gemini-1.5-flash', inputPer1MTokens: 0.075, outputPer1MTokens: 0.30 },
  { provider: 'google', model: 'gemini-2.0-flash-exp', inputPer1MTokens: 0.075, outputPer1MTokens: 0.30 },
];

// Index for fast lookup
const pricingIndex = new Map<string, ModelPricing>();
for (const pricing of MODEL_PRICING) {
  pricingIndex.set(`${pricing.provider}:${pricing.model}`, pricing);
}

/**
 * Get pricing for a specific provider/model combination.
 * Returns null if pricing not found (unknown model).
 */
export function getModelPricing(provider: string, model: string): ModelPricing | null {
  return pricingIndex.get(`${provider}:${model}`) || null;
}

/**
 * Calculate USD cost for a provider call.
 * Returns 0 if pricing not found (logs warning).
 */
export function calculateCostUsd(
  provider: string,
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const pricing = getModelPricing(provider, model);

  if (!pricing) {
    console.warn(`No pricing found for ${provider}:${model}, cost will be 0`);
    return 0;
  }

  const inputCost = (inputTokens / 1_000_000) * pricing.inputPer1MTokens;
  const outputCost = (outputTokens / 1_000_000) * pricing.outputPer1MTokens;

  return inputCost + outputCost;
}

/**
 * Format USD amount for display.
 */
export function formatUsd(amount: number): string {
  if (amount < 0.01) {
    return `$${amount.toFixed(6)}`;
  }
  if (amount < 1) {
    return `$${amount.toFixed(4)}`;
  }
  return `$${amount.toFixed(2)}`;
}

/**
 * List all supported providers.
 */
export function getSupportedProviders(): string[] {
  return [...new Set(MODEL_PRICING.map(p => p.provider))];
}

/**
 * List all models for a provider.
 */
export function getModelsForProvider(provider: string): string[] {
  return MODEL_PRICING
    .filter(p => p.provider === provider)
    .map(p => p.model);
}
```

### 2. Add USD column to provider_calls

File: `packages/db/migrations/0009_cost_usd_column.sql`

```sql
-- Add USD cost tracking to provider_calls
-- Stores actual dollar cost calculated at call time

ALTER TABLE provider_calls
ADD COLUMN cost_estimate_usd NUMERIC(12,6) NOT NULL DEFAULT 0;

COMMENT ON COLUMN provider_calls.cost_estimate_usd IS 'Estimated USD cost based on token counts and model pricing at call time';

-- Index for cost aggregation queries
CREATE INDEX provider_calls_user_cost_idx ON provider_calls(user_id, started_at DESC, cost_estimate_usd);
```

### 3. Extend provider_calls repository

File: `packages/db/src/repos/provider_calls.ts` (add these methods)

```typescript
export interface UsageSummary {
  totalUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  callCount: number;
}

export interface UsageByProvider {
  provider: string;
  totalUsd: number;
  callCount: number;
}

export interface UsageByModel {
  provider: string;
  model: string;
  totalUsd: number;
  inputTokens: number;
  outputTokens: number;
  callCount: number;
}

export interface DailyUsage {
  date: string;  // YYYY-MM-DD
  totalUsd: number;
  callCount: number;
}

// Add to existing repo:

async getUsageByPeriod(
  userId: string,
  startDate: Date,
  endDate: Date
): Promise<{
  summary: UsageSummary;
  byProvider: UsageByProvider[];
  byModel: UsageByModel[];
}> {
  // Summary
  const summaryResult = await pool.query<UsageSummary>(
    `SELECT
       COALESCE(SUM(cost_estimate_usd), 0)::float as "totalUsd",
       COALESCE(SUM(input_tokens), 0) as "totalInputTokens",
       COALESCE(SUM(output_tokens), 0) as "totalOutputTokens",
       COUNT(*) as "callCount"
     FROM provider_calls
     WHERE user_id = $1 AND started_at >= $2 AND started_at < $3`,
    [userId, startDate, endDate]
  );

  // By provider
  const providerResult = await pool.query<UsageByProvider>(
    `SELECT
       provider,
       COALESCE(SUM(cost_estimate_usd), 0)::float as "totalUsd",
       COUNT(*) as "callCount"
     FROM provider_calls
     WHERE user_id = $1 AND started_at >= $2 AND started_at < $3
     GROUP BY provider
     ORDER BY "totalUsd" DESC`,
    [userId, startDate, endDate]
  );

  // By model
  const modelResult = await pool.query<UsageByModel>(
    `SELECT
       provider,
       model,
       COALESCE(SUM(cost_estimate_usd), 0)::float as "totalUsd",
       COALESCE(SUM(input_tokens), 0) as "inputTokens",
       COALESCE(SUM(output_tokens), 0) as "outputTokens",
       COUNT(*) as "callCount"
     FROM provider_calls
     WHERE user_id = $1 AND started_at >= $2 AND started_at < $3
     GROUP BY provider, model
     ORDER BY "totalUsd" DESC`,
    [userId, startDate, endDate]
  );

  return {
    summary: summaryResult.rows[0],
    byProvider: providerResult.rows,
    byModel: modelResult.rows,
  };
}

async getMonthlyUsage(userId: string): Promise<{
  summary: UsageSummary;
  byProvider: UsageByProvider[];
  byModel: UsageByModel[];
}> {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  return this.getUsageByPeriod(userId, startOfMonth, startOfNextMonth);
}

async getDailyUsage(
  userId: string,
  startDate: Date,
  endDate: Date
): Promise<DailyUsage[]> {
  const result = await pool.query<DailyUsage>(
    `SELECT
       DATE(started_at) as date,
       COALESCE(SUM(cost_estimate_usd), 0)::float as "totalUsd",
       COUNT(*) as "callCount"
     FROM provider_calls
     WHERE user_id = $1 AND started_at >= $2 AND started_at < $3
     GROUP BY DATE(started_at)
     ORDER BY date`,
    [userId, startDate, endDate]
  );
  return result.rows;
}
```

### 4. Update LLM call sites

Modify all places that create provider_calls records to include USD cost:

```typescript
import { calculateCostUsd } from '@aharadar/shared/pricing';

// When logging a provider call:
const costUsd = calculateCostUsd(provider, model, inputTokens, outputTokens);

await providerCallsRepo.create({
  userId,
  purpose,
  provider,
  model,
  inputTokens,
  outputTokens,
  costEstimateCredits,  // Keep for backward compat
  costEstimateUsd: costUsd,  // New field
  status,
  // ... other fields
});
```

## Acceptance criteria

- [ ] `pnpm migrate` runs successfully with new migration
- [ ] `pnpm -r typecheck` passes
- [ ] `pnpm -r build` passes
- [ ] `calculateCostUsd` returns correct values for known models
- [ ] `calculateCostUsd` returns 0 and logs warning for unknown models
- [ ] New LLM calls have `cost_estimate_usd` populated
- [ ] Can query usage by period with USD totals
- [ ] Can query monthly usage
- [ ] Can query daily usage for charts
- [ ] Aggregations return correct sums

## Test plan (copy/paste)

```bash
pnpm dev:services
pnpm migrate
pnpm build

# Verify migration
psql $DATABASE_URL -c "\d provider_calls" | grep cost_estimate_usd

# Test pricing calculations
node -e "
const { calculateCostUsd, formatUsd } = require('./packages/shared/dist/pricing');
console.log('GPT-4o 1k in, 500 out:', formatUsd(calculateCostUsd('openai', 'gpt-4o', 1000, 500)));
console.log('Claude Haiku 10k in, 1k out:', formatUsd(calculateCostUsd('anthropic', 'claude-3-haiku-20240307', 10000, 1000)));
"

# Run pipeline and verify costs are stored
pnpm dev:api
pnpm dev:cli -- admin:run-now --topic <topic-id>

# Check stored costs
psql $DATABASE_URL -c "SELECT provider, model, cost_estimate_usd FROM provider_calls ORDER BY started_at DESC LIMIT 5;"
```

## Notes

- Pricing data needs periodic updates as providers change prices
- Consider adding a `pricing_version` or `pricing_date` to track which prices were used
- For batch/cached pricing calls, some providers offer discounts (not modeled here)
- The `cost_estimate_credits` column is kept for backward compatibility but can be deprecated
- Future: could add alerts when daily/monthly spend exceeds thresholds
