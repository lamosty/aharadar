"use client";

import { useEffect, useRef } from "react";
import type { FeedItem, ManualSummaryOutput } from "@/lib/api";
import { t } from "@/lib/i18n";
import styles from "./ItemSummaryModal.module.css";

interface ItemSummaryModalProps {
  isOpen: boolean;
  item: FeedItem | null;
  summary: ManualSummaryOutput | null;
  onClose: () => void;
  /** Called when user wants to read next item with existing summary */
  onReadNext?: () => void;
  /** Whether there's a next item with summary available */
  hasNextWithSummary?: boolean;
  /** Called when user gives feedback on the item */
  onFeedback?: (action: "like" | "dislike" | "skip") => Promise<void>;
  /** Current feedback state for the item */
  currentFeedback?: "like" | "dislike" | "skip" | null;
}

// Helper functions
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

export function ItemSummaryModal({
  isOpen,
  item,
  summary,
  onClose,
  onReadNext,
  hasNextWithSummary,
  onFeedback,
  currentFeedback,
}: ItemSummaryModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

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

  if (!isOpen || !item || !summary) return null;

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
                {t("itemSummary.openOriginal")}
              </a>
            )}
          </div>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </div>

        {/* Body - Summary display */}
        <div className={styles.body}>
          <div className={styles.summarySection}>
            <div className={styles.summaryBlock}>
              <h5>{t("itemSummary.oneLiner")}</h5>
              <p className={styles.oneLiner}>{summary.one_liner}</p>
            </div>

            {summary.bullets.length > 0 && (
              <div className={styles.summaryBlock}>
                <h5>{t("itemSummary.bullets")}</h5>
                <ul className={styles.bulletList}>
                  {summary.bullets.map((bullet, i) => (
                    <li key={i}>{bullet}</li>
                  ))}
                </ul>
              </div>
            )}

            {summary.why_it_matters.length > 0 && (
              <div className={styles.summaryBlock}>
                <h5>{t("itemSummary.whyItMatters")}</h5>
                <ul className={styles.bulletList}>
                  {summary.why_it_matters.map((why, i) => (
                    <li key={i}>{why}</li>
                  ))}
                </ul>
              </div>
            )}

            {summary.risks_or_caveats.length > 0 && (
              <div className={styles.summaryBlock}>
                <h5>{t("itemSummary.risksOrCaveats")}</h5>
                <ul className={styles.bulletList}>
                  {summary.risks_or_caveats.map((risk, i) => (
                    <li key={i}>{risk}</li>
                  ))}
                </ul>
              </div>
            )}

            {summary.suggested_followups.length > 0 && (
              <div className={styles.summaryBlock}>
                <h5>{t("itemSummary.suggestedFollowups")}</h5>
                <ul className={styles.bulletList}>
                  {summary.suggested_followups.map((followup, i) => (
                    <li key={i}>{followup}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        {/* Footer with feedback actions */}
        <div className={styles.footer}>
          <div className={styles.feedbackActions}>
            <button
              type="button"
              className={`${styles.feedbackBtn} ${styles.likeBtn} ${currentFeedback === "like" ? styles.active : ""}`}
              onClick={() => onFeedback?.("like")}
            >
              <ThumbsUpIcon />
              {t("itemSummary.like")}
            </button>
            <button
              type="button"
              className={`${styles.feedbackBtn} ${styles.dislikeBtn} ${currentFeedback === "dislike" ? styles.active : ""}`}
              onClick={() => onFeedback?.("dislike")}
            >
              <ThumbsDownIcon />
              {t("itemSummary.dislike")}
            </button>
            <button
              type="button"
              className={`${styles.feedbackBtn} ${styles.skipBtn}`}
              onClick={() => onFeedback?.("skip")}
            >
              <SkipIcon />
              {t("itemSummary.skip")}
            </button>
          </div>
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

function ThumbsUpIcon() {
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
      <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
    </svg>
  );
}

function ThumbsDownIcon() {
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
      <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17" />
    </svg>
  );
}

function SkipIcon() {
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
      <polygon points="5 4 15 12 5 20 5 4" />
      <line x1="19" y1="5" x2="19" y2="19" />
    </svg>
  );
}
