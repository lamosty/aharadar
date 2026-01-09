import type { ContentItemDraft, FetchParams } from "@aharadar/shared";

import type { RssRawEntry } from "../rss/fetch";

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
 * Clamp text to a max character length.
 */
function clampText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars);
}

/**
 * Extract publication name from Substack URL.
 * e.g., "https://astralcodexten.substack.com/p/..." -> "astralcodexten"
 */
function extractPublicationFromUrl(url: string | null): string | null {
  if (!url) return null;
  const match = url.match(/https?:\/\/([^.]+)\.substack\.com/);
  return match ? match[1] : null;
}

export async function normalizeSubstack(
  raw: unknown,
  params: FetchParams,
): Promise<ContentItemDraft> {
  const rec = asRecord(raw);

  // Extract fields from RssRawEntry shape
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

  // External ID: GUID if present, else null (will rely on hash_url for dedupe)
  const externalId = guid;

  // Body text: prefer content over summary, strip HTML to plain text
  let bodyText: string | null = null;
  if (contentHtml) {
    bodyText = stripHtml(contentHtml);
  } else if (contentText) {
    // contentText might still have some HTML in it from some feeds
    bodyText = stripHtml(contentText);
  }

  // Clamp body text to reasonable length
  if (bodyText) {
    bodyText = clampText(bodyText, 50_000);
    if (bodyText.length === 0) bodyText = null;
  }

  // Extract Substack-specific metadata
  const publication =
    asString(params.config.publication) ??
    extractPublicationFromUrl(link) ??
    extractPublicationFromUrl(feedUrl);

  // Build metadata
  const metadata: Record<string, unknown> = {};
  if (feedUrl) metadata.feed_url = feedUrl;
  if (categories.length > 0) metadata.categories = categories;
  if (guid) metadata.guid = guid;
  if (publication) metadata.publication_name = publication;

  // Build raw for debugging (bounded)
  const rawData: RssRawEntry = {
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
    sourceType: "substack",
    externalId,
    publishedAt,
    author,
    metadata,
    raw: rawData,
  };
}
