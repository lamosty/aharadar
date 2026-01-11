/**
 * Mock data for digests and items.
 * This will be replaced by the real data layer (Task 036).
 */

export interface DigestSummary {
  id: string;
  topicId: string;
  topicName: string;
  windowStart: string;
  windowEnd: string;
  mode: "low" | "normal" | "high";
  status: "complete" | "failed";
  creditsUsed: number;
  topScore: number | null;
  itemCount: number;
  sourceCount: {
    total: number;
    succeeded: number;
    skipped: number;
  };
  createdAt: string;
}

// TriageFeatures matches the actual triageJson structure from the pipeline
// Top-level fields come from LLM triage, system_features come from rankCandidates
export interface TriageFeatures {
  // Top-level LLM triage output
  aha_score?: number;
  reason?: string;
  is_relevant?: boolean;
  is_novel?: boolean;
  should_deep_summarize?: boolean;
  categories?: string[];
  model?: string;
  provider?: string;
  prompt_id?: string;
  schema_version?: string;

  // System features computed during ranking
  system_features?: {
    signal_corroboration_v1?: {
      matched: boolean;
      matched_url: string | null;
      signal_url_sample: string[];
    };
    novelty_v1?: {
      novelty01: number;
      lookback_days: number;
      max_similarity: number;
    };
    source_weight_v1?: {
      source_type?: string;
      type_weight: number;
      source_weight: number;
      effective_weight: number;
      source_name?: string;
    };
    user_preference_v1?: {
      source_type: string;
      source_type_weight: number;
      author: string | null;
      author_weight: number;
      effective_weight: number;
    };
    recency_decay_v1?: {
      age_hours: number;
      decay_hours: number;
      decay_factor: number;
    };
  };

  [key: string]: unknown; // Future features
}

export interface DigestItem {
  id: string;
  rank: number;
  score: number;
  contentItem: {
    id: string;
    title: string | null;
    url: string;
    author: string | null;
    publishedAt: string | null;
    sourceType: string;
    triageSummary?: string;
    bodyText?: string | null;
    metadata?: Record<string, unknown> | null;
  };
  triageJson?: TriageFeatures;
  feedback?: "like" | "dislike" | "save" | "skip" | null;
}

export interface DigestDetail {
  id: string;
  windowStart: string;
  windowEnd: string;
  mode: "low" | "normal" | "high";
  status: "complete" | "failed";
  creditsUsed: number;
  sourceResults: Array<{
    sourceId: string;
    sourceName: string;
    sourceType: string;
    status: "ok" | "partial" | "error" | "skipped";
    skipReason?: string;
    itemsFetched: number;
  }>;
  errorMessage: string | null;
  itemCount: number;
  createdAt: string;
  items: DigestItem[];
}

// Mock digest list data
const mockDigests: DigestSummary[] = [
  {
    id: "d1-uuid-mock",
    topicId: "topic-1-mock",
    topicName: "Tech News",
    windowStart: "2025-01-06T08:00:00Z",
    windowEnd: "2025-01-06T14:00:00Z",
    mode: "normal",
    status: "complete",
    creditsUsed: 0.05,
    topScore: 0.85,
    itemCount: 12,
    sourceCount: { total: 4, succeeded: 4, skipped: 0 },
    createdAt: "2025-01-06T14:05:00Z",
  },
  {
    id: "d2-uuid-mock",
    topicId: "topic-1-mock",
    topicName: "Tech News",
    windowStart: "2025-01-06T00:00:00Z",
    windowEnd: "2025-01-06T08:00:00Z",
    mode: "normal",
    status: "complete",
    creditsUsed: 0.04,
    topScore: 0.72,
    itemCount: 8,
    sourceCount: { total: 4, succeeded: 4, skipped: 0 },
    createdAt: "2025-01-06T08:03:00Z",
  },
  {
    id: "d3-uuid-mock",
    topicId: "topic-2-mock",
    topicName: "Finance",
    windowStart: "2025-01-05T16:00:00Z",
    windowEnd: "2025-01-06T00:00:00Z",
    mode: "high",
    status: "complete",
    creditsUsed: 0.08,
    topScore: 0.91,
    itemCount: 15,
    sourceCount: { total: 4, succeeded: 4, skipped: 0 },
    createdAt: "2025-01-06T00:04:00Z",
  },
  {
    id: "d4-uuid-mock",
    topicId: "topic-1-mock",
    topicName: "Tech News",
    windowStart: "2025-01-05T08:00:00Z",
    windowEnd: "2025-01-05T16:00:00Z",
    mode: "low",
    status: "failed",
    creditsUsed: 0.01,
    topScore: null,
    itemCount: 5,
    sourceCount: { total: 4, succeeded: 3, skipped: 1 },
    createdAt: "2025-01-05T16:02:00Z",
  },
  {
    id: "d5-uuid-mock",
    topicId: "topic-2-mock",
    topicName: "Finance",
    windowStart: "2025-01-05T00:00:00Z",
    windowEnd: "2025-01-05T08:00:00Z",
    mode: "normal",
    status: "complete",
    creditsUsed: 0.06,
    topScore: 0.68,
    itemCount: 22,
    sourceCount: { total: 4, succeeded: 4, skipped: 0 },
    createdAt: "2025-01-05T08:10:00Z",
  },
];

