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
  type AggregateSummary,
  type ApiError,
  type BookmarksListResponse,
  type BudgetPeriod,
  type BudgetResetResponse,
  type BudgetsResponse,
  type BulkBookmarkStatusResponse,
  type CatchupPack,
  type CatchupPackDetailResponse,
  type CatchupPacksListResponse,
  type ClearFeedbackRequest,
  type ClearFeedbackResponse,
  type ClearItemReadResponse,
  type CreateCatchupPackRequest,
  type CreateCatchupPackResponse,
  type CreateDigestSummaryResponse,
  type CreateInboxSummaryRequest,
  type CreateInboxSummaryResponse,
  type CreateScoringExperimentRequest,
  type CreateScoringModeRequest,
  type CreateTopicRequest,
  type CreateTopicResponse,
  clearEmergencyStop as clearEmergencyStopApi,
  clearFeedback,
  clearItemRead,
  createCatchupPack,
  createDigestSummary as createDigestSummaryApi,
  createInboxSummary as createInboxSummaryApi,
  createTopic,
  type DailyUsageResponse,
  type DeleteCatchupPackResponse,
  type DeleteTopicResponse,
  type DigestDetailResponse,
  type DigestStatsResponse,
  type DigestsListResponse,
  deleteAdminSource,
  deleteCatchupPack,
  deleteScoringExperiment,
  deleteScoringMode,
  deleteTopic,
  drainQueue,
  type EmbeddingRetentionStatusResponse,
  type EmergencyStopStatusResponse,
  type EndScoringExperimentRequest,
  emergencyStop,
  type FeedbackAction,
  type FeedbackByTopicResponse,
  type FeedbackDailyStatsResponse,
  type FeedbackRequest,
  type FeedbackResponse,
  type FeedbackSummaryResponse,
  type FeedDossierExportRequest,
  type FeedDossierExportResponse,
  type FetchRunsLogResponse,
  getAdminAbtest,
  getAdminAbtests,
  getAdminBudgets,
  getAdminEmbeddingRetentionStatus,
  getAdminLlmQuota,
  getAdminLlmSettings,
  getAdminLogsFetchRuns,
  getAdminLogsHandleHealth,
  getAdminLogsProviderCallErrors,
  getAdminLogsProviderCalls,
  getAdminLogsSourceHealth,
  getAdminSources,
  getAggregateSummary as getAggregateSummaryApi,
  getBookmarks,
  getBulkBookmarkStatus,
  getCatchupPack,
  getCatchupPacks,
  getDailyUsage,
  getDigest,
  getDigestStats,
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
  getScoringExperiment,
  getScoringExperiments,
  getScoringExperimentsActive,
  getScoringMode,
  getScoringModeAudit,
  getScoringModes,
  getTopic,
  getTopics,
  getXAccountPolicies,
  type HandleHealthResponse,
  type HealthResponse,
  type ItemDetailResponse,
  type ItemSummaryRequest,
  type ItemSummaryResponse,
  type ItemsListParams,
  type ItemsListResponse,
  isBookmarked as isBookmarkedApi,
  type LlmSettingsResponse,
  type LlmSettingsUpdateRequest,
  type MarkItemReadResponse,
  type MonthlyUsageResponse,
  markItemRead,
  type NetworkError,
  type OpsStatusResponse,
  obliterateQueue,
  type PreferencesGetResponse,
  type PreferencesMarkCheckedResponse,
  type PreferencesUpdateResponse,
  type ProviderCallErrorsResponse,
  type ProviderCallsLogResponse,
  patchAdminLlmSettings,
  patchAdminSource,
  patchPreferences,
  patchTopicCustomSettings,
  patchTopicDigestSettings,
  patchTopicScoringMode,
  pauseQueue,
  postAdminAbtest,
  postAdminRegenerateThemes,
  postAdminRun,
  postAdminSource,
  postFeedback,
  postFeedDossierExport,
  postItemSummary,
  postMarkChecked,
  postScoringExperiment,
  postScoringExperimentEnd,
  postScoringMode,
  postScoringModeSetDefault,
  postTopicMarkChecked,
  putScoringExperiment,
  putScoringMode,
  type QueueActionResponse,
  type QueueStatusResponse,
  type QuotaStatusResponse,
  type RegenerateThemesResponse,
  removeQueueJob,
  resetAdminBudget,
  resetXAccountPolicy,
  resumeQueue,
  // Scoring Experiments
  type ScoringExperiment,
  type ScoringExperimentResponse,
  type ScoringExperimentsResponse,
  // Scoring Modes
  type ScoringMode,
  type ScoringModeAuditResponse,
  type ScoringModeResponse,
  type ScoringModesResponse,
  type SourceCreateRequest,
  type SourceCreateResponse,
  type SourceDeleteResponse,
  type SourceHealthResponse,
  type SourcePatchRequest,
  type SourcePatchResponse,
  type SourcesListResponse,
  type ToggleBookmarkResponse,
  type TopicCustomSettingsUpdateRequest,
  type TopicCustomSettingsUpdateResponse,
  type TopicDetailResponse,
  type TopicDigestSettingsUpdateRequest,
  type TopicDigestSettingsUpdateResponse,
  type TopicMarkCheckedResponse,
  type TopicsListResponse,
  toggleBookmark,
  type UpdateScoringExperimentRequest,
  type UpdateScoringModeRequest,
  type UpdateTopicRequest,
  type UpdateTopicResponse,
  updateTopic,
  updateXAccountPolicyMode,
  type ViewingProfile,
  type XAccountPoliciesResponse,
  type XAccountPolicyMode,
  type XAccountPolicyResponse,
} from "./api";

