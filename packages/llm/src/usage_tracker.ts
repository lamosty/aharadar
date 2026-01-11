/**
 * Usage tracker for Claude subscription mode.
 * Enforces hourly quotas to prevent subscription exhaustion.
 *
 * Uses Redis for shared state when available (multi-process).
 * Falls back to in-memory tracking when Redis is not initialized.
 */

import {
  getHourResetTime,
  getRedisUsage,
  isRedisQuotaEnabled,
  recordRedisUsage,
} from "./redis_quota";

export interface ClaudeUsageLimits {
  callsPerHour: number;
  searchesPerHour: number;
  thinkingTokensPerHour: number;
}

export interface ClaudeUsageState {
  callsThisHour: number;
  searchesThisHour: number;
  thinkingTokensThisHour: number;
  lastResetAt: Date;
}

const DEFAULT_LIMITS: ClaudeUsageLimits = {
  callsPerHour: 100,
  searchesPerHour: 20,
  thinkingTokensPerHour: 50000,
};

// In-memory fallback state (only used when Redis unavailable)
let fallbackState: ClaudeUsageState = {
  callsThisHour: 0,
  searchesThisHour: 0,
  thinkingTokensThisHour: 0,
  lastResetAt: new Date(),
};

function maybeResetFallbackHour(): void {
  const now = new Date();
  const hoursSinceReset = (now.getTime() - fallbackState.lastResetAt.getTime()) / (1000 * 60 * 60);

  if (hoursSinceReset >= 1) {
    fallbackState = {
      callsThisHour: 0,
      searchesThisHour: 0,
      thinkingTokensThisHour: 0,
      lastResetAt: now,
    };
  }
}

// Cached Redis state for sync operations
let cachedRedisState: ClaudeUsageState | null = null;
let cacheExpiry = 0;
const CACHE_TTL_MS = 1000; // 1 second cache

async function getRedisState(): Promise<ClaudeUsageState | null> {
  if (!isRedisQuotaEnabled()) return null;

  // Return cached state if fresh
  if (cachedRedisState && Date.now() < cacheExpiry) {
    return cachedRedisState;
  }

  const usage = await getRedisUsage("claude");
  if (!usage) return null;

  cachedRedisState = {
    callsThisHour: usage.calls,
    searchesThisHour: usage.searches,
    thinkingTokensThisHour: usage.thinkingTokens,
    lastResetAt: new Date(), // Redis keys auto-reset hourly
  };
  cacheExpiry = Date.now() + CACHE_TTL_MS;

  return cachedRedisState;
}

export function canUseClaudeSubscription(limits: ClaudeUsageLimits = DEFAULT_LIMITS): boolean {
  // Sync check uses cached state or fallback
  if (cachedRedisState && Date.now() < cacheExpiry) {
    return cachedRedisState.callsThisHour < limits.callsPerHour;
  }
  maybeResetFallbackHour();
  return fallbackState.callsThisHour < limits.callsPerHour;
}

export function canUseWebSearch(limits: ClaudeUsageLimits = DEFAULT_LIMITS): boolean {
  if (cachedRedisState && Date.now() < cacheExpiry) {
    return cachedRedisState.searchesThisHour < limits.searchesPerHour;
  }
  maybeResetFallbackHour();
  return fallbackState.searchesThisHour < limits.searchesPerHour;
}

export function canUseThinking(
  budgetTokens: number,
  limits: ClaudeUsageLimits = DEFAULT_LIMITS,
): boolean {
  if (cachedRedisState && Date.now() < cacheExpiry) {
    return cachedRedisState.thinkingTokensThisHour + budgetTokens <= limits.thinkingTokensPerHour;
  }
  maybeResetFallbackHour();
  return fallbackState.thinkingTokensThisHour + budgetTokens <= limits.thinkingTokensPerHour;
}

