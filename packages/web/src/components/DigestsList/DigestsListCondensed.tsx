"use client";

import Link from "next/link";
import { t } from "@/lib/i18n";
import type { DigestSummary } from "@/lib/mock-data";
import styles from "./DigestsListCondensed.module.css";

interface DigestsListCondensedProps {
  digests: DigestSummary[];
}

function formatWindowRange(start: string, end: string): string {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const options: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  };

  const startStr = startDate.toLocaleString("en-US", options);
  const endStr = endDate.toLocaleString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return `${startStr} - ${endStr}`;
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);

  if (diffHours < 1) return "Just now";
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return "Yesterday";
  return `${diffDays}d ago`;
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

export function DigestsListCondensed({ digests }: DigestsListCondensedProps) {
  return (
    <div className={styles.container} data-testid="digests-list">
      <table className={styles.table}>
        <thead className={styles.tableHead}>
          <tr>
            <th scope="col" className={styles.thWindow}>
              {t("digests.list.window")}
            </th>
            <th scope="col" className={styles.thMode}>
              {t("digests.list.mode")}
            </th>
            <th scope="col" className={styles.thItems}>
              {t("digests.list.items")}
            </th>
            <th scope="col" className={styles.thCreated}>
              {t("digests.list.created")}
            </th>
          </tr>
        </thead>
        <tbody>
          {digests.map((digest) => (
            <tr key={digest.id} className={styles.row} data-testid={`digest-item-${digest.id}`}>
              <td className={styles.tdWindow}>
                <Link
                  href={`/app/digests/${digest.id}`}
                  className={styles.windowLink}
                  prefetch={true}
                >
                  {formatWindowRange(digest.windowStart, digest.windowEnd)}
                </Link>
              </td>
              <td className={styles.tdMode}>
                <span
                  className={`${styles.modeBadge} ${styles[`mode${digest.mode.charAt(0).toUpperCase()}${digest.mode.slice(1).replace("_", "")}`]}`}
                >
                  {getModeLabel(digest.mode)}
                </span>
              </td>
              <td className={styles.tdItems}>{digest.itemCount}</td>
              <td className={styles.tdCreated}>
                <time dateTime={digest.createdAt}>{formatRelativeTime(digest.createdAt)}</time>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function DigestsListCondensedSkeleton() {
  return (
    <div className={styles.container}>
      <table className={styles.table} aria-busy="true">
        <thead className={styles.tableHead}>
          <tr>
            <th scope="col" className={styles.thWindow}>
              {t("digests.list.window")}
            </th>
            <th scope="col" className={styles.thMode}>
              {t("digests.list.mode")}
            </th>
            <th scope="col" className={styles.thItems}>
              {t("digests.list.items")}
            </th>
            <th scope="col" className={styles.thCreated}>
              {t("digests.list.created")}
            </th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 5 }).map((_, i) => (
            <tr key={i} className={styles.row}>
              <td className={styles.tdWindow}>
                <span className={styles.skeleton} style={{ width: "180px" }} />
              </td>
              <td className={styles.tdMode}>
                <span className={styles.skeleton} style={{ width: "60px" }} />
              </td>
              <td className={styles.tdItems}>
                <span className={styles.skeleton} style={{ width: "30px" }} />
              </td>
              <td className={styles.tdCreated}>
                <span className={styles.skeleton} style={{ width: "50px" }} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
