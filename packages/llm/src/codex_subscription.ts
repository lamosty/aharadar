/**
 * OpenAI Codex subscription mode provider using the Codex SDK.
 * Uses ChatGPT subscription credentials from `codex` CLI login.
 *
 * EXPERIMENTAL - For personal use only, not SaaS production.
 * Works with ChatGPT Plus ($20/mo), Pro ($200/mo), Business, Edu, Enterprise.
 */

import { recordCodexUsage } from "./codex_usage_tracker";
import type { LlmCallResult, LlmRequest, ModelRef } from "./types";

export interface CodexSubscriptionConfig {
  /** Working directory for Codex thread (default: process.cwd()) */
  workingDirectory?: string;
}

const DEFAULT_CONFIG: CodexSubscriptionConfig = {
  workingDirectory: undefined,
};

/**
 * Call OpenAI using Codex SDK with ChatGPT subscription credentials.
 * Works without OPENAI_API_KEY when `codex` CLI is logged in.
 */
export async function callCodexSubscription(
  ref: ModelRef,
  request: LlmRequest,
  config: CodexSubscriptionConfig = {},
): Promise<LlmCallResult> {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };

  try {
    // Dynamic import for ESM-only module in CommonJS context
    const { Codex } = await import("@openai/codex-sdk");

    const codex = new Codex();
    const thread = codex.startThread({
      ...(mergedConfig.workingDirectory ? { workingDirectory: mergedConfig.workingDirectory } : {}),
    });

    // Build the prompt combining system and user content
    const fullPrompt = request.system ? `${request.system}\n\n${request.user}` : request.user;

    // Use run() for simple request/response pattern
    const turn = await thread.run(fullPrompt);

    // Record usage for quota tracking
    recordCodexUsage({ calls: 1 });

    // Note: Subscription mode doesn't expose token counts for billing
    // We return 0 - cost tracking happens via OpenAI's subscription billing
    return {
      outputText: typeof turn.finalResponse === "string" ? turn.finalResponse.trim() : "",
      rawResponse: turn,
      inputTokens: 0, // Not available in subscription mode
      outputTokens: 0, // Not available in subscription mode
      endpoint: "codex-subscription",
    };
  } catch (error) {
    // Enrich error with context
    const err = error instanceof Error ? error : new Error(String(error));
    const enrichedError = Object.assign(err, {
      provider: "codex-subscription",
      model: ref.model,
    });
    throw enrichedError;
  }
}

/**
 * Check if Codex subscription auth is likely available.
 * This checks for the absence of API key (which would take priority).
 */
export function isCodexSubscriptionAuthLikely(): boolean {
  // If API key is set, SDK will use that instead of subscription
  return !process.env.OPENAI_API_KEY;
}
