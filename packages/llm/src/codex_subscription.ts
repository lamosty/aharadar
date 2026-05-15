/**
 * OpenAI Codex subscription mode provider using the Codex SDK.
 * Uses ChatGPT subscription credentials from `codex` CLI login.
 *
 * EXPERIMENTAL - For personal use only, not SaaS production.
 * Works with ChatGPT Plus ($20/mo), Pro ($200/mo), Business, Edu, Enterprise.
 */

import { callCodexLocalBridge } from "./codex_local_bridge";
import { recordCodexUsage } from "./codex_usage_tracker";
import { classifyLlmProviderError } from "./error_classification";
import type { LlmCallResult, LlmRequest, ModelRef } from "./types";

export interface CodexSubscriptionConfig {
  /** Working directory for Codex thread. Prefer an empty, dedicated directory. */
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
 * Build an explicit env for Codex CLI so subscription runs cannot be hijacked
 * by unrelated OpenAI API-key vars in the parent process.
 */
function buildCodexCliEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  const out: Record<string, string> = {};

  const copyKey = (key: string) => {
    const value = env[key];
    if (typeof value === "string" && value.length > 0) {
      out[key] = value;
    }
  };

  // Core process/runtime vars Codex CLI may need.
  [
    "PATH",
    "HOME",
    "USER",
    "LOGNAME",
    "SHELL",
    "TERM",
    "LANG",
    "LC_ALL",
    "LC_CTYPE",
    "TMPDIR",
    "TMP",
    "TEMP",
    "XDG_CONFIG_HOME",
    "XDG_CACHE_HOME",
    "XDG_DATA_HOME",
    "SSL_CERT_FILE",
    "SSL_CERT_DIR",
    "NODE_EXTRA_CA_CERTS",
    "http_proxy",
    "https_proxy",
    "no_proxy",
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "NO_PROXY",
  ].forEach(copyKey);

  // Keep Codex-specific controls, but intentionally exclude OPENAI_* keys.
  for (const [key, value] of Object.entries(env)) {
    if (!key.startsWith("CODEX_")) continue;
    if (typeof value !== "string" || value.length === 0) continue;
    out[key] = value;
  }

  return out;
}

function getCodexReasoningDirective(reasoningEffort: LlmRequest["reasoningEffort"]): string {
  if (!reasoningEffort) return "";

  const normalized = reasoningEffort.toLowerCase();

  const directives: Record<NonNullable<LlmRequest["reasoningEffort"]>, string> = {
    none: "Use minimal reasoning. Be concise and produce a direct answer.",
    low: "Use light reasoning before answering. Keep the response concise.",
    medium: "Reason thoroughly across the provided context, then answer directly.",
    high: "Use deeper analysis and broader context before answering.",
    xhigh: "Use maximum depth reasoning and broader context before answering.",
  };

  const directive = directives[normalized as NonNullable<LlmRequest["reasoningEffort"]>];
  if (!directive) return "";

  return `Reasoning directive for this request: ${directive}`;
}

function getCodexModelReasoningEffort(
  reasoningEffort: LlmRequest["reasoningEffort"],
): "none" | "low" | "medium" | "high" | "xhigh" | undefined {
  if (!reasoningEffort) return undefined;

  const normalized = reasoningEffort.toLowerCase();
  if (normalized === "none") return "none";
  if (normalized === "low") return "low";
  if (normalized === "medium") return "medium";
  if (normalized === "high") return "high";
  if (normalized === "xhigh") return "xhigh";

  return undefined;
}

/**
 * Call OpenAI using Codex SDK with ChatGPT subscription credentials.
 * Works without OPENAI_API_KEY when `codex` CLI is logged in.
 */
export async function callCodexSubscriptionDirect(
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

    const codexEnv = buildCodexCliEnv(process.env);
    const codex = new CodexClass({ env: codexEnv });
    const modelReasoningEffort = getCodexModelReasoningEffort(request.reasoningEffort);
    const thread = codex.startThread({
      model: ref.model, // Use the resolved model (e.g., gpt-5.1)
      // @constraint Aha Radar uses Codex as an LLM provider, not as a coding
      // agent. Keep tool execution locked down so untrusted source content in
      // prompts cannot approve actions, write files, or browse the network.
      approvalPolicy: "never",
      sandboxMode: "read-only",
      networkAccessEnabled: false,
      webSearchEnabled: false,
      webSearchMode: "disabled",
      skipGitRepoCheck: true,
      ...(modelReasoningEffort ? { modelReasoningEffort } : {}),
      ...(mergedConfig.workingDirectory ? { workingDirectory: mergedConfig.workingDirectory } : {}),
    });

    // Build the prompt combining system and user content
    const reasoningDirective = getCodexReasoningDirective(request.reasoningEffort);
    const fullPrompt = request.system
      ? `${request.system}\n\n${reasoningDirective}\n\n${request.user}`
      : `${reasoningDirective}\n\n${request.user}`.trim();

    log.debug("Running thread", { promptLength: fullPrompt.length });

    // Use run() for simple request/response pattern
    const turn = await thread.run(
      fullPrompt,
      request.jsonSchema ? { outputSchema: request.jsonSchema } : undefined,
    );

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
 * Call Codex subscription mode either directly in-process or via a local host
 * bridge. The bridge path lets Dockerized API/worker containers keep using the
 * existing `codex-subscription` provider while the actual Codex SDK runs as the
 * logged-in host user who owns the subscription auth state.
 */
export async function callCodexSubscription(
  ref: ModelRef,
  request: LlmRequest,
  config: CodexSubscriptionConfig = {},
): Promise<LlmCallResult> {
  const localUrl = process.env.CODEX_LOCAL_URL?.trim();
  if (!localUrl) {
    return callCodexSubscriptionDirect(ref, request, config);
  }

  try {
    const result = await callCodexLocalBridge({
      url: localUrl,
      token: process.env.CODEX_LOCAL_TOKEN?.trim() || undefined,
      ref,
      request,
    });
    recordCodexUsage({ calls: 1 });
    return result;
  } catch (error) {
    const err = classifyLlmProviderError(error);
    log.warn("Local bridge call failed", {
      error: err.message,
      model: ref.model,
    });
    const enrichedError = Object.assign(err, {
      provider: "codex-subscription",
      model: ref.model,
      endpoint: localUrl,
    });
    throw enrichedError;
  }
}

/**
 * Check if Codex subscription auth is likely available.
 * This checks for the absence of API key (which would take priority).
 */
export function isCodexSubscriptionAuthLikely(): boolean {
  if (process.env.CODEX_LOCAL_URL?.trim()) return true;
  // If API key is set, SDK will use that instead of subscription
  return !process.env.OPENAI_API_KEY;
}
