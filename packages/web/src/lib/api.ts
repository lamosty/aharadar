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
  mode: string;
  status: "complete" | "failed";
  creditsUsed: number;
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
  score: number;
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
  score: number;
  rawScore?: number; // Original score before decay
  rank: number;
  digestId: string;
  digestCreatedAt: string;
  isNew?: boolean; // True if published after last_checked_at
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
  // Topic context (for "all topics" mode)
  topicId: string;
  topicName: string;
}

/** Pagination info */
export interface PaginationInfo {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

/** Feed view types */
export type FeedView = "inbox" | "saved" | "all";

/** Items list params */
export interface ItemsListParams {
  limit?: number;
  offset?: number;
  sourceTypes?: string[];
  sourceIds?: string[];
  minScore?: number;
  since?: string;
  until?: string;
  sort?: "best" | "latest" | "trending";
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
export type FeedbackAction = "like" | "dislike" | "save" | "skip";

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
export type LlmProvider = "openai" | "anthropic" | "claude-subscription";

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
  configPatch?: {
    weight?: number | null;
  };
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
  "signal",
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

// ============================================================================
// Dev Settings
// ============================================================================

const DEV_SETTINGS_KEY = "aharadar-dev-settings";

export interface DevSettings {
  apiBaseUrl: string;
  apiKey: string;
}

const DEFAULT_DEV_SETTINGS: DevSettings = {
  apiBaseUrl: "http://localhost:3001/api",
  apiKey: "",
};

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
        apiBaseUrl: parsed.apiBaseUrl ?? DEFAULT_DEV_SETTINGS.apiBaseUrl,
        apiKey: parsed.apiKey ?? DEFAULT_DEV_SETTINGS.apiKey,
      };
    }
  } catch {
    // Ignore parse errors
  }

  return DEFAULT_DEV_SETTINGS;
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
 * List digests within a date range.
 */
export async function getDigests(
  params?: { from?: string; to?: string },
  signal?: AbortSignal,
): Promise<DigestsListResponse> {
  const searchParams = new URLSearchParams();
  if (params?.from) searchParams.set("from", params.from);
  if (params?.to) searchParams.set("to", params.to);

  const query = searchParams.toString();
  const path = query ? `/digests?${query}` : "/digests";

  return apiFetch<DigestsListResponse>(path, { signal });
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
  if (params?.view) searchParams.set("view", params.view);

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
  saves: number;
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
    save: number;
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
  saves: number;
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
// LLM Settings API
// ============================================================================

/** LLM settings data */
export interface LlmSettings {
  provider: LlmProvider;
  anthropicModel: string;
  openaiModel: string;
  claudeSubscriptionEnabled: boolean;
  claudeTriageThinking: boolean;
  claudeCallsPerHour: number;
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
  claudeSubscriptionEnabled?: boolean;
  claudeTriageThinking?: boolean;
  claudeCallsPerHour?: number;
}

/**
 * Get LLM settings.
 */
export async function getAdminLlmSettings(signal?: AbortSignal): Promise<LlmSettingsResponse> {
  return apiFetch<LlmSettingsResponse>("/admin/llm-settings", { signal });
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

/** Viewing profile options */
export type ViewingProfile = "power" | "daily" | "weekly" | "research" | "custom";

/** Profile option for UI */
export interface ProfileOption {
  value: ViewingProfile;
  label: string;
  description: string;
  decayHours: number | null;
}

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
  profileOptions: ProfileOption[];
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
}

/** Topics list response */
export interface TopicsListResponse {
  ok: true;
  topics: Topic[];
  profileOptions: ProfileOption[];
}

/** Topic detail response */
export interface TopicDetailResponse {
  ok: true;
  topic: Topic;
  profileOptions: ProfileOption[];
}

/** Topic viewing profile update request */
export interface TopicViewingProfileUpdateRequest {
  viewingProfile?: ViewingProfile;
  decayHours?: number;
}

/** Topic viewing profile update response */
export interface TopicViewingProfileUpdateResponse {
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

/**
 * Update a topic's viewing profile.
 */
export async function patchTopicViewingProfile(
  id: string,
  data: TopicViewingProfileUpdateRequest,
  signal?: AbortSignal,
): Promise<TopicViewingProfileUpdateResponse> {
  return apiFetch<TopicViewingProfileUpdateResponse>(`/topics/${id}/viewing-profile`, {
    method: "PATCH",
    body: data,
    signal,
  });
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
