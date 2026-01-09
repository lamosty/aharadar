import type { FetchParams, FetchResult } from "@aharadar/shared";
import { parseSecEdgarSourceConfig } from "./config";
import { parseRssAtom, parseForm4Xml, parse13fXml, type Form4Entry, type Form13fEntry } from "./parse";

type SecEdgarCursorJson = {
  form4?: {
    last_accession?: string;
    last_fetch_at?: string;
  };
  "13f"?: {
    last_accession?: string;
    last_fetch_at?: string;
  };
};

interface SecEdgarRawItem {
  filing_type: "form4" | "13f";
  accession_number: string | null;
  filing_date: string | null;
  cik: string | null;
  ticker: string | null;
  form4_data?: Form4Entry;
  form13f_data?: Form13fEntry;
}

// Minimum delay between HTTP requests (ms) to respect SEC rate limits (10 req/sec max)
const MIN_REQUEST_DELAY_MS = 100;

function parseCursor(cursor: Record<string, unknown>): SecEdgarCursorJson {
  const form4Cursor = cursor.form4 ?? {};
  const form13fCursor = cursor["13f"] ?? {};

  return {
    form4: typeof form4Cursor === "object" ? (form4Cursor as Record<string, unknown>) : {},
    "13f": typeof form13fCursor === "object" ? (form13fCursor as Record<string, unknown>) : {},
  };
}

async function fetchWithDelay(url: string, delayMs: number = MIN_REQUEST_DELAY_MS): Promise<string> {
  await new Promise((resolve) => setTimeout(resolve, delayMs));

  const userAgent = process.env.SEC_EDGAR_USER_AGENT || "AhaRadar/1.0 (mvp; connectors/sec_edgar)";
  let retries = 0;
  const maxRetries = 3;
  let baseDelayMs = 500; // Start with 500ms backoff for 429/503

  while (retries <= maxRetries) {
    try {
      const res = await fetch(url, {
        method: "GET",
        headers: {
          "User-Agent": userAgent,
          Accept: "application/xml, text/xml, application/atom+xml, */*",
        },
      });

      if (res.ok) {
        return res.text();
      }

      // Handle rate limiting (429) and service unavailable (503)
      if (res.status === 429 || res.status === 503) {
        if (retries < maxRetries) {
          const delayMs = baseDelayMs * Math.pow(2, retries);
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          retries++;
          continue;
        }
        const body = await res.text().catch(() => "");
        throw new Error(`SEC EDGAR fetch failed (${res.status}): ${body.slice(0, 500)}`);
      }

      // Other errors
      const body = await res.text().catch(() => "");
      throw new Error(`SEC EDGAR fetch failed (${res.status} ${res.statusText}): ${body.slice(0, 500)}`);
    } catch (error) {
      if (
        retries < maxRetries &&
        error instanceof Error &&
        (error.message.includes("429") || error.message.includes("503"))
      ) {
        const delayMs = baseDelayMs * Math.pow(2, retries);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        retries++;
        continue;
      }
      throw error;
    }
  }

  throw new Error("SEC EDGAR fetch failed after max retries");
}

function fetchRssUrl(filingType: "form4" | "13f"): string {
  if (filingType === "form4") {
    return "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=4&company=&dateb=&owner=include&count=100&output=atom";
  } else {
    return "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=13F&company=&dateb=&owner=include&count=100&output=atom";
  }
}

/**
 * Fetch Form 4 or 13F filings from SEC EDGAR RSS feeds
 */
export async function fetchSecEdgar(params: FetchParams): Promise<FetchResult> {
  const config = parseSecEdgarSourceConfig(params.config);
  const cursorIn = parseCursor(params.cursor);

  const rawItems: SecEdgarRawItem[] = [];
  const maxItems = Math.max(0, Math.floor(params.limits.maxItems));

  let httpRequests = 0;
  let newestAccession: Record<string, string | null> = {
    form4: cursorIn.form4?.last_accession ?? null,
    "13f": cursorIn["13f"]?.last_accession ?? null,
  };

  // Fetch filings for each configured filing type
  for (const filingType of config.filing_types) {
    if (rawItems.length >= maxItems) break;

    try {
      // Fetch RSS feed
      const rssUrl = fetchRssUrl(filingType);
      const rssXml = await fetchWithDelay(rssUrl);
      httpRequests += 1;

      // Parse RSS entries
      const entries = parseRssAtom(rssXml);

      // Process each entry up to maxItems
      for (const entry of entries) {
        if (rawItems.length >= maxItems) break;

        // Skip if we don't have accession number
        if (!entry.accessionNumber) continue;

        // Check cursor: skip if we've already seen this accession
        const lastAccession = newestAccession[filingType];
        if (lastAccession && entry.accessionNumber === lastAccession) {
          continue; // Skip entries we've already processed
        }

        // Update newest seen accession
        if (!newestAccession[filingType] || entry.accessionNumber > (newestAccession[filingType] || "")) {
          newestAccession[filingType] = entry.accessionNumber;
        }

        const item: SecEdgarRawItem = {
          filing_type: filingType,
          accession_number: entry.accessionNumber,
          filing_date: entry.published,
          cik: null,
          ticker: null,
        };

        // For Form 4, try to fetch full XML if link is available
        if (filingType === "form4" && entry.link) {
          try {
            // Try to construct XML filing URL from SEC link
            const xmlUrl = entry.link.replace(/\?.*/, "").replace(/\.htm.*/, ".xml");
            const xmlText = await fetchWithDelay(xmlUrl);
            httpRequests += 1;

            const form4 = parseForm4Xml(xmlText);
            if (form4) {
              item.form4_data = form4;
              item.cik = form4.cik;
              item.ticker = form4.ticker;

              // Check transaction value filter
              const minValue = config.min_transaction_value ?? 0;
              const hasValidTxn = form4.transactions.some((t) => (t.totalValue ?? 0) >= minValue);
              if (!hasValidTxn && minValue > 0) {
                continue; // Skip if no transactions meet minimum value
              }

              rawItems.push(item);
            }
          } catch {
            // If we can't fetch XML details, skip this entry
            continue;
          }
        } else if (filingType === "13f" && entry.link) {
          // For 13F, try to fetch details
          try {
            const xmlUrl = entry.link.replace(/\?.*/, "").replace(/\.htm.*/, ".xml");
            const xmlText = await fetchWithDelay(xmlUrl);
            httpRequests += 1;

            const form13f = parse13fXml(xmlText);
            if (form13f) {
              item.form13f_data = form13f;
              item.cik = form13f.cik;
              rawItems.push(item);
            }
          } catch {
            // If we can't fetch XML details, skip this entry
            continue;
          }
        }
      }
    } catch (error) {
      console.warn(`Error fetching SEC EDGAR ${filingType} filings: ${error}`);
      // Continue with other filing types even if one fails
    }
  }

  // Build next cursor
  const nextCursor: SecEdgarCursorJson = {};
  for (const filingType of config.filing_types) {
    if (newestAccession[filingType]) {
      nextCursor[filingType] = {
        last_accession: newestAccession[filingType] ?? undefined,
        last_fetch_at: new Date().toISOString(),
      };
    }
  }

  return {
    rawItems,
    nextCursor: nextCursor as Record<string, unknown>,
    meta: {
      requests: httpRequests,
      filing_types: config.filing_types,
      items_fetched: rawItems.length,
    },
  };
}
