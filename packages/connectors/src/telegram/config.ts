/**
 * Telegram connector configuration.
 *
 * This connector fetches messages from public Telegram channels via Bot API.
 *
 * Requirements:
 * 1. A Telegram bot created via @BotFather
 * 2. Bot must be added as admin to target channels to receive channel posts
 * 3. TELEGRAM_BOT_TOKEN environment variable must be set
 *
 * Note: For public channels without admin access, the connector will return
 * an appropriate error message explaining the limitation.
 */
export interface TelegramSourceConfig {
  /** List of channel usernames (with or without @) */
  channels: string[];

  /** Maximum messages to fetch per channel (default: 100) */
  maxMessagesPerChannel: number;

  /** Include media captions as body text (default: true) */
  includeMediaCaptions: boolean;

  /** Include forwarded messages (default: true) */
  includeForwards: boolean;
}

export function parseConfig(raw: Record<string, unknown>): TelegramSourceConfig {
  const channels = Array.isArray(raw.channels)
    ? raw.channels.filter((c): c is string => typeof c === "string" && c.trim().length > 0)
    : [];

  const maxMessagesPerChannel =
    typeof raw.maxMessagesPerChannel === "number" && Number.isFinite(raw.maxMessagesPerChannel)
      ? Math.max(1, Math.min(raw.maxMessagesPerChannel, 100))
      : 100;

  const includeMediaCaptions =
    typeof raw.includeMediaCaptions === "boolean" ? raw.includeMediaCaptions : true;

  const includeForwards = typeof raw.includeForwards === "boolean" ? raw.includeForwards : true;

  return {
    channels: channels.map((c) => c.replace(/^@/, "").trim()),
    maxMessagesPerChannel,
    includeMediaCaptions,
    includeForwards,
  };
}
