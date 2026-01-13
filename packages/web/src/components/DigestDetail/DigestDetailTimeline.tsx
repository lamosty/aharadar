"use client";

import { FeedbackButtons } from "@/components/FeedbackButtons";
import { WhyShown } from "@/components/WhyShown";
import type { DigestItem } from "@/lib/mock-data";
import styles from "./DigestDetailTimeline.module.css";

interface DigestDetailTimelineProps {
  items: DigestItem[];
  digestId: string;
  onFeedback?: (contentItemId: string, action: "like" | "dislike" | "skip") => Promise<void>;
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trim()}…`;
}

function getDisplayTitle(item: DigestItem): string {
  // Prefer title, fall back to truncated body text
  if (item.contentItem.title) return item.contentItem.title;
  if (item.contentItem.bodyText) return truncateText(item.contentItem.bodyText, 200);
  return "(Untitled)";
}

function getDisplayAuthor(item: DigestItem): string | null {
  // For X posts, show "DisplayName (@handle)" if available
  if (item.contentItem.sourceType === "x_posts") {
    const displayName = item.contentItem.metadata?.user_display_name as string | undefined;
    if (displayName && item.contentItem.author) {
      return `${displayName} (${item.contentItem.author})`;
    }
  }
  return item.contentItem.author;
}

function formatTime(dateStr: string | null): string {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatRelativeTime(dateStr: string | null, isApproximate: boolean = false): string {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);

  // For approximate dates (day-only), don't show hour precision
  if (isApproximate) {
    if (diffDays < 1) return "today";
    if (diffDays === 1) return "yesterday";
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  if (diffHours < 1) return "Just now";
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return "Yesterday";
  return `${diffDays}d ago`;
}

function getDisplayDateInfo(item: DigestItem): { dateStr: string; isApproximate: boolean } | null {
  if (item.contentItem.publishedAt) {
    return {
      dateStr: item.contentItem.publishedAt,
      isApproximate: item.contentItem.sourceType === "x_posts",
    };
  }
  // Fall back to metadata.post_date for X posts
  const postDate = item.contentItem.metadata?.post_date as string | undefined;
  if (postDate) {
    return { dateStr: postDate, isApproximate: true };
  }
  return null;
}

function formatSourceType(type: string): string {
  const labels: Record<string, string> = {
    hn: "HN",
    reddit: "Reddit",
    rss: "RSS",
    youtube: "YouTube",
    x_posts: "X",
  };
  return labels[type] || type.toUpperCase();
}

export function DigestDetailTimeline({ items, digestId, onFeedback }: DigestDetailTimelineProps) {
  return (
    <div className={styles.container} data-testid="digest-detail">
      <ol className={styles.timeline}>
        {items.map((item, index) => (
          <li key={item.id} className={styles.timelineItem}>
            <div className={styles.timelineLine}>
              <div className={`${styles.dot} ${getScoreClass(item.ahaScore)}`} aria-hidden="true" />
              {index < items.length - 1 && <div className={styles.connector} aria-hidden="true" />}
            </div>

            <DigestItemPost item={item} digestId={digestId} onFeedback={onFeedback} />
          </li>
        ))}
      </ol>
    </div>
  );
}

function getScoreClass(score: number): string {
  if (score >= 0.8) return styles.dotHigh;
  if (score >= 0.6) return styles.dotMedium;
  return styles.dotLow;
}

interface DigestItemPostProps {
  item: DigestItem;
  digestId: string;
  onFeedback?: (contentItemId: string, action: "like" | "dislike" | "skip") => Promise<void>;
}

function DigestItemPost({ item, digestId, onFeedback }: DigestItemPostProps) {
  const handleFeedback = async (action: "like" | "dislike" | "skip") => {
    if (onFeedback) {
      await onFeedback(item.contentItem.id, action);
    }
  };

  const displayTitle = getDisplayTitle(item);
  const displayAuthor = getDisplayAuthor(item);
  const dateInfo = getDisplayDateInfo(item);
  const isRestricted = item.contentItem.metadata?.is_restricted === true;

  return (
    <article className={styles.post} data-testid={`digest-item-${item.id}`}>
      <header className={styles.postHeader}>
        <div className={styles.postMeta}>
          <span className={styles.rank}>#{item.rank}</span>
          <span className={styles.sourceType}>{formatSourceType(item.contentItem.sourceType)}</span>
          {isRestricted && <span className={styles.restrictedBadge}>Restricted</span>}
          <span className={styles.score}>{(item.ahaScore * 100).toFixed(0)}%</span>
        </div>
        {dateInfo && (
          <time
            dateTime={dateInfo.dateStr}
            className={styles.timestamp}
            title={dateInfo.isApproximate ? "Approximate date" : formatTime(dateInfo.dateStr)}
          >
            {formatRelativeTime(dateInfo.dateStr, dateInfo.isApproximate)}
          </time>
        )}
      </header>

      <div className={styles.postContent}>
        <h3 className={styles.title}>
          {item.contentItem.url ? (
            <a
              href={item.contentItem.url}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.titleLink}
            >
              {displayTitle}
            </a>
          ) : (
            <span className={styles.titleText}>{displayTitle}</span>
          )}
        </h3>

        {displayAuthor && (
          <p className={styles.author}>
            <AuthorIcon />
            {displayAuthor}
          </p>
        )}

        {item.contentItem.triageSummary && (
          <p className={styles.summary}>{item.contentItem.triageSummary}</p>
        )}
      </div>

      <footer className={styles.postFooter}>
        <FeedbackButtons
          contentItemId={item.contentItem.id}
          digestId={digestId}
          currentFeedback={item.feedback}
          onFeedback={handleFeedback}
          variant="compact"
        />

        {item.contentItem.url && (
          <a
            href={item.contentItem.url}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.openLink}
          >
            <ExternalLinkIcon />
            Open
          </a>
        )}
      </footer>

      <WhyShown features={item.triageJson} />
    </article>
  );
}

export function DigestDetailTimelineSkeleton() {
  return (
    <div className={styles.container}>
      <ol className={styles.timeline} aria-busy="true">
        {Array.from({ length: 4 }).map((_, i) => (
          <li key={i} className={styles.timelineItem}>
            <div className={styles.timelineLine}>
              <div className={styles.dot} aria-hidden="true" />
              {i < 3 && <div className={styles.connector} aria-hidden="true" />}
            </div>

            <article className={styles.post} aria-hidden="true">
              <header className={styles.postHeader}>
                <span className={styles.skeleton} style={{ width: "100px", height: "16px" }} />
                <span className={styles.skeleton} style={{ width: "50px", height: "14px" }} />
              </header>

              <div className={styles.postContent}>
                <span className={styles.skeleton} style={{ width: "90%", height: "24px" }} />
                <span
                  className={styles.skeleton}
                  style={{ width: "80px", height: "14px", marginTop: "8px" }}
                />
              </div>

              <footer className={styles.postFooter}>
                <span className={styles.skeleton} style={{ width: "100px", height: "28px" }} />
              </footer>
            </article>
          </li>
        ))}
      </ol>
    </div>
  );
}

function AuthorIcon() {
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
      style={{ marginRight: "4px" }}
    >
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
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
      aria-hidden="true"
    >
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}
