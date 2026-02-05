"use client";

import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/Toast";
import {
  ApiError,
  type FeedDossierExportMode,
  type FeedDossierExportResponse,
  type FeedDossierExportSort,
} from "@/lib/api";
import { useFeedDossierExport } from "@/lib/hooks";
import { t } from "@/lib/i18n";
import styles from "./FeedExportModal.module.css";

interface FeedExportModalProps {
  isOpen: boolean;
  topicId: string | null;
  defaultSort: FeedDossierExportSort;
  onClose: () => void;
}

const TOP_N_MIN = 1;
const TOP_N_MAX = 200;

type ExportData = FeedDossierExportResponse["export"];

export function FeedExportModal({ isOpen, topicId, defaultSort, onClose }: FeedExportModalProps) {
  const { addToast } = useToast();
  const [mode, setMode] = useState<FeedDossierExportMode>("ai_summaries");
  const [sort, setSort] = useState<FeedDossierExportSort>(defaultSort);
  const [topN, setTopN] = useState<number>(50);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [exportData, setExportData] = useState<ExportData | null>(null);

  const exportMutation = useFeedDossierExport({
    onSuccess: (data) => {
      setSubmitError(null);
      setExportData(data.export);
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        setSubmitError(err.message);
      } else {
        setSubmitError(t("feed.export.errors.generateFailed"));
      }
    },
  });

  useEffect(() => {
    if (!isOpen) return;
    setSort(defaultSort);
    setSubmitError(null);
  }, [isOpen, defaultSort]);

  const scopeTopicId = topicId ?? "all";

  const selectedModeLabel = useMemo(() => {
    switch (mode) {
      case "top_n":
        return t("feed.export.modes.topN");
      case "liked_or_bookmarked":
        return t("feed.export.modes.likedOrBookmarked");
      default:
        return t("feed.export.modes.aiSummaries");
    }
  }, [mode]);

  const handleGenerate = (e: FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    if (mode === "top_n" && (topN < TOP_N_MIN || topN > TOP_N_MAX || !Number.isInteger(topN))) {
      setSubmitError(t("feed.export.errors.invalidTopN", { min: TOP_N_MIN, max: TOP_N_MAX }));
      return;
    }

    exportMutation.mutate({
      topicId: scopeTopicId,
      mode,
      topN: mode === "top_n" ? topN : undefined,
      sort,
      includeExcerpt: true,
    });
  };

  const handleCopy = async () => {
    if (!exportData) return;
    try {
      await navigator.clipboard.writeText(exportData.content);
      addToast(t("feed.export.copySuccess"), "success");
    } catch {
      addToast(t("feed.export.copyFailed"), "error");
    }
  };

  const handleDownload = () => {
    if (!exportData) return;
    const blob = new Blob([exportData.content], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = exportData.filename || "aharadar-dossier.md";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    addToast(t("feed.export.downloadSuccess"), "success");
  };

  const handleModalClose = () => {
    setMode("ai_summaries");
    setTopN(50);
    setSort(defaultSort);
    setSubmitError(null);
    setExportData(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={handleModalClose} data-modal>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.title}>{t("feed.export.title")}</h2>
          <button className={styles.closeButton} onClick={handleModalClose} aria-label="Close">
            ×
          </button>
        </div>

        <form className={styles.form} onSubmit={handleGenerate}>
          <div className={styles.row}>
            <label className={styles.label} htmlFor="feed-export-mode">
              {t("feed.export.mode")}
            </label>
            <select
              id="feed-export-mode"
              className={styles.select}
              value={mode}
              onChange={(e) => setMode(e.target.value as FeedDossierExportMode)}
            >
              <option value="ai_summaries">{t("feed.export.modes.aiSummaries")}</option>
              <option value="top_n">{t("feed.export.modes.topN")}</option>
              <option value="liked_or_bookmarked">
                {t("feed.export.modes.likedOrBookmarked")}
              </option>
            </select>
          </div>

          <div className={styles.row}>
            <label className={styles.label} htmlFor="feed-export-sort">
              {t("feed.export.sort")}
            </label>
            <select
              id="feed-export-sort"
              className={styles.select}
              value={sort}
              onChange={(e) => setSort(e.target.value as FeedDossierExportSort)}
            >
              <option value="best">{t("feed.export.sortOptions.best")}</option>
              <option value="latest">{t("feed.export.sortOptions.latest")}</option>
              <option value="trending">{t("feed.export.sortOptions.trending")}</option>
              <option value="ai_score">{t("feed.export.sortOptions.aiScore")}</option>
              <option value="has_ai_summary">{t("feed.export.sortOptions.hasAiSummary")}</option>
            </select>
          </div>

          {mode === "top_n" && (
            <div className={styles.row}>
              <label className={styles.label} htmlFor="feed-export-topn">
                {t("feed.export.topN")}
              </label>
              <input
                id="feed-export-topn"
                className={styles.input}
                type="number"
                min={TOP_N_MIN}
                max={TOP_N_MAX}
                value={topN}
                onChange={(e) => setTopN(Number.parseInt(e.target.value, 10) || TOP_N_MIN)}
              />
            </div>
          )}

          <p className={styles.scopeText}>
            {topicId ? t("feed.export.scope.currentTopic") : t("feed.export.scope.allTopics")}
          </p>

          {submitError && <p className={styles.error}>{submitError}</p>}

          <div className={styles.actions}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleModalClose}
              disabled={exportMutation.isPending}
            >
              {t("common.cancel")}
            </button>
            <button type="submit" className="btn btn-primary" disabled={exportMutation.isPending}>
              {exportMutation.isPending ? t("feed.export.generating") : t("feed.export.generate")}
            </button>
          </div>
        </form>

        {exportData && (
          <div className={styles.resultSection}>
            <h3 className={styles.resultTitle}>{t("feed.export.readyTitle")}</h3>
            <p className={styles.resultMeta}>
              {t("feed.export.summaryLine", {
                mode: selectedModeLabel,
                exported: exportData.stats.exportedCount,
                selected: exportData.stats.selectedCount,
              })}
            </p>
            <p className={styles.resultMeta}>
              {t("feed.export.statsLine", {
                skipped: exportData.stats.skippedNoSummaryCount,
                chars: exportData.stats.charCount,
              })}
            </p>
            {exportData.stats.truncated && (
              <p className={styles.warning}>
                {t("feed.export.truncated", {
                  reason: exportData.stats.truncatedBy ?? "limit",
                })}
              </p>
            )}

            <div className={styles.resultActions}>
              <button type="button" className="btn btn-primary" onClick={handleCopy}>
                {t("feed.export.copy")}
              </button>
              <button type="button" className="btn btn-secondary" onClick={handleDownload}>
                {t("feed.export.download")}
              </button>
            </div>

            <details className={styles.preview}>
              <summary>{t("feed.export.preview")}</summary>
              <textarea readOnly className={styles.previewText} value={exportData.content} />
            </details>
          </div>
        )}
      </div>
    </div>
  );
}
