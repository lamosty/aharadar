#!/usr/bin/env tsx

/**
 * Codex subscription triage smoke tests.
 *
 * Runs a focused outside-the-app check of the LLM router path:
 * - single-item triage
 * - optional batched triage
 */

import type { LlmRuntimeConfig, ReasoningEffort } from "../packages/llm/src/router";
import { createConfiguredLlmRouter } from "../packages/llm/src/router";
import type { TriageCandidateInput } from "../packages/llm/src/triage";
import { triageBatch, triageCandidate } from "../packages/llm/src/triage";

type CliOptions = {
  batch: boolean;
  withOpenAiKey: boolean;
  dryRun: boolean;
  reasoningEffort: ReasoningEffortInput | null;
  model?: string;
  both: boolean;
  onlyBatch: boolean;
  count: number;
};

type ReasoningEffortInput = ReasoningEffort | "normal" | "xlow" | "xmedium" | "xhigh";

function parseArgs(argv: string[]): CliOptions {
  const nextValue = (i: number): string | undefined =>
    i + 1 < argv.length ? argv[i + 1] : undefined;
  const options: CliOptions = {
    batch: false,
    withOpenAiKey: false,
    dryRun: false,
    reasoningEffort: null,
    onlyBatch: false,
    both: false,
    count: 1,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg) continue;

    if (arg === "--batch" || arg === "-b") options.batch = true;
    if (arg === "--with-key" || arg === "--key") options.withOpenAiKey = true;
    if (arg === "--both") options.both = true;
    if (arg === "--dry-run") options.dryRun = true;
    if (arg === "--only-batch" || arg === "--batch-only") options.onlyBatch = true;

    if (arg === "--reasoning" || arg === "--effort") {
      const value = nextValue(i);
      const parsed = parseReasoningEffort(value);
      if (!parsed) {
        throw new Error(`Invalid reasoning effort: ${value ?? "<missing>"}`);
      }
      options.reasoningEffort = parsed;
      i += 1;
      continue;
    }

    if (arg === "--model") {
      options.model = nextValue(i);
      if (!options.model) throw new Error("--model requires a value");
      i += 1;
    }

    if (arg === "--count" || arg === "--n") {
      const value = nextValue(i);
      const parsed = parsePositiveInt(value, "count");
      if (!parsed) throw new Error("--count requires a positive integer");
      options.count = parsed;
      i += 1;
    }
  }

  return options;
}

function parseReasoningEffort(value: string | undefined): ReasoningEffortInput | null {
  if (!value) return null;

  const normalized = value.trim().toLowerCase();
  if (
    normalized === "none" ||
    normalized === "low" ||
    normalized === "medium" ||
    normalized === "high" ||
    normalized === "xlow" ||
    normalized === "xmedium" ||
    normalized === "xhigh" ||
    normalized === "normal"
  ) {
    return normalized;
  }

  return null;
}

function parsePositiveInt(raw: string | undefined, name: string): number | null {
  if (!raw) return null;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value < 1) {
    throw new Error(`--${name} expects a positive integer`);
  }
  return value;
}

function usage(): void {
  console.log(`\nUsage: pnpm exec tsx scripts/test-codex-subscription.ts [options]\n`);
  console.log("\nOptions:");
  console.log("  --batch, -b         Also run batched triage test");
  console.log("  --only-batch        Run only batched triage test (skip single runs)");
  console.log("  --with-key, --key   Also run with OPENAI_API_KEY set");
  console.log("  --both              Run both subscription + with-key paths");
  console.log("  --dry-run           Parse config and exit without calling codex");
  console.log("  --reasoning [none|low|medium|high|normal|xhigh]  Override reasoning effort");
  console.log("  --count, --n N      Number of candidates per run (default 1)");
  console.log("  --model <model>     Override CODEX_MODEL for this run");
  console.log("  (default) single item only, subscription mode, no OPENAI_API_KEY");
}

function makeRouterConfig(
  withOpenAiKey: boolean,
  options: CliOptions,
): LlmRuntimeConfig & { provider?: "codex-subscription" } {
  if (!withOpenAiKey) {
    delete process.env.OPENAI_API_KEY;
  }

  process.env.CODEX_USE_SUBSCRIPTION = "true";
  process.env.CODEX_MODEL = options.model || process.env.CODEX_MODEL || "gpt-5.1";

  const config: LlmRuntimeConfig & { provider?: "codex-subscription" } = {
    provider: "codex-subscription",
    codexSubscriptionEnabled: true,
  };

  if (options.reasoningEffort) {
    config.reasoningEffort = normalizeReasoningEffort(options.reasoningEffort);
  } else {
    // Avoid inherited/invalid shell values like "xhigh".
    delete process.env.OPENAI_TRIAGE_REASONING_EFFORT;
    delete process.env.OPENAI_DEEP_SUMMARY_REASONING_EFFORT;
  }

  return config;
}

