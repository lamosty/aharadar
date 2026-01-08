"use client";

import { useState } from "react";
import { useTopics, useCreateTopic, useDeleteTopic } from "@/lib/hooks";
import { useToast } from "@/components/Toast";
import { t } from "@/lib/i18n";
import { TopicViewingProfileSettings } from "./TopicViewingProfileSettings";
import styles from "./TopicsList.module.css";

export function TopicsList() {
  const { data, isLoading, isError } = useTopics();
  const createMutation = useCreateTopic();
  const deleteMutation = useDeleteTopic();
  const { addToast } = useToast();

  const [expandedTopicId, setExpandedTopicId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [newTopicName, setNewTopicName] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  if (isLoading) {
    return <div className={styles.loading}>{t("common.loading")}</div>;
  }

  if (isError || !data) {
    return <div className={styles.error}>{t("common.error")}</div>;
  }

  const { topics, profileOptions } = data;

  const toggleExpanded = (topicId: string) => {
    setExpandedTopicId((prev) => (prev === topicId ? null : topicId));
  };

  const handleCreate = async () => {
    if (!newTopicName.trim()) return;

    try {
      await createMutation.mutateAsync({ name: newTopicName.trim() });
      setNewTopicName("");
      setIsCreating(false);
      addToast(t("settings.topics.created"), "success");
    } catch {
      addToast(t("settings.topics.createFailed"), "error");
    }
  };

  const handleDelete = async (topicId: string) => {
    try {
      await deleteMutation.mutateAsync(topicId);
      setDeleteConfirmId(null);
      addToast(t("settings.topics.deleted"), "success");
    } catch {
      addToast(t("settings.topics.deleteFailed"), "error");
    }
  };

  const isPending = createMutation.isPending || deleteMutation.isPending;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <p className={styles.description}>{t("settings.topics.description")}</p>
        {!isCreating && (
          <button
            type="button"
            className={styles.createButton}
            onClick={() => setIsCreating(true)}
            disabled={isPending}
          >
            + {t("settings.topics.create")}
          </button>
        )}
      </div>

      {isCreating && (
        <div className={styles.createForm}>
          <input
            type="text"
            className={styles.createInput}
            placeholder={t("settings.topics.namePlaceholder")}
            value={newTopicName}
            onChange={(e) => setNewTopicName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreate();
              if (e.key === "Escape") {
                setIsCreating(false);
                setNewTopicName("");
              }
            }}
            disabled={createMutation.isPending}
            autoFocus
          />
          <div className={styles.createActions}>
            <button
              type="button"
              className={styles.createConfirm}
              onClick={handleCreate}
              disabled={!newTopicName.trim() || createMutation.isPending}
            >
              {createMutation.isPending ? t("common.saving") : t("common.create")}
            </button>
            <button
              type="button"
              className={styles.createCancel}
              onClick={() => {
                setIsCreating(false);
                setNewTopicName("");
              }}
              disabled={createMutation.isPending}
            >
              {t("common.cancel")}
            </button>
          </div>
        </div>
      )}

      {topics.length === 0 ? (
        <div className={styles.empty}>
          <p>{t("settings.topics.noTopics")}</p>
        </div>
      ) : (
        <div className={styles.topicsList}>
          {topics.map((topic) => {
            const isExpanded = expandedTopicId === topic.id;
            const isDefault = topic.name === "default";
            const isConfirmingDelete = deleteConfirmId === topic.id;

            return (
              <div key={topic.id} className={styles.topicCard}>
                <div className={styles.topicHeader}>
                  <button
                    type="button"
                    className={styles.topicHeaderButton}
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
                  {!isDefault && (
                    <div className={styles.topicActions}>
                      {isConfirmingDelete ? (
                        <>
                          <button
                            type="button"
                            className={styles.deleteConfirm}
                            onClick={() => handleDelete(topic.id)}
                            disabled={deleteMutation.isPending}
                          >
                            {t("common.confirmDelete")}
                          </button>
                          <button
                            type="button"
                            className={styles.deleteCancel}
                            onClick={() => setDeleteConfirmId(null)}
                            disabled={deleteMutation.isPending}
                          >
                            {t("common.cancel")}
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className={styles.deleteButton}
                          onClick={() => setDeleteConfirmId(topic.id)}
                          disabled={isPending}
                          title={t("settings.topics.delete")}
                        >
                          ×
                        </button>
                      )}
                    </div>
                  )}
                </div>
                {isExpanded && (
                  <div className={styles.topicContent}>
                    <TopicViewingProfileSettings topic={topic} profileOptions={profileOptions} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
