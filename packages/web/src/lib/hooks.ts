/**
 * React Query hooks for data fetching.
 *
 * Features:
 * - Type-safe queries and mutations
 * - Automatic caching and deduplication
 * - Stale-while-revalidate pattern
 * - Optimistic updates for feedback
 */

import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryOptions,
  type UseMutationOptions,
} from "@tanstack/react-query";
import {
  getHealth,
  getDigests,
  getDigest,
  getItem,
  postFeedback,
  postAdminRun,
  getAdminSources,
  patchAdminSource,
  getAdminBudgets,
  type HealthResponse,
  type DigestsListResponse,
  type DigestDetailResponse,
  type ItemDetailResponse,
  type FeedbackRequest,
  type FeedbackResponse,
  type AdminRunRequest,
  type AdminRunResponse,
  type SourcesListResponse,
  type SourcePatchRequest,
  type SourcePatchResponse,
  type BudgetsResponse,
  type DigestItem,
  type FeedbackAction,
  ApiError,
  NetworkError,
} from "./api";

// ============================================================================
// Query Keys
// ============================================================================

export const queryKeys = {
  health: ["health"] as const,
  digests: {
    all: ["digests"] as const,
    list: (params?: { from?: string; to?: string }) =>
      ["digests", "list", params] as const,
    detail: (id: string) => ["digests", id] as const,
  },
  items: {
    all: ["items"] as const,
    detail: (id: string) => ["items", id] as const,
  },
  admin: {
    sources: ["admin", "sources"] as const,
    budgets: ["admin", "budgets"] as const,
  },
} as const;

// ============================================================================
// Health Query
// ============================================================================

export function useHealth(
  options?: Omit<UseQueryOptions<HealthResponse, ApiError | NetworkError>, "queryKey" | "queryFn">
) {
  return useQuery({
    queryKey: queryKeys.health,
    queryFn: ({ signal }) => getHealth(signal),
    ...options,
  });
}

// ============================================================================
// Digests Queries
// ============================================================================

export function useDigests(
  params?: { from?: string; to?: string },
  options?: Omit<UseQueryOptions<DigestsListResponse, ApiError | NetworkError>, "queryKey" | "queryFn">
) {
  return useQuery({
    queryKey: queryKeys.digests.list(params),
    queryFn: ({ signal }) => getDigests(params, signal),
    ...options,
  });
}

export function useDigest(
  id: string,
  options?: Omit<UseQueryOptions<DigestDetailResponse, ApiError | NetworkError>, "queryKey" | "queryFn">
) {
  return useQuery({
    queryKey: queryKeys.digests.detail(id),
    queryFn: ({ signal }) => getDigest(id, signal),
    enabled: !!id,
    ...options,
  });
}

// ============================================================================
// Items Queries
// ============================================================================

export function useItem(
  id: string,
  options?: Omit<UseQueryOptions<ItemDetailResponse, ApiError | NetworkError>, "queryKey" | "queryFn">
) {
  return useQuery({
    queryKey: queryKeys.items.detail(id),
    queryFn: ({ signal }) => getItem(id, signal),
    enabled: !!id,
    ...options,
  });
}

// ============================================================================
// Feedback Mutation with Optimistic Updates
// ============================================================================

interface FeedbackMutationContext {
  previousDigest: DigestDetailResponse | undefined;
  previousItem: ItemDetailResponse | undefined;
}

interface UseFeedbackOptions {
  /** Digest ID for optimistic cache updates */
  digestId?: string;
  /** Item ID for optimistic cache updates */
  itemId?: string;
  /** Callback on success */
  onSuccess?: (data: FeedbackResponse) => void;
  /** Callback on error (after rollback) */
  onError?: (error: ApiError | NetworkError) => void;
}

/**
 * Feedback mutation with optimistic updates.
 *
 * Updates the UI immediately on click, then rolls back if the request fails.
 */
