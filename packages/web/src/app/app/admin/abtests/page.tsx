"use client";

import Link from "next/link";
import type { AbtestRunStatus } from "@/lib/api";
import { useAdminAbtests } from "@/lib/hooks";
import { t } from "@/lib/i18n";
import styles from "./page.module.css";

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatWindow(start: string, end: string): string {
  const startDate = new Date(start);
  const endDate = new Date(end);
  return `${startDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })} - ${endDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

function getStatusClass(status: AbtestRunStatus): string {
  switch (status) {
    case "pending":
      return styles.statusPending;
    case "running":
      return styles.statusRunning;
    case "completed":
      return styles.statusCompleted;
    case "failed":
      return styles.statusFailed;
    default:
      return styles.statusPending;
  }
}

export default function AdminAbtestsPage() {
  const { data, isLoading, isError, error } = useAdminAbtests();

  // Check if feature is disabled (403 with FEATURE_DISABLED code)
  const isDisabled = isError && error && "code" in error && error.code === "FEATURE_DISABLED";

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/app/admin" className={styles.backLink}>
          <BackIcon />
          <span>{t("common.back")}</span>
        </Link>
        <div className={styles.headerRow}>
          <h1 className={styles.title}>{t("admin.abtests.title")}</h1>
          {!isDisabled && !isLoading && (
            <Link href="/app/admin/abtests/new" className={styles.createButton}>
              <PlusIcon />
              <span>{t("admin.abtests.createNew")}</span>
            </Link>
          )}
        </div>
      </header>

      {isLoading && (
        <div className={styles.runsList}>
          {[1, 2, 3].map((i) => (
            <div key={i} className={`${styles.skeleton} ${styles.skeletonCard}`} />
          ))}
        </div>
      )}

      {isDisabled && (
        <div className={styles.disabledCard}>
          <div className={styles.disabledIcon}>
            <LockIcon />
          </div>
          <h2 className={styles.disabledTitle}>{t("admin.abtests.title")}</h2>
          <p className={styles.disabledMessage}>{t("admin.abtests.disabled")}</p>
        </div>
      )}

      {isError && !isDisabled && (
        <div className={styles.error} role="alert">
          <ErrorIcon />
          <span>{error?.message || t("common.error")}</span>
        </div>
      )}

      {!isLoading && !isError && data?.runs.length === 0 && (
        <div className={styles.emptyCard}>
          <div className={styles.emptyIcon}>
            <BeakerIcon />
          </div>
          <h2 className={styles.emptyTitle}>{t("admin.abtests.noRuns")}</h2>
          <p className={styles.emptyDescription}>{t("admin.abtests.noRunsDescription")}</p>
          <Link href="/app/admin/abtests/new" className={styles.createButton}>
            <PlusIcon />
            <span>{t("admin.abtests.createNew")}</span>
          </Link>
        </div>
      )}

      {!isLoading && !isError && data && data.runs.length > 0 && (
        <div className={styles.runsList}>
          {data.runs.map((run) => (
            <Link key={run.id} href={`/app/admin/abtests/${run.id}`} className={styles.runCard}>
              <div className={styles.runHeader}>
                <span className={styles.runId}>{run.id.slice(0, 8)}...</span>
                <span className={`${styles.statusBadge} ${getStatusClass(run.status)}`}>
                  {t(`admin.abtests.status.${run.status}` as Parameters<typeof t>[0])}
                </span>
              </div>
              <div className={styles.runMeta}>
                <span className={styles.runMetaItem}>
                  <span className={styles.runMetaLabel}>{t("admin.abtests.list.window")}:</span>
                  <span className={styles.runMetaValue}>
                    {formatWindow(run.windowStart, run.windowEnd)}
                  </span>
                </span>
                <span className={styles.runMetaItem}>
                  <span className={styles.runMetaLabel}>{t("admin.abtests.list.variants")}:</span>
                  <span className={styles.runMetaValue}>{run.config.variantCount}</span>
                </span>
                <span className={styles.runMetaItem}>
                  <span className={styles.runMetaLabel}>{t("admin.abtests.list.items")}:</span>
                  <span className={styles.runMetaValue}>{run.config.maxItems}</span>
                </span>
                <span className={styles.runMetaItem}>
                  <span className={styles.runMetaLabel}>{t("admin.abtests.list.created")}:</span>
                  <span className={styles.runMetaValue}>{formatDate(run.createdAt)}</span>
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

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

function PlusIcon() {
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
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function BeakerIcon() {
  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4.5 3h15" />
      <path d="M6 3v16a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V3" />
      <path d="M6 14h12" />
    </svg>
  );
}

function ErrorIcon() {
  return (
    <svg
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
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}
