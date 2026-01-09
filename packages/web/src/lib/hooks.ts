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
  type UseMutationOptions,
  type UseQueryOptions,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useCallback, useState } from "react";
import {
  type AdminRunRequest,
  type AdminRunResponse,
  type ApiError,
  type BudgetsResponse,
  type CreateTopicRequest,
  type CreateTopicResponse,
  createTopic,
  type DeleteTopicResponse,
  type DigestDetailResponse,
  type DigestsListResponse,
  deleteAdminSource,
  deleteTopic,
  type FeedbackAction,
  type FeedbackRequest,
  type FeedbackResponse,
  getAdminBudgets,
  getAdminLlmSettings,
  getAdminSources,
  getDigest,
  getDigests,
  getHealth,
  getItem,
  getItems,
  getPreferences,
  getQueueStatus,
  getTopic,
  getTopics,
  type HealthResponse,
  type ItemDetailResponse,
  type ItemsListParams,
  type ItemsListResponse,
  type LlmSettingsResponse,
  type LlmSettingsUpdateRequest,
  type NetworkError,
  type PreferencesGetResponse,
  type PreferencesMarkCheckedResponse,
  type PreferencesUpdateResponse,
  patchAdminLlmSettings,
  patchAdminSource,
  patchPreferences,
  patchTopicViewingProfile,
  postAdminRun,
  postAdminSource,
  postFeedback,
  postMarkChecked,
  postTopicMarkChecked,
  type QueueStatusResponse,
  type SourceCreateRequest,
  type SourceCreateResponse,
  type SourceDeleteResponse,
  type SourcePatchRequest,
  type SourcePatchResponse,
  type SourcesListResponse,
  type TopicDetailResponse,
  type TopicMarkCheckedResponse,
  type TopicsListResponse,
  type TopicViewingProfileUpdateRequest,
  type TopicViewingProfileUpdateResponse,
  type UpdateTopicRequest,
  type UpdateTopicResponse,
  updateTopic,
  type ViewingProfile,
} from "./api";

// ============================================================================
// Query Keys
// ============================================================================

export const queryKeys = {
  health: ["health"] as const,
  digests: {
    all: ["digests"] as const,
    list: (params?: { from?: string; to?: string }) => ["digests", "list", params] as const,
    detail: (id: string) => ["digests", id] as const,
  },
  items: {
    all: ["items"] as const,
    list: (params?: Omit<ItemsListParams, "offset">) => ["items", "list", params] as const,
    detail: (id: string) => ["items", id] as const,
  },
  admin: {
    sources: ["admin", "sources"] as const,
    budgets: ["admin", "budgets"] as const,
    llmSettings: ["admin", "llm-settings"] as const,
    queueStatus: ["admin", "queue-status"] as const,
  },
  preferences: ["preferences"] as const,
  topics: {
    all: ["topics"] as const,
    list: () => ["topics", "list"] as const,
    detail: (id: string) => ["topics", id] as const,
  },
} as const;

// ============================================================================
// Health Query
// ============================================================================

export function useHealth(
  options?: Omit<UseQueryOptions<HealthResponse, ApiError | NetworkError>, "queryKey" | "queryFn">,
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
  options?: Omit<
    UseQueryOptions<DigestsListResponse, ApiError | NetworkError>,
    "queryKey" | "queryFn"
  >,
) {
  return useQuery({
    queryKey: queryKeys.digests.list(params),
    queryFn: ({ signal }) => getDigests(params, signal),
    ...options,
  });
}

export function useDigest(
  id: string,
  options?: Omit<
    UseQueryOptions<DigestDetailResponse, ApiError | NetworkError>,
    "queryKey" | "queryFn"
  >,
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
  options?: Omit<
    UseQueryOptions<ItemDetailResponse, ApiError | NetworkError>,
    "queryKey" | "queryFn"
  >,
) {
  return useQuery({
    queryKey: queryKeys.items.detail(id),
    queryFn: ({ signal }) => getItem(id, signal),
    enabled: !!id,
    ...options,
  });
}

/**
 * Infinite query for unified feed items.
 * Supports pagination via "Load more" or infinite scroll.
 */
