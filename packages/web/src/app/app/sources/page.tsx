"use client";

import Link from "next/link";
import { t } from "@/lib/i18n";
import { useAdminSources } from "@/lib/hooks";
import styles from "./page.module.css";

export default function SourcesPage() {
  const { data, isLoading, isError, error } = useAdminSources();
  const sources = data?.sources ?? [];

  const enabledSources = sources.filter((s) => s.isEnabled);
  const disabledSources = sources.filter((s) => !s.isEnabled);

  if (isLoading) {
    return (
      <div className={styles.page}>
        <header className={styles.header}>
          <h1 className={styles.title}>{t("nav.sources")}</h1>
        </header>
        <div className={styles.loading}>
          <LoadingSpinner />
          <span>{t("common.loading")}</span>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className={styles.page}>
        <header className={styles.header}>
          <h1 className={styles.title}>{t("nav.sources")}</h1>
        </header>
        <div className={styles.error}>
          <p>{error?.message || t("common.error")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>{t("nav.sources")}</h1>
        <p className={styles.subtitle}>
          {enabledSources.length} active, {disabledSources.length} disabled
        </p>
        <Link href="/app/admin/sources" className={styles.manageLink}>
          Manage Sources
        </Link>
      </header>

      {sources.length === 0 ? (
        <div className={styles.empty}>
          <SourcesIcon />
          <p>{t("admin.sources.noSources")}</p>
          <Link href="/app/admin/sources" className={styles.addButton}>
            {t("admin.sources.addSource")}
          </Link>
        </div>
      ) : (
        <div className={styles.sourcesList}>
          {enabledSources.length > 0 && (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>Active Sources</h2>
              <div className={styles.grid}>
                {enabledSources.map((source) => (
                  <div key={source.id} className={styles.sourceCard}>
                    <div className={styles.sourceHeader}>
                      <span className={styles.sourceType}>{source.type}</span>
                      <span className={styles.statusBadge} data-status="enabled">
                        {t("common.enabled")}
                      </span>
                    </div>
                    <h3 className={styles.sourceName}>{source.name}</h3>
                    <div className={styles.sourceStats}>
                      <div className={styles.stat}>
                        <span className={styles.statLabel}>Interval</span>
                        <span className={styles.statValue}>
                          {source.config.cadence?.every_minutes ?? "-"} min
                        </span>
                      </div>
                      <div className={styles.stat}>
                        <span className={styles.statLabel}>Weight</span>
                        <span className={styles.statValue}>
                          {source.config.weight?.toFixed(1) ?? "1.0"}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {disabledSources.length > 0 && (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>Disabled Sources</h2>
              <div className={styles.grid}>
                {disabledSources.map((source) => (
                  <div key={source.id} className={`${styles.sourceCard} ${styles.disabled}`}>
                    <div className={styles.sourceHeader}>
                      <span className={styles.sourceType}>{source.type}</span>
                      <span className={styles.statusBadge} data-status="disabled">
                        {t("common.disabled")}
                      </span>
                    </div>
                    <h3 className={styles.sourceName}>{source.name}</h3>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function SourcesIcon() {
  return (
    <svg
      width="48"
      height="48"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="2" />
      <path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14" />
    </svg>
  );
}

function LoadingSpinner() {
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
      aria-hidden="true"
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}
