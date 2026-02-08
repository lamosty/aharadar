/**
 * Typed API client for the Aha Radar backend.
 *
 * Handles:
 * - Type-safe request/response contracts
 * - Authentication via X-API-Key header
 * - Error handling with structured error types
 * - Dev settings from localStorage
 */

// ============================================================================
// Types - API Response Contracts
// ============================================================================

/** Base response shape */
interface ApiResponseBase {
  ok: boolean;
}

/** Successful response */
interface ApiSuccessResponse<T> extends ApiResponseBase {
  ok: true;
  data?: T;
}

/** Error response */
export interface ApiErrorResponse extends ApiResponseBase {
  ok: false;
  error: {
    code: string;
    message: string;
  };
}

/** Union type for all API responses */
export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

// ============================================================================
// API Data Types
// ============================================================================

/** Health check response */
export interface HealthResponse {
  ok: true;
}

/** Source result from digest run */
export interface DigestSourceResult {
  sourceId: string;
  sourceName: string;
  sourceType: string;
  status: "ok" | "partial" | "error" | "skipped";
  skipReason?: string;
  itemsFetched: number;
}

/** Digest list item */
export interface DigestListItem {
  id: string;
  topicId: string;
  topicName: string;
  mode: string;
  status: "complete" | "failed";
  creditsUsed: number;
  errorMessage: string | null;
  topScore: number | null;
  windowStart: string;
  windowEnd: string;
  createdAt: string;
  itemCount: number;
  sourceCount: {
    total: number;
    succeeded: number;
    skipped: number;
  };
}

/** Digests list response */
export interface DigestsListResponse {
  ok: true;
  digests: DigestListItem[];
}

/** Digest stats response */
export interface DigestStatsResponse {
  ok: true;
  stats: {
    totalItems: number;
    digestCount: number;
    avgItemsPerDigest: number;
    avgTopScore: number;
    triageBreakdown: {
      high: number;
      medium: number;
      low: number;
      skip: number;
    };
    totalCredits: number;
    avgCreditsPerDigest: number;
    creditsByMode: {
      low: number;
      normal: number;
      high: number;
    };
  };
  previousPeriod: {
    totalItems: number;
    digestCount: number;
    avgItemsPerDigest: number;
    avgTopScore: number;
    totalCredits: number;
    avgCreditsPerDigest: number;
  };
}

/** Content item brief (embedded in digest items) */
export interface ContentItemBrief {
  title: string | null;
  url: string | null;
  author: string | null;
  publishedAt: string | null;
  sourceType: string | null;
  bodyText: string | null;
  metadata: Record<string, unknown> | null;
  externalId: string | null;
}

/** Digest item with triage and summary */
export interface DigestItem {
  rank: number;
  ahaScore: number;
  contentItemId: string | null;
  clusterId: string | null;
  triageJson: Record<string, unknown> | null;
  summaryJson: Record<string, unknown> | null;
  entitiesJson: Record<string, unknown> | null;
  item: ContentItemBrief | null;
}

/** Digest detail response */
export interface DigestDetailResponse {
  ok: true;
  digest: {
    id: string;
    mode: string;
    status: "complete" | "failed";
    creditsUsed: number;
    usageEstimate: Record<string, unknown> | null;
    usageActual: Record<string, unknown> | null;
    sourceResults: DigestSourceResult[];
    errorMessage: string | null;
    windowStart: string;
    windowEnd: string;
    createdAt: string;
  };
  items: DigestItem[];
}

/** Content item detail */
export interface ContentItem {
  id: string;
  sourceType: string;
  title: string | null;
  url: string | null;
  externalId: string | null;
  author: string | null;
  publishedAt: string | null;
  fetchedAt: string;
  language: string | null;
  metadata: Record<string, unknown>;
}

/** Item detail response */
export interface ItemDetailResponse {
  ok: true;
  item: ContentItem;
}

/** Source-specific metadata */
export interface ItemMetadata {
  // Reddit
  subreddit?: string;
  ups?: number;
  num_comments?: number;
  upvote_ratio?: number;
  // X posts
  user_display_name?: string;
  // Generic
  [key: string]: unknown;
}

/** Cluster item for related sources display */
export interface ClusterItem {
  id: string;
  title: string | null;
  url: string | null;
  sourceType: string;
  author: string | null;
  similarity: number;
}

/** Unified feed item (from GET /items endpoint) */
export interface FeedItem {
  id: string;
  score: number; // Trending score for backwards compat
  ahaScore?: number; // Raw personalized score
  trendingScore?: number; // Decayed score
  rank: number;
  digestId: string;
  digestCreatedAt: string;
  isNew?: boolean; // True if published after last_checked_at
  readAt?: string | null; // Read timestamp if marked read
  item: {
    title: string | null;
    bodyText: string | null;
    url: string | null;
    externalId?: string | null;
    author: string | null;
    publishedAt: string | null;
    sourceType: string;
    sourceId: string;
    metadata?: ItemMetadata | null;
  };
  triageJson: Record<string, unknown> | null;
  feedback: FeedbackAction | null;
  // Cluster information for related sources
  clusterId?: string | null;
  clusterMemberCount?: number;
  clusterItems?: ClusterItem[];
  // Theme label from triage theme embedding clustering
  themeLabel?: string;
  // Topic context (for "all topics" mode)
  topicId: string;
  topicName: string;
  // Manual item summary (from POST /item-summaries)
  manualSummaryJson?: ManualSummaryOutput | null;
  // Scoring mode used for this digest
  scoringModeId?: string;
  scoringModeName?: string;
}

/** Pagination info */
export interface PaginationInfo {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

/** Feed view types
 * - inbox: items without feedback
 * - highlights: liked items (formerly top_picks)
 * - all: all items regardless of feedback
 */
export type FeedView = "inbox" | "highlights" | "catchup" | "all";

/** Items list params */
export interface ItemsListParams {
  limit?: number;
  offset?: number;
  sourceTypes?: string[];
  sourceIds?: string[];
  minScore?: number;
  since?: string;
  until?: string;
  sort?: "best" | "latest" | "trending" | "comments_desc" | "ai_score" | "has_ai_summary";
  topicId?: string;
  view?: FeedView;
}

/** Items list response */
export interface ItemsListResponse {
  ok: true;
  items: FeedItem[];
  pagination: PaginationInfo;
}

/** Feedback action types */
export type FeedbackAction = "like" | "dislike" | "skip";

/** Feedback request body */
export interface FeedbackRequest {
  contentItemId: string;
  digestId?: string;
  action: FeedbackAction;
}

/** Feedback response */
export interface FeedbackResponse {
  ok: true;
}

/** Run mode types (catch_up removed per task-121/122) */
export type RunMode = "low" | "normal" | "high";

/** Digest mode types (same as RunMode) */
export type DigestMode = "low" | "normal" | "high";

/** LLM provider types */
export type LlmProvider = "openai" | "anthropic" | "claude-subscription" | "codex-subscription";

/** Provider override for manual runs */
export interface ProviderOverride {
  provider?: LlmProvider;
  model?: string;
}

/** Admin run request */
export interface AdminRunRequest {
  windowStart: string;
  windowEnd: string;
  mode?: RunMode;
  topicId?: string;
  providerOverride?: ProviderOverride;
}

/** Admin run response */
export interface AdminRunResponse {
  ok: true;
  jobId: string;
}

/** Source config */
export interface SourceConfig {
  weight?: number | null;
  [key: string]: unknown;
}

/** Source item */
export interface Source {
  id: string;
  topicId: string;
  type: string;
  name: string;
  isEnabled: boolean;
  config: SourceConfig;
  createdAt: string;
}

/** Sources list response */
export interface SourcesListResponse {
  ok: true;
  sources: Source[];
}

/** Source patch request */
export interface SourcePatchRequest {
  name?: string;
  isEnabled?: boolean;
  topicId?: string;
  configPatch?: Record<string, unknown>;
}

/** Source patch response */
export interface SourcePatchResponse {
  ok: true;
  source: Source;
}

/** Supported source types */
export const SUPPORTED_SOURCE_TYPES = [
  "reddit",
  "hn",
  "rss",
  "x_posts",
  "youtube",
  "sec_edgar",
  "congress_trading",
  "polymarket",
  "options_flow",
  "market_sentiment",
  // RSS-based specialized types
  "podcast",
  "substack",
  "medium",
  "arxiv",
  "lobsters",
  "producthunt",
  "github_releases",
  // Other
  "telegram",
] as const;

export type SupportedSourceType = (typeof SUPPORTED_SOURCE_TYPES)[number];

/** Source create request */
export interface SourceCreateRequest {
  type: SupportedSourceType;
  name: string;
  config?: SourceConfig;
  isEnabled?: boolean;
  topicId?: string;
}

/** Source create response */
export interface SourceCreateResponse {
  ok: true;
  source: Source;
}

/** Budget warning level */
export type BudgetWarningLevel = "none" | "approaching" | "critical";

/** Budget status */
export interface BudgetStatus {
  monthlyUsed: number;
  monthlyLimit: number;
  monthlyRemaining: number;
  dailyUsed: number | null;
  dailyLimit: number | null;
  dailyRemaining: number | null;
  paidCallsAllowed: boolean;
  warningLevel: BudgetWarningLevel;
}

/** Budgets response */
export interface BudgetsResponse {
  ok: true;
  budgets: BudgetStatus;
}

/** Budget period type */
export type BudgetPeriod = "daily" | "monthly";

/** Budget reset result */
export interface BudgetResetResult {
  period: BudgetPeriod;
  creditsReset: number;
  resetAt: string;
}

/** Budget reset request */
export interface BudgetResetRequest {
  period: BudgetPeriod;
}

/** Budget reset response */
export interface BudgetResetResponse {
  ok: true;
  reset: BudgetResetResult;
}

// ============================================================================
// Dev Settings
// ============================================================================

const DEV_SETTINGS_KEY = "aharadar-dev-settings";

export interface DevSettings {
  apiBaseUrl: string;
  apiKey: string;
}

const DEFAULT_DEV_SETTINGS: DevSettings = {
  apiBaseUrl: "/api",
  apiKey: "",
};

/**
 * Get the default API URL.
 * Uses relative path "/api" which Next.js proxies to the API server.
 * This avoids CORS and cookie issues by keeping everything on one origin.
 */
function getDefaultApiUrl(): string {
  return "/api";
}

/**
 * Get dev settings from localStorage.
 */
export function getDevSettings(): DevSettings {
  if (typeof window === "undefined") {
    return DEFAULT_DEV_SETTINGS;
  }

  try {
    const stored = localStorage.getItem(DEV_SETTINGS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<DevSettings>;
      return {
        apiBaseUrl: parsed.apiBaseUrl ?? getDefaultApiUrl(),
        apiKey: parsed.apiKey ?? DEFAULT_DEV_SETTINGS.apiKey,
      };
    }
  } catch {
    // Ignore parse errors
  }

  return {
    ...DEFAULT_DEV_SETTINGS,
    apiBaseUrl: getDefaultApiUrl(),
  };
}

/**
 * Save dev settings to localStorage.
 */
export function setDevSettings(settings: Partial<DevSettings>): void {
  if (typeof window === "undefined") return;

  const current = getDevSettings();
  const updated: DevSettings = {
    ...current,
    ...settings,
  };

  localStorage.setItem(DEV_SETTINGS_KEY, JSON.stringify(updated));
}

/**
 * Clear dev settings from localStorage.
 */
export function clearDevSettings(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(DEV_SETTINGS_KEY);
}

// ============================================================================
// API Client
// ============================================================================

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export class NetworkError extends Error {
  constructor(message: string = "Network request failed") {
    super(message);
    this.name = "NetworkError";
  }
}

interface FetchOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
}

