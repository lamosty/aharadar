/**
 * Novelty scoring helpers.
 *
 * Novelty measures how different a candidate is from recent topic history.
 * Computed via embedding similarity against historical items (no LLM calls).
 */

/**
 * Default lookback period for novelty calculation.
 */
export const DEFAULT_NOVELTY_LOOKBACK_DAYS = 30;

/**
 * Parse NOVELTY_LOOKBACK_DAYS from env (default: 30).
 */
export function getNoveltyLookbackDays(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.NOVELTY_LOOKBACK_DAYS;
  if (!raw) return DEFAULT_NOVELTY_LOOKBACK_DAYS;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return DEFAULT_NOVELTY_LOOKBACK_DAYS;
}

/**
 * Clamp a value to [0, 1].
 */
export function clamp01(x: number): number {
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

/**
 * Compute novelty from max similarity.
 *
 * novelty01 = clamp01(1 - maxSimilarity01)
 *
 * A max similarity of 1.0 means identical to history → novelty 0.
 * A max similarity of 0.0 means completely novel → novelty 1.
 */
export function computeNovelty01(maxSimilarity01: number): number {
  return clamp01(1 - maxSimilarity01);
}

/**
 * Novelty feature for explainability and ranking.
 */
export interface NoveltyFeature {
  lookback_days: number;
  max_similarity: number;
  novelty01: number;
}

/**
 * Build a novelty feature object.
 */
export function buildNoveltyFeature(params: { lookbackDays: number; maxSimilarity: number }): NoveltyFeature {
  return {
    lookback_days: params.lookbackDays,
    max_similarity: params.maxSimilarity,
    novelty01: computeNovelty01(params.maxSimilarity),
  };
}
