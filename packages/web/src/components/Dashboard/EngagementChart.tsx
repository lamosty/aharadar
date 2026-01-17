"use client";

import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useFeedbackDailyStats } from "@/lib/hooks";
import { t } from "@/lib/i18n";
import styles from "./Dashboard.module.css";

/**
 * Line chart showing engagement (likes, saves, dislikes, skips) over time.
 */
export function EngagementChart() {
  const { data, isLoading, error } = useFeedbackDailyStats(30);

  if (isLoading) {
    return (
      <div className={styles.widget}>
        <h3 className={styles.widgetTitle}>Engagement</h3>
        <div className={styles.chartLoading}>
          <Spinner />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.widget}>
        <h3 className={styles.widgetTitle}>Engagement</h3>
        <div className={styles.widgetError}>{t("common.error")}</div>
      </div>
    );
  }

  const chartData =
    data?.daily?.map((d) => ({
      date: formatDate(d.date),
      likes: d.likes,
      dislikes: d.dislikes,
      skips: d.skips,
    })) ?? [];

  // Calculate totals for summary
  const totals = chartData.reduce(
    (acc, d) => ({
      likes: acc.likes + d.likes,
      dislikes: acc.dislikes + d.dislikes,
      skips: acc.skips + d.skips,
    }),
    { likes: 0, dislikes: 0, skips: 0 },
  );

  const hasData = totals.likes + totals.dislikes + totals.skips > 0;

  return (
    <div className={styles.widget}>
      <div className={styles.widgetHeader}>
        <h3 className={styles.widgetTitle}>Engagement (30 days)</h3>
      </div>

      {!hasData ? (
        <div className={styles.chartEmpty}>
          <p>No feedback data yet</p>
          <span className={styles.chartEmptyHint}>Like or dislike items to see trends here</span>
        </div>
      ) : (
        <>
          <div className={styles.chartContainer}>
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis hide />
                <Tooltip
                  contentStyle={{
                    background: "var(--color-surface-elevated)",
                    border: "1px solid var(--color-border-subtle)",
                    borderRadius: "var(--radius-md)",
                    fontSize: "12px",
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="likes"
                  stroke="var(--color-success)"
                  strokeWidth={2}
                  dot={false}
                  name="Likes"
                />
                <Line
                  type="monotone"
                  dataKey="dislikes"
                  stroke="var(--color-error)"
                  strokeWidth={2}
                  dot={false}
                  name="Dislikes"
                />
                <Line
                  type="monotone"
                  dataKey="skips"
                  stroke="var(--color-text-muted)"
                  strokeWidth={1}
                  dot={false}
                  name="Skips"
                  strokeDasharray="3 3"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className={styles.chartLegend}>
            <span className={styles.legendItem}>
              <span className={styles.legendDot} style={{ background: "var(--color-success)" }} />
              Likes: {totals.likes}
            </span>
            <span className={styles.legendItem}>
              <span className={styles.legendDot} style={{ background: "var(--color-error)" }} />
              Dislikes: {totals.dislikes}
            </span>
          </div>
        </>
      )}
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