/**
 * Core fetch wrapper with auth and error handling.
 */
async function apiFetch<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const settings = getDevSettings();
  const url = `${settings.apiBaseUrl}${path}`;

  const headers: HeadersInit = {};

  // Only set Content-Type for requests with a body
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  if (settings.apiKey) {
    headers["X-API-Key"] = settings.apiKey;
  }

  try {
    const response = await fetch(url, {
      method: options.method ?? "GET",
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
      credentials: "include", // Send cookies for session auth
    });

    const data = (await response.json()) as T | ApiErrorResponse;

    // Check for API error response shape
    if (typeof data === "object" && data !== null && "ok" in data && data.ok === false) {
      const errorData = data as ApiErrorResponse;
      throw new ApiError(errorData.error.code, errorData.error.message, response.status);
    }

    return data as T;
  } catch (error) {
    // Re-throw our own errors
    if (error instanceof ApiError) {
      throw error;
    }

    // Network or fetch errors
    if (error instanceof TypeError || error instanceof DOMException) {
      throw new NetworkError(
        error.name === "AbortError" ? "Request aborted" : "Network request failed",
      );
    }

    // Unknown errors
    throw new NetworkError("An unexpected error occurred");
  }
}

// ============================================================================
// API Methods
// ============================================================================

/**
 * Health check endpoint.
 */
export async function getHealth(signal?: AbortSignal): Promise<HealthResponse> {
  return apiFetch<HealthResponse>("/health", { signal });
}

/**
 * List digests with optional topic filter and date range.
 */
export async function getDigests(
  params?: { from?: string; to?: string; topic?: string },
  signal?: AbortSignal,
): Promise<DigestsListResponse> {
  const searchParams = new URLSearchParams();
  if (params?.from) searchParams.set("from", params.from);
  if (params?.to) searchParams.set("to", params.to);
  if (params?.topic) searchParams.set("topic", params.topic);

  const query = searchParams.toString();
  const path = query ? `/digests?${query}` : "/digests";

  return apiFetch<DigestsListResponse>(path, { signal });
}

/**
 * Get aggregated digest stats for analytics.
 */
export async function getDigestStats(
  params: { from: string; to: string; topic?: string },
  signal?: AbortSignal,
): Promise<DigestStatsResponse> {
  const searchParams = new URLSearchParams();
  searchParams.set("from", params.from);
  searchParams.set("to", params.to);
  if (params.topic) searchParams.set("topic", params.topic);

  return apiFetch<DigestStatsResponse>(`/digests/stats?${searchParams.toString()}`, { signal });
}

/**
 * Get digest detail with items.
 */
export async function getDigest(id: string, signal?: AbortSignal): Promise<DigestDetailResponse> {
  return apiFetch<DigestDetailResponse>(`/digests/${id}`, { signal });
}

/**
 * Get content item detail.
 */
export async function getItem(id: string, signal?: AbortSignal): Promise<ItemDetailResponse> {
  return apiFetch<ItemDetailResponse>(`/items/${id}`, { signal });
}

/**
 * List items with filters (unified feed).
 */
export async function getItems(
  params?: ItemsListParams,
  signal?: AbortSignal,
): Promise<ItemsListResponse> {
  const searchParams = new URLSearchParams();

  if (params?.limit !== undefined) searchParams.set("limit", String(params.limit));
  if (params?.offset !== undefined) searchParams.set("offset", String(params.offset));
  if (params?.sourceTypes?.length) searchParams.set("sourceTypes", params.sourceTypes.join(","));
  if (params?.sourceIds?.length) searchParams.set("sourceIds", params.sourceIds.join(","));
  if (params?.minScore !== undefined) searchParams.set("minScore", String(params.minScore));
  if (params?.since) searchParams.set("since", params.since);
  if (params?.until) searchParams.set("until", params.until);
  if (params?.sort) searchParams.set("sort", params.sort);
  if (params?.topicId) searchParams.set("topicId", params.topicId);
  if (params?.view) {
    searchParams.set("view", params.view);
  }

  const query = searchParams.toString();
  const path = query ? `/items?${query}` : "/items";

  return apiFetch<ItemsListResponse>(path, { signal });
}

/**
 * Submit feedback for a content item.
 */
export async function postFeedback(
  feedback: FeedbackRequest,
  signal?: AbortSignal,
): Promise<FeedbackResponse> {
  return apiFetch<FeedbackResponse>("/feedback", {
    method: "POST",
    body: feedback,
    signal,
  });
}

/** Clear feedback request body */
export interface ClearFeedbackRequest {
  contentItemId: string;
  digestId?: string;
}

/** Clear feedback response */
export interface ClearFeedbackResponse {
  ok: true;
  deleted: number;
}

/**
 * Clear feedback for a content item (undo).
 */
export async function clearFeedback(
  request: ClearFeedbackRequest,
  signal?: AbortSignal,
): Promise<ClearFeedbackResponse> {
  return apiFetch<ClearFeedbackResponse>("/feedback", {
    method: "DELETE",
    body: request,
    signal,
  });
}

// ============================================================================
// Feedback Statistics (for dashboard analytics)
// ============================================================================

/** Daily feedback stats */
export interface FeedbackDailyStats {
  date: string;
  likes: number;
  dislikes: number;
  skips: number;
}

/** Daily feedback stats response */
export interface FeedbackDailyStatsResponse {
  ok: true;
  daily: FeedbackDailyStats[];
}

/** Feedback summary */
export interface FeedbackSummary {
  total: number;
  byAction: {
    like: number;
    dislike: number;
    skip: number;
  };
  qualityRatio: number | null;
}

/** Feedback summary response */
export interface FeedbackSummaryResponse {
  ok: true;
  summary: FeedbackSummary;
}

/** Feedback by topic */
export interface FeedbackByTopic {
  topicId: string;
  topicName: string;
  likes: number;
  dislikes: number;
  skips: number;
}

/** Feedback by topic response */
export interface FeedbackByTopicResponse {
  ok: true;
  topics: FeedbackByTopic[];
}

/**
 * Get daily feedback stats for charts.
 */
export async function getFeedbackDailyStats(
  days?: number,
  signal?: AbortSignal,
): Promise<FeedbackDailyStatsResponse> {
  const query = days ? `?days=${days}` : "";
  return apiFetch<FeedbackDailyStatsResponse>(`/feedback/stats/daily${query}`, { signal });
}

/**
 * Get feedback summary (totals and quality ratio).
 */
export async function getFeedbackSummary(signal?: AbortSignal): Promise<FeedbackSummaryResponse> {
  return apiFetch<FeedbackSummaryResponse>("/feedback/stats/summary", { signal });
}

/**
 * Get feedback breakdown by topic.
 */
export async function getFeedbackByTopic(signal?: AbortSignal): Promise<FeedbackByTopicResponse> {
  return apiFetch<FeedbackByTopicResponse>("/feedback/stats/by-topic", { signal });
}

/**
 * Trigger a pipeline run.
 */
export async function postAdminRun(
  request: AdminRunRequest,
  signal?: AbortSignal,
): Promise<AdminRunResponse> {
  return apiFetch<AdminRunResponse>("/admin/run", {
    method: "POST",
    body: request,
    signal,
  });
}

/**
 * List all sources.
 */
export async function getAdminSources(signal?: AbortSignal): Promise<SourcesListResponse> {
  return apiFetch<SourcesListResponse>("/admin/sources", { signal });
}

/**
 * Update a source.
 */
