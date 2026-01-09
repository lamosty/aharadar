"use client";

import { useIsAdmin } from "@/components/AuthProvider";
import { BudgetWidget, TopItemsWidget, TopicOverviewWidget } from "@/components/Dashboard";
import { t } from "@/lib/i18n";
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
