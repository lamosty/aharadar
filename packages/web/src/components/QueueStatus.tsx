"use client";

import { useQueueStatus } from "@/lib/hooks";
import { t } from "@/lib/i18n";
import styles from "./QueueStatus.module.css";

/**
 * Shows pipeline job queue status.
 * Displays active and waiting jobs with their details.
 */
export function QueueStatus() {
  const { data, isLoading, isError } = useQueueStatus();

  // Don't show anything if no jobs in queue
  if (isLoading || isError || !data) {
    return null;
  }

  const { active, waiting, counts } = data.queue;
  const totalJobs = counts.active + counts.waiting;

  if (totalJobs === 0) {
    return null;
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.icon}>
          <SpinnerIcon />
        </span>
        <span className={styles.title}>
          {counts.active > 0
            ? t("queue.running", { count: counts.active })
            : t("queue.waiting", { count: counts.waiting })}
        </span>
      </div>

      {active.length > 0 && (
        <div className={styles.jobs}>
          {active.map((job) => (
            <div key={job.id ?? job.timestamp} className={styles.job}>
              <span className={styles.jobMode}>{job.data.mode}</span>
              <span className={styles.jobTime}>
                {formatTimeRange(job.data.windowStart, job.data.windowEnd)}
              </span>
            </div>
          ))}
        </div>
      )}

      {waiting.length > 0 && counts.waiting <= 3 && (
        <div className={styles.waitingLabel}>
          +{counts.waiting} {t("queue.queued")}
        </div>
      )}
    </div>
  );
}

function formatTimeRange(start: string, end: string): string {
  const startDate = new Date(start);
  const endDate = new Date(end);

  const formatTime = (d: Date) =>
    d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

  const formatDate = (d: Date) =>
    d.toLocaleDateString(undefined, { month: "short", day: "numeric" });

  // Same day
  if (startDate.toDateString() === endDate.toDateString()) {
    return `${formatDate(startDate)} ${formatTime(startDate)} - ${formatTime(endDate)}`;
  }

  return `${formatDate(startDate)} - ${formatDate(endDate)}`;
}

function SpinnerIcon() {
  return (
    <svg
      className={styles.spinner}
      width="16"
      height="16"
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