export async function patchAdminSource(
  id: string,
  patch: SourcePatchRequest,
  signal?: AbortSignal,
): Promise<SourcePatchResponse> {
  return apiFetch<SourcePatchResponse>(`/admin/sources/${id}`, {
    method: "PATCH",
    body: patch,
    signal,
  });
}

/**
 * Create a new source.
 */
export async function postAdminSource(
  request: SourceCreateRequest,
  signal?: AbortSignal,
): Promise<SourceCreateResponse> {
  return apiFetch<SourceCreateResponse>("/admin/sources", {
    method: "POST",
    body: request,
    signal,
  });
}

/**
 * Get budget status.
 */
export async function getAdminBudgets(signal?: AbortSignal): Promise<BudgetsResponse> {
  return apiFetch<BudgetsResponse>("/admin/budgets", { signal });
}

/**
 * Reset budget for a given period.
 */
export async function resetAdminBudget(
  period: BudgetPeriod,
  signal?: AbortSignal,
): Promise<BudgetResetResponse> {
  return apiFetch<BudgetResetResponse>("/admin/budgets/reset", {
    method: "POST",
    body: { period },
    signal,
  });
}

/** Source delete response */
export interface SourceDeleteResponse {
  ok: true;
  deleted: true;
}

/**
 * Delete a source.
 */
export async function deleteAdminSource(
  id: string,
  signal?: AbortSignal,
): Promise<SourceDeleteResponse> {
  return apiFetch<SourceDeleteResponse>(`/admin/sources/${id}`, {
    method: "DELETE",
    signal,
  });
}

// ============================================================================
// X Account Policy API (for x_posts sources)
// ============================================================================

/** Policy mode for X accounts */
export type XAccountPolicyMode = "auto" | "always" | "mute";

/** Computed state based on mode and throttle */
export type XAccountPolicyState = "normal" | "reduced" | "muted";

/** X account policy view with derived fields */
export interface XAccountPolicyView {
  handle: string;
  mode: XAccountPolicyMode;
  /** Smoothed score 0-1 (higher = better) */
  score: number;
  /** Total sample size (pos + neg) */
  sample: number;
  /** Throttle probability 0-1 */
  throttle: number;
  /** Computed state based on mode and throttle */
  state: XAccountPolicyState;
  /** Preview of throttle after a like/save */
  nextLike: { score: number; throttle: number };
  /** Preview of throttle after a dislike */
  nextDislike: { score: number; throttle: number };
}

/** X account policies list response */
export interface XAccountPoliciesResponse {
  ok: true;
  policies: XAccountPolicyView[];
  reason?: string;
}

/** X account policy update response */
export interface XAccountPolicyResponse {
  ok: true;
  policy: XAccountPolicyView;
}

/**
 * Get X account policies for a source.
 */
export async function getXAccountPolicies(
  sourceId: string,
  signal?: AbortSignal,
): Promise<XAccountPoliciesResponse> {
  return apiFetch<XAccountPoliciesResponse>(`/admin/sources/${sourceId}/x-account-policies`, {
    signal,
  });
}

/**
 * Update the mode for an X account policy.
 */
export async function updateXAccountPolicyMode(
  sourceId: string,
  handle: string,
  mode: XAccountPolicyMode,
  signal?: AbortSignal,
): Promise<XAccountPolicyResponse> {
  return apiFetch<XAccountPolicyResponse>(`/admin/sources/${sourceId}/x-account-policies/mode`, {
    method: "PATCH",
    body: { handle, mode },
    signal,
  });
}

/**
 * Reset X account policy stats.
 */
export async function resetXAccountPolicy(
  sourceId: string,
  handle: string,
  signal?: AbortSignal,
): Promise<XAccountPolicyResponse> {
  return apiFetch<XAccountPolicyResponse>(`/admin/sources/${sourceId}/x-account-policies/reset`, {
    method: "POST",
    body: { handle },
    signal,
  });
}

// ============================================================================
// LLM Settings API
// ============================================================================

/** Reasoning effort levels for OpenAI models */
export type ReasoningEffort = "none" | "low" | "medium" | "high";

/** LLM settings data */
export interface LlmSettings {
  provider: LlmProvider;
  anthropicModel: string;
  openaiModel: string;
  deepSummaryEnabled: boolean;
  claudeSubscriptionEnabled: boolean;
  claudeTriageThinking: boolean;
  claudeCallsPerHour: number;
  codexSubscriptionEnabled: boolean;
  codexCallsPerHour: number;
  reasoningEffort: ReasoningEffort;
  triageBatchEnabled: boolean;
  triageBatchSize: number;
  updatedAt: string;
}

/** LLM settings response */
export interface LlmSettingsResponse {
  ok: true;
  settings: LlmSettings;
}

/** LLM settings update request */
export interface LlmSettingsUpdateRequest {
  provider?: LlmProvider;
  anthropicModel?: string;
  openaiModel?: string;
  deepSummaryEnabled?: boolean;
  claudeSubscriptionEnabled?: boolean;
  claudeTriageThinking?: boolean;
  claudeCallsPerHour?: number;
  codexSubscriptionEnabled?: boolean;
  codexCallsPerHour?: number;
  reasoningEffort?: ReasoningEffort;
  triageBatchEnabled?: boolean;
  triageBatchSize?: number;
}

// ============================================================================
// LLM Quota Status API
// ============================================================================

/** Provider quota status */
export interface ProviderQuotaStatus {
  /** Calls used this hour */
  used: number;
  /** Calls limit per hour */
  limit: number;
  /** Calls remaining this hour */
  remaining: number;
  /** When the quota resets (ISO string) */
  resetAt: string;
}

/** Quota status for all subscription providers */
export interface QuotaStatus {
  claude: ProviderQuotaStatus | null;
  codex: ProviderQuotaStatus | null;
}

/** Quota status response */
export interface QuotaStatusResponse {
  ok: true;
  quota: QuotaStatus;
}

/**
 * Get LLM settings.
 */
export async function getAdminLlmSettings(signal?: AbortSignal): Promise<LlmSettingsResponse> {
  return apiFetch<LlmSettingsResponse>("/admin/llm-settings", { signal });
}

/**
 * Get LLM quota status for subscription providers.
 */
export async function getAdminLlmQuota(signal?: AbortSignal): Promise<QuotaStatusResponse> {
  return apiFetch<QuotaStatusResponse>("/admin/llm/quota", { signal });
}

// ============================================================================
// Admin Env Config API
// ============================================================================

/** Environment configuration data */
export interface EnvConfig {
  // App config
  appEnv: string;
  appTimezone: string;
  appUrl: string | null;

  // Budget limits
  monthlyCredits: number;
  dailyThrottleCredits: number | null;
  defaultTier: string;

  // X/Twitter fetch limits
  xPostsMaxSearchCallsPerRun: number | null;

  // LLM config - OpenAI
  openaiBaseUrl: string | null;
  openaiTriageModel: string | null;
  openaiTriageMaxTokens: number | null;
  openaiEmbedModel: string | null;

  // LLM config - Grok
  grokBaseUrl: string | null;
  signalGrokModel: string | null;
}

/** Env config response */
export interface EnvConfigResponse {
  ok: true;
  config: EnvConfig;
  warnings: string[];
}

/**
 * Get environment configuration (admin only).
 */
export async function getAdminEnvConfig(signal?: AbortSignal): Promise<EnvConfigResponse> {
  return apiFetch<EnvConfigResponse>("/admin/env-config", { signal });
}

/**
 * Update LLM settings.
 */
export async function patchAdminLlmSettings(
  data: LlmSettingsUpdateRequest,
  signal?: AbortSignal,
): Promise<LlmSettingsResponse> {
  return apiFetch<LlmSettingsResponse>("/admin/llm-settings", {
    method: "PATCH",
    body: data,
    signal,
  });
}

// ============================================================================
// Preferences API
// ============================================================================

/** Viewing profile options (kept for API backward compatibility) */
export type ViewingProfile = "power" | "daily" | "weekly" | "research" | "custom";

/** Preferences data */
export interface PreferencesData {
  viewingProfile: ViewingProfile;
  decayHours: number;
  lastCheckedAt: string | null;
  customSettings: Record<string, unknown>;
  updatedAt: string;
}

/** Get preferences response */
export interface PreferencesGetResponse {
  ok: true;
  preferences: PreferencesData;
}

/** Update preferences response */
export interface PreferencesUpdateResponse {
  ok: true;
  preferences: PreferencesData;
}

/** Mark checked response */
export interface PreferencesMarkCheckedResponse {
  ok: true;
  preferences: PreferencesData;
  message: string;
}

/**
 * Get user preferences.
 */
export async function getPreferences(signal?: AbortSignal): Promise<PreferencesGetResponse> {
  return apiFetch<PreferencesGetResponse>("/preferences", { signal });
}

/**
 * Update user preferences.
 */
export async function patchPreferences(
  data: {
    viewingProfile?: ViewingProfile;
    decayHours?: number;
    customSettings?: Record<string, unknown>;
  },
  signal?: AbortSignal,
): Promise<PreferencesUpdateResponse> {
  return apiFetch<PreferencesUpdateResponse>("/preferences", {
    method: "PATCH",
    body: data,
    signal,
  });
}

/**
 * Mark feed as "caught up".
 */
export async function postMarkChecked(
  signal?: AbortSignal,
): Promise<PreferencesMarkCheckedResponse> {
  return apiFetch<PreferencesMarkCheckedResponse>("/preferences/mark-checked", {
    method: "POST",
    signal,
  });
}

// ============================================================================
// Topics API
// ============================================================================

