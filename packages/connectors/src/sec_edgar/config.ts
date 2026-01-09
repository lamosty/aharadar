export interface SecEdgarSourceConfig {
  /** Array of filing types to fetch */
  filing_types: ("form4" | "13f")[];
  /** Optional: filter by company tickers (e.g., ["AAPL", "TSLA"]) */
  tickers?: string[];
  /** Optional: filter by CIK numbers (more precise than tickers) */
  ciks?: string[];
  /** Optional: minimum transaction value in USD (Form 4 only), default 0 */
  min_transaction_value?: number;
  /** Optional: max filings per fetch, default 50, clamped to 1-100 */
  max_filings_per_fetch?: number;
}

function asString(value: unknown): string {
  if (typeof value === "string") return value.trim().toUpperCase();
  return "";
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => (typeof v === "string" ? v.trim().toUpperCase() : null))
    .filter((v) => v !== null && v.length > 0) as string[];
}

function asNumber(value: unknown, defaultValue: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : defaultValue;
}

function asFilingTypes(value: unknown): ("form4" | "13f")[] {
  if (!Array.isArray(value)) return [];
  const types: ("form4" | "13f")[] = [];
  for (const v of value) {
    const normalized = typeof v === "string" ? v.trim().toLowerCase() : "";
    if (normalized === "form4" || normalized === "13f") {
      types.push(normalized);
    }
  }
  return [...new Set(types)]; // Remove duplicates
}

export function parseSecEdgarSourceConfig(config: Record<string, unknown>): SecEdgarSourceConfig {
  // Accept both snake_case and camelCase
  const filingTypes = asFilingTypes(config.filing_types ?? config.filingTypes);
  if (filingTypes.length === 0) {
    throw new Error('Config must include "filing_types" with at least one of: ["form4", "13f"]');
  }

  const minValue = Math.max(
    0,
    Math.floor(asNumber(config.min_transaction_value ?? config.minTransactionValue, 0))
  );
  const maxFilings = Math.max(
    1,
    Math.min(100, Math.floor(asNumber(config.max_filings_per_fetch ?? config.maxFilingPerFetch, 50)))
  );

  return {
    filing_types: filingTypes,
    tickers: asStringArray(config.tickers),
    ciks: asStringArray(config.ciks),
    min_transaction_value: minValue,
    max_filings_per_fetch: maxFilings,
  };
}