// ============================================================================
// Query Keys
// ============================================================================

export const queryKeys = {
  health: ["health"] as const,
  digests: {
    all: ["digests"] as const,
    list: (params?: { from?: string; to?: string; topic?: string }) =>
      ["digests", "list", params] as const,
    stats: (params: { from: string; to: string; topic?: string }) =>
      ["digests", "stats", params] as const,
    detail: (id: string) => ["digests", id] as const,
  },
  items: {
    all: ["items"] as const,
    list: (params?: Omit<ItemsListParams, "offset">) => ["items", "list", params] as const,
    detail: (id: string) => ["items", id] as const,
  },
  catchupPacks: {
    all: ["catchup-packs"] as const,
    list: (params?: { topicId?: string; limit?: number; offset?: number }) =>
      ["catchup-packs", "list", params] as const,
    detail: (id: string) => ["catchup-packs", id] as const,
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
  summaries: {
    all: ["summaries"] as const,
    detail: (id: string) => ["summaries", id] as const,
  },
  admin: {
    sources: ["admin", "sources"] as const,
    xAccountPolicies: (sourceId: string) => ["admin", "x-account-policies", sourceId] as const,
    budgets: ["admin", "budgets"] as const,
    llmSettings: ["admin", "llm-settings"] as const,
    llmQuota: ["admin", "llm-quota"] as const,
    queueStatus: ["admin", "queue-status"] as const,
    opsStatus: ["admin", "ops-status"] as const,
    embeddingRetention: (topicId: string) => ["admin", "embedding-retention", topicId] as const,
    abtests: {
      all: ["admin", "abtests"] as const,
      list: () => ["admin", "abtests", "list"] as const,
      detail: (id: string) => ["admin", "abtests", id] as const,
    },
  },
  preferences: ["preferences"] as const,
  bookmarks: {
    all: ["bookmarks"] as const,
    list: (params?: { limit?: number; offset?: number }) => ["bookmarks", "list", params] as const,
    status: (contentItemId: string) => ["bookmarks", "status", contentItemId] as const,
    bulkStatus: (contentItemIds: string[]) => ["bookmarks", "bulk-status", contentItemIds] as const,
  },
  topics: {
    all: ["topics"] as const,
    list: () => ["topics", "list"] as const,
    detail: (id: string) => ["topics", id] as const,
  },
  scoringModes: {
    all: ["scoring-modes"] as const,
    list: () => ["scoring-modes", "list"] as const,
    detail: (id: string) => ["scoring-modes", id] as const,
    audit: (params?: { topicId?: string; limit?: number }) =>
      ["scoring-modes", "audit", params] as const,
  },
  scoringExperiments: {
    all: ["scoring-experiments"] as const,
    list: (params?: { topicId?: string; activeOnly?: boolean; limit?: number }) =>
      ["scoring-experiments", "list", params] as const,
    active: () => ["scoring-experiments", "active"] as const,
    detail: (id: string) => ["scoring-experiments", id] as const,
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
  params?: { from?: string; to?: string; topic?: string },
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

export function useDigestStats(
  params: { from: string; to: string; topic?: string },
  options?: Omit<
    UseQueryOptions<DigestStatsResponse, ApiError | NetworkError>,
    "queryKey" | "queryFn"
  >,
) {
  return useQuery({
    queryKey: queryKeys.digests.stats(params),
    queryFn: ({ signal }) => getDigestStats(params, signal),
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
 * Uses initialValue for SSR/first render to avoid hydration mismatch,
 * then reads from localStorage after mount.
 */
export function useLocalStorage<T>(
  key: string,
  initialValue: T,
): [T, (value: T | ((prev: T) => T)) => void] {
  // Always start with initialValue to match server render
  const [storedValue, setStoredValue] = useState<T>(initialValue);

  // Read from localStorage after mount to avoid hydration mismatch
  useEffect(() => {
    try {
      const item = window.localStorage.getItem(key);
      if (item !== null) {
        setStoredValue(JSON.parse(item) as T);
      }
    } catch {
      // Ignore errors, keep initialValue
    }
  }, [key]);

  const setValue = useCallback(
    (value: T | ((prev: T) => T)) => {
      setStoredValue((prev) => {
        const valueToStore = value instanceof Function ? value(prev) : value;
        try {
          window.localStorage.setItem(key, JSON.stringify(valueToStore));
        } catch (error) {
          console.warn(`Error setting localStorage key "${key}":`, error);
        }
        return valueToStore;
      });
    },
    [key],
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

// ============================================================================
// X Account Policies Hooks
// ============================================================================

/**
 * Query for X account policies for a source.
 */
export function useXAccountPolicies(
  sourceId: string,
  options?: Omit<
    UseQueryOptions<XAccountPoliciesResponse, ApiError | NetworkError>,
    "queryKey" | "queryFn"
  >,
) {
  return useQuery({
    queryKey: queryKeys.admin.xAccountPolicies(sourceId),
    queryFn: ({ signal }) => getXAccountPolicies(sourceId, signal),
    enabled: !!sourceId,
    staleTime: 30 * 1000, // 30 seconds
    ...options,
  });
}

/**
 * Mutation to update X account policy mode.
 */
export function useXAccountPolicyModeUpdate(
  sourceId: string,
  options?: Omit<
    UseMutationOptions<
      XAccountPolicyResponse,
      ApiError | NetworkError,
      { handle: string; mode: XAccountPolicyMode }
    >,
    "mutationFn"
  >,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ handle, mode }) => updateXAccountPolicyMode(sourceId, handle, mode),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.xAccountPolicies(sourceId) });
    },
    ...options,
  });
}

/**
 * Mutation to reset X account policy stats.
 */
export function useXAccountPolicyReset(
  sourceId: string,
  options?: Omit<
    UseMutationOptions<XAccountPolicyResponse, ApiError | NetworkError, string>,
    "mutationFn"
  >,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (handle: string) => resetXAccountPolicy(sourceId, handle),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.xAccountPolicies(sourceId) });
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