/** Topic with viewing profile and digest settings */
export interface Topic {
  id: string;
  name: string;
  description: string | null;
  viewingProfile: ViewingProfile;
  decayHours: number;
  lastCheckedAt: string | null;
  createdAt: string;
  updatedAt?: string; // Optional for backwards compatibility
  // Digest schedule fields
  digestScheduleEnabled: boolean;
  digestIntervalMinutes: number;
  digestMode: DigestMode;
  digestDepth: number;
  digestCursorEnd: string | null;
  // Custom settings (e.g., personalization tuning)
  customSettings: Record<string, unknown> | null;
}

/** Topics list response */
export interface TopicsListResponse {
  ok: true;
  topics: Topic[];
}

/** Topic detail response */
export interface TopicDetailResponse {
  ok: true;
  topic: Topic;
}

/** Topic mark checked response */
export interface TopicMarkCheckedResponse {
  ok: true;
  topic: Topic;
  message: string;
}

/**
 * Get all topics.
 */
export async function getTopics(signal?: AbortSignal): Promise<TopicsListResponse> {
  return apiFetch<TopicsListResponse>("/topics", { signal });
}

/**
 * Get a single topic by ID.
 */
export async function getTopic(id: string, signal?: AbortSignal): Promise<TopicDetailResponse> {
  return apiFetch<TopicDetailResponse>(`/topics/${id}`, { signal });
}

/** Response for last digest end time */
export interface TopicLastDigestEndResponse {
  ok: true;
  windowEnd: string | null;
}

/**
 * Get the window_end of the most recent completed digest for a topic.
 * Used by admin run page to continue from last run.
 */
export async function getTopicLastDigestEnd(
  id: string,
  signal?: AbortSignal,
): Promise<TopicLastDigestEndResponse> {
  return apiFetch<TopicLastDigestEndResponse>(`/topics/${id}/last-digest-end`, { signal });
}

/**
 * Mark a topic as "caught up".
 */
export async function postTopicMarkChecked(
  id: string,
  signal?: AbortSignal,
): Promise<TopicMarkCheckedResponse> {
  return apiFetch<TopicMarkCheckedResponse>(`/topics/${id}/mark-checked`, {
    method: "POST",
    signal,
  });
}

/** Topic digest settings update request */
export interface TopicDigestSettingsUpdateRequest {
  digestScheduleEnabled?: boolean;
  digestIntervalMinutes?: number;
  digestMode?: DigestMode;
  digestDepth?: number;
}

/** Topic digest settings update response */
export interface TopicDigestSettingsUpdateResponse {
  ok: true;
  topic: Topic;
}

/** Topic custom settings update request */
export interface TopicCustomSettingsUpdateRequest {
  personalization_tuning_v1?: {
    prefBiasSamplingWeight?: number;
    prefBiasTriageWeight?: number;
    rankPrefWeight?: number;
    feedbackWeightDelta?: number;
  };
  theme_tuning_v1?: {
    enabled?: boolean;
    useClusterContext?: boolean;
    maxItemsPerTheme?: number;
    subthemesEnabled?: boolean;
    refineLabels?: boolean;
    minLabelWords?: number;
    maxDominancePct?: number;
    similarityThreshold?: number;
    lookbackDays?: number;
  };
  embedding_retention_v1?: {
    enabled?: boolean;
    maxAgeDays?: number;
    maxItems?: number;
    maxTokens?: number;
    protectFeedback?: boolean;
    protectBookmarks?: boolean;
  };
  ai_guidance_v1?: {
    summary_prompt?: string;
    triage_prompt?: string;
  };
}

/** Topic custom settings update response */
export interface TopicCustomSettingsUpdateResponse {
  ok: true;
  topic: Topic;
}

/**
 * Update a topic's digest settings.
 */
export async function patchTopicDigestSettings(
  id: string,
  data: TopicDigestSettingsUpdateRequest,
  signal?: AbortSignal,
): Promise<TopicDigestSettingsUpdateResponse> {
  return apiFetch<TopicDigestSettingsUpdateResponse>(`/topics/${id}/digest-settings`, {
    method: "PATCH",
    body: data,
    signal,
  });
}

/**
 * Update a topic's custom settings (e.g., personalization tuning).
 */
export async function patchTopicCustomSettings(
  id: string,
  data: TopicCustomSettingsUpdateRequest,
  signal?: AbortSignal,
): Promise<TopicCustomSettingsUpdateResponse> {
  return apiFetch<TopicCustomSettingsUpdateResponse>(`/topics/${id}/custom-settings`, {
    method: "PATCH",
    body: data,
    signal,
  });
}

/** Create topic request */
export interface CreateTopicRequest {
  name: string;
  description?: string;
  viewingProfile?: ViewingProfile;
  decayHours?: number;
}

/** Create topic response */
export interface CreateTopicResponse {
  ok: true;
  topic: Topic;
}

/** Update topic request */
export interface UpdateTopicRequest {
  name?: string;
  description?: string | null;
}

/** Update topic response */
export interface UpdateTopicResponse {
  ok: true;
  topic: Topic;
}

/** Delete topic response */
export interface DeleteTopicResponse {
  ok: true;
  message: string;
}

/**
 * Create a new topic.
 */
export async function createTopic(
  data: CreateTopicRequest,
  signal?: AbortSignal,
): Promise<CreateTopicResponse> {
  return apiFetch<CreateTopicResponse>("/topics", {
    method: "POST",
    body: data,
    signal,
  });
}

/**
 * Update a topic's name/description.
 */
export async function updateTopic(
  id: string,
  data: UpdateTopicRequest,
  signal?: AbortSignal,
): Promise<UpdateTopicResponse> {
  return apiFetch<UpdateTopicResponse>(`/topics/${id}`, {
    method: "PATCH",
    body: data,
    signal,
  });
}

/**
 * Delete a topic.
 */
export async function deleteTopic(id: string, signal?: AbortSignal): Promise<DeleteTopicResponse> {
  return apiFetch<DeleteTopicResponse>(`/topics/${id}`, {
    method: "DELETE",
    signal,
  });
}

// ============================================================================
// User API Keys
// ============================================================================

/** API key summary (never includes full key) */
export interface ApiKeySummary {
  id: string;
  provider: string;
  keySuffix: string;
  createdAt: string;
  updatedAt: string;
}

/** Provider status */
export interface ProviderKeyStatus {
  provider: string;
  category: "llm" | "connector";
  hasUserKey: boolean;
  keySuffix: string | null;
  hasSystemFallback: boolean;
  activeSource: "user" | "system" | "none";
}

/** API keys list response */
export interface ApiKeysListResponse {
  ok: true;
  keys: ApiKeySummary[];
}

/** API key add response */
export interface ApiKeyAddResponse {
  ok: true;
  key: ApiKeySummary;
}

/** API key delete response */
export interface ApiKeyDeleteResponse {
  ok: true;
}

/** Provider status response */
export interface ProviderStatusResponse {
  ok: true;
  status: ProviderKeyStatus[];
}

/**
 * List user's API keys.
 */
export async function getUserApiKeys(signal?: AbortSignal): Promise<ApiKeysListResponse> {
  return apiFetch<ApiKeysListResponse>("/user/api-keys", { signal });
}

/**
 * Add or update an API key.
 */
export async function addUserApiKey(
  provider: string,
  apiKey: string,
  signal?: AbortSignal,
): Promise<ApiKeyAddResponse> {
  return apiFetch<ApiKeyAddResponse>("/user/api-keys", {
    method: "POST",
    body: { provider, apiKey },
    signal,
  });
}

/**
 * Delete an API key.
 */
export async function deleteUserApiKey(
  id: string,
  signal?: AbortSignal,
): Promise<ApiKeyDeleteResponse> {
  return apiFetch<ApiKeyDeleteResponse>(`/user/api-keys/${id}`, {
    method: "DELETE",
    signal,
  });
}

/**
 * Get provider key status.
 */
export async function getProviderKeyStatus(signal?: AbortSignal): Promise<ProviderStatusResponse> {
  return apiFetch<ProviderStatusResponse>("/user/api-keys/status", { signal });
}

// ============================================================================
// User Usage
// ============================================================================

/** Usage summary */
export interface UsageSummary {
  totalUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  callCount: number;
}

/** Usage by provider */
export interface UsageByProvider {
  provider: string;
  totalUsd: number;
  callCount: number;
}

/** Usage by model */
export interface UsageByModel {
  provider: string;
  model: string;
  totalUsd: number;
  inputTokens: number;
  outputTokens: number;
  callCount: number;
}

/** Daily usage */
export interface DailyUsage {
  date: string;
  totalUsd: number;
  callCount: number;
}

/** Monthly usage response */
export interface MonthlyUsageResponse {
  ok: true;
  period: string;
  summary: UsageSummary;
  byProvider: UsageByProvider[];
  byModel: UsageByModel[];
}

/** Daily usage response */
export interface DailyUsageResponse {
  ok: true;
  days: number;
  startDate: string;
  endDate: string;
  daily: DailyUsage[];
}

/**
 * Get monthly usage.
 */
export async function getMonthlyUsage(signal?: AbortSignal): Promise<MonthlyUsageResponse> {
  return apiFetch<MonthlyUsageResponse>("/user/usage", { signal });
}

/**
 * Get daily usage for charts.
 */
export async function getDailyUsage(
  days?: number,
  signal?: AbortSignal,
): Promise<DailyUsageResponse> {
  const query = days ? `?days=${days}` : "";
  return apiFetch<DailyUsageResponse>(`/user/usage/daily${query}`, { signal });
}

// ============================================================================
// Queue Status
// ============================================================================

