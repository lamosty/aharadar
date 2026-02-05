/**
 * X/Twitter posts normalize implementation (ADR 0010).
 *
 * Converts raw x_post_v1 items into ContentItemDraft.
 * Posts are canonical content items with stable URLs and IDs.
 */
import type { ContentItemDraft, FetchParams } from "@aharadar/shared";
import { normalizeHandle, sha256Hex } from "@aharadar/shared";

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value))
    return value as Record<string, unknown>;
  return {};
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function _asIsoDate(value: unknown): string | null {
  const s = asString(value);
  if (!s) return null;
  // Day buckets (YYYY-MM-DD)
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // ISO timestamps - truncate to date prefix
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return s.slice(0, 10);
  return null;
}

export function parseXStatusUrl(url: string): { handle: string | null; statusId: string | null } {
  // Examples:
  // - https://x.com/<handle>/status/<id>
  // - https://twitter.com/<handle>/status/<id>
  const m = url.match(/\/\/(?:www\.)?(?:x\.com|twitter\.com)\/([A-Za-z0-9_]{1,30})\/status\/(\d+)/);
  if (!m) return { handle: null, statusId: null };
  return { handle: m[1] ?? null, statusId: m[2] ?? null };
}

function looksLikeStatusId(value: string | null): value is string {
  return typeof value === "string" && /^\d{5,25}$/.test(value);
}

function buildCanonicalXStatusUrl(handle: string | null, statusId: string | null): string | null {
  if (!looksLikeStatusId(statusId) || !handle) return null;
  const normalized = normalizeHandle(handle);
  if (!normalized) return null;
  return `https://x.com/${normalized}/status/${statusId}`;
}

/**
 * Parse date/timestamp from Grok response.
 * Returns { full, dayOnly } where:
 * - full: ISO timestamp if provided (e.g., "2026-01-08T05:23:00Z")
 * - dayOnly: YYYY-MM-DD if only day-level available
 */
function parseGrokDate(value: unknown): { full: string | null; dayOnly: string | null } {
  const s = asString(value);
  if (!s) return { full: null, dayOnly: null };

  // Full ISO timestamp (e.g., "2026-01-08T05:23:00Z")
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) {
    return { full: s, dayOnly: s.slice(0, 10) };
  }

  // Day-only (e.g., "2026-01-08")
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return { full: null, dayOnly: s };
  }

  // RFC 1123 or other parseable date strings
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) {
    const iso = parsed.toISOString();
    return { full: iso, dayOnly: iso.slice(0, 10) };
  }

  return { full: null, dayOnly: null };
}

/**
 * Twitter/X snowflake ID decoder.
 * X status IDs encode creation time as (timestamp_ms - epoch) << 22.
 * The Twitter epoch is 1288834974657 (Nov 4, 2010, 01:42:54.657 UTC).
 */
const TWITTER_EPOCH = 1288834974657n;

function snowflakeToTimestamp(statusId: string): string | null {
  // Status IDs are large numbers (typically 18-19 digits)
  if (!/^\d{15,20}$/.test(statusId)) return null;

  try {
    const id = BigInt(statusId);
    // Extract timestamp: upper 42 bits (>> 22)
    const timestampMs = Number((id >> 22n) + TWITTER_EPOCH);

    // Plausibility check: must be between Twitter epoch and now + 1 day
    // (allow some future tolerance for clock skew)
    const now = Date.now();
    if (timestampMs < Number(TWITTER_EPOCH) || timestampMs > now + 24 * 60 * 60 * 1000) {
      return null;
    }

    return new Date(timestampMs).toISOString();
  } catch {
    return null;
  }
}

function looksLikeUrl(s: string): boolean {
  return s.startsWith("http://") || s.startsWith("https://");
}

function extractUrlsFromText(text: string): string[] {
  const matches = text.match(/https?:\/\/[^\s"'<>]+/g) ?? [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of matches) {
    const cleaned = raw.replace(/[)\].,;!?]+$/g, "");
    if (!looksLikeUrl(cleaned)) continue;
    if (seen.has(cleaned)) continue;
    seen.add(cleaned);
    out.push(cleaned);
    if (out.length >= 100) break;
  }
  return out;
}

function clampText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars);
}

function decodeBase64Text(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const decoded = Buffer.from(trimmed, "base64").toString("utf8");
    return decoded.length > 0 ? decoded : null;
  } catch {
    return null;
  }
}