export function useAdminEmbeddingRetentionStatus(
  topicId: string,
  options?: Omit<
    UseQueryOptions<EmbeddingRetentionStatusResponse, ApiError | NetworkError>,
    "queryKey" | "queryFn"
  >,
) {
  return useQuery({
    queryKey: queryKeys.admin.embeddingRetention(topicId),
    queryFn: ({ signal }) => getAdminEmbeddingRetentionStatus(topicId, signal),
    enabled: Boolean(topicId),
    staleTime: 30 * 1000,
    ...options,
  });
}

/**
 * Mutation to reset budget for a given period.
 */
export function useResetBudget(
  options?: Omit<
    UseMutationOptions<BudgetResetResponse, ApiError | NetworkError, BudgetPeriod>,
    "mutationFn" | "onSettled"
  >,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (period: BudgetPeriod) => resetAdminBudget(period),
    onSettled: () => {
      // Invalidate budgets query to refetch updated status
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.budgets });
    },
    ...options,
  });
}

/**
 * Mutation to regenerate theme labels for a topic.
 * Recomputes labels for recent triaged items.
 */
export function useRegenerateThemes(
  topicId: string,
  options?: Omit<
    UseMutationOptions<RegenerateThemesResponse, ApiError | NetworkError, void>,
    "mutationFn"
  >,
) {
  return useMutation({
    mutationFn: () => postAdminRegenerateThemes(topicId),
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

// ============================================================================
// Item Summary Hooks
// ============================================================================

/**
 * Mutation to generate and save an item summary from pasted text.
 * Returns the generated summary and token/credit usage.
 */
export function useItemSummary(options?: {
  onSuccess?: (data: ItemSummaryResponse) => void;
  onError?: (error: ApiError | NetworkError) => void;
}) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: ItemSummaryRequest) => postItemSummary(request),
    onSuccess: (data) => {
      // Invalidate items to refetch with new summary
      queryClient.invalidateQueries({ queryKey: ["items"] });
      options?.onSuccess?.(data);
    },
    onError: options?.onError,
  });
}

