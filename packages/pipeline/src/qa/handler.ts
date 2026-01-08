/**
 * Q&A handler - orchestrates retrieval, prompting, and LLM calls.
 */

import type { Db } from "@aharadar/db";
import type { AskRequest, AskResponse, QALlmResponse, BudgetTier } from "@aharadar/shared";
import { createEnvLlmRouter, type TaskType } from "@aharadar/llm";

import { retrieveContext } from "./retrieval";
import { buildQAPrompt, QA_SYSTEM_PROMPT } from "./prompt";

/**
 * Handle a Q&A question against the knowledge base.
 */
export async function handleAskQuestion(params: {
  db: Db;
  request: AskRequest;
  userId: string;
  tier: BudgetTier;
}): Promise<AskResponse> {
  const { db, request, userId, tier } = params;
  const { question, topicId, options } = request;

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

    return {
      answer: "I don't have relevant information about this in your knowledge base for this topic.",
      citations: [],
      confidence: { score: 0, reasoning: "No matching sources found" },
      dataGaps: ["Consider adding sources that cover this topic"],
      usage: { clustersRetrieved: 0, tokensUsed: { input: 0, output: 0 } },
    };
  }

  // 3. Build prompt
  const userPrompt = buildQAPrompt(question, context);

  // 4. Call LLM
  const llmRouter = createEnvLlmRouter();
  const taskType = "qa" as TaskType;
  const modelRef = llmRouter.chooseModel(taskType, tier);
  const startedAt = new Date().toISOString();

  const llmResult = await llmRouter.call(taskType, modelRef, {
    system: QA_SYSTEM_PROMPT,
    user: userPrompt,
    maxOutputTokens: 2000,
    temperature: 0.3,
  });

  // 5. Parse response
  let parsed: QALlmResponse;
  try {
    // Extract JSON from response (handle markdown code blocks)
    let jsonText = llmResult.outputText.trim();
    if (jsonText.startsWith("```json")) {
      jsonText = jsonText.slice(7);
    } else if (jsonText.startsWith("```")) {
      jsonText = jsonText.slice(3);
    }
    if (jsonText.endsWith("```")) {
      jsonText = jsonText.slice(0, -3);
    }
    parsed = JSON.parse(jsonText.trim()) as QALlmResponse;
  } catch (parseErr) {
    // If JSON parsing fails, return the raw text as the answer
    parsed = {
      answer: llmResult.outputText,
      citations: [],
      confidence: { score: 0.5, reasoning: "Response was not in expected format" },
    };
  }

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

  return {
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
}
