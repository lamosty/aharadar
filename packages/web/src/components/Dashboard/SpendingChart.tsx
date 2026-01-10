"use client";

import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useDailyUsage, useMonthlyUsage } from "@/lib/hooks";
import { t } from "@/lib/i18n";
import styles from "./Dashboard.module.css";

/**
 * Area chart showing daily spending over time with monthly summary.
 */
export function SpendingChart() {
  const { data: dailyData, isLoading: dailyLoading, error: dailyError } = useDailyUsage(30);
  const { data: monthlyData, isLoading: monthlyLoading } = useMonthlyUsage();

  const isLoading = dailyLoading || monthlyLoading;
  const error = dailyError;

  if (isLoading) {
    return (
      <div className={styles.widget}>
        <h3 className={styles.widgetTitle}>Spending</h3>
        <div className={styles.chartLoading}>
          <Spinner />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.widget}>
        <h3 className={styles.widgetTitle}>Spending</h3>
        <div className={styles.widgetError}>{t("common.error")}</div>
      </div>
    );
  }

  const chartData =
    dailyData?.daily?.map((d) => ({
      date: formatDate(d.date),
      cost: d.totalUsd,
    })) ?? [];

  const monthlyTotal = monthlyData?.summary?.totalUsd ?? 0;
  const todayCost = chartData.length > 0 ? chartData[chartData.length - 1].cost : 0;

  return (
    <div className={styles.widget}>
      <div className={styles.widgetHeader}>
        <h3 className={styles.widgetTitle}>Spending (30 days)</h3>
      </div>

      <div className={styles.spendingSummary}>
        <div className={styles.spendingStat}>
          <span className={styles.spendingLabel}>Today</span>
          <span className={styles.spendingValue}>${todayCost.toFixed(2)}</span>
        </div>
        <div className={styles.spendingStat}>
          <span className={styles.spendingLabel}>This Month</span>
          <span className={styles.spendingValue}>${monthlyTotal.toFixed(2)}</span>
        </div>
      </div>

      <div className={styles.chartContainer}>
        <ResponsiveContainer width="100%" height={120}>
          <AreaChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
            <defs>
              <linearGradient id="costGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
            />
            <YAxis hide />
            <Tooltip
              formatter={(value) => [`$${Number(value).toFixed(3)}`, "Cost"]}
              contentStyle={{
                background: "var(--color-surface-elevated)",
                border: "1px solid var(--color-border-subtle)",
                borderRadius: "var(--radius-md)",
                fontSize: "12px",
              }}
            />
            <Area
              type="monotone"
              dataKey="cost"
              stroke="var(--color-primary)"
              strokeWidth={2}
              fill="url(#costGradient)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
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