/**
 * Mutation to generate feed dossier export markdown for copy/download.
 */
export function useFeedDossierExport(options?: {
  onSuccess?: (data: FeedDossierExportResponse) => void;
  onError?: (error: ApiError | NetworkError) => void;
}) {
  return useMutation({
    mutationFn: (request: FeedDossierExportRequest) => postFeedDossierExport(request),
    onSuccess: options?.onSuccess,
    onError: options?.onError,
  });
}

// ============================================================================
// Aggregate Summaries Hooks
// ============================================================================

/**
 * Query for a single aggregate summary by ID.
 * Polls while status is "pending".
 */
export function useAggregateSummary(
  id: string | null,
  options?: Omit<
    UseQueryOptions<AggregateSummary, ApiError | NetworkError>,
    "queryKey" | "queryFn"
  >,
) {
  return useQuery({
    queryKey: queryKeys.summaries.detail(id ?? ""),
    queryFn: async ({ signal }) => {
      const response = await getAggregateSummaryApi(id ?? "", signal);
      return response.summary;
    },
    enabled: !!id,
    refetchInterval: (query) => {
      // Poll every 2 seconds while pending
      const data = query.state.data;
      return data?.status === "pending" ? 2000 : false;
    },
    ...options,
  });
}

/**
 * Mutation to create/generate digest summary.
 */
export function useCreateDigestSummary(
  options?: Omit<
    UseMutationOptions<CreateDigestSummaryResponse, ApiError | NetworkError, string>,
    "mutationFn"
  >,
) {
  return useMutation({
    mutationFn: (digestId: string) => createDigestSummaryApi(digestId),
    ...options,
  });
}

/**
 * Mutation to create/generate inbox summary.
 */
export function useCreateInboxSummary(
  options?: Omit<
    UseMutationOptions<
      CreateInboxSummaryResponse,
      ApiError | NetworkError,
      CreateInboxSummaryRequest
    >,
    "mutationFn"
  >,
) {
  return useMutation({
    mutationFn: (params: CreateInboxSummaryRequest) => createInboxSummaryApi(params),
    ...options,
  });
}

// ============================================================================
// Catch-up Pack Hooks
// ============================================================================

export function useCatchupPacks(
  params?: { topicId?: string; limit?: number; offset?: number },
  options?: Omit<
    UseQueryOptions<CatchupPacksListResponse, ApiError | NetworkError>,
    "queryKey" | "queryFn"
  >,
) {
  return useQuery({
    queryKey: queryKeys.catchupPacks.list(params),
    queryFn: ({ signal }) => getCatchupPacks(params, signal),
    ...options,
  });
}

export function useCatchupPack(
  id: string | null,
  options?: Omit<
    UseQueryOptions<CatchupPackDetailResponse, ApiError | NetworkError>,
    "queryKey" | "queryFn"
  >,
) {
  return useQuery({
    queryKey: queryKeys.catchupPacks.detail(id ?? ""),
    queryFn: ({ signal }) => getCatchupPack(id ?? "", signal),
    enabled: !!id,
    ...options,
  });
}

export function useCreateCatchupPack(
  options?: Omit<
    UseMutationOptions<
      CreateCatchupPackResponse,
      ApiError | NetworkError,
      CreateCatchupPackRequest
    >,
    "mutationFn" | "onSettled"
  >,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: CreateCatchupPackRequest) => createCatchupPack(request),
    onSettled: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.catchupPacks.all });
      if (data?.pack?.id) {
        queryClient.invalidateQueries({ queryKey: queryKeys.catchupPacks.detail(data.pack.id) });
      }
    },
    ...options,
  });
}

