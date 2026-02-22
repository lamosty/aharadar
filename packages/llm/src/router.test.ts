import { describe, expect, it } from "vitest";

import { createConfiguredLlmRouter, type LlmRuntimeConfig } from "./router";

function chooseTriageModel(env: NodeJS.ProcessEnv, config: LlmRuntimeConfig) {
  const router = createConfiguredLlmRouter(env, config);
  return router.chooseModel("triage", "normal");
}

describe("createConfiguredLlmRouter", () => {
  it("prefers configured provider/model over env global and task provider overrides", () => {
    const ref = chooseTriageModel(
      {
        OPENAI_API_KEY: "sk-openai",
        OPENAI_ENDPOINT: "https://api.openai.com/v1/responses",
        OPENAI_MODEL: "env-openai",
        OPENAI_TRIAGE_MODEL: "env-openai-triage",
        ANTHROPIC_API_KEY: "sk-ant",
        ANTHROPIC_MODEL: "env-anthropic",
        LLM_PROVIDER: "openai",
        LLM_TRIAGE_PROVIDER: "openai",
      },
      {
        provider: "anthropic",
        anthropicModel: "db-anthropic",
        openaiModel: "db-openai",
      },
    );

    expect(ref.provider).toBe("anthropic");
    expect(ref.model).toBe("db-anthropic");
  });

  it("prefers configured OpenAI model over env task model overrides", () => {
    const ref = chooseTriageModel(
      {
        OPENAI_API_KEY: "sk-openai",
        OPENAI_ENDPOINT: "https://api.openai.com/v1/responses",
        OPENAI_MODEL: "env-openai",
        OPENAI_TRIAGE_MODEL: "env-openai-triage",
      },
      {
        provider: "openai",
        openaiModel: "db-openai",
      },
    );

    expect(ref.provider).toBe("openai");
    expect(ref.model).toBe("db-openai");
  });

  it("fails fast when configured provider credentials are missing (no fallback)", () => {
    expect(() =>
      chooseTriageModel(
        {
          OPENAI_API_KEY: "sk-openai",
          OPENAI_ENDPOINT: "https://api.openai.com/v1/responses",
          OPENAI_MODEL: "env-openai",
        },
        {
          provider: "anthropic",
          anthropicModel: "db-anthropic",
          openaiModel: "db-openai",
        },
      ),
    ).toThrow("Provider 'anthropic' selected but ANTHROPIC_API_KEY is not configured");
  });

  it("ignores env subscription provider when config selects API provider", () => {
    const ref = chooseTriageModel(
      {
        OPENAI_API_KEY: "sk-openai",
        OPENAI_ENDPOINT: "https://api.openai.com/v1/responses",
        OPENAI_MODEL: "env-openai",
        LLM_PROVIDER: "codex-subscription",
        CODEX_USE_SUBSCRIPTION: "true",
      },
      {
        provider: "openai",
        openaiModel: "db-openai",
      },
    );

    expect(ref.provider).toBe("openai");
    expect(ref.model).toBe("db-openai");
  });
});
