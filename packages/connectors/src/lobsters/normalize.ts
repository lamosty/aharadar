import type { ContentItemDraft, FetchParams } from "@aharadar/shared";

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value.trim() : null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => asString(v)).filter((v): v is string => v !== null);
}

/**
 * Strip HTML tags from content, returning plain text.
 */
function stripHtml(html: string): string {
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

  text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
  text = text.replace(/<\/(p|div|br|h[1-6]|li|tr)>/gi, "\n");
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<[^>]+>/g, "");
  text = text.replace(/[ \t]+/g, " ");
  text = text.replace(/\n\s*\n+/g, "\n\n");

  return text.trim();
}

/**
 * Clamp text to a max character length.
 */
function clampText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars);
}

/**
 * Extract domain from a URL.
 */
function extractDomain(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.hostname;
  } catch {
    return null;
  }
}

/**
 * Parse comment count from Lobste.rs description.
 * Lobste.rs typically includes "X comments" in the description.
 */
function parseCommentCount(description: string | null): number | null {
  if (!description) return null;
  const match = description.match(/(\d+)\s+comments?/i);
  return match ? parseInt(match[1], 10) : null;
}

// Raw entry shape from RSS fetch
interface LobstersRawEntry {
  guid: string | null;
  link: string | null;
  title: string | null;
  author: string | null;
  published_at: string | null;
  content_html: string | null;
  content_text: string | null;
  categories: string[];
  feed_url: string;
}

export async function normalizeLobsters(
  raw: unknown,
  _params: FetchParams,
): Promise<ContentItemDraft> {
  const rec = asRecord(raw);

  // Extract fields from raw entry
  const guid = asString(rec.guid);
  const link = asString(rec.link);
  const title = asString(rec.title);
  const author = asString(rec.author);
  const publishedAt = asString(rec.published_at);
  const contentHtml = asString(rec.content_html);
  const contentText = asString(rec.content_text);
  const categories = asStringArray(rec.categories);
  const feedUrl = asString(rec.feed_url);

  // Canonical URL: entry link
  const canonicalUrl = link;

  // External ID: GUID if present
  const externalId = guid;

  // Body text: prefer content over summary, strip HTML to plain text
  let bodyText: string | null = null;
  if (contentHtml) {
    bodyText = stripHtml(contentHtml);
  } else if (contentText) {
    bodyText = stripHtml(contentText);
  }

  // Clamp body text to reasonable length
  if (bodyText) {
    bodyText = clampText(bodyText, 50_000);
    if (bodyText.length === 0) bodyText = null;
  }

  // Extract Lobsters-specific metadata
  const domain = link ? extractDomain(link) : null;
  const commentCount = parseCommentCount(contentText ?? contentHtml);

  // Build metadata with Lobsters-specific fields
  const metadata: Record<string, unknown> = {};
  if (feedUrl) metadata.feed_url = feedUrl;
  if (guid) metadata.guid = guid;

  // Lobsters-specific
  if (categories.length > 0) metadata.tags = categories;
  if (author) metadata.submitter = author;
  if (domain) metadata.domain = domain;
  if (commentCount !== null) metadata.comment_count = commentCount;

  // Build raw for debugging (bounded)
  const rawData: LobstersRawEntry = {
    guid,
    link,
    title,
    author,
    published_at: publishedAt,
    content_html: contentHtml ? clampText(contentHtml, 10_000) : null,
    content_text: contentText ? clampText(contentText, 10_000) : null,
    categories,
    feed_url: feedUrl ?? "",
  };

  return {
    title,
    bodyText,
    canonicalUrl,
    sourceType: "lobsters",
    externalId,
    publishedAt,
    author,
    metadata,
    raw: rawData,
  };
}