export function useItems(params?: Omit<ItemsListParams, "offset">) {
  const limit = params?.limit ?? 20;

  return useInfiniteQuery({
    queryKey: queryKeys.items.list(params),
    queryFn: ({ signal, pageParam }) =>
      getItems({ ...params, limit, offset: pageParam as number }, signal),
    initialPageParam: 0,
    getNextPageParam: (lastPage: ItemsListResponse) => {
      if (!lastPage.pagination.hasMore) return undefined;
      return lastPage.pagination.offset + lastPage.pagination.limit;
    },
  });
}

/**
 * Paged query for unified feed items.
 * Supports page-based navigation with explicit page/pageSize.
 */
export interface UsePagedItemsParams extends Omit<ItemsListParams, "offset" | "limit"> {
  page: number;
  pageSize: number;
}

export function usePagedItems(params: UsePagedItemsParams) {
  const { page, pageSize, ...rest } = params;
  const offset = (page - 1) * pageSize;

  return useQuery({
    queryKey: ["items", "paged", { ...rest, page, pageSize }],
    queryFn: ({ signal }) => getItems({ ...rest, limit: pageSize, offset }, signal),
    placeholderData: (previousData) => previousData, // Keep previous data while loading new page
  });
}

/**
 * LocalStorage hook for persisting values across sessions.
 */
export function useLocalStorage<T>(
  key: string,
  initialValue: T,
): [T, (value: T | ((prev: T) => T)) => void] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    if (typeof window === "undefined") {
      return initialValue;
    }
    try {
      const item = window.localStorage.getItem(key);
      return item ? (JSON.parse(item) as T) : initialValue;
    } catch {
      return initialValue;
    }
  });

  const setValue = useCallback(
    (value: T | ((prev: T) => T)) => {
      try {
        const valueToStore = value instanceof Function ? value(storedValue) : value;
        setStoredValue(valueToStore);
        if (typeof window !== "undefined") {
          window.localStorage.setItem(key, JSON.stringify(valueToStore));
        }
      } catch (error) {
        console.warn(`Error setting localStorage key "${key}":`, error);
      }
    },
    [key, storedValue],
  );

  return [storedValue, setValue];
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
            queryKeys.digests.detail(feedback.digestId),
          )
        : undefined;

      const previousItem = queryClient.getQueryData<ItemDetailResponse>(
        queryKeys.items.detail(feedback.contentItemId),
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
          context.previousDigest,
        );
      }
      if (context?.previousItem) {
        queryClient.setQueryData(
          queryKeys.items.detail(feedback.contentItemId),
          context.previousItem,
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
  >,
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
  >,
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
  >,
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

export function useAdminSourceCreate(
  options?: Omit<
    UseMutationOptions<SourceCreateResponse, ApiError | NetworkError, SourceCreateRequest>,
    "mutationFn"
  >,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request) => postAdminSource(request),
    onSuccess: () => {
      // Invalidate sources list to refetch
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.sources });
    },
    ...options,
  });
}

export function useAdminSourceDelete(
  options?: Omit<
    UseMutationOptions<SourceDeleteResponse, ApiError | NetworkError, string>,
    "mutationFn"
  >,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteAdminSource(id),
    onSuccess: () => {
      // Invalidate sources list to refetch
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.sources });
    },
    ...options,
  });
}

export function useAdminBudgets(
  options?: Omit<UseQueryOptions<BudgetsResponse, ApiError | NetworkError>, "queryKey" | "queryFn">,
) {
  return useQuery({
    queryKey: queryKeys.admin.budgets,
    queryFn: ({ signal }) => getAdminBudgets(signal),
    // Refetch budgets more frequently as they change
    staleTime: 10 * 1000, // 10 seconds
    ...options,
  });
}

/**
 * Query for LLM settings.
 */
export function useAdminLlmSettings(
  options?: Omit<
    UseQueryOptions<LlmSettingsResponse, ApiError | NetworkError>,
    "queryKey" | "queryFn"
  >,
) {
  return useQuery({
    queryKey: queryKeys.admin.llmSettings,
    queryFn: ({ signal }) => getAdminLlmSettings(signal),
    staleTime: 30 * 1000, // 30 seconds
    ...options,
  });
}

/**
 * Mutation to update LLM settings.
 */
