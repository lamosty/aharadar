"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  getExperimentalFeatures,
  toggleExperimentalFeature,
  resetExperimentalFeatures,
  EXPERIMENTAL_FEATURES,
  type ExperimentalFeatures,
} from "@/lib/experimental";
import { useToast } from "@/components/Toast";
import { t } from "@/lib/i18n";
import styles from "./ExperimentalFeatures.module.css";

export function ExperimentalFeaturesForm() {
  const [features, setFeatures] = useState<ExperimentalFeatures>({ qa: false });
  const [isLoaded, setIsLoaded] = useState(false);
  const { addToast } = useToast();

  // Load settings on mount
  useEffect(() => {
    setFeatures(getExperimentalFeatures());
    setIsLoaded(true);
  }, []);

  const handleToggle = useCallback(
    (key: keyof ExperimentalFeatures) => {
      const updated = toggleExperimentalFeature(key, !features[key]);
      setFeatures(updated);

      const featureMeta = EXPERIMENTAL_FEATURES.find((f) => f.key === key);
      const label = featureMeta ? t(featureMeta.labelKey as Parameters<typeof t>[0]) : key;
      const status = updated[key] ? "enabled" : "disabled";
      addToast(`${label} ${status}`, updated[key] ? "success" : "info");
    },
    [features, addToast]
  );

  const handleResetAll = useCallback(() => {
    const reset = resetExperimentalFeatures();
    setFeatures(reset);
    addToast(t("settings.experimental.reset"), "info");
  }, [addToast]);

  if (!isLoaded) {
    return <div className={styles.loading}>{t("common.loading")}</div>;
  }

  return (
    <div className={styles.experimentalFeatures}>
      <div className={styles.info}>
        <InfoIcon />
        <span>{t("settings.experimental.info")}</span>
      </div>

      <div className={styles.featuresList}>
        {EXPERIMENTAL_FEATURES.map((feature) => (
          <div key={feature.key} className={styles.featureCard}>
            <div className={styles.featureHeader}>
              <div className={styles.featureInfo}>
                <span className={styles.featureName}>{t(feature.labelKey as Parameters<typeof t>[0])}</span>
                {feature.href && (
                  <Link href={feature.href} className={styles.featureLink}>
                    Open →
                  </Link>
                )}
              </div>
              <label className={styles.toggle}>
                <input
                  type="checkbox"
                  checked={features[feature.key]}
                  onChange={() => handleToggle(feature.key)}
                />
                <span className={styles.toggleTrack}>
                  <span className={styles.toggleThumb} />
                </span>
              </label>
            </div>
            <p className={styles.featureDescription}>
              {t(feature.descriptionKey as Parameters<typeof t>[0])}
            </p>
            <div className={styles.featureStatus}>
              {features[feature.key] ? (
                <span className={styles.statusEnabled}>Enabled</span>
              ) : (
                <span className={styles.statusDisabled}>Disabled</span>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className={styles.actions}>
        <button type="button" onClick={handleResetAll} className={styles.resetButton}>
          {t("settings.experimental.resetAll")}
        </button>
      </div>

      <div className={styles.note}>
        <NoteIcon />
        <span>{t("settings.experimental.serverNote")}</span>
      </div>
    </div>
  );
}

function InfoIcon() {
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
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </svg>
  );
}

function NoteIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  );
}
