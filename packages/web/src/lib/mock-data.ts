/**
 * Mock data for digests and items.
 * This will be replaced by the real data layer (Task 036).
 */

export interface DigestSummary {
  id: string;
  windowStart: string;
  windowEnd: string;
  mode: "low" | "normal" | "high" | "catch_up";
  itemCount: number;
  createdAt: string;
}

export interface TriageFeatures {
  signal_corroboration_v1?: {
    corroborating_urls: string[];
    corroborating_topics: string[];
    score: number;
  };
  novelty_v1?: {
    score: number;
    lookback_days: number;
    similar_items_count: number;
  };
  source_weight_v1?: {
    source_type: string;
    weight: number;
    source_name: string;
  };
  aha_score?: {
    score: number;
    reason: string;
  };
  [key: string]: unknown; // Future features
}

export interface DigestItem {
  id: string;
  rank: number;
  score: number;
  contentItem: {
    id: string;
    title: string;
    url: string;
    author: string | null;
    publishedAt: string | null;
    sourceType: string;
    triageSummary?: string;
  };
  triageJson?: {
    system_features?: TriageFeatures;
  };
  feedback?: "like" | "dislike" | "save" | "skip" | null;
}

export interface DigestDetail {
  id: string;
  windowStart: string;
  windowEnd: string;
  mode: "low" | "normal" | "high" | "catch_up";
  itemCount: number;
  createdAt: string;
  items: DigestItem[];
}

// Mock digest list data
const mockDigests: DigestSummary[] = [
  {
    id: "d1-uuid-mock",
    windowStart: "2025-01-06T08:00:00Z",
    windowEnd: "2025-01-06T14:00:00Z",
    mode: "normal",
    itemCount: 12,
    createdAt: "2025-01-06T14:05:00Z",
  },
  {
    id: "d2-uuid-mock",
    windowStart: "2025-01-06T00:00:00Z",
    windowEnd: "2025-01-06T08:00:00Z",
    mode: "normal",
    itemCount: 8,
    createdAt: "2025-01-06T08:03:00Z",
  },
  {
    id: "d3-uuid-mock",
    windowStart: "2025-01-05T16:00:00Z",
    windowEnd: "2025-01-06T00:00:00Z",
    mode: "high",
    itemCount: 15,
    createdAt: "2025-01-06T00:04:00Z",
  },
  {
    id: "d4-uuid-mock",
    windowStart: "2025-01-05T08:00:00Z",
    windowEnd: "2025-01-05T16:00:00Z",
    mode: "low",
    itemCount: 5,
    createdAt: "2025-01-05T16:02:00Z",
  },
  {
    id: "d5-uuid-mock",
    windowStart: "2025-01-05T00:00:00Z",
    windowEnd: "2025-01-05T08:00:00Z",
    mode: "catch_up",
    itemCount: 22,
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
      triageSummary: "Major advancement in AI-assisted coding with measurable productivity improvements.",
    },
    triageJson: {
      system_features: {
        aha_score: { score: 95, reason: "Highly relevant to AI/ML interests, novel findings" },
        novelty_v1: { score: 0.92, lookback_days: 7, similar_items_count: 1 },
        source_weight_v1: { source_type: "hn", weight: 1.5, source_name: "Hacker News" },
        signal_corroboration_v1: {
          corroborating_urls: ["https://twitter.com/ai_researcher/123"],
          corroborating_topics: ["AI", "productivity", "code generation"],
          score: 0.8,
        },
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
      triageSummary: "PostgreSQL 17 released with significant query optimization and storage improvements.",
    },
    triageJson: {
      system_features: {
        aha_score: { score: 88, reason: "Important database update, matches tech infrastructure interests" },
        novelty_v1: { score: 0.85, lookback_days: 7, similar_items_count: 2 },
        source_weight_v1: { source_type: "reddit", weight: 1.2, source_name: "r/programming" },
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
      system_features: {
        aha_score: { score: 82, reason: "Technical deep dive matching frontend development interests" },
        novelty_v1: { score: 0.7, lookback_days: 7, similar_items_count: 4 },
        source_weight_v1: { source_type: "rss", weight: 1.0, source_name: "Frontend Weekly RSS" },
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
      system_features: {
        aha_score: { score: 75, reason: "Yearly review of TypeScript ecosystem" },
        novelty_v1: { score: 0.65, lookback_days: 7, similar_items_count: 3 },
        source_weight_v1: { source_type: "youtube", weight: 0.9, source_name: "Tech Talks" },
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
      system_features: {
        aha_score: { score: 68, reason: "Infrastructure update, moderate relevance" },
        novelty_v1: { score: 0.55, lookback_days: 7, similar_items_count: 5 },
        source_weight_v1: { source_type: "hn", weight: 1.5, source_name: "Hacker News" },
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
    action: "like" | "dislike" | "save" | "skip"
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

import { useDigests, useDigest, useFeedback } from "./hooks";
import type {
  DigestListItem,
  DigestDetailResponse,
  DigestItem as ApiDigestItem,
} from "./api";

/**
 * Adapt API DigestListItem to component DigestSummary.
 */
function adaptDigestSummary(item: DigestListItem): DigestSummary {
  return {
    id: item.id,
    windowStart: item.windowStart,
    windowEnd: item.windowEnd,
    mode: item.mode as DigestSummary["mode"],
    itemCount: 0, // API doesn't provide this; will be filled from detail if needed
    createdAt: item.createdAt,
  };
}

/**
 * Adapt API DigestItem to component DigestItem.
 */
function adaptDigestItem(apiItem: ApiDigestItem, index: number): DigestItem {
  return {
    id: apiItem.contentItemId ?? `item-${index}`,
    rank: apiItem.rank,
    score: apiItem.score,
    contentItem: {
      id: apiItem.contentItemId ?? `item-${index}`,
      title: apiItem.item?.title ?? "(No title)",
      url: apiItem.item?.url ?? "",
      author: apiItem.item?.author ?? null,
      publishedAt: apiItem.item?.publishedAt ?? null,
      sourceType: apiItem.item?.sourceType ?? "unknown",
      triageSummary: apiItem.summaryJson
        ? String((apiItem.summaryJson as Record<string, unknown>).summary ?? "")
        : undefined,
    },
    triageJson: apiItem.triageJson
      ? { system_features: apiItem.triageJson as unknown as TriageFeatures }
      : undefined,
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
      action: "like" | "dislike" | "save" | "skip"
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
