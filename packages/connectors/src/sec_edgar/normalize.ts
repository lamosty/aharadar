import type { ContentItemDraft, FetchParams } from "@aharadar/shared";
import type { Form4Entry, Form13fEntry } from "./parse";

function asString(value: unknown): string | null {
  const s = String(value ?? "").trim();
  return s.length > 0 ? s : null;
}

function _asNumber(value: unknown): number | null {
  const num =
    typeof value === "number" ? value : typeof value === "string" ? parseFloat(value) : NaN;
  return Number.isFinite(num) ? num : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function formatCurrency(amount: number | null): string {
  if (amount === null) return "$0";
  return `$${Math.round(amount).toLocaleString()}`;
}

function _formatDate(isoString: string | null): string {
  if (!isoString) return "unknown date";
  try {
    const date = new Date(isoString);
    return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return isoString;
  }
}

/**
 * Normalize Form 4 (insider trading) filing to ContentItemDraft
 */
function normalizeForm4(
  raw: Record<string, unknown>,
  form4: Form4Entry,
  _params: FetchParams,
): ContentItemDraft {
  const accessionNumber = asString(raw.accession_number) ?? form4.accessionNumber;
  const filingDate = form4.filingDate ?? asString(raw.filing_date);
  const insiderName = form4.insiderName;
  const insiderTitle = form4.insiderTitle;
  const companyName = form4.companyName;
  const ticker = form4.ticker;
  const cik = form4.cik;

  // Get the most significant transaction (largest value)
  const primaryTxn = form4.transactions.reduce((best, curr) => {
    const currValue = curr.totalValue ?? 0;
    const bestValue = best?.totalValue ?? 0;
    return currValue > bestValue ? curr : best;
  }, form4.transactions[0] ?? null);

  // Build title
  let txnTypeLabel = "TRANSACTION";
  if (primaryTxn) {
    const typeMap: Record<string, string> = {
      purchase: "BUY",
      sale: "SELL",
      award: "AWARD",
      disposition: "DISPOSITION",
      exercise: "EXERCISE",
      conversion: "CONVERSION",
    };
    txnTypeLabel = typeMap[primaryTxn.type] ?? primaryTxn.type.toUpperCase();
  }

  const amount = primaryTxn?.totalValue ?? null;
  const title = `[${txnTypeLabel}] ${insiderName} - ${companyName} - ${formatCurrency(amount)}`;

  // Build body text with transaction summary
  let bodyText = `Insider ${insiderName}`;
  if (insiderTitle) {
    bodyText += ` (${insiderTitle})`;
  }
  bodyText += ` of ${companyName} (${ticker})`;

  if (form4.transactions.length > 0) {
    bodyText += `\n\nTransactions:\n`;
    for (const txn of form4.transactions.slice(0, 10)) {
      // Limit to first 10 transactions
      const shareStr =
        txn.shares !== null
          ? `${Math.round(txn.shares).toLocaleString()} shares`
          : "unknown shares";
      const priceStr =
        txn.pricePerShare !== null ? ` at $${txn.pricePerShare.toFixed(2)}/share` : "";
      const valueStr = txn.totalValue !== null ? ` (${formatCurrency(txn.totalValue)})` : "";
      const typeLabel = txn.type.charAt(0).toUpperCase() + txn.type.slice(1);
      bodyText += `- ${typeLabel}: ${shareStr}${priceStr}${valueStr}\n`;
    }
  }

  // Canonical URL
  const canonicalUrl =
    ticker && cik
      ? `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}&type=4&dateb=&owner=include&count=40`
      : null;

  // External ID
  const externalId = accessionNumber ? `form4_${accessionNumber}` : null;

  // Author
  const author = insiderName;

  // Metadata
  const metadata: Record<string, unknown> = {
    filing_type: "form4",
    ticker,
    cik,
    insider_name: insiderName,
    insider_title: insiderTitle,
    is_director: form4.isDirector,
    is_officer: form4.isOfficer,
    is_ten_percent_owner: form4.isTenPercentOwner,
  };

  if (primaryTxn) {
    metadata.transaction_type = primaryTxn.type;
    metadata.transaction_code = primaryTxn.code;
    metadata.shares = primaryTxn.shares;
    metadata.price_per_share = primaryTxn.pricePerShare;
    metadata.total_value = primaryTxn.totalValue;
    metadata.shares_owned_after = primaryTxn.sharesOwnedAfter;
    metadata.is_direct = primaryTxn.isDirect;
    metadata.is_derivative = primaryTxn.isDerivative;
  }

  metadata.transaction_count = form4.transactions.length;
  metadata.filing_date = filingDate;
  metadata.accession_number = accessionNumber;

  return {
    title,
    bodyText,
    canonicalUrl,
    sourceType: "sec_edgar",
    externalId,
    publishedAt: filingDate,
    author,
    metadata,
    raw: {
      filing_type: "form4",
      accession_number: accessionNumber,
      filing_date: filingDate,
      insider_name: insiderName,
      ticker,
      cik,
      transaction_count: form4.transactions.length,
    },
  };
}

/**
 * Normalize 13F (institutional holdings) filing to ContentItemDraft
 */
function normalize13f(
  raw: Record<string, unknown>,
  form13f: Form13fEntry,
  _params: FetchParams,
): ContentItemDraft {
  const accessionNumber = asString(raw.accession_number) ?? form13f.accessionNumber;
  const filingDate = form13f.filingDate ?? asString(raw.filing_date);
  const institutionName = form13f.institutionName;
  const cik = form13f.cik;
  const reportPeriod = form13f.reportPeriod;

  // Extract quarter and year from report period (format: YYYY-MM-DD or similar)
  let quarterLabel = "Q unknown";
  if (reportPeriod) {
    const date = new Date(reportPeriod);
    const month = date.getMonth() + 1;
    const year = date.getFullYear();
    const quarter = Math.ceil(month / 3);
    quarterLabel = `Q${quarter} ${year}`;
  }

  // Build title
  const title = `[13F] ${institutionName} - ${quarterLabel} Holdings`;

  // Top 10 holdings summary
  let bodyText = `${institutionName} quarterly institutional holdings filing (${quarterLabel})\n\n`;

  const topHoldings = form13f.holdings.slice(0, 10);
  if (topHoldings.length > 0) {
    bodyText += `Top Holdings:\n`;
    for (const holding of topHoldings) {
      const name = holding.name || holding.ticker || "Unknown";
      const shares =
        holding.shares !== null
          ? `${Math.round(holding.shares).toLocaleString()} shares`
          : "position";
      const value =
        holding.value !== null ? ` ($${Math.round(holding.value * 1000).toLocaleString()})` : "";
      bodyText += `- ${name}: ${shares}${value}\n`;
    }
  }

  bodyText += `\nTotal holdings: ${form13f.holdings.length} positions`;
  if (form13f.totalValue !== null) {
    bodyText += ` (${formatCurrency(form13f.totalValue * 1000)} total value)`;
  }

  // Canonical URL
  const canonicalUrl =
    cik && accessionNumber
      ? `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}&type=13F&dateb=&owner=exclude&count=40`
      : null;

  // External ID
  const externalId = accessionNumber ? `13f_${accessionNumber}` : null;

  // Author
  const author = institutionName;

  // Metadata
  const metadata: Record<string, unknown> = {
    filing_type: "13f",
    institution_name: institutionName,
    cik,
    report_period: reportPeriod,
    total_value: form13f.totalValue,
    holdings_count: form13f.holdings.length,
  };

  // Include top 10 holdings in metadata
  if (topHoldings.length > 0) {
    metadata.top_holdings = topHoldings.map((h) => ({
      ticker: h.ticker,
      name: h.name,
      shares: h.shares,
      value: h.value,
    }));
  }

  metadata.filing_date = filingDate;
  metadata.accession_number = accessionNumber;

  return {
    title,
    bodyText,
    canonicalUrl,
    sourceType: "sec_edgar",
    externalId,
    publishedAt: filingDate,
    author,
    metadata,
    raw: {
      filing_type: "13f",
      accession_number: accessionNumber,
      filing_date: filingDate,
      institution_name: institutionName,
      cik,
      holdings_count: form13f.holdings.length,
    },
  };
}

/**
 * Main normalize function for SEC EDGAR filings
 */
export async function normalizeSecEdgar(
  raw: unknown,
  params: FetchParams,
): Promise<ContentItemDraft> {
  const item = asRecord(raw);

  const filingType = asString(item.filing_type);
  const form4Data = asRecord(item.form4_data ?? {});
  const form13fData = asRecord(item.form13f_data ?? {});

  // Validate required fields
  if (filingType === "form4") {
    if (Object.keys(form4Data).length === 0) {
      throw new Error("Malformed SEC EDGAR item: missing Form 4 data");
    }
    const form4 = form4Data as unknown as Form4Entry;
    if (!form4.companyName || !form4.ticker) {
      throw new Error("Malformed Form 4: missing company info");
    }
    return normalizeForm4(item as Record<string, unknown>, form4, params);
  }

  if (filingType === "13f") {
    if (Object.keys(form13fData).length === 0) {
      throw new Error("Malformed SEC EDGAR item: missing 13F data");
    }
    const form13f = form13fData as unknown as Form13fEntry;
    if (!form13f.institutionName) {
      throw new Error("Malformed 13F: missing institution info");
    }
    return normalize13f(item as Record<string, unknown>, form13f, params);
  }

  throw new Error(`Unknown SEC EDGAR filing type: ${filingType}`);
}