/** Queue job info */
export interface QueueJob {
  id: string | undefined;
  name: string;
  data: {
    topicId: string;
    windowStart: string;
    windowEnd: string;
    mode: string;
  };
  progress: number | object;
  attemptsMade: number;
  timestamp: number | undefined;
  processedOn: number | undefined;
}

/** Queue status response */
export interface QueueStatusResponse {
  ok: true;
  queue: {
    isPaused: boolean;
    active: QueueJob[];
    waiting: QueueJob[];
    counts: {
      active: number;
      waiting: number;
    };
  };
}

/**
 * Get pipeline queue status.
 */
export async function getQueueStatus(signal?: AbortSignal): Promise<QueueStatusResponse> {
  return apiFetch<QueueStatusResponse>("/admin/queue-status", { signal });
}

// ============================================================================
// Ops Status
// ============================================================================

/** Ops links configuration */
export interface OpsLinks {
  grafana?: string;
  prometheus?: string;
  queue?: string;
  logs?: string;
}

/** Ops status response */
export interface OpsStatusResponse {
  ok: true;
  worker: {
    ok: boolean;
    startedAt?: string;
    lastSchedulerTickAt?: string | null;
  };
  queue: {
    active: number;
    waiting: number;
  };
  links: OpsLinks;
}

/**
 * Get ops status (worker health, queue counts, and links).
 */
export async function getOpsStatus(signal?: AbortSignal): Promise<OpsStatusResponse> {
  return apiFetch<OpsStatusResponse>("/admin/ops-status", { signal });
}

// ============================================================================
// Queue Actions API
// ============================================================================

/** Response from queue action endpoints */
export interface QueueActionResponse {
  ok: boolean;
  message: string;
}

/**
 * Force obliterate the queue (removes all jobs including active).
 */
export async function obliterateQueue(): Promise<QueueActionResponse> {
  return apiFetch<QueueActionResponse>("/admin/queue/obliterate", { method: "POST" });
}

/**
 * Drain the queue (removes waiting jobs, keeps active).
 */
export async function drainQueue(): Promise<QueueActionResponse> {
  return apiFetch<QueueActionResponse>("/admin/queue/drain", { method: "POST" });
}

/**
 * Pause the queue.
 */
export async function pauseQueue(): Promise<QueueActionResponse> {
  return apiFetch<QueueActionResponse>("/admin/queue/pause", { method: "POST" });
}

/**
 * Resume the queue.
 */
export async function resumeQueue(): Promise<QueueActionResponse> {
  return apiFetch<QueueActionResponse>("/admin/queue/resume", { method: "POST" });
}

/**
 * Remove a specific job from the queue.
 */
export async function removeQueueJob(jobId: string): Promise<QueueActionResponse> {
  return apiFetch<QueueActionResponse>(`/admin/queue/job/${encodeURIComponent(jobId)}`, {
    method: "DELETE",
  });
}

/**
 * Trigger emergency stop (obliterate queue + signal workers to exit).
 */
export async function emergencyStop(): Promise<QueueActionResponse> {
  return apiFetch<QueueActionResponse>("/admin/queue/emergency-stop", { method: "POST" });
}

/**
 * Clear emergency stop flag (allow workers to start again).
 */
export async function clearEmergencyStop(): Promise<QueueActionResponse> {
  return apiFetch<QueueActionResponse>("/admin/queue/clear-emergency-stop", { method: "POST" });
}

/** Emergency stop status response */
export interface EmergencyStopStatusResponse {
  ok: boolean;
  emergencyStopActive: boolean;
}

/**
 * Check if emergency stop is currently active.
 */
export async function getEmergencyStopStatus(
  signal?: AbortSignal,
): Promise<EmergencyStopStatusResponse> {
  return apiFetch<EmergencyStopStatusResponse>("/admin/queue/emergency-stop-status", { signal });
}

// ============================================================================
// AB Tests API
// ============================================================================

/** AB test run status */
export type AbtestRunStatus = "pending" | "running" | "completed" | "failed";

/** AB test reasoning effort */
export type AbtestReasoningEffort = "none" | "low" | "medium" | "high" | null;

/** AB test variant configuration (for creating runs) */
export interface AbtestVariantConfig {
  name: string;
  provider: LlmProvider;
  model: string;
  reasoningEffort?: AbtestReasoningEffort;
  maxOutputTokens?: number;
}

/** AB test run config (stored in DB) */
export interface AbtestRunConfig {
  maxItems: number;
  variantCount: number;
}

