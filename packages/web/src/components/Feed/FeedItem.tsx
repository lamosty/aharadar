"use client";

import { useState } from "react";
import { type FeedItem as FeedItemType } from "@/lib/api";
import { type Layout } from "@/lib/theme";
import { WhyShown } from "@/components/WhyShown";
import { FeedbackButtons } from "@/components/FeedbackButtons";
import { Tooltip } from "@/components/Tooltip";
import { type TriageFeatures } from "@/lib/mock-data";
import { t, type MessageKey } from "@/lib/i18n";
import styles from "./FeedItem.module.css";

interface FeedItemProps {
  item: FeedItemType;
  onFeedback?: (contentItemId: string, action: "like" | "dislike" | "save" | "skip") => Promise<void>;
  /** Layout mode - affects rendering style */
  layout?: Layout;
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
  return text.slice(0, maxLength).trim() + "…";
}

function getDisplayTitle(item: FeedItemType): string {
  // Prefer title, fall back to truncated body text
  if (item.item.title) return item.item.title;
  if (item.item.bodyText) return truncateText(item.item.bodyText, 200);
  return "(Untitled)";
}

export function FeedItem({ item, onFeedback, layout = "reader" }: FeedItemProps) {
  const [whyShownOpen, setWhyShownOpen] = useState(false);

  const handleFeedback = async (action: "like" | "dislike" | "save" | "skip") => {
    if (onFeedback) {
      await onFeedback(item.id, action);
    }
  };

  const scorePercent = Math.round(item.score * 100);
  const subreddit = item.item.metadata?.subreddit as string | undefined;
  const displayDate = getDisplayDate(item);
  const author =
    item.item.sourceType === "x_posts" && item.item.metadata?.user_display_name
      ? `${item.item.metadata.user_display_name} (${item.item.author})`
      : item.item.author;

  // Get preview text - only show if it adds new information
  // When there's no title, getDisplayTitle falls back to bodyText, so don't duplicate
  const hasRealTitle = Boolean(item.item.title);
  const previewText =
    hasRealTitle && item.item.bodyText ? truncateText(item.item.bodyText, 100) : null;

  // For condensed layout, render a two-line row with expandable WhyShown
  if (layout === "condensed") {
    return (
      <article className={styles.condensedItem} data-testid={`feed-item-${item.id}`}>
        {/* Row 1: Source, Title, Meta, Actions, Score */}
        <div className={styles.condensedRow}>
          <Tooltip content={getSourceTooltip(item.item.sourceType, subreddit)}>
            <span
              className={styles.condensedSource}
              style={{ "--source-color": getSourceColor(item.item.sourceType) } as React.CSSProperties}
            >
              {formatSourceType(item.item.sourceType)}
            </span>
          </Tooltip>

          <div className={styles.condensedContent}>
            <span className={styles.condensedTitle}>
              {item.item.url ? (
                <a
                  href={item.item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.condensedTitleLink}
                >
                  {getDisplayTitle(item)}
                </a>
              ) : (
                getDisplayTitle(item)
              )}
            </span>
            {/* Row 2: Preview text */}
            {previewText && <span className={styles.condensedPreview}>{previewText}</span>}
          </div>

          <div className={styles.condensedMeta}>
            {author && <span className={styles.condensedAuthor}>{author}</span>}
            <time className={styles.condensedTime}>
              {formatRelativeTime(displayDate.dateStr, displayDate.isApproximate)}
            </time>
          </div>

          <div className={styles.condensedActions}>
            {/* WhyShown toggle button - sparkles icon for AI insights */}
            <Tooltip content={t("digests.whyShown.title")}>
              <button
                type="button"
                className={`${styles.whyShownToggle} ${whyShownOpen ? styles.whyShownToggleActive : ""}`}
                onClick={() => setWhyShownOpen(!whyShownOpen)}
                aria-expanded={whyShownOpen}
                aria-label={t("digests.whyShown.title")}
              >
                <SparklesIcon />
              </button>
            </Tooltip>

            <FeedbackButtons
              contentItemId={item.id}
              digestId={item.digestId}
              currentFeedback={item.feedback}
              onFeedback={handleFeedback}
              variant="compact"
            />
          </div>

          <Tooltip content={t("tooltips.ahaScore")}>
            <span className={styles.condensedScore}>{scorePercent}</span>
          </Tooltip>
        </div>

        {/* Expandable WhyShown section - compact mode, shows directly */}
        {whyShownOpen && (
          <div className={styles.condensedWhyShown}>
            <WhyShown
              features={item.triageJson as TriageFeatures | undefined}
              clusterItems={item.clusterItems}
              compact={true}
            />
          </div>
        )}
      </article>
    );
  }

  // Default: reader/timeline layout (card-based)
  return (
    <article className={styles.card} data-testid={`feed-item-${item.id}`}>
      <div className={styles.header}>
        {/* Left section: badges + meta + actions */}
        <div className={styles.headerLeft}>
          {/* Badge group: source badges, clusters, comments link */}
          <div className={styles.badgeGroup}>
            {item.isNew && <span className={styles.newBadge}>{t("digests.feed.newBadge")}</span>}
            <Tooltip content={getSourceTooltip(item.item.sourceType, subreddit)}>
              <span
                className={styles.sourceTag}
                style={{ "--source-color": getSourceColor(item.item.sourceType) } as React.CSSProperties}
              >
                {formatSourceType(item.item.sourceType)}
              </span>
            </Tooltip>
            {item.item.sourceType === "reddit" && subreddit && (
              <span className={styles.subreddit}>r/{subreddit}</span>
            )}
            {item.clusterMemberCount && item.clusterMemberCount > 1 && (
              <Tooltip content={t("tooltips.clusterSources", { count: item.clusterMemberCount })}>
                <span className={styles.clusterBadge}>
                  +{item.clusterMemberCount - 1}{" "}
                  {item.clusterMemberCount === 2 ? t("feed.source") : t("feed.sources")}
                </span>
              </Tooltip>
            )}
            {item.item.sourceType === "hn" && item.item.externalId && (
              <a
                href={`https://news.ycombinator.com/item?id=${item.item.externalId}`}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.commentsLink}
                title={t("feed.hnComments")}
              >
                <CommentIcon />
                <span>{t("feed.hnComments")}</span>
              </a>
            )}
          </div>

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

          {/* Actions */}
          <div className={styles.headerActions}>
            <FeedbackButtons
              contentItemId={item.id}
              digestId={item.digestId}
              currentFeedback={item.feedback}
              onFeedback={handleFeedback}
              variant="compact"
            />
          </div>
        </div>

        {/* Right section: score (always on right) */}
        <Tooltip content={t("tooltips.ahaScore")}>
          <div className={styles.score}>
            <div className={styles.scoreBar} style={{ width: `${scorePercent}%` }} />
            <span className={styles.scoreText}>{scorePercent}</span>
          </div>
        </Tooltip>
      </div>

      <h3 className={styles.title}>
        {item.item.url ? (
          <a href={item.item.url} target="_blank" rel="noopener noreferrer" className={styles.titleLink}>
            {getDisplayTitle(item)}
          </a>
        ) : (
          <span>{getDisplayTitle(item)}</span>
        )}
      </h3>

      <WhyShown features={item.triageJson as TriageFeatures | undefined} clusterItems={item.clusterItems} />
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
      aria-hidden="true"
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function SparklesIcon() {
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
      <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z" />
      <path d="M5 19l1 3 1-3 3-1-3-1-1-3-1 3-3 1 3 1z" />
    </svg>
  );
}
