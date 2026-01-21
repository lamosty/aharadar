"use client";

import { animate, motion, useMotionValue, useTransform } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { WhyShown } from "@/components/WhyShown";
import { ApiError, type FeedItem, type ManualSummaryOutput } from "@/lib/api";
import { useBookmarkToggle, useIsBookmarked, useItemSummary } from "@/lib/hooks";
import { t } from "@/lib/i18n";
import type { TriageFeatures } from "@/lib/mock-data";
import type { SortOption } from "../FeedFilterBar";
import styles from "./FeedItemModal.module.css";

interface FeedItemModalProps {
  isOpen: boolean;
  item: FeedItem | null;
  onClose: () => void;
  onFeedback: (action: "like" | "dislike") => Promise<void>;
  onUndo?: () => void;
  canUndo?: boolean;
  sort: SortOption;
  onViewSummary?: (item: FeedItem, summary: ManualSummaryOutput) => void;
  onSummaryGenerated?: () => void;
  enableSwipe?: boolean;
}

// Spring configurations - tuned for snappy Tinder-like feel
const springs = {
  snapBack: { type: "spring" as const, stiffness: 500, damping: 30 },
  swipeOut: { type: "spring" as const, stiffness: 800, damping: 40 },
};

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

// Rubber-band function for elastic feel past threshold
function rubberBand(value: number, limit: number, elasticity = 0.35): number {
  if (Math.abs(value) <= limit) return value;
  const sign = value < 0 ? -1 : 1;
  const overflow = Math.abs(value) - limit;
  return sign * (limit + overflow * elasticity);
}

// Get AI score color based on value
function getScoreColor(score: number): string {
  if (score >= 80) return "var(--color-success)";
  if (score >= 60) return "var(--color-warning)";
  return "var(--color-text-muted)";
}

