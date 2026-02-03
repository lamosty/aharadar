"use client";

import { useEffect, useState } from "react";
import { FeedbackButtons } from "@/components/FeedbackButtons";
import { useToast } from "@/components/Toast";
import { Tooltip } from "@/components/Tooltip";
import { WhyShown } from "@/components/WhyShown";
import { ApiError, type FeedItem as FeedItemType, type ManualSummaryOutput } from "@/lib/api";
import { isScoringModeDisplayEnabled } from "@/lib/experimental";
import { useBookmarkToggle, useIsBookmarked, useItemSummary } from "@/lib/hooks";
import { type MessageKey, t } from "@/lib/i18n";
import type { TriageFeatures } from "@/lib/mock-data";
import type { Layout } from "@/lib/theme";
import type { SortOption } from "./FeedFilterBar";
import styles from "./FeedItem.module.css";
import { ScoreDebugTooltip } from "./ScoreDebugTooltip";
import { XAccountHealthNudge } from "./XAccountHealthNudge";

interface FeedItemProps {
  item: FeedItemType;
  onFeedback?: (contentItemId: string, action: "like" | "dislike" | "skip") => Promise<void>;
  /** Called when feedback is cleared (toggle off) */
  onClear?: (contentItemId: string) => Promise<void>;
  /** Layout mode - affects rendering style */
  layout?: Layout;
  /** Whether to show topic badge (for "all topics" mode) */
  showTopicBadge?: boolean;
  /** Force expand detail panel (for fast triage mode) */
  forceExpanded?: boolean;
  /** Called when item is hovered (for clearing force-expand on other items) */
  onHover?: () => void;
  /** Whether fast triage mode is active (disables hover expansion) */
  fastTriageMode?: boolean;
  /** Current sort mode (controls score label/tooltip) */
  sort?: SortOption;
  /** Called when user wants to view full summary (reader modal) */
  onViewSummary?: (item: FeedItemType, summary: ManualSummaryOutput) => void;
  /** Called after a summary is generated (to refetch) */
  onSummaryGenerated?: () => void;
  /** Called when user wants to skip to next item (Highlights fast triage) */
  onNext?: () => void;
  /** Called when user closes the panel (to clear force-expanded state) */
  onClose?: () => void;
  /** Called on mobile when item is tapped (opens full-screen modal) */
  onMobileClick?: () => void;
  /** Called when user wants to undo last feedback (desktop only) */
  onUndo?: () => void;
  /** Whether undo is available (desktop only) */
  canUndo?: boolean;
  /** Called when item is clicked to select it (fast triage mode) */
  onSelect?: () => void;
}

interface DisplayDate {
  dateStr: string;
  isApproximate: boolean;
}

/**
 * Get the best available date for display with fallback chain:
 * 1. publishedAt - original publication date (may be approximate for X posts)
 * 2. digestCreatedAt - when item was processed (always available)
 *
 * X posts have day-level dates (noon UTC approximation), marked as approximate.
 */
function getDisplayDate(item: FeedItemType): DisplayDate {
  // Primary: publishedAt (full timestamp from source)
  if (item.item.publishedAt) {
    // X posts only have day-level precision, mark as approximate
    const isXPost = item.item.sourceType === "x_posts";
    return { dateStr: item.item.publishedAt, isApproximate: isXPost };
  }

  // Ultimate fallback: digestCreatedAt (when processed)
  return { dateStr: item.digestCreatedAt, isApproximate: true };
}

