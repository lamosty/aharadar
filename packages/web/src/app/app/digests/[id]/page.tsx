"use client";

import Link from "next/link";
import { use } from "react";
import {
  DigestDetailCondensed,
  DigestDetailCondensedSkeleton,
  DigestDetailReader,
  DigestDetailReaderSkeleton,
  DigestDetailTimeline,
  DigestDetailTimelineSkeleton,
} from "@/components/DigestDetail";
import { useTheme } from "@/components/ThemeProvider";
import { t } from "@/lib/i18n";
import { type DigestItem, useRealDigestDetail, useRealFeedback } from "@/lib/mock-data";
import styles from "./page.module.css";

interface DigestDetailPageProps {
  params: Promise<{ id: string }>;
}

export default function DigestDetailPage({ params }: DigestDetailPageProps) {
  const { id } = use(params);
  const { layout } = useTheme();
  // Using real API with adapter hooks
  const { data: digest, isLoading, isError, isStale, refetch } = useRealDigestDetail(id);
  // Using real API feedback hook
  const { submitFeedback } = useRealFeedback();

  const handleFeedback = async (
    contentItemId: string,
    action: "like" | "dislike" | "save" | "skip",
  ) => {
    await submitFeedback(contentItemId, id, action);
  };

  return (
    <div className={styles.page}>
      <nav className={styles.breadcrumb}>
        <Link href="/app/digests" className={styles.backLink}>
          <BackIcon />
          {t("nav.digests")}
        </Link>
      </nav>

      {isLoading && (
        <>
          <DigestHeaderSkeleton />
          <DigestDetailSkeleton layout={layout} />
        </>
      )}

      {isError && (
        <div className={styles.errorState}>
          <ErrorIcon />
          <h2 className={styles.errorTitle}>{t("digests.detail.error")}</h2>
          <button
            type="button"
            className={`btn btn-primary ${styles.retryButton}`}
            onClick={refetch}
          >
            {t("common.retry")}
          </button>
        </div>
      )}

      {!isLoading && !isError && digest && (
        <>
          {isStale && (
            <div className={styles.staleBanner} role="status">
              <InfoIcon />
              <span>{t("digests.detail.staleData")}</span>
            </div>
          )}

          <header className={styles.header}>
            <div className={styles.headerMain}>
              <h1 className={styles.title}>
                <WindowIcon />
                {formatWindowRange(digest.windowStart, digest.windowEnd)}
              </h1>
              <span
                className={`${styles.modeBadge} ${styles[`mode${digest.mode.charAt(0).toUpperCase()}${digest.mode.slice(1).replace("_", "")}`]}`}
              >
                {t(`digests.modes.${digest.mode}` as Parameters<typeof t>[0])}
              </span>
            </div>

            <div className={styles.headerMeta}>
              <span className={styles.itemCount}>
                {digest.itemCount}{" "}
                {digest.itemCount === 1 ? t("digests.detail.item") : t("digests.detail.items")}
              </span>
              <span className={styles.createdAt}>
                Created {formatRelativeTime(digest.createdAt)}
              </span>
            </div>
          </header>

          <section aria-labelledby="ranked-items-heading">
            <h2 id="ranked-items-heading" className={styles.sectionTitle}>
              {t("digests.detail.rankedItems")}
            </h2>

            <DigestDetail
              layout={layout}
              items={digest.items}
              digestId={id}
              onFeedback={handleFeedback}
            />
          </section>
        </>
      )}
    </div>
  );
}

interface DigestDetailProps {
  layout: "condensed" | "reader" | "timeline";
  items: DigestItem[];
  digestId: string;
  onFeedback: (
    contentItemId: string,
    action: "like" | "dislike" | "save" | "skip",
  ) => Promise<void>;
}

function DigestDetail({ layout, items, digestId, onFeedback }: DigestDetailProps) {
  switch (layout) {
    case "condensed":
      return <DigestDetailCondensed items={items} digestId={digestId} onFeedback={onFeedback} />;
    case "reader":
      return <DigestDetailReader items={items} digestId={digestId} onFeedback={onFeedback} />;
    case "timeline":
      return <DigestDetailTimeline items={items} digestId={digestId} onFeedback={onFeedback} />;
  }
}

interface DigestDetailSkeletonProps {
  layout: "condensed" | "reader" | "timeline";
}

function DigestDetailSkeleton({ layout }: DigestDetailSkeletonProps) {
  switch (layout) {
    case "condensed":
      return <DigestDetailCondensedSkeleton />;
    case "reader":
      return <DigestDetailReaderSkeleton />;
    case "timeline":
      return <DigestDetailTimelineSkeleton />;
  }
}

function DigestHeaderSkeleton() {
  return (
    <header className={styles.header}>
      <div className={styles.headerMain}>
        <span className={styles.skeleton} style={{ width: "280px", height: "32px" }} />
        <span className={styles.skeleton} style={{ width: "80px", height: "28px" }} />
      </div>
      <div className={styles.headerMeta}>
        <span className={styles.skeleton} style={{ width: "60px", height: "16px" }} />
        <span className={styles.skeleton} style={{ width: "120px", height: "16px" }} />
      </div>
    </header>
  );
}

// Helper functions
function formatWindowRange(start: string, end: string): string {
  const startDate = new Date(start);
  const endDate = new Date(end);

  const dateOptions: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
  };
  const timeOptions: Intl.DateTimeFormatOptions = {
    hour: "2-digit",
    minute: "2-digit",
  };

  const startDateStr = startDate.toLocaleDateString("en-US", dateOptions);
  const startTimeStr = startDate.toLocaleTimeString("en-US", timeOptions);
  const endTimeStr = endDate.toLocaleTimeString("en-US", timeOptions);

  return `${startDateStr} ${startTimeStr} - ${endTimeStr}`;
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return "yesterday";
  return `${diffDays}d ago`;
}

// Icon components
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
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function WindowIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
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

function InfoIcon() {
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
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  );
}
