"use client";

import { useState } from "react";
import { useTopics } from "@/lib/hooks";
import { t } from "@/lib/i18n";
import { TopicViewingProfileSettings } from "./TopicViewingProfileSettings";
import styles from "./TopicsList.module.css";

export function TopicsList() {
  const { data, isLoading, isError } = useTopics();
  const [expandedTopicId, setExpandedTopicId] = useState<string | null>(null);

  if (isLoading) {
    return <div className={styles.loading}>{t("common.loading")}</div>;
  }

  if (isError || !data) {
    return <div className={styles.error}>{t("common.error")}</div>;
  }

  const { topics, profileOptions } = data;

  if (topics.length === 0) {
    return (
      <div className={styles.empty}>
        <p>{t("settings.topics.noTopics")}</p>
      </div>
    );
  }

  const toggleExpanded = (topicId: string) => {
    setExpandedTopicId((prev) => (prev === topicId ? null : topicId));
  };

  return (
    <div className={styles.container}>
      <p className={styles.description}>{t("settings.topics.description")}</p>
      <div className={styles.topicsList}>
        {topics.map((topic) => {
          const isExpanded = expandedTopicId === topic.id;
          return (
            <div key={topic.id} className={styles.topicCard}>
              <button
                type="button"
                className={styles.topicHeader}
                onClick={() => toggleExpanded(topic.id)}
                aria-expanded={isExpanded}
              >
                <div className={styles.topicInfo}>
                  <span className={styles.topicName}>{topic.name}</span>
                  {topic.description && (
                    <span className={styles.topicDescription}>{topic.description}</span>
                  )}
                </div>
                <div className={styles.topicMeta}>
                  <span className={styles.topicProfile}>
                    {t(`settings.viewing.profiles.${topic.viewingProfile}`)}
                  </span>
                  <span className={styles.topicDecay}>{topic.decayHours}h</span>
                  <span className={`${styles.chevron} ${isExpanded ? styles.chevronExpanded : ""}`}>
                    &#9660;
                  </span>
                </div>
              </button>
              {isExpanded && (
                <div className={styles.topicContent}>
                  <TopicViewingProfileSettings topic={topic} profileOptions={profileOptions} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
