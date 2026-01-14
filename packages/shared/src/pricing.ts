/**
 * Model pricing data for USD cost calculation.
 * Prices are per 1 million tokens.
 *
 * Last updated: 2026-01 (update periodically as prices change)
 */

// ============================================================================
// xAI Tool Pricing
// ============================================================================

/**
 * xAI charges for server-side tool invocations on top of token costs.
 * Pricing: $5 per 1,000 invocations = $0.005 per call
 * https://docs.x.ai/docs/models
 */
export const XAI_X_SEARCH_COST_PER_CALL = 0.005;

/**
 * Get the x_search tool cost per invocation.
 * Configurable via XAI_X_SEARCH_COST_PER_CALL env var.
 */
export function getXaiXSearchCostPerCall(): number {
  const envValue = process.env.XAI_X_SEARCH_COST_PER_CALL;
  if (envValue) {
    const parsed = Number.parseFloat(envValue);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return XAI_X_SEARCH_COST_PER_CALL;
}

// ============================================================================
// Model Token Pricing
// ============================================================================

export interface ModelPricing {
  provider: string;
  model: string;
  inputPer1MTokens: number; // USD per 1M input tokens
  outputPer1MTokens: number; // USD per 1M output tokens
  effectiveDate?: string; // When this pricing became effective
}

export const MODEL_PRICING: ModelPricing[] = [
  // OpenAI
  { provider: "openai", model: "gpt-4o", inputPer1MTokens: 2.5, outputPer1MTokens: 10.0 },
  {
    provider: "openai",
    model: "gpt-4o-2024-11-20",
    inputPer1MTokens: 2.5,
    outputPer1MTokens: 10.0,
  },
  { provider: "openai", model: "gpt-4o-mini", inputPer1MTokens: 0.15, outputPer1MTokens: 0.6 },
  {
    provider: "openai",
    model: "gpt-4o-mini-2024-07-18",
    inputPer1MTokens: 0.15,
    outputPer1MTokens: 0.6,
  },
  { provider: "openai", model: "gpt-4-turbo", inputPer1MTokens: 10.0, outputPer1MTokens: 30.0 },
  {
    provider: "openai",
    model: "gpt-4-turbo-preview",
    inputPer1MTokens: 10.0,
    outputPer1MTokens: 30.0,
  },
  { provider: "openai", model: "gpt-3.5-turbo", inputPer1MTokens: 0.5, outputPer1MTokens: 1.5 },
  { provider: "openai", model: "o1", inputPer1MTokens: 15.0, outputPer1MTokens: 60.0 },
  { provider: "openai", model: "o1-mini", inputPer1MTokens: 3.0, outputPer1MTokens: 12.0 },
  { provider: "openai", model: "o1-preview", inputPer1MTokens: 15.0, outputPer1MTokens: 60.0 },
  { provider: "openai", model: "o3-mini", inputPer1MTokens: 1.1, outputPer1MTokens: 4.4 },
  {
    provider: "openai",
    model: "text-embedding-3-small",
    inputPer1MTokens: 0.02,
    outputPer1MTokens: 0,
  },
  {
    provider: "openai",
    model: "text-embedding-3-large",
    inputPer1MTokens: 0.13,
    outputPer1MTokens: 0,
  },
  {
    provider: "openai",
    model: "text-embedding-ada-002",
    inputPer1MTokens: 0.1,
    outputPer1MTokens: 0,
  },

  // Anthropic - updated 2026-01
  {
    provider: "anthropic",
    model: "claude-sonnet-4-5",
    inputPer1MTokens: 3.0,
    outputPer1MTokens: 15.0,
  },
  {
    provider: "anthropic",
    model: "claude-sonnet-4-5-20250929",
    inputPer1MTokens: 3.0,
    outputPer1MTokens: 15.0,
  },
  {
    provider: "anthropic",
    model: "claude-sonnet-4-20250514",
    inputPer1MTokens: 3.0,
    outputPer1MTokens: 15.0,
  },
  {
    provider: "anthropic",
    model: "claude-opus-4-5-20251202",
    inputPer1MTokens: 15.0,
    outputPer1MTokens: 75.0,
  },
  {
    provider: "anthropic",
    model: "claude-opus-4-20250514",
    inputPer1MTokens: 15.0,
    outputPer1MTokens: 75.0,
  },
  {
    provider: "anthropic",
    model: "claude-3-5-sonnet-20241022",
    inputPer1MTokens: 3.0,
    outputPer1MTokens: 15.0,
  },
  {
    provider: "anthropic",
    model: "claude-3-5-sonnet-latest",
    inputPer1MTokens: 3.0,
    outputPer1MTokens: 15.0,
  },
  {
    provider: "anthropic",
    model: "claude-3-5-haiku-20241022",
    inputPer1MTokens: 0.8,
    outputPer1MTokens: 4.0,
  },
  {
    provider: "anthropic",
    model: "claude-3-5-haiku-latest",
    inputPer1MTokens: 0.8,
    outputPer1MTokens: 4.0,
  },
  {
    provider: "anthropic",
    model: "claude-3-opus-20240229",
    inputPer1MTokens: 15.0,
    outputPer1MTokens: 75.0,
  },
  {
    provider: "anthropic",
    model: "claude-3-sonnet-20240229",
    inputPer1MTokens: 3.0,
    outputPer1MTokens: 15.0,
  },
  {
    provider: "anthropic",
    model: "claude-3-haiku-20240307",
    inputPer1MTokens: 0.25,
    outputPer1MTokens: 1.25,
  },

  // xAI (Grok) - updated 2026-01
  {
    provider: "xai",
    model: "grok-4-1-fast-non-reasoning",
    inputPer1MTokens: 0.2,
    outputPer1MTokens: 0.5,
  },
  {
    provider: "xai",
    model: "grok-4-1-fast-reasoning",
    inputPer1MTokens: 0.2,
    outputPer1MTokens: 0.5,
  },
  {
    provider: "xai",
    model: "grok-4-fast-non-reasoning",
    inputPer1MTokens: 0.2,
    outputPer1MTokens: 0.5,
  },
  {
    provider: "xai",
    model: "grok-4-fast-reasoning",
    inputPer1MTokens: 0.2,
    outputPer1MTokens: 0.5,
  },
  { provider: "xai", model: "grok-code-fast-1", inputPer1MTokens: 0.2, outputPer1MTokens: 1.5 },
  { provider: "xai", model: "grok-4-0709", inputPer1MTokens: 3.0, outputPer1MTokens: 15.0 },
  { provider: "xai", model: "grok-3-mini", inputPer1MTokens: 0.3, outputPer1MTokens: 0.5 },
  { provider: "xai", model: "grok-3", inputPer1MTokens: 3.0, outputPer1MTokens: 15.0 },
  { provider: "xai", model: "grok-2-vision-1212", inputPer1MTokens: 2.0, outputPer1MTokens: 10.0 },
  { provider: "xai", model: "grok-2-1212", inputPer1MTokens: 2.0, outputPer1MTokens: 10.0 },
  { provider: "xai", model: "grok-beta", inputPer1MTokens: 5.0, outputPer1MTokens: 15.0 },
  // -latest aliases (resolve to same pricing as base models)
  { provider: "xai", model: "grok-4-latest", inputPer1MTokens: 3.0, outputPer1MTokens: 15.0 },
  {
    provider: "xai",
    model: "grok-4-1-fast-non-reasoning-latest",
    inputPer1MTokens: 0.2,
    outputPer1MTokens: 0.5,
  },
  {
    provider: "xai",
    model: "grok-4-1-fast-reasoning-latest",
    inputPer1MTokens: 0.2,
    outputPer1MTokens: 0.5,
  },

  // Google (for future use)
  { provider: "google", model: "gemini-1.5-pro", inputPer1MTokens: 1.25, outputPer1MTokens: 5.0 },
  {
    provider: "google",
    model: "gemini-1.5-flash",
    inputPer1MTokens: 0.075,
    outputPer1MTokens: 0.3,
  },
  {
    provider: "google",
    model: "gemini-2.0-flash-exp",
    inputPer1MTokens: 0.075,
    outputPer1MTokens: 0.3,
  },
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
  return pricingIndex.get(`${provider}:${model}`) ?? null;
}

/**
 * Calculate USD cost for a provider call.
 * Returns 0 if pricing not found (logs warning).
 */
export function calculateCostUsd(
  provider: string,
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const pricing = getModelPricing(provider, model);

  if (!pricing) {
    // Don't warn for every unknown model - caller should handle
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
  return [...new Set(MODEL_PRICING.map((p) => p.provider))];
}

/**
 * List all models for a provider.
 */
export function getModelsForProvider(provider: string): string[] {
  return MODEL_PRICING.filter((p) => p.provider === provider).map((p) => p.model);
}
