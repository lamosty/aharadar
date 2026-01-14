"use client";

import { useTopic } from "@/components/TopicProvider";
import { useTopics } from "@/lib/hooks";
import { t } from "@/lib/i18n";
import styles from "./TopicSwitcher.module.css";

interface TopicSwitcherProps {
  /** Additional CSS class */
  className?: string;
  /** Optional callback when topic changes (for URL sync) */
  onTopicChange?: (topicId: string | null) => void;
}

export function TopicSwitcher({ className, onTopicChange }: TopicSwitcherProps) {
  const { data, isLoading } = useTopics();
  const { currentTopicId, setCurrentTopicId, isReady } = useTopic();

  if (isLoading || !isReady || !data) {
    return (
      <div className={`${styles.container} ${className || ""}`}>
        <select className={styles.select} disabled>
          <option>{t("common.loading")}</option>
        </select>
      </div>
    );
  }

  const { topics } = data;

  // Don't show switcher if only one topic
  if (topics.length <= 1) {
    return null;
  }

  const currentTopic = topics.find((t) => t.id === currentTopicId);

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newTopicId = e.target.value === "all" ? null : e.target.value;
    setCurrentTopicId(newTopicId);
    onTopicChange?.(newTopicId);
  };

  return (
    <div className={`${styles.container} ${className || ""}`}>
      <label htmlFor="topic-switcher" className={styles.label}>
        {t("feed.topic")}
      </label>
      <select
        id="topic-switcher"
        className={styles.select}
        value={currentTopicId || "all"}
        onChange={handleChange}
        title={currentTopic?.description ?? undefined}
      >
        <option value="all">{t("feed.allTopics")}</option>
        {topics.map((topic) => (
          <option key={topic.id} value={topic.id}>
            {topic.name}
          </option>
        ))}
      </select>
    </div>
  );
}