export function FeedItemModal({
  isOpen,
  item,
  onClose,
  onFeedback,
  onUndo,
  canUndo = false,
  sort,
  onViewSummary,
  onSummaryGenerated,
  enableSwipe = true,
}: FeedItemModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const swipeStartRef = useRef<{ x: number; y: number; active: boolean; startTime: number }>({
    x: 0,
    y: 0,
    active: false,
    startTime: 0,
  });
  const swipePendingRef = useRef(false);
  const suppressClickRef = useRef(false);

  // Paste-to-summarize state
  const [pastedText, setPastedText] = useState("");
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [localSummary, setLocalSummary] = useState<ManualSummaryOutput | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Bookmark state and mutation
  const { data: isBookmarked } = useIsBookmarked(item?.id ?? null);
  const bookmarkMutation = useBookmarkToggle();

  // Framer Motion values
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 0, 200], [-15, 0, 15]);
  const scale = useTransform(x, [-200, 0, 200], [0.96, 1, 0.96]);
  const likeOpacity = useTransform(x, [0, 100], [0, 1]);
  const dislikeOpacity = useTransform(x, [-100, 0], [1, 0]);
  const likeBadgeScale = useTransform(x, [0, 100], [0.85, 1.05]);
  const dislikeBadgeScale = useTransform(x, [-100, 0], [1.05, 0.85]);

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
    if (!item) return;
    setPastedText("");
    setSummaryError(null);
    setLocalSummary(null);
    if (bodyRef.current) {
      bodyRef.current.scrollTop = 0;
    }
  }, [item]);

  // Reset motion value when item changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: x is stable from useMotionValue, only reset on item change
  useEffect(() => {
    swipeStartRef.current.active = false;
    swipePendingRef.current = false;
    setIsDragging(false);
    x.set(0);
  }, [item?.id]);

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
  const triageFeatures = item.triageJson as TriageFeatures | undefined;
  const aiScore = triageFeatures?.ai_score;
  const categories = triageFeatures?.categories || [];
  const aiReason = triageFeatures?.reason;
  const isNovel = triageFeatures?.is_novel;
  const isXPost = item.item.sourceType === "x_posts";
  // For X posts, author IS the title - don't show it twice
  const showAuthorInHeader = !isXPost && !!item.item.author;

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!enableSwipe) return;
    if (swipePendingRef.current) return;
    if (e.touches.length !== 1) return;

    const target = e.target as HTMLElement | null;
    if (target?.closest("input, textarea, select, [contenteditable='true']")) {
      return;
    }

    suppressClickRef.current = false;
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    swipeStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
      active: true,
      startTime: now,
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
        x.set(0);
        return;
      }
      if (absX < 12) return;
      setIsDragging(true);
      suppressClickRef.current = true;
      e.preventDefault();
    }

    // Apply rubber-banding for elastic feel
    const rubbered = rubberBand(deltaX, 150);
    x.set(rubbered);
  };

  const triggerSwipeFeedback = (action: "like" | "dislike") => {
    if (swipePendingRef.current) return;
    swipePendingRef.current = true;
    setIsDragging(false);

    // Haptic feedback
    if ("vibrate" in navigator) {
      navigator.vibrate(action === "like" ? [8, 30, 8] : 12);
    }

    // Quick exit animation, THEN fire feedback
    // This gives visual feedback while keeping things snappy
    const outDistance = typeof window !== "undefined" ? window.innerWidth + 100 : 500;
    animate(x, action === "like" ? outDistance : -outDistance, {
      type: "spring",
      stiffness: 1200,
      damping: 50,
      onComplete: () => {
        void onFeedback(action);
        swipePendingRef.current = false;
      },
    });
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
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    const duration = Math.max(now - start.startTime, 1);
    const velocity = absX / duration;

    swipeStartRef.current.active = false;

    // Use velocity to project final position (momentum-based)
    const projectedX = x.get() + velocity * 120;
    const isLongSwipe = Math.abs(projectedX) > 80 && absX > absY * 1.2;
    const isFlick = absX > 32 && absX > absY * 1.1 && duration < 260 && velocity > 0.35;

    if (isLongSwipe || isFlick) {
      void triggerSwipeFeedback(deltaX > 0 ? "like" : "dislike");
      setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
      return;
    }

    // Snap back with spring
    animate(x, 0, springs.snapBack);
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
    animate(x, 0, springs.snapBack);
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

  // Determine transform origin based on x position
  const currentX = x.get();
  const transformOrigin =
    currentX === 0 ? "center center" : currentX > 0 ? "bottom left" : "bottom right";

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
        <motion.div
          className={`${styles.swipeCard} ${isDragging ? styles.swipeDragging : ""}`}
          style={{
            x,
            rotate,
            scale,
            transformOrigin,
          }}
          initial={{ opacity: 0.95, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={springs.snapBack}
        >
          {/* Swipe badges */}
          <div className={styles.swipeOverlay} aria-hidden="true">
            <motion.div
              className={`${styles.swipeBadge} ${styles.likeBadge}`}
              style={{ opacity: likeOpacity, scale: likeBadgeScale }}
            >
              Like
            </motion.div>
            <motion.div
              className={`${styles.swipeBadge} ${styles.dislikeBadge}`}
              style={{ opacity: dislikeOpacity, scale: dislikeBadgeScale }}
            >
              Nope
            </motion.div>
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

          {/* Compact Header - everything in minimal space */}
          <div className={styles.compactHeader}>
            {/* Top row: source, score, time, actions */}
            <div className={styles.headerRow}>
              <div className={styles.headerLeft}>
                <span
                  className={styles.sourceBadge}
                  style={{ backgroundColor: getSourceColor(item.item.sourceType) }}
                >
                  {formatSourceType(item.item.sourceType)}
                </span>
                {typeof aiScore === "number" && (
                  <span className={styles.aiScore} style={{ color: getScoreColor(aiScore) }}>
                    {aiScore}
                  </span>
                )}
                {showAuthorInHeader && <span className={styles.author}>{item.item.author}</span>}
                {displayDate && (
                  <span className={styles.time}>{formatRelativeTime(displayDate)}</span>
                )}
              </div>
              <div className={styles.headerActions}>
                <button
                  type="button"
                  className={`${styles.iconButton} ${isBookmarked ? styles.iconButtonActive : ""}`}
                  onClick={() => item && bookmarkMutation.mutate(item.id)}
                  aria-label={isBookmarked ? "Remove bookmark" : "Add bookmark"}
                  aria-pressed={isBookmarked}
                  title={isBookmarked ? "Remove bookmark" : "Add bookmark"}
                  disabled={bookmarkMutation.isPending}
                >
                  <BookmarkIcon filled={isBookmarked} />
                </button>
                {canUndo && (
                  <button
                    type="button"
                    className={styles.iconButton}
                    onClick={onUndo}
                    aria-label="Undo"
                  >
                    <UndoIcon />
                  </button>
                )}
                <button
                  type="button"
                  className={styles.iconButton}
                  onClick={onClose}
                  aria-label="Close"
                >
                  <CloseIcon />
                </button>
              </div>
            </div>
            {/* Tags row - wraps to show all */}
            {(isNovel || categories.length > 0) && (
              <div className={styles.tagsRow}>
                {isNovel && <span className={styles.novelBadge}>NEW</span>}
                {categories.map((cat) => (
                  <span key={cat} className={styles.categoryTag}>
                    {cat}
                  </span>
                ))}
              </div>
            )}
            {/* AI Reason - the key insight for quick decision */}
            {aiReason && <p className={styles.aiReason}>{aiReason}</p>}
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

            {/* Paste input for summary generation - only on desktop (not typical mobile UX) */}
            {!summary && !enableSwipe && (
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

            {/* Why Shown section - compact mode since everything is in header, no double toggle */}
            <div className={styles.whyShownSection}>
              <WhyShown
                features={item.triageJson as TriageFeatures | undefined}
                clusterItems={item.clusterItems}
                compact={true}
                hideScore={true}
                hideCategories={true}
                hideReason={true}
                defaultAdvancedExpanded={false}
              />
            </div>
          </div>
        </motion.div>
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

function UndoIcon() {
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
    >
      <path d="M9 14l-4-4 4-4" />
      <path d="M5 10h9a5 5 0 1 1 0 10h-1" />
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

function BookmarkIcon({ filled }: { filled?: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
  );
}
