import type { Db, TopicRow } from "@aharadar/db";
import type { BudgetTier } from "@aharadar/shared";

// ============================================================================
// Scheduler Config
// ============================================================================

export interface SchedulerConfig {
  /**
   * Max windows to backfill per topic per tick.
   * Prevents runaway backfill when cursor is far behind.
   */
  maxBackfillWindows: number;

  /**
   * Minimum window duration in seconds.
   * Windows shorter than this are skipped.
   */
  minWindowSeconds: number;

  /**
   * Lag in seconds before a window is considered due.
   * Prevents scheduling windows too close to "now".
   */
  lagSeconds: number;
}

const DEFAULT_MAX_BACKFILL_WINDOWS = 6;
const DEFAULT_MIN_WINDOW_SECONDS = 60;
const DEFAULT_LAG_SECONDS = 60;

/**
 * Parse scheduler config from environment variables.
 */
export function parseSchedulerConfig(env: NodeJS.ProcessEnv = process.env): SchedulerConfig {
  const maxBackfillWindows = parseInt(env.SCHEDULER_MAX_BACKFILL_WINDOWS ?? "", 10);
  const minWindowSeconds = parseInt(env.SCHEDULER_MIN_WINDOW_SECONDS ?? "", 10);

  return {
    maxBackfillWindows:
      Number.isFinite(maxBackfillWindows) && maxBackfillWindows > 0
        ? maxBackfillWindows
        : DEFAULT_MAX_BACKFILL_WINDOWS,
    minWindowSeconds:
      Number.isFinite(minWindowSeconds) && minWindowSeconds > 0
        ? minWindowSeconds
        : DEFAULT_MIN_WINDOW_SECONDS,
    lagSeconds: DEFAULT_LAG_SECONDS,
  };
}

// ============================================================================
// Scheduled Window
// ============================================================================

export interface ScheduledWindow {
  userId: string;
  topicId: string;
  windowStart: string;
  windowEnd: string;
  mode: BudgetTier;
  /** Trigger source: scheduled (by scheduler tick) or manual (admin run) */
  trigger: "scheduled" | "manual";
}

// ============================================================================
// Window Generation (Topic-based)
// ============================================================================

/**
 * Generate due windows for a topic based on its digest schedule settings.
 *
 * Algorithm:
 * 1. Load topic row and read: digest_schedule_enabled, digest_interval_minutes,
 *    digest_mode, digest_cursor_end
 * 2. If schedule disabled → return []
 * 3. Compute intervalMs and initialize cursor:
 *    - if digest_cursor_end exists: cursorEndMs = Date(digest_cursor_end).getTime()
 *    - else: cursorEndMs = floor(nowMs / 60_000)*60_000 - intervalMs
 * 4. Generate up to maxBackfillWindows windows where:
 *    - windowStart = cursorEndMs
 *    - windowEnd = cursorEndMs + intervalMs
 *    - only emit if windowEnd <= nowMs - lagSeconds
 *    - advance cursorEndMs per emitted window
 * 5. Return windows with mode: topic.digest_mode
 */
export async function generateDueWindows(params: {
  db: Db;
  userId: string;
  topicId: string;
  config: SchedulerConfig;
  now?: Date;
}): Promise<ScheduledWindow[]> {
  const { db, userId, topicId, config, now: nowParam } = params;
  const now = nowParam ?? new Date();
  const nowMs = now.getTime();

  // Load topic to get digest settings
  const topic = await db.topics.getById(topicId);
  if (!topic) {
    return [];
  }

  // Check if scheduling is enabled
  if (!topic.digest_schedule_enabled) {
    return [];
  }

  // Calculate interval in milliseconds
  const intervalMs = topic.digest_interval_minutes * 60 * 1000;

  // Initialize cursor
  let cursorEndMs: number;
  if (topic.digest_cursor_end) {
    cursorEndMs = new Date(topic.digest_cursor_end).getTime();
  } else {
    // No cursor: start from now-rounded-to-minute minus one interval
    // This ensures we don't immediately generate a bunch of windows
    cursorEndMs = Math.floor(nowMs / 60_000) * 60_000 - intervalMs;
  }

  // Generate windows
  const windows: ScheduledWindow[] = [];
  const lagMs = config.lagSeconds * 1000;
  const maxWindows = config.maxBackfillWindows;

  for (let i = 0; i < maxWindows; i++) {
    const windowStart = cursorEndMs;
    const windowEnd = cursorEndMs + intervalMs;

    // Only emit if windowEnd is at least lagMs in the past
    if (windowEnd > nowMs - lagMs) {
      break;
    }

    // Safety check: window must be at least minWindowSeconds
    if (intervalMs < config.minWindowSeconds * 1000) {
      break;
    }

    windows.push({
      userId,
      topicId,
      windowStart: new Date(windowStart).toISOString(),
      windowEnd: new Date(windowEnd).toISOString(),
      mode: topic.digest_mode as BudgetTier,
      trigger: "scheduled",
    });

    // Advance cursor for next iteration
    cursorEndMs = windowEnd;
  }

  return windows;
}

// ============================================================================
// Topic Discovery
// ============================================================================

/**
 * Get all topics that should be scheduled.
 * Returns topics where digest_schedule_enabled=true for all users.
 */
export async function getSchedulableTopics(
  db: Db,
): Promise<Array<{ userId: string; topicId: string }>> {
  // For MVP: get all topics for the first user
  // In future, this could iterate over all users
  const user = await db.users.getFirstUser();
  if (!user) {
    return [];
  }

  const topics = await db.topics.listByUser(user.id);

  // Filter to only topics with scheduling enabled
  return topics
    .filter((t: TopicRow) => t.digest_schedule_enabled)
    .map((t: TopicRow) => ({ userId: user.id, topicId: t.id }));
}
