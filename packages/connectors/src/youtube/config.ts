export interface YoutubeSourceConfig {
  channelId: string;
  maxVideoCount: number;
  includeTranscript: boolean;
  transcriptMaxChars: number;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value.trim() : null;
}

function asNumber(value: unknown, defaultValue: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : defaultValue;
}

function asBool(value: unknown, defaultValue: boolean): boolean {
  return typeof value === "boolean" ? value : defaultValue;
}

export function parseYoutubeSourceConfig(config: Record<string, unknown>): YoutubeSourceConfig {
  // Accept both snake_case and camelCase for UX flexibility
  const channelId = asString(config.channel_id) ?? asString(config.channelId);
  if (!channelId) {
    throw new Error('YouTube source config must include non-empty "channelId" or "channel_id"');
  }

  const maxRaw = config.max_video_count ?? config.maxVideoCount;
  const maxVideoCount = Math.max(1, Math.min(100, asNumber(maxRaw, 30)));

  const includeTranscript = asBool(config.include_transcript ?? config.includeTranscript, false);

  const transcriptMaxChars = Math.max(
    500,
    Math.min(5000, asNumber(config.transcript_max_chars ?? config.transcriptMaxChars, 2000)),
  );

  return {
    channelId,
    maxVideoCount,
    includeTranscript,
    transcriptMaxChars,
  };
}
