"use client";

import Link from "next/link";
import { useDigests } from "@/lib/hooks";
import { t } from "@/lib/i18n";
import styles from "./Dashboard.module.css";

/**
 * Shows the most recent digests with status indicators.
 */
export function RecentDigestsWidget() {
  const { data, isLoading, error } = useDigests();
  const digests = data?.digests?.slice(0, 5) ?? [];

  if (isLoading) {
    return (
      <div className={styles.widget}>
        <div className={styles.widgetHeader}>
          <h3 className={styles.widgetTitle}>Recent Digests</h3>
        </div>
        <div className={styles.loading}>
          <Spinner />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.widget}>
        <div className={styles.widgetHeader}>
          <h3 className={styles.widgetTitle}>Recent Digests</h3>
        </div>
        <div className={styles.widgetError}>{t("common.error")}</div>
      </div>
    );
  }

  return (
    <div className={styles.widget}>
      <div className={styles.widgetHeader}>
        <h3 className={styles.widgetTitle}>Recent Digests</h3>
        <Link href="/app/digests" className={styles.viewAllLink}>
          View all
        </Link>
      </div>

      {digests.length === 0 ? (
        <div className={styles.digestEmpty}>No digests yet</div>
      ) : (
        <ul className={styles.digestList}>
          {digests.map((digest) => (
            <li key={digest.id} className={styles.digestItem}>
              <span
                className={styles.digestStatus}
                data-status={digest.status}
                title={digest.status === "complete" ? "Completed" : "Failed"}
              >
                {digest.status === "complete" ? <CheckIcon /> : <XIcon />}
              </span>
              <div className={styles.digestInfo}>
                <Link href={`/app/digests/${digest.id}`} className={styles.digestLink}>
                  {formatRelativeTime(digest.createdAt)}
                </Link>
                <span className={styles.digestMeta}>
                  <span className={styles.digestMode}>{digest.mode}</span>
                  <span className={styles.digestCount}>{digest.itemCount} items</span>
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);

  if (diffHours < 1) {
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    return diffMinutes <= 1 ? "Just now" : `${diffMinutes}m ago`;
  }
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }
  if (diffDays === 1) {
    return "Yesterday";
  }
  if (diffDays < 7) {
    return `${diffDays}d ago`;
  }
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function Spinner() {
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
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
