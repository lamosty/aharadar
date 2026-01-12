"use client";

import { FeedbackButtons } from "@/components/FeedbackButtons";
import { WhyShown } from "@/components/WhyShown";
import type { DigestItem } from "@/lib/mock-data";
import styles from "./DigestDetailReader.module.css";

interface DigestDetailReaderProps {
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

function getDisplayDate(item: DigestItem): { dateStr: string; isApproximate: boolean } | null {
  // Prefer publishedAt
  if (item.contentItem.publishedAt) {
    const date = new Date(item.contentItem.publishedAt);
    return {
      dateStr: date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
      isApproximate: item.contentItem.sourceType === "x_posts",
    };
  }
  // Fall back to metadata.post_date for X posts
  const postDate = item.contentItem.metadata?.post_date as string | undefined;
  if (postDate) {
    const date = new Date(postDate);
    return {
      dateStr: date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
      isApproximate: true,
    };
  }
  return null;
}

function formatSourceType(type: string): string {
  const labels: Record<string, string> = {
    hn: "Hacker News",
    reddit: "Reddit",
    rss: "RSS Feed",
    youtube: "YouTube",
    x_posts: "X (Twitter)",
  };
  return labels[type] || type;
}

export function DigestDetailReader({ items, digestId, onFeedback }: DigestDetailReaderProps) {
  return (
    <div className={styles.container} data-testid="digest-detail">
      <ol className={styles.list}>
        {items.map((item) => (
          <li key={item.id}>
            <DigestItemCard item={item} digestId={digestId} onFeedback={onFeedback} />
          </li>
        ))}
      </ol>
    </div>
  );
}

interface DigestItemCardProps {
  item: DigestItem;
  digestId: string;
  onFeedback?: (contentItemId: string, action: "like" | "dislike" | "skip") => Promise<void>;
}

function DigestItemCard({ item, digestId, onFeedback }: DigestItemCardProps) {
  const handleFeedback = async (action: "like" | "dislike" | "skip") => {
    if (onFeedback) {
      await onFeedback(item.contentItem.id, action);
    }
  };

  const displayTitle = getDisplayTitle(item);
  const displayAuthor = getDisplayAuthor(item);
  const displayDate = getDisplayDate(item);
  const isRestricted = item.contentItem.metadata?.is_restricted === true;

  return (
    <article className={styles.card} data-testid={`digest-item-${item.id}`}>
      <header className={styles.cardHeader}>
        <div className={styles.rankBadge}>#{item.rank}</div>
        <div className={styles.meta}>
          <span className={styles.sourceType}>{formatSourceType(item.contentItem.sourceType)}</span>
          {isRestricted && <span className={styles.restrictedBadge}>Restricted</span>}
          {displayDate && (
            <>
              <span className={styles.metaSeparator} aria-hidden="true">
                -
              </span>
              <time
                dateTime={item.contentItem.publishedAt ?? undefined}
                title={displayDate.isApproximate ? "Approximate date" : undefined}
              >
                {displayDate.isApproximate ? `~${displayDate.dateStr}` : displayDate.dateStr}
              </time>
            </>
          )}
        </div>
      </header>

      <div className={styles.cardBody}>
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

        {displayAuthor && <p className={styles.author}>by {displayAuthor}</p>}

        {item.contentItem.triageSummary && (
          <p className={styles.summary}>{item.contentItem.triageSummary}</p>
        )}
      </div>

      <footer className={styles.cardFooter}>
        <div className={styles.scoreSection}>
          <span className={styles.scoreLabel}>Relevance</span>
          <span className={styles.scoreValue}>{(item.score * 100).toFixed(0)}%</span>
        </div>

        <FeedbackButtons
          contentItemId={item.contentItem.id}
          digestId={digestId}
          currentFeedback={item.feedback}
          onFeedback={handleFeedback}
          variant="default"
        />
      </footer>

      <WhyShown features={item.triageJson} />
    </article>
  );
}

export function DigestDetailReaderSkeleton() {
  return (
    <div className={styles.container}>
      <ol className={styles.list} aria-busy="true">
        {Array.from({ length: 4 }).map((_, i) => (
          <li key={i}>
            <article className={styles.card} aria-hidden="true">
              <header className={styles.cardHeader}>
                <span className={styles.skeleton} style={{ width: "40px", height: "24px" }} />
                <span className={styles.skeleton} style={{ width: "120px", height: "16px" }} />
              </header>

              <div className={styles.cardBody}>
                <span className={styles.skeleton} style={{ width: "80%", height: "28px" }} />
                <span
                  className={styles.skeleton}
                  style={{ width: "100px", height: "16px", marginTop: "8px" }}
                />
                <span
                  className={styles.skeleton}
                  style={{ width: "100%", height: "48px", marginTop: "12px" }}
                />
              </div>

              <footer className={styles.cardFooter}>
                <span className={styles.skeleton} style={{ width: "80px", height: "32px" }} />
                <span className={styles.skeleton} style={{ width: "160px", height: "36px" }} />
              </footer>
            </article>
          </li>
        ))}
      </ol>
    </div>
  );
}