export function useAdminLlmSettingsUpdate(
  options?: Omit<
    UseMutationOptions<LlmSettingsResponse, ApiError | NetworkError, LlmSettingsUpdateRequest>,
    "mutationFn"
  >,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data) => patchAdminLlmSettings(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.llmSettings });
    },
    ...options,
  });
}

/**
 * Query for pipeline queue status.
 * Shows active and waiting jobs.
 */
export function useQueueStatus(
  options?: Omit<
    UseQueryOptions<QueueStatusResponse, ApiError | NetworkError>,
    "queryKey" | "queryFn"
  >,
) {
  return useQuery({
    queryKey: queryKeys.admin.queueStatus,
    queryFn: ({ signal }) => getQueueStatus(signal),
    // Poll frequently when there are active jobs
    refetchInterval: 5000,
    staleTime: 2000,
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

// ============================================================================
// Preferences Queries & Mutations
// ============================================================================

/**
 * Query for user preferences (viewing profile, decay settings, etc.)
 */
export function usePreferences(
  options?: Omit<
    UseQueryOptions<PreferencesGetResponse, ApiError | NetworkError>,
    "queryKey" | "queryFn"
  >,
) {
  return useQuery({
    queryKey: queryKeys.preferences,
    queryFn: ({ signal }) => getPreferences(signal),
    staleTime: 60 * 1000, // 1 minute
    ...options,
  });
}

/**
 * Mutation to update user preferences.
 */
export function useUpdatePreferences(
  options?: Omit<
    UseMutationOptions<
      PreferencesUpdateResponse,
      ApiError | NetworkError,
      {
        viewingProfile?: ViewingProfile;
        decayHours?: number;
        customSettings?: Record<string, unknown>;
      }
    >,
    "mutationFn"
  >,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data) => patchPreferences(data),
    onSuccess: () => {
      // Invalidate preferences to refetch
      queryClient.invalidateQueries({ queryKey: queryKeys.preferences });
      // Also invalidate items since decay settings affect scores
      queryClient.invalidateQueries({ queryKey: queryKeys.items.all });
    },
    ...options,
  });
}

/**
 * Mutation to mark feed as "caught up".
 */
export function useMarkChecked(
  options?: Omit<
    UseMutationOptions<PreferencesMarkCheckedResponse, ApiError | NetworkError, void>,
    "mutationFn"
  >,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => postMarkChecked(),
    onSuccess: () => {
      // Invalidate preferences to refetch
      queryClient.invalidateQueries({ queryKey: queryKeys.preferences });
      // Invalidate items to update isNew flags
      queryClient.invalidateQueries({ queryKey: queryKeys.items.all });
    },
    ...options,
  });
}

// ============================================================================
// Topics Queries & Mutations
// ============================================================================

/**
 * Query for all topics with their viewing profiles.
 */
export function useTopics(
  options?: Omit<
    UseQueryOptions<TopicsListResponse, ApiError | NetworkError>,
    "queryKey" | "queryFn"
  >,
) {
  return useQuery({
    queryKey: queryKeys.topics.list(),
    queryFn: ({ signal }) => getTopics(signal),
    staleTime: 60 * 1000, // 1 minute
    ...options,
  });
}

/**
 * Query for a single topic by ID.
 */
export function useTopic(
  id: string,
  options?: Omit<
    UseQueryOptions<TopicDetailResponse, ApiError | NetworkError>,
    "queryKey" | "queryFn"
  >,
) {
  return useQuery({
    queryKey: queryKeys.topics.detail(id),
    queryFn: ({ signal }) => getTopic(id, signal),
    enabled: !!id,
    staleTime: 60 * 1000, // 1 minute
    ...options,
  });
}

/**
 * Mutation to update a topic's viewing profile.
 */
export function useUpdateTopicViewingProfile(
  topicId: string,
  options?: Omit<
    UseMutationOptions<
      TopicViewingProfileUpdateResponse,
      ApiError | NetworkError,
      TopicViewingProfileUpdateRequest
    >,
    "mutationFn"
  >,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data) => patchTopicViewingProfile(topicId, data),
    onSuccess: () => {
      // Invalidate topic queries to refetch
      queryClient.invalidateQueries({ queryKey: queryKeys.topics.all });
      // Also invalidate items since decay settings affect scores
      queryClient.invalidateQueries({ queryKey: queryKeys.items.all });
    },
    ...options,
  });
}

