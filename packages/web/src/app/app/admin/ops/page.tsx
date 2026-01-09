"use client";

import Link from "next/link";
import { useOpsStatus } from "@/lib/hooks";
import { t } from "@/lib/i18n";
import styles from "./page.module.css";

export default function AdminOpsPage() {
  const { data, isLoading, isError, error } = useOpsStatus();

  if (isLoading) {
    return (
      <div className={styles.page}>
        <header className={styles.header}>
          <Link href="/app/admin" className={styles.backLink}>
            <BackIcon />
            <span>{t("common.back")}</span>
          </Link>
          <h1 className={styles.title}>{t("admin.ops.title")}</h1>
        </header>
        <div className={styles.loading}>
          <LoadingSpinner />
          <span>{t("common.loading")}</span>
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className={styles.page}>
        <header className={styles.header}>
          <Link href="/app/admin" className={styles.backLink}>
            <BackIcon />
            <span>{t("common.back")}</span>
          </Link>
          <h1 className={styles.title}>{t("admin.ops.title")}</h1>
        </header>
        <div className={styles.error}>
          <p>{error?.message || t("common.error")}</p>
        </div>
      </div>
    );
  }

  const { worker, queue, links } = data;
  const hasAnyLinks = links.grafana || links.prometheus || links.queue || links.logs;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/app/admin" className={styles.backLink}>
          <BackIcon />
          <span>{t("common.back")}</span>
        </Link>
        <h1 className={styles.title}>{t("admin.ops.title")}</h1>
        <p className={styles.description}>{t("admin.ops.description")}</p>
      </header>

      <div className={styles.grid}>
        {/* Worker Status Card */}
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>{t("admin.ops.worker.title")}</h2>
          <div className={styles.statusRow}>
            <div
              className={`${styles.statusIndicator} ${worker.ok ? styles.statusUp : styles.statusDown}`}
            />
            <span className={styles.statusText}>
              {worker.ok ? t("admin.ops.worker.up") : t("admin.ops.worker.down")}
            </span>
          </div>
          {worker.ok && (
            <div className={styles.details}>
              {worker.startedAt && (
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>{t("admin.ops.worker.startedAt")}</span>
                  <span className={styles.detailValue}>
                    {new Date(worker.startedAt).toLocaleString()}
                  </span>
                </div>
              )}
              {worker.lastSchedulerTickAt && (
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>{t("admin.ops.worker.lastTick")}</span>
                  <span className={styles.detailValue}>
                    {new Date(worker.lastSchedulerTickAt).toLocaleString()}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Queue Status Card */}
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>{t("admin.ops.queue.title")}</h2>
          <div className={styles.queueStats}>
            <div className={styles.queueStat}>
              <span className={styles.queueValue}>{queue.active}</span>
              <span className={styles.queueLabel}>{t("admin.ops.queue.active")}</span>
            </div>
            <div className={styles.queueStat}>
              <span className={styles.queueValue}>{queue.waiting}</span>
              <span className={styles.queueLabel}>{t("admin.ops.queue.waiting")}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tools Section */}
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>{t("admin.ops.links.title")}</h2>
        {hasAnyLinks ? (
          <div className={styles.linksGrid}>
            {links.grafana && (
              <a
                href={links.grafana}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.linkCard}
              >
                <GrafanaIcon />
                <span>{t("admin.ops.links.grafana")}</span>
                <ExternalIcon />
              </a>
            )}
            {links.prometheus && (
              <a
                href={links.prometheus}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.linkCard}
              >
                <PrometheusIcon />
                <span>{t("admin.ops.links.prometheus")}</span>
                <ExternalIcon />
              </a>
            )}
            {links.queue && (
              <a
                href={links.queue}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.linkCard}
              >
                <QueueIcon />
                <span>{t("admin.ops.links.queue")}</span>
                <ExternalIcon />
              </a>
            )}
            {links.logs && (
              <a
                href={links.logs}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.linkCard}
              >
                <LogsIcon />
                <span>{t("admin.ops.links.logs")}</span>
                <ExternalIcon />
              </a>
            )}
          </div>
        ) : (
          <p className={styles.notConfigured}>{t("admin.ops.links.notConfigured")}</p>
        )}
      </div>
    </div>
  );
}

function BackIcon() {
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
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
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

function GrafanaIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="M3 3v18h18" />
      <path d="M18 17V9" />
      <path d="M13 17V5" />
      <path d="M8 17v-3" />
    </svg>
  );
}

function PrometheusIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </svg>
  );
}

function QueueIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="4" rx="1" />
      <rect x="3" y="10" width="18" height="4" rx="1" />
      <rect x="3" y="16" width="18" height="4" rx="1" />
    </svg>
  );
}

function LogsIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  );
}

function ExternalIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
      className={styles.externalIcon}
    >
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}
