# ✅ DONE

# Task 094: Q&A / "Ask Your Knowledge Base" Feature

## Priority: High

## Goal

Add a Q&A feature that lets users ask questions about their ingested content. The system retrieves relevant clusters, synthesizes an answer using Claude, and returns citations.

**Use cases:**

- "What would Warren Buffett do?" - Persona-based analysis
- "What happens next for Venezuela?" - Synthesis + prediction
- "Is crypto sentiment changing?" - Trend analysis
- "What did insider trades reveal this week?" - Factual retrieval

## Background

The infrastructure is 80% ready:

- Embeddings stored in pgvector (1536 dims, HNSW index)
- Semantic search implemented (CLI `search` command)
- Clusters group similar items into "stories"
- Triage/deep summaries provide pre-computed analysis
- LLM router handles model selection + budget tracking
- Preference profiles available from feedback

**What's needed:**

- Context assembly function (retrieve clusters → build prompt context)
- Q&A prompt templates
- API/CLI/Web endpoints
- Response parsing with citations

## Read First

- `packages/cli/src/commands/search.ts` - Existing semantic search (COPY THIS PATTERN)
- `packages/db/src/queries/embeddings.ts` - Vector search queries
- `packages/db/src/queries/clusters.ts` - Cluster queries
- `packages/pipeline/src/stages/cluster.ts` - Cluster logic
- `packages/llm/src/router.ts` - LLM router pattern
- `packages/llm/src/prompts/triage.ts` - Prompt template pattern
- `docs/llm.md` - LLM integration spec

## Architecture

**Cluster-Based RAG:**

```
Question → Embed → Search clusters (topic-scoped) → Top K clusters →
  → Fetch representative items per cluster → Build prompt → Call Claude → Parse response
```

Why clusters over items:

- Aligns with digest paradigm (stories, not raw items)
- Reduces noise (clusters are deduplicated)
- Pre-ranked by aha_score
- Lower token usage

## Scope

### Interfaces

1. **API**: `POST /api/ask` - Core endpoint
2. **CLI**: `pnpm dev -- ask "question" [--topic <id>]`
3. **Web UI**: Chat-style interface on `/app/ask` page

### Implementation Order

1. Core retrieval + prompt logic (`packages/pipeline/src/qa/`)
2. API endpoint (`packages/api/src/routes/ask.ts`)
3. CLI command (`packages/cli/src/commands/ask.ts`)
4. Web UI page (`packages/web/src/app/app/ask/`)

## Files to Create

```
packages/pipeline/src/qa/retrieval.ts     # Cluster-based semantic search
packages/pipeline/src/qa/prompt.ts        # Q&A prompt templates
packages/pipeline/src/qa/handler.ts       # Main Q&A orchestration
packages/shared/src/types/qa.ts           # QARequest, QAResponse types
packages/api/src/routes/ask.ts            # POST /api/ask endpoint
packages/cli/src/commands/ask.ts          # CLI command
packages/web/src/app/app/ask/page.tsx     # Web UI chat page
packages/web/src/hooks/useAsk.ts          # React hook for Q&A API
```

## Files to Modify

```
packages/api/src/routes/index.ts          # Register /ask route
packages/cli/src/index.ts                 # Register ask command
packages/web/src/app/app/layout.tsx       # Add Ask nav item
packages/shared/src/types/index.ts        # Export QA types
```

## API Contract

```typescript
// POST /api/ask
interface AskRequest {
  question: string; // Natural language - persona can be embedded: "What would Buffett think?"
  topicId: string;
  options?: {
    timeWindow?: {
      from?: string; // ISO date - defaults to last 30 days
      to?: string;
    };
    maxClusters?: number; // Override default (5)
  };
}

interface AskResponse {
  answer: string;
  citations: {
    id: string;
    title: string;
    url: string;
    sourceType: string;
    publishedAt: string;
    relevance: string; // Why this source matters
  }[];
  confidence: {
    score: number; // 0.0 - 1.0
    reasoning: string; // "Based on 5 recent sources..."
  };
  dataGaps?: string[]; // "No recent data on X"
  usage: {
    clustersRetrieved: number;
    tokensUsed: { input: number; output: number };
  };
}
```

