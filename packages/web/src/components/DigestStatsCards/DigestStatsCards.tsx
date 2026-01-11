/**
 * DigestStatsCards - Analytics stat cards for digests page.
 *
 * Displays 3 stat cards showing volume, quality, and cost metrics
 * with trends compared to the previous period.
 */

import { Skeleton } from "@/components/Skeleton";
import styles from "./DigestStatsCards.module.css";

interface DigestStatsCardsProps {
  stats: {
    totalItems: number;
    digestCount: number;
    avgItemsPerDigest: number;
    avgTopScore: number;
    triageBreakdown: { high: number; medium: number; low: number; skip: number };
    totalCredits: number;
    avgCreditsPerDigest: number;
    creditsByMode: { low: number; normal: number; high: number };
  };
  previousPeriod: {
    totalItems: number;
    digestCount: number;
    avgTopScore: number;
    totalCredits: number;
  };
  isLoading?: boolean;
}

/**
 * Format number with commas.
 */
function formatNumber(value: number): string {
  return value.toLocaleString("en-US");
}

/**
 * Format number as currency.
 */
function formatCurrency(value: number): string {
  return `$${value.toFixed(2)}`;
}

/**
 * Calculate percentage change between current and previous value.
 */
function calcPercentChange(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : null;
  return ((current - previous) / previous) * 100;
}

/**
 * Trend indicator with arrow and percentage.
 */
function TrendIndicator({
  percentChange,
  inverse = false,
}: {
  percentChange: number | null;
  inverse?: boolean;
}) {
  if (percentChange === null) {
    return <span className={styles.trendNeutral}>--</span>;
  }

  const isPositive = percentChange > 0;
  const isNegative = percentChange < 0;

  // For inverse metrics (like cost), negative is good
  const isGood = inverse ? isNegative : isPositive;
  const isBad = inverse ? isPositive : isNegative;

  const trendClass = isGood ? styles.trendUp : isBad ? styles.trendDown : styles.trendNeutral;
  const arrow = isPositive ? "\u2191" : isNegative ? "\u2193" : "";
  const displayValue = Math.abs(percentChange).toFixed(1);

  return (
    <span className={trendClass}>
      {arrow} {displayValue}%
    </span>
  );
}

/**
 * Mini donut chart for triage breakdown using conic-gradient.
 */
function TriageDonut({
  breakdown,
}: {
  breakdown: { high: number; medium: number; low: number; skip: number };
}) {
  const total = breakdown.high + breakdown.medium + breakdown.low + breakdown.skip;

  if (total === 0) {
    return (
      <div className={styles.donutContainer}>
        <div className={styles.donutEmpty}>No data</div>
      </div>
    );
  }

  const highPct = (breakdown.high / total) * 100;
  const mediumPct = (breakdown.medium / total) * 100;
  const lowPct = (breakdown.low / total) * 100;
  const skipPct = (breakdown.skip / total) * 100;

  // Build conic-gradient stops
  const stops = [
    `var(--color-success) 0% ${highPct}%`,
    `var(--color-warning) ${highPct}% ${highPct + mediumPct}%`,
    `var(--color-primary) ${highPct + mediumPct}% ${highPct + mediumPct + lowPct}%`,
    `var(--color-text-muted) ${highPct + mediumPct + lowPct}% 100%`,
  ].join(", ");

  return (
    <div className={styles.donutContainer}>
      <div
        className={styles.donut}
        style={{ background: `conic-gradient(${stops})` }}
        role="img"
        aria-label={`Triage breakdown: ${highPct.toFixed(0)}% high, ${mediumPct.toFixed(0)}% medium, ${lowPct.toFixed(0)}% low, ${skipPct.toFixed(0)}% skip`}
      />
      <div className={styles.donutLegend}>
        <span className={styles.legendItem}>
          <span className={styles.legendDotHigh} />
          {highPct.toFixed(0)}%
        </span>
        <span className={styles.legendItem}>
          <span className={styles.legendDotMedium} />
          {mediumPct.toFixed(0)}%
        </span>
        <span className={styles.legendItem}>
          <span className={styles.legendDotLow} />
          {lowPct.toFixed(0)}%
        </span>
        <span className={styles.legendItem}>
          <span className={styles.legendDotSkip} />
          {skipPct.toFixed(0)}%
        </span>
      </div>
    </div>
  );
}

/**
 * Loading skeleton for a stat card.
 */
function StatCardSkeleton() {
  return (
    <div className={styles.card}>
      <Skeleton width="80px" height="0.75rem" rounded="sm" />
      <Skeleton width="120px" height="2rem" rounded="sm" />
      <Skeleton width="100%" height="0.875rem" rounded="sm" />
      <Skeleton width="60px" height="0.75rem" rounded="sm" />
    </div>
  );
}

export function DigestStatsCards({ stats, previousPeriod, isLoading }: DigestStatsCardsProps) {
  if (isLoading) {
    return (
      <div className={styles.container}>
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
      </div>
    );
  }

  const volumeTrend = calcPercentChange(stats.totalItems, previousPeriod.totalItems);
  const qualityTrend = calcPercentChange(stats.avgTopScore, previousPeriod.avgTopScore);
  const costTrend = calcPercentChange(stats.totalCredits, previousPeriod.totalCredits);

  // Build mode breakdown text for cost card
  const modeBreakdownText = [
    stats.creditsByMode.low > 0 ? `low: ${formatCurrency(stats.creditsByMode.low)}` : null,
    stats.creditsByMode.normal > 0 ? `normal: ${formatCurrency(stats.creditsByMode.normal)}` : null,
    stats.creditsByMode.high > 0 ? `high: ${formatCurrency(stats.creditsByMode.high)}` : null,
  ]
    .filter(Boolean)
    .join(" | ");

  return (
    <div className={styles.container}>
      {/* Card 1 - Volume */}
      <div className={styles.card}>
        <div className={styles.cardLabel}>Volume</div>
        <div className={styles.cardPrimary}>{formatNumber(stats.totalItems)}</div>
        <div className={styles.cardSecondary}>
          {stats.digestCount} digests, ~{Math.round(stats.avgItemsPerDigest)} items/digest
        </div>
        <div className={styles.cardTrend}>
          <TrendIndicator percentChange={volumeTrend} />
          <span className={styles.trendLabel}>vs previous period</span>
        </div>
      </div>

      {/* Card 2 - Quality */}
      <div className={styles.card}>
        <div className={styles.cardLabel}>Quality</div>
        <div className={styles.cardPrimary}>{stats.avgTopScore.toFixed(2)}</div>
        <TriageDonut breakdown={stats.triageBreakdown} />
        <div className={styles.cardTrend}>
          <TrendIndicator percentChange={qualityTrend} />
          <span className={styles.trendLabel}>vs previous period</span>
        </div>
      </div>

      {/* Card 3 - Cost */}
      <div className={styles.card}>
        <div className={styles.cardLabel}>Cost</div>
        <div className={styles.cardPrimary}>{formatCurrency(stats.totalCredits)}</div>
        <div className={styles.cardSecondary}>
          ~{formatCurrency(stats.avgCreditsPerDigest)}/digest
          {modeBreakdownText && <span className={styles.modeBreakdown}>{modeBreakdownText}</span>}
        </div>
        <div className={styles.cardTrend}>
          <TrendIndicator percentChange={costTrend} inverse />
          <span className={styles.trendLabel}>vs previous period</span>
        </div>
      </div>
    </div>
  );
}
