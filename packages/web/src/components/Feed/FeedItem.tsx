"use client";

import { useState } from "react";
import { FeedbackButtons } from "@/components/FeedbackButtons";
import { useToast } from "@/components/Toast";
import { Tooltip } from "@/components/Tooltip";
import { WhyShown } from "@/components/WhyShown";
import { ApiError, type FeedItem as FeedItemType, type ManualSummaryOutput } from "@/lib/api";
import { useDeepDiveDecision, useDeepDivePreview } from "@/lib/hooks";
import { type MessageKey, t } from "@/lib/i18n";
import type { TriageFeatures } from "@/lib/mock-data";
import type { Layout } from "@/lib/theme";
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
  /** Whether this is the Top Picks view (shows inline research UI) */
  isTopPicksView?: boolean;
  /** Called when user wants to view full summary (reader modal) */
  onViewSummary?: (item: FeedItemType, summary: ManualSummaryOutput) => void;
  /** Called after a summary decision (save/drop) to refetch */
  onSummaryDecision?: () => void;
  /** Called when user wants to skip to next item (Top Picks fast triage) */
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
 * Get the primary link URL for an item.
 * For Reddit/HN: link to comments (more useful than linking to random images/articles)
 * For others: link to original URL
 */
function getPrimaryLinkUrl(
  sourceType: string,
  originalUrl: string | null | undefined,
  metadata: Record<string, unknown> | null | undefined,
  externalId: string | null | undefined,
): string | null {
  // Reddit: prefer permalink (comments) over original URL
  if (sourceType === "reddit" && metadata?.permalink) {
    const permalink = metadata.permalink as string;
    return permalink.startsWith("http") ? permalink : `https://www.reddit.com${permalink}`;
  }

  // HN: prefer comments page over original URL
  if (sourceType === "hn" && externalId) {
    return `https://news.ycombinator.com/item?id=${externalId}`;
  }

  // All others: use original URL
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
  isTopPicksView = false,
  onViewSummary,
  onSummaryDecision,
  onNext,
}: FeedItemProps) {
  const [expanded, _setExpanded] = useState(false);
  const { addToast } = useToast();

  // Research panel state (for Top Picks view)
  // Initialize with existing preview summary if available
  const [pastedText, setPastedText] = useState("");
  const [summary, setSummary] = useState<ManualSummaryOutput | null>(
    item.previewSummaryJson ?? null,
  );
  const [researchError, setResearchError] = useState<string | null>(null);

  // Mutations for research
  const previewMutation = useDeepDivePreview();
  const decisionMutation = useDeepDiveDecision({
    onSuccess: () => {
      onSummaryDecision?.();
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

  // Research handlers
  const handleGenerateSummary = async () => {
    if (!pastedText.trim()) return;
    setResearchError(null);

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
      if (err instanceof ApiError && err.code === "INSUFFICIENT_CREDITS") {
        setResearchError(t("deepDive.insufficientCredits"));
      } else {
        setResearchError(message);
      }
    }
  };

  const handleSave = async () => {
    if (!summary) return;
    try {
      await decisionMutation.mutateAsync({
        contentItemId: item.id,
        decision: "promote",
        summaryJson: summary,
      });
      addToast("Saved to Deep Dives", "success");
      // Move to next item (fast triage behavior)
      onNext?.();
    } catch {
      addToast("Failed to save", "error");
    }
  };

  const handleDrop = async () => {
    try {
      await decisionMutation.mutateAsync({
        contentItemId: item.id,
        decision: "drop",
      });
      addToast("Dropped", "info");
      // Move to next item (fast triage behavior)
      onNext?.();
    } catch {
      addToast("Failed to drop", "error");
    }
  };

  // Prefer ahaScore (raw personalized score) over score (trending/decayed)
  const displayScore = item.ahaScore ?? item.score ?? 0;
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
          {item.previewSummaryJson && (
            <Tooltip content={t("feed.summaryReady")}>
              <span className={styles.summaryReadyBadge}>AI</span>
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
            <Tooltip content="Relevance score (0-100) based on your interests">
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

          {/* Actions - research panel for Top Picks, feedback for others */}
          {isTopPicksView ? (
            <div className={styles.detailResearchPanel}>
              {!summary ? (
                <>
                  <div className={styles.detailResearchInline}>
                    <textarea
                      className={styles.detailResearchTextareaSmall}
                      value={pastedText}
                      onChange={(e) => setPastedText(e.target.value)}
                      placeholder="Paste content..."
                      rows={1}
                      disabled={previewMutation.isPending}
                    />
                    <button
                      type="button"
                      className={styles.generateBtnCompact}
                      onClick={handleGenerateSummary}
                      disabled={previewMutation.isPending || !pastedText.trim()}
                    >
                      {previewMutation.isPending ? "..." : "Generate"}
                    </button>
                    {onNext && (
                      <button type="button" className={styles.nextBtnCompact} onClick={onNext}>
                        Next
                      </button>
                    )}
                    <button
                      type="button"
                      className={styles.dropBtnCompact}
                      onClick={handleDrop}
                      disabled={decisionMutation.isPending}
                    >
                      Drop
                    </button>
                  </div>
                  {researchError && <p className={styles.detailResearchError}>{researchError}</p>}
                </>
              ) : (
                <div className={styles.detailSummaryPreview}>
                  <p className={styles.detailSummaryOneLiner}>{summary.one_liner}</p>
                  <div className={styles.detailSummaryActions}>
                    <button
                      type="button"
                      className={styles.viewDetailsBtnCompact}
                      onClick={() => onViewSummary?.(item, summary)}
                    >
                      View
                    </button>
                    <button
                      type="button"
                      className={styles.saveBtnCompact}
                      onClick={handleSave}
                      disabled={decisionMutation.isPending}
                    >
                      Save
                    </button>
                    {onNext && (
                      <button type="button" className={styles.nextBtnCompact} onClick={onNext}>
                        Next
                      </button>
                    )}
                    <button
                      type="button"
                      className={styles.dropBtnCompact}
                      onClick={handleDrop}
                      disabled={decisionMutation.isPending}
                    >
                      Drop
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className={styles.detailActions}>
              <FeedbackButtons
                contentItemId={item.id}
                digestId={item.digestId}
                currentFeedback={item.feedback}
                onFeedback={handleFeedback}
                onClear={handleClear}
                variant="compact"
              />
            </div>
          )}

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

          {/* Actions - hide in Top Picks view (already liked) */}
          {!isTopPicksView && (
            <div className={styles.headerActions}>
              <FeedbackButtons
                contentItemId={item.id}
                digestId={item.digestId}
                currentFeedback={item.feedback}
                onFeedback={handleFeedback}
                onClear={handleClear}
                variant="compact"
              />
            </div>
          )}
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
          <Tooltip content={t("tooltips.ahaScore")}>
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

      {/* Research panel for Top Picks view */}
      {isTopPicksView && (
        <div className={styles.researchPanel}>
          {!summary ? (
            // Input phase: paste content and generate
            <>
              <div className={styles.researchInputRow}>
                <textarea
                  className={styles.researchTextarea}
                  value={pastedText}
                  onChange={(e) => setPastedText(e.target.value)}
                  placeholder="Paste article content here..."
                  rows={2}
                  disabled={previewMutation.isPending}
                />
                <div className={styles.researchActions}>
                  <button
                    type="button"
                    className={styles.generateBtn}
                    onClick={handleGenerateSummary}
                    disabled={previewMutation.isPending || !pastedText.trim()}
                  >
                    {previewMutation.isPending ? "Generating..." : "Generate"}
                  </button>
                  {onNext && (
                    <button type="button" className={styles.nextBtn} onClick={onNext}>
                      Next
                    </button>
                  )}
                  <button
                    type="button"
                    className={styles.dropBtn}
                    onClick={handleDrop}
                    disabled={decisionMutation.isPending}
                  >
                    Drop
                  </button>
                </div>
              </div>
              {researchError && <p className={styles.researchError}>{researchError}</p>}
            </>
          ) : (
            // Summary phase: show preview with save/drop
            <div className={styles.summaryPreview}>
              <p className={styles.summaryOneLiner}>{summary.one_liner}</p>
              <div className={styles.summaryActions}>
                <button
                  type="button"
                  className={styles.viewDetailsBtn}
                  onClick={() => onViewSummary?.(item, summary)}
                >
                  View Details
                </button>
                <button
                  type="button"
                  className={styles.saveBtn}
                  onClick={handleSave}
                  disabled={decisionMutation.isPending}
                >
                  Save
                </button>
                {onNext && (
                  <button type="button" className={styles.nextBtn} onClick={onNext}>
                    Next
                  </button>
                )}
                <button
                  type="button"
                  className={styles.dropBtn}
                  onClick={handleDrop}
                  disabled={decisionMutation.isPending}
                >
                  Drop
                </button>
              </div>
            </div>
          )}
        </div>
      )}
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
