"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { t } from "@/lib/i18n";
import { useToast } from "@/components/Toast";
import styles from "./page.module.css";

interface Source {
  id: string;
  type: string;
  name: string;
  isEnabled: boolean;
  config: {
    cadence?: { mode: string; every_minutes: number };
    weight?: number;
  };
  createdAt: string;
  lastFetchedAt?: string;
}

// Mock data - will be replaced by real API hooks
function useMockSources() {
  const [sources, setSources] = useState<Source[]>([
    {
      id: "src-1",
      type: "rss",
      name: "Hacker News RSS",
      isEnabled: true,
      config: { cadence: { mode: "interval", every_minutes: 60 }, weight: 1.5 },
      createdAt: "2025-01-01T00:00:00Z",
      lastFetchedAt: "2025-01-06T10:30:00Z",
    },
    {
      id: "src-2",
      type: "reddit",
      name: "r/programming",
      isEnabled: true,
      config: { cadence: { mode: "interval", every_minutes: 120 }, weight: 1.2 },
      createdAt: "2025-01-01T00:00:00Z",
      lastFetchedAt: "2025-01-06T09:15:00Z",
    },
    {
      id: "src-3",
      type: "youtube",
      name: "Tech Channels",
      isEnabled: false,
      config: { cadence: { mode: "interval", every_minutes: 480 }, weight: 1.0 },
      createdAt: "2025-01-02T00:00:00Z",
    },
    {
      id: "src-4",
      type: "rss",
      name: "TechCrunch",
      isEnabled: true,
      config: { cadence: { mode: "interval", every_minutes: 240 }, weight: 0.8 },
      createdAt: "2025-01-03T00:00:00Z",
      lastFetchedAt: "2025-01-06T08:00:00Z",
    },
  ]);

  const updateSource = useCallback(
    async (id: string, updates: Partial<Source>): Promise<void> => {
      // Simulate API delay
      await new Promise((resolve) => setTimeout(resolve, 500));

      setSources((prev) =>
        prev.map((s) => (s.id === id ? { ...s, ...updates } : s))
      );
    },
    []
  );

  return { sources, updateSource, isLoading: false };
}

export default function AdminSourcesPage() {
  const { addToast } = useToast();
  const { sources, updateSource, isLoading } = useMockSources();
  const [savingId, setSavingId] = useState<string | null>(null);
  const [editingSource, setEditingSource] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<{
    cadenceMinutes: number;
    weight: number;
  } | null>(null);

  const handleToggleEnabled = async (source: Source) => {
    try {
      await updateSource(source.id, { isEnabled: !source.isEnabled });
      addToast(t("toast.sourceUpdated"), "success");
    } catch {
      addToast(t("toast.sourceUpdateFailed"), "error");
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
      await updateSource(source.id, {
        config: {
          ...source.config,
          cadence: { mode: "interval", every_minutes: editValues.cadenceMinutes },
          weight: editValues.weight,
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

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString();
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
      </header>

      {sources.length === 0 ? (
        <div className={styles.empty}>
          <SourcesIcon />
          <p>{t("admin.sources.noSources")}</p>
        </div>
      ) : (
        <div className={styles.sourcesList}>
          {sources.map((source) => (
            <div key={source.id} className={styles.sourceCard}>
              <div className={styles.sourceHeader}>
                <div className={styles.sourceInfo}>
                  <span className={styles.sourceType}>{source.type}</span>
                  <h3 className={styles.sourceName}>{source.name}</h3>
                  {source.lastFetchedAt && (
                    <p className={styles.lastFetched}>
                      {t("admin.sources.lastFetched")}:{" "}
                      {formatDate(source.lastFetchedAt)}
                    </p>
                  )}
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
                    <label
                      htmlFor={`cadence-${source.id}`}
                      className={styles.editLabel}
                    >
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
                    <label
                      htmlFor={`weight-${source.id}`}
                      className={styles.editLabel}
                    >
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
                    <p className={styles.editHint}>
                      {t("admin.sources.weightDescription")}
                    </p>
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
                    <span className={styles.detailLabel}>
                      {t("admin.sources.cadence")}
                    </span>
                    <span className={styles.detailValue}>
                      {source.config.cadence?.every_minutes ?? "-"} min
                    </span>
                  </div>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>
                      {t("admin.sources.weight")}
                    </span>
                    <span className={styles.detailValue}>
                      {source.config.weight?.toFixed(1) ?? "1.0"}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleStartEdit(source)}
                    className={styles.editButton}
                    aria-label={`Edit ${source.name}`}
                  >
                    <EditIcon />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
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
