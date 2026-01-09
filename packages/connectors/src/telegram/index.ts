/**
 * Telegram connector for fetching messages from public Telegram channels via Bot API.
 *
 * Requirements:
 * 1. A Telegram bot created via @BotFather
 * 2. Bot must be added as admin to target channels to receive channel posts
 * 3. TELEGRAM_BOT_TOKEN environment variable must be set
 *
 * For public channels without admin access, the connector will return an appropriate
 * error message explaining the limitation. The Telegram Bot API requires bots to be
 * channel admins to receive channel_post updates via getUpdates.
 */
import type { Connector } from "../types";
import { fetchTelegram } from "./fetch";
import { normalizeTelegram } from "./normalize";

export type { TelegramSourceConfig } from "./config";
export { parseConfig } from "./config";

export const telegramConnector: Connector = {
  sourceType: "telegram",
  fetch: fetchTelegram,
  normalize: normalizeTelegram,
};