/**
 * Mutation to mark a topic as "caught up".
 */
export function useTopicMarkChecked(
  topicId: string,
  options?: Omit<
    UseMutationOptions<TopicMarkCheckedResponse, ApiError | NetworkError, void>,
    "mutationFn"
  >,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => postTopicMarkChecked(topicId),
    onSuccess: () => {
      // Invalidate topic queries to refetch
      queryClient.invalidateQueries({ queryKey: queryKeys.topics.all });
      // Invalidate items to update isNew flags
      queryClient.invalidateQueries({ queryKey: queryKeys.items.all });
    },
    ...options,
  });
}

/**
 * Mutation to create a new topic.
 */
export function useCreateTopic(
  options?: Omit<
    UseMutationOptions<CreateTopicResponse, ApiError | NetworkError, CreateTopicRequest>,
    "mutationFn"
  >,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data) => createTopic(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.topics.all });
    },
    ...options,
  });
}

/**
 * Mutation to update a topic's name/description.
 */
export function useUpdateTopic(
  options?: Omit<
    UseMutationOptions<
      UpdateTopicResponse,
      ApiError | NetworkError,
      { topicId: string; data: UpdateTopicRequest }
    >,
    "mutationFn"
  >,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ topicId, data }) => updateTopic(topicId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.topics.all });
    },
    ...options,
  });
}

/**
 * Mutation to delete a topic.
 */
export function useDeleteTopic(
  options?: Omit<
    UseMutationOptions<DeleteTopicResponse, ApiError | NetworkError, string>,
    "mutationFn"
  >,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (topicId) => deleteTopic(topicId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.topics.all });
      // Also invalidate sources since they may have moved
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.sources });
    },
    ...options,
  });
}

// ============================================================================
// Layout Hooks (Reddit-style per-page overrides)
// ============================================================================

import { useEffect } from "react";
import { useTheme } from "@/components/ThemeProvider";
import {
  clearPageLayout as clearStoredPageLayout,
  getPageLayout,
  LAYOUTS,
  type Layout,
  type LayoutPage,
  setPageLayout as storePageLayout,
} from "@/lib/theme";

interface UsePageLayoutResult {
  /** Current effective layout for this page */
  layout: Layout;
  /** Whether this page has an override (vs using global) */
  hasOverride: boolean;
  /** Set layout for this page (creates override) */
  setLayout: (layout: Layout) => void;
  /** Clear override (revert to global) */
  resetToGlobal: () => void;
  /** Cycle to next layout (for quick toggle) */
  cycleLayout: () => void;
  /** All available layouts for iteration */
  layouts: readonly Layout[];
}

/**
 * Hook for per-page layout management with global fallback.
 * Implements Reddit-style layout preferences:
 * - Global default set in Settings
 * - Per-page override that persists
 * - Quick toggle without going to Settings
 */
export function usePageLayout(page: LayoutPage): UsePageLayoutResult {
  const { layout: globalLayout } = useTheme();
  const [pageOverride, setPageOverride] = useState<Layout | null>(null);
  const [mounted, setMounted] = useState(false);

  // Initialize from localStorage on mount
  useEffect(() => {
    setPageOverride(getPageLayout(page));
    setMounted(true);
  }, [page]);

  // Effective layout: page override > global
  const layout = mounted && pageOverride ? pageOverride : globalLayout;

  const setLayout = useCallback(
    (newLayout: Layout) => {
      storePageLayout(page, newLayout);
      setPageOverride(newLayout);
    },
    [page],
  );

  const resetToGlobal = useCallback(() => {
    clearStoredPageLayout(page);
    setPageOverride(null);
  }, [page]);

  const cycleLayout = useCallback(() => {
    const currentIndex = LAYOUTS.indexOf(layout);
    const nextIndex = (currentIndex + 1) % LAYOUTS.length;
    setLayout(LAYOUTS[nextIndex]);
  }, [layout, setLayout]);

  return {
    layout,
    hasOverride: pageOverride !== null,
    setLayout,
    resetToGlobal,
    cycleLayout,
    layouts: LAYOUTS,
  };
}
