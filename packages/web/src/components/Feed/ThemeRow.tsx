"use client";

import { useCallback, useEffect, useState } from "react";
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
  /** ID of currently force-expanded item */
  forceExpandedId?: string | null;
  /** Called when item is hovered */
  onHover?: (itemId: string) => void;
  /** Called when item is clicked to select it (fast triage mode) */
  onSelect?: (itemId: string) => void;
  /** Called when user closes the detail panel */
  onClose?: () => void;
  /** Called when user wants to skip to next item */
  onNext?: (currentId: string) => void;
  /** Called when user wants to undo last feedback */
  onUndo?: () => void;
  /** Whether undo is available */
  canUndo?: boolean;
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
  forceExpandedId,
  onHover,
  onSelect,
  onClose,
  onNext,
  onUndo,
  canUndo,
}: ThemeRowProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Auto-expand theme when it contains the force-expanded item
  // This ensures fast triage works across collapsed themes
  useEffect(() => {
    if (forceExpandedId && theme.items.some((item) => item.id === forceExpandedId)) {
      setIsExpanded(true);
    }
  }, [forceExpandedId, theme.items]);

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

  if (theme.items.length === 0) {
    return null;
  }

  return (
    <div
      className={styles.themeContainer}
      data-expanded={isExpanded}
      data-single-item={theme.items.length === 1}
      data-theme-row
    >
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
          <span className={styles.itemCountBadge}>{theme.items.length} items</span>
        </div>

        {/* Bulk actions (always visible in header) */}
        {onBulkFeedback && (
          <div className={styles.bulkActions} onClick={(e) => e.stopPropagation()}>
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
            </button>
          </div>
        )}
      </div>

      {/* Items list - ALL items hidden when collapsed, shown when expanded */}
      {isExpanded && (
        <div className={styles.themeItems}>
          {theme.items.map((item) => (
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
              fastTriageMode={fastTriageMode && forceExpandedId !== null}
              forceExpanded={forceExpandedId === item.id}
              onHover={onHover ? () => onHover(item.id) : undefined}
              onSelect={onSelect ? () => onSelect(item.id) : undefined}
              onClose={onClose}
              onNext={onNext ? () => onNext(item.id) : undefined}
              onUndo={onUndo}
              canUndo={canUndo}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Extract topic from item's triage JSON.
 * Falls back to themeLabel (server-side theme) or "Uncategorized".
 */
function getItemTopic(item: FeedItemType): string {
  // Prefer topic from triage JSON (new field)
  const triageTopic = (item.triageJson as { topic?: string } | null)?.topic;
  if (triageTopic && triageTopic !== "Uncategorized") {
    return triageTopic;
  }
  // Fall back to server-side theme label
  if (item.themeLabel) {
    return item.themeLabel;
  }
  return "Uncategorized";
}

/**
 * Group items by topic (from triage JSON).
 *
 * - Topics with 2+ items → collapsible group (shown first, sorted by top score)
 * - Topics with 1 item OR no topic → collected into "Uncategorized" (shown last)
 *
 * This ensures only meaningful clusters are shown as groups.
 */
export function groupItemsByTheme(items: FeedItemType[]): ThemeGroup[] {
  const topicMap = new Map<string, FeedItemType[]>();

  // First pass: group items by topic from triageJson
  for (const item of items) {
    const topic = getItemTopic(item);
    const existing = topicMap.get(topic);
    if (existing) {
      existing.push(item);
    } else {
      topicMap.set(topic, [item]);
    }
  }

  const themedGroups: ThemeGroup[] = [];
  const uncategorizedItems: FeedItemType[] = [];

  // Second pass: create groups for topics with 2+ items, collect singles
  for (const [topic, topicItems] of topicMap) {
    if (topic === "Uncategorized" || topicItems.length === 1) {
      // No topic OR single-item topic → goes to uncategorized
      uncategorizedItems.push(...topicItems);
    } else {
      // Multi-item topic → create a group
      const topItem = topicItems[0];
      themedGroups.push({
        themeId: topic, // Use topic as themeId for compatibility
        label: topic, // Topic is the label
        itemCount: topicItems.length,
        items: topicItems,
        topScore: topItem?.ahaScore ?? topItem?.score ?? 0,
      });
    }
  }

  // Sort themed groups by top score (highest first)
  themedGroups.sort((a, b) => b.topScore - a.topScore);

  // Sort uncategorized items by score (highest first) before grouping
  uncategorizedItems.sort((a, b) => {
    const scoreA = a.ahaScore ?? a.score ?? 0;
    const scoreB = b.ahaScore ?? b.score ?? 0;
    return scoreB - scoreA;
  });

  // Add "Uncategorized" group at the end (always last)
  if (uncategorizedItems.length > 0) {
    const topUncategorized = uncategorizedItems[0];
    themedGroups.push({
      themeId: "ungrouped",
      label: "Uncategorized",
      itemCount: uncategorizedItems.length,
      items: uncategorizedItems,
      topScore: topUncategorized?.ahaScore ?? topUncategorized?.score ?? 0,
    });
  }

  return themedGroups;
}
