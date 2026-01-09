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
  return (
    <dl className={styles.featureList}>
      {/* Related Sources - Cluster items */}
      {clusterItems && clusterItems.length > 0 && (
        <FeatureSection
          title={t("digests.whyShown.relatedSources", { count: clusterItems.length + 1 })}
          tooltipKey="tooltips.relatedSources"
        >
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
                  {item.author && (
                    <span className={styles.clusterItemAuthor}>by {item.author}</span>
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
        </FeatureSection>
      )}

      {/* AI Score - LLM triage score */}
      {typeof features.aha_score === "number" && (
        <FeatureSection title={t("digests.whyShown.ahaScore")} tooltipKey="tooltips.aiScore">
          <div className={styles.scoreRow}>
            <span className={styles.scoreValue}>{features.aha_score}</span>
            <span className={styles.scoreMax}>/100</span>
          </div>
          {features.reason && <p className={styles.reason}>{features.reason}</p>}
        </FeatureSection>
      )}

      {/* System features from ranking */}
      {features.system_features?.novelty_v1 && (
        <FeatureSection title={t("digests.whyShown.novelty")} tooltipKey="tooltips.novelty">
          <div className={styles.metaGrid}>
            {typeof features.system_features.novelty_v1.novelty01 === "number" && (
              <div className={styles.metaItem}>
                <span className={styles.metaLabel}>{t("digests.whyShown.noveltyScore")}</span>
                <span className={styles.metaValue}>
                  {(features.system_features.novelty_v1.novelty01 * 100).toFixed(0)}%
                </span>
              </div>
            )}
            {typeof features.system_features.novelty_v1.lookback_days === "number" && (
              <div className={styles.metaItem}>
                <span className={styles.metaLabel}>{t("digests.whyShown.lookbackDays")}</span>
                <span className={styles.metaValue}>
                  {features.system_features.novelty_v1.lookback_days} days
                </span>
              </div>
            )}
          </div>
        </FeatureSection>
      )}

      {features.system_features?.recency_decay_v1 && (
        <FeatureSection title={t("digests.whyShown.recencyDecay")} tooltipKey="tooltips.freshness">
          <div className={styles.metaGrid}>
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>{t("digests.whyShown.freshness")}</span>
              <span className={styles.metaValue}>
                {(features.system_features.recency_decay_v1.decay_factor * 100).toFixed(0)}%
              </span>
            </div>
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>{t("digests.whyShown.age")}</span>
              <span className={styles.metaValue}>
                {features.system_features.recency_decay_v1.age_hours.toFixed(1)}h
              </span>
            </div>
          </div>
        </FeatureSection>
      )}

      {features.system_features?.source_weight_v1 && (
        <FeatureSection
          title={t("digests.whyShown.sourceWeight")}
          tooltipKey="tooltips.sourceWeight"
        >
          <div className={styles.metaGrid}>
            {features.system_features.source_weight_v1.source_name && (
              <div className={styles.metaItem}>
                <span className={styles.metaLabel}>{t("digests.whyShown.sourceName")}</span>
                <span className={styles.metaValue}>
                  {features.system_features.source_weight_v1.source_name}
                </span>
              </div>
            )}
            {features.system_features.source_weight_v1.source_type && (
              <div className={styles.metaItem}>
                <span className={styles.metaLabel}>{t("digests.whyShown.sourceType")}</span>
                <span className={`${styles.metaValue} ${styles.sourceType}`}>
                  {features.system_features.source_weight_v1.source_type}
                </span>
              </div>
            )}
            {typeof features.system_features.source_weight_v1.type_weight === "number" && (
              <div className={styles.metaItem}>
                <span className={styles.metaLabel}>{t("digests.whyShown.typeWeight")}</span>
                <span className={styles.metaValue}>
                  {features.system_features.source_weight_v1.type_weight.toFixed(1)}x
                </span>
              </div>
            )}
            {typeof features.system_features.source_weight_v1.source_weight === "number" && (
              <div className={styles.metaItem}>
                <span className={styles.metaLabel}>{t("digests.whyShown.perSourceWeight")}</span>
                <span className={styles.metaValue}>
                  {features.system_features.source_weight_v1.source_weight.toFixed(1)}x
                </span>
              </div>
            )}
            {typeof features.system_features.source_weight_v1.effective_weight === "number" && (
              <div className={styles.metaItem}>
                <span className={styles.metaLabel}>{t("digests.whyShown.effectiveWeight")}</span>
                <span className={styles.metaValue}>
                  {features.system_features.source_weight_v1.effective_weight.toFixed(1)}x
                </span>
              </div>
            )}
          </div>
        </FeatureSection>
      )}

      {features.system_features?.signal_corroboration_v1?.matched && (
        <FeatureSection title={t("digests.whyShown.corroboration")}>
          {features.system_features.signal_corroboration_v1.matched_url && (
            <div className={styles.urlSection}>
              <span className={styles.metaLabel}>{t("digests.whyShown.corroboratingUrls")}</span>
              <a
                href={features.system_features.signal_corroboration_v1.matched_url}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.url}
              >
                {truncateUrl(features.system_features.signal_corroboration_v1.matched_url)}
              </a>
            </div>
          )}
        </FeatureSection>
      )}

      {features.system_features?.user_preference_v1 && (
        <FeatureSection
          title={t("digests.whyShown.userPreference")}
          tooltipKey="tooltips.userPreferences"
        >
          <div className={styles.metaGrid}>
            {features.system_features.user_preference_v1.source_type && (
              <div className={styles.metaItem}>
                <span className={styles.metaLabel}>{t("digests.whyShown.userPrefSourceType")}</span>
                <span className={`${styles.metaValue} ${styles.sourceType}`}>
                  {features.system_features.user_preference_v1.source_type}
                </span>
              </div>
            )}
            {typeof features.system_features.user_preference_v1.source_type_weight === "number" &&
              features.system_features.user_preference_v1.source_type_weight !== 1.0 && (
                <div className={styles.metaItem}>
                  <span className={styles.metaLabel}>
                    {t("digests.whyShown.userPrefSourceTypeWeight")}
                  </span>
                  <span className={styles.metaValue}>
                    {features.system_features.user_preference_v1.source_type_weight.toFixed(1)}x
                  </span>
                </div>
              )}
            {features.system_features.user_preference_v1.author && (
              <div className={styles.metaItem}>
                <span className={styles.metaLabel}>{t("digests.whyShown.userPrefAuthor")}</span>
                <span className={styles.metaValue}>
                  {features.system_features.user_preference_v1.author}
                </span>
              </div>
            )}
            {typeof features.system_features.user_preference_v1.author_weight === "number" &&
              features.system_features.user_preference_v1.author_weight !== 1.0 && (
                <div className={styles.metaItem}>
                  <span className={styles.metaLabel}>
                    {t("digests.whyShown.userPrefAuthorWeight")}
                  </span>
                  <span className={styles.metaValue}>
                    {features.system_features.user_preference_v1.author_weight.toFixed(1)}x
                  </span>
                </div>
              )}
            {typeof features.system_features.user_preference_v1.effective_weight === "number" &&
              features.system_features.user_preference_v1.effective_weight !== 1.0 && (
                <div className={styles.metaItem}>
                  <span className={styles.metaLabel}>
                    {t("digests.whyShown.userPrefEffectiveWeight")}
                  </span>
                  <span className={styles.metaValue}>
                    {features.system_features.user_preference_v1.effective_weight.toFixed(1)}x
                  </span>
                </div>
              )}
          </div>
        </FeatureSection>
      )}

      {/* Categories from LLM triage */}
      {features.categories && features.categories.length > 0 && (
        <FeatureSection title={t("digests.whyShown.categories")} tooltipKey="tooltips.categories">
          <div className={styles.tagList}>
            {features.categories.map((cat) => (
              <span key={cat} className={styles.tag}>
                {cat}
              </span>
            ))}
          </div>
        </FeatureSection>
      )}
    </dl>
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
