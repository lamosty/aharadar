/**
 * Claude subscription mode provider using the Claude Agent SDK.
 * Uses subscription credentials from Claude Code login (macOS Keychain).
 *
 * EXPERIMENTAL - For personal use only, not SaaS production.
 * See docs/claude-integration.md for ToS considerations.
 */

import { query } from "@anthropic-ai/claude-agent-sdk";

import type { LlmCallResult, LlmRequest, ModelRef } from "./types";
import { recordUsage } from "./usage_tracker";

export interface ClaudeSubscriptionConfig {
  /** Max conversation turns (default: 1 for simple queries) */
  maxTurns?: number;
  /** USD budget limit for this call (optional) */
  maxBudgetUsd?: number;
  /** Enable extended thinking via system prompt hint */
  enableThinking?: boolean;
}

const DEFAULT_CONFIG: ClaudeSubscriptionConfig = {
  maxTurns: 1,
  enableThinking: false,
};

/**
 * Call Claude using subscription credentials via the Agent SDK.
 * Works without ANTHROPIC_API_KEY when Claude Code is logged in.
 */
export async function callClaudeSubscription(
  ref: ModelRef,
  request: LlmRequest,
  config: ClaudeSubscriptionConfig = {}
): Promise<LlmCallResult> {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };

  // Build system prompt with optional thinking hint
  let systemPrompt = request.system;
  if (mergedConfig.enableThinking) {
    systemPrompt = `${request.system}\n\nIMPORTANT: Think step-by-step before providing your final answer. Consider multiple perspectives and potential edge cases.`;
  }

  const messages: unknown[] = [];
  let resultText = "";

  try {
    const response = query({
      prompt: request.user,
      options: {
        model: ref.model,
        systemPrompt,
        allowedTools: [], // No tools for basic triage
        maxTurns: mergedConfig.maxTurns,
        ...(mergedConfig.maxBudgetUsd ? { maxBudgetUsd: mergedConfig.maxBudgetUsd } : {}),
      },
    });

    // Collect all messages and extract final result
    for await (const message of response) {
      messages.push(message);

      // Extract text from assistant messages
      if (isAssistantMessage(message)) {
        const content = message.content;
        if (typeof content === "string") {
          resultText = content;
        } else if (Array.isArray(content)) {
          const textBlocks = content
            .filter((block): block is { type: "text"; text: string } => block.type === "text")
            .map((block) => block.text);
          if (textBlocks.length > 0) {
            resultText = textBlocks.join("\n");
          }
        }
      }

      // Check for final result
      if (isResultMessage(message)) {
        resultText = message.result;
      }
    }

    // Record usage for quota tracking
    recordUsage({ calls: 1 });

    // Note: Subscription mode doesn't expose token counts
    // We return 0 - cost tracking happens via Anthropic's subscription billing
    return {
      outputText: resultText.trim(),
      rawResponse: messages,
      inputTokens: 0, // Not available in subscription mode
      outputTokens: 0, // Not available in subscription mode
      endpoint: "claude-subscription",
    };
  } catch (error) {
    // Enrich error with context
    const err = error instanceof Error ? error : new Error(String(error));
    const enrichedError = Object.assign(err, {
      provider: "claude-subscription",
      model: ref.model,
    });
    throw enrichedError;
  }
}

// Type guards for SDK message types
function isAssistantMessage(msg: unknown): msg is { type: "assistant"; content: unknown } {
  return typeof msg === "object" && msg !== null && (msg as { type?: string }).type === "assistant";
}

function isResultMessage(msg: unknown): msg is { result: string } {
  return (
    typeof msg === "object" &&
    msg !== null &&
    "result" in msg &&
    typeof (msg as { result: unknown }).result === "string"
  );
}

/**
 * Check if Claude subscription auth is likely available.
 * This checks for the absence of API key (which would take priority).
 */
export function isSubscriptionAuthLikely(): boolean {
  // If API key is set, SDK will use that instead of subscription
  return !process.env.ANTHROPIC_API_KEY;
}
