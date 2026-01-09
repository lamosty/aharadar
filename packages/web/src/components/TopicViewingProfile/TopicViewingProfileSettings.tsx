"use client";

import { useState } from "react";
import type { ProfileOption, Topic, ViewingProfile } from "@/lib/api";
import { useTopicMarkChecked, useUpdateTopicViewingProfile } from "@/lib/hooks";
import { t } from "@/lib/i18n";
import styles from "./TopicViewingProfileSettings.module.css";

const PROFILE_OPTIONS: { value: ViewingProfile; decayHours: number }[] = [
  { value: "power", decayHours: 4 },
  { value: "daily", decayHours: 24 },
  { value: "weekly", decayHours: 168 },
  { value: "research", decayHours: 720 },
  { value: "custom", decayHours: 24 },
];

interface TopicViewingProfileSettingsProps {
  topic: Topic;
  profileOptions?: ProfileOption[];
}

export function TopicViewingProfileSettings({ topic }: TopicViewingProfileSettingsProps) {
  const updateMutation = useUpdateTopicViewingProfile(topic.id);
  const markCheckedMutation = useTopicMarkChecked(topic.id);
  const [customDecay, setCustomDecay] = useState<number | null>(null);

  const currentProfile = topic.viewingProfile;
  const currentDecay = customDecay ?? topic.decayHours;

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

  const handleMarkCaughtUp = () => {
    markCheckedMutation.mutate();
  };

  const formatLastChecked = (dateStr: string | null) => {
    if (!dateStr) return t("settings.viewing.never");
    const date = new Date(dateStr);
    return date.toLocaleString();
  };

  const isPending = updateMutation.isPending || markCheckedMutation.isPending;

  return (
    <div className={styles.container}>
      <div className={styles.profileGrid}>
        {PROFILE_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`${styles.profileButton} ${currentProfile === option.value ? styles.profileButtonActive : ""}`}
            onClick={() => handleProfileChange(option.value)}
            disabled={isPending}
          >
            <div className={styles.profileContent}>
              <span className={styles.profileLabel}>
                {t(`settings.viewing.profiles.${option.value}`)}
              </span>
              <span className={styles.profileDescription}>
                {t(`settings.viewing.profileDescriptions.${option.value}`)}
              </span>
            </div>
            {option.value !== "custom" && (
              <span className={styles.profileDecay}>{option.decayHours}h</span>
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
              disabled={isPending}
            />
            <span className={styles.sliderValue}>{currentDecay}h</span>
          </label>
          <p className={styles.hint}>{t("settings.viewing.decayHoursDescription")}</p>
        </div>
      )}

      <div className={styles.footer}>
        <div className={styles.lastChecked}>
          <span className={styles.lastCheckedLabel}>{t("settings.viewing.lastChecked")}:</span>
          <span className={styles.lastCheckedValue}>{formatLastChecked(topic.lastCheckedAt)}</span>
        </div>
        <button
          type="button"
          className={styles.markCaughtUpButton}
          onClick={handleMarkCaughtUp}
          disabled={isPending}
        >
          {markCheckedMutation.isPending
            ? t("digests.feed.markingCaughtUp")
            : t("digests.feed.markCaughtUp")}
        </button>
      </div>

      {(updateMutation.isError || markCheckedMutation.isError) && (
        <p className={styles.errorMessage}>{t("settings.viewing.updateFailed")}</p>
      )}
    </div>
  );
}
