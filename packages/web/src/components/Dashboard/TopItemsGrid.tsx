"use client";

import Link from "next/link";
import { useState } from "react";
import type { FeedItem, FeedView, Topic } from "@/lib/api";
import { useItems, useTopics } from "@/lib/hooks";
import { t } from "@/lib/i18n";
import styles from "./Dashboard.module.css";

type ViewOption = FeedView;

const VIEW_OPTIONS: { value: ViewOption; label: string }[] = [
  { value: "inbox", label: "Unprocessed" },
  { value: "all", label: "All" },
];

/**
 * Horizontal grid of topic columns, each showing top items.
 * Includes a view toggle for filtering items.
 */
export function TopItemsGrid() {
  const [view, setView] = useState<ViewOption>("inbox");
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
    <div>
      <div className={styles.gridHeader}>
        <h3 className={styles.gridTitle}>Top Items</h3>
        <div className={styles.viewToggle}>
          {VIEW_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={styles.viewToggleButton}
              data-active={view === opt.value}
              onClick={() => setView(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
      <div className={styles.topItemsGrid}>
        {topics.map((topic) => (
          <TopicColumn key={topic.id} topic={topic} view={view} />
        ))}
      </div>
    </div>
  );
}

interface TopicColumnProps {
  topic: Topic;
  view: FeedView;
}

function TopicColumn({ topic, view }: TopicColumnProps) {
  const { data, isLoading, error } = useItems({ topicId: topic.id, limit: 5, view });
  const items = data?.pages.flatMap((p) => p.items).slice(0, 5) ?? [];

  return (
    <div className={styles.topicColumn}>
      <div className={styles.topicColumnHeader}>
        <Link href={`/app/feed?topic=${topic.id}&view=${view}`} className={styles.topicColumnTitle}>
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
        <div className={styles.topicColumnEmpty}>
          {view === "inbox" ? "All caught up!" : "No items yet"}
        </div>
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
                <span className={styles.compactItemSource}>{formatSource(item)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Format source label with additional context (e.g., subreddit for Reddit).
 */
function formatSource(item: FeedItem): string {
  const type = item.item.sourceType;
  const metadata = item.item.metadata;

  // Reddit: show subreddit name
  if (type === "reddit" && metadata?.subreddit) {
    return `r/${metadata.subreddit}`;
  }

  // X posts: show author display name if available
  if (type === "x_posts" && metadata?.user_display_name) {
    return `X @${metadata.user_display_name}`;
  }

  // Fallback to type labels
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
