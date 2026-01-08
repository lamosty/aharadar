export interface PolymarketSourceConfig {
  /** Filter by market categories */
  categories?: string[];
  /** Minimum total volume in USD, default 0 */
  min_volume?: number;
  /** Minimum current liquidity, default 0 */
  min_liquidity?: number;
  /** Only include markets with 24h probability change >= this percentage, default 0 */
  probability_change_threshold?: number;
  /** Include resolved markets, default false */
  include_resolved?: boolean;
  /** Max markets per fetch, default 50, clamped to 1-200 */
  max_markets_per_fetch?: number;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => (typeof v === "string" ? v.trim().toLowerCase() : null))
    .filter((v) => v !== null && v.length > 0) as string[];
}

function asNumber(value: unknown, defaultValue: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : defaultValue;
}

function asBoolean(value: unknown, defaultValue: boolean): boolean {
  return typeof value === "boolean" ? value : defaultValue;
}

export function parsePolymarketSourceConfig(config: Record<string, unknown>): PolymarketSourceConfig {
  const categories = asStringArray(config.categories);
  const minVolume = Math.max(0, Math.floor(asNumber(config.min_volume ?? config.minVolume, 0)));
  const minLiquidity = Math.max(0, Math.floor(asNumber(config.min_liquidity ?? config.minLiquidity, 0)));
  const probabilityChangeThreshold = Math.max(
    0,
    asNumber(config.probability_change_threshold ?? config.probabilityChangeThreshold, 0)
  );
  const includeResolved = asBoolean(config.include_resolved ?? config.includeResolved, false);
  const maxMarkets = Math.max(
    1,
    Math.min(200, Math.floor(asNumber(config.max_markets_per_fetch ?? config.maxMarketsPerFetch, 50)))
  );

  return {
    categories: categories.length > 0 ? categories : undefined,
    min_volume: minVolume,
    min_liquidity: minLiquidity,
    probability_change_threshold: probabilityChangeThreshold,
    include_resolved: includeResolved,
    max_markets_per_fetch: maxMarkets,
  };
}
