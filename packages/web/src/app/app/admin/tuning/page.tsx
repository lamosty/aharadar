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

// Theme tuning defaults and ranges
const THEME_TUNING_DEFAULTS = {
  enabled: true,
  similarityThreshold: 0.65,
  lookbackDays: 7,
};

const THEME_TUNING_RANGES = {
  similarityThreshold: { min: 0.5, max: 0.9 },
  lookbackDays: { min: 1, max: 14 },
} as const;

interface PersonalizationTuningResolved {
  prefBiasSamplingWeight: number;
  prefBiasTriageWeight: number;
  rankPrefWeight: number;
  feedbackWeightDelta: number;
}

interface ThemeTuningResolved {
  enabled: boolean;
  similarityThreshold: number;
  lookbackDays: number;
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

/** Parse theme tuning from custom_settings with defaults and clamping */
function parseThemeTuning(raw: unknown): ThemeTuningResolved {
  const defaults = THEME_TUNING_DEFAULTS;
  const ranges = THEME_TUNING_RANGES;

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...defaults };
  }

  const obj = raw as Record<string, unknown>;

  function extractClampedNum(key: string, defaultValue: number, min: number, max: number): number {
    const value = obj[key];
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return defaultValue;
    }
    return Math.max(min, Math.min(max, value));
  }

  function extractBool(key: string, defaultValue: boolean): boolean {
    const value = obj[key];
    if (typeof value !== "boolean") {
      return defaultValue;
    }
    return value;
  }

  return {
    enabled: extractBool("enabled", defaults.enabled),
    similarityThreshold: extractClampedNum(
      "similarityThreshold",
      defaults.similarityThreshold,
      ranges.similarityThreshold.min,
      ranges.similarityThreshold.max,
    ),
    lookbackDays: extractClampedNum(
      "lookbackDays",
      defaults.lookbackDays,
      ranges.lookbackDays.min,
      ranges.lookbackDays.max,
    ),
  };
}

import { useEffect, useState } from "react";
import { useToast } from "@/components/Toast";
import { useRegenerateThemes, useTopics, useUpdateTopicCustomSettings } from "@/lib/hooks";
import { t } from "@/lib/i18n";
import styles from "./page.module.css";

