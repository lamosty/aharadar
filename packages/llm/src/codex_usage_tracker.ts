/**
 * Usage tracker for Codex subscription mode.
 * Enforces hourly quotas to prevent subscription exhaustion.
 *
 * Uses Redis for shared state when available (multi-process).
 * Falls back to in-memory tracking when Redis is not initialized.
 */

import { getRedisUsage, isRedisQuotaEnabled, recordRedisUsage } from "./redis_quota";

export interface CodexUsageLimits {
  callsPerHour: number;
}

export interface CodexUsageState {
  callsThisHour: number;
  lastResetAt: Date;
}

const DEFAULT_LIMITS: CodexUsageLimits = {
  callsPerHour: 25, // Conservative default for ChatGPT Plus (~6-30/hr). Pro users can increase.
};

// In-memory fallback state (only used when Redis unavailable)
let fallbackState: CodexUsageState = {
  callsThisHour: 0,
  lastResetAt: new Date(),
};

function maybeResetFallbackHour(): void {
  const now = new Date();
  const hoursSinceReset = (now.getTime() - fallbackState.lastResetAt.getTime()) / (1000 * 60 * 60);

  if (hoursSinceReset >= 1) {
    fallbackState = {
      callsThisHour: 0,
      lastResetAt: now,
    };
  }
}

// Cached Redis state for sync operations
let cachedRedisState: CodexUsageState | null = null;
let cacheExpiry = 0;
const CACHE_TTL_MS = 1000; // 1 second cache

async function getRedisState(): Promise<CodexUsageState | null> {
  if (!isRedisQuotaEnabled()) return null;

  // Return cached state if fresh
  if (cachedRedisState && Date.now() < cacheExpiry) {
    return cachedRedisState;
  }

  const usage = await getRedisUsage("codex");
  if (!usage) return null;

  cachedRedisState = {
    callsThisHour: usage.calls,
    lastResetAt: new Date(), // Redis keys auto-reset hourly
  };
  cacheExpiry = Date.now() + CACHE_TTL_MS;

  return cachedRedisState;
}

export function canUseCodexSubscription(limits: CodexUsageLimits = DEFAULT_LIMITS): boolean {
  // Sync check uses cached state or fallback
  if (cachedRedisState && Date.now() < cacheExpiry) {
    return cachedRedisState.callsThisHour < limits.callsPerHour;
  }
  maybeResetFallbackHour();
  return fallbackState.callsThisHour < limits.callsPerHour;
}

export async function recordCodexUsageAsync(opts: { calls?: number }): Promise<void> {
  if (isRedisQuotaEnabled()) {
    if (opts.calls) {
      const newValue = await recordRedisUsage("codex", "calls", opts.calls);
      if (cachedRedisState && newValue !== null) {
        cachedRedisState.callsThisHour = newValue;
      }
    }
  } else {
    maybeResetFallbackHour();
    fallbackState.callsThisHour += opts.calls ?? 0;
  }
}

/**
 * Sync version for backward compatibility.
 * Schedules Redis update but doesn't wait for it.
 */
export function recordCodexUsage(opts: { calls?: number }): void {
  // Fire and forget async operation
  recordCodexUsageAsync(opts).catch(() => {
    // Ignore errors, fall back to in-memory
    maybeResetFallbackHour();
    fallbackState.callsThisHour += opts.calls ?? 0;
  });

  // Also update local state immediately for sync checks
  if (cachedRedisState) {
    cachedRedisState.callsThisHour += opts.calls ?? 0;
  } else {
    maybeResetFallbackHour();
    fallbackState.callsThisHour += opts.calls ?? 0;
  }
}

export async function getCodexUsageStateAsync(): Promise<CodexUsageState> {
  const redisState = await getRedisState();
  if (redisState) {
    return redisState;
  }
  maybeResetFallbackHour();
  return { ...fallbackState };
}

export function getCodexUsageState(): Readonly<CodexUsageState> {
  // Return cached Redis state or fallback
  if (cachedRedisState && Date.now() < cacheExpiry) {
    return { ...cachedRedisState };
  }
  maybeResetFallbackHour();
  return { ...fallbackState };
}

export function getCodexUsageLimitsFromEnv(env: NodeJS.ProcessEnv = process.env): CodexUsageLimits {
  return {
    callsPerHour: parseInt(env.CODEX_CALLS_PER_HOUR ?? "", 10) || DEFAULT_LIMITS.callsPerHour,
  };
}

export function getCodexRemainingQuota(limits: CodexUsageLimits = DEFAULT_LIMITS): {
  calls: number;
} {
  const state = getCodexUsageState();
  return {
    calls: Math.max(0, limits.callsPerHour - state.callsThisHour),
  };
}

export async function getCodexRemainingQuotaAsync(
  limits: CodexUsageLimits = DEFAULT_LIMITS,
): Promise<{
  calls: number;
}> {
  const state = await getCodexUsageStateAsync();
  return {
    calls: Math.max(0, limits.callsPerHour - state.callsThisHour),
  };
}

/**
 * Refresh the cached state from Redis.
 * Call this periodically or before quota checks.
 */
export async function refreshCodexQuotaCache(): Promise<void> {
  if (isRedisQuotaEnabled()) {
    await getRedisState();
  }
}
