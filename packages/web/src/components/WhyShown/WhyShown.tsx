"use client";

import { useState, useId } from "react";
import { type TriageFeatures } from "@/lib/mock-data";
import { t } from "@/lib/i18n";
import styles from "./WhyShown.module.css";

interface WhyShownProps {
  features?: TriageFeatures;
  defaultExpanded?: boolean;
}

export function WhyShown({ features, defaultExpanded = false }: WhyShownProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const panelId = useId();

  const hasFeatures = features && Object.keys(features).length > 0;

  // Show unavailable message when no features (triage not run due to budget or config)
  if (!hasFeatures) {
    return (
      <div className={styles.container} data-testid="why-shown">
        <div className={styles.unavailable}>
          <span className={styles.unavailableTitle}>{t("digests.whyShown.unavailable")}</span>
          <p className={styles.unavailableText}>{t("digests.whyShown.unavailableReason")}</p>
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
          <dl className={styles.featureList}>
              {/* Aha Score - top level fields */}
              {typeof features.aha_score === "number" && (
                <FeatureSection title={t("digests.whyShown.ahaScore")}>
                  <div className={styles.scoreRow}>
                    <span className={styles.scoreValue}>{features.aha_score}</span>
                    <span className={styles.scoreMax}>/100</span>
                  </div>
                  {features.reason && <p className={styles.reason}>{features.reason}</p>}
                </FeatureSection>
              )}

              {/* System features from ranking */}
              {features.system_features?.novelty_v1 && (
                <FeatureSection title={t("digests.whyShown.novelty")}>
                  <div className={styles.metaGrid}>
                    {typeof features.system_features.novelty_v1.novelty01 === "number" && (
                      <div className={styles.metaItem}>
                        <dt>{t("digests.whyShown.noveltyScore")}</dt>
                        <dd>{(features.system_features.novelty_v1.novelty01 * 100).toFixed(0)}%</dd>
                      </div>
                    )}
                    {typeof features.system_features.novelty_v1.lookback_days === "number" && (
                      <div className={styles.metaItem}>
                        <dt>{t("digests.whyShown.lookbackDays")}</dt>
                        <dd>{features.system_features.novelty_v1.lookback_days} days</dd>
                      </div>
                    )}
                  </div>
                </FeatureSection>
              )}

              {features.system_features?.recency_decay_v1 && (
                <FeatureSection title={t("digests.whyShown.recencyDecay")}>
                  <div className={styles.metaGrid}>
                    <div className={styles.metaItem}>
                      <dt>{t("digests.whyShown.freshness")}</dt>
                      <dd>{(features.system_features.recency_decay_v1.decay_factor * 100).toFixed(0)}%</dd>
                    </div>
                    <div className={styles.metaItem}>
                      <dt>{t("digests.whyShown.age")}</dt>
                      <dd>{features.system_features.recency_decay_v1.age_hours.toFixed(1)}h</dd>
                    </div>
                  </div>
                </FeatureSection>
              )}

              {features.system_features?.source_weight_v1 && (
                <FeatureSection title={t("digests.whyShown.sourceWeight")}>
                  <div className={styles.metaGrid}>
                    {features.system_features.source_weight_v1.source_name && (
                      <div className={styles.metaItem}>
                        <dt>{t("digests.whyShown.sourceName")}</dt>
                        <dd>{features.system_features.source_weight_v1.source_name}</dd>
                      </div>
                    )}
                    {features.system_features.source_weight_v1.source_type && (
                      <div className={styles.metaItem}>
                        <dt>{t("digests.whyShown.sourceType")}</dt>
                        <dd className={styles.sourceType}>{features.system_features.source_weight_v1.source_type}</dd>
                      </div>
                    )}
                    {typeof features.system_features.source_weight_v1.effective_weight === "number" &&
                      features.system_features.source_weight_v1.effective_weight !== 1.0 && (
                        <div className={styles.metaItem}>
                          <dt>{t("digests.whyShown.weight")}</dt>
                          <dd>{features.system_features.source_weight_v1.effective_weight.toFixed(1)}x</dd>
                        </div>
                      )}
                  </div>
                </FeatureSection>
              )}

              {features.system_features?.signal_corroboration_v1?.matched && (
                <FeatureSection title={t("digests.whyShown.corroboration")}>
                  {features.system_features.signal_corroboration_v1.matched_url && (
                    <div className={styles.urlSection}>
                      <dt>{t("digests.whyShown.corroboratingUrls")}</dt>
                      <dd>
                        <a
                          href={features.system_features.signal_corroboration_v1.matched_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={styles.url}
                        >
                          {truncateUrl(features.system_features.signal_corroboration_v1.matched_url)}
                        </a>
                      </dd>
                    </div>
                  )}
                </FeatureSection>
              )}

              {features.system_features?.user_preference_v1 && (
                <FeatureSection title={t("digests.whyShown.userPreference")}>
                  <div className={styles.metaGrid}>
                    {features.system_features.user_preference_v1.source_type && (
                      <div className={styles.metaItem}>
                        <dt>{t("digests.whyShown.userPrefSourceType")}</dt>
                        <dd className={styles.sourceType}>{features.system_features.user_preference_v1.source_type}</dd>
                      </div>
                    )}
                    {typeof features.system_features.user_preference_v1.source_type_weight === "number" &&
                      features.system_features.user_preference_v1.source_type_weight !== 1.0 && (
                        <div className={styles.metaItem}>
                          <dt>{t("digests.whyShown.userPrefSourceTypeWeight")}</dt>
                          <dd>{features.system_features.user_preference_v1.source_type_weight.toFixed(1)}x</dd>
                        </div>
                      )}
                    {features.system_features.user_preference_v1.author && (
                      <div className={styles.metaItem}>
                        <dt>{t("digests.whyShown.userPrefAuthor")}</dt>
                        <dd>{features.system_features.user_preference_v1.author}</dd>
                      </div>
                    )}
                    {typeof features.system_features.user_preference_v1.author_weight === "number" &&
                      features.system_features.user_preference_v1.author_weight !== 1.0 && (
                        <div className={styles.metaItem}>
                          <dt>{t("digests.whyShown.userPrefAuthorWeight")}</dt>
                          <dd>{features.system_features.user_preference_v1.author_weight.toFixed(1)}x</dd>
                        </div>
                      )}
                    {typeof features.system_features.user_preference_v1.effective_weight === "number" &&
                      features.system_features.user_preference_v1.effective_weight !== 1.0 && (
                        <div className={styles.metaItem}>
                          <dt>{t("digests.whyShown.userPrefEffectiveWeight")}</dt>
                          <dd>{features.system_features.user_preference_v1.effective_weight.toFixed(1)}x</dd>
                        </div>
                      )}
                  </div>
                </FeatureSection>
              )}

              {/* Categories from LLM triage */}
              {features.categories && features.categories.length > 0 && (
                <FeatureSection title={t("digests.whyShown.categories")}>
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
        </div>
      )}
    </div>
  );
}

interface FeatureSectionProps {
  title: string;
  children: React.ReactNode;
}

function FeatureSection({ title, children }: FeatureSectionProps) {
  return (
    <div className={styles.featureSection}>
      <dt className={styles.featureTitle}>{title}</dt>
      <dd className={styles.featureContent}>{children}</dd>
    </div>
  );
}

function truncateUrl(url: string, maxLength = 50): string {
  if (url.length <= maxLength) return url;
  return url.substring(0, maxLength - 3) + "...";
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