## Config (Experimental)

```typescript
// Environment variables or user config
{
  "experimental": {
    "qa_enabled": false,           // Off by default
    "qa_model": "claude-3-haiku",  // Cheap model for testing
    "qa_max_clusters": 5,          // Max clusters to retrieve
    "qa_max_context_chars": 30000, // Token budget (~30K)
    "qa_confidence_threshold": 0.3 // Min confidence to answer
  }
}
```

## Prompt Strategy

### Question Types

**Factual:** "What happened with X?"

- Return timeline, quotes, source attribution

**Trend:** "Is Y trending?"

- Analyze mention frequency, sentiment, related topics

**Persona:** "What would Z think?"

- Respond in persona's voice, cite supporting evidence

**Synthesis:** "How do A and B connect?"

- Find direct/thematic connections, flag speculation

### Prompt Template (Simplified)

```
You are answering questions based on a curated knowledge base.

**User's question:** {question}

**Relevant context from knowledge base:**
{cluster_summaries_with_items}

**Instructions:**
1. Answer the question directly based on the provided context
2. Cite specific sources (by title/URL) that support your claims
3. If information is limited or contradictory, say so explicitly
4. Provide a confidence assessment (high/medium/low) with reasoning

**Response format:** JSON with answer, citations, confidence
```

## Edge Cases

### No Relevant Data

```typescript
if (clusters.length === 0) {
  return {
    answer: "I don't have relevant information about this in your knowledge base.",
    confidence: { score: 0, reasoning: "No matching sources found" },
    dataGaps: ["Consider adding sources that cover this topic"],
  };
}
```

### Low Confidence

- Prefix answer with "Based on limited information..."
- Flag what's missing in `dataGaps`

### Contradictory Sources

- Present both viewpoints
- Note which sources disagree
- Let user decide

## Web UI Design

Simple chat-style interface:

- Topic selector dropdown (required)
- Text input for question
- "Ask" button
- Response area:
  - Answer (markdown rendered)
  - Collapsible citations list
  - Confidence indicator (color-coded)
- Loading spinner while processing

## Cost Analysis

**Per question:**

- Embedding: ~200 tokens (~$0.00002)
- LLM call: ~30K tokens (~$0.003-0.03)
- **Total: ~$0.03/question**

**Budget integration:**

- Track in `provider_calls` table
- Separate Q&A budget from digest processing
- Fallback to Haiku when budget low

## Out of Scope (MVP)

- Multi-turn conversation / follow-ups
- Cross-topic questions (search all data)
- Answer caching
- Built-in persona library (just free-text for now)
- Voice input/output

## Test Plan

```bash
# Enable feature
export QA_ENABLED=true

# Ensure data exists
pnpm dev -- admin:run-now --topic <topic_id>

# Test via CLI
pnpm dev -- ask "What happened with tech layoffs?" --topic <topic_id>

# Test via API
curl -X POST http://localhost:3001/api/ask \
  -H "Content-Type: application/json" \
  -d '{"question":"What would Buffett think?","topicId":"<id>"}'

# Test Web UI
open http://localhost:3000/app/ask
# Select topic, enter question, verify response
```

## Acceptance Criteria

- [ ] `POST /api/ask` returns answer with citations
- [ ] CLI `ask` command works with `--topic` flag
- [ ] Web UI shows chat interface with topic selector
- [ ] Retrieval uses cluster-based semantic search
- [ ] Confidence score included in response
- [ ] "No data" case handled gracefully
- [ ] Feature is **off by default** (experimental flag)
- [ ] Budget/cost tracked in `provider_calls`
- [ ] `pnpm typecheck` passes

## Commit Strategy

1. `feat(qa): add core retrieval and prompt logic`
2. `feat(qa): add POST /api/ask endpoint`
3. `feat(qa): add CLI ask command`
4. `feat(qa): add web UI chat page`

## Future Enhancements (Phase 2+)

