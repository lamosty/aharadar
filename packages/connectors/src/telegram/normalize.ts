/**
 * Telegram connector normalize implementation.
 *
 * Converts raw telegram_message_v1 items into ContentItemDraft.
 * Messages are canonical content items with stable URLs and IDs.
 */
import type { ContentItemDraft, FetchParams } from "@aharadar/shared";

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asBool(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function clampText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars);
}

function unixToIso(timestamp: number): string {
  return new Date(timestamp * 1000).toISOString();
}

function buildCanonicalUrl(channelUsername: string, messageId: number): string {
  return `https://t.me/${channelUsername}/${messageId}`;
}

function buildExternalId(channelId: number, messageId: number): string {
  return `${channelId}_${messageId}`;
}

export async function normalizeTelegram(
  raw: unknown,
  params: FetchParams,
): Promise<ContentItemDraft> {
  const rec = asRecord(raw);

  // Extract fields from raw item
  const channelId = asNumber(rec.channel_id);
  const channelUsername = asString(rec.channel_username) ?? "unknown";
  const channelTitle = asString(rec.channel_title);
  const messageId = asNumber(rec.message_id) ?? 0;
  const date = asNumber(rec.date);
  const text = asString(rec.text);
  const caption = asString(rec.caption);
  const messageType = asString(rec.message_type) ?? "unknown";
  const hasMedia = asBool(rec.has_media) ?? false;
  const forwardFrom = asString(rec.forward_from);
  const views = asNumber(rec.views);

  // Build body text from text or caption
  const bodyText = text ?? caption;
  const clampedBodyText = bodyText ? clampText(bodyText.trim(), 10_000) : null;

  // Build external ID and canonical URL
  const externalId = channelId !== null ? buildExternalId(channelId, messageId) : null;
  const canonicalUrl = buildCanonicalUrl(channelUsername, messageId);

  // Convert Unix timestamp to ISO
  const publishedAt = date !== null ? unixToIso(date) : null;

  // Author is the channel name
  const author = channelTitle ?? `@${channelUsername}`;

  return {
    title: null, // Short-form content, no title
    bodyText: clampedBodyText,
    canonicalUrl,
    sourceType: "telegram",
    externalId,
    publishedAt,
    author,
    metadata: {
      channel_id: channelId,
      channel_username: channelUsername,
      channel_title: channelTitle,
      message_type: messageType,
      has_media: hasMedia,
      forward_from: forwardFrom,
      views,
      window_start: params.windowStart,
      window_end: params.windowEnd,
    },
    raw: {
      kind: "telegram_message_v1",
      channel_id: channelId,
      channel_username: channelUsername,
      message_id: messageId,
      date,
      message_type: messageType,
    },
  };
}
