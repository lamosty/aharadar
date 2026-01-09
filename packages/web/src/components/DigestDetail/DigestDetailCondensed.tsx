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

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "-";
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
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
                {item.contentItem.title || "(Untitled)"}
              </a>
            ) : (
              <span className={styles.titleText}>{item.contentItem.title || "(Untitled)"}</span>
            )}
            {item.contentItem.author && (
              <span className={styles.author}>by {item.contentItem.author}</span>
            )}
          </div>
        </td>
        <td className={styles.tdSource}>
          <span className={styles.sourceType}>{formatSourceType(item.contentItem.sourceType)}</span>
        </td>
        <td className={styles.tdDate}>{formatDate(item.contentItem.publishedAt)}</td>
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
