export interface PolymarketSourceConfig {
  /** Filter by market categories */
  categories?: string[];
  /** Minimum total volume in USD, default 0 */
  min_volume?: number;
  /** Minimum current liquidity, default 0 */
  min_liquidity?: number;
  /** Minimum 24-hour volume in USD, default 0 */
  min_volume_24h?: number;
  /** Include restricted markets (labeled in UI), default true */
  include_restricted?: boolean;
  /** Include resolved markets, default false */
  include_resolved?: boolean;
  /** Max markets per fetch, default 50, clamped to 1-200 */
  max_markets_per_fetch?: number;

  // Inclusion toggles
  /** Emit markets created within the digest window, default true */
  include_new_markets?: boolean;
  /** Emit markets with significant probability/volume spikes, default true */
  include_spike_markets?: boolean;

  // Spike thresholds
  /** Probability change threshold in percentage points since last fetch, default 10 */
  spike_probability_change_threshold?: number;
  /** Volume change threshold as % change in 24h volume since last fetch, default 100 */
  spike_volume_change_threshold?: number;
  /** Minimum 24h volume required before spike qualifies, default 0 */
  spike_min_volume_24h?: number;
  /** Minimum liquidity required before spike qualifies, default 0 */
  spike_min_liquidity?: number;

  // Backward compatibility (deprecated)
  /** @deprecated Use spike_probability_change_threshold instead */
  probability_change_threshold?: number;
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

export function parsePolymarketSourceConfig(
  config: Record<string, unknown>,
): PolymarketSourceConfig {
  const categories = asStringArray(config.categories);

  // Baseline filters
  const minVolume = Math.max(0, Math.floor(asNumber(config.min_volume ?? config.minVolume, 0)));
  const minLiquidity = Math.max(
    0,
    Math.floor(asNumber(config.min_liquidity ?? config.minLiquidity, 0)),
  );
  const minVolume24h = Math.max(
    0,
    Math.floor(asNumber(config.min_volume_24h ?? config.minVolume24h, 0)),
  );
  const includeRestricted = asBoolean(config.include_restricted ?? config.includeRestricted, true);
  const includeResolved = asBoolean(config.include_resolved ?? config.includeResolved, false);
  const maxMarkets = Math.max(
    1,
    Math.min(
      200,
      Math.floor(asNumber(config.max_markets_per_fetch ?? config.maxMarketsPerFetch, 50)),
    ),
  );

  // Inclusion toggles
  const includeNewMarkets = asBoolean(config.include_new_markets ?? config.includeNewMarkets, true);
  const includeSpikeMarkets = asBoolean(
    config.include_spike_markets ?? config.includeSpikeMarkets,
    true,
  );

  // Spike thresholds - backward compat: probability_change_threshold maps to spike_probability_change_threshold
  const legacyProbChangeThreshold = asNumber(
    config.probability_change_threshold ?? config.probabilityChangeThreshold,
    -1, // sentinel to detect if not set
  );
  const spikeProbabilityChangeThreshold = Math.max(
    0,
    asNumber(
      config.spike_probability_change_threshold ?? config.spikeProbabilityChangeThreshold,
      legacyProbChangeThreshold >= 0 ? legacyProbChangeThreshold : 10,
    ),
  );
  const spikeVolumeChangeThreshold = Math.max(
    0,
    asNumber(config.spike_volume_change_threshold ?? config.spikeVolumeChangeThreshold, 100),
  );
  const spikeMinVolume24h = Math.max(
    0,
    Math.floor(asNumber(config.spike_min_volume_24h ?? config.spikeMinVolume24h, 0)),
  );
  const spikeMinLiquidity = Math.max(
    0,
    Math.floor(asNumber(config.spike_min_liquidity ?? config.spikeMinLiquidity, 0)),
  );

  return {
    categories: categories.length > 0 ? categories : undefined,
    min_volume: minVolume,
    min_liquidity: minLiquidity,
    min_volume_24h: minVolume24h,
    include_restricted: includeRestricted,
    include_resolved: includeResolved,
    max_markets_per_fetch: maxMarkets,
    include_new_markets: includeNewMarkets,
    include_spike_markets: includeSpikeMarkets,
    spike_probability_change_threshold: spikeProbabilityChangeThreshold,
    spike_volume_change_threshold: spikeVolumeChangeThreshold,
    spike_min_volume_24h: spikeMinVolume24h,
    spike_min_liquidity: spikeMinLiquidity,
    // Keep legacy field for reference but spike_probability_change_threshold is the canonical one
    probability_change_threshold:
      legacyProbChangeThreshold >= 0 ? legacyProbChangeThreshold : undefined,
  };
}
