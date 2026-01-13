import type { BudgetTier } from "@aharadar/shared";

import { callAnthropicApi } from "./anthropic";
import { callClaudeSubscription } from "./claude_subscription";
import { callCodexSubscription } from "./codex_subscription";
import { canUseCodexSubscription, getCodexUsageLimitsFromEnv } from "./codex_usage_tracker";
import { callOpenAiCompat } from "./openai_compat";
import type { LlmCallResult, LlmRequest, LlmRouter, ModelRef, TaskType } from "./types";
import { canUseClaudeSubscription, getUsageLimitsFromEnv } from "./usage_tracker";

type Provider = "openai" | "anthropic" | "claude-subscription" | "codex-subscription";

/**
 * Runtime configuration for LLM router.
 * These values override environment variables when passed to createConfiguredLlmRouter.
 */
export type ReasoningEffort = "none" | "low" | "medium" | "high";

export interface LlmRuntimeConfig {
  provider?: Provider;
  anthropicModel?: string;
  openaiModel?: string;
  claudeSubscriptionEnabled?: boolean;
  claudeTriageThinking?: boolean;
  claudeCallsPerHour?: number;
  codexSubscriptionEnabled?: boolean;
  codexCallsPerHour?: number;
  reasoningEffort?: ReasoningEffort;
  triageBatchEnabled?: boolean;
  triageBatchSize?: number;
}

const TASKS: TaskType[] = [
  "triage",
  "deep_summary",
  "entity_extract",
  "signal_parse",
  "qa",
  "aggregate_summary",
];
const TIERS: BudgetTier[] = ["low", "normal", "high"];

function applyTaskModelOverrides(params: {
  env: NodeJS.ProcessEnv;
  prefix: string;
  model: string;
  includeTiered?: boolean;
}): void {
  const { env, prefix, model, includeTiered } = params;
  for (const task of TASKS) {
    const taskKey = `${prefix}_${task.toUpperCase()}_MODEL`;
    env[taskKey] = model;
    if (includeTiered) {
      for (const tier of TIERS) {
        const tierKey = `${taskKey}_${tier.toUpperCase()}`;
        env[tierKey] = model;
      }
    }
  }
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
  throw new Error(
    `Missing model env var for OpenAI task: ${task} (set ${toOpenAiEnvKey(task, "MODEL")})`,
  );
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

  // Default by tier - updated 2026-01 to Sonnet 4.5
  const defaults: Record<BudgetTier, string> = {
    low: "claude-3-5-haiku-latest",
    normal: "claude-sonnet-4-5",
    high: "claude-sonnet-4-5",
  };
  return defaults[tier];
}

// Claude subscription model resolution (uses same model names as Anthropic API)
function resolveClaudeSubscriptionModel(
  env: NodeJS.ProcessEnv,
  task: TaskType,
  tier: BudgetTier,
): string {
  // Check for subscription-specific model override
  const subKey = `CLAUDE_${task.toUpperCase()}_MODEL`;
  const byTask = env[subKey];
  if (byTask && byTask.trim().length > 0) return byTask.trim();

  const globalSub = env.CLAUDE_MODEL;
  if (globalSub && globalSub.trim().length > 0) return globalSub.trim();

  // Fall back to Anthropic model resolution
  return resolveAnthropicModel(env, task, tier);
}

// Codex subscription model resolution (uses same model names as OpenAI API)
function resolveCodexSubscriptionModel(
  env: NodeJS.ProcessEnv,
  task: TaskType,
  tier: BudgetTier,
): string {
  // Check for codex-specific model override
  const codexKey = `CODEX_${task.toUpperCase()}_MODEL`;
  const byTask = env[codexKey];
  if (byTask && byTask.trim().length > 0) return byTask.trim();

  const globalCodex = env.CODEX_MODEL;
  if (globalCodex && globalCodex.trim().length > 0) return globalCodex.trim();

  // Fall back to OpenAI model resolution
  return resolveOpenAiModel(env, task, tier);
}

