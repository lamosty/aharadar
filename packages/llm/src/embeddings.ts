import type { BudgetTier } from "@aharadar/shared";

import { callOpenAiEmbeddingsCompat } from "./openai_embeddings";

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

function resolveEndpoint(env: NodeJS.ProcessEnv): string {
  const explicit = firstEnv(env, ["OPENAI_EMBED_ENDPOINT"]);
  if (explicit) return explicit;

  const baseUrl = firstEnv(env, ["OPENAI_BASE_URL"]);
  if (baseUrl) return withV1(baseUrl, "/embeddings");

  const legacy = firstEnv(env, ["OPENAI_ENDPOINT"]);
  if (!legacy) {
    throw new Error(
      "Missing required env var: OPENAI_EMBED_ENDPOINT (or OPENAI_BASE_URL or OPENAI_ENDPOINT)",
    );
  }

  // If OPENAI_ENDPOINT points at responses/chat-completions, derive embeddings.
  if (legacy.includes("/v1/responses")) return legacy.replace("/v1/responses", "/v1/embeddings");
  if (legacy.includes("/v1/chat/completions"))
    return legacy.replace("/v1/chat/completions", "/v1/embeddings");
  return legacy;
}

function resolveModel(env: NodeJS.ProcessEnv, tier: BudgetTier): string {
  const tierKey = tier.toUpperCase();
  const byTier = env[`OPENAI_EMBED_MODEL_${tierKey}`];
  if (byTier && byTier.trim().length > 0) return byTier.trim();
  const byTask = env.OPENAI_EMBED_MODEL;
  if (byTask && byTask.trim().length > 0) return byTask.trim();
  const fallback = env.OPENAI_MODEL;
  if (fallback && fallback.trim().length > 0) return fallback.trim();
  throw new Error("Missing model env var for embeddings (set OPENAI_EMBED_MODEL)");
}

function parseFloatEnv(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function estimateCredits(params: { inputTokens: number }): number {
  const rateIn =
    parseFloatEnv(process.env.OPENAI_EMBED_CREDITS_PER_1K_INPUT_TOKENS) ??
    parseFloatEnv(process.env.OPENAI_EMBED_CREDITS_PER_1K_TOKENS) ??
    parseFloatEnv(process.env.OPENAI_CREDITS_PER_1K_INPUT_TOKENS) ??
    0;
  const inCredits = (params.inputTokens / 1000) * rateIn;
  return Number.isFinite(inCredits) ? inCredits : 0;
}

export interface EmbeddingModelRef {
  provider: string;
  model: string;
  endpoint: string;
}

export interface EmbedCallResult {
  vectors: number[][]; // aligned with input order
  inputTokens: number;
  costEstimateCredits: number;
  provider: string;
  model: string;
  endpoint: string;
  rawResponse: unknown;
}

export interface EmbeddingsClient {
  chooseModel(tier: BudgetTier): EmbeddingModelRef;
  embed(ref: EmbeddingModelRef, input: string[]): Promise<EmbedCallResult>;
}

export function createEnvEmbeddingsClient(env: NodeJS.ProcessEnv = process.env): EmbeddingsClient {
  const apiKey = requireEnv(env, "OPENAI_API_KEY");
  const endpoint = resolveEndpoint(env);
  const provider = "openai";

  return {
    chooseModel(tier: BudgetTier): EmbeddingModelRef {
      return { provider, model: resolveModel(env, tier), endpoint };
    },
    async embed(ref: EmbeddingModelRef, input: string[]): Promise<EmbedCallResult> {
      const call = await callOpenAiEmbeddingsCompat({
        apiKey,
        endpoint: ref.endpoint,
        model: ref.model,
        input,
      });
      return {
        vectors: call.vectors,
        inputTokens: call.inputTokens,
        costEstimateCredits: estimateCredits({ inputTokens: call.inputTokens }),
        provider: ref.provider,
        model: ref.model,
        endpoint: call.endpoint,
        rawResponse: call.rawResponse,
      };
    },
  };
}
