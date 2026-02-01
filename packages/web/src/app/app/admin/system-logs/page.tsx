"use client";

import Link from "next/link";
import { useState } from "react";
import type { ProviderCallLogItem } from "@/lib/api";
import {
  useAdminLogsFetchRuns,
  useAdminLogsHandleHealth,
  useAdminLogsProviderCallErrors,
  useAdminLogsProviderCalls,
  useAdminLogsSourceHealth,
} from "@/lib/hooks";
import { t } from "@/lib/i18n";
import styles from "./page.module.css";

type TabId = "provider-calls" | "fetch-runs" | "ingestion" | "errors";

interface TimeRangeOption {
  label: string;
  hours: number;
}

const TIME_RANGE_OPTIONS: TimeRangeOption[] = [
  { label: "1h", hours: 1 },
  { label: "6h", hours: 6 },
  { label: "24h", hours: 24 },
  { label: "48h", hours: 48 },
  { label: "7d", hours: 168 },
];

export default function AdminLogsPage() {
  const [activeTab, setActiveTab] = useState<TabId>("provider-calls");
  const [hoursAgo, setHoursAgo] = useState(24);

  return (
    <div className={styles.page}>
      <Header />
      <Tabs activeTab={activeTab} onTabChange={setActiveTab} />
      <Controls hoursAgo={hoursAgo} onHoursAgoChange={setHoursAgo} />

      {activeTab === "provider-calls" && <ProviderCallsTab hoursAgo={hoursAgo} />}
      {activeTab === "fetch-runs" && <FetchRunsTab hoursAgo={hoursAgo} />}
      {activeTab === "ingestion" && <IngestionTab />}
      {activeTab === "errors" && <ErrorsTab hoursAgo={hoursAgo} />}
    </div>
  );
}

function Header() {
  return (
    <header className={styles.header}>
      <div className={styles.headerLeft}>
        <Link href="/app/admin" className={styles.backLink}>
          <BackIcon />
          <span>{t("common.back")}</span>
        </Link>
        <h1 className={styles.title}>System Logs</h1>
      </div>
    </header>
  );
}

interface TabsProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
}

