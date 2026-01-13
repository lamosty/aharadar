"use client";

import { useId, useState } from "react";
import { HelpTooltip } from "@/components/HelpTooltip";
import type { ClusterItem } from "@/lib/api";
import { type MessageKey, t } from "@/lib/i18n";
import type { TriageFeatures } from "@/lib/mock-data";
import styles from "./WhyShown.module.css";

interface WhyShownProps {
  features?: TriageFeatures;
  clusterItems?: ClusterItem[];
  defaultExpanded?: boolean;
  /** Compact variant for condensed layouts - shows content directly, smaller styling */
  compact?: boolean;
}

function formatSourceType(type: string): string {
  const labels: Record<string, string> = {
    hn: "HN",
    reddit: "Reddit",
    rss: "RSS",
    youtube: "YouTube",
    x_posts: "X",
    signal: "Signal",
  };
  return labels[type] || type.toUpperCase();
}

export function WhyShown({
  features,
  clusterItems,
  defaultExpanded = false,
  compact = false,
}: WhyShownProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded || compact);
  const panelId = useId();

  const hasFeatures = features && Object.keys(features).length > 0;

  // Show unavailable message when no features (triage not run due to budget or config)
  if (!hasFeatures) {
    return (
      <div
        className={`${styles.container} ${compact ? styles.compact : ""}`}
        data-testid="why-shown"
      >
        <div className={styles.unavailable}>
          <span className={styles.unavailableTitle}>{t("digests.whyShown.unavailable")}</span>
          <p className={styles.unavailableText}>{t("digests.whyShown.unavailableReason")}</p>
        </div>
      </div>
    );
  }

  // Compact variant: show content directly without toggle
  if (compact) {
    return (
      <div className={`${styles.container} ${styles.compact}`} data-testid="why-shown">
        <div className={styles.panelCompact} role="region" aria-label={t("digests.whyShown.title")}>
          <WhyShownContent features={features} clusterItems={clusterItems} />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container} data-testid="why-shown">
      <button
        type="button"
        className={styles.toggle}
        onClick={() => setIsExpanded(!isExpanded)}
        aria-expanded={isExpanded}
        aria-controls={panelId}
        data-testid="why-shown-toggle"
      >
        <span className={styles.toggleLabel}>{t("digests.whyShown.title")}</span>
        <span className={`${styles.toggleIcon} ${isExpanded ? styles.expanded : ""}`}>
          <ChevronIcon />
        </span>
      </button>

      {isExpanded && (
        <div
          id={panelId}
          className={styles.panel}
          role="region"
          aria-label={t("digests.whyShown.title")}
          data-testid="why-shown-panel"
        >
          <WhyShownContent features={features} clusterItems={clusterItems} />
        </div>
      )}
    </div>
  );
}

interface FeatureSectionProps {
  title: string;
  tooltipKey?: MessageKey;
  children: React.ReactNode;
}

function FeatureSection({ title, tooltipKey, children }: FeatureSectionProps) {
  return (
    <div className={styles.featureSection}>
      <dt className={styles.featureTitle}>
        {title}
        {tooltipKey && <HelpTooltip content={t(tooltipKey)} />}
      </dt>
      <dd className={styles.featureContent}>{children}</dd>
    </div>
  );
}

