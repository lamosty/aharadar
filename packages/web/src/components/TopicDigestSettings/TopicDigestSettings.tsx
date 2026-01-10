"use client";

import { useEffect, useMemo, useState } from "react";
import type { DigestMode, Source, Topic } from "@/lib/api";
import { useUpdateTopicDigestSettings } from "@/lib/hooks";
import { t } from "@/lib/i18n";
import styles from "./TopicDigestSettings.module.css";

type CadencePreset = "daily" | "weekly" | "monthly" | "custom";

const CADENCE_PRESETS: Record<CadencePreset, number | null> = {
  daily: 1440, // 24 hours
  weekly: 10080, // 7 days
  monthly: 43200, // 30 days
  custom: null,
};

type IntervalUnit = "hours" | "days";

/**
 * Convert interval minutes to a user-friendly value + unit
 */
function minutesToValueAndUnit(minutes: number): { value: number; unit: IntervalUnit } {
  // Prefer days if it divides evenly and is >= 1 day
  if (minutes >= 1440 && minutes % 1440 === 0) {
    return { value: minutes / 1440, unit: "days" };
  }
  // Otherwise use hours (minimum 1 hour)
  return { value: Math.max(1, Math.round(minutes / 60)), unit: "hours" };
}

/**
 * Convert value + unit back to minutes
 */
function valueAndUnitToMinutes(value: number, unit: IntervalUnit): number {
  if (unit === "days") {
    return value * 1440;
  }
  return value * 60;
}

const MODE_OPTIONS: DigestMode[] = ["low", "normal", "high"];

interface TopicDigestSettingsProps {
  topic: Topic;
  enabledSourceCount: number;
  sources?: Source[]; // Optional: for Grok cost estimation
}

// Grok pricing (as of 2026-01)
// Search API: $5 per 1000 calls = $0.005 per call
const GROK_SEARCH_COST_PER_CALL = 0.005;
// Token costs (grok-4-1-fast-non-reasoning)
const GROK_INPUT_PER_1M = 0.2; // $0.20 per 1M input tokens
const GROK_OUTPUT_PER_1M = 0.5; // $0.50 per 1M output tokens
const GROK_INPUT_TOKENS_PER_CALL = 700; // System prompt + query
const GROK_OUTPUT_TOKENS_PER_CALL = 1500; // Average between low (900) and high (2000) tier

/**
 * Estimate number of Grok API calls for x_posts sources.
 * - Single mode (default): 1 call per account
 * - Batch mode: 1 call per group
 * - Raw queries: 1 call per query
 */
function estimateGrokCalls(sources: Source[]): number {
  let totalCalls = 0;

  for (const source of sources) {
    if (source.type !== "x_posts" || !source.isEnabled) continue;

    const config = source.config as Record<string, unknown> | undefined;
    if (!config) continue;

    // Check for raw queries first
    const queries = config.queries as string[] | undefined;
    if (queries && queries.length > 0) {
      totalCalls += queries.length;
      continue;
    }

    // Check for batch mode
    const batching = config.batching as { mode?: string; groups?: string[][] } | undefined;
    if (batching?.mode === "manual" && batching.groups) {
      totalCalls += batching.groups.length;
      continue;
    }

    // Default: single mode - 1 call per account
    const accounts = config.accounts as string[] | undefined;
    if (accounts && accounts.length > 0) {
      totalCalls += accounts.length;
    }
  }

  return totalCalls;
}

/**
 * Estimate Grok API cost per digest run.
 * Includes both search API fee ($5/1000 calls) and token costs.
 */
function estimateGrokCost(grokCalls: number): number {
  // Search API fee: $0.005 per call
  const searchCost = grokCalls * GROK_SEARCH_COST_PER_CALL;
  // Token costs
  const inputCost = ((GROK_INPUT_TOKENS_PER_CALL * grokCalls) / 1_000_000) * GROK_INPUT_PER_1M;
  const outputCost = ((GROK_OUTPUT_TOKENS_PER_CALL * grokCalls) / 1_000_000) * GROK_OUTPUT_PER_1M;
  return searchCost + inputCost + outputCost;
}

/**
 * Compute digest plan values (must stay in sync with pipeline/lib/digest_plan.ts)
 */
