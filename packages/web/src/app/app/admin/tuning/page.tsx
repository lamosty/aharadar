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
  useClusterContext: false,
  maxItemsPerTheme: 0,
  subthemesEnabled: false,
  refineLabels: true,
  minLabelWords: 2,
  maxDominancePct: 0.7,
  similarityThreshold: 0.7,
  lookbackDays: 7,
};

const THEME_TUNING_RANGES = {
  maxItemsPerTheme: { min: 0, max: 200 },
  minLabelWords: { min: 1, max: 4 },
  maxDominancePct: { min: 0, max: 0.95 },
  similarityThreshold: { min: 0.3, max: 0.9 },
  lookbackDays: { min: 1, max: 14 },
} as const;

// Embedding retention defaults and ranges
const EMBEDDING_RETENTION_DEFAULTS = {
  enabled: true,
  maxAgeDays: 90,
  maxItems: 0,
  protectFeedback: true,
  protectBookmarks: true,
};

const EMBEDDING_RETENTION_RANGES = {
  maxAgeDays: { min: 30, max: 120 },
  maxItems: { min: 0, max: 200000 },
} as const;

// AI Guidance defaults and max length
const AI_GUIDANCE_DEFAULTS = {
  summary_prompt: "",
  triage_prompt: "",
};

const AI_GUIDANCE_MAX_LENGTH = 2000;

interface PersonalizationTuningResolved {
  prefBiasSamplingWeight: number;
  prefBiasTriageWeight: number;
  rankPrefWeight: number;
  feedbackWeightDelta: number;
}

interface ThemeTuningResolved {
  enabled: boolean;
  useClusterContext: boolean;
  maxItemsPerTheme: number;
  subthemesEnabled: boolean;
  refineLabels: boolean;
  minLabelWords: number;
  maxDominancePct: number;
  similarityThreshold: number;
  lookbackDays: number;
}

interface AiGuidanceResolved {
  summary_prompt: string;
  triage_prompt: string;
}