- Auto-detect question type (factual/trend/persona/synthesis)
- Built-in persona templates (Buffett, analyst, bear/bull)
- User preference injection into prompts
- Answer caching by question hash
- Multi-turn conversations
- Cross-topic search mode

---

## Detailed Implementation Guide

### Step 1: Core Types (`packages/shared/src/types/qa.ts`)

```typescript
export interface AskRequest {
  question: string;
  topicId: string;
  options?: {
    timeWindow?: { from?: string; to?: string };
    maxClusters?: number;
  };
}

export interface Citation {
  id: string;
  title: string;
  url: string;
  sourceType: string;
  publishedAt: string;
  relevance: string;
}

export interface AskResponse {
  answer: string;
  citations: Citation[];
  confidence: {
    score: number;
    reasoning: string;
  };
  dataGaps?: string[];
  usage: {
    clustersRetrieved: number;
    tokensUsed: { input: number; output: number };
  };
}

// Internal type for LLM response parsing
export interface QALlmResponse {
  answer: string;
  citations: { title: string; relevance: string }[];
  confidence: { score: number; reasoning: string };
  data_gaps?: string[];
}
```

### Step 2: Retrieval Function (`packages/pipeline/src/qa/retrieval.ts`)

```typescript
import { db } from "@aharadar/db";
import { embedText } from "@aharadar/llm";

export interface RetrievedContext {
  clusters: {
    id: string;
    summary: string;
    items: {
      id: string;
      title: string;
      bodyText: string;
      url: string;
      sourceType: string;
      publishedAt: string;
    }[];
  }[];
  totalItems: number;
}

export async function retrieveContext(
  question: string,
  topicId: string,
  options?: { maxClusters?: number; timeWindow?: { from?: string; to?: string } }
): Promise<RetrievedContext> {
  const maxClusters = options?.maxClusters ?? 5;

  // 1. Embed the question
  const embedding = await embedText(question);

  // 2. Search clusters by centroid similarity (topic-scoped)
  // Use existing pattern from packages/db/src/queries/embeddings.ts
  const similarClusters = await db.clusters.searchByCentroid({
    embedding,
    topicId,
    limit: maxClusters,
    minSimilarity: 0.3,
    timeWindow: options?.timeWindow,
  });

  // 3. For each cluster, fetch top items with their content
  const clustersWithItems = await Promise.all(
    similarClusters.map(async (cluster) => {
      const items = await db.clusterItems.getTopItems(cluster.id, 3); // Top 3 per cluster
      return {
        id: cluster.id,
        summary: cluster.summary ?? "",
        items: items.map((item) => ({
          id: item.id,
          title: item.title,
          bodyText: truncate(item.bodyText, 2000),
          url: item.canonicalUrl,
          sourceType: item.sourceType,
          publishedAt: item.publishedAt,
        })),
      };
    })
  );

  return {
    clusters: clustersWithItems,
    totalItems: clustersWithItems.reduce((sum, c) => sum + c.items.length, 0),
  };
}

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + "...";
}
```

### Step 3: Prompt Builder (`packages/pipeline/src/qa/prompt.ts`)

```typescript
import { RetrievedContext } from "./retrieval";

export function buildQAPrompt(question: string, context: RetrievedContext): string {
  const contextText = context.clusters
    .map((cluster, i) => {
      const itemsText = cluster.items
        .map((item) => `- **${item.title}** (${item.sourceType}, ${item.publishedAt})\n  ${item.bodyText}`)
        .join("\n\n");
      return `### Source Group ${i + 1}\n${itemsText}`;
    })
    .join("\n\n---\n\n");

  return `You are a knowledgeable analyst answering questions based on a curated knowledge base.

## User's Question
${question}

## Available Context (${context.totalItems} items from ${context.clusters.length} source groups)

${contextText}

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

export const QA_SYSTEM_PROMPT = `You are a helpful analyst. Answer questions based on provided context. Always respond with valid JSON matching the requested schema. Be honest about uncertainty.`;
```

### Step 4: Handler (`packages/pipeline/src/qa/handler.ts`)

