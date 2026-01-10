"use client";

import { useIsAdmin } from "@/components/AuthProvider";
import {
  BudgetWidget,
  EngagementChart,
  RecentDigestsWidget,
  SpendingChart,
  TopItemsGrid,
} from "@/components/Dashboard";
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

      {/* Row 1: Top Items per Topic (horizontal columns) */}
      <section className={styles.section}>
        <TopItemsGrid />
      </section>

      {/* Row 2: Charts (Engagement + Spending) */}
      <section className={styles.section}>
        <div className={styles.chartsRow}>
          <EngagementChart />
          {isAdmin && <SpendingChart />}
        </div>
      </section>

      {/* Row 3: Status Widgets (Recent Digests + Budget) */}
      <section className={styles.section}>
        <div className={styles.statusRow}>
          <RecentDigestsWidget />
          {isAdmin && <BudgetWidget />}
        </div>
      </section>
    </div>
  );
}