// Provider resolution - explicit selection takes priority
function resolveProvider(
  env: NodeJS.ProcessEnv,
  task: TaskType,
  openaiApiKey: string | undefined,
  anthropicApiKey: string | undefined,
): Provider {
  // Check for explicit global provider preference FIRST
  // This ensures user's explicit choice is respected
  const globalProvider = env.LLM_PROVIDER?.toLowerCase();

  // If user explicitly selected a subscription provider, use it (with quota check)
  // NO FALLBACK - if quota exceeded, throw error to prevent unexpected API costs
  if (globalProvider === "claude-subscription") {
    if (env.CLAUDE_USE_SUBSCRIPTION !== "true") {
      throw new Error(
        "Provider 'claude-subscription' selected but CLAUDE_USE_SUBSCRIPTION is not enabled",
      );
    }
    const limits = getUsageLimitsFromEnv(env);
    if (!canUseClaudeSubscription(limits)) {
      throw new Error(
        `Claude subscription quota exceeded (${limits.callsPerHour} calls/hour). ` +
          "Wait for quota reset or increase limit in settings.",
      );
    }
    return "claude-subscription";
  }

  if (globalProvider === "codex-subscription") {
    if (env.CODEX_USE_SUBSCRIPTION !== "true") {
      throw new Error(
        "Provider 'codex-subscription' selected but CODEX_USE_SUBSCRIPTION is not enabled",
      );
    }
    const limits = getCodexUsageLimitsFromEnv(env);
    if (!canUseCodexSubscription(limits)) {
      throw new Error(
        `Codex subscription quota exceeded (${limits.callsPerHour} calls/hour). ` +
          "Wait for quota reset or increase limit in settings.",
      );
    }
    return "codex-subscription";
  }

  // If user explicitly selected an API provider, use it
  if (globalProvider === "anthropic" && anthropicApiKey) {
    return "anthropic";
  }
  if (globalProvider === "openai" && openaiApiKey) {
    return "openai";
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
  // Task-specific subscription providers also throw on quota exceeded
  if (taskProvider === "claude-subscription") {
    if (env.CLAUDE_USE_SUBSCRIPTION !== "true") {
      throw new Error(
        `Task provider 'claude-subscription' selected but CLAUDE_USE_SUBSCRIPTION is not enabled`,
      );
    }
    const limits = getUsageLimitsFromEnv(env);
    if (!canUseClaudeSubscription(limits)) {
      throw new Error(
        `Claude subscription quota exceeded (${limits.callsPerHour} calls/hour). ` +
          "Wait for quota reset or increase limit in settings.",
      );
    }
    return "claude-subscription";
  }
  if (taskProvider === "codex-subscription") {
    if (env.CODEX_USE_SUBSCRIPTION !== "true") {
      throw new Error(
        `Task provider 'codex-subscription' selected but CODEX_USE_SUBSCRIPTION is not enabled`,
      );
    }
    const limits = getCodexUsageLimitsFromEnv(env);
    if (!canUseCodexSubscription(limits)) {
      throw new Error(
        `Codex subscription quota exceeded (${limits.callsPerHour} calls/hour). ` +
          "Wait for quota reset or increase limit in settings.",
      );
    }
    return "codex-subscription";
  }

  // Auto-select based on available keys (no explicit provider set)
  if (anthropicApiKey) return "anthropic";
  if (openaiApiKey) return "openai";

  // Default to openai for backward compatibility
  return "openai";
}

export function createEnvLlmRouter(env: NodeJS.ProcessEnv = process.env): LlmRouter {
  const openaiApiKey = firstEnv(env, ["OPENAI_API_KEY"]);
  const anthropicApiKey = firstEnv(env, ["ANTHROPIC_API_KEY"]);
  const claudeSubscriptionEnabled = env.CLAUDE_USE_SUBSCRIPTION === "true";
  const codexSubscriptionEnabled = env.CODEX_USE_SUBSCRIPTION === "true";
  const enableThinking = env.CLAUDE_TRIAGE_THINKING === "true";

  // Validate at least one provider is configured
  if (
    !openaiApiKey &&
    !anthropicApiKey &&
    !claudeSubscriptionEnabled &&
    !codexSubscriptionEnabled
  ) {
    throw new Error(
      "Missing required env var: OPENAI_API_KEY or ANTHROPIC_API_KEY (or enable CLAUDE_USE_SUBSCRIPTION or CODEX_USE_SUBSCRIPTION)",
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

      if (provider === "codex-subscription") {
        return {
          provider: "codex-subscription",
          model: resolveCodexSubscriptionModel(env, task, tier),
          endpoint: "codex-subscription",
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
          jsonSchema: request.jsonSchema,
        });
      }

      if (ref.provider === "codex-subscription") {
        return callCodexSubscription(ref, request);
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
  config?: LlmRuntimeConfig,
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
    applyTaskModelOverrides({
      env: effectiveEnv,
      prefix: "ANTHROPIC",
      model: config.anthropicModel,
      includeTiered: true,
    });
    effectiveEnv.CLAUDE_MODEL = config.anthropicModel;
    applyTaskModelOverrides({
      env: effectiveEnv,
      prefix: "CLAUDE",
      model: config.anthropicModel,
      includeTiered: false,
    });
  }
  if (config.openaiModel !== undefined) {
    effectiveEnv.OPENAI_MODEL = config.openaiModel;
    applyTaskModelOverrides({
      env: effectiveEnv,
      prefix: "OPENAI",
      model: config.openaiModel,
      includeTiered: true,
    });
    effectiveEnv.CODEX_MODEL = config.openaiModel;
    applyTaskModelOverrides({
      env: effectiveEnv,
      prefix: "CODEX",
      model: config.openaiModel,
      includeTiered: false,
    });
  }
  if (config.codexSubscriptionEnabled !== undefined) {
    effectiveEnv.CODEX_USE_SUBSCRIPTION = config.codexSubscriptionEnabled ? "true" : "false";
  }
  if (config.codexCallsPerHour !== undefined) {
    effectiveEnv.CODEX_CALLS_PER_HOUR = String(config.codexCallsPerHour);
  }
  if (config.reasoningEffort !== undefined) {
    // Set reasoning effort for all LLM tasks (triage, deep_summary, etc.)
    effectiveEnv.OPENAI_TRIAGE_REASONING_EFFORT = config.reasoningEffort;
    effectiveEnv.OPENAI_DEEP_SUMMARY_REASONING_EFFORT = config.reasoningEffort;
  }
  if (config.triageBatchEnabled !== undefined) {
    effectiveEnv.TRIAGE_BATCH_ENABLED = config.triageBatchEnabled ? "true" : "false";
  }
  if (config.triageBatchSize !== undefined) {
    effectiveEnv.TRIAGE_BATCH_SIZE = String(config.triageBatchSize);
  }

  return createEnvLlmRouter(effectiveEnv);
}
