/**
 * Q&A handler - orchestrates retrieval, prompting, and LLM calls.
 */

import type { Db } from "@aharadar/db";
import type {
  AskRequest,
  AskResponse,
  AskDebugInfo,
  DebugCluster,
  QALlmResponse,
  BudgetTier,
} from "@aharadar/shared";
import { createEnvLlmRouter, type TaskType } from "@aharadar/llm";

import { retrieveContext, type RetrievedContext } from "./retrieval";
import { buildQAPrompt, QA_SYSTEM_PROMPT } from "./prompt";

function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + "...";
}

/**
 * Build debug info for clusters from retrieval context.
 */
function buildDebugClusters(context: RetrievedContext): DebugCluster[] {
  return context.clusters.map((cluster) => ({
    id: cluster.id,
    similarity: cluster.similarity,
    summary: cluster.summary || null,
    itemCount: cluster.items.length,
    items: cluster.items.map((item) => ({
      id: item.id,
      title: item.title,
      url: item.url,
      sourceType: item.sourceType,
      publishedAt: item.publishedAt,
      bodyPreview: truncateText(item.bodyText, 200),
    })),
  }));
}

/**
 * Handle a Q&A question against the knowledge base.
 */
export async function handleAskQuestion(params: {
  db: Db;
  request: AskRequest;
  userId: string;
  tier: BudgetTier;
  /** Optional topic name for debug info */
  topicName?: string;
}): Promise<AskResponse> {
  const { db, request, userId, tier, topicName } = params;
  const { question, topicId, options } = request;
  const includeDebug = options?.debug ?? false;
  const maxClusters = options?.maxClusters ?? 5;

  const totalStart = Date.now();

  // 1. Retrieve relevant context
  const context = await retrieveContext({
    db,
    question,
    userId,
    topicId,
    tier,
    options,
  });

  // 2. Handle no-data case
  if (context.clusters.length === 0) {
    // Record embedding cost even for no-data case
    const startedAt = new Date().toISOString();
    try {
      await db.providerCalls.insert({
        userId,
        purpose: "embedding",
        provider: context.embeddingCost.provider,
        model: context.embeddingCost.model,
        inputTokens: context.embeddingCost.inputTokens,
        outputTokens: 0,
        costEstimateCredits: context.embeddingCost.costEstimateCredits,
        meta: {
          kind: "qa_question",
          topicId,
          question,
          result: "no_data",
        },
        startedAt,
        endedAt: new Date().toISOString(),
        status: "ok",
      });
    } catch {
      // Ignore logging errors
    }

    const noDataResponse: AskResponse = {
      answer: "I don't have relevant information about this in your knowledge base for this topic.",
      citations: [],
      confidence: { score: 0, reasoning: "No matching sources found" },
      dataGaps: ["Consider adding sources that cover this topic"],
      usage: { clustersRetrieved: 0, tokensUsed: { input: 0, output: 0 } },
    };

    if (includeDebug) {
      noDataResponse.debug = {
        request: {
          question,
          topicId,
          topicName,
          maxClusters,
          timeWindow: options?.timeWindow,
        },
        timing: {
          totalMs: Date.now() - totalStart,
          embeddingMs: context.embeddingCost.durationMs,
          retrievalMs: context.retrievalDurationMs,
          llmMs: 0,
          parsingMs: 0,
        },
        embedding: {
          model: context.embeddingCost.model,
          provider: context.embeddingCost.provider,
          endpoint: context.embeddingCost.endpoint,
          inputTokens: context.embeddingCost.inputTokens,
          durationMs: context.embeddingCost.durationMs,
          costEstimateCredits: context.embeddingCost.costEstimateCredits,
        },
        retrieval: {
          clustersSearched: context.clustersSearched,
          clustersMatched: 0,
          minSimilarityThreshold: context.minSimilarityThreshold,
          clusters: [],
        },
        llm: {
          model: "N/A",
          provider: "N/A",
          endpoint: "N/A",
          inputTokens: 0,
          outputTokens: 0,
          durationMs: 0,
          promptPreview: "N/A - No clusters found",
          promptLength: 0,
          rawResponse: "N/A",
          parseSuccess: false,
        },
        cost: {
          embeddingCredits: context.embeddingCost.costEstimateCredits,
          llmCredits: 0,
          totalCredits: context.embeddingCost.costEstimateCredits,
        },
      };
    }

    return noDataResponse;
  }

  // 3. Build prompt
  const userPrompt = buildQAPrompt(question, context);

  // 4. Call LLM
  const llmRouter = createEnvLlmRouter();
  const taskType = "qa" as TaskType;
  const modelRef = llmRouter.chooseModel(taskType, tier);

  const llmStart = Date.now();
  const llmResult = await llmRouter.call(taskType, modelRef, {
    system: QA_SYSTEM_PROMPT,
    user: userPrompt,
    maxOutputTokens: 2000,
    temperature: 0.3,
  });
  const llmDurationMs = Date.now() - llmStart;

  // 5. Parse response
  const parseStart = Date.now();
  let parsed: QALlmResponse;
  let parseSuccess = true;
  const rawResponse = llmResult.outputText;

  try {
    // Extract JSON from response (handle markdown code blocks)
    let jsonText = rawResponse.trim();
    if (jsonText.startsWith("```json")) {
      jsonText = jsonText.slice(7);
    } else if (jsonText.startsWith("```")) {
      jsonText = jsonText.slice(3);
    }
    if (jsonText.endsWith("```")) {
      jsonText = jsonText.slice(0, -3);
    }
    parsed = JSON.parse(jsonText.trim()) as QALlmResponse;
  } catch {
    // If JSON parsing fails, return the raw text as the answer
    parseSuccess = false;
    parsed = {
      answer: rawResponse,
      citations: [],
      confidence: { score: 0.5, reasoning: "Response was not in expected JSON format" },
    };
  }
  const parseDurationMs = Date.now() - parseStart;

  // 6. Enrich citations with full item data
  const allItems = context.clusters.flatMap((c) => c.items);
  const citations = (parsed.citations || []).map((cite: { title: string; relevance: string }) => {
    // Find matching item by title (fuzzy match)
    const matchingItem = allItems.find(
      (item) =>
        item.title.toLowerCase().includes(cite.title.toLowerCase()) ||
        cite.title.toLowerCase().includes(item.title.toLowerCase())
    );

    return {
      id: matchingItem?.id ?? "",
      title: cite.title,
      url: matchingItem?.url ?? "",
      sourceType: matchingItem?.sourceType ?? "unknown",
      publishedAt: matchingItem?.publishedAt ?? "",
      relevance: cite.relevance,
    };
  });

  // 7. Log usage
  const startedAt = new Date().toISOString();
  const endedAt = new Date().toISOString();
  try {
    // Log embedding call
    await db.providerCalls.insert({
      userId,
      purpose: "embedding",
      provider: context.embeddingCost.provider,
      model: context.embeddingCost.model,
      inputTokens: context.embeddingCost.inputTokens,
      outputTokens: 0,
      costEstimateCredits: context.embeddingCost.costEstimateCredits,
      meta: {
        kind: "qa_question",
        topicId,
        question,
        clustersFound: context.clusters.length,
      },
      startedAt,
      endedAt,
      status: "ok",
    });

    // Log LLM call
    await db.providerCalls.insert({
      userId,
      purpose: "qa",
      provider: modelRef.provider,
      model: modelRef.model,
      inputTokens: llmResult.inputTokens,
      outputTokens: llmResult.outputTokens,
      costEstimateCredits: 0, // TODO: calculate from rates
      meta: {
        kind: "qa_answer",
        topicId,
        question,
        clustersUsed: context.clusters.length,
        itemsUsed: context.totalItems,
      },
      startedAt,
      endedAt,
      status: "ok",
    });
  } catch {
    // Ignore logging errors
  }

  const totalDurationMs = Date.now() - totalStart;

  // 8. Build response
  const response: AskResponse = {
    answer: parsed.answer,
    citations,
    confidence: parsed.confidence || { score: 0.5, reasoning: "Unknown" },
    dataGaps: parsed.data_gaps,
    usage: {
      clustersRetrieved: context.clusters.length,
      tokensUsed: {
        input: llmResult.inputTokens,
        output: llmResult.outputTokens,
      },
    },
  };

  // 9. Add debug info if requested
  if (includeDebug) {
    const debugInfo: AskDebugInfo = {
      request: {
        question,
        topicId,
        topicName,
        maxClusters,
        timeWindow: options?.timeWindow,
      },
      timing: {
        totalMs: totalDurationMs,
        embeddingMs: context.embeddingCost.durationMs,
        retrievalMs: context.retrievalDurationMs,
        llmMs: llmDurationMs,
        parsingMs: parseDurationMs,
      },
      embedding: {
        model: context.embeddingCost.model,
        provider: context.embeddingCost.provider,
        endpoint: context.embeddingCost.endpoint,
        inputTokens: context.embeddingCost.inputTokens,
        durationMs: context.embeddingCost.durationMs,
        costEstimateCredits: context.embeddingCost.costEstimateCredits,
      },
      retrieval: {
        clustersSearched: context.clustersSearched,
        clustersMatched: context.clusters.length,
        minSimilarityThreshold: context.minSimilarityThreshold,
        clusters: buildDebugClusters(context),
      },
      llm: {
        model: modelRef.model,
        provider: modelRef.provider,
        endpoint: modelRef.endpoint,
        inputTokens: llmResult.inputTokens,
        outputTokens: llmResult.outputTokens,
        durationMs: llmDurationMs,
        promptPreview: truncateText(userPrompt, 500),
        promptLength: userPrompt.length,
        rawResponse: truncateText(rawResponse, 2000),
        parseSuccess,
      },
      cost: {
        embeddingCredits: context.embeddingCost.costEstimateCredits,
        llmCredits: 0, // TODO: calculate from rates
        totalCredits: context.embeddingCost.costEstimateCredits,
      },
    };

    response.debug = debugInfo;
  }

  return response;
}
