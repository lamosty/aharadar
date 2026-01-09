import type { ContentItemDraft, FetchParams } from "@aharadar/shared";

import type { YoutubeRawEntry } from "./fetch";

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value.trim() : null;
}

/**
 * Clamp text to a max character length.
 */
function clampText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars);
}

/**
 * Truncate description at word boundary.
 */
function truncateAtWord(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;

  // Find last space before maxChars
  const truncated = text.slice(0, maxChars);
  const lastSpace = truncated.lastIndexOf(" ");

  if (lastSpace > maxChars * 0.7) {
    return truncated.slice(0, lastSpace) + "...";
  }

  return truncated + "...";
}

export async function normalizeYoutube(
  raw: unknown,
  _params: FetchParams,
): Promise<ContentItemDraft> {
  const rec = asRecord(raw);

  // Extract fields from YoutubeRawEntry shape
  const videoId = asString(rec.video_id);
  const channelId = asString(rec.channel_id);
  const title = asString(rec.title);
  const description = asString(rec.description);
  const author = asString(rec.author);
  const publishedAt = asString(rec.published_at);
  const updatedAt = asString(rec.updated_at);
  const thumbnailUrl = asString(rec.thumbnail_url);
  const canonicalUrl = asString(rec.canonical_url);

  // Body text: video description (truncated to first ~500 chars at word boundary)
  // This is intentionally short as video descriptions are often promotional/links
  let bodyText: string | null = null;
  if (description) {
    bodyText = truncateAtWord(description, 500);
    if (bodyText.length === 0) bodyText = null;
  }

  // Build metadata
  const metadata: Record<string, unknown> = {};
  if (videoId) metadata.video_id = videoId;
  if (channelId) metadata.channel_id = channelId;
  if (thumbnailUrl) metadata.thumbnail_url = thumbnailUrl;
  if (updatedAt) metadata.updated_at = updatedAt;

  // Build raw for debugging (bounded)
  const rawData: Record<string, unknown> = {
    video_id: videoId,
    channel_id: channelId,
    title,
    description: description ? clampText(description, 2000) : null,
    author,
    published_at: publishedAt,
    updated_at: updatedAt,
    thumbnail_url: thumbnailUrl,
    canonical_url: canonicalUrl,
  };

  return {
    title,
    bodyText,
    canonicalUrl,
    sourceType: "youtube",
    externalId: videoId, // YouTube video ID is unique
    publishedAt,
    author,
    metadata,
    raw: rawData,
  };
}
