import type { ContentItemDraft, FetchParams } from "@aharadar/shared";
import { generateTradeId, getChamber, parseAmountRange, type QuiverCongressTrade } from "./fetch";

function _asString(value: unknown): string | null {
  const s = String(value ?? "").trim();
  return s.length > 0 ? s : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

/**
 * Calculate days between transaction and report
 */
function calculateDaysToDisclose(transactionDate: string, reportDate: string): number | null {
  try {
    const txnDate = new Date(transactionDate);
    const rptDate = new Date(reportDate);
    if (Number.isNaN(txnDate.getTime()) || Number.isNaN(rptDate.getTime())) return null;
    const diffMs = rptDate.getTime() - txnDate.getTime();
    return Math.round(diffMs / (1000 * 60 * 60 * 24));
  } catch {
    return null;
  }
}

/**
 * Generate a descriptive title for the trade
 */
function generateTitle(trade: QuiverCongressTrade): string {
  const chamber = getChamber(trade.District);
  const chamberLabel = chamber === "senate" ? "Senate" : "House";

  let action: string;
  const txnLower = trade.Transaction.toLowerCase();
  if (txnLower === "purchase") {
    action = "BUY";
  } else if (txnLower === "sale") {
    action = "SELL";
  } else {
    action = trade.Transaction.toUpperCase();
  }

  return `[${chamberLabel}] ${trade.Representative} (${trade.Party}) ${action} ${trade.Ticker}`;
}

/**
 * Generate body text with full trade details
 */
function generateBodyText(trade: QuiverCongressTrade): string {
  const chamber = getChamber(trade.District);
  const chamberLabel = chamber === "senate" ? "Senate" : "House";
  const { min, max } = parseAmountRange(trade.Range);
  const daysToDisclose = calculateDaysToDisclose(trade.Date, trade.ReportDate);

  let body = `${trade.Representative} (${trade.Party}-${trade.District})`;
  body += `\n${chamberLabel} member`;
  body += `\n\nTransaction: ${trade.Transaction}`;
  body += `\nAsset: ${trade.Asset}`;
  body += `\nTicker: ${trade.Ticker}`;
  body += `\nAmount Range: ${trade.Range}`;

  if (min > 0) {
    const minStr = min.toLocaleString();
    const maxStr = max === Infinity ? "50,000,000+" : max.toLocaleString();
    body += ` ($${minStr} - $${maxStr})`;
  }

  body += `\n\nTransaction Date: ${trade.Date}`;
  body += `\nReport Date: ${trade.ReportDate}`;

  if (daysToDisclose !== null) {
    body += ` (${daysToDisclose} days to disclose)`;
  }

  if (trade.Link) {
    body += `\n\nSource: ${trade.Link}`;
  }

  return body;
}

/**
 * Normalize Quiver Congress trade to ContentItemDraft
 */
export async function normalizeCongressTrading(
  raw: unknown,
  _params: FetchParams,
): Promise<ContentItemDraft> {
  const trade = asRecord(raw) as unknown as QuiverCongressTrade;

  // Validate required fields
  if (!trade.Representative || !trade.Ticker || !trade.Transaction) {
    throw new Error(
      "Malformed Congress trade: missing required fields (Representative, Ticker, Transaction)",
    );
  }

  const chamber = getChamber(trade.District);
  const { min: amountMin, max: amountMax } = parseAmountRange(trade.Range);
  const daysToDisclose = calculateDaysToDisclose(trade.Date, trade.ReportDate);
  const tradeId = generateTradeId(trade);

  const title = generateTitle(trade);
  const bodyText = generateBodyText(trade);

  // Use disclosure link as canonical URL, fallback to Quiver page
  const canonicalUrl = trade.Link || "https://www.quiverquant.com/congresstrading/";

  // Use report date (filing date) as published date, not transaction date
  // This is when the information became public
  let publishedAt: string | null = null;
  if (trade.ReportDate) {
    try {
      const date = new Date(trade.ReportDate);
      if (!Number.isNaN(date.getTime())) {
        publishedAt = date.toISOString();
      }
    } catch {
      publishedAt = null;
    }
  }

  const metadata: Record<string, unknown> = {
    politician: trade.Representative,
    bioguide_id: trade.BioGuideId,
    party: trade.Party,
    chamber,
    district: trade.District,
    ticker: trade.Ticker,
    asset_description: trade.Asset,
    transaction_type: trade.Transaction.toLowerCase(),
    amount_range: trade.Range,
    amount_min: amountMin,
    amount_max: amountMax === Infinity ? null : amountMax,
    transaction_date: trade.Date,
    report_date: trade.ReportDate,
  };

  if (daysToDisclose !== null) {
    metadata.days_to_disclose = daysToDisclose;
  }

  if (trade.Link) {
    metadata.disclosure_link = trade.Link;
  }

  return {
    title,
    bodyText,
    canonicalUrl,
    sourceType: "congress_trading",
    externalId: tradeId,
    publishedAt,
    author: trade.Representative,
    metadata,
    raw: {
      representative: trade.Representative,
      bioguide_id: trade.BioGuideId,
      party: trade.Party,
      district: trade.District,
      ticker: trade.Ticker,
      transaction: trade.Transaction,
      range: trade.Range,
      date: trade.Date,
      report_date: trade.ReportDate,
    },
  };
}