```typescript
import { AskRequest, AskResponse, QALlmResponse } from "@aharadar/shared/types/qa";
import { retrieveContext } from "./retrieval";
import { buildQAPrompt, QA_SYSTEM_PROMPT } from "./prompt";
import { llmRouter } from "@aharadar/llm";
import { db } from "@aharadar/db";

export async function handleAskQuestion(request: AskRequest, userId: string): Promise<AskResponse> {
  const { question, topicId, options } = request;

  // 1. Retrieve relevant context
  const context = await retrieveContext(question, topicId, options);

  // 2. Handle no-data case
  if (context.clusters.length === 0) {
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
  const llmResponse = await llmRouter.call({
    task: "qa",
    systemPrompt: QA_SYSTEM_PROMPT,
    userPrompt,
    responseFormat: "json",
    userId,
  });

  // 5. Parse response
  const parsed = JSON.parse(llmResponse.content) as QALlmResponse;

  // 6. Enrich citations with full item data
  const citations = parsed.citations.map((cite) => {
    // Find matching item by title
    const matchingItem = context.clusters
      .flatMap((c) => c.items)
      .find((item) => item.title.includes(cite.title) || cite.title.includes(item.title));

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
  await db.providerCalls.record({
    userId,
    purpose: "qa",
    provider: llmResponse.provider,
    model: llmResponse.model,
    inputTokens: llmResponse.usage.inputTokens,
    outputTokens: llmResponse.usage.outputTokens,
  });

  return {
    answer: parsed.answer,
    citations,
    confidence: parsed.confidence,
    dataGaps: parsed.data_gaps,
    usage: {
      clustersRetrieved: context.clusters.length,
      tokensUsed: {
        input: llmResponse.usage.inputTokens,
        output: llmResponse.usage.outputTokens,
      },
    },
  };
}
```

### Step 5: API Endpoint (`packages/api/src/routes/ask.ts`)

```typescript
import { Router } from "express";
import { handleAskQuestion } from "@aharadar/pipeline/qa/handler";
import { AskRequest } from "@aharadar/shared/types/qa";

const router = Router();

router.post("/", async (req, res) => {
  try {
    const request = req.body as AskRequest;
    const userId = req.user?.id ?? "singleton"; // MVP: singleton user

    // Validate
    if (!request.question || !request.topicId) {
      return res.status(400).json({ error: "question and topicId required" });
    }

    // Check experimental flag
    const qaEnabled = process.env.QA_ENABLED === "true";
    if (!qaEnabled) {
      return res.status(403).json({ error: "Q&A feature is not enabled" });
    }

    const response = await handleAskQuestion(request, userId);
    res.json(response);
  } catch (error) {
    console.error("Q&A error:", error);
    res.status(500).json({ error: "Failed to process question" });
  }
});

export default router;
```

### Step 6: CLI Command (`packages/cli/src/commands/ask.ts`)

```typescript
import { Command } from "commander";
import { handleAskQuestion } from "@aharadar/pipeline/qa/handler";

export const askCommand = new Command("ask")
  .description("Ask a question about your knowledge base")
  .argument("<question>", "The question to ask")
  .requiredOption("--topic <id>", "Topic ID to search within")
  .option("--max-clusters <n>", "Max clusters to retrieve", "5")
  .action(async (question, options) => {
    const response = await handleAskQuestion(
      {
        question,
        topicId: options.topic,
        options: { maxClusters: parseInt(options.maxClusters) },
      },
      "singleton"
    );

    console.log("\n📝 Answer:\n");
    console.log(response.answer);

    console.log("\n📚 Citations:");
    response.citations.forEach((cite) => {
      console.log(`  - ${cite.title}`);
      console.log(`    ${cite.url}`);
    });

    console.log(`\n🎯 Confidence: ${(response.confidence.score * 100).toFixed(0)}%`);
    console.log(`   ${response.confidence.reasoning}`);

    if (response.dataGaps?.length) {
      console.log("\n⚠️ Data gaps:");
      response.dataGaps.forEach((gap) => console.log(`  - ${gap}`));
    }

    console.log(
      `\n📊 Retrieved ${response.usage.clustersRetrieved} clusters, used ${response.usage.tokensUsed.input + response.usage.tokensUsed.output} tokens`
    );
  });
```