// Mock digest detail data
const mockDigestItems: DigestItem[] = [
  {
    id: "di1-uuid-mock",
    rank: 1,
    score: 0.95,
    contentItem: {
      id: "ci1-uuid-mock",
      title: "New breakthrough in AI code generation enables 10x productivity gains",
      url: "https://example.com/ai-code-gen",
      author: "Jane Smith",
      publishedAt: "2025-01-06T10:30:00Z",
      sourceType: "hn",
      triageSummary:
        "Major advancement in AI-assisted coding with measurable productivity improvements.",
    },
    triageJson: {
      aha_score: 95,
      reason: "Highly relevant to AI/ML interests, novel findings",
      is_relevant: true,
      is_novel: true,
      categories: ["AI", "productivity", "code generation"],
      system_features: {
        novelty_v1: { novelty01: 0.92, lookback_days: 7, max_similarity: 0.08 },
        source_weight_v1: {
          source_type: "hn",
          type_weight: 1,
          source_weight: 1.5,
          effective_weight: 1.5,
          source_name: "Hacker News",
        },
        signal_corroboration_v1: {
          matched: true,
          matched_url: "https://twitter.com/ai_researcher/123",
          signal_url_sample: [],
        },
        recency_decay_v1: { age_hours: 2.5, decay_hours: 24, decay_factor: 0.9 },
      },
    },
    feedback: null,
  },
  {
    id: "di2-uuid-mock",
    rank: 2,
    score: 0.88,
    contentItem: {
      id: "ci2-uuid-mock",
      title: "PostgreSQL 17 release brings major performance improvements",
      url: "https://example.com/postgres-17",
      author: "Database Team",
      publishedAt: "2025-01-06T09:00:00Z",
      sourceType: "reddit",
      triageSummary:
        "PostgreSQL 17 released with significant query optimization and storage improvements.",
    },
    triageJson: {
      aha_score: 88,
      reason: "Important database update, matches tech infrastructure interests",
      is_relevant: true,
      is_novel: true,
      categories: ["databases", "postgres"],
      system_features: {
        novelty_v1: { novelty01: 0.85, lookback_days: 7, max_similarity: 0.15 },
        source_weight_v1: {
          source_type: "reddit",
          type_weight: 1,
          source_weight: 1.2,
          effective_weight: 1.2,
          source_name: "r/programming",
        },
        recency_decay_v1: { age_hours: 4, decay_hours: 24, decay_factor: 0.85 },
      },
    },
    feedback: "like",
  },
  {
    id: "di3-uuid-mock",
    rank: 3,
    score: 0.82,
    contentItem: {
      id: "ci3-uuid-mock",
      title: "Understanding React Server Components: A Deep Dive",
      url: "https://example.com/rsc-deep-dive",
      author: "Frontend Weekly",
      publishedAt: "2025-01-06T07:00:00Z",
      sourceType: "rss",
    },
    triageJson: {
      aha_score: 82,
      reason: "Technical deep dive matching frontend development interests",
      is_relevant: true,
      is_novel: false,
      categories: ["react", "frontend"],
      system_features: {
        novelty_v1: { novelty01: 0.7, lookback_days: 7, max_similarity: 0.3 },
        source_weight_v1: {
          source_type: "rss",
          type_weight: 1,
          source_weight: 1.0,
          effective_weight: 1.0,
          source_name: "Frontend Weekly RSS",
        },
        recency_decay_v1: { age_hours: 6, decay_hours: 24, decay_factor: 0.78 },
      },
    },
    feedback: null,
  },
  {
    id: "di4-uuid-mock",
    rank: 4,
    score: 0.75,
    contentItem: {
      id: "ci4-uuid-mock",
      title: "The State of TypeScript in 2025",
      url: "https://example.com/typescript-2025",
      author: null,
      publishedAt: "2025-01-05T22:00:00Z",
      sourceType: "youtube",
    },
    triageJson: {
      aha_score: 75,
      reason: "Yearly review of TypeScript ecosystem",
      is_relevant: true,
      is_novel: false,
      categories: ["typescript", "programming"],
      system_features: {
        novelty_v1: { novelty01: 0.65, lookback_days: 7, max_similarity: 0.35 },
        source_weight_v1: {
          source_type: "youtube",
          type_weight: 1,
          source_weight: 0.9,
          effective_weight: 0.9,
          source_name: "Tech Talks",
        },
        recency_decay_v1: { age_hours: 15, decay_hours: 24, decay_factor: 0.53 },
      },
    },
    feedback: "save",
  },
  {
    id: "di5-uuid-mock",
    rank: 5,
    score: 0.68,
    contentItem: {
      id: "ci5-uuid-mock",
      title: "Kubernetes 1.30: What's New and Migration Guide",
      url: "https://example.com/k8s-130",
      author: "K8s Maintainers",
      publishedAt: "2025-01-05T18:00:00Z",
      sourceType: "hn",
      triageSummary: "Overview of new features in Kubernetes 1.30 with migration recommendations.",
    },
    triageJson: {
      aha_score: 68,
      reason: "Infrastructure update, moderate relevance",
      is_relevant: true,
      is_novel: false,
      categories: ["kubernetes", "infrastructure"],
      system_features: {
        novelty_v1: { novelty01: 0.55, lookback_days: 7, max_similarity: 0.45 },
        source_weight_v1: {
          source_type: "hn",
          type_weight: 1,
          source_weight: 1.5,
          effective_weight: 1.5,
          source_name: "Hacker News",
        },
        recency_decay_v1: { age_hours: 19, decay_hours: 24, decay_factor: 0.45 },
      },
    },
    feedback: "dislike",
  },
];

