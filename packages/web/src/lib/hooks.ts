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
  type AbtestCreateRequest,
  type AbtestCreateResponse,
  type AbtestDetailResponse,
  type AbtestsListResponse,
  type AdminRunRequest,
  type AdminRunResponse,
  type ApiError,
  type BudgetsResponse,
  type ClearFeedbackRequest,
  type ClearFeedbackResponse,
  type CreateTopicRequest,
  type CreateTopicResponse,
  clearEmergencyStop as clearEmergencyStopApi,
  clearFeedback,
  createTopic,
  type DailyUsageResponse,
  type DeleteTopicResponse,
  type DigestDetailResponse,
  type DigestsListResponse,
  deleteAdminSource,
  deleteTopic,
  drainQueue,
  type EmergencyStopStatusResponse,
  emergencyStop,
  type FeedbackAction,
  type FeedbackByTopicResponse,
  type FeedbackDailyStatsResponse,
  type FeedbackRequest,
  type FeedbackResponse,
  type FeedbackSummaryResponse,
  getAdminAbtest,
  getAdminAbtests,
  getAdminBudgets,
  getAdminLlmQuota,
  getAdminLlmSettings,
  getAdminSources,
  getDailyUsage,
  getDigest,
  getDigests,
  getEmergencyStopStatus,
  getFeedbackByTopic,
  getFeedbackDailyStats,
  getFeedbackSummary,
  getHealth,
  getItem,
  getItems,
  getMonthlyUsage,
  getOpsStatus,
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
  type MonthlyUsageResponse,
  type NetworkError,
  type OpsStatusResponse,
  obliterateQueue,
  type PreferencesGetResponse,
  type PreferencesMarkCheckedResponse,
  type PreferencesUpdateResponse,
  patchAdminLlmSettings,
  patchAdminSource,
  patchPreferences,
  patchTopicCustomSettings,
  patchTopicDigestSettings,
  pauseQueue,
  postAdminAbtest,
  postAdminRun,
  postAdminSource,
  postFeedback,
  postMarkChecked,
  postTopicMarkChecked,
  type QueueActionResponse,
  type QueueStatusResponse,
  type QuotaStatusResponse,
  removeQueueJob,
  resumeQueue,
  type SourceCreateRequest,
  type SourceCreateResponse,
  type SourceDeleteResponse,
  type SourcePatchRequest,
  type SourcePatchResponse,
  type SourcesListResponse,
  type TopicCustomSettingsUpdateRequest,
  type TopicCustomSettingsUpdateResponse,
  type TopicDetailResponse,
  type TopicDigestSettingsUpdateRequest,
  type TopicDigestSettingsUpdateResponse,
  type TopicMarkCheckedResponse,
  type TopicsListResponse,
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
  feedback: {
    daily: (days?: number) => ["feedback", "stats", "daily", days] as const,
    summary: ["feedback", "stats", "summary"] as const,
    byTopic: ["feedback", "stats", "by-topic"] as const,
  },
  usage: {
    monthly: ["usage", "monthly"] as const,
    daily: (days?: number) => ["usage", "daily", days] as const,
  },
  admin: {
    sources: ["admin", "sources"] as const,
    budgets: ["admin", "budgets"] as const,
    llmSettings: ["admin", "llm-settings"] as const,
    llmQuota: ["admin", "llm-quota"] as const,
    queueStatus: ["admin", "queue-status"] as const,
    opsStatus: ["admin", "ops-status"] as const,
    abtests: {
      all: ["admin", "abtests"] as const,
      list: () => ["admin", "abtests", "list"] as const,
      detail: (id: string) => ["admin", "abtests", id] as const,
    },
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

interface UseClearFeedbackOptions {
  /** Callback on success */
  onSuccess?: (data: ClearFeedbackResponse) => void;
  /** Callback on error */
  onError?: (error: ApiError | NetworkError) => void;
}

/**
 * Clear feedback mutation (undo).
 */
export function useClearFeedback(options?: UseClearFeedbackOptions) {
  const queryClient = useQueryClient();

  return useMutation<ClearFeedbackResponse, ApiError | NetworkError, ClearFeedbackRequest>({
    mutationFn: (request) => clearFeedback(request),
    onSuccess: (data) => {
      options?.onSuccess?.(data);
    },
    onError: (error) => {
      options?.onError?.(error);
    },
    onSettled: (_data, _error, request) => {
      // Invalidate items queries to refetch with updated feedback state
      queryClient.invalidateQueries({ queryKey: ["items"] });
      if (request.digestId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.digests.detail(request.digestId),
        });
      }
    },
  });
}

// ============================================================================
// Feedback Stats Queries (for dashboard)
// ============================================================================

