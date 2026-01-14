"use client";

import { useState } from "react";
import { FeedbackButtons } from "@/components/FeedbackButtons";
import { useToast } from "@/components/Toast";
import { Tooltip } from "@/components/Tooltip";
import { WhyShown } from "@/components/WhyShown";
import { ApiError, type FeedItem as FeedItemType, type ManualSummaryOutput } from "@/lib/api";
import { useItemSummary } from "@/lib/hooks";
import { type MessageKey, t } from "@/lib/i18n";
import type { TriageFeatures } from "@/lib/mock-data";
import type { Layout } from "@/lib/theme";
import type { SortOption } from "./FeedFilterBar";
import styles from "./FeedItem.module.css";
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
  layout = "reader",
  showTopicBadge = false,
  forceExpanded = false,
  onHover,
  fastTriageMode = false,
  sort = "best",
  onViewSummary,
  onSummaryGenerated,
  onNext,
}: FeedItemProps) {
  const [expanded, _setExpanded] = useState(false);
  const { addToast } = useToast();

  // Inline summary state - for paste input
  const [pastedText, setPastedText] = useState("");
  const [summaryError, setSummaryError] = useState<string | null>(null);
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
  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const text = e.clipboardData.getData("text");
    if (text && text.trim().length > 50) {
      // Auto-generate after paste if substantial content
      setPastedText(text);
      setSummaryError(null);
      // Trigger generation after state update
      setTimeout(() => {
        summaryMutation.mutate({
          contentItemId: item.id,
          pastedText: text.trim(),
          metadata: {
            title: item.item.title ?? null,
            author: item.item.author ?? null,
            url: item.item.url ?? null,
            sourceType: item.item.sourceType,
          },
        });
      }, 0);
    }
  };

  const isTrendingSort = sort === "trending";
  const scoreTooltip = isTrendingSort ? t("tooltips.trendingScore") : t("tooltips.ahaScore");
  // Prefer Aha Score (raw personalized score) unless sort=trending
  const displayScore = isTrendingSort
    ? (item.trendingScore ?? item.score ?? item.ahaScore ?? 0)
    : (item.ahaScore ?? item.score ?? 0);
  const scorePercent = Math.round(displayScore * 100);
  const isRestricted = item.item.metadata?.is_restricted === true;
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

  // For condensed layout, render clean scannable row with floating detail panel on hover
  if (layout === "condensed") {
    return (
      <article
        id={`feed-item-${item.id}`}
        className={`${styles.scanItem} ${isExpanded ? styles.scanItemExpanded : ""} ${fastTriageMode ? styles.scanItemFastTriage : ""}`}
        data-testid={`feed-item-${item.id}`}
        data-feed-item
        onMouseEnter={onHover}
      >
        {/* Main row: title + trailing meta */}
        <div className={styles.scanRow}>
          {/* Topic badge if showing all topics */}
          {showTopicBadge && item.topicName && (
            <span className={styles.scanTopicBadge}>{item.topicName}</span>
          )}

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
            <Tooltip content={scoreTooltip}>
              <span className={styles.scanScore}>{scorePercent}</span>
            </Tooltip>
            <time className={styles.scanTime}>
              {formatRelativeTime(displayDate.dateStr, displayDate.isApproximate)}
            </time>
            <span className={styles.scanSourceLabel}>{formatSourceType(item.item.sourceType)}</span>
          </span>
        </div>

        {/* Floating detail panel - appears on hover, doesn't shift layout */}
        <div className={styles.detailPanel}>
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

          {/* Metadata line */}
          <div className={styles.detailMeta}>
            {author && <span className={styles.detailAuthor}>{author}</span>}
            {secondaryInfo?.text && (
              <>
                {author && <span className={styles.detailSep}>·</span>}
                <span>{secondaryInfo.text}</span>
              </>
            )}
            {secondaryInfo?.commentsLink && (
              <>
                <span className={styles.detailSep}>·</span>
                <a
                  href={secondaryInfo.commentsLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.detailCommentsLink}
                >
                  <CommentIcon size={12} />
                  <span>{secondaryInfo.commentCount}</span>
                </a>
              </>
            )}
          </div>

          {/* Actions row - feedback buttons + paste input OR view button */}
          <div className={styles.detailActions}>
            <FeedbackButtons
              contentItemId={item.id}
              digestId={item.digestId}
              currentFeedback={item.feedback}
              onFeedback={handleFeedback}
              onClear={handleClear}
              variant="compact"
            />
            {onNext && (
              <button type="button" className={styles.nextBtnCompact} onClick={onNext}>
                Next
              </button>
            )}
            {/* Inline: paste input if no summary, or View button if summary exists */}
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
          </div>
          {summaryError && <p className={styles.detailError}>{summaryError}</p>}

          {/* WhyShown */}
          <div className={styles.detailWhyShown}>
            <WhyShown
              features={item.triageJson as TriageFeatures | undefined}
              clusterItems={item.clusterItems}
              compact={true}
            />
          </div>
        </div>
      </article>
    );
  }

  // Default: reader/timeline layout (card-based)
  return (
    <article
      id={`feed-item-${item.id}`}
      className={styles.card}
      data-testid={`feed-item-${item.id}`}
      data-feed-item
    >
      <div className={styles.header}>
        {/* Left section: badges + source + meta + actions */}
        <div className={styles.headerLeft}>
          {/* Top badges row: topic + new + restricted */}
          {(showTopicBadge && item.topicName) || item.isNew || isRestricted ? (
            <div className={styles.headerBadges}>
              {showTopicBadge && item.topicName && (
                <span className={styles.topicBadge}>{item.topicName}</span>
              )}
              {item.isNew && <span className={styles.newBadge}>{t("digests.feed.newBadge")}</span>}
              {isRestricted && <span className={styles.restrictedBadge}>Restricted</span>}
            </div>
          ) : null}

          {/* Two-line source section */}
          <SourceSection
            sourceType={item.item.sourceType}
            sourceId={item.item.sourceId}
            metadata={item.item.metadata}
            externalId={item.item.externalId}
            author={item.item.author}
          />

          {/* Meta: author, date */}
          <span className={styles.meta}>
            {author && <span className={styles.author}>{author}</span>}
            {author && <span className={styles.separator}>·</span>}
            <time
              className={`${styles.time} ${displayDate.isApproximate ? styles.timeApprox : ""}`}
              dateTime={displayDate.dateStr}
              title={displayDate.isApproximate ? t("feed.approximateDate") : undefined}
            >
              {formatRelativeTime(displayDate.dateStr, displayDate.isApproximate)}
            </time>
          </span>

          {/* Actions + inline paste input on desktop */}
          <div className={styles.headerActions}>
            <FeedbackButtons
              contentItemId={item.id}
              digestId={item.digestId}
              currentFeedback={item.feedback}
              onFeedback={handleFeedback}
              onClear={handleClear}
              variant="compact"
            />
            {/* Inline paste input (desktop only) - show if no summary */}
            {!summary && (
              <div className={styles.inlinePasteWrapper}>
                <input
                  type="text"
                  className={styles.inlinePasteInput}
                  value={pastedText}
                  onChange={(e) => setPastedText(e.target.value)}
                  onPaste={handlePaste}
                  placeholder={t("feed.pasteToSummarize")}
                  disabled={summaryMutation.isPending}
                />
                {summaryMutation.isPending && (
                  <span className={styles.inlineGeneratingIndicator}>...</span>
                )}
              </div>
            )}
            {/* AI badge if summary exists */}
            {summary && (
              <button
                type="button"
                className={styles.summaryReadyBadge}
                onClick={() => onViewSummary?.(item, summary)}
                title={t("feed.viewSummary")}
              >
                AI
              </button>
            )}
          </div>
        </div>

        {/* Right section: cluster badge + score */}
        <div className={styles.headerRight}>
          {item.clusterMemberCount && item.clusterMemberCount > 1 && (
            <Tooltip content={t("tooltips.clusterSources", { count: item.clusterMemberCount })}>
              <span className={styles.clusterBadge}>
                +{item.clusterMemberCount - 1}{" "}
                {item.clusterMemberCount === 2 ? t("feed.source") : t("feed.sources")}
              </span>
            </Tooltip>
          )}
          <Tooltip content={scoreTooltip}>
            <div className={styles.score}>
              <div className={styles.scoreBar} style={{ width: `${scorePercent}%` }} />
              <span className={styles.scoreText}>{scorePercent}</span>
            </div>
          </Tooltip>
        </div>
      </div>

      <h3 className={styles.title}>
        {primaryLinkUrl ? (
          <a
            href={primaryLinkUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.titleLink}
          >
            {getDisplayTitle(item)}
          </a>
        ) : (
          <span>{getDisplayTitle(item)}</span>
        )}
      </h3>

      {/* Body text preview - shows body as additional context for items with title */}
      {/* For items without title (X posts): title already shows full content, no need for body */}
      {hasRealTitle && expandedBodyText && <p className={styles.bodyPreview}>{expandedBodyText}</p>}

      <WhyShown
        features={item.triageJson as TriageFeatures | undefined}
        clusterItems={item.clusterItems}
      />

      {/* Summary section (mobile only - desktop has inline paste in header) */}
      <div className={styles.summarySection}>
        {summary ? (
          // Show existing summary preview
          <div className={styles.summaryPreview}>
            <p className={styles.summaryOneLiner}>{summary.one_liner}</p>
            <button
              type="button"
              className={styles.viewDetailsBtn}
              onClick={() => onViewSummary?.(item, summary)}
            >
              {t("feed.viewSummary")}
            </button>
          </div>
        ) : (
          // Show paste input for generating summary (mobile)
          <div className={styles.mobilePasteSection}>
            <input
              type="text"
              className={styles.mobilePasteInput}
              value={pastedText}
              onChange={(e) => setPastedText(e.target.value)}
              onPaste={handlePaste}
              placeholder={t("feed.pasteToSummarize")}
              disabled={summaryMutation.isPending}
            />
            {summaryMutation.isPending && (
              <span className={styles.generatingIndicator}>{t("feed.generating")}</span>
            )}
          </div>
        )}
        {summaryError && <p className={styles.summaryError}>{summaryError}</p>}
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
