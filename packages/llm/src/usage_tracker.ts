/**
 * Usage tracker for Claude subscription mode.
 * Enforces hourly quotas to prevent subscription exhaustion.
 *
 * Note: In-memory tracker - resets on process restart.
 * For multi-process deployments, consider Redis-based tracking.
 */

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

// In-memory state
let usageState: ClaudeUsageState = {
  callsThisHour: 0,
  searchesThisHour: 0,
  thinkingTokensThisHour: 0,
  lastResetAt: new Date(),
};

function maybeResetHour(): void {
  const now = new Date();
  const hoursSinceReset = (now.getTime() - usageState.lastResetAt.getTime()) / (1000 * 60 * 60);

  if (hoursSinceReset >= 1) {
    usageState = {
      callsThisHour: 0,
      searchesThisHour: 0,
      thinkingTokensThisHour: 0,
      lastResetAt: now,
    };
  }
}

export function canUseClaudeSubscription(limits: ClaudeUsageLimits = DEFAULT_LIMITS): boolean {
  maybeResetHour();
  return usageState.callsThisHour < limits.callsPerHour;
}

export function canUseWebSearch(limits: ClaudeUsageLimits = DEFAULT_LIMITS): boolean {
  maybeResetHour();
  return usageState.searchesThisHour < limits.searchesPerHour;
}

export function canUseThinking(budgetTokens: number, limits: ClaudeUsageLimits = DEFAULT_LIMITS): boolean {
  maybeResetHour();
  return usageState.thinkingTokensThisHour + budgetTokens <= limits.thinkingTokensPerHour;
}

export function recordUsage(opts: { calls?: number; searches?: number; thinkingTokens?: number }): void {
  maybeResetHour();
  usageState.callsThisHour += opts.calls ?? 0;
  usageState.searchesThisHour += opts.searches ?? 0;
  usageState.thinkingTokensThisHour += opts.thinkingTokens ?? 0;
}

export function getUsageState(): Readonly<ClaudeUsageState> {
  maybeResetHour();
  return { ...usageState };
}

export function getUsageLimitsFromEnv(env: NodeJS.ProcessEnv = process.env): ClaudeUsageLimits {
  return {
    callsPerHour: parseInt(env.CLAUDE_CALLS_PER_HOUR ?? "") || DEFAULT_LIMITS.callsPerHour,
    searchesPerHour: parseInt(env.CLAUDE_SEARCHES_PER_HOUR ?? "") || DEFAULT_LIMITS.searchesPerHour,
    thinkingTokensPerHour:
      parseInt(env.CLAUDE_THINKING_TOKENS_PER_HOUR ?? "") || DEFAULT_LIMITS.thinkingTokensPerHour,
  };
}

export function getRemainingQuota(limits: ClaudeUsageLimits = DEFAULT_LIMITS): {
  calls: number;
  searches: number;
  thinkingTokens: number;
} {
  maybeResetHour();
  return {
    calls: Math.max(0, limits.callsPerHour - usageState.callsThisHour),
    searches: Math.max(0, limits.searchesPerHour - usageState.searchesThisHour),
    thinkingTokens: Math.max(0, limits.thinkingTokensPerHour - usageState.thinkingTokensThisHour),
  };
}
