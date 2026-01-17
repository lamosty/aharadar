"use client";

import { useEffect, useRef, useState } from "react";
import { WhyShown } from "@/components/WhyShown";
import { ApiError, type FeedItem, type ManualSummaryOutput } from "@/lib/api";
import { useItemSummary } from "@/lib/hooks";
import { t } from "@/lib/i18n";
import type { TriageFeatures } from "@/lib/mock-data";
import type { SortOption } from "../FeedFilterBar";
import styles from "./FeedItemModal.module.css";

interface FeedItemModalProps {
  isOpen: boolean;
  item: FeedItem | null;
  onClose: () => void;
  onFeedback: (action: "like" | "dislike") => Promise<void>;
  sort: SortOption;
  onViewSummary?: (item: FeedItem, summary: ManualSummaryOutput) => void;
  onSummaryGenerated?: () => void;
  enableSwipe?: boolean;
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

function formatRelativeTime(dateStr: string | null, isApproximate = false): string {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  const prefix = isApproximate ? "~" : "";

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${prefix}${diffMins}m ago`;
  if (diffHours < 24) return `${prefix}${diffHours}h ago`;
  return `${prefix}${diffDays}d ago`;
}

export function FeedItemModal({
  isOpen,
  item,
  onClose,
  onFeedback,
  sort,
  onViewSummary,
  onSummaryGenerated,
  enableSwipe = true,
}: FeedItemModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const swipeStartRef = useRef<{ x: number; y: number; active: boolean }>({
    x: 0,
    y: 0,
    active: false,
  });
  const swipePendingRef = useRef(false);
  const suppressClickRef = useRef(false);

  // Paste-to-summarize state
  const [pastedText, setPastedText] = useState("");
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [localSummary, setLocalSummary] = useState<ManualSummaryOutput | null>(null);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [swipeDirection, setSwipeDirection] = useState<"like" | "dislike" | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const summaryMutation = useItemSummary({
    onSuccess: (data) => {
      setLocalSummary(data.summary);
      onSummaryGenerated?.();
    },
    onError: (err) => {
      if (err instanceof ApiError && err.code === "INSUFFICIENT_CREDITS") {
        setSummaryError(t("itemSummary.insufficientCredits"));
      } else {
        setSummaryError(err.message);
      }
    },
  });

  // Reset state when item changes
  useEffect(() => {
    if (item) {
      setPastedText("");
      setSummaryError(null);
      setLocalSummary(null);
      if (bodyRef.current) {
        bodyRef.current.scrollTop = 0;
      }
    }
  }, [item?.id]);

  useEffect(() => {
    swipeStartRef.current.active = false;
    swipePendingRef.current = false;
    setSwipeOffset(0);
    setSwipeDirection(null);
    setIsDragging(false);
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

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen || !item) return null;

  const primaryUrl = item.item.url;
  const displayDate = item.item.publishedAt || item.digestCreatedAt;
  const summary = localSummary || item.manualSummaryJson;
  const swipeOpacity = Math.min(Math.abs(swipeOffset) / 120, 1);
  const maxRotation = 12;
  const rotation = Math.max(Math.min(swipeOffset / 12, maxRotation), -maxRotation);
  const swipeTransform = `translateX(${swipeOffset}px) rotate(${rotation}deg)`;
  const swipeOrigin =
    swipeOffset === 0 ? "center center" : swipeOffset > 0 ? "bottom left" : "bottom right";

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!enableSwipe) return;
    if (swipePendingRef.current) return;
    if (e.touches.length !== 1) return;

    const target = e.target as HTMLElement | null;
    if (target?.closest("input, textarea, select, [contenteditable='true']")) {
      return;
    }

    suppressClickRef.current = false;
    swipeStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
      active: true,
    };
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!enableSwipe) return;
    const start = swipeStartRef.current;
    if (!start.active || e.touches.length !== 1) return;

    const deltaX = e.touches[0].clientX - start.x;
    const deltaY = e.touches[0].clientY - start.y;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);

    if (!isDragging) {
      if (absY > absX && absY > 12) {
        start.active = false;
        setSwipeOffset(0);
        setSwipeDirection(null);
        return;
      }
      if (absX < 12) return;
      setIsDragging(true);
      suppressClickRef.current = true;
      e.preventDefault();
    }

    const maxOffset = 180;
    const clamped = Math.max(Math.min(deltaX, maxOffset), -maxOffset);
    setSwipeOffset(clamped);
    setSwipeDirection(deltaX >= 0 ? "like" : "dislike");
  };

  const triggerSwipeFeedback = async (action: "like" | "dislike") => {
    if (swipePendingRef.current) return;
    swipePendingRef.current = true;
    setIsDragging(false);
    setSwipeDirection(action);
    const outDistance = typeof window !== "undefined" ? window.innerWidth : 360;
    setSwipeOffset(action === "like" ? outDistance : -outDistance);

    try {
      await new Promise((resolve) => setTimeout(resolve, 160));
      await onFeedback(action);
    } catch {
      setSwipeOffset(0);
      setSwipeDirection(null);
    } finally {
      swipePendingRef.current = false;
    }
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!enableSwipe) return;
    const start = swipeStartRef.current;
    if (!start.active) return;

    const touch = e.changedTouches[0];
    if (!touch) return;
    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);

    swipeStartRef.current.active = false;

    if (absX > 90 && absX > absY * 1.2) {
      void triggerSwipeFeedback(deltaX > 0 ? "like" : "dislike");
      setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
      return;
    }

    setSwipeOffset(0);
    setSwipeDirection(null);
    setIsDragging(false);
    if (suppressClickRef.current) {
      setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
    }
  };

  const handleTouchCancel = () => {
    if (!enableSwipe) return;
    swipeStartRef.current.active = false;
    setSwipeOffset(0);
    setSwipeDirection(null);
    setIsDragging(false);
    suppressClickRef.current = false;
  };

  const handleClickCapture = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!suppressClickRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    suppressClickRef.current = false;
  };

  // Handle paste for summary generation
  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData("text");
    if (text.length > 100) {
      e.preventDefault();
      setPastedText(text);
      summaryMutation.mutate({
        contentItemId: item.id,
        pastedText: text,
      });
    }
  };

  // Get secondary info (comments, subreddit, etc.)
  const secondaryInfo = getSecondaryInfo(item.item);

  return (
    <div className={styles.overlay} aria-modal="true" role="dialog">
      <div
        className={styles.modal}
        ref={modalRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchCancel}
        onClickCapture={handleClickCapture}
      >
        <div
          className={`${styles.swipeCard} ${isDragging ? styles.swipeDragging : ""}`}
          style={{ transform: swipeTransform, transformOrigin: swipeOrigin }}
        >
          <div className={styles.swipeOverlay} aria-hidden="true">
            <div
              className={`${styles.swipeBadge} ${styles.likeBadge}`}
              style={{ opacity: swipeDirection === "like" ? swipeOpacity : 0 }}
            >
              Like
            </div>
            <div
              className={`${styles.swipeBadge} ${styles.dislikeBadge}`}
              style={{ opacity: swipeDirection === "dislike" ? swipeOpacity : 0 }}
            >
              Nope
            </div>
          </div>

          <div className="sr-only">
            <p>Swipe right to like. Swipe left to dislike.</p>
            <button type="button" onClick={() => onFeedback("like")}>
              Like
            </button>
            <button type="button" onClick={() => onFeedback("dislike")}>
              Dislike
            </button>
          </div>

          {/* Header */}
          <div className={styles.header}>
            <div className={styles.headerMeta}>
              <span
                className={styles.sourceBadge}
                style={{ backgroundColor: getSourceColor(item.item.sourceType) }}
              >
                {formatSourceType(item.item.sourceType)}
              </span>
              {item.item.author && (
                <span className={styles.author}>
                  {item.item.author.startsWith("@") ? item.item.author : item.item.author}
                </span>
              )}
              {displayDate && (
                <span className={styles.time}>{formatRelativeTime(displayDate)}</span>
              )}
            </div>
            <button
              type="button"
              className={styles.closeButton}
              onClick={onClose}
              aria-label="Close"
            >
              <CloseIcon />
            </button>
          </div>

          {/* Body - Scrollable content */}
          <div className={styles.body} ref={bodyRef}>
            {/* Title */}
            <h2 className={styles.title}>{getDisplayTitle(item.item)}</h2>

            {/* Open link button */}
            {primaryUrl && (
              <a
                href={primaryUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.openLink}
              >
                <ExternalLinkIcon />
                Open article
              </a>
            )}

            {/* Body preview */}
            {item.item.bodyText && <p className={styles.bodyPreview}>{item.item.bodyText}</p>}

            {/* Secondary info (comments link, etc.) */}
            {secondaryInfo && (
              <div className={styles.secondaryInfo}>
                {secondaryInfo.commentsLink && (
                  <a
                    href={secondaryInfo.commentsLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.commentsLink}
                  >
                    <CommentIcon />
                    {secondaryInfo.commentCount} comments
                  </a>
                )}
                {secondaryInfo.text && !secondaryInfo.commentsLink && (
                  <span className={styles.secondaryText}>{secondaryInfo.text}</span>
                )}
              </div>
            )}

            {/* Summary section (if exists) */}
            {summary && (
              <div className={styles.summarySection}>
                <span className={styles.sectionLabel}>AI Summary</span>
                <p className={styles.summaryText}>{summary.one_liner}</p>
                <button
                  type="button"
                  className={styles.viewSummaryBtn}
                  onClick={() => onViewSummary?.(item, summary)}
                >
                  View full summary
                </button>
              </div>
            )}

            {/* Paste input for summary generation */}
            {!summary && (
              <div className={styles.pasteSection}>
                <input
                  type="text"
                  className={styles.pasteInput}
                  placeholder="Paste article content to generate AI summary..."
                  value={pastedText}
                  onChange={(e) => setPastedText(e.target.value)}
                  onPaste={handlePaste}
                  disabled={summaryMutation.isPending}
                />
                {summaryMutation.isPending && (
                  <span className={styles.generating}>Generating summary...</span>
                )}
                {summaryError && <span className={styles.error}>{summaryError}</span>}
              </div>
            )}

            {/* Why Shown section */}
            <div className={styles.whyShownSection}>
              <WhyShown
                features={item.triageJson as TriageFeatures | undefined}
                clusterItems={item.clusterItems}
                compact={false}
                defaultExpanded={true}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Helper to get secondary info (comments, subreddit, etc.)
function getSecondaryInfo(item: FeedItem["item"]): {
  text?: string;
  commentsLink?: string;
  commentCount?: number;
} | null {
  const sourceType = item.sourceType;
  const meta = item.metadata as Record<string, unknown> | null;

  if (!meta) return null;

  if (sourceType === "hn") {
    const hnId = meta.hn_id || meta.id;
    const commentCount = typeof meta.num_comments === "number" ? meta.num_comments : null;
    if (hnId) {
      return {
        commentsLink: `https://news.ycombinator.com/item?id=${hnId}`,
        commentCount: commentCount ?? undefined,
      };
    }
  }

  if (sourceType === "reddit") {
    const subreddit = meta.subreddit as string | undefined;
    const commentCount = typeof meta.num_comments === "number" ? meta.num_comments : null;
    const permalink = meta.permalink as string | undefined;
    return {
      text: subreddit ? `r/${subreddit}` : undefined,
      commentsLink: permalink ? `https://reddit.com${permalink}` : undefined,
      commentCount: commentCount ?? undefined,
    };
  }

  return null;
}

function CloseIcon() {
  return (
    <svg
      width="20"
      height="20"
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
      width="16"
      height="16"
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

function CommentIcon() {
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
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}
