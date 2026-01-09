/**
 * Q&A prompt templates for knowledge base questions.
 */

import type { RetrievedContext } from "./retrieval";

/**
 * System prompt for the Q&A assistant.
 */
export const QA_SYSTEM_PROMPT = `You are a helpful analyst. Answer questions based on provided context. Always respond with valid JSON matching the requested schema. Be honest about uncertainty.`;

/**
 * Build the user prompt for Q&A, including retrieved context.
 */
export function buildQAPrompt(question: string, context: RetrievedContext): string {
  const contextText = context.clusters
    .map((cluster, i) => {
      const itemsText = cluster.items
        .map(
          (item) =>
            `- **${item.title}** (${item.sourceType}, ${item.publishedAt || "unknown date"})\n  URL: ${item.url || "N/A"}\n  ${item.bodyText}`,
        )
        .join("\n\n");

      const summaryLine = cluster.summary ? `Summary: ${cluster.summary}\n` : "";
      return `### Source Group ${i + 1}\n${summaryLine}${itemsText}`;
    })
    .join("\n\n---\n\n");

  return `You are a knowledgeable analyst answering questions based on a curated knowledge base.

## User's Question
${question}

## Available Context (${context.totalItems} items from ${context.clusters.length} source groups)

${contextText || "No relevant context found."}

## Instructions

1. Answer the question based ONLY on the provided context
2. If the context doesn't contain enough information, say so clearly
3. Cite sources by their title when making claims
4. Assess your confidence: how well does the data support your answer?
5. Note any gaps in the available information

## Response Format (JSON)

{
  "answer": "Your detailed answer here, citing sources by title",
  "citations": [
    { "title": "Source title", "relevance": "Why this source supports the answer" }
  ],
  "confidence": {
    "score": 0.0-1.0,
    "reasoning": "Explain what supports or limits confidence"
  },
  "data_gaps": ["Optional: what information would help answer better"]
}`;
}
