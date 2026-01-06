"use client";

import Link from "next/link";
import { type DigestSummary } from "@/lib/mock-data";
import { t } from "@/lib/i18n";
import styles from "./DigestsListTimeline.module.css";

interface DigestsListTimelineProps {
  digests: DigestSummary[];
}

function formatTimelineDate(dateStr: string): string {
  const date = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const isToday = date.toDateString() === today.toDateString();
  const isYesterday = date.toDateString() === yesterday.toDateString();

  if (isToday) return "Today";
  if (isYesterday) return "Yesterday";

  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function getModeLabel(mode: DigestSummary["mode"]): string {
  const labels: Record<DigestSummary["mode"], string> = {
    low: "Low",
    normal: "Normal",
    high: "High",
    catch_up: "Catch-up",
  };
  return labels[mode];
}

// Group digests by date for timeline rendering
function groupByDate(
  digests: DigestSummary[]
): Map<string, DigestSummary[]> {
  const groups = new Map<string, DigestSummary[]>();

  for (const digest of digests) {
    const dateKey = new Date(digest.createdAt).toDateString();
    const existing = groups.get(dateKey) || [];
    groups.set(dateKey, [...existing, digest]);
  }

  return groups;
}

export function DigestsListTimeline({ digests }: DigestsListTimelineProps) {
  const groupedDigests = groupByDate(digests);

  return (
    <div className={styles.container}>
      {Array.from(groupedDigests.entries()).map(([dateKey, dateDigests]) => (
        <section key={dateKey} className={styles.dateGroup}>
          <header className={styles.dateHeader}>
            <time
              dateTime={new Date(dateKey).toISOString()}
              className={styles.dateLabel}
            >
              {formatTimelineDate(dateDigests[0].createdAt)}
            </time>
            <div className={styles.dateLine} aria-hidden="true" />
          </header>

          <ol className={styles.timeline} role="list">
            {dateDigests.map((digest, index) => (
              <li key={digest.id} className={styles.timelineItem}>
                <div className={styles.timelineDot} aria-hidden="true">
                  <div className={styles.dot} />
                  {index < dateDigests.length - 1 && (
                    <div className={styles.connector} />
                  )}
                </div>

                <Link
                  href={`/app/digests/${digest.id}`}
                  className={styles.digestCard}
                  prefetch={true}
                >
                  <div className={styles.digestTime}>
                    <time dateTime={digest.createdAt}>
                      {formatTime(digest.createdAt)}
                    </time>
                  </div>

                  <div className={styles.digestContent}>
                    <div className={styles.digestHeader}>
                      <span className={styles.windowRange}>
                        {formatTime(digest.windowStart)} -{" "}
                        {formatTime(digest.windowEnd)}
                      </span>
                      <span
                        className={`${styles.modeBadge} ${styles[`mode${digest.mode.charAt(0).toUpperCase()}${digest.mode.slice(1).replace("_", "")}`]}`}
                      >
                        {getModeLabel(digest.mode)}
                      </span>
                    </div>

                    <div className={styles.digestMeta}>
                      <span className={styles.itemCount}>
                        <ItemsIcon />
                        {digest.itemCount}{" "}
                        {digest.itemCount === 1
                          ? t("digests.list.item")
                          : t("digests.list.items")}
                      </span>
                    </div>
                  </div>

                  <div className={styles.digestArrow} aria-hidden="true">
                    <ChevronRightIcon />
                  </div>
                </Link>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

export function DigestsListTimelineSkeleton() {
  return (
    <div className={styles.container}>
      <section className={styles.dateGroup}>
        <header className={styles.dateHeader}>
          <span
            className={styles.skeleton}
            style={{ width: "60px", height: "16px" }}
          />
          <div className={styles.dateLine} aria-hidden="true" />
        </header>

        <ol className={styles.timeline} role="list" aria-busy="true">
          {Array.from({ length: 3 }).map((_, i) => (
            <li key={i} className={styles.timelineItem}>
              <div className={styles.timelineDot} aria-hidden="true">
                <div className={styles.dot} />
                {i < 2 && <div className={styles.connector} />}
              </div>

              <div className={styles.digestCard} aria-hidden="true">
                <div className={styles.digestTime}>
                  <span
                    className={styles.skeleton}
                    style={{ width: "60px", height: "14px" }}
                  />
                </div>

                <div className={styles.digestContent}>
                  <div className={styles.digestHeader}>
                    <span
                      className={styles.skeleton}
                      style={{ width: "120px", height: "16px" }}
                    />
                    <span
                      className={styles.skeleton}
                      style={{ width: "60px", height: "20px" }}
                    />
                  </div>

                  <div className={styles.digestMeta}>
                    <span
                      className={styles.skeleton}
                      style={{ width: "80px", height: "14px" }}
                    />
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function ItemsIcon() {
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
      style={{ marginRight: "4px" }}
    >
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  );
}

function ChevronRightIcon() {
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
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}
