"use client";

import {
  DigestsListCondensed,
  DigestsListCondensedSkeleton,
  DigestsListReader,
  DigestsListReaderSkeleton,
  DigestsListTimeline,
  DigestsListTimelineSkeleton,
} from "@/components/DigestsList";
import { useTheme } from "@/components/ThemeProvider";
import { t } from "@/lib/i18n";
import { useRealDigests } from "@/lib/mock-data";
import styles from "./page.module.css";

export default function DigestsPage() {
  const { layout } = useTheme();
  // Using real API with adapter hooks
  const { data: digests, isLoading, isError, refetch } = useRealDigests();

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>{t("digests.title")}</h1>
      </header>

      {isLoading && <DigestsListSkeleton layout={layout} />}

      {isError && (
        <div className={styles.errorState}>
          <ErrorIcon />
          <h2 className={styles.errorTitle}>{t("digests.list.error")}</h2>
          <button
            type="button"
            className={`btn btn-primary ${styles.retryButton}`}
            onClick={refetch}
          >
            {t("digests.list.retry")}
          </button>
        </div>
      )}

      {!isLoading && !isError && digests && digests.length === 0 && (
        <div className={styles.emptyState}>
          <EmptyIcon />
          <h2 className={styles.emptyTitle}>{t("digests.list.empty")}</h2>
          <p className={styles.emptyDescription}>{t("digests.list.emptyDescription")}</p>
        </div>
      )}

      {!isLoading && !isError && digests && digests.length > 0 && (
        <DigestsList layout={layout} digests={digests} />
      )}
    </div>
  );
}

interface DigestsListProps {
  layout: "condensed" | "reader" | "timeline";
  digests: NonNullable<ReturnType<typeof useRealDigests>["data"]>;
}

function DigestsList({ layout, digests }: DigestsListProps) {
  switch (layout) {
    case "condensed":
      return <DigestsListCondensed digests={digests} />;
    case "reader":
      return <DigestsListReader digests={digests} />;
    case "timeline":
      return <DigestsListTimeline digests={digests} />;
  }
}

interface DigestsListSkeletonProps {
  layout: "condensed" | "reader" | "timeline";
}

function DigestsListSkeleton({ layout }: DigestsListSkeletonProps) {
  switch (layout) {
    case "condensed":
      return <DigestsListCondensedSkeleton />;
    case "reader":
      return <DigestsListReaderSkeleton />;
    case "timeline":
      return <DigestsListTimelineSkeleton />;
  }
}

function EmptyIcon() {
  return (
    <svg
      width="64"
      height="64"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="12" y1="18" x2="12" y2="12" />
      <line x1="9" y1="15" x2="15" y2="15" />
    </svg>
  );
}

function ErrorIcon() {
  return (
    <svg
      width="64"
      height="64"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
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
