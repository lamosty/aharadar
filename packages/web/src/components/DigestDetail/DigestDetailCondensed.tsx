"use client";

import { FeedbackButtons } from "@/components/FeedbackButtons";
import { WhyShown } from "@/components/WhyShown";
import type { DigestItem } from "@/lib/mock-data";
import styles from "./DigestDetailCondensed.module.css";

interface DigestDetailCondensedProps {
  items: DigestItem[];
  digestId: string;
  onFeedback?: (
    contentItemId: string,
    action: "like" | "dislike" | "save" | "skip",
  ) => Promise<void>;
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trim()}…`;
}

function getDisplayTitle(item: DigestItem): string {
  // Prefer title, fall back to truncated body text (shorter for table view)
  if (item.contentItem.title) return item.contentItem.title;
  if (item.contentItem.bodyText) return truncateText(item.contentItem.bodyText, 100);
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

function getDisplayDate(item: DigestItem): string {
  // Prefer publishedAt, fall back to metadata.post_date for X posts
  if (item.contentItem.publishedAt) {
    const date = new Date(item.contentItem.publishedAt);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
  // Fall back to metadata.post_date (YYYY-MM-DD) for X posts
  const postDate = item.contentItem.metadata?.post_date as string | undefined;
  if (postDate) {
    const date = new Date(postDate);
    return `~${date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
  }
  return "-";
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

export function DigestDetailCondensed({ items, digestId, onFeedback }: DigestDetailCondensedProps) {
  return (
    <div className={styles.container} data-testid="digest-detail">
      <table className={styles.table}>
        <thead className={styles.tableHead}>
          <tr>
            <th scope="col" className={styles.thRank}>
              #
            </th>
            <th scope="col" className={styles.thTitle}>
              Title
            </th>
            <th scope="col" className={styles.thSource}>
              Source
            </th>
            <th scope="col" className={styles.thDate}>
              Date
            </th>
            <th scope="col" className={styles.thScore}>
              Score
            </th>
            <th scope="col" className={styles.thActions}>
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <DigestItemRow key={item.id} item={item} digestId={digestId} onFeedback={onFeedback} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface DigestItemRowProps {
  item: DigestItem;
  digestId: string;
  onFeedback?: (
    contentItemId: string,
    action: "like" | "dislike" | "save" | "skip",
  ) => Promise<void>;
}

function DigestItemRow({ item, digestId, onFeedback }: DigestItemRowProps) {
  const handleFeedback = async (action: "like" | "dislike" | "save" | "skip") => {
    if (onFeedback) {
      await onFeedback(item.contentItem.id, action);
    }
  };

  const displayTitle = getDisplayTitle(item);
  const displayAuthor = getDisplayAuthor(item);
  const displayDate = getDisplayDate(item);
  const isRestricted = item.contentItem.metadata?.is_restricted === true;

  return (
    <>
      <tr className={styles.row} data-testid={`digest-item-${item.id}`}>
        <td className={styles.tdRank}>{item.rank}</td>
        <td className={styles.tdTitle}>
          <div className={styles.titleWrapper}>
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
            {displayAuthor && <span className={styles.author}>by {displayAuthor}</span>}
          </div>
        </td>
        <td className={styles.tdSource}>
          <span className={styles.sourceType}>{formatSourceType(item.contentItem.sourceType)}</span>
          {isRestricted && <span className={styles.restrictedBadge}>Restricted</span>}
        </td>
        <td className={styles.tdDate}>{displayDate}</td>
        <td className={styles.tdScore}>
          <span className={styles.score}>{(item.score * 100).toFixed(0)}</span>
        </td>
        <td className={styles.tdActions}>
          <FeedbackButtons
            contentItemId={item.contentItem.id}
            digestId={digestId}
            currentFeedback={item.feedback}
            onFeedback={handleFeedback}
            variant="compact"
          />
        </td>
      </tr>
      <tr className={styles.expandableRow}>
        <td colSpan={6}>
          <WhyShown features={item.triageJson} />
        </td>
      </tr>
    </>
  );
}

export function DigestDetailCondensedSkeleton() {
  return (
    <div className={styles.container}>
      <table className={styles.table} aria-busy="true">
        <thead className={styles.tableHead}>
          <tr>
            <th scope="col" className={styles.thRank}>
              #
            </th>
            <th scope="col" className={styles.thTitle}>
              Title
            </th>
            <th scope="col" className={styles.thSource}>
              Source
            </th>
            <th scope="col" className={styles.thDate}>
              Date
            </th>
            <th scope="col" className={styles.thScore}>
              Score
            </th>
            <th scope="col" className={styles.thActions}>
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 5 }).map((_, i) => (
            <tr key={i} className={styles.row}>
              <td className={styles.tdRank}>
                <span className={styles.skeleton} style={{ width: "20px" }} />
              </td>
              <td className={styles.tdTitle}>
                <span className={styles.skeleton} style={{ width: "300px" }} />
              </td>
              <td className={styles.tdSource}>
                <span className={styles.skeleton} style={{ width: "50px" }} />
              </td>
              <td className={styles.tdDate}>
                <span className={styles.skeleton} style={{ width: "60px" }} />
              </td>
              <td className={styles.tdScore}>
                <span className={styles.skeleton} style={{ width: "30px" }} />
              </td>
              <td className={styles.tdActions}>
                <span className={styles.skeleton} style={{ width: "80px" }} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