export async function normalizeXPosts(
  raw: unknown,
  params: FetchParams,
): Promise<ContentItemDraft> {
  const rec = asRecord(raw);
  const query = asString(rec.query) ?? "x_posts";
  const vendor = asString(rec.vendor) ?? "grok";
  const dayBucket = asString(rec.day_bucket) ?? params.windowEnd.slice(0, 10);

  const url = asString(rec.url);
  const sourceUrl = url && looksLikeUrl(url) ? url : null;
  const parsedSourceUrl = sourceUrl ? parseXStatusUrl(sourceUrl) : { handle: null, statusId: null };
  const canonicalUrlFromSource =
    sourceUrl &&
    (buildCanonicalXStatusUrl(parsedSourceUrl.handle, parsedSourceUrl.statusId) ?? sourceUrl);

  const rawStatusId = asString(rec.id);
  const rawUserHandle = asString(rec.user_handle);
  const normalizedRawHandle = rawUserHandle ? normalizeHandle(rawUserHandle) : null;

  const textBase64 = asString(rec.text_b64);
  const decodedText = textBase64 ? decodeBase64Text(textBase64) : null;
  const textRaw = decodedText ?? asString(rec.text);
  const bodyText = textRaw ? clampText(textRaw.replaceAll("\n", " ").trim(), 10_000) : null;
  const allTextUrls = bodyText && bodyText.length > 0 ? extractUrlsFromText(bodyText) : [];
  const statusUrlFromText =
    allTextUrls.find((candidateUrl) => parseXStatusUrl(candidateUrl).statusId !== null) ?? null;
  const parsedTextStatusUrl = statusUrlFromText
    ? parseXStatusUrl(statusUrlFromText)
    : { handle: null, statusId: null };
  const canonicalUrlFromText =
    statusUrlFromText &&
    (buildCanonicalXStatusUrl(parsedTextStatusUrl.handle, parsedTextStatusUrl.statusId) ??
      statusUrlFromText);

  // Parse date - may be full timestamp or day-only
  const dateInfo = parseGrokDate(rec.date);

  // Resolve status identity from best available fields (raw id/handle, URL, text URL).
  const statusId = rawStatusId ?? parsedSourceUrl.statusId ?? parsedTextStatusUrl.statusId;
  const handle =
    normalizedRawHandle ??
    (parsedSourceUrl.handle ? normalizeHandle(parsedSourceUrl.handle) : null) ??
    (parsedTextStatusUrl.handle ? normalizeHandle(parsedTextStatusUrl.handle) : null);
  const canonicalUrl =
    canonicalUrlFromSource ?? buildCanonicalXStatusUrl(handle, statusId) ?? canonicalUrlFromText;

  // External ID: prefer status ID, else hash
  const fallbackKey = canonicalUrl ?? bodyText ?? "";
  const externalId = statusId ?? sha256Hex([vendor, query, dayBucket, fallbackKey].join("|"));

  const extractedUrls = allTextUrls.filter((u) => {
    if (canonicalUrl && u === canonicalUrl) return false;
    const parsedUrl = parseXStatusUrl(u);
    if (statusId && parsedUrl.statusId === statusId) return false;
    return true;
  });
  const primaryUrl = extractedUrls[0] ?? canonicalUrl ?? null;

  // User display name from Grok response (e.g., "Elon Musk")
  const userDisplayName = asString(rec.user_display_name);

  // Timestamp strategy (ADR: no fabrication from day buckets):
  // 1. Prefer full ISO timestamp from Grok if available
  // 2. Else attempt snowflake decode from status ID
  // 3. Else keep publishedAt = null (rely on fetched_at + metadata.post_date for UI)
  let publishedAt: string | null = null;
  let timestampSource: string | null = null;

  if (dateInfo.full) {
    // Full timestamp from Grok - use as-is
    publishedAt = dateInfo.full;
    timestampSource = "grok_timestamp";
  } else if (statusId) {
    // Attempt snowflake decode
    const snowflakeTs = snowflakeToTimestamp(statusId);
    if (snowflakeTs) {
      publishedAt = snowflakeTs;
      timestampSource = "snowflake";
    }
  }
  // If neither, publishedAt remains null - do NOT fabricate from day bucket

  return {
    title: null,
    bodyText,
    canonicalUrl,
    sourceType: "x_posts",
    externalId,
    publishedAt,
    author: handle ? `@${handle}` : null,
    metadata: {
      vendor,
      query,
      day_bucket: dayBucket,
      window_start: params.windowStart,
      window_end: params.windowEnd,
      post_url: canonicalUrl ?? url,
      post_date: dateInfo.dayOnly,
      extracted_urls: extractedUrls,
      primary_url: primaryUrl,
      user_display_name: userDisplayName,
      timestamp_source: timestampSource,
      status_id: statusId,
    },
    raw: {
      kind: "x_post_v1",
      query,
      vendor,
      day_bucket: dayBucket,
      date: rec.date,
      id: rawStatusId,
      user_handle: rawUserHandle,
      text_b64: textBase64,
      url,
    },
  };
}