### Step 7: Web UI (`packages/web/src/app/app/ask/page.tsx`)

```tsx
"use client";

import { useState } from "react";
import { useTopics } from "@/hooks/useTopics";

export default function AskPage() {
  const { topics } = useTopics();
  const [topicId, setTopicId] = useState("");
  const [question, setQuestion] = useState("");
  const [response, setResponse] = useState<AskResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim() || !topicId) return;

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, topicId }),
      });

      if (!res.ok) throw new Error(await res.text());

      setResponse(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to get answer");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Ask Your Knowledge Base</h1>

      <form onSubmit={handleSubmit} className="space-y-4 mb-8">
        <select
          value={topicId}
          onChange={(e) => setTopicId(e.target.value)}
          className="w-full p-2 border rounded"
          required
        >
          <option value="">Select a topic...</option>
          {topics.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>

        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask anything... e.g., What would Warren Buffett think about recent tech layoffs?"
          className="w-full p-3 border rounded h-24"
          required
        />

        <button
          type="submit"
          disabled={loading || !topicId}
          className="px-6 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
        >
          {loading ? "Thinking..." : "Ask"}
        </button>
      </form>

      {error && <div className="p-4 bg-red-50 text-red-700 rounded mb-4">{error}</div>}

      {response && (
        <div className="space-y-6">
          <div className="prose max-w-none">
            <h2>Answer</h2>
            <p>{response.answer}</p>
          </div>

          <div>
            <h3 className="font-semibold mb-2">
              Confidence: {(response.confidence.score * 100).toFixed(0)}%
            </h3>
            <p className="text-gray-600 text-sm">{response.confidence.reasoning}</p>
          </div>

          {response.citations.length > 0 && (
            <div>
              <h3 className="font-semibold mb-2">Sources</h3>
              <ul className="space-y-2">
                {response.citations.map((cite, i) => (
                  <li key={i} className="text-sm">
                    <a href={cite.url} target="_blank" className="text-blue-600 hover:underline">
                      {cite.title}
                    </a>
                    <span className="text-gray-500 ml-2">({cite.sourceType})</span>
                    <p className="text-gray-600">{cite.relevance}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {response.dataGaps?.length > 0 && (
            <div className="p-4 bg-yellow-50 rounded">
              <h3 className="font-semibold mb-2">Data Gaps</h3>
              <ul className="list-disc list-inside text-sm">
                {response.dataGaps.map((gap, i) => (
                  <li key={i}>{gap}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

### Step 8: LLM Router Update

Add `qa` task type to the LLM router config:

```typescript
// In packages/llm/src/router.ts or env config
const QA_CONFIG = {
  model: process.env.QA_MODEL ?? "claude-3-haiku-20240307",
  maxOutputTokens: parseInt(process.env.QA_MAX_OUTPUT_TOKENS ?? "2000"),
  creditsPerInputToken: 0.00025,
  creditsPerOutputToken: 0.00125,
};
```

### Step 9: Database Queries (if not exists)

May need to add cluster centroid search:

```typescript
// packages/db/src/queries/clusters.ts
export async function searchByCentroid(params: {
  embedding: number[];
  topicId: string;
  limit: number;
  minSimilarity: number;
  timeWindow?: { from?: string; to?: string };
}) {
  // Use pgvector similarity search on cluster centroids
  // Filter by topic_id and time window
  // Return clusters ordered by similarity
}
```

---

## Environment Variables

```bash
# Add to .env.example
QA_ENABLED=false                              # Feature flag (off by default)
QA_MODEL=claude-3-haiku-20240307             # Model for Q&A
QA_MAX_OUTPUT_TOKENS=2000                     # Max response length
QA_MAX_CLUSTERS=5                             # Default clusters to retrieve
QA_MAX_CONTEXT_CHARS=30000                    # Token budget
```