/**
 * Get daily feedback stats for charts.
 */
export function useFeedbackDailyStats(
  days?: number,
  options?: Omit<
    UseQueryOptions<FeedbackDailyStatsResponse, ApiError | NetworkError>,
    "queryKey" | "queryFn"
  >,
) {
  return useQuery({
    queryKey: queryKeys.feedback.daily(days),
    queryFn: ({ signal }) => getFeedbackDailyStats(days, signal),
    staleTime: 60 * 1000, // 1 minute
    ...options,
  });
}

/**
 * Get feedback summary (totals and quality ratio).
 */
export function useFeedbackSummary(
  options?: Omit<
    UseQueryOptions<FeedbackSummaryResponse, ApiError | NetworkError>,
    "queryKey" | "queryFn"
  >,
) {
  return useQuery({
    queryKey: queryKeys.feedback.summary,
    queryFn: ({ signal }) => getFeedbackSummary(signal),
    staleTime: 60 * 1000, // 1 minute
    ...options,
  });
}

/**
 * Get feedback breakdown by topic.
 */
export function useFeedbackByTopic(
  options?: Omit<
    UseQueryOptions<FeedbackByTopicResponse, ApiError | NetworkError>,
    "queryKey" | "queryFn"
  >,
) {
  return useQuery({
    queryKey: queryKeys.feedback.byTopic,
    queryFn: ({ signal }) => getFeedbackByTopic(signal),
    staleTime: 60 * 1000, // 1 minute
    ...options,
  });
}

// ============================================================================
// Usage Stats Queries (for dashboard)
// ============================================================================

/**
 * Get monthly usage summary.
 */
export function useMonthlyUsage(
  options?: Omit<
    UseQueryOptions<MonthlyUsageResponse, ApiError | NetworkError>,
    "queryKey" | "queryFn"
  >,
) {
  return useQuery({
    queryKey: queryKeys.usage.monthly,
    queryFn: ({ signal }) => getMonthlyUsage(signal),
    staleTime: 60 * 1000, // 1 minute
    ...options,
  });
}

/**
 * Get daily usage for charts.
 */
export function useDailyUsage(
  days?: number,
  options?: Omit<
    UseQueryOptions<DailyUsageResponse, ApiError | NetworkError>,
    "queryKey" | "queryFn"
  >,
) {
  return useQuery({
    queryKey: queryKeys.usage.daily(days),
    queryFn: ({ signal }) => getDailyUsage(days, signal),
    staleTime: 60 * 1000, // 1 minute
    ...options,
  });
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
 * Query for LLM quota status (subscription providers).
 * Shows current usage for Claude and Codex subscriptions.
 */
export function useAdminLlmQuota(
  options?: Omit<
    UseQueryOptions<QuotaStatusResponse, ApiError | NetworkError>,
    "queryKey" | "queryFn"
  >,
) {
  return useQuery({
    queryKey: queryKeys.admin.llmQuota,
    queryFn: ({ signal }) => getAdminLlmQuota(signal),
    // Poll frequently since quota changes during digests
    refetchInterval: 10 * 1000, // 10 seconds
    staleTime: 5 * 1000, // 5 seconds
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

/**
 * Query for ops status (worker health, queue counts, links).
 * Polls to show live worker/queue state.
 */
export function useOpsStatus(
  options?: Omit<
    UseQueryOptions<OpsStatusResponse, ApiError | NetworkError>,
    "queryKey" | "queryFn"
  >,
) {
  return useQuery({
    queryKey: queryKeys.admin.opsStatus,
    queryFn: ({ signal }) => getOpsStatus(signal),
    refetchInterval: 10000, // Poll every 10s
    staleTime: 5000,
    ...options,
  });
}

// ============================================================================
// Queue Actions Mutations
// ============================================================================

/**
 * Mutation to obliterate the queue (force remove all jobs).
 */
export function useObliterateQueue(
  options?: Omit<
    UseMutationOptions<QueueActionResponse, ApiError | NetworkError, void>,
    "mutationFn" | "onSettled"
  >,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => obliterateQueue(),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.queueStatus });
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.opsStatus });
    },
    ...options,
  });
}

/**
 * Mutation to drain the queue (remove waiting jobs only).
 */
export function useDrainQueue(
  options?: Omit<
    UseMutationOptions<QueueActionResponse, ApiError | NetworkError, void>,
    "mutationFn" | "onSettled"
  >,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => drainQueue(),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.queueStatus });
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.opsStatus });
    },
    ...options,
  });
}

/**
 * Mutation to pause the queue.
 */
