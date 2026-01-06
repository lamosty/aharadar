"use client";

import Link from "next/link";
import { type DigestSummary } from "@/lib/mock-data";
import { t } from "@/lib/i18n";
import styles from "./DigestsListReader.module.css";

interface DigestsListReaderProps {
  digests: DigestSummary[];
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatWindowDescription(start: string, end: string): string {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const diffHours = Math.round(
    (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60)
  );
  return `${diffHours}-hour window`;
}

function getModeLabel(mode: DigestSummary["mode"]): string {
  const labels: Record<DigestSummary["mode"], string> = {
    low: "Low Priority",
    normal: "Normal",
    high: "High Priority",
    catch_up: "Catch-up",
  };
  return labels[mode];
}

function getModeDescription(mode: DigestSummary["mode"]): string {
  const descriptions: Record<DigestSummary["mode"], string> = {
    low: "Budget-conscious processing",
    normal: "Standard processing depth",
    high: "Deep analysis enabled",
    catch_up: "Backlog processing",
  };
  return descriptions[mode];
}

export function DigestsListReader({ digests }: DigestsListReaderProps) {
  return (
    <div className={styles.container}>
      <ul className={styles.list} role="list">
        {digests.map((digest) => (
          <li key={digest.id}>
            <Link
              href={`/app/digests/${digest.id}`}
              className={styles.card}
              prefetch={true}
            >
              <article className={styles.cardContent}>
                <header className={styles.cardHeader}>
                  <time dateTime={digest.createdAt} className={styles.date}>
                    {formatDate(digest.createdAt)}
                  </time>
                  <span
                    className={`${styles.modeBadge} ${styles[`mode${digest.mode.charAt(0).toUpperCase()}${digest.mode.slice(1).replace("_", "")}`]}`}
                  >
                    {getModeLabel(digest.mode)}
                  </span>
                </header>

                <div className={styles.cardBody}>
                  <h3 className={styles.windowTitle}>
                    {formatTime(digest.windowStart)} -{" "}
                    {formatTime(digest.windowEnd)}
                  </h3>
                  <p className={styles.windowDescription}>
                    {formatWindowDescription(
                      digest.windowStart,
                      digest.windowEnd
                    )}
                  </p>
                </div>

                <footer className={styles.cardFooter}>
                  <div className={styles.stat}>
                    <span className={styles.statValue}>{digest.itemCount}</span>
                    <span className={styles.statLabel}>
                      {digest.itemCount === 1
                        ? t("digests.list.item")
                        : t("digests.list.items")}
                    </span>
                  </div>
                  <div className={styles.modeInfo}>
                    <span className={styles.modeDescription}>
                      {getModeDescription(digest.mode)}
                    </span>
                  </div>
                </footer>
              </article>
              <div className={styles.cardArrow} aria-hidden="true">
                <ChevronRightIcon />
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function DigestsListReaderSkeleton() {
  return (
    <div className={styles.container}>
      <ul className={styles.list} role="list" aria-busy="true">
        {Array.from({ length: 4 }).map((_, i) => (
          <li key={i}>
            <div className={styles.card} aria-hidden="true">
              <article className={styles.cardContent}>
                <header className={styles.cardHeader}>
                  <span
                    className={styles.skeleton}
                    style={{ width: "140px", height: "16px" }}
                  />
                  <span
                    className={styles.skeleton}
                    style={{ width: "80px", height: "24px" }}
                  />
                </header>

                <div className={styles.cardBody}>
                  <span
                    className={styles.skeleton}
                    style={{ width: "180px", height: "24px" }}
                  />
                  <span
                    className={styles.skeleton}
                    style={{ width: "100px", height: "16px", marginTop: "8px" }}
                  />
                </div>

                <footer className={styles.cardFooter}>
                  <span
                    className={styles.skeleton}
                    style={{ width: "60px", height: "32px" }}
                  />
                  <span
                    className={styles.skeleton}
                    style={{ width: "140px", height: "16px" }}
                  />
                </footer>
              </article>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ChevronRightIcon() {
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
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}
