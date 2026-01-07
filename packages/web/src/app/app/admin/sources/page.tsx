"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { t } from "@/lib/i18n";
import { useToast } from "@/components/Toast";
import { useAdminSources, useAdminSourcePatch, useAdminSourceCreate, useAdminSourceDelete } from "@/lib/hooks";
import { SUPPORTED_SOURCE_TYPES, type SupportedSourceType, type Source, type SourceConfig } from "@/lib/api";
import {
  SourceConfigForm,
  validateSourceConfig,
  getDefaultConfig,
  type SourceTypeConfig,
} from "@/components/SourceConfigForms";
import styles from "./page.module.css";

export default function AdminSourcesPage() {
  const { addToast } = useToast();
  const { data: sourcesData, isLoading } = useAdminSources();
  const patchMutation = useAdminSourcePatch();
  const createMutation = useAdminSourceCreate();
  const deleteMutation = useAdminSourceDelete();

  const sources = sourcesData?.sources ?? [];

  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [editingSource, setEditingSource] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<{
    cadenceMinutes: number;
    weight: number;
  } | null>(null);

  // Create form state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createType, setCreateType] = useState<SupportedSourceType>("rss");
  const [createName, setCreateName] = useState("");
  const [createConfig, setCreateConfig] = useState<Partial<SourceTypeConfig>>(() =>
    getDefaultConfig("rss")
  );
  const [createErrors, setCreateErrors] = useState<Record<string, string>>({});

  // Reset config when source type changes
  useEffect(() => {
    setCreateConfig(getDefaultConfig(createType));
    setCreateErrors({});
  }, [createType]);

  const handleToggleEnabled = async (source: Source) => {
    try {
      await patchMutation.mutateAsync({
        id: source.id,
        patch: { isEnabled: !source.isEnabled },
      });
      addToast(t("toast.sourceUpdated"), "success");
    } catch {
      addToast(t("toast.sourceUpdateFailed"), "error");
    }
  };

  const handleDeleteSource = async (sourceId: string) => {
    setDeletingId(sourceId);
    try {
      await deleteMutation.mutateAsync(sourceId);
      addToast(t("toast.sourceDeleted"), "success");
      setConfirmDeleteId(null);
    } catch {
      addToast(t("toast.sourceDeleteFailed"), "error");
    } finally {
      setDeletingId(null);
    }
  };

  const handleStartEdit = (source: Source) => {
    setEditingSource(source.id);
    setEditValues({
      cadenceMinutes: source.config.cadence?.every_minutes ?? 60,
      weight: source.config.weight ?? 1.0,
    });
  };

  const handleCancelEdit = () => {
    setEditingSource(null);
    setEditValues(null);
  };

  const handleSaveEdit = async (source: Source) => {
    if (!editValues) return;

    setSavingId(source.id);
    try {
      await patchMutation.mutateAsync({
        id: source.id,
        patch: {
          configPatch: {
            cadence: { mode: "interval", every_minutes: editValues.cadenceMinutes },
            weight: editValues.weight,
          },
        },
      });
      addToast(t("toast.sourceUpdated"), "success");
      setEditingSource(null);
      setEditValues(null);
    } catch {
      addToast(t("toast.sourceUpdateFailed"), "error");
    } finally {
      setSavingId(null);
    }
  };

  const handleShowCreateForm = () => {
    setShowCreateForm(true);
    setCreateType("rss");
    setCreateName("");
    setCreateConfig(getDefaultConfig("rss"));
    setCreateErrors({});
  };

  const handleCancelCreate = () => {
    setShowCreateForm(false);
    setCreateType("rss");
    setCreateName("");
    setCreateConfig(getDefaultConfig("rss"));
    setCreateErrors({});
  };

  const handleCreateSource = async () => {
    // Validate name
    if (!createName.trim()) {
      setCreateErrors({ name: "Name is required" });
      return;
    }

    // Validate config
    const configErrors = validateSourceConfig(createType, createConfig);
    if (Object.keys(configErrors).length > 0) {
      setCreateErrors(configErrors);
      return;
    }

    setCreateErrors({});

    try {
      await createMutation.mutateAsync({
        type: createType,
        name: createName.trim(),
        config: createConfig as SourceConfig,
      });
      addToast(t("toast.sourceCreated"), "success");
      handleCancelCreate();
    } catch {
      addToast(t("toast.sourceCreateFailed"), "error");
    }
  };

  const getTypeDescription = (type: SupportedSourceType): string => {
    const key = `admin.sources.typeDescriptions.${type}` as const;
    return t(key);
  };

  const getSourceTypeDisplayName = (type: SupportedSourceType): string => {
    const names: Record<SupportedSourceType, string> = {
      rss: "RSS Feed",
      reddit: "Reddit",
      hn: "Hacker News",
      youtube: "YouTube",
      x_posts: "X (Twitter) Posts",
      signal: "Signal Search",
    };
    return names[type] ?? type;
  };

  if (isLoading) {
    return (
      <div className={styles.page}>
        <div className={styles.loading}>
          <LoadingSpinner />
          <span>{t("common.loading")}</span>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/app/admin" className={styles.backLink}>
          <BackIcon />
          <span>{t("common.back")}</span>
        </Link>
        <h1 className={styles.title}>{t("admin.sources.title")}</h1>
        <p className={styles.description}>{t("admin.sources.description")}</p>
        <div className={styles.headerActions}>
          <button
            type="button"
            onClick={handleShowCreateForm}
            className={styles.addSourceButton}
            disabled={showCreateForm}
          >
            <PlusIcon />
            <span>{t("admin.sources.addSource")}</span>
          </button>
        </div>
      </header>

      {showCreateForm && (
        <div className={styles.createForm}>
          <h2 className={styles.createFormTitle}>{t("admin.sources.addSource")}</h2>

          <div className={styles.editField}>
            <label htmlFor="create-type" className={styles.editLabel}>
              {t("admin.sources.type")}
            </label>
            <select
              id="create-type"
              value={createType}
              onChange={(e) => setCreateType(e.target.value as SupportedSourceType)}
              className={styles.selectInput}
            >
              {SUPPORTED_SOURCE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {getSourceTypeDisplayName(type)}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.editField}>
            <label htmlFor="create-name" className={styles.editLabel}>
              {t("admin.sources.name")}
            </label>
            <input
              type="text"
              id="create-name"
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              placeholder={t("admin.sources.namePlaceholder")}
              className={`${styles.textInput} ${createErrors.name ? styles.hasError : ""}`}
            />
            {createErrors.name && <p className={styles.errorText}>{createErrors.name}</p>}
          </div>

          <div className={styles.configFormWrapper}>
            <SourceConfigForm
              sourceType={createType}
              config={createConfig}
              onChange={setCreateConfig}
              errors={createErrors}
            />
          </div>

          <div className={styles.editActions}>
            <button
              type="button"
              onClick={handleCancelCreate}
              className={styles.cancelButton}
              disabled={createMutation.isPending}
            >
              {t("common.cancel")}
            </button>
            <button
              type="button"
              onClick={handleCreateSource}
              className={styles.saveButton}
              disabled={createMutation.isPending || !createName.trim()}
            >
              {createMutation.isPending ? (
                <>
                  <LoadingSpinner />
                  <span>{t("admin.sources.creating")}</span>
                </>
              ) : (
                <span>{t("admin.sources.create")}</span>
              )}
            </button>
          </div>
        </div>
      )}

      {sources.length === 0 && !showCreateForm ? (
        <div className={styles.empty}>
          <SourcesIcon />
          <p>{t("admin.sources.noSources")}</p>
        </div>
      ) : sources.length > 0 ? (
        <div className={styles.sourcesList}>
          {sources.map((source) => (
            <div key={source.id} className={styles.sourceCard}>
              <div className={styles.sourceHeader}>
                <div className={styles.sourceInfo}>
                  <span className={styles.sourceType}>{source.type}</span>
                  <h3 className={styles.sourceName}>{source.name}</h3>
                </div>
                <label className={styles.toggle}>
                  <input
                    type="checkbox"
                    checked={source.isEnabled}
                    onChange={() => handleToggleEnabled(source)}
                    className={styles.toggleInput}
                    aria-label={`${source.isEnabled ? t("common.enabled") : t("common.disabled")}: ${source.name}`}
                  />
                  <span className={styles.toggleSlider} />
                  <span className={styles.toggleLabel}>
                    {source.isEnabled ? t("common.enabled") : t("common.disabled")}
                  </span>
                </label>
              </div>

              {editingSource === source.id && editValues ? (
                <div className={styles.editForm}>
                  <div className={styles.editField}>
                    <label htmlFor={`cadence-${source.id}`} className={styles.editLabel}>
                      {t("admin.sources.cadenceMinutes")}
                    </label>
                    <input
                      type="number"
                      id={`cadence-${source.id}`}
                      min={1}
                      max={1440}
                      value={editValues.cadenceMinutes}
                      onChange={(e) =>
                        setEditValues({
                          ...editValues,
                          cadenceMinutes: parseInt(e.target.value, 10) || 60,
                        })
                      }
                      className={styles.editInput}
                    />
                  </div>
                  <div className={styles.editField}>
                    <label htmlFor={`weight-${source.id}`} className={styles.editLabel}>
                      {t("admin.sources.weight")}
                    </label>
                    <input
                      type="number"
                      id={`weight-${source.id}`}
                      min={0}
                      max={10}
                      step={0.1}
                      value={editValues.weight}
                      onChange={(e) =>
                        setEditValues({
                          ...editValues,
                          weight: parseFloat(e.target.value) || 1.0,
                        })
                      }
                      className={styles.editInput}
                    />
                    <p className={styles.editHint}>{t("admin.sources.weightDescription")}</p>
                  </div>
                  <div className={styles.editActions}>
                    <button
                      type="button"
                      onClick={handleCancelEdit}
                      className={styles.cancelButton}
                      disabled={savingId === source.id}
                    >
                      {t("common.cancel")}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSaveEdit(source)}
                      className={styles.saveButton}
                      disabled={savingId === source.id}
                    >
                      {savingId === source.id ? (
                        <>
                          <LoadingSpinner />
                          <span>{t("admin.sources.saving")}</span>
                        </>
                      ) : (
                        <span>{t("admin.sources.save")}</span>
                      )}
                    </button>
                  </div>
                </div>
              ) : (
                <div className={styles.sourceDetails}>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>{t("admin.sources.cadence")}</span>
                    <span className={styles.detailValue}>
                      {source.config.cadence?.every_minutes ?? "-"} min
                    </span>
                  </div>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>{t("admin.sources.weight")}</span>
                    <span className={styles.detailValue}>{source.config.weight?.toFixed(1) ?? "1.0"}</span>
                  </div>
                  <div className={styles.actionButtons}>
                    <button
                      type="button"
                      onClick={() => handleStartEdit(source)}
                      className={styles.editButton}
                      aria-label={`Edit ${source.name}`}
                    >
                      <EditIcon />
                    </button>
                    {confirmDeleteId === source.id ? (
                      <div className={styles.confirmDelete}>
                        <span className={styles.confirmText}>{t("admin.sources.confirmDelete")}</span>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className={styles.cancelDeleteButton}
                          disabled={deletingId === source.id}
                        >
                          {t("common.cancel")}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteSource(source.id)}
                          className={styles.confirmDeleteButton}
                          disabled={deletingId === source.id}
                        >
                          {deletingId === source.id ? <LoadingSpinner /> : t("common.delete")}
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(source.id)}
                        className={styles.deleteButton}
                        aria-label={`Delete ${source.name}`}
                      >
                        <TrashIcon />
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function BackIcon() {
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
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </svg>
  );
}

function SourcesIcon() {
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
      <circle cx="12" cy="12" r="2" />
      <path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg
      width="18"
      height="18"
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

function PlusIcon() {
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
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      width="18"
      height="18"
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