export async function recordUsageAsync(opts: {
  calls?: number;
  searches?: number;
  thinkingTokens?: number;
}): Promise<void> {
  if (isRedisQuotaEnabled()) {
    // Record to Redis
    if (opts.calls) {
      const newValue = await recordRedisUsage("claude", "calls", opts.calls);
      if (cachedRedisState && newValue !== null) {
        cachedRedisState.callsThisHour = newValue;
      }
    }
    if (opts.searches) {
      const newValue = await recordRedisUsage("claude", "searches", opts.searches);
      if (cachedRedisState && newValue !== null) {
        cachedRedisState.searchesThisHour = newValue;
      }
    }
    if (opts.thinkingTokens) {
      const newValue = await recordRedisUsage("claude", "thinkingTokens", opts.thinkingTokens);
      if (cachedRedisState && newValue !== null) {
        cachedRedisState.thinkingTokensThisHour = newValue;
      }
    }
  } else {
    // Fallback to in-memory
    maybeResetFallbackHour();
    fallbackState.callsThisHour += opts.calls ?? 0;
    fallbackState.searchesThisHour += opts.searches ?? 0;
    fallbackState.thinkingTokensThisHour += opts.thinkingTokens ?? 0;
  }
}

/**
 * Sync version for backward compatibility.
 * Schedules Redis update but doesn't wait for it.
 */
export function recordUsage(opts: {
  calls?: number;
  searches?: number;
  thinkingTokens?: number;
}): void {
  // Fire and forget async operation
  recordUsageAsync(opts).catch(() => {
    // Ignore errors, fall back to in-memory
    maybeResetFallbackHour();
    fallbackState.callsThisHour += opts.calls ?? 0;
    fallbackState.searchesThisHour += opts.searches ?? 0;
    fallbackState.thinkingTokensThisHour += opts.thinkingTokens ?? 0;
  });

  // Also update local state immediately for sync checks
  if (cachedRedisState) {
    cachedRedisState.callsThisHour += opts.calls ?? 0;
    cachedRedisState.searchesThisHour += opts.searches ?? 0;
    cachedRedisState.thinkingTokensThisHour += opts.thinkingTokens ?? 0;
  } else {
    maybeResetFallbackHour();
    fallbackState.callsThisHour += opts.calls ?? 0;
    fallbackState.searchesThisHour += opts.searches ?? 0;
    fallbackState.thinkingTokensThisHour += opts.thinkingTokens ?? 0;
  }
}

export async function getUsageStateAsync(): Promise<ClaudeUsageState> {
  const redisState = await getRedisState();
  if (redisState) {
    return redisState;
  }
  maybeResetFallbackHour();
  return { ...fallbackState };
}

export function getUsageState(): Readonly<ClaudeUsageState> {
  // Return cached Redis state or fallback
  if (cachedRedisState && Date.now() < cacheExpiry) {
    return { ...cachedRedisState };
  }
  maybeResetFallbackHour();
  return { ...fallbackState };
}

export function getUsageLimitsFromEnv(env: NodeJS.ProcessEnv = process.env): ClaudeUsageLimits {
  return {
    callsPerHour: parseInt(env.CLAUDE_CALLS_PER_HOUR ?? "", 10) || DEFAULT_LIMITS.callsPerHour,
    searchesPerHour:
      parseInt(env.CLAUDE_SEARCHES_PER_HOUR ?? "", 10) || DEFAULT_LIMITS.searchesPerHour,
    thinkingTokensPerHour:
      parseInt(env.CLAUDE_THINKING_TOKENS_PER_HOUR ?? "", 10) ||
      DEFAULT_LIMITS.thinkingTokensPerHour,
  };
}

export function getRemainingQuota(limits: ClaudeUsageLimits = DEFAULT_LIMITS): {
  calls: number;
  searches: number;
  thinkingTokens: number;
} {
  const state = getUsageState();
  return {
    calls: Math.max(0, limits.callsPerHour - state.callsThisHour),
    searches: Math.max(0, limits.searchesPerHour - state.searchesThisHour),
    thinkingTokens: Math.max(0, limits.thinkingTokensPerHour - state.thinkingTokensThisHour),
  };
}

export async function getRemainingQuotaAsync(limits: ClaudeUsageLimits = DEFAULT_LIMITS): Promise<{
  calls: number;
  searches: number;
  thinkingTokens: number;
}> {
  const state = await getUsageStateAsync();
  return {
    calls: Math.max(0, limits.callsPerHour - state.callsThisHour),
    searches: Math.max(0, limits.searchesPerHour - state.searchesThisHour),
    thinkingTokens: Math.max(0, limits.thinkingTokensPerHour - state.thinkingTokensThisHour),
  };
}

/**
 * Refresh the cached state from Redis.
 * Call this periodically or before quota checks.
 */
export async function refreshQuotaCache(): Promise<void> {
  if (isRedisQuotaEnabled()) {
    await getRedisState();
  }
}
