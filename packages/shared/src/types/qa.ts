/**
 * Q&A / "Ask Your Knowledge Base" feature types.
 *
 * Experimental feature - off by default via QA_ENABLED=false.
 */

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

/**
 * Internal type for LLM response parsing.
 * The LLM returns JSON matching this shape.
 */
export interface QALlmResponse {
  answer: string;
  citations: { title: string; relevance: string }[];
  confidence: { score: number; reasoning: string };
  data_gaps?: string[];
}