interface EmbeddingRetentionResolved {
  enabled: boolean;
  maxAgeDays: number;
  maxItems: number;
  protectFeedback: boolean;
  protectBookmarks: boolean;
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

/** Parse AI guidance from custom_settings with defaults */
function parseAiGuidance(raw: unknown): AiGuidanceResolved {
  const defaults = AI_GUIDANCE_DEFAULTS;

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...defaults };
  }

  const obj = raw as Record<string, unknown>;

  function extractString(key: string, defaultValue: string): string {
    const value = obj[key];
    if (typeof value !== "string") {
      return defaultValue;
    }
    return value.trim().slice(0, AI_GUIDANCE_MAX_LENGTH);
  }

  return {
    summary_prompt: extractString("summary_prompt", defaults.summary_prompt),
    triage_prompt: extractString("triage_prompt", defaults.triage_prompt),
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
    useClusterContext: extractBool("useClusterContext", defaults.useClusterContext),
    maxItemsPerTheme: extractClampedNum(
      "maxItemsPerTheme",
      defaults.maxItemsPerTheme,
      ranges.maxItemsPerTheme.min,
      ranges.maxItemsPerTheme.max,
    ),
    subthemesEnabled: extractBool("subthemesEnabled", defaults.subthemesEnabled),
    refineLabels: extractBool("refineLabels", defaults.refineLabels),
    minLabelWords: extractClampedNum(
      "minLabelWords",
      defaults.minLabelWords,
      ranges.minLabelWords.min,
      ranges.minLabelWords.max,
    ),
    maxDominancePct: extractClampedNum(
      "maxDominancePct",
      defaults.maxDominancePct,
      ranges.maxDominancePct.min,
      ranges.maxDominancePct.max,
    ),
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

/** Parse embedding retention from custom_settings with defaults and clamping */
function parseEmbeddingRetention(raw: unknown): EmbeddingRetentionResolved {
  const defaults = EMBEDDING_RETENTION_DEFAULTS;
  const ranges = EMBEDDING_RETENTION_RANGES;

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...defaults };
  }

  const obj = raw as Record<string, unknown>;

  function extractBool(key: string, defaultValue: boolean): boolean {
    const value = obj[key];
    if (typeof value !== "boolean") {
      return defaultValue;
    }
    return value;
  }

  function extractClampedNum(key: string, defaultValue: number, min: number, max: number): number {
    const value = obj[key];
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return defaultValue;
    }
    return Math.max(min, Math.min(max, Math.floor(value)));
  }

  return {
    enabled: extractBool("enabled", defaults.enabled),
    maxAgeDays: extractClampedNum(
      "maxAgeDays",
      defaults.maxAgeDays,
      ranges.maxAgeDays.min,
      ranges.maxAgeDays.max,
    ),
    maxItems: extractClampedNum(
      "maxItems",
      defaults.maxItems,
      ranges.maxItems.min,
      ranges.maxItems.max,
    ),
    protectFeedback: extractBool("protectFeedback", defaults.protectFeedback),
    protectBookmarks: extractBool("protectBookmarks", defaults.protectBookmarks),
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
  const [themeUseClusterContext, setThemeUseClusterContext] = useState(
    THEME_TUNING_DEFAULTS.useClusterContext,
  );
  const [themeMaxItemsPerTheme, setThemeMaxItemsPerTheme] = useState(
    THEME_TUNING_DEFAULTS.maxItemsPerTheme,
  );
  const [themeSubthemesEnabled, setThemeSubthemesEnabled] = useState(
    THEME_TUNING_DEFAULTS.subthemesEnabled,
  );
  const [themeRefineLabels, setThemeRefineLabels] = useState(THEME_TUNING_DEFAULTS.refineLabels);
  const [themeMinLabelWords, setThemeMinLabelWords] = useState(THEME_TUNING_DEFAULTS.minLabelWords);
  const [themeMaxDominancePct, setThemeMaxDominancePct] = useState(
    THEME_TUNING_DEFAULTS.maxDominancePct,
  );
  const [themeSimilarityThreshold, setThemeSimilarityThreshold] = useState(
    THEME_TUNING_DEFAULTS.similarityThreshold,
  );
  const [themeLookbackDays, setThemeLookbackDays] = useState(THEME_TUNING_DEFAULTS.lookbackDays);

  // Form state for embedding retention
  const [retentionEnabled, setRetentionEnabled] = useState(EMBEDDING_RETENTION_DEFAULTS.enabled);
  const [retentionMaxAgeDays, setRetentionMaxAgeDays] = useState(
    EMBEDDING_RETENTION_DEFAULTS.maxAgeDays,
  );
  const [retentionMaxItems, setRetentionMaxItems] = useState(EMBEDDING_RETENTION_DEFAULTS.maxItems);
  const [retentionProtectFeedback, setRetentionProtectFeedback] = useState(
    EMBEDDING_RETENTION_DEFAULTS.protectFeedback,
  );
  const [retentionProtectBookmarks, setRetentionProtectBookmarks] = useState(
    EMBEDDING_RETENTION_DEFAULTS.protectBookmarks,
  );

  // Form state for AI guidance
  const [aiSummaryPrompt, setAiSummaryPrompt] = useState(AI_GUIDANCE_DEFAULTS.summary_prompt);
  const [aiTriagePrompt, setAiTriagePrompt] = useState(AI_GUIDANCE_DEFAULTS.triage_prompt);

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
    setThemeUseClusterContext(themeTuning.useClusterContext);
    setThemeMaxItemsPerTheme(themeTuning.maxItemsPerTheme);
    setThemeSubthemesEnabled(themeTuning.subthemesEnabled);
    setThemeRefineLabels(themeTuning.refineLabels);
    setThemeMinLabelWords(themeTuning.minLabelWords);
    setThemeMaxDominancePct(themeTuning.maxDominancePct);
    setThemeSimilarityThreshold(themeTuning.similarityThreshold);
    setThemeLookbackDays(themeTuning.lookbackDays);

    // Load embedding retention
    const retention = parseEmbeddingRetention(topic.customSettings?.embedding_retention_v1);
    setRetentionEnabled(retention.enabled);
    setRetentionMaxAgeDays(retention.maxAgeDays);
    setRetentionMaxItems(retention.maxItems);
    setRetentionProtectFeedback(retention.protectFeedback);
    setRetentionProtectBookmarks(retention.protectBookmarks);

    // Load AI guidance
    const aiGuidance = parseAiGuidance(topic.customSettings?.ai_guidance_v1);
    setAiSummaryPrompt(aiGuidance.summary_prompt);
    setAiTriagePrompt(aiGuidance.triage_prompt);
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
        useClusterContext: themeUseClusterContext,
        maxItemsPerTheme: themeMaxItemsPerTheme,
        subthemesEnabled: themeSubthemesEnabled,
        refineLabels: themeRefineLabels,
        minLabelWords: themeMinLabelWords,
        maxDominancePct: themeMaxDominancePct,
        similarityThreshold: themeSimilarityThreshold,
        lookbackDays: themeLookbackDays,
      },
      embedding_retention_v1: {
        enabled: retentionEnabled,
        maxAgeDays: retentionMaxAgeDays,
        maxItems: retentionMaxItems,
        protectFeedback: retentionProtectFeedback,
        protectBookmarks: retentionProtectBookmarks,
      },
      ai_guidance_v1: {
        summary_prompt: aiSummaryPrompt,
        triage_prompt: aiTriagePrompt,
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
    setThemeUseClusterContext(THEME_TUNING_DEFAULTS.useClusterContext);
    setThemeMaxItemsPerTheme(THEME_TUNING_DEFAULTS.maxItemsPerTheme);
    setThemeSubthemesEnabled(THEME_TUNING_DEFAULTS.subthemesEnabled);
    setThemeRefineLabels(THEME_TUNING_DEFAULTS.refineLabels);
    setThemeMinLabelWords(THEME_TUNING_DEFAULTS.minLabelWords);
    setThemeMaxDominancePct(THEME_TUNING_DEFAULTS.maxDominancePct);
    setThemeSimilarityThreshold(THEME_TUNING_DEFAULTS.similarityThreshold);
    setThemeLookbackDays(THEME_TUNING_DEFAULTS.lookbackDays);
    // Reset embedding retention
    setRetentionEnabled(EMBEDDING_RETENTION_DEFAULTS.enabled);
    setRetentionMaxAgeDays(EMBEDDING_RETENTION_DEFAULTS.maxAgeDays);
    setRetentionMaxItems(EMBEDDING_RETENTION_DEFAULTS.maxItems);
    setRetentionProtectFeedback(EMBEDDING_RETENTION_DEFAULTS.protectFeedback);
    setRetentionProtectBookmarks(EMBEDDING_RETENTION_DEFAULTS.protectBookmarks);
    // Reset AI guidance
    setAiSummaryPrompt(AI_GUIDANCE_DEFAULTS.summary_prompt);
    setAiTriagePrompt(AI_GUIDANCE_DEFAULTS.triage_prompt);
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
  const savedEmbeddingRetention = selectedTopic
    ? parseEmbeddingRetention(selectedTopic.customSettings?.embedding_retention_v1)
    : null;
  const savedAiGuidance = selectedTopic
    ? parseAiGuidance(selectedTopic.customSettings?.ai_guidance_v1)
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
      themeUseClusterContext !== savedThemeTuning.useClusterContext ||
      themeMaxItemsPerTheme !== savedThemeTuning.maxItemsPerTheme ||
      themeSubthemesEnabled !== savedThemeTuning.subthemesEnabled ||
      themeRefineLabels !== savedThemeTuning.refineLabels ||
      themeMinLabelWords !== savedThemeTuning.minLabelWords ||
      themeMaxDominancePct !== savedThemeTuning.maxDominancePct ||
      themeSimilarityThreshold !== savedThemeTuning.similarityThreshold ||
      themeLookbackDays !== savedThemeTuning.lookbackDays);

  const hasRetentionChanges =
    savedEmbeddingRetention &&
    (retentionEnabled !== savedEmbeddingRetention.enabled ||
      retentionMaxAgeDays !== savedEmbeddingRetention.maxAgeDays ||
      retentionMaxItems !== savedEmbeddingRetention.maxItems ||
      retentionProtectFeedback !== savedEmbeddingRetention.protectFeedback ||
      retentionProtectBookmarks !== savedEmbeddingRetention.protectBookmarks);

  const hasAiGuidanceChanges =
    savedAiGuidance &&
    (aiSummaryPrompt !== savedAiGuidance.summary_prompt ||
      aiTriagePrompt !== savedAiGuidance.triage_prompt);

  const hasChanges =
    hasPersonalChanges || hasThemeChanges || hasRetentionChanges || hasAiGuidanceChanges;

  // Check if current values differ from defaults
  const isPersonalDefault =
    prefBiasSamplingWeight === PERSONALIZATION_TUNING_DEFAULTS.prefBiasSamplingWeight &&
    prefBiasTriageWeight === PERSONALIZATION_TUNING_DEFAULTS.prefBiasTriageWeight &&
    rankPrefWeight === PERSONALIZATION_TUNING_DEFAULTS.rankPrefWeight &&
    feedbackWeightDelta === PERSONALIZATION_TUNING_DEFAULTS.feedbackWeightDelta;

  const isThemeDefault =
    themeEnabled === THEME_TUNING_DEFAULTS.enabled &&
    themeUseClusterContext === THEME_TUNING_DEFAULTS.useClusterContext &&
    themeMaxItemsPerTheme === THEME_TUNING_DEFAULTS.maxItemsPerTheme &&
    themeSubthemesEnabled === THEME_TUNING_DEFAULTS.subthemesEnabled &&
    themeRefineLabels === THEME_TUNING_DEFAULTS.refineLabels &&
    themeMinLabelWords === THEME_TUNING_DEFAULTS.minLabelWords &&
    themeMaxDominancePct === THEME_TUNING_DEFAULTS.maxDominancePct &&
    themeSimilarityThreshold === THEME_TUNING_DEFAULTS.similarityThreshold &&
    themeLookbackDays === THEME_TUNING_DEFAULTS.lookbackDays;

  const isRetentionDefault =
    retentionEnabled === EMBEDDING_RETENTION_DEFAULTS.enabled &&
    retentionMaxAgeDays === EMBEDDING_RETENTION_DEFAULTS.maxAgeDays &&
    retentionMaxItems === EMBEDDING_RETENTION_DEFAULTS.maxItems &&
    retentionProtectFeedback === EMBEDDING_RETENTION_DEFAULTS.protectFeedback &&
    retentionProtectBookmarks === EMBEDDING_RETENTION_DEFAULTS.protectBookmarks;

  const isAiGuidanceDefault =
    aiSummaryPrompt === AI_GUIDANCE_DEFAULTS.summary_prompt &&
    aiTriagePrompt === AI_GUIDANCE_DEFAULTS.triage_prompt;

  const isDefault =
    isPersonalDefault && isThemeDefault && isRetentionDefault && isAiGuidanceDefault;

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

        {/* Cluster Context Toggle */}
        <div className={styles.section}>
          <div className={styles.toggleGroup}>
            <label htmlFor="themeUseClusterContext" className={styles.toggleLabel}>
              Use Cluster Context for Themes
            </label>
            <button
              id="themeUseClusterContext"
              type="button"
              role="switch"
              aria-checked={themeUseClusterContext}
              className={`${styles.toggle} ${themeUseClusterContext ? styles.toggleOn : ""}`}
              onClick={() => setThemeUseClusterContext(!themeUseClusterContext)}
              disabled={isSaving || !themeEnabled}
            >
              <span className={styles.toggleKnob} />
            </button>
          </div>
          <p className={styles.sliderDescription}>
            When enabled, triage includes a few cluster member titles to generate more specific
            themes. This can increase token usage slightly but often reduces giant buckets like
            &quot;Bitcoin&quot;.
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
              more items, Higher = smaller themes with tighter grouping. 0.70 recommended.
            </p>
          </div>
        </div>

        {/* Minimum Label Words */}
        <div className={styles.section}>
          <div className={styles.sliderGroup}>
            <div className={styles.sliderHeader}>
              <label htmlFor="themeMinLabelWords" className={styles.sliderLabel}>
                Minimum Label Words
              </label>
              <span className={styles.sliderValue}>{themeMinLabelWords}</span>
            </div>
            <input
              id="themeMinLabelWords"
              type="range"
              min={THEME_TUNING_RANGES.minLabelWords.min}
              max={THEME_TUNING_RANGES.minLabelWords.max}
              step={1}
              value={themeMinLabelWords}
              onChange={(e) => setThemeMinLabelWords(Number(e.target.value))}
              className={styles.slider}
              disabled={isSaving || !themeEnabled}
            />
            <div className={styles.sliderRange}>
              <span>{THEME_TUNING_RANGES.minLabelWords.min}</span>
              <span>{THEME_TUNING_RANGES.minLabelWords.max}</span>
            </div>
            <p className={styles.sliderDescription}>
              If a clustered label has fewer words than this, items fall back to their raw triage
              theme. Helps avoid giant buckets like &quot;Bitcoin&quot; when more specific themes
              exist.
            </p>
          </div>
        </div>

        {/* Dominant Theme Cap */}
        <div className={styles.section}>
          <div className={styles.sliderGroup}>
            <div className={styles.sliderHeader}>
              <label htmlFor="themeMaxDominancePct" className={styles.sliderLabel}>
                Dominant Theme Cap
              </label>
              <span className={styles.sliderValue}>
                {themeMaxDominancePct <= 0 ? "Off" : `${Math.round(themeMaxDominancePct * 100)}%`}
              </span>
            </div>
            <input
              id="themeMaxDominancePct"
              type="range"
              min={THEME_TUNING_RANGES.maxDominancePct.min}
              max={THEME_TUNING_RANGES.maxDominancePct.max}
              step={0.05}
              value={themeMaxDominancePct}
              onChange={(e) => setThemeMaxDominancePct(Number(e.target.value))}
              className={styles.slider}
              disabled={isSaving || !themeEnabled}
            />
            <div className={styles.sliderRange}>
              <span>{THEME_TUNING_RANGES.maxDominancePct.min} (Off)</span>
              <span>{THEME_TUNING_RANGES.maxDominancePct.max}</span>
            </div>
            <p className={styles.sliderDescription}>
              If a single theme covers more than this share of items, the pipeline falls back to
              item-specific triage themes to keep groups from swallowing the feed.
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

        {/* Max Items Per Theme */}
        <div className={styles.section}>
          <div className={styles.sliderGroup}>
            <div className={styles.sliderHeader}>
              <label htmlFor="themeMaxItemsPerTheme" className={styles.sliderLabel}>
                Theme Size Cap (items)
              </label>
              <span className={styles.sliderValue}>
                {themeMaxItemsPerTheme === 0 ? "Off" : themeMaxItemsPerTheme}
              </span>
            </div>
            <input
              id="themeMaxItemsPerTheme"
              type="range"
              min={THEME_TUNING_RANGES.maxItemsPerTheme.min}
              max={THEME_TUNING_RANGES.maxItemsPerTheme.max}
              step={1}
              value={themeMaxItemsPerTheme}
              onChange={(e) => setThemeMaxItemsPerTheme(Number(e.target.value))}
              className={styles.slider}
              disabled={isSaving || !themeEnabled}
            />
            <div className={styles.sliderRange}>
              <span>{THEME_TUNING_RANGES.maxItemsPerTheme.min} (Off)</span>
              <span>{THEME_TUNING_RANGES.maxItemsPerTheme.max}</span>
            </div>
            <p className={styles.sliderDescription}>
              Split oversized themes into multiple groups in the feed. This is a UI-only cap and
              does not change ranking or LLM usage.
            </p>
          </div>
        </div>

        {/* Subthemes Toggle */}
        <div className={styles.section}>
          <div className={styles.toggleGroup}>
            <label htmlFor="themeSubthemesEnabled" className={styles.toggleLabel}>
              Enable Subthemes
            </label>
            <button
              id="themeSubthemesEnabled"
              type="button"
              role="switch"
              aria-checked={themeSubthemesEnabled}
              className={`${styles.toggle} ${themeSubthemesEnabled ? styles.toggleOn : ""}`}
              onClick={() => setThemeSubthemesEnabled(!themeSubthemesEnabled)}
              disabled={isSaving || !themeEnabled}
            >
              <span className={styles.toggleKnob} />
            </button>
          </div>
          <p className={styles.sliderDescription}>
            Group items within a theme into subthemes using simple keyword heuristics (no extra LLM
            cost). Helps break up very broad themes.
          </p>
        </div>

        {/* Refine Labels Toggle */}
        <div className={styles.section}>
          <div className={styles.toggleGroup}>
            <label htmlFor="themeRefineLabels" className={styles.toggleLabel}>
              Refine Theme Labels
            </label>
            <button
              id="themeRefineLabels"
              type="button"
              role="switch"
              aria-checked={themeRefineLabels}
              className={`${styles.toggle} ${themeRefineLabels ? styles.toggleOn : ""}`}
              onClick={() => setThemeRefineLabels(!themeRefineLabels)}
              disabled={isSaving || !themeEnabled}
            >
              <span className={styles.toggleKnob} />
            </button>
          </div>
          <p className={styles.sliderDescription}>
            Clean up and enrich broad labels with lightweight, non-LLM hints (e.g., appending a
            recurring keyword).
          </p>
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

        {/* Embedding Retention Section */}
        <div className={styles.sectionDivider}>
          <h2 className={styles.sectionTitle}>Embedding Retention</h2>
          <p className={styles.sectionSubtitle}>
            Keep embeddings bounded without losing your best signals. Retention is topic-scoped and
            never deletes items with feedback or bookmarks unless you disable those protections.
            Items shared across topics are preserved.
          </p>
        </div>

        {/* Retention Enabled Toggle */}
        <div className={styles.section}>
          <div className={styles.toggleGroup}>
            <label htmlFor="retentionEnabled" className={styles.toggleLabel}>
              Enable Embedding Retention
            </label>
            <button
              id="retentionEnabled"
              type="button"
              role="switch"
              aria-checked={retentionEnabled}
              className={`${styles.toggle} ${retentionEnabled ? styles.toggleOn : ""}`}
              onClick={() => setRetentionEnabled(!retentionEnabled)}
              disabled={isSaving}
            >
              <span className={styles.toggleKnob} />
            </button>
          </div>
          <p className={styles.sliderDescription}>
            When enabled, embeddings older than the retention window are pruned during pipeline
            runs.
          </p>
        </div>

        {/* Retention Window */}
        <div className={styles.section}>
          <div className={styles.sliderGroup}>
            <div className={styles.sliderHeader}>
              <label htmlFor="retentionMaxAgeDays" className={styles.sliderLabel}>
                Retention Window (days)
              </label>
              <span className={styles.sliderValue}>{retentionMaxAgeDays}</span>
            </div>
            <input
              id="retentionMaxAgeDays"
              type="range"
              min={EMBEDDING_RETENTION_RANGES.maxAgeDays.min}
              max={EMBEDDING_RETENTION_RANGES.maxAgeDays.max}
              step={1}
              value={retentionMaxAgeDays}
              onChange={(e) => setRetentionMaxAgeDays(Number(e.target.value))}
              className={styles.slider}
              disabled={isSaving || !retentionEnabled}
            />
            <div className={styles.sliderRange}>
              <span>{EMBEDDING_RETENTION_RANGES.maxAgeDays.min} days</span>
              <span>{EMBEDDING_RETENTION_RANGES.maxAgeDays.max} days</span>
            </div>
            <p className={styles.sliderDescription}>
              Embeddings older than this window can be removed to control storage growth.
            </p>
          </div>
        </div>

        {/* Retention Max Items */}
        <div className={styles.section}>
          <div className={styles.sliderGroup}>
            <div className={styles.sliderHeader}>
              <label htmlFor="retentionMaxItems" className={styles.sliderLabel}>
                Embedding Cap (items)
              </label>
              <span className={styles.sliderValue}>
                {retentionMaxItems === 0 ? "Off" : retentionMaxItems.toLocaleString()}
              </span>
            </div>
            <input
              id="retentionMaxItems"
              type="range"
              min={EMBEDDING_RETENTION_RANGES.maxItems.min}
              max={EMBEDDING_RETENTION_RANGES.maxItems.max}
              step={1000}
              value={retentionMaxItems}
              onChange={(e) => setRetentionMaxItems(Number(e.target.value))}
              className={styles.slider}
              disabled={isSaving || !retentionEnabled}
            />
            <div className={styles.sliderRange}>
              <span>{EMBEDDING_RETENTION_RANGES.maxItems.min} (Off)</span>
              <span>{EMBEDDING_RETENTION_RANGES.maxItems.max.toLocaleString()}</span>
            </div>
            <p className={styles.sliderDescription}>
              Optional hard cap on how many embeddings to retain for this topic. If exceeded, the
              oldest embeddings are pruned after the age window is applied.
            </p>
          </div>
        </div>

        {/* Protect Feedback Toggle */}
        <div className={styles.section}>
          <div className={styles.toggleGroup}>
            <label htmlFor="retentionProtectFeedback" className={styles.toggleLabel}>
              Protect Feedback Items
            </label>
            <button
              id="retentionProtectFeedback"
              type="button"
              role="switch"
              aria-checked={retentionProtectFeedback}
              className={`${styles.toggle} ${retentionProtectFeedback ? styles.toggleOn : ""}`}
              onClick={() => setRetentionProtectFeedback(!retentionProtectFeedback)}
              disabled={isSaving || !retentionEnabled}
            >
              <span className={styles.toggleKnob} />
            </button>
          </div>
          <p className={styles.sliderDescription}>
            Keep embeddings for items you liked or disliked so preference profiles remain stable.
          </p>
        </div>

        {/* Protect Bookmarks Toggle */}
        <div className={styles.section}>
          <div className={styles.toggleGroup}>
            <label htmlFor="retentionProtectBookmarks" className={styles.toggleLabel}>
              Protect Bookmarked Items
            </label>
            <button
              id="retentionProtectBookmarks"
              type="button"
              role="switch"
              aria-checked={retentionProtectBookmarks}
              className={`${styles.toggle} ${retentionProtectBookmarks ? styles.toggleOn : ""}`}
              onClick={() => setRetentionProtectBookmarks(!retentionProtectBookmarks)}
              disabled={isSaving || !retentionEnabled}
            >
              <span className={styles.toggleKnob} />
            </button>
          </div>
          <p className={styles.sliderDescription}>
            Preserve embeddings for saved items you might revisit later.
          </p>
        </div>

        {/* AI Guidance Section */}
        <div className={styles.sectionDivider}>
          <h2 className={styles.sectionTitle}>{t("admin.aiGuidance.title")}</h2>
          <p className={styles.sectionSubtitle}>{t("admin.aiGuidance.subtitle")}</p>
        </div>

        {/* Summary Prompt */}
        <div className={styles.section}>
          <div className={styles.textareaGroup}>
            <label htmlFor="aiSummaryPrompt" className={styles.sliderLabel}>
              {t("admin.aiGuidance.summaryPrompt.label")}
            </label>
            <p className={styles.sliderDescription}>
              {t("admin.aiGuidance.summaryPrompt.description")}
            </p>
            <textarea
              id="aiSummaryPrompt"
              value={aiSummaryPrompt}
              onChange={(e) => setAiSummaryPrompt(e.target.value)}
              placeholder={t("admin.aiGuidance.summaryPrompt.placeholder")}
              className={styles.textarea}
              disabled={isSaving}
              maxLength={AI_GUIDANCE_MAX_LENGTH}
              rows={4}
            />
            <div className={styles.charCount}>
              {aiSummaryPrompt.length} / {AI_GUIDANCE_MAX_LENGTH}
            </div>
          </div>
        </div>

        {/* Triage Prompt */}
        <div className={styles.section}>
          <div className={styles.textareaGroup}>
            <label htmlFor="aiTriagePrompt" className={styles.sliderLabel}>
              {t("admin.aiGuidance.triagePrompt.label")}
            </label>
            <p className={styles.sliderDescription}>
              {t("admin.aiGuidance.triagePrompt.description")}
            </p>
            <textarea
              id="aiTriagePrompt"
              value={aiTriagePrompt}
              onChange={(e) => setAiTriagePrompt(e.target.value)}
              placeholder={t("admin.aiGuidance.triagePrompt.placeholder")}
              className={styles.textarea}
              disabled={isSaving}
              maxLength={AI_GUIDANCE_MAX_LENGTH}
              rows={4}
            />
            <div className={styles.charCount}>
              {aiTriagePrompt.length} / {AI_GUIDANCE_MAX_LENGTH}
            </div>
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
