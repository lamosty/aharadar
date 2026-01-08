/**
 * Shared metrics constants and helpers for Prometheus instrumentation.
 */

/** Standard label names used across API and Worker metrics */
export const MetricLabels = {
  // HTTP labels
  METHOD: "method",
  ROUTE: "route",
  STATUS_CODE: "status_code",

  // Pipeline labels
  STAGE: "stage",
  STATUS: "status",

  // Source labels
  SOURCE_TYPE: "source_type",

  // LLM labels
  PROVIDER: "provider",
  MODEL: "model",
  PURPOSE: "purpose",

  // Queue labels
  QUEUE_NAME: "queue_name",
} as const;

/** Standard metric name prefixes */
export const MetricNames = {
  // API metrics
  HTTP_REQUEST_DURATION: "http_request_duration_seconds",
  HTTP_REQUESTS_TOTAL: "http_requests_total",
  HTTP_ACTIVE_CONNECTIONS: "http_active_connections",

  // Pipeline metrics
  PIPELINE_RUN_DURATION: "pipeline_run_duration_seconds",
  PIPELINE_RUNS_TOTAL: "pipeline_runs_total",

  // Ingestion metrics
  INGEST_ITEMS_TOTAL: "ingest_items_total",

  // LLM metrics
  LLM_CALL_DURATION: "llm_call_duration_seconds",
  LLM_CALLS_TOTAL: "llm_calls_total",

  // Credits metrics
  CREDITS_CONSUMED_TOTAL: "credits_consumed_total",

  // Queue metrics
  QUEUE_DEPTH: "queue_depth",
} as const;

/** Histogram buckets for HTTP request duration (seconds) */
export const HTTP_DURATION_BUCKETS = [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

/** Histogram buckets for pipeline stage duration (seconds) */
export const PIPELINE_DURATION_BUCKETS = [0.1, 0.5, 1, 2.5, 5, 10, 30, 60, 120, 300];

/** Histogram buckets for LLM call duration (seconds) */
export const LLM_DURATION_BUCKETS = [0.5, 1, 2, 5, 10, 20, 30, 60];