function formatRelativeTime(dateStr: string, isApproximate: boolean = false): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  // For approximate dates (day-only or digest date), don't show precise times
  if (isApproximate) {
    if (diffDays < 1) return "today";
    if (diffDays === 1) return "yesterday";
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
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

function getSourceTooltip(type: string, subreddit?: string): string {
  const tooltipKeys: Record<string, MessageKey> = {
    hn: "tooltips.sourceHN",
    reddit: "tooltips.sourceReddit",
    rss: "tooltips.sourceRSS",
    youtube: "tooltips.sourceYouTube",
    x_posts: "tooltips.sourceX",
    signal: "tooltips.sourceSignal",
  };
  const key = tooltipKeys[type];
  const baseTooltip = key ? t(key) : `Content from ${type}`;
  if (type === "reddit" && subreddit) {
    return `r/${subreddit} - ${baseTooltip}`;
  }
  return baseTooltip;
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trim()}…`;
}

function getDisplayTitle(item: FeedItemType): string {
  // Prefer title, fall back to body text
  // For items without title (e.g. X posts), show more text since body is the primary content
  if (item.item.title) return item.item.title;
  if (item.item.bodyText) return truncateText(item.item.bodyText, 600);
  return "(Untitled)";
}

/**
 * Source-specific secondary info for two-line source display
 */
interface SourceSecondaryInfo {
  type: "reddit" | "hn" | "x";
  /** Display text (subreddit name, @handle) */
  text?: string;
  /** Link to comments/discussion */
  commentsLink?: string;
  /** Comment count if available */
  commentCount?: number;
}

/**
 * Get source-specific secondary info for the second line of source display
 */
/**
 * Get the primary link URL for an item (title/body click target).
 * For Reddit: link to comments (Reddit posts often link to images/external sites)
 * For HN: link to original article (comments are accessed via comments button)
 * For others: link to original URL
 */
function getPrimaryLinkUrl(
  sourceType: string,
  originalUrl: string | null | undefined,
  metadata: Record<string, unknown> | null | undefined,
  _externalId: string | null | undefined,
): string | null {
  // Reddit: prefer permalink (comments) over original URL
  // Reddit posts often link to images or external sites, comments are more useful
  if (sourceType === "reddit" && metadata?.permalink) {
    const permalink = metadata.permalink as string;
    return permalink.startsWith("http") ? permalink : `https://www.reddit.com${permalink}`;
  }

  // HN and all others: use original URL (comments accessed via comments button)
  return originalUrl || null;
}

/**
 * Abbreviate scoring mode name for badge display
 */
function abbreviateModeName(name: string): string {
  const abbrevMap: Record<string, string> = {
    Balanced: "BAL",
    "Preference-Heavy": "PREF",
    "AI + Calibration": "AI+C",
  };
  return abbrevMap[name] || name.slice(0, 3).toUpperCase();
}

/**
 * Get mode type for CSS data attribute
 */
function getModeType(name: string): string {
  if (name.toLowerCase().includes("balance")) return "balanced";
  if (name.toLowerCase().includes("preference")) return "preference";
  if (name.toLowerCase().includes("calibration")) return "ai-calibration";
  return "default";
}

function getSourceSecondaryInfo(
  sourceType: string,
  metadata: Record<string, unknown> | null | undefined,
  externalId: string | null | undefined,
  author: string | null | undefined,
): SourceSecondaryInfo | null {
  if (sourceType === "reddit" && metadata) {
    const subreddit = metadata.subreddit as string | undefined;
    const numComments = metadata.num_comments as number | undefined;
    const permalink = metadata.permalink as string | undefined;

    if (subreddit) {
      // Build full Reddit URL from permalink
      // Permalink may be full URL or just path
      const commentsLink = permalink
        ? permalink.startsWith("http")
          ? permalink
          : `https://www.reddit.com${permalink}`
        : undefined;

      return {
        type: "reddit",
        text: `r/${subreddit}`,
        commentsLink,
        commentCount: numComments ?? 0,
      };
    }
  }

  if (sourceType === "hn" && externalId) {
    const descendants = metadata?.descendants as number | undefined;
    return {
      type: "hn",
      commentsLink: `https://news.ycombinator.com/item?id=${externalId}`,
      commentCount: descendants ?? 0,
    };
  }

  if (sourceType === "x_posts" && author) {
    // author is already in @handle format
    return {
      type: "x",
      text: author,
    };
  }

  return null;
}

interface SourceSectionProps {
  sourceType: string;
  sourceId: string;
  metadata?: Record<string, unknown> | null;
  externalId?: string | null;
  author?: string | null;
  /** Use compact styling for condensed layout */
  compact?: boolean;
}

/**
 * Two-line source display section
 * Line 1: Source badge (HN, Reddit, X)
 * Line 2: Context (subreddit + comments, HN comments, @handle)
 */