export function usePauseQueue(
  options?: Omit<
    UseMutationOptions<QueueActionResponse, ApiError | NetworkError, void>,
    "mutationFn" | "onSettled"
  >,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => pauseQueue(),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.queueStatus });
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.opsStatus });
    },
    ...options,
  });
}

/**
 * Mutation to resume the queue.
 */
export function useResumeQueue(
  options?: Omit<
    UseMutationOptions<QueueActionResponse, ApiError | NetworkError, void>,
    "mutationFn" | "onSettled"
  >,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => resumeQueue(),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.queueStatus });
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.opsStatus });
    },
    ...options,
  });
}

/**
 * Mutation to remove a specific job from the queue.
 */
export function useRemoveQueueJob(
  options?: Omit<
    UseMutationOptions<QueueActionResponse, ApiError | NetworkError, string>,
    "mutationFn" | "onSettled"
  >,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (jobId: string) => removeQueueJob(jobId),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.queueStatus });
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.opsStatus });
    },
    ...options,
  });
}

/**
 * Mutation to trigger emergency stop (obliterate queue + signal workers to exit).
 */
export function useEmergencyStop(
  options?: Omit<
    UseMutationOptions<QueueActionResponse, ApiError | NetworkError, void>,
    "mutationFn" | "onSettled"
  >,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => emergencyStop(),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.queueStatus });
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.opsStatus });
    },
    ...options,
  });
}

/**
 * Mutation to clear emergency stop flag.
 */
export function useClearEmergencyStop(
  options?: Omit<
    UseMutationOptions<QueueActionResponse, ApiError | NetworkError, void>,
    "mutationFn" | "onSettled"
  >,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => clearEmergencyStopApi(),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.queueStatus });
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.opsStatus });
    },
    ...options,
  });
}

/**
 * Query to check if emergency stop is active.
 */
export function useEmergencyStopStatus(
  options?: Omit<
    UseQueryOptions<EmergencyStopStatusResponse, ApiError | NetworkError>,
    "queryKey" | "queryFn"
  >,
) {
  return useQuery({
    queryKey: ["admin", "emergency-stop-status"] as const,
    queryFn: ({ signal }) => getEmergencyStopStatus(signal),
    refetchInterval: 5000, // Poll every 5 seconds
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
 * Mutation to update a topic's digest settings.
 */
export function useUpdateTopicDigestSettings(
  topicId: string,
  options?: Omit<
    UseMutationOptions<
      TopicDigestSettingsUpdateResponse,
      ApiError | NetworkError,
      TopicDigestSettingsUpdateRequest
    >,
    "mutationFn"
  >,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data) => patchTopicDigestSettings(topicId, data),
    onSuccess: () => {
      // Invalidate topic queries to refetch
      queryClient.invalidateQueries({ queryKey: queryKeys.topics.all });
    },
    ...options,
  });
}

/**
 * Mutation to update a topic's custom settings (e.g., personalization tuning).
 */
export function useUpdateTopicCustomSettings(
  topicId: string,
  options?: Omit<
    UseMutationOptions<
      TopicCustomSettingsUpdateResponse,
      ApiError | NetworkError,
      TopicCustomSettingsUpdateRequest
    >,
    "mutationFn"
  >,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data) => patchTopicCustomSettings(topicId, data),
    onSuccess: () => {
      // Invalidate topic queries to refetch
      queryClient.invalidateQueries({ queryKey: queryKeys.topics.all });
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
// AB Tests Queries & Mutations
// ============================================================================

/**
 * Query for AB test runs list.
 */
export function useAdminAbtests(
  options?: Omit<
    UseQueryOptions<AbtestsListResponse, ApiError | NetworkError>,
    "queryKey" | "queryFn"
  >,
) {
  return useQuery({
    queryKey: queryKeys.admin.abtests.list(),
    queryFn: ({ signal }) => getAdminAbtests(signal),
    staleTime: 30 * 1000, // 30 seconds
    ...options,
  });
}

/**
 * Query for AB test run detail.
 */
export function useAdminAbtest(
  id: string,
  options?: Omit<
    UseQueryOptions<AbtestDetailResponse, ApiError | NetworkError>,
    "queryKey" | "queryFn"
  >,
) {
  return useQuery({
    queryKey: queryKeys.admin.abtests.detail(id),
    queryFn: ({ signal }) => getAdminAbtest(id, signal),
    enabled: !!id,
    staleTime: 30 * 1000, // 30 seconds
    ...options,
  });
}

/**
 * Mutation to create an AB test run.
 */
export function useAdminAbtestCreate(
  options?: Omit<
    UseMutationOptions<AbtestCreateResponse, ApiError | NetworkError, AbtestCreateRequest>,
    "mutationFn"
  >,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request) => postAdminAbtest(request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.abtests.all });
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
