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

/** Digest list item */
export interface DigestListItem {
  id: string;
  mode: string;
  windowStart: string;
  windowEnd: string;
  createdAt: string;
  itemCount: number;
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
    author: string | null;
    publishedAt: string | null;
    sourceType: string;
    sourceId: string;
    metadata?: ItemMetadata | null;
  };
  triageJson: Record<string, unknown> | null;
  feedback: FeedbackAction | null;
}

/** Pagination info */
export interface PaginationInfo {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

/** Items list params */
export interface ItemsListParams {
  limit?: number;
  offset?: number;
  sourceTypes?: string[];
  sourceIds?: string[];
  minScore?: number;
  since?: string;
  until?: string;
  sort?: "score_desc" | "date_desc" | "date_asc";
  topicId?: string;
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

/** Run mode types */
export type RunMode = "low" | "normal" | "high" | "catch_up";

/** Admin run request */
export interface AdminRunRequest {
  windowStart: string;
  windowEnd: string;
  mode?: RunMode;
  topicId?: string;
}

/** Admin run response */
export interface AdminRunResponse {
  ok: true;
  jobId: string;
}

/** Source config */
export interface SourceConfig {
  cadence?: {
    mode: "interval";
    every_minutes: number;
  } | null;
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
    cadence?: { mode: "interval"; every_minutes: number } | null;
    weight?: number | null;
  };
}

/** Source patch response */
export interface SourcePatchResponse {
  ok: true;
  source: Source;
}

/** Supported source types */
export const SUPPORTED_SOURCE_TYPES = ["reddit", "hn", "rss", "signal", "x_posts", "youtube"] as const;

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
    public readonly status?: number
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
      throw new NetworkError(error.name === "AbortError" ? "Request aborted" : "Network request failed");
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
  signal?: AbortSignal
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
export async function getItems(params?: ItemsListParams, signal?: AbortSignal): Promise<ItemsListResponse> {
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

  const query = searchParams.toString();
  const path = query ? `/items?${query}` : "/items";

  return apiFetch<ItemsListResponse>(path, { signal });
}

/**
 * Submit feedback for a content item.
 */
export async function postFeedback(
  feedback: FeedbackRequest,
  signal?: AbortSignal
): Promise<FeedbackResponse> {
  return apiFetch<FeedbackResponse>("/feedback", {
    method: "POST",
    body: feedback,
    signal,
  });
}

/**
 * Trigger a pipeline run.
 */
export async function postAdminRun(
  request: AdminRunRequest,
  signal?: AbortSignal
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
  signal?: AbortSignal
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
  signal?: AbortSignal
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
export async function deleteAdminSource(id: string, signal?: AbortSignal): Promise<SourceDeleteResponse> {
  return apiFetch<SourceDeleteResponse>(`/admin/sources/${id}`, {
    method: "DELETE",
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
  signal?: AbortSignal
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
export async function postMarkChecked(signal?: AbortSignal): Promise<PreferencesMarkCheckedResponse> {
  return apiFetch<PreferencesMarkCheckedResponse>("/preferences/mark-checked", {
    method: "POST",
    signal,
  });
}

// ============================================================================
// Topics API
// ============================================================================

/** Topic with viewing profile settings */
export interface Topic {
  id: string;
  name: string;
  description: string | null;
  viewingProfile: ViewingProfile;
  decayHours: number;
  lastCheckedAt: string | null;
  createdAt: string;
  updatedAt: string;
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
  signal?: AbortSignal
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
  signal?: AbortSignal
): Promise<TopicMarkCheckedResponse> {
  return apiFetch<TopicMarkCheckedResponse>(`/topics/${id}/mark-checked`, {
    method: "POST",
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
  signal?: AbortSignal
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
  signal?: AbortSignal
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
export async function deleteTopic(
  id: string,
  signal?: AbortSignal
): Promise<DeleteTopicResponse> {
  return apiFetch<DeleteTopicResponse>(`/topics/${id}`, {
    method: "DELETE",
    signal,
  });
}