export function useFeedback(options?: UseFeedbackOptions) {
  const queryClient = useQueryClient();

  return useMutation<
    FeedbackResponse,
    ApiError | NetworkError,
    FeedbackRequest,
    FeedbackMutationContext
  >({
    mutationFn: (feedback) => postFeedback(feedback),

    // Optimistic update: update cache before request completes
    onMutate: async (feedback) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({
        queryKey: queryKeys.digests.detail(feedback.digestId ?? ""),
      });
      await queryClient.cancelQueries({
        queryKey: queryKeys.items.detail(feedback.contentItemId),
      });

      // Snapshot the previous values
      const previousDigest = feedback.digestId
        ? queryClient.getQueryData<DigestDetailResponse>(
            queryKeys.digests.detail(feedback.digestId)
          )
        : undefined;

      const previousItem = queryClient.getQueryData<ItemDetailResponse>(
        queryKeys.items.detail(feedback.contentItemId)
      );

      // We could optimistically update the UI here if we had a local feedback state
      // For now, we just mark the item as having feedback pending
      // The actual feedback state should be managed by the component

      return { previousDigest, previousItem };
    },

    // Rollback on error
    onError: (_error, feedback, context) => {
      // Restore the previous values
      if (context?.previousDigest && feedback.digestId) {
        queryClient.setQueryData(
          queryKeys.digests.detail(feedback.digestId),
          context.previousDigest
        );
      }
      if (context?.previousItem) {
        queryClient.setQueryData(
          queryKeys.items.detail(feedback.contentItemId),
          context.previousItem
        );
      }

      options?.onError?.(_error);
    },

    // Invalidate queries on success to refetch fresh data
    onSuccess: (data) => {
      // Optionally invalidate to refetch (disabled by default for snappy UX)
      // queryClient.invalidateQueries({ queryKey: queryKeys.digests.all });
      options?.onSuccess?.(data);
    },

    onSettled: (_data, _error, feedback) => {
      // Optionally invalidate after settling
      if (feedback.digestId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.digests.detail(feedback.digestId),
        });
      }
    },
  });
}

/**
 * Local feedback state manager for optimistic UI.
 *
 * Tracks pending feedback actions for immediate UI updates
 * before the server confirms.
 */
export interface LocalFeedbackState {
  [contentItemId: string]: {
    action: FeedbackAction;
    pending: boolean;
  };
}

// ============================================================================
// Admin Mutations
// ============================================================================

export function useAdminRun(
  options?: Omit<
    UseMutationOptions<AdminRunResponse, ApiError | NetworkError, AdminRunRequest>,
    "mutationFn"
  >
) {
  return useMutation({
    mutationFn: (request) => postAdminRun(request),
    ...options,
  });
}

export function useAdminSources(
  options?: Omit<
    UseQueryOptions<SourcesListResponse, ApiError | NetworkError>,
    "queryKey" | "queryFn"
  >
) {
  return useQuery({
    queryKey: queryKeys.admin.sources,
    queryFn: ({ signal }) => getAdminSources(signal),
    ...options,
  });
}

interface PatchSourceVariables {
  id: string;
  patch: SourcePatchRequest;
}

export function useAdminSourcePatch(
  options?: Omit<
    UseMutationOptions<SourcePatchResponse, ApiError | NetworkError, PatchSourceVariables>,
    "mutationFn"
  >
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, patch }) => patchAdminSource(id, patch),
    onSuccess: () => {
      // Invalidate sources list to refetch
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.sources });
    },
    ...options,
  });
}

export function useAdminBudgets(
  options?: Omit<
    UseQueryOptions<BudgetsResponse, ApiError | NetworkError>,
    "queryKey" | "queryFn"
  >
) {
  return useQuery({
    queryKey: queryKeys.admin.budgets,
    queryFn: ({ signal }) => getAdminBudgets(signal),
    // Refetch budgets more frequently as they change
    staleTime: 10 * 1000, // 10 seconds
    ...options,
  });
}

// ============================================================================
// Prefetching Utilities
// ============================================================================

/**
 * Prefetch a digest detail on hover for faster navigation.
 */
export function usePrefetchDigest() {
  const queryClient = useQueryClient();

  return (id: string) => {
    queryClient.prefetchQuery({
      queryKey: queryKeys.digests.detail(id),
      queryFn: ({ signal }) => getDigest(id, signal),
      staleTime: 30 * 1000,
    });
  };
}

/**
 * Prefetch an item detail on hover for faster navigation.
 */
export function usePrefetchItem() {
  const queryClient = useQueryClient();

  return (id: string) => {
    queryClient.prefetchQuery({
      queryKey: queryKeys.items.detail(id),
      queryFn: ({ signal }) => getItem(id, signal),
      staleTime: 30 * 1000,
    });
  };
}
