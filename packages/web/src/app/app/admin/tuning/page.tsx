"use client";

import Link from "next/link";

// Personalization tuning defaults and ranges (matching @aharadar/shared)
const PERSONALIZATION_TUNING_DEFAULTS = {
  prefBiasSamplingWeight: 0.15,
  prefBiasTriageWeight: 0.2,
  rankPrefWeight: 0.25,
  feedbackWeightDelta: 0.12,
};

const PERSONALIZATION_TUNING_RANGES = {
  prefBiasSamplingWeight: { min: 0.0, max: 0.5 },
  prefBiasTriageWeight: { min: 0.0, max: 0.5 },
  rankPrefWeight: { min: 0.0, max: 0.5 },
  feedbackWeightDelta: { min: 0.0, max: 0.2 },
} as const;

interface PersonalizationTuningResolved {
  prefBiasSamplingWeight: number;
  prefBiasTriageWeight: number;
  rankPrefWeight: number;
  feedbackWeightDelta: number;
}

/** Parse personalization tuning from custom_settings with defaults and clamping */
function parsePersonalizationTuning(raw: unknown): PersonalizationTuningResolved {
  const defaults = PERSONALIZATION_TUNING_DEFAULTS;
  const ranges = PERSONALIZATION_TUNING_RANGES;

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...defaults };
  }

  const obj = raw as Record<string, unknown>;

  function extractClamped(
    key: keyof PersonalizationTuningResolved,
    defaultValue: number,
    min: number,
    max: number,
  ): number {
    const value = obj[key];
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return defaultValue;
    }
    return Math.max(min, Math.min(max, value));
  }

  return {
    prefBiasSamplingWeight: extractClamped(
      "prefBiasSamplingWeight",
      defaults.prefBiasSamplingWeight,
      ranges.prefBiasSamplingWeight.min,
      ranges.prefBiasSamplingWeight.max,
    ),
    prefBiasTriageWeight: extractClamped(
      "prefBiasTriageWeight",
      defaults.prefBiasTriageWeight,
      ranges.prefBiasTriageWeight.min,
      ranges.prefBiasTriageWeight.max,
    ),
    rankPrefWeight: extractClamped(
      "rankPrefWeight",
      defaults.rankPrefWeight,
      ranges.rankPrefWeight.min,
      ranges.rankPrefWeight.max,
    ),
    feedbackWeightDelta: extractClamped(
      "feedbackWeightDelta",
      defaults.feedbackWeightDelta,
      ranges.feedbackWeightDelta.min,
      ranges.feedbackWeightDelta.max,
    ),
  };
}

import { useEffect, useState } from "react";
import { useToast } from "@/components/Toast";
import { useTopics, useUpdateTopicCustomSettings } from "@/lib/hooks";
import { t } from "@/lib/i18n";
import styles from "./page.module.css";

