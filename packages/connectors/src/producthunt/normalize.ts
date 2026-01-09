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

function clampText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars);
}

/**
 * Extract tagline from Product Hunt content.
 * The tagline is typically the first sentence/line of the description.
 */
function extractTagline(text: string | null): string | null {
  if (!text) return null;

  // Take first line or first sentence (whichever is shorter)
  const firstLine = text.split("\n")[0]?.trim();
  if (!firstLine) return null;

  // If the first line is very short (< 200 chars), use it as tagline
  if (firstLine.length <= 200) {
    return firstLine;
  }

  // Otherwise, try to find first sentence
  const sentenceMatch = firstLine.match(/^[^.!?]+[.!?]/);
  if (sentenceMatch && sentenceMatch[0].length <= 200) {
    return sentenceMatch[0].trim();
  }

  // Fall back to truncated first line
  return firstLine.slice(0, 200);
}

/**
 * Extract vote count from content if present.
 * Product Hunt RSS doesn't include votes in a structured way,
 * but some feeds might embed it in text like "123 upvotes" or "123 votes"
 */
function extractVotes(text: string | null): number | null {
  if (!text) return null;

  // Look for patterns like "123 upvotes", "123 votes", "123 points"
  const votePatterns = [/(\d+)\s*upvotes?/i, /(\d+)\s*votes?/i, /(\d+)\s*points?/i];

  for (const pattern of votePatterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      const count = parseInt(match[1], 10);
      if (!Number.isNaN(count) && count >= 0) {
        return count;
      }
    }
  }

  return null;
}

export async function normalizeProductHunt(
  raw: unknown,
  _params: FetchParams,
): Promise<ContentItemDraft> {
  const rec = asRecord(raw);

  // Extract fields from RssRawEntry shape (reused from RSS fetch)
  const guid = asString(rec.guid);
  const link = asString(rec.link);
  const title = asString(rec.title);
  const author = asString(rec.author);
  const publishedAt = asString(rec.published_at);
  const contentHtml = asString(rec.content_html);
  const contentText = asString(rec.content_text);
  const categories = asStringArray(rec.categories);
  const feedUrl = asString(rec.feed_url);

  const canonicalUrl = link;
  const externalId = guid;

  // Body text: prefer content over summary, strip HTML to plain text
  let bodyText: string | null = null;
  if (contentHtml) {
    bodyText = stripHtml(contentHtml);
  } else if (contentText) {
    bodyText = stripHtml(contentText);
  }

  if (bodyText) {
    bodyText = clampText(bodyText, 50_000);
    if (bodyText.length === 0) bodyText = null;
  }

  // Extract Product Hunt-specific fields
  const tagline = extractTagline(bodyText);
  const votes = extractVotes(contentHtml ?? contentText);

  // Build metadata with PH-specific fields
  const metadata: Record<string, unknown> = {};
  if (feedUrl) metadata.feed_url = feedUrl;
  if (categories.length > 0) metadata.topics = categories;
  if (guid) metadata.guid = guid;
  if (tagline) metadata.tagline = tagline;
  if (author) metadata.maker = author;
  if (votes !== null) metadata.votes = votes;

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
    sourceType: "producthunt",
    externalId,
    publishedAt,
    author,
    metadata,
    raw: rawData,
  };
}