function makeCandidates(prefix: string, count: number): TriageCandidateInput[] {
  const now = new Date();
  const baseStart = new Date(now.getTime() - 60 * 60 * 1000);

  return Array.from({ length: count }, (_, index) => {
    const i = index + 1;
    const windowEnd = new Date(now.getTime() + index * 1000).toISOString();
    const windowStart = new Date(baseStart.getTime() + index * 1000).toISOString();

    return makeCandidate(
      `${prefix}-${i}`,
      `Investing signal #${i}: market liquidity and rates`,
      `A finance-oriented synthetic example used for smoke testing Codex triage. Focus item ${i} checks macro sensitivity, policy risk, and execution quality in a short briefing.`,
      windowStart,
      windowEnd,
    );
  });
}

function makeCandidate(
  id: string,
  title: string,
  bodyText: string,
  windowStart?: string,
  windowEnd?: string,
): TriageCandidateInput {
  const now = new Date();
  const defaultWindowEnd = now.toISOString();
  const defaultWindowStart = new Date(now.getTime() - 60 * 60 * 1000).toISOString();

  return {
    id,
    title,
    bodyText,
    sourceType: "rss",
    sourceName: "Codex Smoke",
    primaryUrl: "https://example.com/codex-smoke",
    publishedAt: windowEnd ?? defaultWindowEnd,
    windowStart: windowStart ?? defaultWindowStart,
    windowEnd: windowEnd ?? defaultWindowEnd,
  };
}

function normalizeReasoningEffort(value: ReasoningEffortInput): ReasoningEffort {
  if (!value) return "none";
  const normalized = value.toLowerCase();
  if (normalized === "xlow" || normalized === "low") return "low";
  if (normalized === "xmedium" || normalized === "medium" || normalized === "normal")
    return "medium";
  if (normalized === "xhigh") return "xhigh";
  return normalized === "high" ? "high" : "none";
}

async function runSingle(withOpenAiKey: boolean, options: CliOptions): Promise<boolean> {
  const originalOpenAiKey = process.env.OPENAI_API_KEY;
  const originalCodexModel = process.env.CODEX_MODEL;
  const originalCodexSub = process.env.CODEX_USE_SUBSCRIPTION;
  const originalTriageEffort = process.env.OPENAI_TRIAGE_REASONING_EFFORT;
  const originalSummaryEffort = process.env.OPENAI_DEEP_SUMMARY_REASONING_EFFORT;

  const header = withOpenAiKey || options.both ? "with OPENAI_API_KEY" : "subscription mode";
  const candidates = makeCandidates("codex-smoke-single", options.count);

  try {
    const config = makeRouterConfig(withOpenAiKey, options);
    console.log(`\n=== Single triage (${options.count}x): ${header} ===`);
    console.log("reasoning effort:", options.reasoningEffort ?? "none (default)");
    console.log("OPENAI_API_KEY set:", !!process.env.OPENAI_API_KEY);
    const router = createConfiguredLlmRouter(process.env, config);

    let successCount = 0;

    for (let i = 0; i < candidates.length; i += 1) {
      try {
        const result = await triageCandidate({
          router,
          tier: "normal",
          reasoningEffortOverride: options.reasoningEffort
            ? normalizeReasoningEffort(options.reasoningEffort)
            : "none",
          candidate: candidates[i],
        });

        successCount += 1;
        console.log(`  [${i + 1}/${options.count}] score: ${result.output.ai_score}`);
      } catch (error) {
        console.error(
          `  [${i + 1}/${options.count}] FAIL:`,
          error instanceof Error ? error.message : String(error),
        );
      }
    }

    return successCount === candidates.length;
  } catch (error) {
    console.error("FAIL:", error instanceof Error ? error.message : String(error));
    return false;
  } finally {
    if (originalOpenAiKey !== undefined) {
      process.env.OPENAI_API_KEY = originalOpenAiKey;
    } else {
      delete process.env.OPENAI_API_KEY;
    }
    if (originalCodexModel !== undefined) {
      process.env.CODEX_MODEL = originalCodexModel;
    } else {
      delete process.env.CODEX_MODEL;
    }
    if (originalCodexSub !== undefined) {
      process.env.CODEX_USE_SUBSCRIPTION = originalCodexSub;
    } else {
      delete process.env.CODEX_USE_SUBSCRIPTION;
    }
    if (originalTriageEffort !== undefined) {
      process.env.OPENAI_TRIAGE_REASONING_EFFORT = originalTriageEffort;
    } else {
      delete process.env.OPENAI_TRIAGE_REASONING_EFFORT;
    }
    if (originalSummaryEffort !== undefined) {
      process.env.OPENAI_DEEP_SUMMARY_REASONING_EFFORT = originalSummaryEffort;
    } else {
      delete process.env.OPENAI_DEEP_SUMMARY_REASONING_EFFORT;
    }
  }
}