function computeDigestPlan(mode: DigestMode, depth: number, sourceCount: number) {
  // Mode coefficients - must match backend digest_plan.ts
  const coeffByMode = {
    low: {
      base: 10,
      perSource: 1,
      min: 20,
      max: 80,
      triageMultiplier: 2,
      deepSummaryRatio: 0,
      deepSummaryMax: 0,
    },
    normal: {
      base: 20,
      perSource: 2,
      min: 40,
      max: 150,
      triageMultiplier: 3,
      deepSummaryRatio: 0.15,
      deepSummaryMax: 20,
    },
    high: {
      base: 50,
      perSource: 5,
      min: 100,
      max: 300,
      triageMultiplier: 5,
      deepSummaryRatio: 0.3,
      deepSummaryMax: 60,
    },
  };

  const coeff = coeffByMode[mode];
  const depthFactor = 0.5 + depth / 100; // 0.5 to 1.5

  // Calculate digest max items with per-source scaling and min/max clamping
  const rawMaxItems = Math.round((coeff.base + coeff.perSource * sourceCount) * depthFactor);
  const digestMaxItems = Math.max(coeff.min, Math.min(coeff.max, rawMaxItems));

  // Calculate triage max calls
  const rawTriageCalls = digestMaxItems * coeff.triageMultiplier;
  const triageMaxCalls = Math.max(digestMaxItems, Math.min(5000, rawTriageCalls));

  // Calculate deep summary max calls
  const rawDeepSummary = Math.round(digestMaxItems * coeff.deepSummaryRatio);
  const deepSummaryMaxCalls = Math.min(coeff.deepSummaryMax, rawDeepSummary);

  // Calculate candidate pool max
  const candidatePoolMax = Math.min(5000, Math.max(500, digestMaxItems * 20));

  return {
    digestMaxItems,
    triageMaxCalls,
    deepSummaryMaxCalls,
    candidatePoolMax,
  };
}

// Cost estimation constants (USD, assuming Haiku/GPT-4-mini tier)
const TRIAGE_COST = 0.002; // ~500 in + 200 out tokens
const SUMMARY_COST = 0.008; // ~2000 in + 500 out tokens
const MINUTES_PER_MONTH = 43200; // 30 days

/**
 * Estimate cost per digest run based on LLM calls.
 */
function estimateCostPerRun(triageCalls: number, summaryCalls: number): string {
  const totalCost = triageCalls * TRIAGE_COST + summaryCalls * SUMMARY_COST;
  if (totalCost < 0.01) return "<$0.01";
  return `~$${totalCost.toFixed(2)}`;
}

/**
 * Estimate number of runs per month based on interval.
 */
function estimateMonthlyRuns(intervalMinutes: number): number {
  return Math.round(MINUTES_PER_MONTH / intervalMinutes);
}

/**
 * Estimate monthly cost based on runs per month.
 */
function estimateMonthlyCost(
  triageCalls: number,
  summaryCalls: number,
  intervalMinutes: number,
): string {
  const runsPerMonth = estimateMonthlyRuns(intervalMinutes);
  const costPerRun = triageCalls * TRIAGE_COST + summaryCalls * SUMMARY_COST;
  const monthlyCost = runsPerMonth * costPerRun;
  if (monthlyCost < 0.1) return "<$0.10";
  if (monthlyCost < 1) return `~$${monthlyCost.toFixed(2)}`;
  return `~$${Math.round(monthlyCost)}`;
}

