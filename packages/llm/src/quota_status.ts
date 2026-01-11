/**
 * Quota status for subscription providers.
 *
 * Exposes the current usage state for subscription providers
 * so the UI can display quota information.
 */

import {
  type CodexUsageLimits,
  getCodexRemainingQuota,
  getCodexUsageState,
} from "./codex_usage_tracker";
import { type ClaudeUsageLimits, getRemainingQuota, getUsageState } from "./usage_tracker";

export interface ProviderQuotaStatus {
  /** Calls used this hour */
  used: number;
  /** Calls limit per hour */
  limit: number;
  /** Calls remaining this hour */
  remaining: number;
  /** When the quota resets (approximate - hour boundary from last reset) */
  resetAt: string;
}

export interface QuotaStatusResponse {
  claude: ProviderQuotaStatus | null;
  codex: ProviderQuotaStatus | null;
}

/**
 * Get current quota status for all subscription providers.
 *
 * @param limits - Configured limits from DB settings
 * @returns Quota status for each subscription provider
 */
export function getQuotaStatus(limits: {
  claudeCallsPerHour: number;
  codexCallsPerHour: number;
}): QuotaStatusResponse {
  // Claude subscription status
  const claudeLimits: ClaudeUsageLimits = {
    callsPerHour: limits.claudeCallsPerHour,
    searchesPerHour: 20,
    thinkingTokensPerHour: 50000,
  };
  const claudeState = getUsageState();
  const claudeRemaining = getRemainingQuota(claudeLimits);

  // Codex subscription status
  const codexLimits: CodexUsageLimits = {
    callsPerHour: limits.codexCallsPerHour,
  };
  const codexState = getCodexUsageState();
  const codexRemaining = getCodexRemainingQuota(codexLimits);

  // Calculate reset time (hour from last reset)
  const claudeResetAt = new Date(claudeState.lastResetAt.getTime() + 60 * 60 * 1000);
  const codexResetAt = new Date(codexState.lastResetAt.getTime() + 60 * 60 * 1000);

  return {
    claude: {
      used: claudeState.callsThisHour,
      limit: limits.claudeCallsPerHour,
      remaining: claudeRemaining.calls,
      resetAt: claudeResetAt.toISOString(),
    },
    codex: {
      used: codexState.callsThisHour,
      limit: limits.codexCallsPerHour,
      remaining: codexRemaining.calls,
      resetAt: codexResetAt.toISOString(),
    },
  };
}
