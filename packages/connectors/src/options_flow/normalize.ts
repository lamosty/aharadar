import type { ContentItemDraft, FetchParams } from "@aharadar/shared";
import {
  calculateDaysToExpiry,
  classifySentiment,
  generateFlowId,
  type OptionsFlowRaw,
} from "./fetch";

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

/**
 * Format premium for display
 */
function formatPremium(premium: number): string {
  if (premium >= 1_000_000) return `$${(premium / 1_000_000).toFixed(1)}M`;
  if (premium >= 1000) return `$${(premium / 1000).toFixed(0)}K`;
  return `$${premium.toFixed(0)}`;
}

/**
 * Format expiry date for display (M/D format)
 */
function formatExpiry(expiry: string): string {
  try {
    const date = new Date(expiry);
    if (Number.isNaN(date.getTime())) return expiry;
    return `${date.getMonth() + 1}/${date.getDate()}`;
  } catch {
    return expiry;
  }
}

/**
 * Generate a descriptive title for the options flow alert
 * Format: [FLOW_TYPE] $SYMBOL $STRIKEC/P EXPIRY - $PREMIUM (SENTIMENT)
 */
function generateTitle(flow: OptionsFlowRaw): string {
  const flowType = flow.flow_type.toUpperCase();
  const contractType = flow.contract_type === "call" ? "C" : "P";
  const premium = formatPremium(flow.premium);
  const sentiment = flow.sentiment.charAt(0).toUpperCase() + flow.sentiment.slice(1);
  const expiry = formatExpiry(flow.expiry);

  return `[${flowType}] $${flow.symbol} $${flow.strike}${contractType} ${expiry} - ${premium} (${sentiment})`;
}

/**
 * Generate body text with flow details
 */
function generateBodyText(flow: OptionsFlowRaw): string {
  const daysToExpiry = calculateDaysToExpiry(flow.expiry);
  const volumeOiRatio =
    flow.open_interest > 0 ? (flow.volume / flow.open_interest).toFixed(2) : "N/A";
  const isOTM =
    flow.contract_type === "call" ? flow.strike > flow.spot_price : flow.strike < flow.spot_price;
  const moneyness = isOTM ? "OTM" : flow.strike === flow.spot_price ? "ATM" : "ITM";

  let body = `${flow.flow_type.toUpperCase()} order on $${flow.symbol}`;
  body += `\n\nContract: ${flow.symbol} $${flow.strike} ${flow.contract_type.toUpperCase()}`;
  body += `\nExpiration: ${flow.expiry} (${daysToExpiry} days)`;
  body += `\nMoneyness: ${moneyness}`;

  body += `\n\nOrder Details:`;
  body += `\n  Premium: ${formatPremium(flow.premium)}`;
  body += `\n  Volume: ${flow.volume.toLocaleString()} contracts`;
  body += `\n  Open Interest: ${flow.open_interest.toLocaleString()}`;
  body += `\n  Volume/OI Ratio: ${volumeOiRatio}`;

  body += `\n\nUnderlying: $${flow.spot_price.toFixed(2)}`;
  body += `\nSentiment: ${flow.sentiment.charAt(0).toUpperCase() + flow.sentiment.slice(1)}`;

  if (flow.exchange) {
    body += `\nExchange: ${flow.exchange}`;
  }

  return body;
}

/**
 * Build canonical URL for the flow (link to Unusual Whales or similar)
 */
function buildCanonicalUrl(flow: OptionsFlowRaw): string {
  // Link to the flow on Unusual Whales
  return `https://unusualwhales.com/flow?symbol=${flow.symbol}`;
}

/**
 * Normalize options flow to ContentItemDraft
 */
export async function normalizeOptionsFlow(
  raw: unknown,
  _params: FetchParams,
): Promise<ContentItemDraft> {
  const flow = asRecord(raw) as unknown as OptionsFlowRaw;

  // Validate required fields
  if (!flow.symbol || !flow.strike || !flow.contract_type) {
    throw new Error(
      "Malformed options flow: missing required fields (symbol, strike, contract_type)",
    );
  }

  // Ensure sentiment is classified
  const sentiment = classifySentiment(flow);
  flow.sentiment = sentiment;

  const flowId = generateFlowId(flow);
  const title = generateTitle(flow);
  const bodyText = generateBodyText(flow);
  const canonicalUrl = buildCanonicalUrl(flow);
  const daysToExpiry = calculateDaysToExpiry(flow.expiry);

  // Determine if OTM
  const isOTM =
    flow.contract_type === "call" ? flow.strike > flow.spot_price : flow.strike < flow.spot_price;

  // Determine if weekly (typically < 7 days to expiry on Friday)
  const isWeekly = daysToExpiry <= 7;

  // Use flow timestamp as published date
  let publishedAt: string | null = null;
  if (flow.timestamp) {
    try {
      const date = new Date(flow.timestamp);
      if (!Number.isNaN(date.getTime())) {
        publishedAt = date.toISOString();
      }
    } catch {
      publishedAt = null;
    }
  }

  const metadata: Record<string, unknown> = {
    symbol: flow.symbol,
    strike: flow.strike,
    expiry: flow.expiry,
    contract_type: flow.contract_type,
    flow_type: flow.flow_type,
    sentiment: flow.sentiment,
    premium: flow.premium,
    volume: flow.volume,
    open_interest: flow.open_interest,
    volume_oi_ratio: flow.open_interest > 0 ? flow.volume / flow.open_interest : null,
    spot_price: flow.spot_price,
    days_to_expiry: daysToExpiry,
    is_weekly: isWeekly,
    is_otm: isOTM,
  };

  if (flow.exchange) {
    metadata.exchange = flow.exchange;
  }

  return {
    title,
    bodyText,
    canonicalUrl,
    sourceType: "options_flow",
    externalId: flowId,
    publishedAt,
    author: "Options Flow",
    metadata,
    raw: {
      id: flow.id,
      symbol: flow.symbol,
      strike: flow.strike,
      expiry: flow.expiry,
      contract_type: flow.contract_type,
      flow_type: flow.flow_type,
      premium: flow.premium,
      volume: flow.volume,
      timestamp: flow.timestamp,
    },
  };
}