export function useDeleteCatchupPack(
  options?: Omit<
    UseMutationOptions<DeleteCatchupPackResponse, ApiError | NetworkError, { id: string }>,
    "mutationFn" | "onSettled"
  >,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string }) => deleteCatchupPack(id),
    onSettled: (_data, _error, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.catchupPacks.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.catchupPacks.detail(variables.id) });
    },
    ...options,
  });
}

export function useMarkItemRead(
  options?: Omit<
    UseMutationOptions<
      MarkItemReadResponse,
      ApiError | NetworkError,
      { contentItemId: string; packId?: string }
    >,
    "mutationFn" | "onSettled"
  >,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ contentItemId, packId }) => markItemRead(contentItemId, packId),
    onSettled: (_data, _error, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.items.all });
      if (variables.packId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.catchupPacks.detail(variables.packId),
        });
      }
    },
    ...options,
  });
}

export function useClearItemRead(
  options?: Omit<
    UseMutationOptions<ClearItemReadResponse, ApiError | NetworkError, { contentItemId: string }>,
    "mutationFn" | "onSettled"
  >,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ contentItemId }) => clearItemRead(contentItemId),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.items.all });
    },
    ...options,
  });
}

// ============================================================================
// Media Query Hook
// ============================================================================

/**
 * Hook for responsive breakpoint detection.
 * Returns true when the media query matches.
 *
 * @example
 * const isMobile = useMediaQuery("(max-width: 768px)");
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mq = window.matchMedia(query);
    setMatches(mq.matches);

    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [query]);

  return matches;
}

// ============================================================================
// Bookmarks Hooks
// ============================================================================

/**
 * Query for bookmark status of a single content item.
 */
export function useIsBookmarked(
  contentItemId: string | null,
  options?: Omit<UseQueryOptions<boolean, ApiError | NetworkError>, "queryKey" | "queryFn">,
) {
  return useQuery({
    queryKey: queryKeys.bookmarks.status(contentItemId ?? ""),
    queryFn: async ({ signal }) => {
      if (!contentItemId) return false;
      const res = await isBookmarkedApi(contentItemId, signal);
      return res.bookmarked;
    },
    enabled: !!contentItemId,
    staleTime: 30 * 1000, // 30 seconds
    ...options,
  });
}

/**
 * Query for bulk bookmark status of multiple items.
 */
export function useBulkBookmarkStatus(
  contentItemIds: string[],
  options?: Omit<
    UseQueryOptions<Record<string, boolean>, ApiError | NetworkError>,
    "queryKey" | "queryFn"
  >,
) {
  return useQuery({
    queryKey: queryKeys.bookmarks.bulkStatus(contentItemIds),
    queryFn: async ({ signal }) => {
      if (contentItemIds.length === 0) return {};
      const res = await getBulkBookmarkStatus(contentItemIds, signal);
      return res.status;
    },
    enabled: contentItemIds.length > 0,
    staleTime: 30 * 1000, // 30 seconds
    ...options,
  });
}

/**
 * Mutation to toggle bookmark with optimistic updates.
 * Immediately updates UI, rolls back on error.
 */
export function useBookmarkToggle(options?: {
  onSuccess?: (data: ToggleBookmarkResponse) => void;
  onError?: (error: ApiError | NetworkError) => void;
}) {
  const queryClient = useQueryClient();

  return useMutation<
    ToggleBookmarkResponse,
    ApiError | NetworkError,
    string, // contentItemId
    { previousStatus: boolean | undefined }
  >({
    mutationFn: (contentItemId) => toggleBookmark(contentItemId),

    onMutate: async (contentItemId) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({
        queryKey: queryKeys.bookmarks.status(contentItemId),
      });

      // Snapshot previous value
      const previousStatus = queryClient.getQueryData<boolean>(
        queryKeys.bookmarks.status(contentItemId),
      );

      // Optimistically toggle
      queryClient.setQueryData(queryKeys.bookmarks.status(contentItemId), !previousStatus);

      return { previousStatus };
    },

    onError: (_error, contentItemId, context) => {
      // Rollback on error
      if (context?.previousStatus !== undefined) {
        queryClient.setQueryData(queryKeys.bookmarks.status(contentItemId), context.previousStatus);
      }
      options?.onError?.(_error);
    },

    onSuccess: (data, contentItemId) => {
      // Set the actual value from server
      queryClient.setQueryData(queryKeys.bookmarks.status(contentItemId), data.bookmarked);
      // Invalidate bookmarks list
      queryClient.invalidateQueries({ queryKey: queryKeys.bookmarks.all });
      options?.onSuccess?.(data);
    },
  });
}

