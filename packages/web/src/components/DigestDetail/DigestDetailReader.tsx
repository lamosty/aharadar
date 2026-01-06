"use client";

import { type DigestItem } from "@/lib/mock-data";
import { t } from "@/lib/i18n";
import { WhyShown } from "@/components/WhyShown";
import { FeedbackButtons } from "@/components/FeedbackButtons";
import styles from "./DigestDetailReader.module.css";

interface DigestDetailReaderProps {
  items: DigestItem[];
  digestId: string;
  onFeedback?: (
    contentItemId: string,
    action: "like" | "dislike" | "save" | "skip"
  ) => Promise<void>;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
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

export function DigestDetailReader({
  items,
  digestId,
  onFeedback,
}: DigestDetailReaderProps) {
  return (
    <div className={styles.container} data-testid="digest-detail">
      <ol className={styles.list} role="list">
        {items.map((item) => (
          <li key={item.id}>
            <DigestItemCard
              item={item}
              digestId={digestId}
              onFeedback={onFeedback}
            />
          </li>
        ))}
      </ol>
    </div>
  );
}

interface DigestItemCardProps {
  item: DigestItem;
  digestId: string;
  onFeedback?: (
    contentItemId: string,
    action: "like" | "dislike" | "save" | "skip"
  ) => Promise<void>;
}

function DigestItemCard({ item, digestId, onFeedback }: DigestItemCardProps) {
  const handleFeedback = async (action: "like" | "dislike" | "save" | "skip") => {
    if (onFeedback) {
      await onFeedback(item.contentItem.id, action);
    }
  };

  return (
    <article className={styles.card} data-testid={`digest-item-${item.id}`}>
      <header className={styles.cardHeader}>
        <div className={styles.rankBadge}>#{item.rank}</div>
        <div className={styles.meta}>
          <span className={styles.sourceType}>
            {formatSourceType(item.contentItem.sourceType)}
          </span>
          {item.contentItem.publishedAt && (
            <>
              <span className={styles.metaSeparator} aria-hidden="true">
                -
              </span>
              <time dateTime={item.contentItem.publishedAt}>
                {formatDate(item.contentItem.publishedAt)}
              </time>
            </>
          )}
        </div>
      </header>

      <div className={styles.cardBody}>
        <h3 className={styles.title}>
          <a
            href={item.contentItem.url}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.titleLink}
          >
            {item.contentItem.title}
          </a>
        </h3>

        {item.contentItem.author && (
          <p className={styles.author}>by {item.contentItem.author}</p>
        )}

        {item.contentItem.triageSummary && (
          <p className={styles.summary}>{item.contentItem.triageSummary}</p>
        )}
      </div>

      <footer className={styles.cardFooter}>
        <div className={styles.scoreSection}>
          <span className={styles.scoreLabel}>Relevance</span>
          <span className={styles.scoreValue}>
            {(item.score * 100).toFixed(0)}%
          </span>
        </div>

        <FeedbackButtons
          contentItemId={item.contentItem.id}
          digestId={digestId}
          currentFeedback={item.feedback}
          onFeedback={handleFeedback}
          variant="default"
        />
      </footer>

      <WhyShown features={item.triageJson?.system_features} />
    </article>
  );
}

export function DigestDetailReaderSkeleton() {
  return (
    <div className={styles.container}>
      <ol className={styles.list} role="list" aria-busy="true">
        {Array.from({ length: 4 }).map((_, i) => (
          <li key={i}>
            <article className={styles.card} aria-hidden="true">
              <header className={styles.cardHeader}>
                <span
                  className={styles.skeleton}
                  style={{ width: "40px", height: "24px" }}
                />
                <span
                  className={styles.skeleton}
                  style={{ width: "120px", height: "16px" }}
                />
              </header>

              <div className={styles.cardBody}>
                <span
                  className={styles.skeleton}
                  style={{ width: "80%", height: "28px" }}
                />
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
                <span
                  className={styles.skeleton}
                  style={{ width: "80px", height: "32px" }}
                />
                <span
                  className={styles.skeleton}
                  style={{ width: "160px", height: "36px" }}
                />
              </footer>
            </article>
          </li>
        ))}
      </ol>
    </div>
  );
}