function getMockDigestDetail(id: string): DigestDetail | null {
  const digest = mockDigests.find((d) => d.id === id);
  if (!digest) return null;

  return {
    ...digest,
    sourceResults: [
      {
        sourceId: "s1",
        sourceName: "TechCrunch",
        sourceType: "rss",
        status: "ok",
        itemsFetched: 5,
      },
      {
        sourceId: "s2",
        sourceName: "r/technology",
        sourceType: "reddit",
        status: "ok",
        itemsFetched: 8,
      },
    ],
    errorMessage: digest.status === "failed" ? "Budget exhausted: x_posts skipped" : null,
    items: mockDigestItems.slice(0, digest.itemCount > 5 ? 5 : digest.itemCount),
  };
}

// Placeholder hooks - will be replaced by data layer (Task 036)

export interface UseDigestsResult {
  data: DigestSummary[] | undefined;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
}

export interface UseDigestDetailResult {
  data: DigestDetail | undefined;
  isLoading: boolean;
  isError: boolean;
  isStale: boolean;
  error: Error | null;
  refetch: () => void;
}

export interface UseFeedbackResult {
  submitFeedback: (
    contentItemId: string,
    digestId: string,
    action: "like" | "dislike" | "save" | "skip",
  ) => Promise<void>;
  isPending: boolean;
}

/**
 * Placeholder hook for fetching digests list.
 * Will be replaced by useDigests() from data layer.
 */
export function useMockDigests(): UseDigestsResult {
  // Simulate loaded state with mock data
  return {
    data: mockDigests,
    isLoading: false,
    isError: false,
    error: null,
    refetch: () => {
      // No-op in mock
    },
  };
}

/**
 * Placeholder hook for fetching digest detail.
 * Will be replaced by useDigestDetail() from data layer.
 */
export function useMockDigestDetail(id: string): UseDigestDetailResult {
  const detail = getMockDigestDetail(id);
  return {
    data: detail ?? undefined,
    isLoading: false,
    isError: !detail,
    isStale: false,
    error: detail ? null : new Error("Digest not found"),
    refetch: () => {
      // No-op in mock
    },
  };
}

/**
 * Placeholder hook for submitting feedback.
 * Will be replaced by useFeedback() from data layer.
 */
