"use client";

import { useCallback, useState } from "react";
import { FeedbackButtons } from "@/components/FeedbackButtons";
import type { FeedItem as FeedItemType, ManualSummaryOutput } from "@/lib/api";
import type { Layout } from "@/lib/theme";
import type { SortOption } from "./FeedFilterBar";
import { FeedItem } from "./FeedItem";
import styles from "./ThemeRow.module.css";

/** A theme group containing related items */
export interface ThemeGroup {
  themeId: string;
  label: string | null;
  itemCount: number;
  items: FeedItemType[];
  /** Top item score (for sorting themes) */
  topScore: number;
}

interface ThemeRowProps {
  theme: ThemeGroup;
  onFeedback?: (contentItemId: string, action: "like" | "dislike" | "skip") => Promise<void>;
  onClear?: (contentItemId: string) => Promise<void>;
  layout?: Layout;
  showTopicBadge?: boolean;
  sort?: SortOption;
  onViewSummary?: (item: FeedItemType, summary: ManualSummaryOutput) => void;
  onSummaryGenerated?: () => void;
  onMobileClick?: (item: FeedItemType) => void;
  /** Whether fast triage mode is active */
  fastTriageMode?: boolean;
  /** Called when bulk action is performed on all items in theme */
  onBulkFeedback?: (contentItemIds: string[], action: "like" | "dislike") => Promise<void>;
  /** Called when all items in theme are marked as read */
  onBulkMarkRead?: (contentItemIds: string[]) => Promise<void>;
}

/**
 * ThemeRow component: A collapsible group of related items.
 *
 * Collapsed state: Shows representative item title + "N related" badge
 * Expanded state: Shows all items in the theme with bulk actions
 */
export function ThemeRow({
  theme,
  onFeedback,
  onClear,
  layout = "condensed",
  showTopicBadge,
  sort,
  onViewSummary,
  onSummaryGenerated,
  onMobileClick,
  fastTriageMode,
  onBulkFeedback,
  onBulkMarkRead,
}: ThemeRowProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Representative item is the first one (highest scored)
  const representativeItem = theme.items[0];
  const otherItems = theme.items.slice(1);
  const hasOtherItems = otherItems.length > 0;

  const handleToggle = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  const handleBulkLike = useCallback(async () => {
    if (!onBulkFeedback) return;
    const itemIds = theme.items.map((item) => item.id);
    await onBulkFeedback(itemIds, "like");
  }, [onBulkFeedback, theme.items]);

  const handleBulkDislike = useCallback(async () => {
    if (!onBulkFeedback) return;
    const itemIds = theme.items.map((item) => item.id);
    await onBulkFeedback(itemIds, "dislike");
  }, [onBulkFeedback, theme.items]);

  const handleBulkMarkRead = useCallback(async () => {
    if (!onBulkMarkRead) return;
    const itemIds = theme.items.map((item) => item.id);
    await onBulkMarkRead(itemIds);
  }, [onBulkMarkRead, theme.items]);

  if (!representativeItem) {
    return null;
  }

  return (
    <div className={styles.themeContainer} data-expanded={isExpanded}>
      {/* Theme header with expand/collapse toggle */}
      <div className={styles.themeHeader} onClick={handleToggle}>
        <button
          type="button"
          className={styles.expandToggle}
          aria-expanded={isExpanded}
          aria-label={isExpanded ? "Collapse theme" : "Expand theme"}
        >
          <svg
            className={styles.expandIcon}
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M4 6L8 10L12 6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>

        <div className={styles.themeInfo}>
          {theme.label && <span className={styles.themeLabel}>{theme.label}</span>}
          {hasOtherItems && (
            <span className={styles.itemCountBadge}>+{otherItems.length} related</span>
          )}
        </div>

        {/* Bulk actions (visible when expanded) */}
        {isExpanded && (onBulkFeedback || onBulkMarkRead) && (
          <div className={styles.bulkActions} onClick={(e) => e.stopPropagation()}>
            {onBulkFeedback && (
              <>
                <button
                  type="button"
                  className={styles.bulkActionButton}
                  onClick={handleBulkLike}
                  title="Like all items in this theme"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
                  </svg>
                  All
                </button>
                <button
                  type="button"
                  className={styles.bulkActionButton}
                  onClick={handleBulkDislike}
                  title="Dislike all items in this theme"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17" />
                  </svg>
                  All
                </button>
              </>
            )}
            {onBulkMarkRead && (
              <button
                type="button"
                className={styles.bulkActionButton}
                onClick={handleBulkMarkRead}
                title="Mark all items in this theme as read"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Read
              </button>
            )}
          </div>
        )}
      </div>

      {/* Items list */}
      <div className={styles.themeItems}>
        {/* Representative item always shown */}
        <FeedItem
          item={representativeItem}
          onFeedback={onFeedback}
          onClear={onClear}
          layout={layout}
          showTopicBadge={showTopicBadge}
          sort={sort}
          onViewSummary={onViewSummary}
          onSummaryGenerated={onSummaryGenerated}
          onMobileClick={onMobileClick ? () => onMobileClick(representativeItem) : undefined}
          fastTriageMode={fastTriageMode}
        />

        {/* Other items shown when expanded */}
        {isExpanded &&
          otherItems.map((item) => (
            <FeedItem
              key={item.id}
              item={item}
              onFeedback={onFeedback}
              onClear={onClear}
              layout={layout}
              showTopicBadge={showTopicBadge}
              sort={sort}
              onViewSummary={onViewSummary}
              onSummaryGenerated={onSummaryGenerated}
              onMobileClick={onMobileClick ? () => onMobileClick(item) : undefined}
              fastTriageMode={fastTriageMode}
            />
          ))}
      </div>
    </div>
  );
}

/**
 * Group items by theme.
 * Items without a theme are returned as single-item groups.
 */
export function groupItemsByTheme(items: FeedItemType[]): ThemeGroup[] {
  const themeMap = new Map<string, FeedItemType[]>();
  const ungrouped: FeedItemType[] = [];

  for (const item of items) {
    if (item.themeId) {
      const existing = themeMap.get(item.themeId);
      if (existing) {
        existing.push(item);
      } else {
        themeMap.set(item.themeId, [item]);
      }
    } else {
      ungrouped.push(item);
    }
  }

  const groups: ThemeGroup[] = [];

  // Convert theme map to groups
  for (const [themeId, themeItems] of themeMap) {
    // Items are already sorted by score from API, first is representative
    const topItem = themeItems[0];
    groups.push({
      themeId,
      label: topItem?.themeLabel ?? null,
      itemCount: topItem?.themeItemCount ?? themeItems.length,
      items: themeItems,
      topScore: topItem?.ahaScore ?? topItem?.score ?? 0,
    });
  }

  // Add ungrouped items as single-item groups (no theme header)
  for (const item of ungrouped) {
    groups.push({
      themeId: `ungrouped-${item.id}`,
      label: null,
      itemCount: 1,
      items: [item],
      topScore: item.ahaScore ?? item.score ?? 0,
    });
  }

  // Sort by top score (highest first)
  groups.sort((a, b) => b.topScore - a.topScore);

  return groups;
}
