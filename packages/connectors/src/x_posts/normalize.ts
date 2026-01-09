/**
 * X/Twitter posts normalize implementation (ADR 0010).
 *
 * Converts raw x_post_v1 items into ContentItemDraft.
 * Posts are canonical content items with stable URLs and IDs.
 */
import type { ContentItemDraft, FetchParams } from "@aharadar/shared";
import { sha256Hex } from "@aharadar/shared";

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  return {};
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function parseXStatusUrl(url: string): { handle: string | null; statusId: string | null } {
  // Examples:
  // - https://x.com/<handle>/status/<id>
  // - https://twitter.com/<handle>/status/<id>
  const m = url.match(/\/\/(?:www\.)?(?:x\.com|twitter\.com)\/([A-Za-z0-9_]{1,30})\/status\/(\d+)/);
  if (!m) return { handle: null, statusId: null };
  return { handle: m[1] ?? null, statusId: m[2] ?? null };
}

function asIsoDate(value: unknown): string | null {
  const s = asString(value);
  if (!s) return null;
  // Accept YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // Accept ISO timestamps by truncating
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return s.slice(0, 10);
  return null;
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

export async function normalizeXPosts(raw: unknown, params: FetchParams): Promise<ContentItemDraft> {
  const rec = asRecord(raw);
  const query = asString(rec.query) ?? "x_posts";
  const vendor = asString(rec.vendor) ?? "grok";
  const dayBucket = asString(rec.day_bucket) ?? params.windowEnd.slice(0, 10);

  const url = asString(rec.url);
  const canonicalUrl = url && looksLikeUrl(url) ? url : null;
  const textRaw = asString(rec.text);
  const bodyText = textRaw ? clampText(textRaw.replaceAll("\n", " ").trim(), 10_000) : null;
  const dateDay = asIsoDate(rec.date);

  const parsed = canonicalUrl ? parseXStatusUrl(canonicalUrl) : { handle: null, statusId: null };
  const fallbackKey = canonicalUrl ?? bodyText ?? "";
  const externalId = parsed.statusId ?? sha256Hex([vendor, query, dayBucket, fallbackKey].join("|"));

  const extractedUrls =
    bodyText && bodyText.length > 0
      ? extractUrlsFromText(bodyText).filter((u) => (canonicalUrl ? u !== canonicalUrl : true))
      : [];
  const primaryUrl = extractedUrls[0] ?? canonicalUrl ?? null;

  // User display name from Grok response (e.g., "Elon Musk")
  const userDisplayName = asString(rec.user_display_name);

  // Convert day bucket to approximate timestamp (noon UTC)
  // This is an approximation since Grok only provides day-level dates.
  // UI should treat as approximate (show "2d ago" not "48h ago").
  const publishedAt = dateDay ? `${dateDay}T12:00:00Z` : null;

  return {
    title: null,
    bodyText,
    canonicalUrl,
    sourceType: "x_posts",
    externalId,
    publishedAt,
    author: parsed.handle ? `@${parsed.handle}` : null,
    metadata: {
      vendor,
      query,
      day_bucket: dayBucket,
      window_start: params.windowStart,
      window_end: params.windowEnd,
      post_url: canonicalUrl ?? url,
      post_date: dateDay,
      extracted_urls: extractedUrls,
      primary_url: primaryUrl,
      user_display_name: userDisplayName,
    },
    raw: {
      kind: "x_post_v1",
      query,
      vendor,
      day_bucket: dayBucket,
      date: dateDay,
      url,
    },
  };
}
