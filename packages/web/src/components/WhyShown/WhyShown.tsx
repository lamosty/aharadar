"use client";

import { useState } from "react";
import { type TriageFeatures } from "@/lib/mock-data";
import { t } from "@/lib/i18n";
import styles from "./WhyShown.module.css";

interface WhyShownProps {
  features?: TriageFeatures;
  defaultExpanded?: boolean;
}

export function WhyShown({ features, defaultExpanded = false }: WhyShownProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const hasFeatures = features && Object.keys(features).length > 0;

  return (
    <div className={styles.container} data-testid="why-shown">
      <button
        type="button"
        className={styles.toggle}
        onClick={() => setIsExpanded(!isExpanded)}
        aria-expanded={isExpanded}
        aria-controls="why-shown-panel"
        data-testid="why-shown-toggle"
      >
        <span className={styles.toggleLabel}>{t("digests.whyShown.title")}</span>
        <span className={`${styles.toggleIcon} ${isExpanded ? styles.expanded : ""}`}>
          <ChevronIcon />
        </span>
      </button>

      {isExpanded && (
        <div
          id="why-shown-panel"
          className={styles.panel}
          role="region"
          aria-label={t("digests.whyShown.title")}
          data-testid="why-shown-panel"
        >
          {!hasFeatures ? (
            <p className={styles.noFeatures}>{t("digests.whyShown.noFeatures")}</p>
          ) : (
            <dl className={styles.featureList}>
              {features.aha_score && (
                <FeatureSection title={t("digests.whyShown.ahaScore")}>
                  <div className={styles.scoreRow}>
                    <span className={styles.scoreValue}>
                      {features.aha_score.score}
                    </span>
                    <span className={styles.scoreMax}>/100</span>
                  </div>
                  {features.aha_score.reason && (
                    <p className={styles.reason}>{features.aha_score.reason}</p>
                  )}
                </FeatureSection>
              )}

              {features.novelty_v1 && (
                <FeatureSection title={t("digests.whyShown.novelty")}>
                  <div className={styles.metaGrid}>
                    <div className={styles.metaItem}>
                      <dt>{t("digests.whyShown.noveltyScore")}</dt>
                      <dd>{(features.novelty_v1.score * 100).toFixed(0)}%</dd>
                    </div>
                    <div className={styles.metaItem}>
                      <dt>{t("digests.whyShown.lookbackDays")}</dt>
                      <dd>{features.novelty_v1.lookback_days} days</dd>
                    </div>
                    <div className={styles.metaItem}>
                      <dt>{t("digests.whyShown.similarItems")}</dt>
                      <dd>{features.novelty_v1.similar_items_count}</dd>
                    </div>
                  </div>
                </FeatureSection>
              )}

              {features.source_weight_v1 && (
                <FeatureSection title={t("digests.whyShown.sourceWeight")}>
                  <div className={styles.metaGrid}>
                    <div className={styles.metaItem}>
                      <dt>{t("digests.whyShown.sourceName")}</dt>
                      <dd>{features.source_weight_v1.source_name}</dd>
                    </div>
                    <div className={styles.metaItem}>
                      <dt>{t("digests.whyShown.sourceType")}</dt>
                      <dd className={styles.sourceType}>
                        {features.source_weight_v1.source_type}
                      </dd>
                    </div>
                    <div className={styles.metaItem}>
                      <dt>{t("digests.whyShown.weight")}</dt>
                      <dd>{features.source_weight_v1.weight.toFixed(1)}x</dd>
                    </div>
                  </div>
                </FeatureSection>
              )}

              {features.signal_corroboration_v1 && (
                <FeatureSection title={t("digests.whyShown.corroboration")}>
                  <div className={styles.metaItem}>
                    <dt>{t("digests.whyShown.corroborationScore")}</dt>
                    <dd>
                      {(features.signal_corroboration_v1.score * 100).toFixed(0)}%
                    </dd>
                  </div>

                  {features.signal_corroboration_v1.corroborating_topics.length >
                    0 && (
                    <div className={styles.tagSection}>
                      <dt>{t("digests.whyShown.corroboratingTopics")}</dt>
                      <dd className={styles.tagList}>
                        {features.signal_corroboration_v1.corroborating_topics.map(
                          (topic) => (
                            <span key={topic} className={styles.tag}>
                              {topic}
                            </span>
                          )
                        )}
                      </dd>
                    </div>
                  )}

                  {features.signal_corroboration_v1.corroborating_urls.length >
                    0 && (
                    <div className={styles.urlSection}>
                      <dt>{t("digests.whyShown.corroboratingUrls")}</dt>
                      <dd>
                        <ul className={styles.urlList}>
                          {features.signal_corroboration_v1.corroborating_urls.map(
                            (url) => (
                              <li key={url}>
                                <a
                                  href={url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className={styles.url}
                                >
                                  {truncateUrl(url)}
                                </a>
                              </li>
                            )
                          )}
                        </ul>
                      </dd>
                    </div>
                  )}
                </FeatureSection>
              )}

              {/* Render any unknown future features gracefully */}
              {Object.entries(features)
                .filter(
                  ([key]) =>
                    !["aha_score", "novelty_v1", "source_weight_v1", "signal_corroboration_v1"].includes(key)
                )
                .map(([key, value]) => (
                  <FeatureSection key={key} title={key}>
                    <pre className={styles.rawJson}>
                      {JSON.stringify(value, null, 2)}
                    </pre>
                  </FeatureSection>
                ))}
            </dl>
          )}
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
