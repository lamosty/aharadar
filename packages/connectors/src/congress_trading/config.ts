export type CongressTradingVendor = "stock_watcher" | "quiver";

export interface CongressTradingSourceConfig {
  /**
   * Data vendor for Congress trading disclosures.
   *
   * - `stock_watcher` (default): Free, no-auth JSON feeds derived from public disclosures.
   * - `quiver`: Quiver Quantitative API (requires a paid subscription + `QUIVER_API_KEY`).
   */
  vendor?: CongressTradingVendor;
  /** Filter by specific politicians (case-insensitive partial match) */
  politicians?: string[];
  /** Filter by chamber: "senate", "house", or both (default: both) */
  chambers?: ("senate" | "house")[];
  /** Minimum transaction amount (lower bound of range), default 0 */
  min_amount?: number;
  /** Filter by transaction type: "purchase", "sale", or both (default: both) */
  transaction_types?: ("purchase" | "sale")[];
  /** Filter by specific stock tickers */
  tickers?: string[];
  /** Max trades per fetch, default 50, clamped to 1-100 */
  max_trades_per_fetch?: number;
}

function _asString(value: unknown): string {
  if (typeof value === "string") return value.trim();
  return "";
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => (typeof v === "string" ? v.trim() : null))
    .filter((v) => v !== null && v.length > 0) as string[];
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

function asChambers(value: unknown): ("senate" | "house")[] {
  if (!Array.isArray(value)) return [];
  const chambers: ("senate" | "house")[] = [];
  for (const v of value) {
    const normalized = typeof v === "string" ? v.trim().toLowerCase() : "";
    if (normalized === "senate" || normalized === "house") {
      chambers.push(normalized);
    }
  }
  return [...new Set(chambers)];
}

function asTransactionTypes(value: unknown): ("purchase" | "sale")[] {
  if (!Array.isArray(value)) return [];
  const types: ("purchase" | "sale")[] = [];
  for (const v of value) {
    const normalized = typeof v === "string" ? v.trim().toLowerCase() : "";
    if (normalized === "purchase" || normalized === "sale") {
      types.push(normalized);
    }
  }
  return [...new Set(types)];
}

function asVendor(value: unknown): CongressTradingVendor {
  if (typeof value !== "string") return "stock_watcher";
  const normalized = value.trim().toLowerCase();
  if (normalized === "quiver") return "quiver";
  if (
    normalized === "stock_watcher" ||
    normalized === "stock-watcher" ||
    normalized === "stockwatcher"
  ) {
    return "stock_watcher";
  }
  return "stock_watcher";
}

export function parseCongressTradingSourceConfig(
  config: Record<string, unknown>,
): CongressTradingSourceConfig {
  const vendor = asVendor(config.vendor);
  const politicians = asStringArray(config.politicians);
  const chambers = asChambers(config.chambers);
  const transactionTypes = asTransactionTypes(config.transaction_types ?? config.transactionTypes);
  const tickers = asUpperStringArray(config.tickers);
  const minAmount = Math.max(0, Math.floor(asNumber(config.min_amount ?? config.minAmount, 0)));
  const maxTrades = Math.max(
    1,
    Math.min(
      100,
      Math.floor(asNumber(config.max_trades_per_fetch ?? config.maxTradesPerFetch, 50)),
    ),
  );

  return {
    vendor,
    politicians: politicians.length > 0 ? politicians : undefined,
    chambers: chambers.length > 0 ? chambers : undefined,
    min_amount: minAmount,
    transaction_types: transactionTypes.length > 0 ? transactionTypes : undefined,
    tickers: tickers.length > 0 ? tickers : undefined,
    max_trades_per_fetch: maxTrades,
  };
}