export function useMockFeedback(): UseFeedbackResult {
  return {
    submitFeedback: async () => {
      // Simulate API delay
      await new Promise((resolve) => setTimeout(resolve, 200));
    },
    isPending: false,
  };
}

// ============================================================================
// Real API Hooks with Adapters
// These use the real API but transform responses to match component interfaces
// ============================================================================

import type { DigestItem as ApiDigestItem, DigestDetailResponse, DigestListItem } from "./api";
import { useDigest, useDigests, useFeedback } from "./hooks";

/**
 * Adapt API DigestListItem to component DigestSummary.
 */
function adaptDigestSummary(item: DigestListItem): DigestSummary {
  return {
    id: item.id,
    topicId: item.topicId,
    topicName: item.topicName,
    windowStart: item.windowStart,
    windowEnd: item.windowEnd,
    mode: item.mode as DigestSummary["mode"],
    status: item.status,
    creditsUsed: item.creditsUsed,
    topScore: item.topScore,
    itemCount: item.itemCount,
    sourceCount: item.sourceCount,
    createdAt: item.createdAt,
  };
}

/**
 * Adapt API DigestItem to component DigestItem.
 */
function adaptDigestItem(apiItem: ApiDigestItem, index: number): DigestItem {
  // Derive triageSummary: prefer deep summary, else triage reason
  const deepSummary = apiItem.summaryJson
    ? String((apiItem.summaryJson as Record<string, unknown>).summary ?? "")
    : "";
  const triageReason = apiItem.triageJson
    ? String((apiItem.triageJson as Record<string, unknown>).reason ?? "")
    : "";
  const triageSummary = deepSummary || triageReason || undefined;

  return {
    id: apiItem.contentItemId ?? `item-${index}`,
    rank: apiItem.rank,
    score: apiItem.score,
    contentItem: {
      id: apiItem.contentItemId ?? `item-${index}`,
      title: apiItem.item?.title ?? null,
      url: apiItem.item?.url ?? "",
      author: apiItem.item?.author ?? null,
      publishedAt: apiItem.item?.publishedAt ?? null,
      sourceType: apiItem.item?.sourceType ?? "unknown",
      triageSummary,
      bodyText: apiItem.item?.bodyText ?? null,
      metadata: apiItem.item?.metadata ?? null,
    },
    triageJson: apiItem.triageJson ? (apiItem.triageJson as unknown as TriageFeatures) : undefined,
    feedback: null, // API doesn't return feedback state per item currently
  };
}

/**
 * Adapt API DigestDetailResponse to component DigestDetail.
 */
function adaptDigestDetail(response: DigestDetailResponse): DigestDetail {
  return {
    id: response.digest.id,
    windowStart: response.digest.windowStart,
    windowEnd: response.digest.windowEnd,
    mode: response.digest.mode as DigestDetail["mode"],
    status: response.digest.status,
    creditsUsed: response.digest.creditsUsed,
    sourceResults: response.digest.sourceResults,
    errorMessage: response.digest.errorMessage,
    itemCount: response.items.length,
    createdAt: response.digest.createdAt,
    items: response.items.map(adaptDigestItem),
  };
}

/**
 * Hook for fetching digests list using real API.
 * Returns data in component-expected shape.
 */
export function useRealDigests(): UseDigestsResult {
  const query = useDigests();

  return {
    data: query.data?.digests.map(adaptDigestSummary),
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error ?? null,
    refetch: () => {
      query.refetch();
    },
  };
}

/**
 * Hook for fetching digest detail using real API.
 * Returns data in component-expected shape.
 */
export function useRealDigestDetail(id: string): UseDigestDetailResult {
  const query = useDigest(id);

  return {
    data: query.data ? adaptDigestDetail(query.data) : undefined,
    isLoading: query.isLoading,
    isError: query.isError,
    isStale: query.isStale ?? false,
    error: query.error ?? null,
    refetch: () => {
      query.refetch();
    },
  };
}

/**
 * Hook for submitting feedback using real API.
 */
export function useRealFeedback(): UseFeedbackResult {
  const mutation = useFeedback();

  return {
    submitFeedback: async (
      contentItemId: string,
      digestId: string,
      action: "like" | "dislike" | "save" | "skip",
    ) => {
      await mutation.mutateAsync({
        contentItemId,
        digestId,
        action,
      });
    },
    isPending: mutation.isPending,
  };
}
