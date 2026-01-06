import type { ContentItemDraft, FetchParams } from "@aharadar/shared";

import type { HnRawItem } from "./fetch";

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Strip HTML tags from content, returning plain text.
 * Best-effort: handles common HTML entities and removes tags.
 */
function stripHtml(html: string): string {
  // Decode common HTML entities
  let text = html
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&#(\d+);/gi, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));

  // Remove script and style blocks entirely
  text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");

  // Convert common block elements to newlines
  text = text.replace(/<\/(p|div|br|h[1-6]|li|tr)>/gi, "\n");
  text = text.replace(/<br\s*\/?>/gi, "\n");

  // Remove all remaining tags
  text = text.replace(/<[^>]+>/g, "");

  // Collapse multiple whitespace/newlines
  text = text.replace(/[ \t]+/g, " ");
  text = text.replace(/\n\s*\n+/g, "\n\n");

  return text.trim();
}

/**
 * Convert unix timestamp (seconds) to ISO string.
 */
function unixToIso(timestamp: number): string {
  const d = new Date(timestamp * 1000);
  return d.toISOString();
}

export async function normalizeHn(raw: unknown, _params: FetchParams): Promise<ContentItemDraft> {
  const rec = asRecord(raw);

  // Extract fields from HnRawItem shape
  const id = asNumber(rec.id);
  const type = asString(rec.type);
  const by = asString(rec.by);
  const time = asNumber(rec.time);
  const title = asString(rec.title);
  const text = asString(rec.text);
  const url = asString(rec.url);
  const score = asNumber(rec.score);
  const descendants = asNumber(rec.descendants);

  // External ID: story id as string
  const externalId = id !== null ? String(id) : null;

  // Canonical URL: url if present, else HN item page
  const canonicalUrl = url ?? (id !== null ? `https://news.ycombinator.com/item?id=${id}` : null);

  // Body text: text (strip HTML tags) if present
  let bodyText: string | null = null;
  if (text) {
    bodyText = stripHtml(text);
    if (bodyText.length === 0) bodyText = null;
  }

  // Published at: from time unix seconds
  const publishedAt = time !== null ? unixToIso(time) : null;

  // Author
  const author = by;

  // Build metadata
  const metadata: Record<string, unknown> = {};
  if (type) metadata.type = type;
  if (score !== null) metadata.score = score;
  if (descendants !== null) metadata.descendants = descendants;
  if (url) metadata.url = url;

  // Build raw for debugging (bounded)
  const rawData: HnRawItem = {
    id: id ?? 0,
    type: type ?? "unknown",
    by,
    time,
    title,
    text,
    url,
    score,
    descendants,
  };

  return {
    title,
    bodyText,
    canonicalUrl,
    sourceType: "hn",
    externalId,
    publishedAt,
    author,
    metadata,
    raw: rawData,
  };
}
