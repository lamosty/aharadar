/**
 * CLI command: ask - Ask a question about your knowledge base.
 *
 * Usage:
 *   pnpm dev:cli -- ask "What happened with tech layoffs?" --topic <id-or-name>
 *   pnpm dev:cli -- ask "What would Buffett think?" --topic default --max-clusters 10
 */

import { createDb, type LlmSettingsRow } from "@aharadar/db";
import { handleAskQuestion } from "@aharadar/pipeline";
import { loadRuntimeEnv } from "@aharadar/shared";

import { resolveTopicForUser } from "../topics";

type AskArgs = {
  question: string;
  topic: string | null;
  maxClusters: number;
};

function buildLlmRuntimeConfig(settings: LlmSettingsRow) {
  return {
    provider: settings.provider,
    anthropicModel: settings.anthropic_model,
    openaiModel: settings.openai_model,
    claudeSubscriptionEnabled: settings.claude_subscription_enabled,
    claudeTriageThinking: settings.claude_triage_thinking,
    claudeCallsPerHour: settings.claude_calls_per_hour,
    codexSubscriptionEnabled: settings.codex_subscription_enabled,
    codexCallsPerHour: settings.codex_calls_per_hour,
    reasoningEffort: settings.reasoning_effort,
    triageBatchEnabled: settings.triage_batch_enabled,
    triageBatchSize: settings.triage_batch_size,
  };
}

function parseAskArgs(args: string[]): AskArgs {
  let topic: string | null = null;
  let maxClusters = 5;
  const parts: string[] = [];

  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === "--topic") {
      const next = args[i + 1];
      if (!next || String(next).trim().length === 0) {
        throw new Error("Missing --topic value (expected a topic id or name)");
      }
      topic = String(next).trim();
      i += 1;
      continue;
    }
    if (a === "--max-clusters") {
      const next = args[i + 1];
      const parsed = next ? Number.parseInt(next, 10) : Number.NaN;
      if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error("Invalid --max-clusters (expected a positive integer)");
      }
      maxClusters = parsed;
      i += 1;
      continue;
    }
    if (a === "--help" || a === "-h") {
      throw new Error("help");
    }
    parts.push(String(a));
  }

  const question = parts.join(" ").trim();
  if (!question) {
    throw new Error("Missing question");
  }

  return { question, topic, maxClusters };
}

function printAskUsage(): void {
  console.log("Usage:");
  console.log('  ask [--topic <id-or-name>] [--max-clusters N] "<question>"');
  console.log("");
  console.log("Examples:");
  console.log('  pnpm dev:cli -- ask "What happened with tech layoffs?" --topic default');
  console.log('  pnpm dev:cli -- ask --topic <uuid> "What would Buffett think?"');
  console.log('  pnpm dev:cli -- ask --max-clusters 10 "Is crypto sentiment changing?"');
}

export async function askCommand(args: string[] = []): Promise<void> {
  // Check feature flag
  const qaEnabled = process.env.QA_ENABLED === "true";
  if (!qaEnabled) {
    console.error("Q&A feature is not enabled. Set QA_ENABLED=true to enable.");
    process.exitCode = 1;
    return;
  }

  const env = loadRuntimeEnv();
  const db = createDb(env.databaseUrl);

  try {
    let parsed: AskArgs;
    try {
      parsed = parseAskArgs(args);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === "help") {
        printAskUsage();
        return;
      }
      console.error(message);
      console.log("");
      printAskUsage();
      process.exitCode = 1;
      return;
    }

    const user = await db.users.getFirstUser();
    if (!user) {
      console.log("No user found yet. Run `admin:run-now` after creating sources.");
      return;
    }

    const topic = await resolveTopicForUser({ db, userId: user.id, topicArg: parsed.topic });

    console.log(`\n🔍 Asking: "${parsed.question}"`);
    console.log(`   Topic: ${topic.name} (${topic.id})`);
    console.log(`   Max clusters: ${parsed.maxClusters}\n`);

    const startTime = Date.now();
    const llmSettings = await db.llmSettings.get();
    const llmConfig = buildLlmRuntimeConfig(llmSettings);

    const response = await handleAskQuestion({
      db,
      request: {
        question: parsed.question,
        topicId: topic.id,
        options: { maxClusters: parsed.maxClusters },
      },
      userId: user.id,
      tier: "normal",
      llmConfig,
    });
    const elapsed = Date.now() - startTime;

    console.log("📝 Answer:\n");
    console.log(response.answer);

    if (response.citations.length > 0) {
      console.log("\n📚 Citations:");
      for (const cite of response.citations) {
        console.log(`  - ${cite.title}`);
        if (cite.url) {
          console.log(`    ${cite.url}`);
        }
        if (cite.relevance) {
          console.log(`    → ${cite.relevance}`);
        }
      }
    }

    const confidencePct = (response.confidence.score * 100).toFixed(0);
    const confidenceEmoji =
      response.confidence.score >= 0.7 ? "🟢" : response.confidence.score >= 0.4 ? "🟡" : "🔴";
    console.log(`\n🎯 Confidence: ${confidenceEmoji} ${confidencePct}%`);
    console.log(`   ${response.confidence.reasoning}`);

    if (response.dataGaps && response.dataGaps.length > 0) {
      console.log("\n⚠️  Data gaps:");
      for (const gap of response.dataGaps) {
        console.log(`  - ${gap}`);
      }
    }

    const totalTokens = response.usage.tokensUsed.input + response.usage.tokensUsed.output;
    console.log(
      `\n📊 Stats: ${response.usage.clustersRetrieved} clusters, ${totalTokens} tokens, ${elapsed}ms`,
    );
  } finally {
    await db.close();
  }
}
