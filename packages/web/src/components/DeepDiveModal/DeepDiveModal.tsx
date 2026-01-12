"use client";

import { useEffect, useRef, useState } from "react";
import { useToast } from "@/components/Toast";
import type { FeedItem, ManualSummaryOutput } from "@/lib/api";
import { useDeepDiveDecision, useDeepDivePreview } from "@/lib/hooks";
import { t } from "@/lib/i18n";
import styles from "./DeepDiveModal.module.css";

const MAX_CHARS = 60000;

interface DeepDiveModalProps {
  isOpen: boolean;
  item: FeedItem | null;
  existingSummary?: ManualSummaryOutput | null;
  onClose: () => void;
  onDecision: () => void;
}

// Helper functions from deep-dive page
function getDisplayTitle(item: {
  title: string | null;
  author: string | null;
  sourceType: string;
}): string {
  if (item.sourceType === "x_posts" && !item.title) {
    if (item.author) {
      return item.author.startsWith("@") ? item.author : `@${item.author}`;
    }
    return "X post";
  }
  return item.title || "(No title)";
}

function formatSourceType(type: string): string {
  const labels: Record<string, string> = {
    hn: "HN",
    reddit: "Reddit",
    rss: "RSS",
    youtube: "YouTube",
    x_posts: "X",
    signal: "Signal",
  };
  return labels[type] || type.toUpperCase();
}

function getSourceColor(type: string): string {
  const colors: Record<string, string> = {
    hn: "var(--color-warning)",
    reddit: "#ff4500",
    rss: "var(--color-primary)",
    youtube: "#ff0000",
    x_posts: "var(--color-text-primary)",
    signal: "var(--color-success)",
  };
  return colors[type] || "var(--color-text-muted)";
}

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

