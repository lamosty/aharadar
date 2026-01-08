"use client";

import Link from "next/link";
import { useTopics } from "@/lib/hooks";
import { t } from "@/lib/i18n";
import styles from "./Dashboard.module.css";

export function TopicOverviewWidget() {
  const { data, isLoading, error } = useTopics();

  if (isLoading) {
    return (
      <div className={styles.widget}>
        <h3 className={styles.widgetTitle}>{t("dashboard.topics")}</h3>
        <div className={styles.loading}>
          <Spinner />
          <span>{t("common.loading")}</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.widget}>
        <h3 className={styles.widgetTitle}>{t("dashboard.topics")}</h3>
        <div className={styles.widgetError}>{t("common.error")}</div>
      </div>
    );
  }

  const topics = data?.topics ?? [];

  if (topics.length === 0) {
    return (
      <div className={styles.widget}>
        <h3 className={styles.widgetTitle}>{t("dashboard.topics")}</h3>
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
      <div className={styles.widgetHeader}>
        <h3 className={styles.widgetTitle}>{t("dashboard.topics")}</h3>
        <Link href="/app/topics" className={styles.viewAllLink}>
          {t("dashboard.viewAll")}
        </Link>
      </div>
      <div className={styles.topicGrid}>
        {topics.slice(0, 4).map((topic) => (
          <Link key={topic.id} href={`/app/feed?topic=${topic.id}`} className={styles.topicItem}>
            <span className={styles.topicName}>{topic.name}</span>
            <span className={styles.topicProfile}>{topic.viewingProfile}</span>
          </Link>
        ))}
      </div>
    </div>
  );
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
