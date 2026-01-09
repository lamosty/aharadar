import type { ContentItemDraft, FetchParams } from "@aharadar/shared";

import type { PodcastRawEntry } from "./fetch";

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

export async function normalizePodcast(
  raw: unknown,
  _params: FetchParams,
): Promise<ContentItemDraft> {
  const rec = asRecord(raw);

  // Extract base fields from PodcastRawEntry shape
  const guid = asString(rec.guid);
  const link = asString(rec.link);
  const title = asString(rec.title);
  const author = asString(rec.author);
  const publishedAt = asString(rec.published_at);
  const contentHtml = asString(rec.content_html);
  const contentText = asString(rec.content_text);
  const categories = asStringArray(rec.categories);
  const feedUrl = asString(rec.feed_url);

  // Podcast-specific fields
  const enclosureUrl = asString(rec.enclosure_url);
  const duration = asString(rec.duration);
  const episodeNumber = asString(rec.episode_number);
  const season = asString(rec.season);

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

  // Build metadata with podcast-specific fields
  const metadata: Record<string, unknown> = {};
  if (feedUrl) metadata.feed_url = feedUrl;
  if (categories.length > 0) metadata.categories = categories;
  if (guid) metadata.guid = guid;
  if (enclosureUrl) metadata.enclosure_url = enclosureUrl;
  if (duration) metadata.duration = duration;
  if (episodeNumber) metadata.episode_number = episodeNumber;
  if (season) metadata.season = season;

  // Build raw for debugging (bounded)
  const rawEntry: PodcastRawEntry = {
    guid,
    link,
    title,
    author,
    published_at: publishedAt,
    content_html: contentHtml ? clampText(contentHtml, 10_000) : null,
    content_text: contentText ? clampText(contentText, 10_000) : null,
    categories,
    feed_url: feedUrl ?? "",
    enclosure_url: enclosureUrl,
    enclosure_type: asString(rec.enclosure_type),
    enclosure_length: asString(rec.enclosure_length),
    duration,
    episode_number: episodeNumber,
    season,
  };

  return {
    title,
    bodyText,
    canonicalUrl,
    sourceType: "podcast",
    externalId,
    publishedAt,
    author,
    metadata,
    raw: rawEntry,
  };
}
