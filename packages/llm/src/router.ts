import type { BudgetTier } from "@aharadar/shared";

import { callOpenAiCompat } from "./openai_compat";
import type { LlmCallResult, LlmRequest, LlmRouter, ModelRef, TaskType } from "./types";

function firstEnv(env: NodeJS.ProcessEnv, names: string[]): string | undefined {
  for (const name of names) {
    const value = env[name];
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }
  return undefined;
}

function requireEnv(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value.trim();
}

function withV1(baseUrl: string, pathAfterV1: string): string {
  const trimmed = baseUrl.replace(/\/+$/, "");
  if (trimmed.endsWith("/v1")) return `${trimmed}${pathAfterV1}`;
  return `${trimmed}/v1${pathAfterV1}`;
}

function looksLikeChatCompletionsEndpoint(endpoint: string): boolean {
  return endpoint.includes("/chat/completions");
}

function resolveEndpoint(env: NodeJS.ProcessEnv): string {
  const explicit = firstEnv(env, ["LLM_ENDPOINT"]);
  const baseUrl = firstEnv(env, ["LLM_BASE_URL"]);
  const responsesDefault = baseUrl ? withV1(baseUrl, "/responses") : undefined;

  let endpoint = explicit ?? responsesDefault;
  if (!endpoint) {
    throw new Error("Missing required env var: LLM_ENDPOINT (or LLM_BASE_URL)");
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

function toEnvKey(task: TaskType, suffix: string): string {
  return `LLM_${task.toUpperCase()}_${suffix}`;
}

function resolveModel(env: NodeJS.ProcessEnv, task: TaskType, tier: BudgetTier): string {
  const tierKey = tier.toUpperCase();
  const byTier = env[toEnvKey(task, `MODEL_${tierKey}`)];
  if (byTier && byTier.trim().length > 0) return byTier.trim();
  const byTask = env[toEnvKey(task, "MODEL")];
  if (byTask && byTask.trim().length > 0) return byTask.trim();
  const fallback = env.LLM_MODEL;
  if (fallback && fallback.trim().length > 0) return fallback.trim();
  throw new Error(`Missing model env var for LLM task: ${task} (set ${toEnvKey(task, "MODEL")})`);
}

export function createEnvLlmRouter(env: NodeJS.ProcessEnv = process.env): LlmRouter {
  const apiKey = requireEnv(env, "LLM_API_KEY");
  const endpoint = resolveEndpoint(env);
  const provider = firstEnv(env, ["LLM_PROVIDER"]) ?? "openai_compat";

  const call = async (_task: TaskType, ref: ModelRef, request: LlmRequest): Promise<LlmCallResult> => {
    return callOpenAiCompat({
      apiKey,
      endpoint: ref.endpoint,
      model: ref.model,
      request,
    });
  };

  return {
    chooseModel(task: TaskType, tier: BudgetTier): ModelRef {
      return {
        provider,
        model: resolveModel(env, task, tier),
        endpoint,
      };
    },
    call,
  };
}
