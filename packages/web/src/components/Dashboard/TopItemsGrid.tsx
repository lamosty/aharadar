"use client";

import Link from "next/link";
import type { Topic } from "@/lib/api";
import { useItems, useTopics } from "@/lib/hooks";
import { t } from "@/lib/i18n";
import styles from "./Dashboard.module.css";

/**
 * Horizontal grid of topic columns, each showing top items.
 * Replaces the vertical TopItemsWidget.
 */
export function TopItemsGrid() {
  const { data: topicsData, isLoading, error } = useTopics();
  const topics = topicsData?.topics ?? [];

  if (isLoading) {
    return (
      <div className={styles.topItemsGrid}>
        <div className={styles.gridLoading}>
          <Spinner />
          <span>{t("common.loading")}</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.topItemsGrid}>
        <div className={styles.gridError}>{t("common.error")}</div>
      </div>
    );
  }

  if (topics.length === 0) {
    return (
      <div className={styles.topItemsGrid}>
        <div className={styles.gridEmpty}>
          <p>{t("topics.emptyDescription")}</p>
          <Link href="/app/topics" className={styles.widgetLink}>
            {t("settings.topics.create")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.topItemsGrid}>
      {topics.map((topic) => (
        <TopicColumn key={topic.id} topic={topic} />
      ))}
    </div>
  );
}

interface TopicColumnProps {
  topic: Topic;
}

function TopicColumn({ topic }: TopicColumnProps) {
  const { data, isLoading, error } = useItems({ topicId: topic.id, limit: 5 });
  const items = data?.pages.flatMap((p) => p.items).slice(0, 5) ?? [];

  return (
    <div className={styles.topicColumn}>
      <div className={styles.topicColumnHeader}>
        <Link href={`/app/feed?topic=${topic.id}`} className={styles.topicColumnTitle}>
          {topic.name}
        </Link>
        <span className={styles.topicColumnProfile}>{topic.viewingProfile}</span>
      </div>

      {isLoading ? (
        <div className={styles.topicColumnLoading}>
          <Spinner />
        </div>
      ) : error ? (
        <div className={styles.topicColumnError}>{t("common.error")}</div>
      ) : items.length === 0 ? (
        <div className={styles.topicColumnEmpty}>No items yet</div>
      ) : (
        <ul className={styles.compactItemList}>
          {items.map((item) => (
            <li key={item.id} className={styles.compactItemRow}>
              <span className={styles.compactItemScore}>{Math.round(item.score * 100)}</span>
              <div className={styles.compactItemContent}>
                {item.item.url ? (
                  <a
                    href={item.item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.compactItemTitle}
                  >
                    {item.item.title || item.item.bodyText?.slice(0, 80) || "(Untitled)"}
                  </a>
                ) : (
                  <span className={styles.compactItemTitle}>
                    {item.item.title || item.item.bodyText?.slice(0, 80) || "(Untitled)"}
                  </span>
                )}
                <span className={styles.compactItemSource}>
                  {formatSourceType(item.item.sourceType)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function formatSourceType(type: string): string {
  const labels: Record<string, string> = {
    hn: "HN",
    reddit: "Reddit",
    rss: "RSS",
    youtube: "YouTube",
    x_posts: "X",
    signal: "Signal",
    arxiv: "arXiv",
    lobsters: "Lobste.rs",
  };
  return labels[type] || type.toUpperCase();
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
