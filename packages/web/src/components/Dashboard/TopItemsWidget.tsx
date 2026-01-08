"use client";

import { useState } from "react";
import Link from "next/link";
import { useItems, useTopics } from "@/lib/hooks";
import { t } from "@/lib/i18n";
import { type Topic } from "@/lib/api";
import styles from "./Dashboard.module.css";

export function TopItemsWidget() {
  const { data: topicsData, isLoading: topicsLoading, error: topicsError } = useTopics();
  const topics = topicsData?.topics ?? [];

  if (topicsLoading) {
    return (
      <div className={styles.widget}>
        <h3 className={styles.widgetTitle}>{t("dashboard.topItems")}</h3>
        <div className={styles.loading}>
          <Spinner />
          <span>{t("common.loading")}</span>
        </div>
      </div>
    );
  }

  if (topicsError) {
    return (
      <div className={styles.widget}>
        <h3 className={styles.widgetTitle}>{t("dashboard.topItems")}</h3>
        <div className={styles.widgetError}>{t("common.error")}</div>
      </div>
    );
  }

  if (topics.length === 0) {
    return (
      <div className={styles.widget}>
        <h3 className={styles.widgetTitle}>{t("dashboard.topItems")}</h3>
        <div className={styles.widgetEmpty}>
          <p>{t("topics.emptyDescription")}</p>
          <Link href="/app/topics" className={styles.widgetLink}>
            {t("settings.topics.create")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.widget}>
      <h3 className={styles.widgetTitle}>{t("dashboard.topItems")}</h3>
      <div className={styles.topicSections}>
        {topics.map((topic) => (
          <TopicItemsSection key={topic.id} topic={topic} />
        ))}
      </div>
    </div>
  );
}

interface TopicItemsSectionProps {
  topic: Topic;
}

function TopicItemsSection({ topic }: TopicItemsSectionProps) {
  const [expanded, setExpanded] = useState(false);
  const limit = expanded ? 10 : 5;

  const { data, isLoading, error } = useItems({ topicId: topic.id, limit: 10 });
  const allItems = data?.pages.flatMap((p) => p.items) ?? [];
  const items = allItems.slice(0, limit);
  const hasMore = allItems.length > 5;

  return (
    <div className={styles.topicSection}>
      <div className={styles.topicSectionHeader}>
        <Link href={`/app/feed?topic=${topic.id}`} className={styles.topicSectionTitle}>
          {topic.name}
        </Link>
        <span className={styles.topicSectionProfile}>{topic.viewingProfile}</span>
      </div>

      {isLoading ? (
        <div className={styles.topicSectionLoading}>
          <Spinner />
        </div>
      ) : error ? (
        <div className={styles.topicSectionError}>{t("common.error")}</div>
      ) : items.length === 0 ? (
        <div className={styles.topicSectionEmpty}>No items yet</div>
      ) : (
        <>
          <ul className={styles.itemList}>
            {items.map((item) => (
              <li key={item.id} className={styles.itemRow}>
                <span className={styles.itemScore}>{Math.round(item.score * 100)}</span>
                <div className={styles.itemContent}>
                  {item.item.url ? (
                    <a
                      href={item.item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.itemTitle}
                    >
                      {item.item.title || item.item.bodyText?.slice(0, 100) || "(Untitled)"}
                    </a>
                  ) : (
                    <span className={styles.itemTitle}>
                      {item.item.title || item.item.bodyText?.slice(0, 100) || "(Untitled)"}
                    </span>
                  )}
                  <span className={styles.itemSource}>{formatSourceType(item.item.sourceType)}</span>
                </div>
              </li>
            ))}
          </ul>
          {hasMore && !expanded && (
            <button
              type="button"
              className={styles.showMoreButton}
              onClick={() => setExpanded(true)}
            >
              Show more
            </button>
          )}
          {expanded && (
            <button
              type="button"
              className={styles.showMoreButton}
              onClick={() => setExpanded(false)}
            >
              Show less
            </button>
          )}
        </>
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
