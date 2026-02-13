import { createConfiguredLlmRouter } from "../packages/llm/src/router";
import { triageCandidate } from "../packages/llm/src/triage";

process.env.CODEX_USE_SUBSCRIPTION = "true";
process.env.CODEX_MODEL = "gpt-5.1";

const router = createConfiguredLlmRouter(process.env as NodeJS.ProcessEnv, {
  provider: "codex-subscription",
  codexSubscriptionEnabled: true,
});

const candidate = {
  id: "x",
  title: "test",
  bodyText: "test body",
  sourceType: "rss",
  sourceName: "x",
  primaryUrl: "https://example.com",
  publishedAt: new Date().toISOString(),
  windowStart: new Date(Date.now() - 3600_000).toISOString(),
  windowEnd: new Date().toISOString(),
};

(async () => {
  try {
    const result = await triageCandidate({
      router,
      tier: "normal",
      reasoningEffortOverride: "high",
      candidate,
    });
    console.log("ok", result.output.ai_score);
  } catch (error) {
    console.error("err", error instanceof Error ? error.message : String(error));
  }
})();
