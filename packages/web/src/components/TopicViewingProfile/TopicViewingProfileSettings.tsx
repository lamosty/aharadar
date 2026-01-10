"use client";

import type { Topic } from "@/lib/api";
import { useTopicMarkChecked } from "@/lib/hooks";
import { t } from "@/lib/i18n";
import styles from "./TopicViewingProfileSettings.module.css";

interface TopicViewingProfileSettingsProps {
  topic: Topic;
}

/**
 * @deprecated This component is deprecated and will be removed.
 * Mark-checked functionality is available from the feed page.
 */
export function TopicViewingProfileSettings({ topic }: TopicViewingProfileSettingsProps) {
  const markCheckedMutation = useTopicMarkChecked(topic.id);

  const handleMarkCaughtUp = () => {
    markCheckedMutation.mutate();
  };

  const formatLastChecked = (dateStr: string | null) => {
    if (!dateStr) return t("settings.viewing.never");
    const date = new Date(dateStr);
    return date.toLocaleString();
  };

  const isPending = markCheckedMutation.isPending;

  return (
    <div className={styles.container}>
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

      {markCheckedMutation.isError && (
        <p className={styles.errorMessage}>{t("settings.viewing.updateFailed")}</p>
      )}
    </div>
  );
}
