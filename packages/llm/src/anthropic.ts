import Anthropic from "@anthropic-ai/sdk";

import type { LlmCallResult, LlmRequest, ModelRef } from "./types";

export interface AnthropicConfig {
  apiKey: string;
}

type LlmProviderError = Error & {
  statusCode?: number;
  statusText?: string;
  endpoint?: string;
  model?: string;
  responseSnippet?: string | null;
  requestId?: string | null;
};

export async function callAnthropicApi(
  ref: ModelRef,
  request: LlmRequest,
  config: AnthropicConfig
): Promise<LlmCallResult> {
  const client = new Anthropic({ apiKey: config.apiKey });

  try {
    const response = await client.messages.create({
      model: ref.model,
      max_tokens: request.maxOutputTokens ?? 4096,
      temperature: request.temperature ?? 0,
      system: request.system,
      messages: [{ role: "user", content: request.user }],
    });

    // Extract text content from response
    const outputText = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");

    return {
      outputText: outputText.trim(),
      rawResponse: response,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      endpoint: "https://api.anthropic.com/v1/messages",
    };
  } catch (error) {
    // Re-throw with enriched error info
    if (error instanceof Anthropic.APIError) {
      const err: LlmProviderError = new Error(`Anthropic API error (${error.status}): ${error.message}`);
      err.statusCode = error.status;
      err.endpoint = "https://api.anthropic.com/v1/messages";
      err.model = ref.model;
      err.requestId = error.headers?.["request-id"] ?? null;
      throw err;
    }
    throw error;
  }
}