export default function AdminTuningPage() {
  const { addToast } = useToast();
  const { data: topicsData, isLoading, isError, error } = useTopics();
  const topics = topicsData?.topics ?? [];

  // Selected topic
  const [selectedTopicId, setSelectedTopicId] = useState<string>("");

  // Form state for tuning params
  const [prefBiasSamplingWeight, setPrefBiasSamplingWeight] = useState(
    PERSONALIZATION_TUNING_DEFAULTS.prefBiasSamplingWeight,
  );
  const [prefBiasTriageWeight, setPrefBiasTriageWeight] = useState(
    PERSONALIZATION_TUNING_DEFAULTS.prefBiasTriageWeight,
  );
  const [rankPrefWeight, setRankPrefWeight] = useState(
    PERSONALIZATION_TUNING_DEFAULTS.rankPrefWeight,
  );
  const [feedbackWeightDelta, setFeedbackWeightDelta] = useState(
    PERSONALIZATION_TUNING_DEFAULTS.feedbackWeightDelta,
  );

  // Auto-select first topic when loaded
  useEffect(() => {
    if (topics.length > 0 && !selectedTopicId) {
      setSelectedTopicId(topics[0].id);
    }
  }, [topics, selectedTopicId]);

  // Load tuning values when topic changes
  useEffect(() => {
    if (!selectedTopicId) return;

    const topic = topics.find((t) => t.id === selectedTopicId);
    if (!topic) return;

    const tuning = parsePersonalizationTuning(topic.customSettings?.personalization_tuning_v1);
    setPrefBiasSamplingWeight(tuning.prefBiasSamplingWeight);
    setPrefBiasTriageWeight(tuning.prefBiasTriageWeight);
    setRankPrefWeight(tuning.rankPrefWeight);
    setFeedbackWeightDelta(tuning.feedbackWeightDelta);
  }, [selectedTopicId, topics]);

  const updateMutation = useUpdateTopicCustomSettings(selectedTopicId, {
    onSuccess: () => {
      addToast(t("admin.tuning.saved"), "success");
    },
    onError: (err) => {
      addToast(err.message || t("admin.tuning.saveFailed"), "error");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTopicId) return;

    updateMutation.mutate({
      personalization_tuning_v1: {
        prefBiasSamplingWeight,
        prefBiasTriageWeight,
        rankPrefWeight,
        feedbackWeightDelta,
      },
    });
  };

  const handleReset = () => {
    setPrefBiasSamplingWeight(PERSONALIZATION_TUNING_DEFAULTS.prefBiasSamplingWeight);
    setPrefBiasTriageWeight(PERSONALIZATION_TUNING_DEFAULTS.prefBiasTriageWeight);
    setRankPrefWeight(PERSONALIZATION_TUNING_DEFAULTS.rankPrefWeight);
    setFeedbackWeightDelta(PERSONALIZATION_TUNING_DEFAULTS.feedbackWeightDelta);
  };

  const isSaving = updateMutation.isPending;

  // Check if current values differ from saved values
  const selectedTopic = topics.find((t) => t.id === selectedTopicId);
  const savedTuning = selectedTopic
    ? parsePersonalizationTuning(selectedTopic.customSettings?.personalization_tuning_v1)
    : null;
  const hasChanges =
    savedTuning &&
    (prefBiasSamplingWeight !== savedTuning.prefBiasSamplingWeight ||
      prefBiasTriageWeight !== savedTuning.prefBiasTriageWeight ||
      rankPrefWeight !== savedTuning.rankPrefWeight ||
      feedbackWeightDelta !== savedTuning.feedbackWeightDelta);

  // Check if current values differ from defaults
  const isDefault =
    prefBiasSamplingWeight === PERSONALIZATION_TUNING_DEFAULTS.prefBiasSamplingWeight &&
    prefBiasTriageWeight === PERSONALIZATION_TUNING_DEFAULTS.prefBiasTriageWeight &&
    rankPrefWeight === PERSONALIZATION_TUNING_DEFAULTS.rankPrefWeight &&
    feedbackWeightDelta === PERSONALIZATION_TUNING_DEFAULTS.feedbackWeightDelta;

  if (isLoading) {
    return (
      <div className={styles.page}>
        <header className={styles.header}>
          <Link href="/app/admin" className={styles.backLink}>
            <BackIcon />
            <span>{t("common.back")}</span>
          </Link>
          <h1 className={styles.title}>{t("admin.tuning.title")}</h1>
        </header>
        <div className={styles.loading}>
          <LoadingSpinner />
          <span>{t("common.loading")}</span>
        </div>
      </div>
    );
  }

  if (isError || topics.length === 0) {
    return (
      <div className={styles.page}>
        <header className={styles.header}>
          <Link href="/app/admin" className={styles.backLink}>
            <BackIcon />
            <span>{t("common.back")}</span>
          </Link>
          <h1 className={styles.title}>{t("admin.tuning.title")}</h1>
        </header>
        <div className={styles.error}>
          <p>{error?.message || t("common.error")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/app/admin" className={styles.backLink}>
          <BackIcon />
          <span>{t("common.back")}</span>
        </Link>
        <h1 className={styles.title}>{t("admin.tuning.title")}</h1>
        <p className={styles.description}>{t("admin.tuning.description")}</p>
      </header>

      {/* Topic Selector */}
      <div className={styles.topicSelector}>
        <label htmlFor="topic-select" className={styles.sectionTitle}>
          {t("admin.tuning.selectTopic")}
        </label>
        <select
          id="topic-select"
          value={selectedTopicId}
          onChange={(e) => setSelectedTopicId(e.target.value)}
          className={styles.select}
          disabled={isSaving}
        >
          {topics.map((topic) => (
            <option key={topic.id} value={topic.id}>
              {topic.name}
            </option>
          ))}
        </select>
      </div>

      <form onSubmit={handleSubmit} className={styles.form}>
        {/* Info Box */}
        <div className={styles.infoBox}>
          <InfoIcon />
          <div className={styles.infoContent}>{t("admin.tuning.infoBox")}</div>
        </div>

        {/* Sampling Bias Weight */}
        <div className={styles.section}>
          <div className={styles.sliderGroup}>
            <div className={styles.sliderHeader}>
              <label htmlFor="prefBiasSamplingWeight" className={styles.sliderLabel}>
                {t("admin.tuning.prefBiasSamplingWeight.label")}
              </label>
              <span className={styles.sliderValue}>{prefBiasSamplingWeight.toFixed(2)}</span>
            </div>
            <input
              id="prefBiasSamplingWeight"
              type="range"
              min={PERSONALIZATION_TUNING_RANGES.prefBiasSamplingWeight.min}
              max={PERSONALIZATION_TUNING_RANGES.prefBiasSamplingWeight.max}
              step={0.01}
              value={prefBiasSamplingWeight}
              onChange={(e) => setPrefBiasSamplingWeight(Number(e.target.value))}
              className={styles.slider}
              disabled={isSaving}
            />
            <div className={styles.sliderRange}>
              <span>{PERSONALIZATION_TUNING_RANGES.prefBiasSamplingWeight.min}</span>
              <span>{PERSONALIZATION_TUNING_RANGES.prefBiasSamplingWeight.max}</span>
            </div>
            <p className={styles.sliderDescription}>
              {t("admin.tuning.prefBiasSamplingWeight.description")}
            </p>
          </div>
        </div>

        {/* Triage Bias Weight */}
        <div className={styles.section}>
          <div className={styles.sliderGroup}>
            <div className={styles.sliderHeader}>
              <label htmlFor="prefBiasTriageWeight" className={styles.sliderLabel}>
                {t("admin.tuning.prefBiasTriageWeight.label")}
              </label>
              <span className={styles.sliderValue}>{prefBiasTriageWeight.toFixed(2)}</span>
            </div>
            <input
              id="prefBiasTriageWeight"
              type="range"
              min={PERSONALIZATION_TUNING_RANGES.prefBiasTriageWeight.min}
              max={PERSONALIZATION_TUNING_RANGES.prefBiasTriageWeight.max}
              step={0.01}
              value={prefBiasTriageWeight}
              onChange={(e) => setPrefBiasTriageWeight(Number(e.target.value))}
              className={styles.slider}
              disabled={isSaving}
            />
            <div className={styles.sliderRange}>
              <span>{PERSONALIZATION_TUNING_RANGES.prefBiasTriageWeight.min}</span>
              <span>{PERSONALIZATION_TUNING_RANGES.prefBiasTriageWeight.max}</span>
            </div>
            <p className={styles.sliderDescription}>
              {t("admin.tuning.prefBiasTriageWeight.description")}
            </p>
          </div>
        </div>

        {/* Ranking Preference Weight */}
        <div className={styles.section}>
          <div className={styles.sliderGroup}>
            <div className={styles.sliderHeader}>
              <label htmlFor="rankPrefWeight" className={styles.sliderLabel}>
                {t("admin.tuning.rankPrefWeight.label")}
              </label>
              <span className={styles.sliderValue}>{rankPrefWeight.toFixed(2)}</span>
            </div>
            <input
              id="rankPrefWeight"
              type="range"
              min={PERSONALIZATION_TUNING_RANGES.rankPrefWeight.min}
              max={PERSONALIZATION_TUNING_RANGES.rankPrefWeight.max}
              step={0.01}
              value={rankPrefWeight}
              onChange={(e) => setRankPrefWeight(Number(e.target.value))}
              className={styles.slider}
              disabled={isSaving}
            />
            <div className={styles.sliderRange}>
              <span>{PERSONALIZATION_TUNING_RANGES.rankPrefWeight.min}</span>
              <span>{PERSONALIZATION_TUNING_RANGES.rankPrefWeight.max}</span>
            </div>
            <p className={styles.sliderDescription}>
              {t("admin.tuning.rankPrefWeight.description")}
            </p>
          </div>
        </div>

        {/* Feedback Weight Delta */}
        <div className={styles.section}>
          <div className={styles.sliderGroup}>
            <div className={styles.sliderHeader}>
              <label htmlFor="feedbackWeightDelta" className={styles.sliderLabel}>
                {t("admin.tuning.feedbackWeightDelta.label")}
              </label>
              <span className={styles.sliderValue}>{feedbackWeightDelta.toFixed(2)}</span>
            </div>
            <input
              id="feedbackWeightDelta"
              type="range"
              min={PERSONALIZATION_TUNING_RANGES.feedbackWeightDelta.min}
              max={PERSONALIZATION_TUNING_RANGES.feedbackWeightDelta.max}
              step={0.01}
              value={feedbackWeightDelta}
              onChange={(e) => setFeedbackWeightDelta(Number(e.target.value))}
              className={styles.slider}
              disabled={isSaving}
            />
            <div className={styles.sliderRange}>
              <span>{PERSONALIZATION_TUNING_RANGES.feedbackWeightDelta.min}</span>
              <span>{PERSONALIZATION_TUNING_RANGES.feedbackWeightDelta.max}</span>
            </div>
            <p className={styles.sliderDescription}>
              {t("admin.tuning.feedbackWeightDelta.description")}
            </p>
          </div>
        </div>

        {/* Form Actions */}
        <div className={styles.formActions}>
          <button type="submit" className={styles.submitButton} disabled={isSaving || !hasChanges}>
            {isSaving ? (
              <>
                <LoadingSpinner />
                <span>{t("admin.tuning.saving")}</span>
              </>
            ) : (
              <span>{t("admin.tuning.save")}</span>
            )}
          </button>
          <button
            type="button"
            className={styles.resetButton}
            onClick={handleReset}
            disabled={isSaving || isDefault}
          >
            {t("admin.tuning.resetToDefaults")}
          </button>
        </div>
      </form>
    </div>
  );
}

function BackIcon() {
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
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </svg>
  );
}

function LoadingSpinner() {
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
      aria-hidden="true"
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={styles.infoIcon}
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  );
}