/**
 * Query for bookmarks list with pagination.
 */
export function useBookmarks(
  params?: { limit?: number; offset?: number },
  options?: Omit<
    UseQueryOptions<BookmarksListResponse, ApiError | NetworkError>,
    "queryKey" | "queryFn"
  >,
) {
  return useQuery({
    queryKey: queryKeys.bookmarks.list(params),
    queryFn: ({ signal }) => getBookmarks(params, signal),
    staleTime: 30 * 1000, // 30 seconds
    ...options,
  });
}

/**
 * Infinite query for bookmarks list with pagination.
 */
export function useBookmarksInfinite(params?: { limit?: number }) {
  const limit = params?.limit ?? 20;

  return useInfiniteQuery({
    queryKey: queryKeys.bookmarks.list({ limit }),
    queryFn: ({ signal, pageParam }) =>
      getBookmarks({ limit, offset: pageParam as number }, signal),
    initialPageParam: 0,
    getNextPageParam: (lastPage: BookmarksListResponse) => {
      if (!lastPage.pagination.hasMore) return undefined;
      return lastPage.pagination.offset + lastPage.pagination.limit;
    },
  });
}

// ============================================================================
// Catch-up View Hook (for Feed integration)
// ============================================================================

export interface UseCatchupViewOptions {
  topicId: string | null;
}

export interface UseCatchupViewResult {
  /** Current pack being viewed (null = show generation panel) */
  selectedPackId: string | null;
  /** Set which pack to view */
  setSelectedPackId: (id: string | null) => void;
  /** List of packs for current topic */
  packs: CatchupPack[];
  /** Whether packs are loading */
  isLoadingPacks: boolean;
  /** Pack detail data */
  packDetail: CatchupPackDetailResponse | undefined;
  /** Whether pack detail is loading */
  isLoadingPackDetail: boolean;
  /** Create pack mutation */
  createPack: ReturnType<typeof useCreateCatchupPack>;
  /** Delete pack mutation */
  deletePack: ReturnType<typeof useDeleteCatchupPack>;
  /** Show generation panel */
  showGenerationPanel: () => void;
}

/**
 * Hook to manage catch-up view state within the Feed page.
 * Handles pack selection, listing, and generation.
 */
export function useCatchupView({ topicId }: UseCatchupViewOptions): UseCatchupViewResult {
  const [selectedPackId, setSelectedPackId] = useState<string | null>(null);

  // Fetch packs for topic
  const {
    data: packsData,
    isLoading: isLoadingPacks,
    refetch: refetchPacks,
  } = useCatchupPacks(topicId ? { topicId, limit: 10 } : undefined, {
    enabled: !!topicId,
  });

  const packs = packsData?.packs ?? [];

  // Fetch pack detail when selected
  const { data: packDetail, isLoading: isLoadingPackDetail } = useCatchupPack(selectedPackId, {
    enabled: !!selectedPackId,
    // Poll while pending
    refetchInterval: (query) => {
      const data = query.state.data;
      return data?.pack.status === "pending" ? 2000 : false;
    },
  });

  // Create pack mutation
  const createPack = useCreateCatchupPack({
    onSuccess: (data) => {
      refetchPacks();
      setSelectedPackId(data.pack.id);
    },
  });

  // Delete pack mutation
  const deletePack = useDeleteCatchupPack({
    onSuccess: () => {
      refetchPacks();
      setSelectedPackId(null);
    },
  });

  // Reset selected pack when topic changes
  useEffect(() => {
    setSelectedPackId(null);
  }, [topicId]);

  const showGenerationPanel = useCallback(() => {
    setSelectedPackId(null);
  }, []);

  return {
    selectedPackId,
    setSelectedPackId,
    packs,
    isLoadingPacks,
    packDetail,
    isLoadingPackDetail,
    createPack,
    deletePack,
    showGenerationPanel,
  };
}

