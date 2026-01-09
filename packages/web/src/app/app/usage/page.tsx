"use client";

import { useEffect, useState } from "react";
import {
  type DailyUsage,
  getDailyUsage,
  getMonthlyUsage,
  type UsageByModel,
  type UsageByProvider,
  type UsageSummary,
} from "@/lib/api";
import styles from "./page.module.css";

function formatUsd(amount: number): string {
  if (amount < 0.01) return `$${amount.toFixed(6)}`;
  if (amount < 1) return `$${amount.toFixed(4)}`;
  return `$${amount.toFixed(2)}`;
}

function formatNumber(num: number): string {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toString();
}

export default function UsagePage() {
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [byProvider, setByProvider] = useState<UsageByProvider[]>([]);
  const [byModel, setByModel] = useState<UsageByModel[]>([]);
  const [daily, setDaily] = useState<DailyUsage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadUsage();
  }, [loadUsage]);

  async function loadUsage() {
    try {
      const [monthlyRes, dailyRes] = await Promise.all([getMonthlyUsage(), getDailyUsage(30)]);

      setSummary(monthlyRes.summary);
      setByProvider(monthlyRes.byProvider);
      setByModel(monthlyRes.byModel);
      setDaily(dailyRes.daily);
    } catch (err) {
      setError("Failed to load usage data");
      console.error("Failed to load usage:", err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className={styles.page}>
        <header className={styles.header}>
          <h1 className={styles.title}>Usage & Costs</h1>
        </header>
        <div className={styles.loading}>Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.page}>
        <header className={styles.header}>
          <h1 className={styles.title}>Usage & Costs</h1>
        </header>
        <div className={styles.error}>{error}</div>
      </div>
    );
  }

  const maxDailySpend = Math.max(...daily.map((d) => d.totalUsd), 0.01);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Usage & Costs</h1>
        <p className={styles.subtitle}>Track your LLM API usage and spending</p>
      </header>

      {/* Summary Cards */}
      <div className={styles.summaryGrid}>
        <div className={styles.summaryCard}>
          <div className={styles.cardHeader}>
            <span className={styles.cardLabel}>This Month</span>
            <DollarIcon />
          </div>
          <div className={styles.cardValue}>{formatUsd(summary?.totalUsd || 0)}</div>
          <div className={styles.cardSubtext}>Current month spend</div>
        </div>

        <div className={styles.summaryCard}>
          <div className={styles.cardHeader}>
            <span className={styles.cardLabel}>API Calls</span>
            <ZapIcon />
          </div>
          <div className={styles.cardValue}>{formatNumber(summary?.callCount || 0)}</div>
          <div className={styles.cardSubtext}>Total calls this month</div>
        </div>

        <div className={styles.summaryCard}>
          <div className={styles.cardHeader}>
            <span className={styles.cardLabel}>Input Tokens</span>
            <ArrowUpIcon />
          </div>
          <div className={styles.cardValue}>{formatNumber(summary?.totalInputTokens || 0)}</div>
          <div className={styles.cardSubtext}>Tokens sent to models</div>
        </div>

        <div className={styles.summaryCard}>
          <div className={styles.cardHeader}>
            <span className={styles.cardLabel}>Output Tokens</span>
            <ArrowDownIcon />
          </div>
          <div className={styles.cardValue}>{formatNumber(summary?.totalOutputTokens || 0)}</div>
          <div className={styles.cardSubtext}>Tokens generated</div>
        </div>
      </div>

      {/* Daily Usage Chart */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Daily Spend (Last 30 Days)</h2>
        <p className={styles.sectionSubtitle}>Your daily LLM API costs</p>
        <div className={styles.chart}>
          {daily.length === 0 ? (
            <div className={styles.emptyChart}>No usage data yet</div>
          ) : (
            daily.map((d) => (
              <div
                key={d.date}
                className={styles.chartBar}
                style={{ height: `${Math.max((d.totalUsd / maxDailySpend) * 100, 2)}%` }}
                title={`${new Date(d.date).toLocaleDateString()}: ${formatUsd(d.totalUsd)}`}
              />
            ))
          )}
        </div>
      </section>

      <div className={styles.breakdownGrid}>
        {/* By Provider */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Spend by Provider</h2>
          <p className={styles.sectionSubtitle}>Cost breakdown by LLM provider</p>
          {byProvider.length === 0 ? (
            <div className={styles.empty}>No usage data yet</div>
          ) : (
            <div className={styles.providerList}>
              {byProvider.map((p) => {
                const percentage = summary?.totalUsd ? (p.totalUsd / summary.totalUsd) * 100 : 0;
                return (
                  <div key={p.provider} className={styles.providerItem}>
                    <div className={styles.providerHeader}>
                      <span className={styles.providerName}>{p.provider}</span>
                      <span className={styles.providerValue}>
                        {formatUsd(p.totalUsd)} ({percentage.toFixed(0)}%)
                      </span>
                    </div>
                    <div className={styles.providerBarBg}>
                      <div className={styles.providerBar} style={{ width: `${percentage}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Top Models */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Top Models by Spend</h2>
          <p className={styles.sectionSubtitle}>Most expensive models this month</p>
          {byModel.length === 0 ? (
            <div className={styles.empty}>No usage data yet</div>
          ) : (
            <div className={styles.modelList}>
              {byModel.slice(0, 5).map((m) => (
                <div key={`${m.provider}-${m.model}`} className={styles.modelItem}>
                  <div className={styles.modelInfo}>
                    <span className={styles.modelName}>{m.model}</span>
                    <span className={styles.modelProvider}>{m.provider}</span>
                  </div>
                  <div className={styles.modelStats}>
                    <span className={styles.modelCost}>{formatUsd(m.totalUsd)}</span>
                    <span className={styles.modelCalls}>{formatNumber(m.callCount)} calls</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function DollarIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  );
}

function ZapIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

function ArrowUpIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <line x1="12" y1="19" x2="12" y2="5" />
      <polyline points="5 12 12 5 19 12" />
    </svg>
  );
}

function ArrowDownIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <polyline points="19 12 12 19 5 12" />
    </svg>
  );
}
