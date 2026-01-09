/**
 * Telegram connector fetch implementation.
 *
 * Fetches messages from public Telegram channels via Bot API.
 * Uses getUpdates endpoint to receive channel posts.
 *
 * Requirements:
 * - TELEGRAM_BOT_TOKEN environment variable
 * - Bot must be added as admin to target channels
 *
 * Handles:
 * - Rate limiting (429 errors with retry_after)
 * - Common errors (chat not found, bot kicked, etc.)
 * - Cursor tracking via last_update_id per channel
 */
import type { FetchParams, FetchResult } from "@aharadar/shared";
import { parseConfig } from "./config";

interface TelegramUpdate {
  update_id: number;
  channel_post?: TelegramMessage;
  edited_channel_post?: TelegramMessage;
}

interface TelegramMessage {
  message_id: number;
  date: number;
  chat: {
    id: number;
    type: string;
    title?: string;
    username?: string;
  };
  from?: {
    id: number;
    first_name: string;
    last_name?: string;
    username?: string;
  };
  text?: string;
  caption?: string;
  forward_from_chat?: {
    id: number;
    type: string;
    title?: string;
    username?: string;
  };
  forward_date?: number;
  photo?: unknown[];
  video?: unknown;
  audio?: unknown;
  document?: unknown;
  voice?: unknown;
  views?: number;
}

interface TelegramApiResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
  parameters?: {
    retry_after?: number;
  };
}

interface RawTelegramItem {
  kind: "telegram_message_v1";
  channel_id: number;
  channel_username: string;
  channel_title: string | null;
  message_id: number;
  date: number;
  text: string | null;
  caption: string | null;
  message_type: string;
  has_media: boolean;
  forward_from: string | null;
  views: number | null;
  update_id: number;
  windowStart: string;
  windowEnd: string;
}

