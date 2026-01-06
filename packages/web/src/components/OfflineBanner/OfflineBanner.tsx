"use client";

import { useIsOnline } from "@/lib/use-network-status";
import { t } from "@/lib/i18n";
import styles from "./OfflineBanner.module.css";

interface OfflineBannerProps {
  /** Show when data is stale/cached */
  showStaleIndicator?: boolean;
  /** Last update timestamp for stale data */
  lastUpdated?: Date | string | null;
}

/**
 * Banner shown when the user is offline.
 *
 * Displays at the top of the page with a warning about
 * showing cached data.
 */
export function OfflineBanner({
  showStaleIndicator = false,
  lastUpdated,
}: OfflineBannerProps) {
  const isOnline = useIsOnline();

  // Don't render anything if online and no stale indicator needed
  if (isOnline && !showStaleIndicator) {
    return null;
  }

  const formattedTime = lastUpdated
    ? formatRelativeTime(new Date(lastUpdated))
    : null;

  return (
    <div
      className={`${styles.banner} ${isOnline ? styles.stale : styles.offline}`}
      role="alert"
      aria-live="polite"
    >
      <div className={styles.content}>
        <span className={styles.icon}>
          {isOnline ? <StaleIcon /> : <OfflineIcon />}
        </span>
        <span className={styles.message}>
          {isOnline
            ? t("network.staleData")
            : t("network.offline")}
        </span>
        {formattedTime && (
          <span className={styles.time}>
            {t("network.lastUpdated", { time: formattedTime })}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Compact stale data indicator for inline use.
 */
export function StaleIndicator({ lastUpdated }: { lastUpdated?: Date | string | null }) {
  const formattedTime = lastUpdated
    ? formatRelativeTime(new Date(lastUpdated))
    : null;

  return (
    <span className={styles.staleIndicator} title={t("network.staleData")}>
      <StaleIcon />
      {formattedTime && (
        <span className={styles.staleTime}>{formattedTime}</span>
      )}
    </span>
  );
}

/**
 * Format a date as relative time (e.g., "5 minutes ago").
 */
function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHr / 24);

  if (diffSec < 60) {
    return t("time.justNow");
  } else if (diffMin < 60) {
    return t("time.minutesAgo", { count: diffMin });
  } else if (diffHr < 24) {
    return t("time.hoursAgo", { count: diffHr });
  } else {
    return t("time.daysAgo", { count: diffDays });
  }
}

function OfflineIcon() {
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
      <line x1="1" y1="1" x2="23" y2="23" />
      <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
      <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
      <path d="M10.71 5.05A16 16 0 0 1 22.58 9" />
      <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
      <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
      <line x1="12" y1="20" x2="12.01" y2="20" />
    </svg>
  );
}

function StaleIcon() {
  return (
    <svg
      width="14"
      height="14"
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