export function TopicDigestSettings({
  topic,
  enabledSourceCount,
  sources = [],
}: TopicDigestSettingsProps) {
  const updateMutation = useUpdateTopicDigestSettings(topic.id);

  // Calculate Grok calls for x_posts sources
  const grokCalls = useMemo(() => estimateGrokCalls(sources), [sources]);

  // Local state for form
  const [scheduleEnabled, setScheduleEnabled] = useState(topic.digestScheduleEnabled);
  const [intervalMinutes, setIntervalMinutes] = useState(topic.digestIntervalMinutes);
  const [mode, setMode] = useState<DigestMode>(topic.digestMode);
  const [depth, setDepth] = useState(topic.digestDepth);
  const [hasChanges, setHasChanges] = useState(false);

  // Track preset selection separately (needed because clicking "custom" shouldn't change interval)
  const derivedPreset = useMemo((): CadencePreset => {
    if (intervalMinutes === 1440) return "daily";
    if (intervalMinutes === 10080) return "weekly";
    if (intervalMinutes === 43200) return "monthly";
    return "custom";
  }, [intervalMinutes]);

  const [selectedPreset, setSelectedPreset] = useState<CadencePreset>(derivedPreset);

  // Custom interval state (value + unit for user-friendly editing)
  const initialCustom = useMemo(() => minutesToValueAndUnit(intervalMinutes), []);
  const [customValue, setCustomValue] = useState(initialCustom.value);
  const [customUnit, setCustomUnit] = useState<IntervalUnit>(initialCustom.unit);

  // Sync selectedPreset when interval changes to a known preset value
  useEffect(() => {
    if (intervalMinutes === 1440) setSelectedPreset("daily");
    else if (intervalMinutes === 10080) setSelectedPreset("weekly");
    else if (intervalMinutes === 43200) setSelectedPreset("monthly");
  }, [intervalMinutes]);

  // Track changes
  useEffect(() => {
    const changed =
      scheduleEnabled !== topic.digestScheduleEnabled ||
      intervalMinutes !== topic.digestIntervalMinutes ||
      mode !== topic.digestMode ||
      depth !== topic.digestDepth;
    setHasChanges(changed);
  }, [
    scheduleEnabled,
    intervalMinutes,
    mode,
    depth,
    topic.digestScheduleEnabled,
    topic.digestIntervalMinutes,
    topic.digestMode,
    topic.digestDepth,
  ]);

  // Compute derived values
  const plan = useMemo(
    () => computeDigestPlan(mode, depth, enabledSourceCount),
    [mode, depth, enabledSourceCount],
  );

  const handlePresetChange = (preset: CadencePreset) => {
    setSelectedPreset(preset);
    const minutes = CADENCE_PRESETS[preset];
    if (minutes !== null) {
      setIntervalMinutes(minutes);
    } else {
      // For "custom", initialize custom value/unit from current interval
      const { value, unit } = minutesToValueAndUnit(intervalMinutes);
      setCustomValue(value);
      setCustomUnit(unit);
    }
  };

  const handleCustomValueChange = (value: number) => {
    setCustomValue(value);
    setIntervalMinutes(valueAndUnitToMinutes(value, customUnit));
  };

  const handleCustomUnitChange = (unit: IntervalUnit) => {
    setCustomUnit(unit);
    setIntervalMinutes(valueAndUnitToMinutes(customValue, unit));
  };

  const handleSave = async () => {
    try {
      await updateMutation.mutateAsync({
        digestScheduleEnabled: scheduleEnabled,
        digestIntervalMinutes: intervalMinutes,
        digestMode: mode,
        digestDepth: depth,
      });
    } catch {
      // Error is handled by mutation
    }
  };

  const handleCancel = () => {
    setScheduleEnabled(topic.digestScheduleEnabled);
    setIntervalMinutes(topic.digestIntervalMinutes);
    setMode(topic.digestMode);
    setDepth(topic.digestDepth);
    // Reset preset to match the original interval
    if (topic.digestIntervalMinutes === 1440) setSelectedPreset("daily");
    else if (topic.digestIntervalMinutes === 10080) setSelectedPreset("weekly");
    else if (topic.digestIntervalMinutes === 43200) setSelectedPreset("monthly");
    else setSelectedPreset("custom");
    // Reset custom value/unit
    const { value, unit } = minutesToValueAndUnit(topic.digestIntervalMinutes);
    setCustomValue(value);
    setCustomUnit(unit);
  };

  const isPending = updateMutation.isPending;

  return (
    <div className={styles.container}>
      {/* Schedule section */}
      <div className={styles.section}>
        <h5 className={styles.sectionTitle}>{t("topics.digestSettings.schedule.title")}</h5>

        <label className={styles.toggleRow}>
          <span className={styles.toggleLabel}>
            {t("topics.digestSettings.schedule.enableToggle")}
          </span>
          <input
            type="checkbox"
            checked={scheduleEnabled}
            onChange={(e) => setScheduleEnabled(e.target.checked)}
            disabled={isPending}
            className={styles.checkbox}
          />
        </label>

        {scheduleEnabled && (
          <>
            <div className={styles.presetRow}>
              <span className={styles.fieldLabel}>
                {t("topics.digestSettings.schedule.frequency")}
              </span>
              <div className={styles.presetButtons}>
                {(["daily", "weekly", "monthly", "custom"] as const).map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    className={`${styles.presetButton} ${selectedPreset === preset ? styles.presetButtonActive : ""}`}
                    onClick={() => handlePresetChange(preset)}
                    disabled={isPending}
                  >
                    {t(`topics.digestSettings.schedule.presets.${preset}`)}
                  </button>
                ))}
              </div>
            </div>

            {selectedPreset === "custom" && (
              <div className={styles.customIntervalRow}>
                <span className={styles.fieldLabel}>Every</span>
                <input
                  type="number"
                  min={1}
                  max={customUnit === "hours" ? 720 : 30}
                  value={customValue}
                  onChange={(e) =>
                    handleCustomValueChange(Math.max(1, parseInt(e.target.value, 10) || 1))
                  }
                  disabled={isPending}
                  className={styles.numberInput}
                />
                <select
                  value={customUnit}
                  onChange={(e) => handleCustomUnitChange(e.target.value as IntervalUnit)}
                  disabled={isPending}
                  className={styles.unitSelect}
                >
                  <option value="hours">{customValue === 1 ? "hour" : "hours"}</option>
                  <option value="days">{customValue === 1 ? "day" : "days"}</option>
                </select>
              </div>
            )}
          </>
        )}
      </div>

      {/* Depth section */}
      <div className={styles.section}>
        <h5 className={styles.sectionTitle}>{t("topics.digestSettings.depth.title")}</h5>

        <div className={styles.fieldRow}>
          <span className={styles.fieldLabel}>{t("topics.digestSettings.depth.mode")}</span>
          <div className={styles.modeButtons}>
            {MODE_OPTIONS.map((m) => (
              <button
                key={m}
                type="button"
                className={`${styles.modeButton} ${mode === m ? styles.modeButtonActive : ""}`}
                onClick={() => setMode(m)}
                disabled={isPending}
              >
                {t(`topics.digestSettings.depth.modes.${m}`)}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.sliderRow}>
          <label className={styles.fieldLabel}>
            {t("topics.digestSettings.depth.depthSlider")}
          </label>
          <input
            type="range"
            min={0}
            max={100}
            value={depth}
            onChange={(e) => setDepth(parseInt(e.target.value, 10))}
            disabled={isPending}
            className={styles.slider}
          />
          <span className={styles.sliderValue}>{depth}%</span>
        </div>

        <p className={styles.hint}>{t("topics.digestSettings.depth.hint")}</p>
      </div>

      {/* Preview section */}
      <div className={styles.preview}>
        <h5 className={styles.previewTitle}>{t("topics.digestSettings.preview.title")}</h5>
        <div className={styles.previewGrid}>
          <div className={styles.previewItem}>
            <span className={styles.previewValue}>{plan.digestMaxItems}</span>
            <span className={styles.previewLabel}>
              {t("topics.digestSettings.preview.digestItems")}
            </span>
          </div>
          <div className={styles.previewItem}>
            <span className={styles.previewValue}>{plan.triageMaxCalls}</span>
            <span className={styles.previewLabel}>
              {t("topics.digestSettings.preview.triageCalls")}
            </span>
          </div>
          <div className={styles.previewItem}>
            <span className={styles.previewValue}>{plan.deepSummaryMaxCalls}</span>
            <span className={styles.previewLabel}>
              {t("topics.digestSettings.preview.deepSummaries")}
            </span>
          </div>
          <div className={styles.previewItem}>
            <span className={styles.previewValue}>{enabledSourceCount}</span>
            <span className={styles.previewLabel}>
              {t("topics.digestSettings.preview.enabledSources")}
            </span>
          </div>
        </div>

        {/* Cost estimate */}
        <div className={styles.costEstimate}>
          <div className={styles.costRow}>
            <span className={styles.costLabel}>LLM processing:</span>
            <span className={styles.costValue}>
              {estimateCostPerRun(plan.triageMaxCalls, plan.deepSummaryMaxCalls)}/run
            </span>
          </div>
          {grokCalls > 0 && (
            <div className={styles.costRow}>
              <span className={styles.costLabel}>X/Grok ({grokCalls} calls):</span>
              <span className={styles.costValue}>
                ~${estimateGrokCost(grokCalls).toFixed(3)}/run
              </span>
            </div>
          )}
          <div className={styles.costRowTotal}>
            <span className={styles.costLabel}>Total:</span>
            <span className={styles.costValue}>
              ~$
              {(
                plan.triageMaxCalls * TRIAGE_COST +
                plan.deepSummaryMaxCalls * SUMMARY_COST +
                estimateGrokCost(grokCalls)
              ).toFixed(2)}
              /run
            </span>
            {scheduleEnabled && (
              <span className={styles.costMonthly}>
                ({estimateMonthlyRuns(intervalMinutes)} runs/mo ≈ ~$
                {(
                  estimateMonthlyRuns(intervalMinutes) *
                  (plan.triageMaxCalls * TRIAGE_COST +
                    plan.deepSummaryMaxCalls * SUMMARY_COST +
                    estimateGrokCost(grokCalls))
                ).toFixed(2)}
                /mo)
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Actions */}
      {hasChanges && (
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.cancelButton}
            onClick={handleCancel}
            disabled={isPending}
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            className={styles.saveButton}
            onClick={handleSave}
            disabled={isPending}
          >
            {isPending ? t("common.saving") : t("common.save")}
          </button>
        </div>
      )}

      {updateMutation.isError && (
        <p className={styles.errorMessage}>{t("topics.digestSettings.updateFailed")}</p>
      )}
      {updateMutation.isSuccess && !hasChanges && (
        <p className={styles.successMessage}>{t("topics.digestSettings.updateSuccess")}</p>
      )}
    </div>
  );
}
