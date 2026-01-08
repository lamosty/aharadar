"use client";

import Link from "next/link";
import { useAdminBudgets } from "@/lib/hooks";
import { t } from "@/lib/i18n";
import styles from "./Dashboard.module.css";

export function BudgetWidget() {
  const { data, isLoading, error } = useAdminBudgets();

  if (isLoading) {
    return (
      <div className={styles.widget}>
        <h3 className={styles.widgetTitle}>{t("admin.budgets.title")}</h3>
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
        <h3 className={styles.widgetTitle}>{t("admin.budgets.title")}</h3>
        <div className={styles.widgetError}>{t("common.error")}</div>
      </div>
    );
  }

  const budgets = data?.budgets;
  if (!budgets) return null;

  const monthlyPercent = budgets.monthlyLimit > 0 ? (budgets.monthlyUsed / budgets.monthlyLimit) * 100 : 0;
  const dailyLimit = budgets.dailyLimit ?? 0;
  const dailyUsed = budgets.dailyUsed ?? 0;
  const dailyPercent = dailyLimit > 0 ? (dailyUsed / dailyLimit) * 100 : 0;

  const getBarColor = (percent: number) => {
    if (percent >= 90) return "var(--color-error)";
    if (percent >= 70) return "var(--color-warning)";
    return "var(--color-success)";
  };

  return (
    <div className={styles.widget}>
      <div className={styles.widgetHeader}>
        <h3 className={styles.widgetTitle}>{t("admin.budgets.title")}</h3>
        <Link href="/app/admin/budgets" className={styles.viewAllLink}>
          {t("dashboard.viewAll")}
        </Link>
      </div>

      <div className={styles.budgetSection}>
        <div className={styles.budgetRow}>
          <span className={styles.budgetLabel}>{t("admin.budgets.monthly")}</span>
          <span className={styles.budgetValue}>
            {budgets.monthlyUsed.toLocaleString()} / {budgets.monthlyLimit.toLocaleString()}
          </span>
        </div>
        <div className={styles.progressBar}>
          <div
            className={styles.progressFill}
            style={{
              width: `${Math.min(100, monthlyPercent)}%`,
              backgroundColor: getBarColor(monthlyPercent),
            }}
          />
        </div>
      </div>

      <div className={styles.budgetSection}>
        <div className={styles.budgetRow}>
          <span className={styles.budgetLabel}>{t("admin.budgets.daily")}</span>
          <span className={styles.budgetValue}>
            {dailyUsed.toLocaleString()} / {dailyLimit.toLocaleString()}
          </span>
        </div>
        <div className={styles.progressBar}>
          <div
            className={styles.progressFill}
            style={{
              width: `${Math.min(100, dailyPercent)}%`,
              backgroundColor: getBarColor(dailyPercent),
            }}
          />
        </div>
      </div>

      {!budgets.paidCallsAllowed && (
        <div className={styles.degradedBanner}>{t("admin.budgets.degradedMode")}</div>
      )}
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
