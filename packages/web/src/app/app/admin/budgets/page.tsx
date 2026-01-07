"use client";

import Link from "next/link";
import { t } from "@/lib/i18n";
import { useAdminBudgets } from "@/lib/hooks";
import styles from "./page.module.css";

function getProgressColor(used: number, limit: number): string {
  const percentage = (used / limit) * 100;
  if (percentage >= 95) return "var(--color-error)";
  if (percentage >= 80) return "var(--color-warning)";
  return "var(--color-success)";
}

function formatCredits(value: number): string {
  return value.toLocaleString();
}

export default function AdminBudgetsPage() {
  const { data, isLoading, isError, error } = useAdminBudgets();
  const budgets = data?.budgets ?? null;

  if (isLoading) {
    return (
      <div className={styles.page}>
        <header className={styles.header}>
          <Link href="/app/admin" className={styles.backLink}>
            <BackIcon />
            <span>{t("common.back")}</span>
          </Link>
          <h1 className={styles.title}>{t("admin.budgets.title")}</h1>
        </header>
        <div className={styles.loading}>
          <LoadingSpinner />
          <span>{t("common.loading")}</span>
        </div>
      </div>
    );
  }

  if (isError || !budgets) {
    return (
      <div className={styles.page}>
        <header className={styles.header}>
          <Link href="/app/admin" className={styles.backLink}>
            <BackIcon />
            <span>{t("common.back")}</span>
          </Link>
          <h1 className={styles.title}>{t("admin.budgets.title")}</h1>
        </header>
        <div className={styles.error}>
          <p>{error?.message || t("common.error")}</p>
        </div>
      </div>
    );
  }

  const monthlyPercentage = (budgets.monthlyUsed / budgets.monthlyLimit) * 100;
  const dailyPercentage =
    budgets.dailyUsed !== null && budgets.dailyLimit !== null
      ? (budgets.dailyUsed / budgets.dailyLimit) * 100
      : null;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/app/admin" className={styles.backLink}>
          <BackIcon />
          <span>{t("common.back")}</span>
        </Link>
        <h1 className={styles.title}>{t("admin.budgets.title")}</h1>
        <p className={styles.description}>{t("admin.budgets.description")}</p>
      </header>

      {/* Degraded Mode Banner */}
      {!budgets.paidCallsAllowed && (
        <div className={styles.degradedBanner} role="alert">
          <WarningIcon />
          <div className={styles.degradedContent}>
            <h2 className={styles.degradedTitle}>{t("admin.budgets.degradedMode")}</h2>
            <p className={styles.degradedDescription}>{t("admin.budgets.degradedModeDescription")}</p>
          </div>
        </div>
      )}

      <div className={styles.budgetCards}>
        {/* Monthly Budget Card */}
        <div className={styles.budgetCard}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>{t("admin.budgets.monthly")}</h2>
            {budgets.warningLevel !== "none" && monthlyPercentage >= 80 && (
              <span
                className={`${styles.warningBadge} ${budgets.warningLevel === "critical" ? styles.warningCritical : styles.warningApproaching}`}
              >
                {budgets.warningLevel === "critical"
                  ? t("admin.budgets.warningCritical")
                  : t("admin.budgets.warningApproaching")}
              </span>
            )}
          </div>

          <div className={styles.progressContainer}>
            <div className={styles.progressBar}>
              <div
                className={styles.progressFill}
                style={{
                  width: `${Math.min(monthlyPercentage, 100)}%`,
                  backgroundColor: getProgressColor(budgets.monthlyUsed, budgets.monthlyLimit),
                }}
              />
            </div>
            <span className={styles.progressPercentage}>{monthlyPercentage.toFixed(1)}%</span>
          </div>

          <div className={styles.stats}>
            <div className={styles.stat}>
              <span className={styles.statLabel}>{t("admin.budgets.used")}</span>
              <span className={styles.statValue}>{formatCredits(budgets.monthlyUsed)}</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statLabel}>{t("admin.budgets.limit")}</span>
              <span className={styles.statValue}>{formatCredits(budgets.monthlyLimit)}</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statLabel}>{t("admin.budgets.remaining")}</span>
              <span className={styles.statValue}>{formatCredits(budgets.monthlyRemaining)}</span>
            </div>
          </div>
        </div>

        {/* Daily Budget Card */}
        <div className={styles.budgetCard}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>{t("admin.budgets.daily")}</h2>
            {budgets.dailyLimit !== null &&
              budgets.dailyUsed !== null &&
              dailyPercentage !== null &&
              dailyPercentage >= 80 && (
                <span
                  className={`${styles.warningBadge} ${dailyPercentage >= 95 ? styles.warningCritical : styles.warningApproaching}`}
                >
                  {dailyPercentage >= 95
                    ? t("admin.budgets.warningCritical")
                    : t("admin.budgets.warningApproaching")}
                </span>
              )}
          </div>

          {budgets.dailyLimit !== null ? (
            <>
              <div className={styles.progressContainer}>
                <div className={styles.progressBar}>
                  <div
                    className={styles.progressFill}
                    style={{
                      width: `${Math.min(dailyPercentage ?? 0, 100)}%`,
                      backgroundColor: getProgressColor(budgets.dailyUsed ?? 0, budgets.dailyLimit),
                    }}
                  />
                </div>
                <span className={styles.progressPercentage}>{dailyPercentage?.toFixed(1)}%</span>
              </div>

              <div className={styles.stats}>
                <div className={styles.stat}>
                  <span className={styles.statLabel}>{t("admin.budgets.used")}</span>
                  <span className={styles.statValue}>{formatCredits(budgets.dailyUsed ?? 0)}</span>
                </div>
                <div className={styles.stat}>
                  <span className={styles.statLabel}>{t("admin.budgets.limit")}</span>
                  <span className={styles.statValue}>{formatCredits(budgets.dailyLimit)}</span>
                </div>
                <div className={styles.stat}>
                  <span className={styles.statLabel}>{t("admin.budgets.remaining")}</span>
                  <span className={styles.statValue}>{formatCredits(budgets.dailyRemaining ?? 0)}</span>
                </div>
              </div>
            </>
          ) : (
            <div className={styles.notConfigured}>
              <p>{t("admin.budgets.notConfigured")}</p>
            </div>
          )}
        </div>

        {/* Paid Calls Status Card */}
        <div className={styles.statusCard}>
          <h2 className={styles.cardTitle}>{t("admin.budgets.paidCalls")}</h2>
          <div className={styles.statusIndicator}>
            <span
              className={`${styles.statusDot} ${budgets.paidCallsAllowed ? styles.statusAllowed : styles.statusBlocked}`}
            />
            <span className={styles.statusText}>
              {budgets.paidCallsAllowed ? t("admin.budgets.allowed") : t("admin.budgets.blocked")}
            </span>
          </div>
        </div>
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

function WarningIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
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
