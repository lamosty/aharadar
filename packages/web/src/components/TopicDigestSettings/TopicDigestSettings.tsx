"use client";

import { useEffect, useMemo, useState } from "react";
import type { DigestMode, Topic } from "@/lib/api";
import { useUpdateTopicDigestSettings } from "@/lib/hooks";
import { t } from "@/lib/i18n";
import styles from "./TopicDigestSettings.module.css";

type CadencePreset = "daily" | "weekly" | "custom";

const CADENCE_PRESETS: Record<CadencePreset, number | null> = {
  daily: 1440, // 24 hours
  weekly: 10080, // 7 days
  custom: null,
};

const MODE_OPTIONS: DigestMode[] = ["low", "normal", "high"];

interface TopicDigestSettingsProps {
  topic: Topic;
  enabledSourceCount: number;
}

/**
 * Compute digest plan values (must stay in sync with pipeline/lib/digest_plan.ts)
 */
function computeDigestPlan(mode: DigestMode, depth: number, sourceCount: number) {
  // Base values per mode
  const baseByMode: Record<DigestMode, { items: number; triage: number; summary: number }> = {
    low: { items: 10, triage: 15, summary: 3 },
    normal: { items: 25, triage: 40, summary: 8 },
    high: { items: 100, triage: 150, summary: 25 },
  };

  const base = baseByMode[mode];
  const depthMultiplier = 0.5 + depth / 100; // 0.5 to 1.5

  // Apply depth scaling
  const digestMaxItems = Math.round(base.items * depthMultiplier);
  const triageMaxCalls = Math.round(base.triage * depthMultiplier);
  const deepSummaryMaxCalls = Math.round(base.summary * depthMultiplier);

  return {
    digestMaxItems,
    triageMaxCalls,
    deepSummaryMaxCalls,
    candidatePoolMax: triageMaxCalls * 3,
  };
}

export function TopicDigestSettings({ topic, enabledSourceCount }: TopicDigestSettingsProps) {
  const updateMutation = useUpdateTopicDigestSettings(topic.id);

  // Local state for form
  const [scheduleEnabled, setScheduleEnabled] = useState(topic.digestScheduleEnabled);
  const [intervalMinutes, setIntervalMinutes] = useState(topic.digestIntervalMinutes);
  const [mode, setMode] = useState<DigestMode>(topic.digestMode);
  const [depth, setDepth] = useState(topic.digestDepth);
  const [hasChanges, setHasChanges] = useState(false);

  // Determine current cadence preset
  const currentPreset = useMemo((): CadencePreset => {
    if (intervalMinutes === 1440) return "daily";
    if (intervalMinutes === 10080) return "weekly";
    return "custom";
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
    const minutes = CADENCE_PRESETS[preset];
    if (minutes !== null) {
      setIntervalMinutes(minutes);
    }
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
                {t("topics.digestSettings.schedule.cadence")}
              </span>
              <div className={styles.presetButtons}>
                {(["daily", "weekly", "custom"] as const).map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    className={`${styles.presetButton} ${currentPreset === preset ? styles.presetButtonActive : ""}`}
                    onClick={() => handlePresetChange(preset)}
                    disabled={isPending}
                  >
                    {t(`topics.digestSettings.schedule.presets.${preset}`)}
                  </button>
                ))}
              </div>
            </div>

            {currentPreset === "custom" && (
              <div className={styles.fieldRow}>
                <label className={styles.fieldLabel}>
                  {t("topics.digestSettings.schedule.customInterval")}
                </label>
                <input
                  type="number"
                  min={15}
                  max={43200}
                  value={intervalMinutes}
                  onChange={(e) => setIntervalMinutes(parseInt(e.target.value, 10) || 60)}
                  disabled={isPending}
                  className={styles.numberInput}
                />
                <span className={styles.fieldUnit}>min</span>
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