export function DeepDiveModal({
  isOpen,
  item,
  existingSummary,
  onClose,
  onDecision,
}: DeepDiveModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const { addToast } = useToast();

  // State
  const [pastedText, setPastedText] = useState("");
  const [summary, setSummary] = useState<ManualSummaryOutput | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Use existing summary if provided (reader mode)
  const displaySummary = existingSummary || summary;

  // Mutations
  const previewMutation = useDeepDivePreview();
  const decisionMutation = useDeepDiveDecision({
    onSuccess: () => {
      onDecision();
      onClose();
    },
  });

  // Reset state when item changes or modal opens
  useEffect(() => {
    if (item && isOpen) {
      setPastedText("");
      setSummary(null);
      setError(null);
    }
  }, [item?.id, isOpen]);

  // Handle click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen, onClose]);

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  const handleGenerateSummary = async () => {
    if (!item || !pastedText.trim()) return;

    setError(null);

    try {
      const result = await previewMutation.mutateAsync({
        contentItemId: item.id,
        pastedText: pastedText.trim(),
        metadata: {
          title: item.item.title ?? undefined,
          author: item.item.author ?? undefined,
          url: item.item.url ?? undefined,
          sourceType: item.item.sourceType,
        },
      });
      setSummary(result.summary);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to generate summary";
      if (message.includes("INSUFFICIENT_CREDITS")) {
        setError(t("deepDive.insufficientCredits"));
      } else {
        setError(message);
      }
    }
  };

  const handleSave = async () => {
    if (!item || !displaySummary) return;

    try {
      await decisionMutation.mutateAsync({
        contentItemId: item.id,
        decision: "promote",
        summaryJson: displaySummary,
      });
      addToast("Item saved to Deep Dives", "success");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save";
      addToast(message, "error");
    }
  };

  const handleDrop = async () => {
    if (!item) return;

    try {
      await decisionMutation.mutateAsync({
        contentItemId: item.id,
        decision: "drop",
      });
      addToast("Item dropped", "info");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to drop";
      addToast(message, "error");
    }
  };

  if (!isOpen || !item) return null;

  const charCount = pastedText.length;
  const isOverLimit = charCount > MAX_CHARS;
  const isPending = previewMutation.isPending || decisionMutation.isPending;

  return (
    <div className={styles.overlay} aria-modal="true" role="dialog">
      <div className={styles.modal} ref={modalRef}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerContent}>
            <div className={styles.headerMeta}>
              <span
                className={styles.sourceBadge}
                style={{ backgroundColor: getSourceColor(item.item.sourceType) }}
              >
                {formatSourceType(item.item.sourceType)}
              </span>
              {item.item.author && (
                <span className={styles.author}>
                  {item.item.author.startsWith("@") ? item.item.author : `@${item.item.author}`}
                </span>
              )}
              {item.item.publishedAt && (
                <span className={styles.time}>{formatRelativeTime(item.item.publishedAt)}</span>
              )}
            </div>
            <h2 className={styles.title}>{getDisplayTitle(item.item)}</h2>
            {item.item.url && (
              <a
                href={item.item.url}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.openLink}
              >
                <ExternalLinkIcon />
                Open to copy content
              </a>
            )}
            {item.item.bodyText && (
              <p className={styles.bodyPreview}>{item.item.bodyText.slice(0, 200)}...</p>
            )}
          </div>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </div>

        {/* Body */}
        <div className={styles.body}>
          {!displaySummary ? (
            // Phase A: Paste input (only when no existing summary)
            <div className={styles.pasteSection}>
              <label className={styles.label}>{t("deepDive.paste.label")}</label>
              <textarea
                className={`${styles.textarea} ${isOverLimit ? styles.textareaError : ""}`}
                value={pastedText}
                onChange={(e) => setPastedText(e.target.value)}
                placeholder={t("deepDive.paste.placeholder")}
                disabled={isPending}
              />
              <div className={styles.textareaFooter}>
                <span className={`${styles.charCount} ${isOverLimit ? styles.charCountError : ""}`}>
                  {charCount.toLocaleString()} / {MAX_CHARS.toLocaleString()}
                </span>
              </div>
              <p className={styles.warning}>{t("deepDive.paste.warning")}</p>

              {error && <p className={styles.error}>{error}</p>}
            </div>
          ) : (
            // Phase B: Summary display (reader mode)
            <div className={styles.summarySection}>
              <h4 className={styles.sectionTitle}>{t("deepDive.preview.title")}</h4>

              <div className={styles.summaryBlock}>
                <h5>{t("deepDive.preview.oneLiner")}</h5>
                <p className={styles.oneLiner}>{displaySummary.one_liner}</p>
              </div>

              {displaySummary.bullets.length > 0 && (
                <div className={styles.summaryBlock}>
                  <h5>{t("deepDive.preview.bullets")}</h5>
                  <ul className={styles.bulletList}>
                    {displaySummary.bullets.map((bullet, i) => (
                      <li key={i}>{bullet}</li>
                    ))}
                  </ul>
                </div>
              )}

              {displaySummary.why_it_matters.length > 0 && (
                <div className={styles.summaryBlock}>
                  <h5>{t("deepDive.preview.whyItMatters")}</h5>
                  <ul className={styles.bulletList}>
                    {displaySummary.why_it_matters.map((why, i) => (
                      <li key={i}>{why}</li>
                    ))}
                  </ul>
                </div>
              )}

              {displaySummary.risks_or_caveats.length > 0 && (
                <div className={styles.summaryBlock}>
                  <h5>{t("deepDive.preview.risksOrCaveats")}</h5>
                  <ul className={styles.bulletList}>
                    {displaySummary.risks_or_caveats.map((risk, i) => (
                      <li key={i}>{risk}</li>
                    ))}
                  </ul>
                </div>
              )}

              {displaySummary.suggested_followups.length > 0 && (
                <div className={styles.summaryBlock}>
                  <h5>{t("deepDive.preview.suggestedFollowups")}</h5>
                  <ul className={styles.bulletList}>
                    {displaySummary.suggested_followups.map((followup, i) => (
                      <li key={i}>{followup}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          {!displaySummary ? (
            <>
              <button
                type="button"
                className={styles.dropButton}
                onClick={handleDrop}
                disabled={isPending}
              >
                {t("deepDive.drop")}
              </button>
              <button
                type="button"
                className={styles.generateButton}
                onClick={handleGenerateSummary}
                disabled={isPending || !pastedText.trim() || isOverLimit}
              >
                {previewMutation.isPending ? t("deepDive.summarizing") : t("deepDive.summarize")}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className={styles.dropButton}
                onClick={handleDrop}
                disabled={isPending}
              >
                {t("deepDive.drop")}
              </button>
              <button
                type="button"
                className={styles.saveButton}
                onClick={handleSave}
                disabled={isPending}
              >
                {decisionMutation.isPending ? "Saving..." : "Save"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function CloseIcon() {
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
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function ExternalLinkIcon() {
  return (
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
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}