export default function AdminTuningPage() {
  const { addToast } = useToast();
  const { data: topicsData, isLoading, isError, error } = useTopics();
  const topics = topicsData?.topics ?? [];

  // Selected topic
  const [selectedTopicId, setSelectedTopicId] = useState<string>("");

  // Form state for personalization tuning params
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

  // Form state for theme tuning params
  const [themeEnabled, setThemeEnabled] = useState(THEME_TUNING_DEFAULTS.enabled);
  const [themeSimilarityThreshold, setThemeSimilarityThreshold] = useState(
    THEME_TUNING_DEFAULTS.similarityThreshold,
  );
  const [themeLookbackDays, setThemeLookbackDays] = useState(THEME_TUNING_DEFAULTS.lookbackDays);

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

    // Load personalization tuning
    const personalTuning = parsePersonalizationTuning(
      topic.customSettings?.personalization_tuning_v1,
    );
    setPrefBiasSamplingWeight(personalTuning.prefBiasSamplingWeight);
    setPrefBiasTriageWeight(personalTuning.prefBiasTriageWeight);
    setRankPrefWeight(personalTuning.rankPrefWeight);
    setFeedbackWeightDelta(personalTuning.feedbackWeightDelta);

    // Load theme tuning
    const themeTuning = parseThemeTuning(topic.customSettings?.theme_tuning_v1);
    setThemeEnabled(themeTuning.enabled);
    setThemeSimilarityThreshold(themeTuning.similarityThreshold);
    setThemeLookbackDays(themeTuning.lookbackDays);
  }, [selectedTopicId, topics]);

  const updateMutation = useUpdateTopicCustomSettings(selectedTopicId, {
    onSuccess: () => {
      addToast(t("admin.tuning.saved"), "success");
    },
    onError: (err) => {
      addToast(err.message || t("admin.tuning.saveFailed"), "error");
    },
  });

  const regenerateThemesMutation = useRegenerateThemes(selectedTopicId, {
    onSuccess: (data) => {
      addToast(data.message, "success");
    },
    onError: (err) => {
      addToast(err.message || "Failed to regenerate themes", "error");
    },
  });

  const handleRegenerateThemes = () => {
    if (!selectedTopicId) return;
    regenerateThemesMutation.mutate();
  };

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
      theme_tuning_v1: {
        enabled: themeEnabled,
        similarityThreshold: themeSimilarityThreshold,
        lookbackDays: themeLookbackDays,
      },
    });
  };

  const handleReset = () => {
    // Reset personalization tuning
    setPrefBiasSamplingWeight(PERSONALIZATION_TUNING_DEFAULTS.prefBiasSamplingWeight);
    setPrefBiasTriageWeight(PERSONALIZATION_TUNING_DEFAULTS.prefBiasTriageWeight);
    setRankPrefWeight(PERSONALIZATION_TUNING_DEFAULTS.rankPrefWeight);
    setFeedbackWeightDelta(PERSONALIZATION_TUNING_DEFAULTS.feedbackWeightDelta);
    // Reset theme tuning
    setThemeEnabled(THEME_TUNING_DEFAULTS.enabled);
    setThemeSimilarityThreshold(THEME_TUNING_DEFAULTS.similarityThreshold);
    setThemeLookbackDays(THEME_TUNING_DEFAULTS.lookbackDays);
  };

  const isSaving = updateMutation.isPending;

  // Check if current values differ from saved values
  const selectedTopic = topics.find((t) => t.id === selectedTopicId);
  const savedPersonalTuning = selectedTopic
    ? parsePersonalizationTuning(selectedTopic.customSettings?.personalization_tuning_v1)
    : null;
  const savedThemeTuning = selectedTopic
    ? parseThemeTuning(selectedTopic.customSettings?.theme_tuning_v1)
    : null;

  const hasPersonalChanges =
    savedPersonalTuning &&
    (prefBiasSamplingWeight !== savedPersonalTuning.prefBiasSamplingWeight ||
      prefBiasTriageWeight !== savedPersonalTuning.prefBiasTriageWeight ||
      rankPrefWeight !== savedPersonalTuning.rankPrefWeight ||
      feedbackWeightDelta !== savedPersonalTuning.feedbackWeightDelta);

  const hasThemeChanges =
    savedThemeTuning &&
    (themeEnabled !== savedThemeTuning.enabled ||
      themeSimilarityThreshold !== savedThemeTuning.similarityThreshold ||
      themeLookbackDays !== savedThemeTuning.lookbackDays);

  const hasChanges = hasPersonalChanges || hasThemeChanges;

  // Check if current values differ from defaults
  const isPersonalDefault =
    prefBiasSamplingWeight === PERSONALIZATION_TUNING_DEFAULTS.prefBiasSamplingWeight &&
    prefBiasTriageWeight === PERSONALIZATION_TUNING_DEFAULTS.prefBiasTriageWeight &&
    rankPrefWeight === PERSONALIZATION_TUNING_DEFAULTS.rankPrefWeight &&
    feedbackWeightDelta === PERSONALIZATION_TUNING_DEFAULTS.feedbackWeightDelta;

  const isThemeDefault =
    themeEnabled === THEME_TUNING_DEFAULTS.enabled &&
    themeSimilarityThreshold === THEME_TUNING_DEFAULTS.similarityThreshold &&
    themeLookbackDays === THEME_TUNING_DEFAULTS.lookbackDays;

  const isDefault = isPersonalDefault && isThemeDefault;

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

        {/* Theme Grouping Section */}
        <div className={styles.sectionDivider}>
          <h2 className={styles.sectionTitle}>Theme Grouping</h2>
          <p className={styles.sectionSubtitle}>
            Group similar inbox items into collapsible themes. Only items without feedback are
            grouped - processed items are excluded from themes.
          </p>
        </div>

        {/* Theme Enabled Toggle */}
        <div className={styles.section}>
          <div className={styles.toggleGroup}>
            <label htmlFor="themeEnabled" className={styles.toggleLabel}>
              Enable Theme Grouping
            </label>
            <button
              id="themeEnabled"
              type="button"
              role="switch"
              aria-checked={themeEnabled}
              className={`${styles.toggle} ${themeEnabled ? styles.toggleOn : ""}`}
              onClick={() => setThemeEnabled(!themeEnabled)}
              disabled={isSaving}
            >
              <span className={styles.toggleKnob} />
            </button>
          </div>
          <p className={styles.sliderDescription}>
            When enabled, the pipeline will compute themes for items. Disable to skip theme
            computation entirely.
          </p>
        </div>

        {/* Theme Similarity Threshold */}
        <div className={styles.section}>
          <div className={styles.sliderGroup}>
            <div className={styles.sliderHeader}>
              <label htmlFor="themeSimilarityThreshold" className={styles.sliderLabel}>
                Similarity Threshold
              </label>
              <span className={styles.sliderValue}>{themeSimilarityThreshold.toFixed(2)}</span>
            </div>
            <input
              id="themeSimilarityThreshold"
              type="range"
              min={THEME_TUNING_RANGES.similarityThreshold.min}
              max={THEME_TUNING_RANGES.similarityThreshold.max}
              step={0.01}
              value={themeSimilarityThreshold}
              onChange={(e) => setThemeSimilarityThreshold(Number(e.target.value))}
              className={styles.slider}
              disabled={isSaving || !themeEnabled}
            />
            <div className={styles.sliderRange}>
              <span>{THEME_TUNING_RANGES.similarityThreshold.min}</span>
              <span>{THEME_TUNING_RANGES.similarityThreshold.max}</span>
            </div>
            <p className={styles.sliderDescription}>
              How similar items must be to group into the same theme. Lower = bigger themes with
              more items, Higher = smaller themes with tighter grouping. 0.65 recommended.
            </p>
          </div>
        </div>

        {/* Theme Lookback Days */}
        <div className={styles.section}>
          <div className={styles.sliderGroup}>
            <div className={styles.sliderHeader}>
              <label htmlFor="themeLookbackDays" className={styles.sliderLabel}>
                Lookback Window (days)
              </label>
              <span className={styles.sliderValue}>{themeLookbackDays}</span>
            </div>
            <input
              id="themeLookbackDays"
              type="range"
              min={THEME_TUNING_RANGES.lookbackDays.min}
              max={THEME_TUNING_RANGES.lookbackDays.max}
              step={1}
              value={themeLookbackDays}
              onChange={(e) => setThemeLookbackDays(Number(e.target.value))}
              className={styles.slider}
              disabled={isSaving || !themeEnabled}
            />
            <div className={styles.sliderRange}>
              <span>{THEME_TUNING_RANGES.lookbackDays.min} day</span>
              <span>{THEME_TUNING_RANGES.lookbackDays.max} days</span>
            </div>
            <p className={styles.sliderDescription}>
              Themes older than this won't accept new items. Shorter = more ephemeral themes, Longer
              = themes accumulate across digests. Items can group across multiple digests within
              this window.
            </p>
          </div>
        </div>

        {/* Regenerate Themes */}
        <div className={styles.section}>
          <div className={styles.toggleGroup}>
            <span className={styles.toggleLabel}>Regenerate Themes</span>
            <button
              type="button"
              className={styles.resetButton}
              onClick={handleRegenerateThemes}
              disabled={isSaving || regenerateThemesMutation.isPending || !themeEnabled}
            >
              {regenerateThemesMutation.isPending ? (
                <>
                  <LoadingSpinner />
                  <span>Regenerating...</span>
                </>
              ) : (
                <span>Regenerate Now</span>
              )}
            </button>
          </div>
          <p className={styles.sliderDescription}>
            Delete all existing themes and rebuild from current inbox items. Use this if themes seem
            stale or after changing settings.
          </p>
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