/** AB test run list item */
export interface AbtestRunListItem {
  id: string;
  topicId: string;
  windowStart: string;
  windowEnd: string;
  status: AbtestRunStatus;
  config: AbtestRunConfig;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

/** AB test runs list response */
export interface AbtestsListResponse {
  ok: true;
  runs: AbtestRunListItem[];
}

/** AB test create request */
export interface AbtestCreateRequest {
  topicId: string;
  windowStart: string;
  windowEnd: string;
  variants: AbtestVariantConfig[];
  maxItems?: number;
}

/** AB test create response */
export interface AbtestCreateResponse {
  ok: true;
  runId: string;
  jobId: string;
}

/** AB test variant detail */
export interface AbtestVariant {
  id: string;
  name: string;
  provider: string;
  model: string;
  reasoningEffort: AbtestReasoningEffort;
  maxOutputTokens: number | null;
  order: number;
}

/** AB test item (content being tested) */
export interface AbtestItem {
  id: string;
  candidateId: string | null;
  clusterId: string | null;
  contentItemId: string | null;
  representativeContentItemId: string | null;
  sourceId: string | null;
  sourceType: string | null;
  title: string | null;
  url: string | null;
  author: string | null;
  publishedAt: string | null;
}

/** AB test result (per-item, per-variant) */
export interface AbtestResult {
  id: string;
  abtestItemId: string;
  variantId: string;
  triage: {
    ai_score?: number;
    reasoning?: string;
    is_relevant?: boolean;
    is_novel?: boolean;
    should_deep_summarize?: boolean;
    categories?: string[];
    [key: string]: unknown;
  } | null;
  inputTokens: number | null;
  outputTokens: number | null;
  status: "ok" | "error";
  error: Record<string, unknown> | null;
  createdAt: string;
}

/** AB test run detail response */
export interface AbtestDetailResponse {
  ok: true;
  run: AbtestRunListItem;
  variants: AbtestVariant[];
  items: AbtestItem[];
  results: AbtestResult[];
}

/**
 * List AB test runs.
 */
export async function getAdminAbtests(signal?: AbortSignal): Promise<AbtestsListResponse> {
  return apiFetch<AbtestsListResponse>("/admin/abtests", { signal });
}

/**
 * Create an AB test run.
 */
export async function postAdminAbtest(
  request: AbtestCreateRequest,
  signal?: AbortSignal,
): Promise<AbtestCreateResponse> {
  return apiFetch<AbtestCreateResponse>("/admin/abtests", {
    method: "POST",
    body: request,
    signal,
  });
}

/**
 * Get AB test run detail.
 */
export async function getAdminAbtest(
  id: string,
  signal?: AbortSignal,
): Promise<AbtestDetailResponse> {
  return apiFetch<AbtestDetailResponse>(`/admin/abtests/${id}`, { signal });
}

// ============================================================================
// Item Summaries API
// ============================================================================

/** A dynamic section with a title and list of items */
export interface SummarySection {
  title: string;
  items: string[];
}

/** Manual summary output (deep_summary_v2) */
export interface ManualSummaryOutput {
  schema_version: string;
  prompt_id: string;
  provider: string;
  model: string;
  one_liner: string;
  bullets: string[];
  discussion_highlights?: string[];
  /** Dynamic sections shaped by AI guidance */
  sections?: SummarySection[];
  // Legacy v1 fields (for backwards compatibility with existing summaries)
  why_it_matters?: string[];
  risks_or_caveats?: string[];
  suggested_followups?: string[];
}

/** Item summary request */
export interface ItemSummaryRequest {
  contentItemId: string;
  pastedText: string;
  metadata?: {
    title?: string | null;
    author?: string | null;
    url?: string | null;
    sourceType?: string | null;
  };
}

/** Item summary response */
export interface ItemSummaryResponse {
  ok: true;
  summary: ManualSummaryOutput;
  inputTokens: number;
  outputTokens: number;
  costEstimateCredits: number;
}

/** Generate and save item summary from pasted text */
export async function postItemSummary(
  request: ItemSummaryRequest,
  signal?: AbortSignal,
): Promise<ItemSummaryResponse> {
  return apiFetch<ItemSummaryResponse>("/item-summaries", {
    method: "POST",
    body: request,
    signal,
  });
}

// ============================================================================
// Feed Dossier Export API
// ============================================================================

export type FeedDossierExportMode = "ai_summaries" | "top_n" | "liked_or_bookmarked";
export type FeedDossierExportSort =
  | "best"
  | "latest"
  | "trending"
  | "comments_desc"
  | "ai_score"
  | "has_ai_summary";

export interface FeedDossierExportRequest {
  topicId?: string | "all";
  mode: FeedDossierExportMode;
  topN?: number;
  sort?: FeedDossierExportSort;
  since?: string;
  until?: string;
  includeExcerpt?: boolean;
}

export interface FeedDossierExportStats {
  selectedCount: number;
  exportedCount: number;
  skippedNoSummaryCount: number;
  truncated: boolean;
  truncatedBy: "line_cap" | "char_cap" | "item_cap" | null;
  charCount: number;
}

export interface FeedDossierExportResponse {
  ok: true;
  export: {
    filename: string;
    mimeType: string;
    content: string;
    stats: FeedDossierExportStats;
  };
}

export async function postFeedDossierExport(
  request: FeedDossierExportRequest,
  signal?: AbortSignal,
): Promise<FeedDossierExportResponse> {
  return apiFetch<FeedDossierExportResponse>("/exports/feed-dossier", {
    method: "POST",
    body: request,
    signal,
  });
}

// ============================================================================
// Aggregate Summaries API
// ============================================================================

/** Aggregate summary details (from DB) */
export interface AggregateSummary {
  id: string;
  scope_type: "digest" | "inbox" | "range" | "custom";
  scope_hash: string;
  digest_id: string | null;
  topic_id: string | null;
  status: "pending" | "complete" | "error" | "skipped";
  summary_json: Record<string, unknown> | null;
  prompt_id: string | null;
  schema_version: string | null;
  provider: string | null;
  model: string | null;
  input_item_count: number | null;
  input_char_count: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cost_estimate_credits: number | null;
  meta_json: Record<string, unknown> | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

/** Create digest summary request */
export interface CreateDigestSummaryResponse {
  ok: true;
  summary: AggregateSummary;
}

/** Create inbox summary request */
export interface CreateInboxSummaryRequest {
  topicId?: string; // Optional UUID, omitted means all topics
  since: string; // ISO timestamp
  until: string; // ISO timestamp
}

/** Create inbox summary response */
export interface CreateInboxSummaryResponse {
  ok: true;
  summary: AggregateSummary;
}

/** Get aggregate summary response */
export interface GetAggregateSummaryResponse {
  ok: true;
  summary: AggregateSummary;
}

/**
 * Create or get digest summary (auto-enqueue job).
 */
export async function createDigestSummary(
  digestId: string,
  signal?: AbortSignal,
): Promise<CreateDigestSummaryResponse> {
  return apiFetch<CreateDigestSummaryResponse>(`/summaries/digest/${digestId}`, {
    method: "POST",
    signal,
  });
}

/**
 * Create or get inbox summary (auto-enqueue job).
 */
export async function createInboxSummary(
  params: CreateInboxSummaryRequest,
  signal?: AbortSignal,
): Promise<CreateInboxSummaryResponse> {
  return apiFetch<CreateInboxSummaryResponse>("/summaries/inbox", {
    method: "POST",
    body: params,
    signal,
  });
}

/**
 * Get aggregate summary by ID.
 */
export async function getAggregateSummary(
  id: string,
  signal?: AbortSignal,
): Promise<GetAggregateSummaryResponse> {
  return apiFetch<GetAggregateSummaryResponse>(`/summaries/${id}`, { signal });
}

// ============================================================================
// Catch-up Packs API
// ============================================================================

export interface CatchupPackTierItem {
  item_id: string;
  why: string;
  theme: string;
}

export interface CatchupPackTheme {
  title: string;
  summary: string;
  item_ids: string[];
}

export interface CatchupPackOutput {
  schema_version: string;
  prompt_id: string;
  provider: string;
  model: string;
  time_budget_minutes: number;
  tiers: {
    must_read: CatchupPackTierItem[];
    worth_scanning: CatchupPackTierItem[];
    headlines: CatchupPackTierItem[];
  };
  themes: CatchupPackTheme[];
  notes?: string | null;
}

export interface CatchupPack {
  id: string;
  topicId: string;
  scopeType: string;
  scopeHash: string;
  status: "pending" | "complete" | "error" | "skipped";
  summaryJson: CatchupPackOutput | null;
  promptId: string | null;
  schemaVersion: string | null;
  provider: string | null;
  model: string | null;
  inputItemCount: number | null;
  inputCharCount: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  costEstimateCredits: number | null;
  metaJson: Record<string, unknown> | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CatchupPackItem {
  id: string;
  title: string | null;
  bodyText: string | null;
  url: string | null;
  externalId: string | null;
  author: string | null;
  publishedAt: string | null;
  sourceType: string;
  sourceId: string;
  metadata: Record<string, unknown> | null;
  feedback: FeedbackAction | null;
  readAt: string | null;
}

export interface CreateCatchupPackRequest {
  topicId: string;
  timeframeDays: number;
  timeBudgetMinutes: number;
}

export interface CreateCatchupPackResponse {
  ok: true;
  pack: CatchupPack;
}

export interface CatchupPackDetailResponse {
  ok: true;
  pack: CatchupPack;
  items: CatchupPackItem[];
}

export interface CatchupPacksListResponse {
  ok: true;
  packs: CatchupPack[];
  pagination: PaginationInfo;
}

export async function createCatchupPack(
  request: CreateCatchupPackRequest,
  signal?: AbortSignal,
): Promise<CreateCatchupPackResponse> {
  return apiFetch<CreateCatchupPackResponse>("/catchup-packs", {
    method: "POST",
    body: request,
    signal,
  });
}

export async function getCatchupPack(
  id: string,
  signal?: AbortSignal,
): Promise<CatchupPackDetailResponse> {
  return apiFetch<CatchupPackDetailResponse>(`/catchup-packs/${id}`, { signal });
}

export async function getCatchupPacks(
  params?: { topicId?: string; limit?: number; offset?: number },
  signal?: AbortSignal,
): Promise<CatchupPacksListResponse> {
  const searchParams = new URLSearchParams();
  if (params?.topicId) searchParams.set("topicId", params.topicId);
  if (params?.limit !== undefined) searchParams.set("limit", String(params.limit));
  if (params?.offset !== undefined) searchParams.set("offset", String(params.offset));
  const query = searchParams.toString();
  const path = query ? `/catchup-packs?${query}` : "/catchup-packs";
  return apiFetch<CatchupPacksListResponse>(path, { signal });
}

export interface DeleteCatchupPackResponse {
  ok: true;
  deleted: number;
}

export async function deleteCatchupPack(
  id: string,
  signal?: AbortSignal,
): Promise<DeleteCatchupPackResponse> {
  return apiFetch<DeleteCatchupPackResponse>(`/catchup-packs/${id}`, {
    method: "DELETE",
    signal,
  });
}

export interface MarkItemReadResponse {
  ok: true;
  readAt: string;
}

export async function markItemRead(
  contentItemId: string,
  packId?: string,
  signal?: AbortSignal,
): Promise<MarkItemReadResponse> {
  return apiFetch<MarkItemReadResponse>(`/items/${contentItemId}/read`, {
    method: "POST",
    body: packId ? { packId } : {},
    signal,
  });
}

export interface ClearItemReadResponse {
  ok: true;
  deleted: number;
}

export async function clearItemRead(
  contentItemId: string,
  signal?: AbortSignal,
): Promise<ClearItemReadResponse> {
  return apiFetch<ClearItemReadResponse>(`/items/${contentItemId}/read`, {
    method: "DELETE",
    signal,
  });
}

// ============================================================================
// Bookmarks API
// ============================================================================

/** Bookmarked item with content details */
export interface BookmarkedItem {
  id: string;
  item: {
    title: string | null;
    bodyText: string | null;
    url: string | null;
    externalId: string | null;
    author: string | null;
    publishedAt: string | null;
    sourceType: string;
    sourceId: string;
    metadata: Record<string, unknown> | null;
  };
  bookmarkedAt: string;
}

/** Toggle bookmark response */
export interface ToggleBookmarkResponse {
  ok: true;
  bookmarked: boolean;
}

/** Get bookmarks list response */
export interface BookmarksListResponse {
  ok: true;
  items: BookmarkedItem[];
  pagination: PaginationInfo;
}

/** Check bookmark status response */
export interface BookmarkStatusResponse {
  ok: true;
  bookmarked: boolean;
}

/** Bulk bookmark status response */
export interface BulkBookmarkStatusResponse {
  ok: true;
  status: Record<string, boolean>;
}

/**
 * Toggle bookmark for a content item.
 */
export async function toggleBookmark(
  contentItemId: string,
  signal?: AbortSignal,
): Promise<ToggleBookmarkResponse> {
  return apiFetch<ToggleBookmarkResponse>("/bookmarks", {
    method: "POST",
    body: { contentItemId },
    signal,
  });
}

/**
 * Get list of bookmarked items with pagination.
 */
export async function getBookmarks(
  params?: { limit?: number; offset?: number },
  signal?: AbortSignal,
): Promise<BookmarksListResponse> {
  const searchParams = new URLSearchParams();
  if (params?.limit !== undefined) searchParams.set("limit", String(params.limit));
  if (params?.offset !== undefined) searchParams.set("offset", String(params.offset));

  const query = searchParams.toString();
  const path = query ? `/bookmarks?${query}` : "/bookmarks";

  return apiFetch<BookmarksListResponse>(path, { signal });
}

/**
 * Check if a content item is bookmarked.
 */
export async function isBookmarked(
  contentItemId: string,
  signal?: AbortSignal,
): Promise<BookmarkStatusResponse> {
  return apiFetch<BookmarkStatusResponse>(`/bookmarks/${contentItemId}`, { signal });
}

/**
 * Check bookmark status for multiple items at once.
 */
export async function getBulkBookmarkStatus(
  contentItemIds: string[],
  signal?: AbortSignal,
): Promise<BulkBookmarkStatusResponse> {
  return apiFetch<BulkBookmarkStatusResponse>("/bookmarks/bulk-status", {
    method: "POST",
    body: { contentItemIds },
    signal,
  });
}

// ============================================================================
// Admin Logs API
// ============================================================================

/** Provider call from logs */
export interface ProviderCallLogItem {
  id: string;
  purpose: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  status: string;
  error: Record<string, unknown> | null;
  meta: Record<string, unknown>;
  startedAt: string;
  endedAt: string | null;
}

/** Provider calls log response */
export interface ProviderCallsLogResponse {
  ok: true;
  calls: ProviderCallLogItem[];
}

/** Provider call error summary */
export interface ProviderCallErrorSummary {
  purpose: string;
  errorCount: number;
  totalCount: number;
}

/** Provider call errors response */
export interface ProviderCallErrorsResponse {
  ok: true;
  errors: ProviderCallErrorSummary[];
}

/** Fetch run from logs */
export interface FetchRunLogItem {
  id: string;
  sourceId: string;
  sourceName: string;
  sourceType: string;
  status: string;
  startedAt: string;
  endedAt: string | null;
  counts: Record<string, unknown>;
  error: Record<string, unknown> | null;
}

/** Fetch runs log response */
export interface FetchRunsLogResponse {
  ok: true;
  runs: FetchRunLogItem[];
}

/** Source health item */
export interface SourceHealthItem {
  sourceId: string;
  sourceName: string;
  sourceType: string;
  totalItems: number;
  itemsLast24h: number;
  itemsLast7d: number;
  lastFetchedAt: string | null;
  lastRunAt: string | null;
  lastRunStatus: string | null;
  lastRunErrors: number;
  errorsLast24h: number;
  isEnabled: boolean;
}

/** Source health response */
export interface SourceHealthResponse {
  ok: true;
  sources: SourceHealthItem[];
}

/** Handle health item */
export interface HandleHealthItem {
  handle: string;
  sourceId: string;
  sourceName: string;
  totalItems: number;
  itemsLast7d: number;
  lastFetchedAt: string | null;
  lastPostDate: string | null;
}

/** Handle health response */
export interface HandleHealthResponse {
  ok: true;
  handles: HandleHealthItem[];
}

/** x_posts parse trend data point */
export interface XPostsParseTrendPoint {
  bucketStart: string;
  totalCalls: number;
  parseErrors: number;
  parseErrorRatePct: number;
  linesTotal: number;
  linesValid: number;
  linesInvalid: number;
  lineValidRatePct: number;
}

/** x_posts parse trend response */
export interface XPostsParseTrendResponse {
  ok: true;
  trend: {
    hoursAgo: number;
    bucketHours: number;
    sourceId: string | null;
    points: XPostsParseTrendPoint[];
    summary: {
      totalCalls: number;
      parseErrors: number;
      parseErrorRatePct: number;
      linesTotal: number;
      linesValid: number;
      linesInvalid: number;
      lineValidRatePct: number;
    };
  };
}

/**
 * Get provider call logs with optional filters.
 */
export async function getAdminLogsProviderCalls(
  params?: {
    limit?: number;
    offset?: number;
    purpose?: string;
    status?: string;
    sourceId?: string;
    hoursAgo?: number;
  },
  signal?: AbortSignal,
): Promise<ProviderCallsLogResponse> {
  const searchParams = new URLSearchParams();
  if (params?.limit !== undefined) searchParams.set("limit", String(params.limit));
  if (params?.offset !== undefined) searchParams.set("offset", String(params.offset));
  if (params?.purpose) searchParams.set("purpose", params.purpose);
  if (params?.status) searchParams.set("status", params.status);
  if (params?.sourceId) searchParams.set("sourceId", params.sourceId);
  if (params?.hoursAgo !== undefined) searchParams.set("hoursAgo", String(params.hoursAgo));

  const query = searchParams.toString();
  const path = query ? `/admin/logs/provider-calls?${query}` : "/admin/logs/provider-calls";

  return apiFetch<ProviderCallsLogResponse>(path, { signal });
}

/**
 * Get provider call error summaries by purpose.
 */
export async function getAdminLogsProviderCallErrors(
  params?: {
    hoursAgo?: number;
  },
  signal?: AbortSignal,
): Promise<ProviderCallErrorsResponse> {
  const searchParams = new URLSearchParams();
  if (params?.hoursAgo !== undefined) searchParams.set("hoursAgo", String(params.hoursAgo));

  const query = searchParams.toString();
  const path = query
    ? `/admin/logs/provider-calls/errors?${query}`
    : "/admin/logs/provider-calls/errors";

  return apiFetch<ProviderCallErrorsResponse>(path, { signal });
}

/**
 * Get fetch run logs with optional filters.
 */
export async function getAdminLogsFetchRuns(
  params?: {
    limit?: number;
    offset?: number;
    sourceId?: string;
    status?: string;
    hoursAgo?: number;
  },
  signal?: AbortSignal,
): Promise<FetchRunsLogResponse> {
  const searchParams = new URLSearchParams();
  if (params?.limit !== undefined) searchParams.set("limit", String(params.limit));
  if (params?.offset !== undefined) searchParams.set("offset", String(params.offset));
  if (params?.sourceId) searchParams.set("sourceId", params.sourceId);
  if (params?.status) searchParams.set("status", params.status);
  if (params?.hoursAgo !== undefined) searchParams.set("hoursAgo", String(params.hoursAgo));

  const query = searchParams.toString();
  const path = query ? `/admin/logs/fetch-runs?${query}` : "/admin/logs/fetch-runs";

  return apiFetch<FetchRunsLogResponse>(path, { signal });
}

/**
 * Get source health metrics.
 */
export async function getAdminLogsSourceHealth(
  signal?: AbortSignal,
): Promise<SourceHealthResponse> {
  return apiFetch<SourceHealthResponse>("/admin/logs/ingestion/sources", { signal });
}

/**
 * Get handle health metrics for X posts sources.
 */
export async function getAdminLogsHandleHealth(
  params?: {
    sourceId?: string;
  },
  signal?: AbortSignal,
): Promise<HandleHealthResponse> {
  const searchParams = new URLSearchParams();
  if (params?.sourceId) searchParams.set("sourceId", params.sourceId);

  const query = searchParams.toString();
  const path = query ? `/admin/logs/ingestion/handles?${query}` : "/admin/logs/ingestion/handles";

  return apiFetch<HandleHealthResponse>(path, { signal });
}

/**
 * Get x_posts parse-quality trend based on provider call meta.
 */
export async function getAdminLogsXPostsParseTrend(
  params?: {
    hoursAgo?: number;
    bucketHours?: number;
    sourceId?: string;
  },
  signal?: AbortSignal,
): Promise<XPostsParseTrendResponse> {
  const searchParams = new URLSearchParams();
  if (params?.hoursAgo !== undefined) searchParams.set("hoursAgo", String(params.hoursAgo));
  if (params?.bucketHours !== undefined)
    searchParams.set("bucketHours", String(params.bucketHours));
  if (params?.sourceId) searchParams.set("sourceId", params.sourceId);

  const query = searchParams.toString();
  const path = query
    ? `/admin/logs/provider-calls/x-posts-parse-trend?${query}`
    : "/admin/logs/provider-calls/x-posts-parse-trend";

  return apiFetch<XPostsParseTrendResponse>(path, { signal });
}

// ============================================================================
// Theme Management API
// ============================================================================

/** Response from regenerating themes */
export interface RegenerateThemesResponse {
  ok: true;
  message: string;
  result: {
    attempted: number;
    attachedToExisting: number;
    created: number;
    skipped: number;
    errors: number;
  };
}

/**
 * Regenerate themes for a topic.
 * Recomputes labels for recent triaged items.
 */
export async function postAdminRegenerateThemes(
  topicId: string,
  signal?: AbortSignal,
): Promise<RegenerateThemesResponse> {
  return apiFetch<RegenerateThemesResponse>(`/admin/topics/${topicId}/regenerate-themes`, {
    method: "POST",
    signal,
  });
}

// ============================================================================
// Embedding Retention API
// ============================================================================

export interface EmbeddingRetentionRun {
  id: string;
  topicId: string;
  windowEnd: string;
  maxAgeDays: number;
  maxItems: number;
  maxTokens: number;
  effectiveMaxAgeDays: number;
  cutoffAt: string;
  deletedByAge: number;
  deletedByMaxTokens: number;
  deletedByMaxItems: number;
  totalDeleted: number;
  createdAt: string;
}

export interface EmbeddingRetentionStatusResponse {
  ok: true;
  run: EmbeddingRetentionRun | null;
}

export async function getAdminEmbeddingRetentionStatus(
  topicId: string,
  signal?: AbortSignal,
): Promise<EmbeddingRetentionStatusResponse> {
  return apiFetch<EmbeddingRetentionStatusResponse>(
    `/admin/topics/${topicId}/embedding-retention`,
    { signal },
  );
}

// ============================================================================
// Scoring Modes API
// ============================================================================

/** Scoring mode config */
export interface ScoringModeConfig {
  version: 1;
  weights: {
    wAha: number;
    wHeuristic: number;
    wPref: number;
    wNovelty: number;
  };
  features: {
    perSourceCalibration: boolean;
    aiPreferenceInjection: boolean;
    embeddingPreferences: boolean;
  };
  llm: {
    usageScale: number;
  };
  calibration: {
    windowDays: number;
    minSamples: number;
    maxOffset: number;
  };
}

/** Scoring mode */
export interface ScoringMode {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  config: ScoringModeConfig;
  notes: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Scoring mode change audit entry */
export interface ScoringModeChange {
  id: string;
  userId: string;
  topicId: string | null;
  previousModeId: string | null;
  newModeId: string | null;
  reason: string | null;
  changedAt: string;
}

/** Scoring modes list response */
export interface ScoringModesResponse {
  ok: true;
  modes: ScoringMode[];
}

/** Single scoring mode response */
export interface ScoringModeResponse {
  ok: true;
  mode: ScoringMode;
}

/** Scoring mode audit log response */
export interface ScoringModeAuditResponse {
  ok: true;
  changes: ScoringModeChange[];
}

/** Get all scoring modes */
export async function getScoringModes(signal?: AbortSignal): Promise<ScoringModesResponse> {
  return apiFetch<ScoringModesResponse>("/scoring-modes", { signal });
}

/** Get default scoring mode */
export async function getScoringModeDefault(
  signal?: AbortSignal,
): Promise<ScoringModeResponse | ApiErrorResponse> {
  return apiFetch<ScoringModeResponse>("/scoring-modes/default", { signal });
}

/** Get scoring mode by ID */
export async function getScoringMode(
  id: string,
  signal?: AbortSignal,
): Promise<ScoringModeResponse> {
  return apiFetch<ScoringModeResponse>(`/scoring-modes/${id}`, { signal });
}

/** Get scoring mode audit log */
export async function getScoringModeAudit(
  params?: { topicId?: string; limit?: number },
  signal?: AbortSignal,
): Promise<ScoringModeAuditResponse> {
  const searchParams = new URLSearchParams();
  if (params?.topicId) searchParams.set("topicId", params.topicId);
  if (params?.limit) searchParams.set("limit", params.limit.toString());

  const query = searchParams.toString();
  const path = query ? `/scoring-modes/audit?${query}` : "/scoring-modes/audit";

  return apiFetch<ScoringModeAuditResponse>(path, { signal });
}

/** Create scoring mode request */
export interface CreateScoringModeRequest {
  name: string;
  description?: string;
  notes?: string;
  isDefault?: boolean;
  weights?: Partial<ScoringModeConfig["weights"]>;
  features?: Partial<ScoringModeConfig["features"]>;
  llm?: Partial<ScoringModeConfig["llm"]>;
  calibration?: Partial<ScoringModeConfig["calibration"]>;
}

/** Create a new scoring mode */
export async function postScoringMode(
  data: CreateScoringModeRequest,
  signal?: AbortSignal,
): Promise<ScoringModeResponse> {
  return apiFetch<ScoringModeResponse>("/scoring-modes", {
    method: "POST",
    body: JSON.stringify(data),
    signal,
  });
}

/** Update scoring mode request */
export interface UpdateScoringModeRequest {
  name?: string;
  description?: string | null;
  notes?: string | null;
  weights?: Partial<ScoringModeConfig["weights"]>;
  features?: Partial<ScoringModeConfig["features"]>;
  llm?: Partial<ScoringModeConfig["llm"]>;
  calibration?: Partial<ScoringModeConfig["calibration"]>;
}

/** Update a scoring mode */
export async function putScoringMode(
  id: string,
  data: UpdateScoringModeRequest,
  signal?: AbortSignal,
): Promise<ScoringModeResponse> {
  return apiFetch<ScoringModeResponse>(`/scoring-modes/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
    signal,
  });
}

/** Set scoring mode as default */
export async function postScoringModeSetDefault(
  id: string,
  reason?: string,
  signal?: AbortSignal,
): Promise<ScoringModeResponse> {
  return apiFetch<ScoringModeResponse>(`/scoring-modes/${id}/set-default`, {
    method: "POST",
    body: JSON.stringify({ reason }),
    signal,
  });
}

/** Delete a scoring mode */
export async function deleteScoringMode(
  id: string,
  signal?: AbortSignal,
): Promise<{ ok: true; message: string }> {
  return apiFetch<{ ok: true; message: string }>(`/scoring-modes/${id}`, {
    method: "DELETE",
    signal,
  });
}

/** Set topic scoring mode */
export async function patchTopicScoringMode(
  topicId: string,
  scoringModeId: string | null,
  reason?: string,
  signal?: AbortSignal,
): Promise<TopicDetailResponse> {
  return apiFetch<TopicDetailResponse>(`/topics/${topicId}/scoring-mode`, {
    method: "PATCH",
    body: JSON.stringify({ scoringModeId, reason }),
    signal,
  });
}

// ============================================================================
// Scoring Experiments API
// ============================================================================

/** Experiment outcome */
export type ExperimentOutcome = "positive" | "neutral" | "negative";

/** Scoring experiment */
export interface ScoringExperiment {
  id: string;
  userId: string;
  topicId: string;
  modeId: string;
  name: string;
  hypothesis: string | null;
  startedAt: string;
  endedAt: string | null;
  itemsShown: number;
  itemsLiked: number;
  itemsDisliked: number;
  itemsSkipped: number;
  digestsGenerated: number;
  notes: string | null;
  outcome: ExperimentOutcome | null;
  learnings: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Scoring experiments list response */
export interface ScoringExperimentsResponse {
  ok: true;
  experiments: ScoringExperiment[];
}

/** Single scoring experiment response */
export interface ScoringExperimentResponse {
  ok: true;
  experiment: ScoringExperiment;
}

/** Get all scoring experiments */
export async function getScoringExperiments(
  params?: { topicId?: string; activeOnly?: boolean; limit?: number },
  signal?: AbortSignal,
): Promise<ScoringExperimentsResponse> {
  const searchParams = new URLSearchParams();
  if (params?.topicId) searchParams.set("topicId", params.topicId);
  if (params?.activeOnly) searchParams.set("activeOnly", "true");
  if (params?.limit) searchParams.set("limit", params.limit.toString());

  const query = searchParams.toString();
  const path = query ? `/scoring-experiments?${query}` : "/scoring-experiments";

  return apiFetch<ScoringExperimentsResponse>(path, { signal });
}

/** Get active experiments for the user */
export async function getScoringExperimentsActive(
  signal?: AbortSignal,
): Promise<ScoringExperimentsResponse> {
  return apiFetch<ScoringExperimentsResponse>("/scoring-experiments/active", { signal });
}

/** Get scoring experiment by ID */
export async function getScoringExperiment(
  id: string,
  signal?: AbortSignal,
): Promise<ScoringExperimentResponse> {
  return apiFetch<ScoringExperimentResponse>(`/scoring-experiments/${id}`, { signal });
}

/** Create scoring experiment request */
export interface CreateScoringExperimentRequest {
  topicId: string;
  modeId: string;
  name: string;
  hypothesis?: string;
}

/** Create a new scoring experiment */
export async function postScoringExperiment(
  data: CreateScoringExperimentRequest,
  signal?: AbortSignal,
): Promise<ScoringExperimentResponse> {
  return apiFetch<ScoringExperimentResponse>("/scoring-experiments", {
    method: "POST",
    body: JSON.stringify(data),
    signal,
  });
}

/** Update scoring experiment request */
export interface UpdateScoringExperimentRequest {
  name?: string;
  hypothesis?: string | null;
  notes?: string | null;
}

/** Update a scoring experiment */
export async function putScoringExperiment(
  id: string,
  data: UpdateScoringExperimentRequest,
  signal?: AbortSignal,
): Promise<ScoringExperimentResponse> {
  return apiFetch<ScoringExperimentResponse>(`/scoring-experiments/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
    signal,
  });
}

/** End scoring experiment request */
export interface EndScoringExperimentRequest {
  outcome?: ExperimentOutcome | null;
  learnings?: string;
}

/** End a scoring experiment */
export async function postScoringExperimentEnd(
  id: string,
  data: EndScoringExperimentRequest,
  signal?: AbortSignal,
): Promise<ScoringExperimentResponse> {
  return apiFetch<ScoringExperimentResponse>(`/scoring-experiments/${id}/end`, {
    method: "POST",
    body: JSON.stringify(data),
    signal,
  });
}

/** Delete a scoring experiment */
export async function deleteScoringExperiment(
  id: string,
  signal?: AbortSignal,
): Promise<{ ok: true; message: string }> {
  return apiFetch<{ ok: true; message: string }>(`/scoring-experiments/${id}`, {
    method: "DELETE",
    signal,
  });
}

// ============================================================================
// Notifications API
// ============================================================================

/** Notification severity levels */
export type NotificationSeverity = "info" | "warning" | "error";

/** Notification item */
export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string | null;
  severity: NotificationSeverity;
  data: Record<string, unknown> | null;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
}

/** Notifications list params */
export interface NotificationsListParams {
  unreadOnly?: boolean;
  limit?: number;
  offset?: number;
}

/** Notifications list response */
export interface NotificationsListResponse {
  ok: true;
  notifications: NotificationItem[];
  unreadCount: number;
  pagination: PaginationInfo;
}

/** Dismiss notification response */
export interface DismissNotificationResponse {
  ok: true;
  notification: NotificationItem;
}

/** Dismiss all notifications response */
export interface DismissAllNotificationsResponse {
  ok: true;
  dismissed: number;
}

/**
 * Get notifications for the current user.
 */
export async function getNotifications(
  params?: NotificationsListParams,
  signal?: AbortSignal,
): Promise<NotificationsListResponse> {
  const searchParams = new URLSearchParams();
  if (params?.unreadOnly) searchParams.set("unreadOnly", "true");
  if (params?.limit !== undefined) searchParams.set("limit", String(params.limit));
  if (params?.offset !== undefined) searchParams.set("offset", String(params.offset));

  const query = searchParams.toString();
  const path = query ? `/notifications?${query}` : "/notifications";

  return apiFetch<NotificationsListResponse>(path, { signal });
}

/**
 * Dismiss (mark as read) a single notification.
 */
export async function dismissNotification(
  id: string,
  signal?: AbortSignal,
): Promise<DismissNotificationResponse> {
  return apiFetch<DismissNotificationResponse>(`/notifications/${id}/dismiss`, {
    method: "POST",
    signal,
  });
}

/**
 * Dismiss all notifications for the current user.
 */
export async function dismissAllNotifications(
  signal?: AbortSignal,
): Promise<DismissAllNotificationsResponse> {
  return apiFetch<DismissAllNotificationsResponse>("/notifications/dismiss-all", {
    method: "POST",
    signal,
  });
}