async function runBatch(options: CliOptions): Promise<boolean> {
  const originalOpenAiKey = process.env.OPENAI_API_KEY;
  const originalCodexModel = process.env.CODEX_MODEL;
  const originalCodexSub = process.env.CODEX_USE_SUBSCRIPTION;
  const originalTriageEffort = process.env.OPENAI_TRIAGE_REASONING_EFFORT;
  const originalSummaryEffort = process.env.OPENAI_DEEP_SUMMARY_REASONING_EFFORT;

  try {
    const config = makeRouterConfig(false, options);
    const candidates: TriageCandidateInput[] = makeCandidates("codex-smoke-batch", options.count);

    console.log(`\n=== Batch triage (${candidates.length} items) ===`);
    console.log("reasoning effort:", options.reasoningEffort ?? "none (default)");
    console.log("OPENAI_API_KEY set:", !!process.env.OPENAI_API_KEY);

    const router = createConfiguredLlmRouter(process.env, config);
    const result = await triageBatch({
      router,
      tier: "normal",
      candidates,
      batchId: "codex-smoke-batch",
      reasoningEffortOverride: options.reasoningEffort
        ? normalizeReasoningEffort(options.reasoningEffort)
        : "none",
    });

    console.log("provider:", result.provider);
    console.log("model:", result.model);
    console.log("items:", result.itemCount);
    console.log("parsed:", result.successCount);
    return result.successCount === candidates.length;
  } catch (error) {
    console.error("FAIL:", error instanceof Error ? error.message : String(error));
    return false;
  } finally {
    if (originalOpenAiKey !== undefined) {
      process.env.OPENAI_API_KEY = originalOpenAiKey;
    } else {
      delete process.env.OPENAI_API_KEY;
    }
    if (originalCodexModel !== undefined) {
      process.env.CODEX_MODEL = originalCodexModel;
    } else {
      delete process.env.CODEX_MODEL;
    }
    if (originalCodexSub !== undefined) {
      process.env.CODEX_USE_SUBSCRIPTION = originalCodexSub;
    } else {
      delete process.env.CODEX_USE_SUBSCRIPTION;
    }
    if (originalTriageEffort !== undefined) {
      process.env.OPENAI_TRIAGE_REASONING_EFFORT = originalTriageEffort;
    } else {
      delete process.env.OPENAI_TRIAGE_REASONING_EFFORT;
    }
    if (originalSummaryEffort !== undefined) {
      process.env.OPENAI_DEEP_SUMMARY_REASONING_EFFORT = originalSummaryEffort;
    } else {
      delete process.env.OPENAI_DEEP_SUMMARY_REASONING_EFFORT;
    }
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (options.dryRun) {
    usage();
    console.log("\nEnvironment summary:");
    console.log("  CODEX_USE_SUBSCRIPTION:", process.env.CODEX_USE_SUBSCRIPTION);
    console.log("  CODEX_MODEL:", process.env.CODEX_MODEL || options.model || "gpt-5.1");
    console.log("  OPENAI_API_KEY set:", !!process.env.OPENAI_API_KEY);
    return;
  }

  const includeKeyRuns = options.withOpenAiKey || options.both;
  const includeSubscription = !options.withOpenAiKey || options.both;

  console.log("===========================================");
  console.log("Codex Subscription Triage Smoke Test");
  console.log("===========================================");

  let singlePass = false;
  let keyPass = false;
  let batchPass = false;
  let ranSingle = false;
  let ranBatch = false;

  if (includeSubscription && !options.onlyBatch) {
    singlePass = await runSingle(false, options);
    ranSingle = true;
  }

  if (includeKeyRuns && !options.onlyBatch) {
    if (!process.env.OPENAI_API_KEY) {
      console.log("\n=== Key triage skipped (OPENAI_API_KEY not set) ===");
    } else {
      keyPass = await runSingle(true, options);
      ranSingle = true;
    }
  }

  if (options.batch || options.onlyBatch) {
    batchPass = await runBatch(options);
    ranBatch = true;
  }

  console.log("\n===========================================");
  console.log("Results Summary");
  console.log("===========================================");

  if (includeSubscription) {
    console.log(
      "  Single without OPENAI_API_KEY:",
      ranSingle ? (singlePass ? "PASS" : "SKIP/FAIL") : "SKIP",
    );
  }
  if (includeKeyRuns) {
    console.log(
      "  Single with OPENAI_API_KEY:",
      ranSingle ? (keyPass ? "PASS" : "SKIP/FAIL") : "SKIP",
    );
  }
  if (options.batch || options.onlyBatch) {
    console.log(
      "  Batch without OPENAI_API_KEY:",
      ranBatch ? (batchPass ? "PASS" : "FAIL") : "SKIP",
    );
  }

  const anyPass = singlePass || keyPass || batchPass;
  process.exit(anyPass ? 0 : 1);
}

main().catch((error) => {
  console.error("Unexpected failure:", error);
  process.exit(1);
});
