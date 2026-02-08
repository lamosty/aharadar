/**
 * OpenAI Codex subscription mode provider using the Codex SDK.
 * Uses ChatGPT subscription credentials from `codex` CLI login.
 *
 * EXPERIMENTAL - For personal use only, not SaaS production.
 * Works with ChatGPT Plus ($20/mo), Pro ($200/mo), Business, Edu, Enterprise.
 */

import { recordCodexUsage } from "./codex_usage_tracker";
import { classifyLlmProviderError } from "./error_classification";
import type { LlmCallResult, LlmRequest, ModelRef } from "./types";

export interface CodexSubscriptionConfig {
  /** Working directory for Codex thread (default: process.cwd()) */
  workingDirectory?: string;
}

const DEFAULT_CONFIG: CodexSubscriptionConfig = {
  workingDirectory: undefined,
};

// Logging helper - can be replaced with proper logger
const log = {
  debug: (msg: string, data?: Record<string, unknown>) => {
    if (process.env.CODEX_SUBSCRIPTION_DEBUG === "true") {
      console.log(`[codex-sub] ${msg}`, data ? JSON.stringify(data) : "");
    }
  },
  warn: (msg: string, data?: Record<string, unknown>) => {
    console.warn(`[codex-sub] ${msg}`, data ? JSON.stringify(data) : "");
  },
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

  log.debug("Starting call", {
    model: ref.model,
    promptLength: request.user.length,
    hasSystem: !!request.system,
  });

  try {
    // Dynamic import for ESM-only module in CommonJS context.
    // Use Function constructor to prevent TypeScript from transforming this
    // to require(), which doesn't work with ESM-only packages.
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const importDynamic = new Function("modulePath", "return import(modulePath)") as (
      path: string,
    ) => Promise<{ Codex: unknown }>;
    const mod = await importDynamic("@openai/codex-sdk");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const CodexClass = mod.Codex as any;

    const codex = new CodexClass();
    const thread = codex.startThread({
      model: ref.model, // Use the resolved model (e.g., gpt-5.1)
      ...(mergedConfig.workingDirectory ? { workingDirectory: mergedConfig.workingDirectory } : {}),
    });

    // Build the prompt combining system and user content
    const fullPrompt = request.system ? `${request.system}\n\n${request.user}` : request.user;

    log.debug("Running thread", { promptLength: fullPrompt.length });

    // Use run() for simple request/response pattern
    const turn = await thread.run(fullPrompt);

    const finalResponse = typeof turn.finalResponse === "string" ? turn.finalResponse.trim() : "";

    log.debug("Call complete", {
      responseLength: finalResponse.length,
      hasResponse: finalResponse.length > 0,
    });

    if (finalResponse.length === 0) {
      log.warn("SDK returned empty response", { model: ref.model });
    }

    // Record usage for quota tracking
    recordCodexUsage({ calls: 1 });

    // Note: Subscription mode doesn't expose token counts for billing
    // We return 0 - cost tracking happens via OpenAI's subscription billing
    return {
      outputText: finalResponse,
      rawResponse: turn,
      inputTokens: 0, // Not available in subscription mode
      outputTokens: 0, // Not available in subscription mode
      endpoint: "codex-subscription",
    };
  } catch (error) {
    // Enrich error with context
    const err = classifyLlmProviderError(error);
    log.warn("Call failed", {
      error: err.message,
      model: ref.model,
    });
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
