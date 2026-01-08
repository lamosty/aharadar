"use client";

import { type FeedItem as FeedItemType } from "@/lib/api";
import { WhyShown } from "@/components/WhyShown";
import { FeedbackButtons } from "@/components/FeedbackButtons";
import { Tooltip } from "@/components/Tooltip";
import { type TriageFeatures } from "@/lib/mock-data";
import { t, type MessageKey } from "@/lib/i18n";
import styles from "./FeedItem.module.css";

interface FeedItemProps {
  item: FeedItemType;
  onFeedback?: (contentItemId: string, action: "like" | "dislike" | "save" | "skip") => Promise<void>;
}

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

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

export function FeedItem({ item, onFeedback }: FeedItemProps) {
  const handleFeedback = async (action: "like" | "dislike" | "save" | "skip") => {
    if (onFeedback) {
      await onFeedback(item.id, action);
    }
  };

  const scorePercent = Math.round(item.score * 100);

  const subreddit = item.item.metadata?.subreddit as string | undefined;

  return (
    <article className={styles.card} data-testid={`feed-item-${item.id}`}>
      <div className={styles.header}>
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
        <span className={styles.meta}>
          {item.item.author && (
            <span className={styles.author}>
              {item.item.sourceType === "x_posts" && item.item.metadata?.user_display_name
                ? `${item.item.metadata.user_display_name} (${item.item.author})`
                : item.item.author}
            </span>
          )}
          {item.item.author && item.item.publishedAt && <span className={styles.separator}>·</span>}
          {item.item.publishedAt && (
            <time className={styles.time} dateTime={item.item.publishedAt}>
              {formatRelativeTime(item.item.publishedAt)}
            </time>
          )}
        </span>
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

      <div className={styles.footer}>
        <FeedbackButtons
          contentItemId={item.id}
          digestId={item.digestId}
          currentFeedback={item.feedback}
          onFeedback={handleFeedback}
          variant="compact"
        />
        <WhyShown features={item.triageJson as TriageFeatures | undefined} />
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
        <span className={`${styles.skeleton} ${styles.skeletonScore}`} />
      </div>
      <div className={`${styles.skeleton} ${styles.skeletonTitle}`} />
      <div className={styles.footer}>
        <span className={`${styles.skeleton} ${styles.skeletonActions}`} />
      </div>
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
