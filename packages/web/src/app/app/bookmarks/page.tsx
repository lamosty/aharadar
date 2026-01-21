"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { FeedItemSkeleton } from "@/components/Feed";
import { useToast } from "@/components/Toast";
import type { BookmarkedItem } from "@/lib/api";
import { useBookmarksInfinite, useBookmarkToggle } from "@/lib/hooks";
import styles from "./page.module.css";

export default function BookmarksPage() {
  const { addToast } = useToast();
  const { data, isLoading, isError, error, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useBookmarksInfinite({ limit: 20 });

  const bookmarkMutation = useBookmarkToggle({
    onSuccess: (data) => {
      if (!data.bookmarked) {
        addToast("Bookmark removed", "success");
      }
    },
    onError: () => {
      addToast("Failed to update bookmark", "error");
    },
  });

  // Flatten pages into a single list
  const items = data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Bookmarks</h1>
          <p className={styles.subtitle}>Items you've saved for later</p>
        </div>
      </header>

      {isLoading && (
        <div className={styles.list}>
          {Array.from({ length: 5 }).map((_, i) => (
            <FeedItemSkeleton key={i} />
          ))}
        </div>
      )}

      {isError && (
        <div className={styles.errorState}>
          <p className={styles.errorTitle}>Failed to load bookmarks</p>
          <p className={styles.errorMessage}>{error?.message || "An error occurred"}</p>
          <button className="btn btn-secondary" onClick={() => window.location.reload()}>
            Try again
          </button>
        </div>
      )}

      {!isLoading && !isError && items.length === 0 && (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>
            <BookmarkIcon />
          </div>
          <p className={styles.emptyTitle}>No bookmarks yet</p>
          <p className={styles.emptyMessage}>
            Bookmark items from your feed to save them here for later.
          </p>
          <Link href="/app/feed" className="btn btn-primary">
            Go to Feed
          </Link>
        </div>
      )}

      {!isLoading && !isError && items.length > 0 && (
        <>
          <div className={styles.list}>
            {items.map((item) => (
              <BookmarkedItemCard
                key={item.id}
                item={item}
                onRemove={() => bookmarkMutation.mutate(item.id)}
                isRemoving={bookmarkMutation.isPending}
              />
            ))}
          </div>

          {hasNextPage && (
            <div className={styles.loadMore}>
              <button
                className="btn btn-secondary"
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
              >
                {isFetchingNextPage ? "Loading..." : "Load more"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

interface BookmarkedItemCardProps {
  item: BookmarkedItem;
  onRemove: () => void;
  isRemoving: boolean;
}

function BookmarkedItemCard({ item, onRemove, isRemoving }: BookmarkedItemCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleClick = useCallback(() => {
    setIsExpanded(!isExpanded);
  }, [isExpanded]);

  const displayTitle = getDisplayTitle(item);
  const sourceLabel = formatSourceType(item.item.sourceType);
  const sourceColor = getSourceColor(item.item.sourceType);

  return (
    <article className={styles.card} onClick={handleClick} data-expanded={isExpanded}>
      <div className={styles.cardHeader}>
        <div className={styles.cardMeta}>
          <span className={styles.sourceBadge} style={{ backgroundColor: sourceColor }}>
            {sourceLabel}
          </span>
          {item.item.author && <span className={styles.author}>{item.item.author}</span>}
          {item.bookmarkedAt && (
            <span className={styles.date}>Saved {formatRelativeTime(item.bookmarkedAt)}</span>
          )}
        </div>
        <div className={styles.cardActions}>
          <button
            type="button"
            className={styles.removeButton}
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            disabled={isRemoving}
            aria-label="Remove bookmark"
            title="Remove bookmark"
          >
            <BookmarkFilledIcon />
          </button>
          {item.item.url && (
            <a
              href={item.item.url}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.openLink}
              onClick={(e) => e.stopPropagation()}
              aria-label="Open in new tab"
              title="Open in new tab"
            >
              <ExternalLinkIcon />
            </a>
          )}
        </div>
      </div>

      <h3 className={styles.cardTitle}>{displayTitle}</h3>

      {isExpanded && item.item.bodyText && <p className={styles.cardBody}>{item.item.bodyText}</p>}
    </article>
  );
}

// Helper functions
function getDisplayTitle(item: BookmarkedItem): string {
  if (item.item.sourceType === "x_posts" && !item.item.title) {
    if (item.item.author) {
      return item.item.author.startsWith("@") ? item.item.author : `@${item.item.author}`;
    }
    return "X post";
  }
  return item.item.title || "(No title)";
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

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

// Icons
function BookmarkIcon() {
  return (
    <svg
      width="48"
      height="48"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function BookmarkFilledIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function ExternalLinkIcon() {
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
    >
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}