// ============================================================================
// Admin Logs Hooks
// ============================================================================

export function useAdminLogsProviderCalls(params?: {
  limit?: number;
  offset?: number;
  purpose?: string;
  status?: string;
  sourceId?: string;
  hoursAgo?: number;
}) {
  return useQuery({
    queryKey: ["admin", "logs", "provider-calls", params],
    queryFn: ({ signal }) => getAdminLogsProviderCalls(params, signal),
  });
}

export function useAdminLogsProviderCallErrors(params?: { hoursAgo?: number }) {
  return useQuery({
    queryKey: ["admin", "logs", "provider-calls", "errors", params],
    queryFn: ({ signal }) => getAdminLogsProviderCallErrors(params, signal),
  });
}

export function useAdminLogsFetchRuns(params?: {
  limit?: number;
  offset?: number;
  sourceId?: string;
  status?: string;
  hoursAgo?: number;
}) {
  return useQuery({
    queryKey: ["admin", "logs", "fetch-runs", params],
    queryFn: ({ signal }) => getAdminLogsFetchRuns(params, signal),
  });
}

export function useAdminLogsSourceHealth() {
  return useQuery({
    queryKey: ["admin", "logs", "ingestion", "sources"],
    queryFn: ({ signal }) => getAdminLogsSourceHealth(signal),
  });
}

export function useAdminLogsHandleHealth(params?: { sourceId?: string }) {
  return useQuery({
    queryKey: ["admin", "logs", "ingestion", "handles", params],
    queryFn: ({ signal }) => getAdminLogsHandleHealth(params, signal),
  });
}

// ============================================================================
// Scoring Modes Hooks
// ============================================================================

/**
 * Query all scoring modes for the current user.
 */
export function useScoringModes(
  options?: Omit<
    UseQueryOptions<ScoringModesResponse, ApiError | NetworkError>,
    "queryKey" | "queryFn"
  >,
) {
  return useQuery({
    queryKey: queryKeys.scoringModes.list(),
    queryFn: ({ signal }) => getScoringModes(signal),
    ...options,
  });
}

/**
 * Query a single scoring mode by ID.
 */
export function useScoringMode(
  id: string,
  options?: Omit<
    UseQueryOptions<ScoringModeResponse, ApiError | NetworkError>,
    "queryKey" | "queryFn"
  >,
) {
  return useQuery({
    queryKey: queryKeys.scoringModes.detail(id),
    queryFn: ({ signal }) => getScoringMode(id, signal),
    enabled: !!id,
    ...options,
  });
}

/**
 * Query scoring mode audit log.
 */
export function useScoringModeAudit(
  params?: { topicId?: string; limit?: number },
  options?: Omit<
    UseQueryOptions<ScoringModeAuditResponse, ApiError | NetworkError>,
    "queryKey" | "queryFn"
  >,
) {
  return useQuery({
    queryKey: queryKeys.scoringModes.audit(params),
    queryFn: ({ signal }) => getScoringModeAudit(params, signal),
    ...options,
  });
}

/**
 * Create a new scoring mode.
 */
export function useScoringModeCreate(
  options?: Omit<
    UseMutationOptions<ScoringModeResponse, ApiError | NetworkError, CreateScoringModeRequest>,
    "mutationFn"
  >,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateScoringModeRequest) => postScoringMode(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.scoringModes.all });
    },
    ...options,
  });
}

/**
 * Update a scoring mode.
 */
export function useScoringModeUpdate(
  options?: Omit<
    UseMutationOptions<
      ScoringModeResponse,
      ApiError | NetworkError,
      { id: string; data: UpdateScoringModeRequest }
    >,
    "mutationFn"
  >,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateScoringModeRequest }) =>
      putScoringMode(id, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.scoringModes.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.scoringModes.detail(variables.id) });
    },
    ...options,
  });
}

/**
 * Set a scoring mode as default.
 */
export function useScoringModeSetDefault(
  options?: Omit<
    UseMutationOptions<
      ScoringModeResponse,
      ApiError | NetworkError,
      { id: string; reason?: string }
    >,
    "mutationFn"
  >,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      postScoringModeSetDefault(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.scoringModes.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.scoringModes.audit() });
    },
    ...options,
  });
}

/**
 * Delete a scoring mode.
 */
