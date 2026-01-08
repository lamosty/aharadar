/**
 * LLM cost estimation utilities.
 *
 * Calculates credits based on provider rates from environment variables.
 * Follows same pattern as embeddings.ts for consistency.
 */

function parseFloatEnv(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export interface LlmCostParams {
  provider: string;
  inputTokens: number;
  outputTokens: number;
}

/**
 * Estimate credits for an LLM call based on provider rates.
 *
 * Env vars checked (in order of preference):
 * - {PROVIDER}_CREDITS_PER_1K_INPUT_TOKENS (e.g., ANTHROPIC_CREDITS_PER_1K_INPUT_TOKENS)
 * - {PROVIDER}_CREDITS_PER_1K_OUTPUT_TOKENS
 * - LLM_CREDITS_PER_1K_INPUT_TOKENS (fallback for any provider)
 * - LLM_CREDITS_PER_1K_OUTPUT_TOKENS (fallback for any provider)
 *
 * If no rates configured, returns 0 (cost tracking disabled).
 */
export function estimateLlmCredits(
  params: LlmCostParams,
  env: NodeJS.ProcessEnv = process.env
): number {
  const { provider, inputTokens, outputTokens } = params;
  const providerUpper = provider.toUpperCase().replace(/-/g, "_");

  // Try provider-specific rates first
  const inputRate =
    parseFloatEnv(env[`${providerUpper}_CREDITS_PER_1K_INPUT_TOKENS`]) ??
    parseFloatEnv(env.LLM_CREDITS_PER_1K_INPUT_TOKENS) ??
    0;

  const outputRate =
    parseFloatEnv(env[`${providerUpper}_CREDITS_PER_1K_OUTPUT_TOKENS`]) ??
    parseFloatEnv(env.LLM_CREDITS_PER_1K_OUTPUT_TOKENS) ??
    0;

  const inputCredits = (inputTokens / 1000) * inputRate;
  const outputCredits = (outputTokens / 1000) * outputRate;
  const total = inputCredits + outputCredits;

  return Number.isFinite(total) ? total : 0;
}

/**
 * Estimate the cost of a Q&A call before making it.
 * Used for pre-flight budget checks.
 *
 * This provides a rough upper-bound estimate based on:
 * - Estimated input tokens (question + context)
 * - Max output tokens (worst case)
 */
export function estimateQaCost(params: {
  provider: string;
  estimatedInputTokens: number;
  maxOutputTokens: number;
  env?: NodeJS.ProcessEnv;
}): number {
  return estimateLlmCredits(
    {
      provider: params.provider,
      inputTokens: params.estimatedInputTokens,
      outputTokens: params.maxOutputTokens,
    },
    params.env ?? process.env
  );
}
