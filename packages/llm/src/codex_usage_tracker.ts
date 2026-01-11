/**
 * Usage tracker for Codex subscription mode.
 * Enforces hourly quotas to prevent subscription exhaustion.
 *
 * Note: In-memory tracker - resets on process restart.
 * For multi-process deployments, consider Redis-based tracking.
 */

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

// In-memory state
let usageState: CodexUsageState = {
  callsThisHour: 0,
  lastResetAt: new Date(),
};

function maybeResetHour(): void {
  const now = new Date();
  const hoursSinceReset = (now.getTime() - usageState.lastResetAt.getTime()) / (1000 * 60 * 60);

  if (hoursSinceReset >= 1) {
    usageState = {
      callsThisHour: 0,
      lastResetAt: now,
    };
  }
}

export function canUseCodexSubscription(limits: CodexUsageLimits = DEFAULT_LIMITS): boolean {
  maybeResetHour();
  return usageState.callsThisHour < limits.callsPerHour;
}

export function recordCodexUsage(opts: { calls?: number }): void {
  maybeResetHour();
  usageState.callsThisHour += opts.calls ?? 0;
}

export function getCodexUsageState(): Readonly<CodexUsageState> {
  maybeResetHour();
  return { ...usageState };
}

export function getCodexUsageLimitsFromEnv(env: NodeJS.ProcessEnv = process.env): CodexUsageLimits {
  return {
    callsPerHour: parseInt(env.CODEX_CALLS_PER_HOUR ?? "", 10) || DEFAULT_LIMITS.callsPerHour,
  };
}

export function getCodexRemainingQuota(limits: CodexUsageLimits = DEFAULT_LIMITS): {
  calls: number;
} {
  maybeResetHour();
  return {
    calls: Math.max(0, limits.callsPerHour - usageState.callsThisHour),
  };
}
