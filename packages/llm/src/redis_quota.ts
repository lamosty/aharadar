/**
 * Redis-backed quota tracking for subscription providers.
 *
 * Stores hourly usage in Redis so both API server and worker
 * share the same quota state. Falls back to in-memory if Redis
 * is not initialized.
 *
 * Keys use hourly time buckets that auto-expire after 2 hours.
 */

import type { Redis } from "ioredis";

// Redis client - must be initialized before use
let redisClient: Redis | null = null;

// Key prefix for quota tracking
const KEY_PREFIX = "quota";

// TTL for quota keys (2 hours - ensures cleanup after hour boundary)
const KEY_TTL_SECONDS = 2 * 60 * 60;

/**
 * Initialize Redis quota tracking.
 * Call this on startup in both API and worker.
 */
export function initRedisQuota(redis: Redis): void {
  redisClient = redis;
}

/**
 * Check if Redis quota tracking is available.
 */
export function isRedisQuotaEnabled(): boolean {
  return redisClient !== null;
}

/**
 * Get current hour bucket key for a provider.
 * Format: quota:{provider}:{hourTimestamp}
 */
function getHourKey(provider: "claude" | "codex"): string {
  const hourBucket = Math.floor(Date.now() / (60 * 60 * 1000));
  return `${KEY_PREFIX}:${provider}:${hourBucket}`;
}

/**
 * Get hour boundary timestamp for reset time calculation.
 */
export function getHourResetTime(): Date {
  const hourBucket = Math.floor(Date.now() / (60 * 60 * 1000));
  const nextHourBucket = hourBucket + 1;
  return new Date(nextHourBucket * 60 * 60 * 1000);
}

/**
 * Record usage for a subscription provider in Redis.
 * @returns Updated usage count, or null if Redis not available
 */
export async function recordRedisUsage(
  provider: "claude" | "codex",
  field: "calls" | "searches" | "thinkingTokens",
  increment: number,
): Promise<number | null> {
  if (!redisClient) return null;

  const key = getHourKey(provider);

  // Use HINCRBY for atomic increment
  const newValue = await redisClient.hincrby(key, field, increment);

  // Set TTL on first write (EXPIRE only if key has no TTL)
  await redisClient.expire(key, KEY_TTL_SECONDS, "NX");

  return newValue;
}

/**
 * Get current usage for a subscription provider from Redis.
 * @returns Usage state, or null if Redis not available
 */
export async function getRedisUsage(
  provider: "claude" | "codex",
): Promise<{ calls: number; searches: number; thinkingTokens: number } | null> {
  if (!redisClient) return null;

  const key = getHourKey(provider);
  const data = await redisClient.hgetall(key);

  return {
    calls: parseInt(data.calls || "0", 10),
    searches: parseInt(data.searches || "0", 10),
    thinkingTokens: parseInt(data.thinkingTokens || "0", 10),
  };
}
