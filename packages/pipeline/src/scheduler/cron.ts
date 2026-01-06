import type { Db } from "@aharadar/db";
import type { BudgetTier } from "@aharadar/shared";

/**
 * Scheduler window mode.
 * - fixed_3x_daily: UTC windows [00:00,08:00), [08:00,16:00), [16:00,24:00)
 * - since_last_run: windowStart = last digest window_end (or now-24h), windowEnd = now
 */
export type SchedulerWindowMode = "fixed_3x_daily" | "since_last_run";

export interface SchedulerConfig {
  windowMode: SchedulerWindowMode;
}

export interface ScheduledWindow {
  userId: string;
  topicId: string;
  windowStart: string;
  windowEnd: string;
  mode?: BudgetTier;
}

/**
 * Parse SCHEDULER_WINDOW_MODE env var (default: fixed_3x_daily).
 */
export function parseSchedulerConfig(env: NodeJS.ProcessEnv = process.env): SchedulerConfig {
  const raw = env.SCHEDULER_WINDOW_MODE ?? "fixed_3x_daily";
  const windowMode: SchedulerWindowMode = raw === "since_last_run" ? "since_last_run" : "fixed_3x_daily";
  return { windowMode };
}

/**
 * Fixed 3× daily window boundaries in UTC.
 * Returns [start, end) for windows: [00:00,08:00), [08:00,16:00), [16:00,24:00)
 */
const FIXED_WINDOW_HOURS: Array<{ startHour: number; endHour: number }> = [
  { startHour: 0, endHour: 8 },
  { startHour: 8, endHour: 16 },
  { startHour: 16, endHour: 24 },
];

/**
 * Compute the current fixed window based on UTC time.
 */
function getCurrentFixedWindow(now: Date): { windowStart: Date; windowEnd: Date } {
  const hour = now.getUTCHours();
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  for (const { startHour, endHour } of FIXED_WINDOW_HOURS) {
    if (hour >= startHour && hour < endHour) {
      const windowStart = new Date(dayStart.getTime() + startHour * 60 * 60 * 1000);
      const windowEnd = new Date(dayStart.getTime() + endHour * 60 * 60 * 1000);
      return { windowStart, windowEnd };
    }
  }

  // Fallback (shouldn't happen)
  const windowStart = new Date(dayStart.getTime() + 16 * 60 * 60 * 1000);
  const windowEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  return { windowStart, windowEnd };
}

/**
 * Generate due windows for a user/topic based on the scheduler mode.
 *
 * For fixed_3x_daily: returns the current window if no digest exists for it yet.
 * For since_last_run: returns window from last digest end to now.
 */
export async function generateDueWindows(params: {
  db: Db;
  userId: string;
  topicId: string;
  config: SchedulerConfig;
  now?: Date;
}): Promise<ScheduledWindow[]> {
  const now = params.now ?? new Date();
  const { db, userId, topicId, config } = params;

  if (config.windowMode === "since_last_run") {
    // Get last digest for this user/topic
    const lastDigest = await db.digests.getLatestByUserAndTopic({ userId, topicId });

    let windowStart: Date;
    if (lastDigest) {
      windowStart = new Date(lastDigest.window_end);
    } else {
      // No previous digest: start 24h ago
      windowStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }

    const windowEnd = now;

    // Only generate if window has meaningful duration (at least 1 minute)
    if (windowEnd.getTime() - windowStart.getTime() < 60 * 1000) {
      return [];
    }

    return [
      {
        userId,
        topicId,
        windowStart: windowStart.toISOString(),
        windowEnd: windowEnd.toISOString(),
      },
    ];
  }

  // fixed_3x_daily mode
  const { windowStart, windowEnd } = getCurrentFixedWindow(now);

  // Check if digest already exists for this window
  // We use the DB uniqueness constraint: (user_id, topic_id, window_start, window_end, mode)
  // For idempotency, we query if a digest exists for this exact window
  const existingDigest = await db.query<{ id: string }>(
    `SELECT id FROM digests
     WHERE user_id = $1
       AND topic_id = $2::uuid
       AND window_start = $3::timestamptz
       AND window_end = $4::timestamptz
     LIMIT 1`,
    [userId, topicId, windowStart.toISOString(), windowEnd.toISOString()]
  );

  if (existingDigest.rows.length > 0) {
    // Window already processed
    return [];
  }

  return [
    {
      userId,
      topicId,
      windowStart: windowStart.toISOString(),
      windowEnd: windowEnd.toISOString(),
    },
  ];
}

/**
 * Get all topics for a user that should be scheduled.
 * For MVP, we schedule all topics for the singleton user.
 */
export async function getSchedulableTopics(db: Db): Promise<Array<{ userId: string; topicId: string }>> {
  const user = await db.users.getFirstUser();
  if (!user) {
    return [];
  }

  const topics = await db.topics.listByUser(user.id);
  return topics.map((t) => ({ userId: user.id, topicId: t.id }));
}
