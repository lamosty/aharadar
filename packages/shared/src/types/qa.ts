/**
 * Q&A / "Ask Your Knowledge Base" feature types.
 *
 * Experimental feature - off by default via QA_ENABLED=false.
 */

export interface AskRequest {
  question: string;
  topicId: string;
  /**
   * Optional conversation/thread id for multi-turn Ask.
   * If omitted, the server will create a new conversation.
   */
  conversationId?: string;
  options?: {
    timeWindow?: { from?: string; to?: string };
    maxClusters?: number;
    /** Include verbose debug information in response */
    debug?: boolean;
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

/** Debug info for a retrieved cluster */
export interface DebugCluster {
  id: string;
  similarity: number;
  summary: string | null;
  itemCount: number;
  items: {
    id: string;
    title: string;
    url: string;
    sourceType: string;
    publishedAt: string;
    bodyPreview: string; // First 200 chars
  }[];
}

/** Debug info for embedding phase */
export interface DebugEmbedding {
  model: string;
  provider: string;
  endpoint: string;
  inputTokens: number;
  durationMs: number;
  costEstimateCredits: number;
}

/** Debug info for LLM phase */
export interface DebugLlm {
  model: string;
  provider: string;
  endpoint: string;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  promptPreview: string; // First 500 chars of prompt
  promptLength: number; // Full prompt length
  rawResponse: string; // Raw LLM output before parsing
  parseSuccess: boolean;
}

/** Full debug information */
export interface AskDebugInfo {
  /** Request details */
  request: {
    question: string;
    topicId: string;
    topicName?: string;
    maxClusters: number;
    timeWindow?: { from?: string; to?: string };
  };
  /** Timing breakdown */
  timing: {
    totalMs: number;
    embeddingMs: number;
    retrievalMs: number;
    llmMs: number;
    parsingMs: number;
  };
  /** Embedding phase details */
  embedding: DebugEmbedding;
  /** Retrieval phase details */
  retrieval: {
    clustersSearched: number;
    clustersMatched: number;
    minSimilarityThreshold: number;
    clusters: DebugCluster[];
  };
  /** LLM phase details */
  llm: DebugLlm;
  /** Cost breakdown */
  cost: {
    embeddingCredits: number;
    llmCredits: number;
    totalCredits: number;
  };
}

export interface AskResponse {
  /** The conversation id used for this answer (created if absent in request). */
  conversationId: string;
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
  /** Debug information (only present if debug=true in request) */
  debug?: AskDebugInfo;
}

/**
 * Ask conversation/turn thread types for the Chat UI.
 * Conversations are topic-scoped and user-scoped.
 */
export interface AskConversationSummary {
  id: string;
  topicId: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AskTurn {
  id: string;
  createdAt: string;
  question: string;
  answer: string;
  citations?: { title: string; relevance: string }[];
  confidence?: { score: number; reasoning: string };
  dataGaps?: string[];
}

export interface ListAskConversationsResponse {
  conversations: AskConversationSummary[];
}

export interface CreateAskConversationRequest {
  topicId: string;
  title?: string;
}

export interface CreateAskConversationResponse {
  conversation: AskConversationSummary;
}

export interface GetAskConversationResponse {
  conversation: AskConversationSummary;
  turns: AskTurn[];
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
