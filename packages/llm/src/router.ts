import type { BudgetTier } from "@aharadar/shared";

import { callAnthropicApi } from "./anthropic";
import { callClaudeSubscription } from "./claude_subscription";
import { callOpenAiCompat } from "./openai_compat";
import type { LlmCallResult, LlmRequest, LlmRouter, ModelRef, TaskType } from "./types";
import { canUseClaudeSubscription, getUsageLimitsFromEnv } from "./usage_tracker";

type Provider = "openai" | "anthropic" | "claude-subscription";

/**
 * Runtime configuration for LLM router.
 * These values override environment variables when passed to createConfiguredLlmRouter.
 */
export interface LlmRuntimeConfig {
  provider?: Provider;
  anthropicModel?: string;
  openaiModel?: string;
  claudeSubscriptionEnabled?: boolean;
  claudeTriageThinking?: boolean;
  claudeCallsPerHour?: number;
}

function firstEnv(env: NodeJS.ProcessEnv, names: string[]): string | undefined {
  for (const name of names) {
    const value = env[name];
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }
  return undefined;
}

function withV1(baseUrl: string, pathAfterV1: string): string {
  const trimmed = baseUrl.replace(/\/+$/, "");
  if (trimmed.endsWith("/v1")) return `${trimmed}${pathAfterV1}`;
  return `${trimmed}/v1${pathAfterV1}`;
}

function looksLikeChatCompletionsEndpoint(endpoint: string): boolean {
  return endpoint.includes("/chat/completions");
}

function resolveOpenAiEndpoint(env: NodeJS.ProcessEnv): string {
  const explicit = firstEnv(env, ["OPENAI_ENDPOINT"]);
  const baseUrl = firstEnv(env, ["OPENAI_BASE_URL"]);
  const responsesDefault = baseUrl ? withV1(baseUrl, "/responses") : undefined;

  let endpoint = explicit ?? responsesDefault;
  if (!endpoint) {
    throw new Error("Missing required env var: OPENAI_ENDPOINT (or OPENAI_BASE_URL)");
  }
  if (looksLikeChatCompletionsEndpoint(endpoint)) {
    if (endpoint.includes("/v1/chat/completions")) {
      endpoint = endpoint.replace("/v1/chat/completions", "/v1/responses");
    } else if (responsesDefault) {
      endpoint = responsesDefault;
    }
  }
  return endpoint;
}

function toOpenAiEnvKey(task: TaskType, suffix: string): string {
  return `OPENAI_${task.toUpperCase()}_${suffix}`;
}

function resolveOpenAiModel(env: NodeJS.ProcessEnv, task: TaskType, tier: BudgetTier): string {
  const tierKey = tier.toUpperCase();
  const byTier = env[toOpenAiEnvKey(task, `MODEL_${tierKey}`)];
  if (byTier && byTier.trim().length > 0) return byTier.trim();
  const byTask = env[toOpenAiEnvKey(task, "MODEL")];
  if (byTask && byTask.trim().length > 0) return byTask.trim();
  const fallback = env.OPENAI_MODEL;
  if (fallback && fallback.trim().length > 0) return fallback.trim();
  throw new Error(`Missing model env var for OpenAI task: ${task} (set ${toOpenAiEnvKey(task, "MODEL")})`);
}

// Anthropic model resolution
function toAnthropicEnvKey(task: TaskType, suffix: string): string {
  return `ANTHROPIC_${task.toUpperCase()}_${suffix}`;
}

function resolveAnthropicModel(env: NodeJS.ProcessEnv, task: TaskType, tier: BudgetTier): string {
  const tierKey = tier.toUpperCase();

  // Try task+tier specific
  const byTier = env[toAnthropicEnvKey(task, `MODEL_${tierKey}`)];
  if (byTier && byTier.trim().length > 0) return byTier.trim();

  // Try task specific
  const byTask = env[toAnthropicEnvKey(task, "MODEL")];
  if (byTask && byTask.trim().length > 0) return byTask.trim();

  // Try global Anthropic model
  const fallback = env.ANTHROPIC_MODEL;
  if (fallback && fallback.trim().length > 0) return fallback.trim();

  // Default by tier
  const defaults: Record<BudgetTier, string> = {
    low: "claude-3-5-haiku-latest",
    normal: "claude-sonnet-4-20250514",
    high: "claude-sonnet-4-20250514",
  };
  return defaults[tier];
}

// Claude subscription model resolution (uses same model names as Anthropic API)
function resolveClaudeSubscriptionModel(env: NodeJS.ProcessEnv, task: TaskType, tier: BudgetTier): string {
  // Check for subscription-specific model override
  const subKey = `CLAUDE_${task.toUpperCase()}_MODEL`;
  const byTask = env[subKey];
  if (byTask && byTask.trim().length > 0) return byTask.trim();

  const globalSub = env.CLAUDE_MODEL;
  if (globalSub && globalSub.trim().length > 0) return globalSub.trim();

  // Fall back to Anthropic model resolution
  return resolveAnthropicModel(env, task, tier);
}

