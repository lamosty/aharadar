"use client";

import Link from "next/link";
import { useItems } from "@/lib/hooks";
import { t } from "@/lib/i18n";
import styles from "./Dashboard.module.css";

export function TopItemsWidget() {
  const { data, isLoading, error } = useItems({ limit: 5 });

  if (isLoading) {
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

  if (error) {
    return (
      <div className={styles.widget}>
        <h3 className={styles.widgetTitle}>{t("dashboard.topItems")}</h3>
        <div className={styles.widgetError}>{t("common.error")}</div>
      </div>
    );
  }

  const items = data?.pages.flatMap((p) => p.items) ?? [];

  if (items.length === 0) {
    return (
      <div className={styles.widget}>
        <h3 className={styles.widgetTitle}>{t("dashboard.topItems")}</h3>
        <div className={styles.widgetEmpty}>
          <p>{t("feed.emptyDescription")}</p>
          <Link href="/app/admin/run" className={styles.widgetLink}>
            {t("admin.cards.run.title")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.widget}>
      <div className={styles.widgetHeader}>
        <h3 className={styles.widgetTitle}>{t("dashboard.topItems")}</h3>
        <Link href="/app/feed" className={styles.viewAllLink}>
          {t("dashboard.viewAll")}
        </Link>
      </div>
      <ul className={styles.itemList}>
        {items.slice(0, 5).map((item) => (
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