export function useScoringModeDelete(
  options?: Omit<
    UseMutationOptions<{ ok: true; message: string }, ApiError | NetworkError, string>,
    "mutationFn"
  >,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteScoringMode(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.scoringModes.all });
    },
    ...options,
  });
}

/**
 * Set topic scoring mode.
 */
export function useTopicScoringModeUpdate(
  options?: Omit<
    UseMutationOptions<
      TopicDetailResponse,
      ApiError | NetworkError,
      { topicId: string; scoringModeId: string | null; reason?: string }
    >,
    "mutationFn"
  >,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      topicId,
      scoringModeId,
      reason,
    }: {
      topicId: string;
      scoringModeId: string | null;
      reason?: string;
    }) => patchTopicScoringMode(topicId, scoringModeId, reason),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.topics.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.topics.detail(variables.topicId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.scoringModes.audit() });
    },
    ...options,
  });
}

// ============================================================================
// Scoring Experiments Hooks
// ============================================================================

/**
 * Query scoring experiments.
 */
export function useScoringExperiments(
  params?: { topicId?: string; activeOnly?: boolean; limit?: number },
  options?: Omit<
    UseQueryOptions<ScoringExperimentsResponse, ApiError | NetworkError>,
    "queryKey" | "queryFn"
  >,
) {
  return useQuery({
    queryKey: queryKeys.scoringExperiments.list(params),
    queryFn: ({ signal }) => getScoringExperiments(params, signal),
    ...options,
  });
}

/**
 * Query active scoring experiments for the user.
 */
export function useScoringExperimentsActive(
  options?: Omit<
    UseQueryOptions<ScoringExperimentsResponse, ApiError | NetworkError>,
    "queryKey" | "queryFn"
  >,
) {
  return useQuery({
    queryKey: queryKeys.scoringExperiments.active(),
    queryFn: ({ signal }) => getScoringExperimentsActive(signal),
    ...options,
  });
}

/**
 * Query a single scoring experiment by ID.
 */
export function useScoringExperiment(
  id: string,
  options?: Omit<
    UseQueryOptions<ScoringExperimentResponse, ApiError | NetworkError>,
    "queryKey" | "queryFn"
  >,
) {
  return useQuery({
    queryKey: queryKeys.scoringExperiments.detail(id),
    queryFn: ({ signal }) => getScoringExperiment(id, signal),
    enabled: !!id,
    ...options,
  });
}

/**
 * Create a new scoring experiment.
 */
export function useScoringExperimentCreate(
  options?: Omit<
    UseMutationOptions<
      ScoringExperimentResponse,
      ApiError | NetworkError,
      CreateScoringExperimentRequest
    >,
    "mutationFn"
  >,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateScoringExperimentRequest) => postScoringExperiment(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.scoringExperiments.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.topics.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.scoringModes.audit() });
    },
    ...options,
  });
}

/**
 * Update a scoring experiment.
 */
export function useScoringExperimentUpdate(
  options?: Omit<
    UseMutationOptions<
      ScoringExperimentResponse,
      ApiError | NetworkError,
      { id: string; data: UpdateScoringExperimentRequest }
    >,
    "mutationFn"
  >,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateScoringExperimentRequest }) =>
      putScoringExperiment(id, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.scoringExperiments.all });
      queryClient.invalidateQueries({
        queryKey: queryKeys.scoringExperiments.detail(variables.id),
      });
    },
    ...options,
  });
}

/**
 * End a scoring experiment.
 */
export function useScoringExperimentEnd(
  options?: Omit<
    UseMutationOptions<
      ScoringExperimentResponse,
      ApiError | NetworkError,
      { id: string; data: EndScoringExperimentRequest }
    >,
    "mutationFn"
  >,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: EndScoringExperimentRequest }) =>
      postScoringExperimentEnd(id, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.scoringExperiments.all });
      queryClient.invalidateQueries({
        queryKey: queryKeys.scoringExperiments.detail(variables.id),
      });
    },
    ...options,
  });
}

/**
 * Delete a scoring experiment.
 */
export function useScoringExperimentDelete(
  options?: Omit<
    UseMutationOptions<{ ok: true; message: string }, ApiError | NetworkError, string>,
    "mutationFn"
  >,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteScoringExperiment(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.scoringExperiments.all });
    },
    ...options,
  });
}
