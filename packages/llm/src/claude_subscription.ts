/**
 * Claude subscription mode provider using the Claude Agent SDK.
 * Uses subscription credentials from Claude Code login (macOS Keychain).
 *
 * EXPERIMENTAL - For personal use only, not SaaS production.
 * See docs/claude-integration.md for ToS considerations.
 */

import type { LlmCallResult, LlmRequest, ModelRef } from "./types";
import { recordUsage } from "./usage_tracker";

export interface ClaudeSubscriptionConfig {
  /** Max conversation turns (default: 2 to allow structured output retry) */
  maxTurns?: number;
  /** USD budget limit for this call (optional) */
  maxBudgetUsd?: number;
  /** Enable extended thinking via system prompt hint */
  enableThinking?: boolean;
  /** JSON schema for structured output (enables SDK's native JSON mode) */
  jsonSchema?: Record<string, unknown>;
}

const DEFAULT_CONFIG: ClaudeSubscriptionConfig = {
  maxTurns: 2, // Allow retry for structured output
  enableThinking: false,
};

// Logging helper - can be replaced with proper logger
const log = {
  debug: (msg: string, data?: Record<string, unknown>) => {
    if (process.env.CLAUDE_SUBSCRIPTION_DEBUG === "true") {
      console.log(`[claude-sub] ${msg}`, data ? JSON.stringify(data) : "");
    }
  },
  warn: (msg: string, data?: Record<string, unknown>) => {
    console.warn(`[claude-sub] ${msg}`, data ? JSON.stringify(data) : "");
  },
};

/**
 * Call Claude using subscription credentials via the Agent SDK.
 * Works without ANTHROPIC_API_KEY when Claude Code is logged in.
 */
export async function callClaudeSubscription(
  ref: ModelRef,
  request: LlmRequest,
  config: ClaudeSubscriptionConfig = {},
): Promise<LlmCallResult> {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };

  // Use schema from config or request
  const jsonSchema = mergedConfig.jsonSchema ?? request.jsonSchema;

  // Build system prompt with optional thinking hint
  let systemPrompt = request.system;
  if (mergedConfig.enableThinking) {
    systemPrompt = `${request.system}\n\nIMPORTANT: Think step-by-step before providing your final answer. Consider multiple perspectives and potential edge cases.`;
  }

  log.debug("Starting call", {
    model: ref.model,
    enableThinking: mergedConfig.enableThinking,
    hasJsonSchema: !!jsonSchema,
    maxTurns: mergedConfig.maxTurns,
    promptLength: request.user.length,
  });

  const messages: unknown[] = [];
  let resultText = "";
  let structuredOutput: unknown;

  try {
    // Dynamic import to handle ESM-only module in CommonJS context
    const { query } = await import("@anthropic-ai/claude-agent-sdk");

    // Build options with optional structured output
    const options: Record<string, unknown> = {
      model: ref.model,
      systemPrompt,
      allowedTools: [], // No tools for basic triage
      maxTurns: mergedConfig.maxTurns,
    };

    if (mergedConfig.maxBudgetUsd) {
      options.maxBudgetUsd = mergedConfig.maxBudgetUsd;
    }

    // Enable structured output if schema provided
    if (jsonSchema) {
      options.outputFormat = {
        type: "json_schema",
        schema: jsonSchema,
      };
      log.debug("Using structured output with schema");
    }

    const response = query({
      prompt: request.user,
      options,
    });

    // Collect all messages and extract final result
    let messageCount = 0;
    for await (const message of response) {
      messageCount++;
      messages.push(message);

      const msgType =
        typeof message === "object" && message !== null
          ? (message as Record<string, unknown>).type
          : undefined;

      log.debug(`Message #${messageCount}`, { type: msgType });

      // Extract content from assistant messages
      // SDK structure: { type: "assistant", message: { content: [...] } }
      if (msgType === "assistant") {
        const assistantMsg = message as {
          message?: {
            content?: unknown;
          };
        };

        const content = assistantMsg.message?.content;

        if (Array.isArray(content)) {
          for (const block of content) {
            if (typeof block !== "object" || block === null) continue;

            const blockType = (block as { type?: string }).type;

            // Extract from text blocks
            if (blockType === "text") {
              const textBlock = block as { text?: string };
              if (typeof textBlock.text === "string") {
                resultText = textBlock.text;
                log.debug("Found text block", { length: resultText.length });
              }
            }

            // Extract from StructuredOutput tool use (SDK's structured output mechanism)
            if (blockType === "tool_use") {
              const toolBlock = block as { name?: string; input?: unknown };
              if (toolBlock.name === "StructuredOutput" && toolBlock.input) {
                structuredOutput = toolBlock.input;
                log.debug("Found StructuredOutput tool use", {
                  hasInput: true,
                  inputType: typeof structuredOutput,
                });
              }
            }
          }
        }
      }

      // Check for final result message
      if (msgType === "result") {
        const resultMsg = message as {
          result?: string;
          structured_output?: unknown;
          subtype?: string;
        };

        if (typeof resultMsg.result === "string" && resultMsg.result.length > 0) {
          resultText = resultMsg.result;
          log.debug("Found result text", { length: resultText.length });
        }

        if (resultMsg.structured_output !== undefined) {
          structuredOutput = resultMsg.structured_output;
          log.debug("Found structured_output in result");
        }

        log.debug("Result message", {
          subtype: resultMsg.subtype,
          hasResult: !!resultMsg.result,
          hasStructuredOutput: !!resultMsg.structured_output,
        });
      }
    }

    log.debug("Call complete", {
      messageCount,
      resultTextLength: resultText.length,
      hasStructuredOutput: structuredOutput !== undefined,
    });

    // Record usage for quota tracking
    recordUsage({ calls: 1 });

    // Determine final output text
    let finalOutputText = resultText.trim();

    // If we have structured output, use it as the primary source
    if (structuredOutput !== undefined && typeof structuredOutput === "object") {
      const structuredJson = JSON.stringify(structuredOutput);
      log.debug("Using structured output as outputText", {
        structuredLength: structuredJson.length,
        textLength: finalOutputText.length,
      });
      finalOutputText = structuredJson;
    }

    // Warn if we got no output
    if (finalOutputText.length === 0 && structuredOutput === undefined) {
      log.warn("SDK returned no output", {
        messageCount,
        messageTypes: messages.map((m) =>
          typeof m === "object" && m !== null ? (m as Record<string, unknown>).type : typeof m,
        ),
      });
    }

    // Note: Subscription mode doesn't expose token counts
    // We return 0 - cost tracking happens via Anthropic's subscription billing
    return {
      outputText: finalOutputText,
      rawResponse: messages,
      inputTokens: 0, // Not available in subscription mode
      outputTokens: 0, // Not available in subscription mode
      endpoint: "claude-subscription",
      structuredOutput,
    };
  } catch (error) {
    // Enrich error with context
    const err = error instanceof Error ? error : new Error(String(error));
    log.warn("Call failed", {
      error: err.message,
      model: ref.model,
    });
    const enrichedError = Object.assign(err, {
      provider: "claude-subscription",
      model: ref.model,
    });
    throw enrichedError;
  }
}

/**
 * Check if Claude subscription auth is likely available.
 * This checks for the absence of API key (which would take priority).
 */
export function isSubscriptionAuthLikely(): boolean {
  // If API key is set, SDK will use that instead of subscription
  return !process.env.ANTHROPIC_API_KEY;
}
