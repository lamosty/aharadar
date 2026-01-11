/**
 * Pre-flight Quota Check
 *
 * Validates that subscription providers have sufficient quota
 * before starting a pipeline run.
 */

import {
  type CodexUsageLimits,
  canUseCodexSubscription,
  getCodexRemainingQuota,
} from "./codex_usage_tracker";
import {
  type ClaudeUsageLimits,
  canUseClaudeSubscription,
  getRemainingQuota,
} from "./usage_tracker";

export type SubscriptionProvider = "claude-subscription" | "codex-subscription";

export interface QuotaCheckParams {
  provider: string;
  expectedCalls: number;
  claudeCallsPerHour?: number;
  codexCallsPerHour?: number;
}

export interface QuotaCheckResult {
  ok: boolean;
  error?: string;
  remainingQuota?: number;
  expectedCalls?: number;
}

/**
 * Check if there's sufficient quota for a pipeline run.
 *
 * Returns ok: true for API providers (openai, anthropic) since they don't have hourly quotas.
 * For subscription providers, checks if remaining quota >= expected triage calls.
 */
export function checkQuotaForRun(params: QuotaCheckParams): QuotaCheckResult {
  const { provider, expectedCalls, claudeCallsPerHour = 100, codexCallsPerHour = 25 } = params;

  // API providers don't have hourly quotas - always OK
  if (provider === "openai" || provider === "anthropic") {
    return { ok: true };
  }

  if (provider === "claude-subscription") {
    const limits: ClaudeUsageLimits = {
      callsPerHour: claudeCallsPerHour,
      searchesPerHour: 20,
      thinkingTokensPerHour: 50000,
    };

    // First check if we can make any calls at all
    if (!canUseClaudeSubscription(limits)) {
      return {
        ok: false,
        error: `Claude subscription quota exhausted (${claudeCallsPerHour} calls/hour limit). Wait for quota reset or switch to API provider.`,
        remainingQuota: 0,
        expectedCalls,
      };
    }

    const remaining = getRemainingQuota(limits);

    if (remaining.calls < expectedCalls) {
      return {
        ok: false,
        error:
          `Insufficient Claude quota for this run. ` +
          `Expected ~${expectedCalls} triage calls but only ${remaining.calls} calls remaining this hour. ` +
          `Wait for quota reset, reduce digest depth, or switch to API provider.`,
        remainingQuota: remaining.calls,
        expectedCalls,
      };
    }

    return { ok: true, remainingQuota: remaining.calls, expectedCalls };
  }

  if (provider === "codex-subscription") {
    const limits: CodexUsageLimits = {
      callsPerHour: codexCallsPerHour,
    };

    if (!canUseCodexSubscription(limits)) {
      return {
        ok: false,
        error: `Codex subscription quota exhausted (${codexCallsPerHour} calls/hour limit). Wait for quota reset or switch to API provider.`,
        remainingQuota: 0,
        expectedCalls,
      };
    }

    const remaining = getCodexRemainingQuota(limits);

    if (remaining.calls < expectedCalls) {
      return {
        ok: false,
        error:
          `Insufficient Codex quota for this run. ` +
          `Expected ~${expectedCalls} triage calls but only ${remaining.calls} calls remaining this hour. ` +
          `Wait for quota reset, reduce digest depth, or switch to API provider.`,
        remainingQuota: remaining.calls,
        expectedCalls,
      };
    }

    return { ok: true, remainingQuota: remaining.calls, expectedCalls };
  }

  // Unknown provider - allow (fail later if truly invalid)
  return { ok: true };
}
