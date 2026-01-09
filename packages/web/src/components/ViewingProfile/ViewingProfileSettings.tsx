"use client";

import { useState } from "react";
import type { ViewingProfile } from "@/lib/api";
import { usePreferences, useUpdatePreferences } from "@/lib/hooks";
import { t } from "@/lib/i18n";
import styles from "./ViewingProfileSettings.module.css";

const PROFILE_OPTIONS: { value: ViewingProfile; decayHours: number }[] = [
  { value: "power", decayHours: 4 },
  { value: "daily", decayHours: 24 },
  { value: "weekly", decayHours: 168 },
  { value: "research", decayHours: 720 },
  { value: "custom", decayHours: 24 },
];

export function ViewingProfileSettings() {
  const { data, isLoading, isError } = usePreferences();
  const updateMutation = useUpdatePreferences();
  const [customDecay, setCustomDecay] = useState<number | null>(null);

  if (isLoading) {
    return <div className={styles.loading}>{t("common.loading")}</div>;
  }

  if (isError || !data) {
    return <div className={styles.error}>{t("common.error")}</div>;
  }

  const { preferences } = data;
  const currentProfile = preferences.viewingProfile;
  const currentDecay = customDecay ?? preferences.decayHours;

  const handleProfileChange = (profile: ViewingProfile) => {
    const option = PROFILE_OPTIONS.find((o) => o.value === profile);
    if (profile === "custom") {
      // Keep current decay when switching to custom
      updateMutation.mutate({ viewingProfile: profile });
    } else if (option) {
      updateMutation.mutate({ viewingProfile: profile, decayHours: option.decayHours });
    }
  };

  const handleDecayChange = (hours: number) => {
    setCustomDecay(hours);
    // Debounce the API call
    updateMutation.mutate({ decayHours: hours });
  };

  const formatLastChecked = (dateStr: string | null) => {
    if (!dateStr) return t("settings.viewing.never");
    const date = new Date(dateStr);
    return date.toLocaleString();
  };

  return (
    <div className={styles.container}>
      <p className={styles.description}>{t("settings.viewing.description")}</p>

      <div className={styles.profileGrid}>
        {PROFILE_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`${styles.profileButton} ${currentProfile === option.value ? styles.profileButtonActive : ""}`}
            onClick={() => handleProfileChange(option.value)}
            disabled={updateMutation.isPending}
          >
            <span className={styles.profileLabel}>
              {t(`settings.viewing.profiles.${option.value}`)}
            </span>
            <span className={styles.profileDescription}>
              {t(`settings.viewing.profileDescriptions.${option.value}`)}
            </span>
            {option.value !== "custom" && (
              <span className={styles.profileDecay}>{option.decayHours}h decay</span>
            )}
          </button>
        ))}
      </div>

      {currentProfile === "custom" && (
        <div className={styles.customSettings}>
          <label className={styles.label}>
            {t("settings.viewing.decayHours")}
            <input
              type="range"
              min="1"
              max="720"
              step="1"
              value={currentDecay}
              onChange={(e) => handleDecayChange(parseInt(e.target.value, 10))}
              className={styles.slider}
              disabled={updateMutation.isPending}
            />
            <span className={styles.sliderValue}>{currentDecay}h</span>
          </label>
          <p className={styles.hint}>{t("settings.viewing.decayHoursDescription")}</p>
        </div>
      )}

      <div className={styles.lastChecked}>
        <span className={styles.lastCheckedLabel}>{t("settings.viewing.lastChecked")}:</span>
        <span className={styles.lastCheckedValue}>
          {formatLastChecked(preferences.lastCheckedAt)}
        </span>
      </div>

      {updateMutation.isError && (
        <p className={styles.errorMessage}>{t("settings.viewing.updateFailed")}</p>
      )}
    </div>
  );
}
