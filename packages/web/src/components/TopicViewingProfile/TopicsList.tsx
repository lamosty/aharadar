"use client";

import { useState } from "react";
import { useToast } from "@/components/Toast";
import { useCreateTopic, useDeleteTopic, useTopics, useUpdateTopic } from "@/lib/hooks";
import { t } from "@/lib/i18n";
import styles from "./TopicsList.module.css";
import { TopicViewingProfileSettings } from "./TopicViewingProfileSettings";

export function TopicsList() {
  const { data, isLoading, isError } = useTopics();
  const createMutation = useCreateTopic();
  const updateMutation = useUpdateTopic();
  const deleteMutation = useDeleteTopic();
  const { addToast } = useToast();

  const [expandedTopicId, setExpandedTopicId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [newTopicName, setNewTopicName] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [editingTopicId, setEditingTopicId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");

  if (isLoading) {
    return <div className={styles.loading}>{t("common.loading")}</div>;
  }

  if (isError || !data) {
    return <div className={styles.error}>{t("common.error")}</div>;
  }

  const { topics } = data;

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

  const startEditing = (topicId: string, name: string, description: string | null) => {
    setEditingTopicId(topicId);
    setEditName(name);
    setEditDescription(description ?? "");
  };

  const cancelEditing = () => {
    setEditingTopicId(null);
    setEditName("");
    setEditDescription("");
  };

  const handleSaveEdit = async () => {
    if (!editingTopicId || !editName.trim()) return;

    try {
      await updateMutation.mutateAsync({
        topicId: editingTopicId,
        data: {
          name: editName.trim(),
          description: editDescription.trim() || null,
        },
      });
      cancelEditing();
      addToast(t("settings.topics.updated"), "success");
    } catch {
      addToast(t("settings.topics.updateFailed"), "error");
    }
  };

  const isPending =
    createMutation.isPending || updateMutation.isPending || deleteMutation.isPending;

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
            const isEditing = editingTopicId === topic.id;
            const isConfirmingDelete = deleteConfirmId === topic.id;
            const isOnlyTopic = topics.length === 1;

            return (
              <div key={topic.id} className={styles.topicCard}>
                {isEditing ? (
                  <div className={styles.editForm}>
                    <div className={styles.editField}>
                      <label htmlFor={`edit-name-${topic.id}`} className={styles.editLabel}>
                        {t("settings.topics.name")}
                      </label>
                      <input
                        type="text"
                        id={`edit-name-${topic.id}`}
                        className={styles.createInput}
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleSaveEdit();
                          if (e.key === "Escape") cancelEditing();
                        }}
                        disabled={updateMutation.isPending}
                      />
                    </div>
                    <div className={styles.editField}>
                      <label htmlFor={`edit-desc-${topic.id}`} className={styles.editLabel}>
                        {t("settings.topics.descriptionLabel")}
                      </label>
                      <input
                        type="text"
                        id={`edit-desc-${topic.id}`}
                        className={styles.createInput}
                        value={editDescription}
                        onChange={(e) => setEditDescription(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleSaveEdit();
                          if (e.key === "Escape") cancelEditing();
                        }}
                        placeholder={t("settings.topics.descriptionPlaceholder")}
                        disabled={updateMutation.isPending}
                      />
                    </div>
                    <div className={styles.createActions}>
                      <button
                        type="button"
                        className={styles.createConfirm}
                        onClick={handleSaveEdit}
                        disabled={!editName.trim() || updateMutation.isPending}
                      >
                        {updateMutation.isPending ? t("common.saving") : t("common.save")}
                      </button>
                      <button
                        type="button"
                        className={styles.createCancel}
                        onClick={cancelEditing}
                        disabled={updateMutation.isPending}
                      >
                        {t("common.cancel")}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
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
                          <span
                            className={`${styles.chevron} ${isExpanded ? styles.chevronExpanded : ""}`}
                          >
                            <svg
                              width="10"
                              height="10"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <polyline points="6 9 12 15 18 9" />
                            </svg>
                          </span>
                        </div>
                      </button>
                      <div className={styles.topicActions}>
                        <button
                          type="button"
                          className={styles.editButton}
                          onClick={() => startEditing(topic.id, topic.name, topic.description)}
                          disabled={isPending}
                          title={t("settings.topics.edit")}
                        >
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                        </button>
                        {!isOnlyTopic &&
                          (isConfirmingDelete ? (
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
                              <svg
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <line x1="18" y1="6" x2="6" y2="18" />
                                <line x1="6" y1="6" x2="18" y2="18" />
                              </svg>
                            </button>
                          ))}
                      </div>
                    </div>
                    {isExpanded && (
                      <div className={styles.topicContent}>
                        <TopicViewingProfileSettings topic={topic} />
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
