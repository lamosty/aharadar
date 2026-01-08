"use client";

import { t } from "@/lib/i18n";
import { useIsAdmin } from "@/components/AuthProvider";
import { TopicOverviewWidget, TopItemsWidget, BudgetWidget } from "@/components/Dashboard";
import styles from "./page.module.css";

export default function DashboardPage() {
  const isAdmin = useIsAdmin();

  return (
    <div className={styles.dashboard}>
      <header className={styles.header}>
        <h1 className={styles.title}>{t("dashboard.title")}</h1>
        <p className={styles.welcome}>{t("dashboard.welcome")}</p>
      </header>

      <div className={styles.widgetGrid}>
        <TopicOverviewWidget />
        <TopItemsWidget />
        {isAdmin && <BudgetWidget />}
      </div>
    </div>
  );
}
