"use client";

import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { t } from "@/lib/i18n";
import {
  useTopics,
  useCreateTopic,
  useUpdateTopic,
  useDeleteTopic,
  useAdminSources,
  useAdminSourceCreate,
  useAdminSourcePatch,
  useAdminSourceDelete,
} from "@/lib/hooks";
import { useToast } from "@/components/Toast";
import {
  SUPPORTED_SOURCE_TYPES,
  type SupportedSourceType,
  type Source,
  type Topic,
  type SourceConfig,
} from "@/lib/api";
import {
  SourceConfigForm,
  validateSourceConfig,
  getDefaultConfig,
  type SourceTypeConfig,
} from "@/components/SourceConfigForms";
import { TopicViewingProfileSettings } from "@/components/TopicViewingProfile/TopicViewingProfileSettings";
import styles from "./page.module.css";

export default function TopicsPage() {
  const router = useRouter();
  const { data: topicsData, isLoading: topicsLoading, isError, error } = useTopics();
  const { data: sourcesData, isLoading: sourcesLoading } = useAdminSources();
  const createTopicMutation = useCreateTopic();
  const updateTopicMutation = useUpdateTopic();
  const deleteTopicMutation = useDeleteTopic();
  const createSourceMutation = useAdminSourceCreate();
  const patchSourceMutation = useAdminSourcePatch();
  const deleteSourceMutation = useAdminSourceDelete();
  const { addToast } = useToast();

  const topics = topicsData?.topics ?? [];
  const allSources = sourcesData?.sources ?? [];

  // State for creating new topic
  const [isCreatingTopic, setIsCreatingTopic] = useState(false);
  const [newTopicName, setNewTopicName] = useState("");
  const [newTopicDescription, setNewTopicDescription] = useState("");

  // State for editing topic
  const [editingTopicId, setEditingTopicId] = useState<string | null>(null);
  const [editTopicName, setEditTopicName] = useState("");
  const [editTopicDescription, setEditTopicDescription] = useState("");

  // State for deleting topic
  const [confirmDeleteTopicId, setConfirmDeleteTopicId] = useState<string | null>(null);

  // State for expanded topic cards (showing sources and settings)
  const [expandedTopicId, setExpandedTopicId] = useState<string | null>(null);

  // State for adding source to a topic
  const [addingSourceToTopicId, setAddingSourceToTopicId] = useState<string | null>(null);
  const [newSourceType, setNewSourceType] = useState<SupportedSourceType>("rss");
  const [newSourceName, setNewSourceName] = useState("");
  const [newSourceCadence, setNewSourceCadence] = useState(60);
  const [newSourceWeight, setNewSourceWeight] = useState(1.0);
  const [newSourceConfig, setNewSourceConfig] = useState<Partial<SourceTypeConfig>>(() =>
    getDefaultConfig("rss")
  );
  const [newSourceErrors, setNewSourceErrors] = useState<Record<string, string>>({});

  // State for editing source
  const [editingSourceId, setEditingSourceId] = useState<string | null>(null);
  const [editSourceCadence, setEditSourceCadence] = useState(60);
  const [editSourceWeight, setEditSourceWeight] = useState(1.0);

  // State for deleting source
  const [confirmDeleteSourceId, setConfirmDeleteSourceId] = useState<string | null>(null);

  // Reset source config when type changes
  useEffect(() => {
    setNewSourceConfig(getDefaultConfig(newSourceType));
    setNewSourceErrors({});
  }, [newSourceType]);

  // Get sources for a specific topic
  const getSourcesForTopic = (topicId: string): Source[] => {
    return allSources.filter((s) => s.topicId === topicId);
  };

  // Topic CRUD handlers
  const handleCreateTopic = async () => {
    if (!newTopicName.trim()) return;

    try {
      await createTopicMutation.mutateAsync({
        name: newTopicName.trim(),
        description: newTopicDescription.trim() || undefined,
      });
      setNewTopicName("");
      setNewTopicDescription("");
      setIsCreatingTopic(false);
      addToast(t("settings.topics.created"), "success");
    } catch {
      addToast(t("settings.topics.createFailed"), "error");
    }
  };

  const handleStartEditTopic = (topic: Topic) => {
    setEditingTopicId(topic.id);
    setEditTopicName(topic.name);
    setEditTopicDescription(topic.description ?? "");
  };

  const handleSaveEditTopic = async (topicId: string) => {
    try {
      await updateTopicMutation.mutateAsync({
        topicId,
        data: {
          name: editTopicName.trim(),
          description: editTopicDescription.trim() || null,
        },
      });
      setEditingTopicId(null);
      addToast(t("settings.topics.updated"), "success");
    } catch {
      addToast(t("settings.topics.updateFailed"), "error");
    }
  };

  const handleDeleteTopic = async (topicId: string) => {
    try {
      await deleteTopicMutation.mutateAsync(topicId);
      setConfirmDeleteTopicId(null);
      addToast(t("settings.topics.deleted"), "success");
    } catch {
      addToast(t("settings.topics.deleteFailed"), "error");
    }
  };

  // Source CRUD handlers
  const handleStartAddSource = (topicId: string) => {
    setAddingSourceToTopicId(topicId);
    setNewSourceType("rss");
    setNewSourceName("");
    setNewSourceCadence(60);
    setNewSourceWeight(1.0);
    setNewSourceConfig(getDefaultConfig("rss"));
    setNewSourceErrors({});
  };

  const handleCancelAddSource = () => {
    setAddingSourceToTopicId(null);
    setNewSourceType("rss");
    setNewSourceName("");
    setNewSourceCadence(60);
    setNewSourceWeight(1.0);
    setNewSourceConfig(getDefaultConfig("rss"));
    setNewSourceErrors({});
  };

  const handleCreateSource = async (topicId: string) => {
    if (!newSourceName.trim()) {
      setNewSourceErrors({ name: "Name is required" });
      return;
    }

    const configErrors = validateSourceConfig(newSourceType, newSourceConfig);
    if (Object.keys(configErrors).length > 0) {
      setNewSourceErrors(configErrors);
      return;
    }

    try {
      // Merge cadence and weight into the config
      const fullConfig = {
        ...newSourceConfig,
        cadence: { mode: "interval" as const, every_minutes: newSourceCadence },
        weight: newSourceWeight,
      };
      await createSourceMutation.mutateAsync({
        type: newSourceType,
        name: newSourceName.trim(),
        config: fullConfig as SourceConfig,
        topicId,
      });
      handleCancelAddSource();
      addToast(t("toast.sourceCreated"), "success");
    } catch {
      addToast(t("toast.sourceCreateFailed"), "error");
    }
  };

  const handleStartEditSource = (source: Source) => {
    setEditingSourceId(source.id);
    setEditSourceCadence(source.config.cadence?.every_minutes ?? 60);
    setEditSourceWeight(source.config.weight ?? 1.0);
  };

  const handleSaveEditSource = async (source: Source) => {
    try {
      await patchSourceMutation.mutateAsync({
        id: source.id,
        patch: {
          configPatch: {
            cadence: { mode: "interval", every_minutes: editSourceCadence },
            weight: editSourceWeight,
          },
        },
      });
      setEditingSourceId(null);
      addToast(t("toast.sourceUpdated"), "success");
    } catch {
      addToast(t("toast.sourceUpdateFailed"), "error");
    }
  };

  const handleToggleSourceEnabled = async (source: Source) => {
    try {
      await patchSourceMutation.mutateAsync({
        id: source.id,
        patch: { isEnabled: !source.isEnabled },
      });
      addToast(t("toast.sourceUpdated"), "success");
    } catch {
      addToast(t("toast.sourceUpdateFailed"), "error");
    }
  };

  const handleDeleteSource = async (sourceId: string) => {
    try {
      await deleteSourceMutation.mutateAsync(sourceId);
      setConfirmDeleteSourceId(null);
      addToast(t("toast.sourceDeleted"), "success");
    } catch {
      addToast(t("toast.sourceDeleteFailed"), "error");
    }
  };

  const handleTopicClick = (topicId: string) => {
    router.push(`/app/feed?topic=${topicId}`);
  };

  const toggleExpanded = (topicId: string) => {
    setExpandedTopicId(expandedTopicId === topicId ? null : topicId);
  };

  const getSourceTypeDisplayName = (type: SupportedSourceType): string => {
    const names: Record<SupportedSourceType, string> = {
      rss: "RSS",
      reddit: "Reddit",
      hn: "HN",
      youtube: "YouTube",
      x_posts: "X",
      signal: "Signal",
      sec_edgar: "SEC",
      congress_trading: "Congress",
      polymarket: "Polymarket",
      options_flow: "Options",
      market_sentiment: "Sentiment",
    };
    return names[type] ?? type;
  };

  const isLoading = topicsLoading || sourcesLoading;

  if (isLoading) {
    return (
      <div className={styles.page}>
        <header className={styles.header}>
          <h1 className={styles.title}>{t("nav.topics")}</h1>
        </header>
        <div className={styles.loading}>
          <LoadingSpinner />
          <span>{t("common.loading")}</span>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className={styles.page}>
        <header className={styles.header}>
          <h1 className={styles.title}>{t("nav.topics")}</h1>
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
        <div className={styles.headerTop}>
          <div>
            <h1 className={styles.title}>{t("nav.topics")}</h1>
            <p className={styles.subtitle}>
              {topics.length} {topics.length === 1 ? "topic" : "topics"}
            </p>
          </div>
          {!isCreatingTopic && (
            <button
              type="button"
              className={styles.createButton}
              onClick={() => setIsCreatingTopic(true)}
              disabled={createTopicMutation.isPending}
            >
              + {t("settings.topics.create")}
            </button>
          )}
        </div>
      </header>

      {/* Guidance tip */}
      <div className={styles.guidanceTip}>
        <TipIcon />
        <p>{t("topics.guidance")}</p>
      </div>

      {/* Create topic form */}
      {isCreatingTopic && (
        <div className={styles.createForm}>
          <input
            type="text"
            className={styles.createInput}
            placeholder={t("settings.topics.namePlaceholder")}
            value={newTopicName}
            onChange={(e) => setNewTopicName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreateTopic();
              if (e.key === "Escape") {
                setIsCreatingTopic(false);
                setNewTopicName("");
                setNewTopicDescription("");
              }
            }}
            disabled={createTopicMutation.isPending}
            autoFocus
          />
          <input
            type="text"
            className={styles.createInput}
            placeholder={t("settings.topics.descriptionPlaceholder")}
            value={newTopicDescription}
            onChange={(e) => setNewTopicDescription(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreateTopic();
              if (e.key === "Escape") {
                setIsCreatingTopic(false);
                setNewTopicName("");
                setNewTopicDescription("");
              }
            }}
            disabled={createTopicMutation.isPending}
          />
          <div className={styles.createActions}>
            <button
              type="button"
              className={styles.createConfirm}
              onClick={handleCreateTopic}
              disabled={!newTopicName.trim() || createTopicMutation.isPending}
            >
              {createTopicMutation.isPending ? t("common.saving") : t("common.create")}
            </button>
            <button
              type="button"
              className={styles.createCancel}
              onClick={() => {
                setIsCreatingTopic(false);
                setNewTopicName("");
                setNewTopicDescription("");
              }}
              disabled={createTopicMutation.isPending}
            >
              {t("common.cancel")}
            </button>
          </div>
        </div>
      )}

      {/* Topics list */}
      {topics.length === 0 ? (
        <div className={styles.empty}>
          <TopicsIcon />
          <h2 className={styles.emptyTitle}>{t("topics.emptyTitle")}</h2>
          <p className={styles.emptyDescription}>{t("topics.emptyDescription")}</p>
          <button type="button" className={styles.emptyButton} onClick={() => setIsCreatingTopic(true)}>
            + {t("settings.topics.create")}
          </button>
        </div>
      ) : (
        <div className={styles.topicsList}>
          {topics.map((topic) => {
            const topicSources = getSourcesForTopic(topic.id);
            const isExpanded = expandedTopicId === topic.id;
            const isEditing = editingTopicId === topic.id;
            const isDeleting = confirmDeleteTopicId === topic.id;

            return (
              <div key={topic.id} className={styles.topicCard}>
                {/* Topic header */}
                <div className={styles.topicHeader}>
                  {isEditing ? (
                    <div className={styles.editTopicForm}>
                      <input
                        type="text"
                        className={styles.editInput}
                        value={editTopicName}
                        onChange={(e) => setEditTopicName(e.target.value)}
                        placeholder={t("settings.topics.name")}
                        autoFocus
                      />
                      <input
                        type="text"
                        className={styles.editInput}
                        value={editTopicDescription}
                        onChange={(e) => setEditTopicDescription(e.target.value)}
                        placeholder={t("settings.topics.descriptionPlaceholder")}
                      />
                      <div className={styles.editTopicActions}>
                        <button
                          type="button"
                          className={styles.saveButton}
                          onClick={() => handleSaveEditTopic(topic.id)}
                          disabled={updateTopicMutation.isPending}
                        >
                          {updateTopicMutation.isPending ? t("common.saving") : t("common.save")}
                        </button>
                        <button
                          type="button"
                          className={styles.cancelButton}
                          onClick={() => setEditingTopicId(null)}
                          disabled={updateTopicMutation.isPending}
                        >
                          {t("common.cancel")}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div
                        className={styles.topicInfo}
                        onClick={() => handleTopicClick(topic.id)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleTopicClick(topic.id);
                        }}
                      >
                        <h3 className={styles.topicName}>{topic.name}</h3>
                        {topic.description && <p className={styles.topicDescription}>{topic.description}</p>}
                        <div className={styles.topicMeta}>
                          <span className={styles.profileBadge}>
                            {t(`settings.viewing.profiles.${topic.viewingProfile}`)}
                          </span>
                          <span className={styles.decayInfo}>{topic.decayHours}h decay</span>
                          <span className={styles.sourceCount}>
                            {topicSources.length} {topicSources.length === 1 ? "source" : "sources"}
                          </span>
                        </div>
                      </div>
                      <div className={styles.topicActions}>
                        <button
                          type="button"
                          className={styles.expandButton}
                          onClick={() => toggleExpanded(topic.id)}
                          aria-expanded={isExpanded}
                          title={isExpanded ? t("topics.collapseSettings") : t("topics.expandSettings")}
                        >
                          <ChevronIcon expanded={isExpanded} />
                        </button>
                        <button
                          type="button"
                          className={styles.iconButton}
                          onClick={() => handleStartEditTopic(topic)}
                          title={t("topics.editTopic")}
                        >
                          <EditIcon />
                        </button>
                        <button
                          type="button"
                          className={styles.iconButton}
                          onClick={() => setConfirmDeleteTopicId(topic.id)}
                          title={t("topics.deleteTopic")}
                        >
                          <TrashIcon />
                        </button>
                      </div>
                    </>
                  )}
                </div>

                {/* Delete confirmation */}
                {isDeleting && (
                  <div className={styles.deleteConfirm}>
                    <p className={styles.deleteConfirmText}>{t("topics.confirmDeleteTopic")}</p>
                    <p className={styles.deleteConfirmDescription}>
                      {t("topics.confirmDeleteTopicDescription")}
                    </p>
                    <div className={styles.deleteConfirmActions}>
                      <button
                        type="button"
                        className={styles.cancelButton}
                        onClick={() => setConfirmDeleteTopicId(null)}
                        disabled={deleteTopicMutation.isPending}
                      >
                        {t("common.cancel")}
                      </button>
                      <button
                        type="button"
                        className={styles.deleteButton}
                        onClick={() => handleDeleteTopic(topic.id)}
                        disabled={deleteTopicMutation.isPending}
                      >
                        {deleteTopicMutation.isPending ? t("common.loading") : t("common.delete")}
                      </button>
                    </div>
                  </div>
                )}

                {/* Expanded content: sources + viewing profile */}
                {isExpanded && !isEditing && !isDeleting && (
                  <div className={styles.expandedContent}>
                    {/* Sources section */}
                    <div className={styles.sourcesSection}>
                      <div className={styles.sectionHeader}>
                        <h4 className={styles.sectionTitle}>
                          {t("topics.sources")} ({topicSources.length})
                        </h4>
                        <button
                          type="button"
                          className={styles.addSourceButton}
                          onClick={() => handleStartAddSource(topic.id)}
                          disabled={addingSourceToTopicId === topic.id}
                        >
                          + {t("topics.addSource")}
                        </button>
                      </div>

                      {/* Add source form */}
                      {addingSourceToTopicId === topic.id && (
                        <div className={styles.addSourceForm}>
                          <div className={styles.formRow}>
                            <label className={styles.formLabel}>{t("admin.sources.type")}</label>
                            <select
                              value={newSourceType}
                              onChange={(e) => setNewSourceType(e.target.value as SupportedSourceType)}
                              className={styles.selectInput}
                            >
                              {SUPPORTED_SOURCE_TYPES.map((type) => (
                                <option key={type} value={type}>
                                  {getSourceTypeDisplayName(type)}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className={styles.formRow}>
                            <label className={styles.formLabel}>{t("admin.sources.name")}</label>
                            <input
                              type="text"
                              value={newSourceName}
                              onChange={(e) => setNewSourceName(e.target.value)}
                              placeholder={t("admin.sources.namePlaceholder")}
                              className={`${styles.textInput} ${newSourceErrors.name ? styles.hasError : ""}`}
                            />
                            {newSourceErrors.name && (
                              <p className={styles.errorText}>{newSourceErrors.name}</p>
                            )}
                          </div>
                          <div className={styles.configFormWrapper}>
                            <SourceConfigForm
                              sourceType={newSourceType}
                              config={newSourceConfig}
                              onChange={setNewSourceConfig}
                              errors={newSourceErrors}
                            />
                          </div>
                          <div className={styles.formRowInline}>
                            <div className={styles.formRowHalf}>
                              <label className={styles.formLabel}>{t("admin.sources.cadenceMinutes")}</label>
                              <input
                                type="number"
                                min={1}
                                max={1440}
                                value={newSourceCadence}
                                onChange={(e) => setNewSourceCadence(parseInt(e.target.value, 10) || 60)}
                                className={styles.numberInput}
                              />
                            </div>
                            <div className={styles.formRowHalf}>
                              <label className={styles.formLabel}>{t("admin.sources.weight")}</label>
                              <input
                                type="number"
                                min={0}
                                max={10}
                                step={0.1}
                                value={newSourceWeight}
                                onChange={(e) => setNewSourceWeight(parseFloat(e.target.value) || 1.0)}
                                className={styles.numberInput}
                              />
                            </div>
                          </div>
                          <div className={styles.formActions}>
                            <button
                              type="button"
                              className={styles.cancelButton}
                              onClick={handleCancelAddSource}
                              disabled={createSourceMutation.isPending}
                            >
                              {t("common.cancel")}
                            </button>
                            <button
                              type="button"
                              className={styles.saveButton}
                              onClick={() => handleCreateSource(topic.id)}
                              disabled={createSourceMutation.isPending || !newSourceName.trim()}
                            >
                              {createSourceMutation.isPending ? (
                                <>
                                  <LoadingSpinner />
                                  {t("admin.sources.creating")}
                                </>
                              ) : (
                                t("admin.sources.create")
                              )}
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Sources list */}
                      {topicSources.length === 0 ? (
                        <p className={styles.noSources}>{t("topics.noSources")}</p>
                      ) : (
                        <div className={styles.sourcesList}>
                          {topicSources.map((source) => {
                            const isEditingSource = editingSourceId === source.id;
                            const isDeletingSource = confirmDeleteSourceId === source.id;

                            return (
                              <div
                                key={source.id}
                                className={`${styles.sourceItem} ${!source.isEnabled ? styles.sourceDisabled : ""}`}
                              >
                                {isEditingSource ? (
                                  <div className={styles.editSourceForm}>
                                    <div className={styles.editSourceRow}>
                                      <label className={styles.formLabel}>
                                        {t("admin.sources.cadenceMinutes")}
                                      </label>
                                      <input
                                        type="number"
                                        min={1}
                                        max={1440}
                                        value={editSourceCadence}
                                        onChange={(e) =>
                                          setEditSourceCadence(parseInt(e.target.value, 10) || 60)
                                        }
                                        className={styles.numberInput}
                                      />
                                    </div>
                                    <div className={styles.editSourceRow}>
                                      <label className={styles.formLabel}>{t("admin.sources.weight")}</label>
                                      <input
                                        type="number"
                                        min={0}
                                        max={10}
                                        step={0.1}
                                        value={editSourceWeight}
                                        onChange={(e) =>
                                          setEditSourceWeight(parseFloat(e.target.value) || 1.0)
                                        }
                                        className={styles.numberInput}
                                      />
                                    </div>
                                    <div className={styles.editSourceActions}>
                                      <button
                                        type="button"
                                        className={styles.saveButton}
                                        onClick={() => handleSaveEditSource(source)}
                                        disabled={patchSourceMutation.isPending}
                                      >
                                        {patchSourceMutation.isPending
                                          ? t("common.saving")
                                          : t("common.save")}
                                      </button>
                                      <button
                                        type="button"
                                        className={styles.cancelButton}
                                        onClick={() => setEditingSourceId(null)}
                                        disabled={patchSourceMutation.isPending}
                                      >
                                        {t("common.cancel")}
                                      </button>
                                    </div>
                                  </div>
                                ) : isDeletingSource ? (
                                  <div className={styles.deleteSourceConfirm}>
                                    <p>{t("admin.sources.confirmDelete")}</p>
                                    <div className={styles.deleteSourceActions}>
                                      <button
                                        type="button"
                                        className={styles.cancelButton}
                                        onClick={() => setConfirmDeleteSourceId(null)}
                                        disabled={deleteSourceMutation.isPending}
                                      >
                                        {t("common.cancel")}
                                      </button>
                                      <button
                                        type="button"
                                        className={styles.deleteButton}
                                        onClick={() => handleDeleteSource(source.id)}
                                        disabled={deleteSourceMutation.isPending}
                                      >
                                        {deleteSourceMutation.isPending ? (
                                          <LoadingSpinner />
                                        ) : (
                                          t("common.delete")
                                        )}
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <>
                                    <div className={styles.sourceInfo}>
                                      <span className={styles.sourceType}>
                                        {getSourceTypeDisplayName(source.type as SupportedSourceType)}
                                      </span>
                                      <span className={styles.sourceName}>{source.name}</span>
                                      <span className={styles.sourceMeta}>
                                        {source.config.cadence?.every_minutes
                                          ? t("topics.sourceInterval", {
                                              minutes: source.config.cadence.every_minutes,
                                            })
                                          : "—"}
                                        {" | "}
                                        {t("topics.sourceWeight", {
                                          weight: (source.config.weight ?? 1.0).toFixed(1),
                                        })}
                                      </span>
                                    </div>
                                    <div className={styles.sourceActions}>
                                      <label className={styles.toggleSmall}>
                                        <input
                                          type="checkbox"
                                          checked={source.isEnabled}
                                          onChange={() => handleToggleSourceEnabled(source)}
                                        />
                                        <span className={styles.toggleSlider} />
                                      </label>
                                      <button
                                        type="button"
                                        className={styles.iconButtonSmall}
                                        onClick={() => handleStartEditSource(source)}
                                        title={t("settings.topics.edit")}
                                      >
                                        <EditIcon />
                                      </button>
                                      <button
                                        type="button"
                                        className={styles.iconButtonSmall}
                                        onClick={() => setConfirmDeleteSourceId(source.id)}
                                        title={t("settings.topics.delete")}
                                      >
                                        <TrashIcon />
                                      </button>
                                    </div>
                                  </>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Viewing profile section */}
                    <div className={styles.viewingProfileSection}>
                      <h4 className={styles.sectionTitle}>{t("topics.viewingProfile")}</h4>
                      <TopicViewingProfileSettings topic={topic} />
                    </div>
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

// Icons
function TopicsIcon() {
  return (
    <svg
      width="48"
      height="48"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
    </svg>
  );
}

function EditIcon() {
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
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function TrashIcon() {
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
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
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
      style={{ transform: expanded ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s" }}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function LoadingSpinner() {
  return (
    <svg
      className={styles.spinner}
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
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

function TipIcon() {
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
      <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 1 1 7.072 0l-.548.547A3.374 3.374 0 0 0 14 18.469V19a2 2 0 1 1-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
    </svg>
  );
}