function Tabs({ activeTab, onTabChange }: TabsProps) {
  const tabs: { id: TabId; label: string }[] = [
    { id: "provider-calls", label: "Provider Calls" },
    { id: "fetch-runs", label: "Fetch Runs" },
    { id: "ingestion", label: "Ingestion" },
    { id: "errors", label: "Errors" },
  ];

  return (
    <div className={styles.tabs}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={`${styles.tab} ${activeTab === tab.id ? styles.tabActive : ""}`}
          onClick={() => onTabChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

interface ControlsProps {
  hoursAgo: number;
  onHoursAgoChange: (hours: number) => void;
}

function Controls({ hoursAgo, onHoursAgoChange }: ControlsProps) {
  return (
    <div className={styles.controls}>
      <span className={styles.controlLabel}>Time Range:</span>
      <select
        className={styles.select}
        value={hoursAgo}
        onChange={(e) => onHoursAgoChange(Number(e.target.value))}
      >
        {TIME_RANGE_OPTIONS.map((opt) => (
          <option key={opt.hours} value={opt.hours}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

// ============================================================================
// Provider Calls Tab
// ============================================================================

function ProviderCallsTab({ hoursAgo }: { hoursAgo: number }) {
  const { data, isLoading, isError, error } = useAdminLogsProviderCalls({
    hoursAgo,
    limit: 100,
  });

  if (isLoading) {
    return (
      <div className={styles.loading}>
        <LoadingSpinner />
        <span>Loading provider calls...</span>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className={styles.error}>
        <p>{error?.message || "Failed to load provider calls"}</p>
      </div>
    );
  }

  if (data.calls.length === 0) {
    return <div className={styles.emptyState}>No provider calls in the selected time range</div>;
  }

  return (
    <div className={styles.tableContainer}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Time</th>
            <th>Purpose</th>
            <th>Provider/Model</th>
            <th>Tokens (in/out)</th>
            <th>Cost</th>
            <th>Status</th>
            <th>Flags</th>
          </tr>
        </thead>
        <tbody>
          {data.calls.map((call) => {
            const flagsText = getProviderCallFlagsText(call);
            return (
              <tr key={call.id}>
                <td className={`${styles.mono} ${styles.nowrap}`}>{formatTime(call.startedAt)}</td>
                <td className={styles.truncate} title={call.purpose}>
                  {call.purpose}
                </td>
                <td className={styles.nowrap}>
                  <span>{call.provider}</span>
                  <span className={styles.muted}> / {call.model}</span>
                </td>
                <td className={styles.mono}>
                  {formatNumber(call.inputTokens)} / {formatNumber(call.outputTokens)}
                </td>
                <td className={styles.mono}>${call.costUsd.toFixed(4)}</td>
                <td>
                  <StatusBadge status={call.status} />
                </td>
                <td className={`${styles.mono} ${styles.truncate}`} title={flagsText}>
                  {flagsText}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================================
// Fetch Runs Tab
// ============================================================================

function FetchRunsTab({ hoursAgo }: { hoursAgo: number }) {
  const { data, isLoading, isError, error } = useAdminLogsFetchRuns({
    hoursAgo,
    limit: 50,
  });

  if (isLoading) {
    return (
      <div className={styles.loading}>
        <LoadingSpinner />
        <span>Loading fetch runs...</span>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className={styles.error}>
        <p>{error?.message || "Failed to load fetch runs"}</p>
      </div>
    );
  }

  if (data.runs.length === 0) {
    return <div className={styles.emptyState}>No fetch runs in the selected time range</div>;
  }

  return (
    <div className={styles.tableContainer}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Time</th>
            <th>Source</th>
            <th>Type</th>
            <th>Status</th>
            <th>Duration</th>
            <th>Items</th>
          </tr>
        </thead>
        <tbody>
          {data.runs.map((run) => (
            <tr key={run.id}>
              <td className={`${styles.mono} ${styles.nowrap}`}>{formatTime(run.startedAt)}</td>
              <td className={styles.truncate} title={run.sourceName}>
                {run.sourceName}
              </td>
              <td className={styles.nowrap}>{run.sourceType}</td>
              <td>
                <StatusBadge status={run.status} />
              </td>
              <td className={styles.mono}>{formatDuration(run.startedAt, run.endedAt)}</td>
              <td className={styles.mono}>{formatCounts(run.counts)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================================
// Ingestion Tab
// ============================================================================

function IngestionTab() {
  const {
    data: sourceData,
    isLoading: sourceLoading,
    isError: sourceError,
    error: sourceErrorObj,
  } = useAdminLogsSourceHealth();
  const {
    data: handleData,
    isLoading: handleLoading,
    isError: handleError,
    error: handleErrorObj,
  } = useAdminLogsHandleHealth();

  return (
    <>
      {/* Sources Section */}
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Sources</h2>
        {sourceLoading ? (
          <div className={styles.loading}>
            <LoadingSpinner />
            <span>Loading sources...</span>
          </div>
        ) : sourceError || !sourceData ? (
          <div className={styles.error}>
            <p>{sourceErrorObj?.message || "Failed to load sources"}</p>
          </div>
        ) : sourceData.sources.length === 0 ? (
          <div className={styles.emptyState}>No sources found</div>
        ) : (
          <div className={styles.tableContainer}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Total Items</th>
                  <th>24h</th>
                  <th>7d</th>
                  <th>Last Fetch</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {sourceData.sources.map((source) => (
                  <tr key={source.sourceId}>
                    <td className={styles.truncate} title={source.sourceName}>
                      {source.sourceName}
                    </td>
                    <td className={styles.nowrap}>{source.sourceType}</td>
                    <td className={styles.mono}>{formatNumber(source.totalItems)}</td>
                    <td className={styles.mono}>{formatNumber(source.itemsLast24h)}</td>
                    <td className={styles.mono}>{formatNumber(source.itemsLast7d)}</td>
                    <td className={`${styles.mono} ${styles.muted}`}>
                      {source.lastFetchedAt ? formatTimeAgo(source.lastFetchedAt) : "-"}
                    </td>
                    <td>
                      {source.isEnabled ? (
                        <span className={styles.enabledBadge}>
                          <CheckIcon />
                          Enabled
                        </span>
                      ) : (
                        <span className={styles.disabledBadge}>
                          <XIcon />
                          Disabled
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Handles Section */}
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Handles (X Accounts)</h2>
        {handleLoading ? (
          <div className={styles.loading}>
            <LoadingSpinner />
            <span>Loading handles...</span>
          </div>
        ) : handleError || !handleData ? (
          <div className={styles.error}>
            <p>{handleErrorObj?.message || "Failed to load handles"}</p>
          </div>
        ) : handleData.handles.length === 0 ? (
          <div className={styles.emptyState}>No handles found</div>
        ) : (
          <div className={styles.tableContainer}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Handle</th>
                  <th>Source</th>
                  <th>Items 7d</th>
                  <th>Last Fetch</th>
                  <th>Last Post</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {handleData.handles.map((handle) => {
                  const isStale = isHandleStale(handle.lastPostDate);
                  return (
                    <tr key={`${handle.sourceId}-${handle.handle}`}>
                      <td className={styles.mono}>@{handle.handle}</td>
                      <td className={styles.truncate} title={handle.sourceName}>
                        {handle.sourceName}
                      </td>
                      <td className={styles.mono}>{formatNumber(handle.itemsLast7d)}</td>
                      <td className={`${styles.mono} ${styles.muted}`}>
                        {handle.lastFetchedAt ? formatTimeAgo(handle.lastFetchedAt) : "-"}
                      </td>
                      <td className={`${styles.mono} ${styles.muted}`}>
                        {handle.lastPostDate ? formatTimeAgo(handle.lastPostDate) : "-"}
                      </td>
                      <td>
                        {isStale ? (
                          <span className={styles.staleIndicator}>Stale</span>
                        ) : (
                          <span className={styles.enabledBadge}>
                            <CheckIcon />
                            Active
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

// ============================================================================
// Errors Tab
// ============================================================================

function ErrorsTab({ hoursAgo }: { hoursAgo: number }) {
  const { data, isLoading, isError, error } = useAdminLogsProviderCallErrors({
    hoursAgo,
  });

  if (isLoading) {
    return (
      <div className={styles.loading}>
        <LoadingSpinner />
        <span>Loading error summary...</span>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className={styles.error}>
        <p>{error?.message || "Failed to load error summary"}</p>
      </div>
    );
  }

  if (data.errors.length === 0) {
    return <div className={styles.emptyState}>No errors in the selected time range</div>;
  }

  return (
    <div className={styles.tableContainer}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Purpose</th>
            <th>Error Count</th>
            <th>Total Count</th>
            <th>Error Rate %</th>
          </tr>
        </thead>
        <tbody>
          {data.errors.map((item) => {
            const errorRate = item.totalCount > 0 ? (item.errorCount / item.totalCount) * 100 : 0;
            return (
              <tr key={item.purpose}>
                <td>{item.purpose}</td>
                <td className={styles.mono}>{formatNumber(item.errorCount)}</td>
                <td className={styles.mono}>{formatNumber(item.totalCount)}</td>
                <td className={`${styles.mono} ${getErrorRateClass(errorRate)}`}>
                  {errorRate.toFixed(1)}%
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================================
// Helper Functions
// ============================================================================

function formatTime(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function formatTimeAgo(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMinutes < 1) return "just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
}

function formatDuration(startedAt: string, endedAt: string | null): string {
  if (!endedAt) return "running...";
  const start = new Date(startedAt).getTime();
  const end = new Date(endedAt).getTime();
  const durationMs = end - start;

  if (durationMs < 1000) return `${durationMs}ms`;
  if (durationMs < 60000) return `${(durationMs / 1000).toFixed(1)}s`;
  return `${(durationMs / 60000).toFixed(1)}m`;
}

function formatCounts(counts: Record<string, unknown>): string {
  if (!counts) return "-";
  const total = (counts.total as number) ?? (counts.fetched as number) ?? 0;
  const newItems = (counts.new as number) ?? (counts.inserted as number) ?? 0;
  if (total === 0 && newItems === 0) return "-";
  if (newItems > 0) return `${total} (${newItems} new)`;
  return total.toString();
}

function getProviderCallFlagsText(call: ProviderCallLogItem): string {
  const meta = call.meta ?? {};
  const flags: string[] = [];
  if (meta.assistant_parse_error === true) {
    flags.push("parse-error");
  }
  const toolErrorCode = meta.tool_error_code;
  if (typeof toolErrorCode === "string" && toolErrorCode.trim()) {
    flags.push(`tool:${toolErrorCode.trim()}`);
  }
  return flags.length > 0 ? flags.join(", ") : "-";
}

function isHandleStale(lastPostDate: string | null): boolean {
  if (!lastPostDate) return true;
  const date = new Date(lastPostDate);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return diffDays > 3;
}

function getErrorRateClass(rate: number): string {
  if (rate >= 10) return styles.errorRateHigh;
  if (rate >= 5) return styles.errorRateMedium;
  return styles.errorRateLow;
}

// ============================================================================
// Icon Components
// ============================================================================

function BackIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </svg>
  );
}

function LoadingSpinner() {
  return (
    <svg
      className={styles.spinner}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

interface StatusBadgeProps {
  status: string;
}

function StatusBadge({ status }: StatusBadgeProps) {
  const normalizedStatus = status.toLowerCase();
  let className = styles.statusMuted;

  if (
    normalizedStatus === "ok" ||
    normalizedStatus === "complete" ||
    normalizedStatus === "success"
  ) {
    className = styles.statusOk;
  } else if (normalizedStatus === "error" || normalizedStatus === "failed") {
    className = styles.statusError;
  } else if (normalizedStatus === "partial" || normalizedStatus === "warning") {
    className = styles.statusWarning;
  }

  return <span className={`${styles.statusBadge} ${className}`}>{status}</span>;
}
