export interface OptionsFlowSourceConfig {
  /** Filter by specific stock tickers (empty = all) */
  symbols?: string[];
  /** Minimum order premium in USD, default 50000 */
  min_premium?: number;
  /** Flow types to include: sweep, block, unusual */
  flow_types?: ("sweep" | "block" | "unusual")[];
  /** Filter by sentiment: bullish, bearish, or null for all */
  sentiment_filter?: "bullish" | "bearish" | null;
  /** Include ETF options (SPY, QQQ, etc.), default true */
  include_etfs?: boolean;
  /** Max days to expiration, default 90 */
  expiry_max_days?: number;
  /** Max alerts per fetch, default 50, clamped to 1-100 */
  max_alerts_per_fetch?: number;
}

function asUpperStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => (typeof v === "string" ? v.trim().toUpperCase() : null))
    .filter((v) => v !== null && v.length > 0) as string[];
}

function asNumber(value: unknown, defaultValue: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : defaultValue;
}

function asBoolean(value: unknown, defaultValue: boolean): boolean {
  return typeof value === "boolean" ? value : defaultValue;
}

function asFlowTypes(value: unknown): ("sweep" | "block" | "unusual")[] {
  if (!Array.isArray(value)) return [];
  const types: ("sweep" | "block" | "unusual")[] = [];
  for (const v of value) {
    const normalized = typeof v === "string" ? v.trim().toLowerCase() : "";
    if (normalized === "sweep" || normalized === "block" || normalized === "unusual") {
      types.push(normalized);
    }
  }
  return [...new Set(types)];
}

function asSentimentFilter(value: unknown): "bullish" | "bearish" | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "bullish" || normalized === "bearish") {
    return normalized;
  }
  return null;
}

export function parseOptionsFlowSourceConfig(
  config: Record<string, unknown>,
): OptionsFlowSourceConfig {
  const symbols = asUpperStringArray(config.symbols);
  const minPremium = Math.max(
    0,
    Math.floor(asNumber(config.min_premium ?? config.minPremium, 50000)),
  );
  const flowTypes = asFlowTypes(config.flow_types ?? config.flowTypes);
  const sentimentFilter = asSentimentFilter(config.sentiment_filter ?? config.sentimentFilter);
  const includeEtfs = asBoolean(config.include_etfs ?? config.includeEtfs, true);
  const expiryMaxDays = Math.max(
    1,
    Math.floor(asNumber(config.expiry_max_days ?? config.expiryMaxDays, 90)),
  );
  const maxAlerts = Math.max(
    1,
    Math.min(
      100,
      Math.floor(asNumber(config.max_alerts_per_fetch ?? config.maxAlertsPerFetch, 50)),
    ),
  );

  return {
    symbols: symbols.length > 0 ? symbols : undefined,
    min_premium: minPremium,
    flow_types: flowTypes.length > 0 ? flowTypes : undefined,
    sentiment_filter: sentimentFilter,
    include_etfs: includeEtfs,
    expiry_max_days: expiryMaxDays,
    max_alerts_per_fetch: maxAlerts,
  };
}