/** Extracted content component for reuse in compact mode */
function WhyShownContent({
  features,
  clusterItems,
}: {
  features: TriageFeatures;
  clusterItems?: ClusterItem[];
}) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Check if there's any advanced data to show
  const hasAdvancedData =
    features.system_features?.novelty_v1 ||
    features.system_features?.recency_decay_v1 ||
    features.system_features?.source_weight_v1 ||
    features.system_features?.user_preference_v1 ||
    features.system_features?.signal_corroboration_v1?.matched;

  return (
    <div className={styles.featureList}>
      {/* Main section - always visible */}

      {/* AI Score - LLM triage score (main insight) */}
      {typeof features.ai_score === "number" && (
        <div className={styles.mainScore}>
          <div className={styles.scoreHeader}>
            <span className={styles.scoreLabel}>{t("digests.whyShown.aiScore")}</span>
            <div className={styles.scoreRow}>
              <span className={styles.scoreValue}>{features.ai_score}</span>
              <span className={styles.scoreMax}>/100</span>
            </div>
          </div>
          {features.reason && <p className={styles.reason}>{features.reason}</p>}
        </div>
      )}

      {/* Categories from LLM triage */}
      {features.categories && features.categories.length > 0 && (
        <div className={styles.categoriesSection}>
          <div className={styles.tagList}>
            {features.categories.map((cat) => (
              <span key={cat} className={styles.tag}>
                {cat}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Related Sources - Cluster items */}
      {clusterItems && clusterItems.length > 0 && (
        <div className={styles.clusterSection}>
          <span className={styles.sectionLabel}>
            {t("digests.whyShown.relatedSources", { count: clusterItems.length + 1 })}
          </span>
          <div className={styles.clusterList}>
            {clusterItems.map((item) => (
              <div key={item.id} className={styles.clusterItem}>
                <span className={styles.clusterSourceBadge}>
                  {formatSourceType(item.sourceType)}
                </span>
                <div className={styles.clusterItemContent}>
                  {item.url ? (
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.clusterItemLink}
                    >
                      {item.title || t("digests.whyShown.untitled")}
                    </a>
                  ) : (
                    <span className={styles.clusterItemTitle}>
                      {item.title || t("digests.whyShown.untitled")}
                    </span>
                  )}
                </div>
                {typeof item.similarity === "number" && (
                  <span className={styles.clusterSimilarity}>
                    {Math.round(item.similarity * 100)}%
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Advanced data toggle */}
      {hasAdvancedData && (
        <button
          type="button"
          className={styles.advancedToggle}
          onClick={() => setShowAdvanced(!showAdvanced)}
        >
          {showAdvanced ? t("digests.whyShown.hideAdvanced") : t("digests.whyShown.showAdvanced")}
          <span className={`${styles.toggleChevron} ${showAdvanced ? styles.expanded : ""}`}>
            <ChevronIcon />
          </span>
        </button>
      )}

      {/* Advanced section - hidden by default */}
      {showAdvanced && hasAdvancedData && (
        <div className={styles.advancedSection}>
          <table className={styles.advancedTable}>
            <tbody>
              {/* Novelty */}
              {features.system_features?.novelty_v1 && (
                <tr>
                  <th>{t("digests.whyShown.novelty")}</th>
                  <td>
                    {typeof features.system_features.novelty_v1.novelty01 === "number" &&
                      `${(features.system_features.novelty_v1.novelty01 * 100).toFixed(0)}%`}
                    {typeof features.system_features.novelty_v1.lookback_days === "number" &&
                      ` (${features.system_features.novelty_v1.lookback_days}d lookback)`}
                  </td>
                </tr>
              )}

              {/* Freshness */}
              {features.system_features?.recency_decay_v1 && (
                <tr>
                  <th>{t("digests.whyShown.freshness")}</th>
                  <td>
                    {(features.system_features.recency_decay_v1.decay_factor * 100).toFixed(0)}%
                    {` (${features.system_features.recency_decay_v1.age_hours.toFixed(1)}h old)`}
                  </td>
                </tr>
              )}

              {/* Source Weight */}
              {features.system_features?.source_weight_v1 && (
                <tr>
                  <th>{t("digests.whyShown.sourceWeight")}</th>
                  <td>
                    {features.system_features.source_weight_v1.source_name &&
                      `${features.system_features.source_weight_v1.source_name} · `}
                    {typeof features.system_features.source_weight_v1.effective_weight ===
                      "number" &&
                      `${features.system_features.source_weight_v1.effective_weight.toFixed(1)}x`}
                  </td>
                </tr>
              )}

              {/* User Preferences */}
              {features.system_features?.user_preference_v1 &&
                typeof features.system_features.user_preference_v1.effective_weight === "number" &&
                features.system_features.user_preference_v1.effective_weight !== 1.0 && (
                  <tr>
                    <th>{t("digests.whyShown.userPreference")}</th>
                    <td>
                      {`${features.system_features.user_preference_v1.effective_weight.toFixed(1)}x boost`}
                    </td>
                  </tr>
                )}

              {/* Corroboration */}
              {features.system_features?.signal_corroboration_v1?.matched && (
                <tr>
                  <th>{t("digests.whyShown.corroboration")}</th>
                  <td>
                    {features.system_features.signal_corroboration_v1.matched_url ? (
                      <a
                        href={features.system_features.signal_corroboration_v1.matched_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.url}
                      >
                        {truncateUrl(features.system_features.signal_corroboration_v1.matched_url)}
                      </a>
                    ) : (
                      "Yes"
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function truncateUrl(url: string, maxLength = 50): string {
  if (url.length <= maxLength) return url;
  return `${url.substring(0, maxLength - 3)}...`;
}

function ChevronIcon() {
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
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}