// Provider resolution with subscription priority
function resolveProvider(
  env: NodeJS.ProcessEnv,
  task: TaskType,
  openaiApiKey: string | undefined,
  anthropicApiKey: string | undefined
): Provider {
  // Check if subscription mode is enabled and available
  if (env.CLAUDE_USE_SUBSCRIPTION === "true") {
    const limits = getUsageLimitsFromEnv(env);
    if (canUseClaudeSubscription(limits)) {
      return "claude-subscription";
    }
    console.warn("[llm] Claude subscription quota exceeded, falling back to API");
  }

  // Check for task-specific provider override
  const taskKey = `LLM_${task.toUpperCase()}_PROVIDER`;
  const taskProvider = env[taskKey]?.toLowerCase();
  if (taskProvider === "anthropic" && anthropicApiKey) {
    return "anthropic";
  }
  if (taskProvider === "openai" && openaiApiKey) {
    return "openai";
  }

  // Check for global provider preference
  const globalProvider = env.LLM_PROVIDER?.toLowerCase();
  if (globalProvider === "anthropic" && anthropicApiKey) {
    return "anthropic";
  }
  if (globalProvider === "openai" && openaiApiKey) {
    return "openai";
  }

  // Auto-select based on available keys
  if (anthropicApiKey) return "anthropic";
  if (openaiApiKey) return "openai";

  // Default to openai for backward compatibility
  return "openai";
}

export function createEnvLlmRouter(env: NodeJS.ProcessEnv = process.env): LlmRouter {
  const openaiApiKey = firstEnv(env, ["OPENAI_API_KEY"]);
  const anthropicApiKey = firstEnv(env, ["ANTHROPIC_API_KEY"]);
  const subscriptionEnabled = env.CLAUDE_USE_SUBSCRIPTION === "true";
  const enableThinking = env.CLAUDE_TRIAGE_THINKING === "true";

  // Validate at least one provider is configured
  if (!openaiApiKey && !anthropicApiKey && !subscriptionEnabled) {
    throw new Error(
      "Missing required env var: OPENAI_API_KEY or ANTHROPIC_API_KEY (or enable CLAUDE_USE_SUBSCRIPTION)"
    );
  }

  return {
    chooseModel(task: TaskType, tier: BudgetTier): ModelRef {
      const provider = resolveProvider(env, task, openaiApiKey, anthropicApiKey);

      if (provider === "claude-subscription") {
        return {
          provider: "claude-subscription",
          model: resolveClaudeSubscriptionModel(env, task, tier),
          endpoint: "claude-subscription",
        };
      }

      if (provider === "anthropic") {
        if (!anthropicApiKey) {
          throw new Error("ANTHROPIC_API_KEY required when using Anthropic provider");
        }
        return {
          provider: "anthropic",
          model: resolveAnthropicModel(env, task, tier),
          endpoint: "https://api.anthropic.com/v1/messages",
        };
      }

      // OpenAI path
      if (!openaiApiKey) {
        throw new Error("OPENAI_API_KEY required when using OpenAI provider");
      }
      return {
        provider: "openai",
        model: resolveOpenAiModel(env, task, tier),
        endpoint: resolveOpenAiEndpoint(env),
      };
    },

    async call(task: TaskType, ref: ModelRef, request: LlmRequest): Promise<LlmCallResult> {
      if (ref.provider === "claude-subscription") {
        return callClaudeSubscription(ref, request, {
          enableThinking: task === "triage" && enableThinking,
        });
      }

      if (ref.provider === "anthropic") {
        if (!anthropicApiKey) {
          throw new Error("ANTHROPIC_API_KEY required for Anthropic calls");
        }
        return callAnthropicApi(ref, request, { apiKey: anthropicApiKey });
      }

      // Default to OpenAI
      if (!openaiApiKey) {
        throw new Error("OPENAI_API_KEY required for OpenAI calls");
      }
      return callOpenAiCompat({
        apiKey: openaiApiKey,
        endpoint: ref.endpoint,
        model: ref.model,
        request,
      });
    },
  };
}

/**
 * Create an LLM router with runtime configuration that overrides env vars.
 * Use this when you have database-stored settings or per-run overrides.
 */
export function createConfiguredLlmRouter(
  env: NodeJS.ProcessEnv = process.env,
  config?: LlmRuntimeConfig
): LlmRouter {
  if (!config) {
    return createEnvLlmRouter(env);
  }

  // Build effective env by merging runtime config over actual env
  const effectiveEnv: NodeJS.ProcessEnv = { ...env };

  if (config.provider !== undefined) {
    effectiveEnv.LLM_PROVIDER = config.provider;
  }
  if (config.claudeSubscriptionEnabled !== undefined) {
    effectiveEnv.CLAUDE_USE_SUBSCRIPTION = config.claudeSubscriptionEnabled ? "true" : "false";
  }
  if (config.claudeTriageThinking !== undefined) {
    effectiveEnv.CLAUDE_TRIAGE_THINKING = config.claudeTriageThinking ? "true" : "false";
  }
  if (config.claudeCallsPerHour !== undefined) {
    effectiveEnv.CLAUDE_CALLS_PER_HOUR = String(config.claudeCallsPerHour);
  }
  if (config.anthropicModel !== undefined) {
    effectiveEnv.ANTHROPIC_MODEL = config.anthropicModel;
  }
  if (config.openaiModel !== undefined) {
    effectiveEnv.OPENAI_MODEL = config.openaiModel;
  }

  return createEnvLlmRouter(effectiveEnv);
}
