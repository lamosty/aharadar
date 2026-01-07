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

/** Unified feed item (from GET /items endpoint) */
export interface FeedItem {
  id: string;
  score: number;
  rank: number;
  digestId: string;
  digestCreatedAt: string;
  item: {
    title: string | null;
    url: string | null;
    author: string | null;
    publishedAt: string | null;
    sourceType: string;
    sourceId: string;
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

  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };

  if (settings.apiKey) {
    headers["X-API-Key"] = settings.apiKey;
  }

  try {
    const response = await fetch(url, {
      method: options.method ?? "GET",
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
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
export async function getItems(
  params?: ItemsListParams,
  signal?: AbortSignal
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