function getBotToken(): string | null {
  return process.env.TELEGRAM_BOT_TOKEN ?? null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function telegramApiCall<T>(
  endpoint: string,
  params: Record<string, string | number>,
  token: string,
): Promise<TelegramApiResponse<T>> {
  const url = new URL(`https://api.telegram.org/bot${token}/${endpoint}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });

  return response.json() as Promise<TelegramApiResponse<T>>;
}

async function getUpdates(
  token: string,
  offset?: number,
  limit: number = 100,
  retryCount: number = 0,
): Promise<TelegramApiResponse<TelegramUpdate[]>> {
  const params: Record<string, string | number> = {
    allowed_updates: JSON.stringify(["channel_post", "edited_channel_post"]),
    limit,
  };

  if (offset !== undefined) {
    params.offset = offset;
  }

  const response = await telegramApiCall<TelegramUpdate[]>("getUpdates", params, token);

  // Handle rate limiting
  if (!response.ok && response.error_code === 429 && response.parameters?.retry_after) {
    if (retryCount < 3) {
      const waitTime = response.parameters.retry_after * 1000;
      await sleep(waitTime);
      return getUpdates(token, offset, limit, retryCount + 1);
    }
  }

  return response;
}

function determineMessageType(message: TelegramMessage): string {
  if (message.photo && Array.isArray(message.photo) && message.photo.length > 0) return "photo";
  if (message.video) return "video";
  if (message.audio) return "audio";
  if (message.document) return "document";
  if (message.voice) return "voice";
  if (message.text) return "text";
  return "unknown";
}

function hasMedia(message: TelegramMessage): boolean {
  return !!(
    (message.photo && Array.isArray(message.photo) && message.photo.length > 0) ||
    message.video ||
    message.audio ||
    message.document ||
    message.voice
  );
}

function getForwardFrom(message: TelegramMessage): string | null {
  if (message.forward_from_chat) {
    return message.forward_from_chat.username ?? message.forward_from_chat.title ?? null;
  }
  return null;
}

function extractRawItem(
  message: TelegramMessage,
  channelUsername: string,
  updateId: number,
  windowStart: string,
  windowEnd: string,
): RawTelegramItem {
  return {
    kind: "telegram_message_v1",
    channel_id: message.chat.id,
    channel_username: channelUsername,
    channel_title: message.chat.title ?? null,
    message_id: message.message_id,
    date: message.date,
    text: message.text ?? null,
    caption: message.caption ?? null,
    message_type: determineMessageType(message),
    has_media: hasMedia(message),
    forward_from: getForwardFrom(message),
    views: message.views ?? null,
    update_id: updateId,
    windowStart,
    windowEnd,
  };
}

function getCursorValue(cursor: Record<string, unknown>, channel: string): number | undefined {
  const key = `last_update_id_${channel}`;
  const value = cursor[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export async function fetchTelegram(params: FetchParams): Promise<FetchResult> {
  const token = getBotToken();
  if (!token) {
    return {
      rawItems: [],
      nextCursor: { ...params.cursor },
      meta: {
        error: "TELEGRAM_BOT_TOKEN environment variable is not set",
        errorCode: "missing_token",
      },
    };
  }

  const config = parseConfig(params.config);

  if (config.channels.length === 0) {
    return {
      rawItems: [],
      nextCursor: { ...params.cursor },
      meta: {
        error: "No channels configured",
        errorCode: "no_channels",
      },
    };
  }

  // Get the minimum last_update_id from all channels to use as offset
  let minOffset: number | undefined;
  for (const channel of config.channels) {
    const offset = getCursorValue(params.cursor, channel);
    if (offset !== undefined) {
      minOffset = minOffset === undefined ? offset : Math.min(minOffset, offset);
    }
  }

  // Fetch updates from Telegram
  const response = await getUpdates(
    token,
    minOffset !== undefined ? minOffset + 1 : undefined,
    config.maxMessagesPerChannel * config.channels.length,
  );

  if (!response.ok) {
    const errorCode = response.error_code;
    let errorMessage = response.description ?? "Unknown Telegram API error";

    // Handle common errors
    if (errorCode === 401) {
      errorMessage = "Invalid bot token. Please check TELEGRAM_BOT_TOKEN environment variable.";
    } else if (errorCode === 403) {
      errorMessage =
        "Bot is forbidden from accessing the channel. The bot must be added as an admin to receive channel posts.";
    } else if (errorCode === 400 && response.description?.includes("chat not found")) {
      errorMessage =
        "Channel not found. Ensure the channel exists and the bot has been added as an admin.";
    }

    return {
      rawItems: [],
      nextCursor: { ...params.cursor },
      meta: {
        error: errorMessage,
        errorCode: `telegram_${errorCode ?? "unknown"}`,
      },
    };
  }

  const updates = response.result ?? [];
  const rawItems: RawTelegramItem[] = [];
  const nextCursor: Record<string, unknown> = { ...params.cursor };
  const channelSet = new Set(config.channels.map((c) => c.toLowerCase()));
  const channelMessageCounts: Record<string, number> = {};

  // Filter and extract messages
  for (const update of updates) {
    const message = update.channel_post ?? update.edited_channel_post;
    if (!message) continue;

    // Check if this is from a configured channel
    const channelUsername = message.chat.username?.toLowerCase() ?? "";
    if (!channelSet.has(channelUsername)) continue;

    // Check message count limit per channel
    const currentCount = channelMessageCounts[channelUsername] ?? 0;
    if (currentCount >= config.maxMessagesPerChannel) continue;

    // Check if message is a forward and if we should skip it
    if (!config.includeForwards && message.forward_from_chat) continue;

    // Get text content
    const textContent = message.text ?? (config.includeMediaCaptions ? message.caption : null);

    // Skip messages with no text content unless they have media
    if (!textContent && !hasMedia(message)) continue;

    // Filter by time window
    const messageDate = new Date(message.date * 1000).toISOString();
    if (messageDate < params.windowStart || messageDate > params.windowEnd) continue;

    rawItems.push(
      extractRawItem(
        message,
        message.chat.username ?? channelUsername,
        update.update_id,
        params.windowStart,
        params.windowEnd,
      ),
    );

    channelMessageCounts[channelUsername] = currentCount + 1;

    // Update cursor for this channel
    const cursorKey = `last_update_id_${channelUsername}`;
    const existingCursor =
      typeof nextCursor[cursorKey] === "number" ? (nextCursor[cursorKey] as number) : 0;
    nextCursor[cursorKey] = Math.max(existingCursor, update.update_id);
  }

  // Also update a global last_update_id for efficiency
  if (updates.length > 0) {
    const maxUpdateId = Math.max(...updates.map((u) => u.update_id));
    const existingGlobal =
      typeof nextCursor.last_update_id === "number" ? (nextCursor.last_update_id as number) : 0;
    nextCursor.last_update_id = Math.max(existingGlobal, maxUpdateId);
  }

  return {
    rawItems,
    nextCursor,
    meta: {
      updatesReceived: updates.length,
      itemsExtracted: rawItems.length,
      channelMessageCounts,
    },
  };
}