function SourceSection({
  sourceType,
  sourceId,
  metadata,
  externalId,
  author,
  compact = false,
}: SourceSectionProps) {
  const subreddit = metadata?.subreddit as string | undefined;
  const secondary = getSourceSecondaryInfo(sourceType, metadata, externalId, author);

  // Extract handle for X account health nudge (without @ prefix)
  const xHandle =
    secondary?.type === "x" && secondary.text ? secondary.text.replace(/^@/, "") : null;

  return (
    <div className={compact ? styles.condensedSourceSection : styles.sourceSection}>
      {/* Line 1: Source badge */}
      <Tooltip content={getSourceTooltip(sourceType, subreddit)}>
        <span
          className={compact ? styles.condensedSource : styles.sourceTag}
          style={{ "--source-color": getSourceColor(sourceType) } as React.CSSProperties}
        >
          {formatSourceType(sourceType)}
        </span>
      </Tooltip>

      {/* Line 2: Source-specific context */}
      {secondary && (
        <div className={styles.sourceLine2}>
          {secondary.type === "reddit" && (
            <>
              <span className={styles.sourceContext}>{secondary.text}</span>
              {secondary.commentsLink && (
                <a
                  href={secondary.commentsLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.commentsLinkInline}
                  title={t("feed.redditComments")}
                >
                  <CommentIcon size={12} />
                  <span>{secondary.commentCount}</span>
                </a>
              )}
            </>
          )}

          {secondary.type === "hn" && secondary.commentsLink && (
            <a
              href={secondary.commentsLink}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.commentsLinkInline}
              title={t("feed.hnComments")}
            >
              <CommentIcon size={12} />
              <span>{secondary.commentCount}</span>
            </a>
          )}

          {secondary.type === "x" && (
            <>
              <span className={styles.sourceContext}>{secondary.text}</span>
              {xHandle && <XAccountHealthNudge sourceId={sourceId} handle={xHandle} />}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function FeedItem({
  item,
  onFeedback,
  onClear,
  layout = "condensed",
  showTopicBadge = false,
  forceExpanded = false,
  onHover,
  fastTriageMode = false,
  sort = "best",
  onViewSummary,
  onSummaryGenerated,
  onNext,
  onClose,
  onMobileClick,
  onUndo,
  canUndo,
  onSelect,
}: FeedItemProps) {
  const [expanded, setExpanded] = useState(false);
  const { addToast } = useToast();

  // Bookmark state and mutation
  const { data: isBookmarked } = useIsBookmarked(item.id);
  const bookmarkMutation = useBookmarkToggle();

  // Inline summary state - for paste input
  const [pastedText, setPastedText] = useState("");
  const [summaryError, setSummaryError] = useState<string | null>(null);
  // Pending large text confirmation
  const [pendingLargeText, setPendingLargeText] = useState<string | null>(null);
  // Local summary state for immediate display after generation
  const [localSummary, setLocalSummary] = useState<ManualSummaryOutput | null>(null);
  // Use local summary if just generated, otherwise use server-returned summary
  const summary = localSummary ?? item.manualSummaryJson ?? null;

  // Item summary mutation
  const summaryMutation = useItemSummary({
    onSuccess: (data) => {
      setLocalSummary(data.summary);
      setPastedText("");
      addToast(t("feed.summaryGenerated"), "success");
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

  // Force expanded state (for fast triage mode)
  const isExpanded = forceExpanded || expanded;

  // In fast triage mode, collapse any locally expanded items so only the
  // force-expanded selection remains visible.
  useEffect(() => {
    if (fastTriageMode && expanded && !forceExpanded) {
      setExpanded(false);
    }
  }, [fastTriageMode, expanded, forceExpanded]);

  // Toggle expansion (for mobile tap interaction)
  const toggleExpanded = () => {
    // On mobile, open full-screen modal instead of inline expansion
    if (onMobileClick) {
      onMobileClick();
      return;
    }
    // If onSelect is provided, parent wants selection behavior (fast triage mode)
    if (onSelect) {
      onSelect();
      return;
    }
    // Otherwise toggle local expansion
    setExpanded((prev) => !prev);
  };

  // Close the detail panel
  const closePanel = () => {
    setExpanded(false);
    // In fast triage mode, also notify parent to clear force-expanded state
    if (forceExpanded && onClose) {
      onClose();
    }
  };

  const handleFeedback = async (action: "like" | "dislike" | "skip") => {
    if (onFeedback) {
      await onFeedback(item.id, action);
    }
  };

  const handleClear = async () => {
    if (onClear) {
      await onClear(item.id);
    }
  };

  // Auto-generate on paste event (works with both input and textarea)
  const SOFT_LIMIT = 60000; // No warning below this
  const HARD_LIMIT = 100000; // Max allowed

  const triggerSummary = (text: string) => {
    setPastedText(text);
    setSummaryError(null);
    setPendingLargeText(null);
    summaryMutation.mutate({
      contentItemId: item.id,
      pastedText: text,
      metadata: {
        title: item.item.title ?? null,
        author: item.item.author ?? null,
        url: item.item.url ?? null,
        sourceType: item.item.sourceType,
      },
    });
    // Auto-advance to next item after brief delay (summary generates in background)
    if (onNext) {
      setTimeout(() => onNext(), 500);
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const text = e.clipboardData.getData("text");
    if (text && text.trim().length > 50) {
      const trimmedText = text.trim();

      // Large text handling
      if (trimmedText.length > HARD_LIMIT) {
        // Over hard limit: trim and warn
        const finalText = trimmedText.slice(0, HARD_LIMIT);
        addToast(t("feed.textTrimmedToMax"), "info");
        triggerSummary(finalText);
      } else if (trimmedText.length > SOFT_LIMIT) {
        // Between soft and hard limit: show inline confirmation
        setPastedText(trimmedText);
        setPendingLargeText(trimmedText);
        setSummaryError(null);
      } else {
        // Under soft limit: process immediately
        triggerSummary(trimmedText);
      }
    }
  };

  const handleConfirmLargeText = () => {
    if (pendingLargeText) {
      triggerSummary(pendingLargeText);
    }
  };

  const handleCancelLargeText = () => {
    setPendingLargeText(null);
    setPastedText("");
  };

  const isTrendingSort = sort === "trending";
  // Prefer Aha Score (raw personalized score) unless sort=trending
  const displayScore = isTrendingSort
    ? (item.trendingScore ?? item.score ?? item.ahaScore ?? 0)
    : (item.ahaScore ?? item.score ?? 0);
  const scorePercent = Math.round(displayScore * 100);
  const isRestricted = item.item.metadata?.is_restricted === true;
  const isRead = Boolean(item.readAt);
  const displayDate = getDisplayDate(item);
  // For X posts: show display name only (handle is shown in source section)
  // For other sources: show author as-is
  const author =
    item.item.sourceType === "x_posts"
      ? (item.item.metadata?.user_display_name as string) || null
      : item.item.author;

  // Get preview text for expanded view
  // For items with title: show bodyText as additional context
  // For items without title (e.g. X posts): show full bodyText since title is already truncated version
  const hasRealTitle = Boolean(item.item.title);
  const bodyText = item.item.bodyText || null;

  // Expanded view shows more text (4-5 lines on desktop, ~600 chars)
  // For items without title, this is the full content they couldn't see in the truncated title
  const expandedBodyText = bodyText ? truncateText(bodyText, 600) : null;

  // Get primary link URL (comments for Reddit/HN, original for others)
  const primaryLinkUrl = getPrimaryLinkUrl(
    item.item.sourceType,
    item.item.url,
    item.item.metadata,
    item.item.externalId,
  );

  // Get secondary info for expanded metadata
  const secondaryInfo = getSourceSecondaryInfo(
    item.item.sourceType,
    item.item.metadata,
    item.item.externalId,
    item.item.author,
  );

  // Get triage features for AI score and categories
  const triageFeatures = item.triageJson as TriageFeatures | undefined;

  // Condensed layout: clean scannable row with floating detail panel on hover
  return (
    <article
      id={`feed-item-${item.id}`}
      className={`${styles.scanItem} ${isExpanded ? styles.scanItemExpanded : ""} ${fastTriageMode ? styles.scanItemFastTriage : ""}`}
      data-testid={`feed-item-${item.id}`}
      data-feed-item
      onMouseEnter={onHover}
    >
      {/* Main row: title + trailing meta - tap to expand on mobile */}
      <div className={styles.scanRow} onClick={toggleExpanded}>
        {/* Topic badge if showing all topics */}
        {showTopicBadge && item.topicName && (
          <span className={styles.scanTopicBadge}>{item.topicName}</span>
        )}
        {isRead && <span className={styles.readBadge}>{t("feed.readBadge")}</span>}

        {/* AI summary ready indicator - before title */}
        {summary && (
          <Tooltip content={t("feed.summaryReady")}>
            <button
              type="button"
              className={styles.summaryReadyBadge}
              onClick={() => onViewSummary?.(item, summary)}
            >
              AI
            </button>
          </Tooltip>
        )}

        {/* Title */}
        <span className={styles.scanTitle}>
          {primaryLinkUrl ? (
            <a
              href={primaryLinkUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.scanTitleLink}
            >
              {getDisplayTitle(item)}
            </a>
          ) : (
            getDisplayTitle(item)
          )}
        </span>

        {/* Trailing metadata */}
        <span className={styles.scanMeta}>
          {isRestricted && <span className={styles.restrictedBadge}>Restricted</span>}
          <Tooltip
            content={
              <ScoreDebugTooltip
                isTrendingSort={isTrendingSort}
                triageJson={item.triageJson as TriageFeatures | undefined}
                displayScore={displayScore}
                scoringModeName={item.scoringModeName}
              />
            }
          >
            <span className={styles.scanScore}>{scorePercent}</span>
          </Tooltip>
          {isScoringModeDisplayEnabled() && item.scoringModeName && (
            <Tooltip content={`Scoring mode: ${item.scoringModeName}`}>
              <span
                className={styles.scoringModeBadge}
                data-mode={getModeType(item.scoringModeName)}
              >
                {abbreviateModeName(item.scoringModeName)}
              </span>
            </Tooltip>
          )}
          <time className={styles.scanTime}>
            {formatRelativeTime(displayDate.dateStr, displayDate.isApproximate)}
          </time>
          {primaryLinkUrl ? (
            <a
              href={primaryLinkUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.scanSourceLabel}
              onClick={(e) => e.stopPropagation()}
            >
              {formatSourceType(item.item.sourceType)}
            </a>
          ) : (
            <span className={styles.scanSourceLabel}>{formatSourceType(item.item.sourceType)}</span>
          )}
        </span>
      </div>

      {/* Backdrop for mobile - tap to close */}
      <div className={styles.detailPanelBackdrop} onClick={closePanel} aria-hidden="true" />

      {/* Floating detail panel - appears on hover, doesn't shift layout */}
      <div className={styles.detailPanel}>
        {/* Action bar - desktop only */}
        <div className={styles.detailPanelActions}>
          {/* Left side: AI score + comments + tags + metadata (for scanning with eyes) */}
          <span className={styles.actionBarMeta}>
            {/* AI Score badge */}
            {triageFeatures?.ai_score != null && (
              <Tooltip content={`AI Score: ${triageFeatures.ai_score}/100`}>
                <span className={styles.aiScoreBadge}>AI: {triageFeatures.ai_score}</span>
              </Tooltip>
            )}
            {/* Comments link - after AI score so action buttons stay stable */}
            {secondaryInfo?.commentsLink && (
              <a
                href={secondaryInfo.commentsLink}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.commentsButton}
                title={`${secondaryInfo.commentCount ?? 0} comments`}
              >
                <CommentIcon size={12} />
                <span>{secondaryInfo.commentCount ?? 0}</span>
              </a>
            )}
            {/* Source context: subreddit (with author on hover) or @username (with display name on hover) */}
            {secondaryInfo?.text && (
              <Tooltip
                content={
                  secondaryInfo.type === "reddit" && author
                    ? `by u/${author}`
                    : secondaryInfo.type === "x" && author
                      ? author // Show display name for X
                      : undefined
                }
              >
                {primaryLinkUrl ? (
                  <a
                    href={primaryLinkUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.actionBarSource}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {secondaryInfo.text}
                  </a>
                ) : (
                  <span className={styles.actionBarSource}>{secondaryInfo.text}</span>
                )}
              </Tooltip>
            )}
            {/* Topic tag - single focused label for grouping */}
            {triageFeatures?.topic && triageFeatures.topic !== "Uncategorized" && (
              <Tooltip content={triageFeatures.one_liner ?? triageFeatures.reason ?? ""}>
                <span className={styles.actionBarTags}>
                  <span className={styles.actionBarTag}>{triageFeatures.topic}</span>
                </span>
              </Tooltip>
            )}
          </span>

          {/* Right side: Action buttons - ordered so thumbs up/down never move */}
          <div className={styles.actionGroupRight}>
            {/* Variable width elements first */}
            {summary ? (
              <button
                type="button"
                className={styles.viewDetailsBtnCompact}
                onClick={() => onViewSummary?.(item, summary)}
              >
                {t("feed.viewSummary")}
              </button>
            ) : (
              <>
                <input
                  type="text"
                  className={styles.detailPasteInputInline}
                  value={pastedText}
                  onChange={(e) => setPastedText(e.target.value)}
                  onPaste={handlePaste}
                  placeholder={t("feed.pasteToSummarize")}
                  disabled={summaryMutation.isPending}
                />
                {summaryMutation.isPending && (
                  <span className={styles.generatingIndicatorSmall}>...</span>
                )}
              </>
            )}
            <button
              type="button"
              className={`${styles.actionIconButton} ${isBookmarked ? styles.actionIconButtonActive : ""}`}
              onClick={() => bookmarkMutation.mutate(item.id)}
              aria-label={isBookmarked ? t("feed.removeBookmark") : t("feed.addBookmark")}
              aria-pressed={isBookmarked}
              disabled={bookmarkMutation.isPending}
            >
              <BookmarkIcon filled={isBookmarked} />
            </button>
            {/* Separator before stable buttons */}
            <span className={styles.actionSeparator} />
            {/* Fixed position buttons - these never move */}
            {canUndo && (
              <button
                type="button"
                className={styles.actionIconButtonGhost}
                onClick={onUndo}
                aria-label={t("feed.undo")}
              >
                <UndoIcon />
              </button>
            )}
            <FeedbackButtons
              contentItemId={item.id}
              digestId={item.digestId}
              currentFeedback={item.feedback}
              onFeedback={handleFeedback}
              onClear={handleClear}
              variant="compact"
            />
          </div>
        </div>

        {/* Mobile header buttons - only visible on mobile */}
        <div className={styles.detailPanelHeader}>
          {primaryLinkUrl && (
            <a
              href={primaryLinkUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.detailPanelOpenLink}
              aria-label="Open article"
            >
              <ExternalLinkIcon />
              <span>Open</span>
            </a>
          )}
          <button
            type="button"
            className={styles.detailPanelClose}
            onClick={closePanel}
            aria-label="Close"
          >
            <CloseIcon />
          </button>
        </div>

        {/* Body text - shows full/expanded content, clickable to open the same link as title */}
        {expandedBodyText &&
          (primaryLinkUrl ? (
            <a
              href={primaryLinkUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.detailPreviewLink}
            >
              {expandedBodyText}
            </a>
          ) : (
            <p className={styles.detailPreview}>{expandedBodyText}</p>
          ))}

        {summaryError && <p className={styles.detailError}>{summaryError}</p>}

        {/* Large text confirmation banner */}
        {pendingLargeText && (
          <div className={styles.largeTextConfirm}>
            <span className={styles.largeTextInfo}>
              {Math.round(pendingLargeText.length / 1000)}k chars (~
              {Math.round(pendingLargeText.length / 4000)}k tokens) - costs more
            </span>
            <button type="button" className={styles.confirmBtn} onClick={handleConfirmLargeText}>
              {t("common.confirm")}
            </button>
            <button type="button" className={styles.cancelBtn} onClick={handleCancelLargeText}>
              {t("common.cancel")}
            </button>
          </div>
        )}

        {/* WhyShown */}
        <div className={styles.detailWhyShown}>
          <WhyShown
            features={triageFeatures}
            clusterItems={item.clusterItems}
            compact={true}
            hideScore={true}
            hideCategories={true}
          />
        </div>
      </div>
    </article>
  );
}

export function FeedItemSkeleton() {
  return (
    <article className={styles.card} aria-busy="true">
      <div className={styles.header}>
        <span className={`${styles.skeleton} ${styles.skeletonTag}`} />
        <span className={`${styles.skeleton} ${styles.skeletonMeta}`} />
        <span className={`${styles.skeleton} ${styles.skeletonActions}`} />
        <span className={`${styles.skeleton} ${styles.skeletonScore}`} />
      </div>
      <div className={`${styles.skeleton} ${styles.skeletonTitle}`} />
    </article>
  );
}

function CommentIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
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
      aria-hidden="true"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function ExternalLinkIcon() {
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
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

function UndoIcon() {
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
      <path d="M9 14l-4-4 4-4" />
      <path d="M5 10h9a5 5 0 1 1 0 10h-1" />
    </svg>
  );
}

function BookmarkIcon({ filled }: { filled?: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
  );
}
