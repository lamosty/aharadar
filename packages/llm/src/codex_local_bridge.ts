import { withTimeout } from "./timeout";
import type { LlmCallResult, LlmRequest, ModelRef } from "./types";

export interface CodexLocalBridgeRequest {
  model: string;
  system: string;
  user: string;
  reasoningEffort?: LlmRequest["reasoningEffort"];
  maxOutputTokens?: number;
  temperature?: number;
  jsonSchema?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface CodexLocalBridgeSuccess {
  ok: true;
  outputText: string;
  provider: "codex-subscription";
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  structuredOutput?: unknown;
}

export interface CodexLocalBridgeError {
  ok: false;
  error: {
    code: string;
    message: string;
  };
}

export type CodexLocalBridgeResponse = CodexLocalBridgeSuccess | CodexLocalBridgeError;

type LlmProviderError = Error & {
  statusCode?: number;
  endpoint?: string;
  model?: string;
  responseSnippet?: string | null;
};

function truncate(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}…`;
}

function responseSnippet(response: unknown): string | null {
  if (typeof response === "string") return truncate(response, 800);
  try {
    return truncate(JSON.stringify(response), 800);
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function bridgeErrorMessage(response: unknown): string | null {
  const obj = asRecord(response);
  if (obj.ok === false) {
    const error = asRecord(obj.error);
    if (typeof error.message === "string" && error.message.length > 0) return error.message;
  }
  if (typeof obj.message === "string") return obj.message;
  if (typeof obj.error === "string") return obj.error;
  return typeof response === "string" && response.length > 0 ? response : null;
}

function parseOutput(response: unknown): CodexLocalBridgeSuccess | null {
  const obj = asRecord(response);
  if (obj.ok !== true) return null;
  if (typeof obj.outputText !== "string" || obj.outputText.length === 0) return null;
  if (obj.provider !== "codex-subscription") return null;
  if (typeof obj.model !== "string" || obj.model.length === 0) return null;
  return {
    ok: true,
    outputText: obj.outputText,
    provider: "codex-subscription",
    model: obj.model,
    inputTokens: typeof obj.inputTokens === "number" ? obj.inputTokens : undefined,
    outputTokens: typeof obj.outputTokens === "number" ? obj.outputTokens : undefined,
    structuredOutput: obj.structuredOutput,
  };
}

export async function callCodexLocalBridge(params: {
  url: string;
  token?: string;
  ref: ModelRef;
  request: LlmRequest;
}): Promise<LlmCallResult> {
  const timeoutMs = Number.parseInt(process.env.CODEX_LOCAL_TIMEOUT_MS ?? "120000", 10);
  const controller = new AbortController();

  const body: CodexLocalBridgeRequest = {
    model: params.ref.model,
    system: params.request.system,
    user: params.request.user,
    ...(params.request.reasoningEffort ? { reasoningEffort: params.request.reasoningEffort } : {}),
    ...(params.request.maxOutputTokens ? { maxOutputTokens: params.request.maxOutputTokens } : {}),
    ...(params.request.temperature !== undefined
      ? { temperature: params.request.temperature }
      : {}),
    ...(params.request.jsonSchema ? { jsonSchema: params.request.jsonSchema } : {}),
    metadata: {
      taskProvider: params.ref.provider,
    },
  };

  const res = await withTimeout(
    fetch(params.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(params.token ? { authorization: `Bearer ${params.token}` } : {}),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    }),
    Number.isFinite(timeoutMs) ? timeoutMs : 120000,
    "codex_local_bridge.fetch",
  ).catch((err) => {
    controller.abort();
    throw err;
  });

  const contentType = res.headers.get("content-type") ?? "";
  const response: unknown = contentType.includes("application/json")
    ? await res.json()
    : await res.text();

  if (!res.ok) {
    const detail = bridgeErrorMessage(response);
    const snippet = responseSnippet(response);
    const suffix = detail ? `: ${truncate(detail, 300)}` : snippet ? `: ${snippet}` : "";
    const err: LlmProviderError = new Error(`Codex local bridge error (${res.status})${suffix}`);
    err.statusCode = res.status;
    err.endpoint = params.url;
    err.model = params.ref.model;
    err.responseSnippet = snippet;
    throw err;
  }

  const parsed = parseOutput(response);
  if (!parsed) {
    const snippet = responseSnippet(response);
    const err: LlmProviderError = new Error(
      `Codex local bridge returned an invalid response${snippet ? `: ${snippet}` : ""}`,
    );
    err.endpoint = params.url;
    err.model = params.ref.model;
    err.responseSnippet = snippet;
    throw err;
  }

  return {
    outputText: parsed.outputText.trim(),
    rawResponse: response,
    inputTokens: parsed.inputTokens ?? 0,
    outputTokens: parsed.outputTokens ?? 0,
    endpoint: params.url,
    structuredOutput: parsed.structuredOutput,
  };
}
