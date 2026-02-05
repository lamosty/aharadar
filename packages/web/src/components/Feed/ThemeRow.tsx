"use client";

import { useCallback, useEffect, useState } from "react";
import type { FeedItem as FeedItemType, ManualSummaryOutput } from "@/lib/api";
import type { Layout } from "@/lib/theme";
import type { SortOption } from "./FeedFilterBar";
import { FeedItem } from "./FeedItem";
import styles from "./ThemeRow.module.css";

/** A theme group containing related items */
export interface ThemeGroup {
  /** Raw theme key used for grouping (unrefined) */
  themeKey: string;
  themeId: string;
  label: string | null;
  itemCount: number;
  items: FeedItemType[];
  /** Top item score (for sorting themes) */
  topScore: number;
  /** Optional subtheme groups for nested display */
  subthemes?: SubthemeGroup[];
}

/** A subtheme group within a theme */
export interface SubthemeGroup {
  subthemeId: string;
  label: string | null;
  itemCount: number;
  items: FeedItemType[];
  topScore: number;
}

export interface ThemeGroupingOptions {
  sort?: SortOption;
  /** Cap items per theme group (0 = no cap) */
  maxItemsPerTheme?: number;
  /** Enable subtheme grouping within a theme */
  subthemesEnabled?: boolean;
  /** Apply non-LLM label refinement for display */
  refineLabels?: boolean;
  /** Optional fallback theme key for items missing a theme */
  fallbackThemeByItemId?: Map<string, string>;
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
  /** Disable hover expansion (used when fast triage selection is active) */
  disableHoverExpansion?: boolean;
  /** Called when bulk action is performed on all items in theme */
  onBulkFeedback?: (contentItemIds: string[], action: "like" | "dislike" | "skip") => Promise<void>;
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
  disableHoverExpansion,
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

  const handleBulkSkip = useCallback(async () => {
    if (!onBulkFeedback) return;
    const itemIds = theme.items.map((item) => item.id);
    await onBulkFeedback(itemIds, "skip");
  }, [onBulkFeedback, theme.items]);

  const handleSubthemeBulk = useCallback(
    async (itemIds: string[], action: "like" | "dislike" | "skip") => {
      if (!onBulkFeedback) return;
      await onBulkFeedback(itemIds, action);
    },
    [onBulkFeedback],
  );

  const renderItem = (item: FeedItemType) => (
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
      disableHoverExpansion={disableHoverExpansion}
      forceExpanded={forceExpandedId === item.id}
      onHover={onHover ? () => onHover(item.id) : undefined}
      onSelect={onSelect ? () => onSelect(item.id) : undefined}
      onClose={onClose}
      onNext={onNext ? () => onNext(item.id) : undefined}
      onUndo={onUndo}
      canUndo={canUndo}
    />
  );

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
            <button
              type="button"
              className={`${styles.bulkActionButton} ${styles.desktopOnly}`}
              onClick={handleBulkSkip}
              title="Skip all items in this theme"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="12" cy="12" r="9" />
                <path d="M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* Items list - ALL items hidden when collapsed, shown when expanded */}
      {isExpanded && (
        <div className={styles.themeItems}>
          {theme.subthemes && theme.subthemes.length > 0
            ? theme.subthemes.map((subtheme) => {
                const itemIds = subtheme.items.map((item) => item.id);
                return (
                  <div key={subtheme.subthemeId} className={styles.subthemeGroup}>
                    <div className={styles.subthemeHeader}>
                      {subtheme.label && (
                        <span className={styles.subthemeLabel}>{subtheme.label}</span>
                      )}
                      <span className={styles.subthemeCount}>{subtheme.items.length} items</span>
                      {onBulkFeedback && (
                        <div
                          className={styles.subthemeActions}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            className={styles.subthemeActionButton}
                            onClick={() => handleSubthemeBulk(itemIds, "like")}
                            title="Like all items in this subtheme"
                          >
                            <svg
                              width="12"
                              height="12"
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
                            className={styles.subthemeActionButton}
                            onClick={() => handleSubthemeBulk(itemIds, "dislike")}
                            title="Dislike all items in this subtheme"
                          >
                            <svg
                              width="12"
                              height="12"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                            >
                              <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            className={`${styles.subthemeActionButton} ${styles.desktopOnly}`}
                            onClick={() => handleSubthemeBulk(itemIds, "skip")}
                            title="Skip all items in this subtheme"
                          >
                            <svg
                              width="12"
                              height="12"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                            >
                              <circle cx="12" cy="12" r="9" />
                              <path d="M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      )}
                    </div>
                    <div className={styles.subthemeItems}>
                      {subtheme.items.map((item) => renderItem(item))}
                    </div>
                  </div>
                );
              })
            : theme.items.map((item) => renderItem(item))}
        </div>
      )}
    </div>
  );
}

/**
 * Extract theme label for grouping items.
 *
 * Priority order:
 * 1. themeLabel (embedding-based clustering from digest pipeline)
 * 2. triageJson.theme (new field name for triage theme)
 * 3. triageJson.topic (legacy field name - will be deprecated)
 * 4. "Uncategorized"
 */
export function getItemThemeKey(item: FeedItemType): string {
  // Prefer embedding-clustered theme label (most accurate grouping)
  if (item.themeLabel && item.themeLabel !== "Uncategorized") {
    return item.themeLabel;
  }
  // Fall back to raw triage theme/topic (for items without clustering)
  const triageData = item.triageJson as { theme?: string; topic?: string } | null;
  const triageTheme = triageData?.theme ?? triageData?.topic;
  if (triageTheme && triageTheme !== "Uncategorized") {
    return triageTheme;
  }
  return "Uncategorized";
}

/**
 * Sort comparator for items based on sort option.
 */
function toCommentCount(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.trunc(value));
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) {
      return Math.max(0, parsed);
    }
  }
  return 0;
}

function getCommentCount(item: FeedItemType): number {
  const metadata = item.item.metadata as Record<string, unknown> | null | undefined;
  if (!metadata) return 0;

  if (item.item.sourceType === "reddit") {
    return toCommentCount(metadata.num_comments);
  }
  if (item.item.sourceType === "hn") {
    return toCommentCount(metadata.descendants);
  }
  return 0;
}

function getItemComparator(sort: SortOption): (a: FeedItemType, b: FeedItemType) => number {
  switch (sort) {
    case "latest":
      return (a, b) => {
        const dateA = a.item.publishedAt ? new Date(a.item.publishedAt).getTime() : 0;
        const dateB = b.item.publishedAt ? new Date(b.item.publishedAt).getTime() : 0;
        return dateB - dateA;
      };
    case "trending":
      return (a, b) => (b.trendingScore ?? b.score ?? 0) - (a.trendingScore ?? a.score ?? 0);
    case "comments_desc":
      return (a, b) => {
        const commentsA = getCommentCount(a);
        const commentsB = getCommentCount(b);
        if (commentsA !== commentsB) return commentsB - commentsA;
        return (b.ahaScore ?? b.score ?? 0) - (a.ahaScore ?? a.score ?? 0);
      };
    case "ai_score":
      return (a, b) => {
        const scoreA = (a.triageJson as { ai_score?: number } | null)?.ai_score ?? 0;
        const scoreB = (b.triageJson as { ai_score?: number } | null)?.ai_score ?? 0;
        return scoreB - scoreA;
      };
    case "has_ai_summary":
      // Items with summary first, then by score
      return (a, b) => {
        const hasA = a.triageJson ? 1 : 0;
        const hasB = b.triageJson ? 1 : 0;
        if (hasA !== hasB) return hasB - hasA;
        return (b.ahaScore ?? b.score ?? 0) - (a.ahaScore ?? a.score ?? 0);
      };
    case "best":
    default:
      return (a, b) => (b.ahaScore ?? b.score ?? 0) - (a.ahaScore ?? a.score ?? 0);
  }
}

const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "or",
  "the",
  "of",
  "to",
  "in",
  "on",
  "for",
  "with",
  "by",
  "from",
  "about",
  "as",
  "at",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "it",
  "its",
  "this",
  "that",
  "these",
  "those",
  "you",
  "your",
  "we",
  "our",
  "they",
  "their",
  "he",
  "she",
  "his",
  "her",
  "them",
  "i",
  "me",
  "my",
  "mine",
  "us",
  "vs",
  "via",
  "into",
  "over",
  "under",
  "after",
  "before",
  "than",
  "then",
  "now",
  "new",
  "latest",
  "today",
  "yesterday",
  "tomorrow",
  "week",
  "weeks",
  "month",
  "months",
  "year",
  "years",
  "day",
  "days",
  "hour",
  "hours",
  "minute",
  "minutes",
  "second",
  "seconds",
  "discussion",
  "thread",
  "daily",
  "weekly",
  "update",
  "report",
  "analysis",
]);

const TOKEN_REGEX = /[A-Za-z0-9]+(?:[&.+-][A-Za-z0-9]+)*/g;

function cleanLabel(label: string): string {
  return label
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[.:;!?-]+$/g, "");
}

function tokenizeText(text: string): string[] {
  if (!text) return [];
  return text.match(TOKEN_REGEX) ?? [];
}

function normalizeToken(token: string): string {
  return token.toLowerCase();
}

function normalizePhrase(phrase: string): string {
  return phrase.toLowerCase().replace(/\s+/g, " ").trim();
}

function isAcronym(token: string): boolean {
  return (
    token.length >= 2 && token.length <= 5 && token === token.toUpperCase() && /[A-Z]/.test(token)
  );
}

function shouldKeepToken(
  tokenNorm: string,
  tokenOriginal: string,
  themeWords: Set<string>,
): boolean {
  if (themeWords.has(tokenNorm)) return false;
  if (STOPWORDS.has(tokenNorm)) return false;
  if (/^\d+$/.test(tokenNorm)) return false;
  if (tokenNorm.length < 3 && !isAcronym(tokenOriginal) && !/[0-9]/.test(tokenOriginal)) {
    return false;
  }
  return true;
}

function displayScore(token: string): number {
  if (!token) return 0;
  if (token === token.toUpperCase() && /[A-Z]/.test(token)) return 3;
  if (token !== token.toLowerCase() && token !== token.toUpperCase()) return 2;
  if (/[0-9]/.test(token)) return 1.5;
  return 1;
}

function pickDisplay(existing: string | null, next: string): string {
  const cleanedNext = cleanLabel(next);
  if (!existing) return cleanedNext;
  const existingScore = displayScore(existing);
  const nextScore = displayScore(cleanedNext);
  if (nextScore > existingScore) return cleanedNext;
  return existing;
}

interface KeywordStats {
  count: number;
  display: string;
}

interface KeywordStatsResult {
  stats: Map<string, KeywordStats>;
  candidatesByItem: Map<string, string[]>;
}

function buildKeywordStats(
  items: FeedItemType[],
  themeWords: Set<string>,
  baseLabelNormalized: string,
): KeywordStatsResult {
  const stats = new Map<string, KeywordStats>();
  const candidatesByItem = new Map<string, string[]>();

  for (const item of items) {
    const rawTitle = item.item.title ?? item.item.bodyText ?? "";
    const title = rawTitle.slice(0, 160);
    const tokens = tokenizeText(title);
    const seen = new Set<string>();
    const candidates: string[] = [];

    tokens.forEach((token) => {
      const normalized = normalizeToken(token);
      if (!shouldKeepToken(normalized, token, themeWords)) return;
      if (seen.has(normalized)) return;
      seen.add(normalized);
      candidates.push(normalized);
      const existing = stats.get(normalized);
      if (existing) {
        existing.count += 1;
        existing.display = pickDisplay(existing.display, token);
      } else {
        stats.set(normalized, { count: 1, display: cleanLabel(token) });
      }
    });

    const triageData = item.triageJson as { categories?: unknown } | null;
    const categories = Array.isArray(triageData?.categories) ? triageData?.categories : [];
    if (categories.length > 0) {
      categories.forEach((category) => {
        if (typeof category !== "string") return;
        const cleaned = cleanLabel(category);
        const normalized = normalizePhrase(cleaned);
        if (!normalized) return;
        if (normalized === baseLabelNormalized) return;
        if (seen.has(normalized)) return;
        seen.add(normalized);
        candidates.push(normalized);
        const existing = stats.get(normalized);
        if (existing) {
          existing.count += 1;
          existing.display = pickDisplay(existing.display, cleaned);
        } else {
          stats.set(normalized, { count: 1, display: cleaned });
        }
      });
    }

    if (candidates.length > 0) {
      candidatesByItem.set(item.id, candidates);
    }
  }

  return { stats, candidatesByItem };
}

function refineThemeLabel(
  baseLabel: string,
  keywordStats: KeywordStatsResult | null,
  totalItems: number,
): string {
  const cleaned = cleanLabel(baseLabel);
  if (!keywordStats || cleaned === "Uncategorized" || totalItems < 4) {
    return cleaned;
  }

  const wordCount = tokenizeText(cleaned).length;
  if (wordCount >= 3) {
    return cleaned;
  }

  const themeWords = new Set(tokenizeText(cleaned).map(normalizeToken));
  const maxCount = Math.max(2, Math.floor(totalItems * 0.8));
  let bestKey: string | null = null;
  let bestCount = -1;
  let bestDisplay = "";

  for (const [key, stat] of keywordStats.stats) {
    if (stat.count < 2 || stat.count > maxCount) continue;
    const keyWords = key
      .split(" ")
      .map((word) => normalizeToken(word))
      .filter(Boolean);
    if (keyWords.length > 0 && keyWords.every((word) => themeWords.has(word))) {
      continue;
    }
    if (
      stat.count > bestCount ||
      (stat.count === bestCount && stat.display.length < bestDisplay.length)
    ) {
      bestKey = key;
      bestCount = stat.count;
      bestDisplay = stat.display;
    }
  }

  if (!bestKey || !bestDisplay) return cleaned;
  const refined = `${cleaned} · ${bestDisplay}`;
  return refined.length <= 48 ? refined : cleaned;
}

function buildSubthemeGroups(
  items: FeedItemType[],
  comparator: (a: FeedItemType, b: FeedItemType) => number,
  keywordStats: KeywordStatsResult | null,
  refineLabels: boolean,
): SubthemeGroup[] | null {
  if (!keywordStats || items.length < 4) {
    return null;
  }

  const minCount = 2;
  const maxCount = Math.max(minCount, Math.floor(items.length * 0.8));
  const groups = new Map<string, FeedItemType[]>();

  for (const item of items) {
    const candidates = keywordStats.candidatesByItem.get(item.id) ?? [];
    let bestKey: string | null = null;
    let bestCount = -1;
    let bestIndex = Number.POSITIVE_INFINITY;

    candidates.forEach((candidate, index) => {
      const stat = keywordStats.stats.get(candidate);
      if (!stat) return;
      if (stat.count < minCount || stat.count > maxCount) return;
      if (stat.count > bestCount || (stat.count === bestCount && index < bestIndex)) {
        bestKey = candidate;
        bestCount = stat.count;
        bestIndex = index;
      }
    });

    const key = bestKey ?? "other";
    const existing = groups.get(key);
    if (existing) {
      existing.push(item);
    } else {
      groups.set(key, [item]);
    }
  }

  const subthemes: SubthemeGroup[] = [];
  const otherItems = groups.get("other") ?? [];

  for (const [key, groupItems] of groups) {
    if (key === "other") continue;
    groupItems.sort(comparator);
    const topItem = groupItems[0];
    const display = keywordStats.stats.get(key)?.display ?? key;
    subthemes.push({
      subthemeId: key,
      label: refineLabels ? cleanLabel(display) : display,
      itemCount: groupItems.length,
      items: groupItems,
      topScore: topItem?.ahaScore ?? topItem?.score ?? 0,
    });
  }

  if (subthemes.length === 0) {
    return null;
  }

  if (subthemes.length === 1 && otherItems.length === 0) {
    return null;
  }

  subthemes.sort((a, b) => {
    const topA = a.items[0];
    const topB = b.items[0];
    if (!topA || !topB) return 0;
    return comparator(topA, topB);
  });

  if (otherItems.length > 0) {
    otherItems.sort(comparator);
    const topItem = otherItems[0];
    subthemes.push({
      subthemeId: "other",
      label: "Other",
      itemCount: otherItems.length,
      items: otherItems,
      topScore: topItem?.ahaScore ?? topItem?.score ?? 0,
    });
  }

  return subthemes;
}

function flattenSubthemes(subthemes: SubthemeGroup[]): FeedItemType[] {
  return subthemes.flatMap((group) => group.items);
}

function chunkItems<T>(items: T[], size: number): T[][] {
  if (size <= 0) return [items];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks.length > 0 ? chunks : [items];
}

/**
 * Group items by topic (from triage JSON).
 *
 * - Topics with 2+ items → collapsible group (shown first, sorted by top score)
 * - Singletons → collected into "Uncategorized" (shown last)
 * - Items within each group are sorted by the specified sort option
 *
 * This keeps themed items grouped while preserving an "Uncategorized" bucket.
 */
export function groupItemsByTheme(
  items: FeedItemType[],
  options: SortOption | ThemeGroupingOptions = "best",
): ThemeGroup[] {
  const resolvedOptions = typeof options === "string" ? { sort: options } : options;
  const sort = resolvedOptions.sort ?? "best";
  const maxItemsPerThemeRaw = resolvedOptions.maxItemsPerTheme ?? 0;
  const maxItemsPerTheme = maxItemsPerThemeRaw >= 2 ? maxItemsPerThemeRaw : 0;
  const subthemesEnabled = resolvedOptions.subthemesEnabled ?? false;
  const refineLabels = resolvedOptions.refineLabels ?? false;
  const fallbackThemeByItemId = resolvedOptions.fallbackThemeByItemId;
  const minThemeSize = 2;

  const topicMap = new Map<string, FeedItemType[]>();

  // First pass: group items by topic from triageJson
  for (const item of items) {
    let topic = getItemThemeKey(item);
    if (topic === "Uncategorized" && fallbackThemeByItemId) {
      const fallback = fallbackThemeByItemId.get(item.id);
      if (fallback && fallback !== "Uncategorized") {
        topic = fallback;
      }
    }
    const existing = topicMap.get(topic);
    if (existing) {
      existing.push(item);
    } else {
      topicMap.set(topic, [item]);
    }
  }

  const themedGroups: ThemeGroup[] = [];
  const uncategorizedItems: FeedItemType[] = [];
  const comparator = getItemComparator(sort);

  function buildGroupsForTheme(
    themeKey: string,
    themeItems: FeedItemType[],
    allowSubthemes: boolean,
    themeIdBase?: string,
  ): ThemeGroup[] {
    const sortedItems = [...themeItems].sort(comparator);
    const chunks = maxItemsPerTheme > 0 ? chunkItems(sortedItems, maxItemsPerTheme) : [sortedItems];
    // Avoid singleton chunks by merging the last 1-item chunk into the previous chunk.
    if (chunks.length > 1 && chunks[chunks.length - 1]?.length === 1) {
      const last = chunks.pop();
      const prev = chunks[chunks.length - 1];
      if (last && prev) {
        prev.push(...last);
      }
    }
    const baseLabel = cleanLabel(themeKey);
    const baseLabelNormalized = normalizePhrase(baseLabel);
    const themeWords = new Set(tokenizeText(baseLabel).map(normalizeToken));
    const groups: ThemeGroup[] = [];
    const baseThemeId = themeIdBase ?? themeKey;

    chunks.forEach((chunk, index) => {
      const needsKeywords =
        (refineLabels && baseLabel !== "Uncategorized") || (subthemesEnabled && allowSubthemes);
      const keywordStats = needsKeywords
        ? buildKeywordStats(chunk, themeWords, baseLabelNormalized)
        : null;
      const refinedLabel = refineLabels
        ? refineThemeLabel(baseLabel, keywordStats, chunk.length)
        : baseLabel;
      const subthemes =
        subthemesEnabled && allowSubthemes
          ? (buildSubthemeGroups(chunk, comparator, keywordStats, refineLabels) ?? undefined)
          : undefined;
      const orderedItems = subthemes ? flattenSubthemes(subthemes) : chunk;
      const topItem = orderedItems[0];
      const suffix = chunks.length > 1 ? ` · ${index + 1}` : "";

      groups.push({
        themeKey,
        themeId: chunks.length > 1 ? `${baseThemeId}::${index + 1}` : baseThemeId,
        label: `${refinedLabel}${suffix}`,
        itemCount: orderedItems.length,
        items: orderedItems,
        topScore: topItem?.ahaScore ?? topItem?.score ?? 0,
        subthemes,
      });
    });

    return groups;
  }

  // Second pass: create groups for topics, collect uncategorized
  for (const [topic, topicItems] of topicMap) {
    if (topic === "Uncategorized") {
      uncategorizedItems.push(...topicItems);
      continue;
    }

    if (topicItems.length < minThemeSize) {
      uncategorizedItems.push(...topicItems);
      continue;
    }

    themedGroups.push(...buildGroupsForTheme(topic, topicItems, true));
  }

  // Sort themed groups by top item (using same sort logic as items)
  themedGroups.sort((a, b) => {
    const topA = a.items[0];
    const topB = b.items[0];
    if (!topA || !topB) return 0;
    return comparator(topA, topB);
  });

  // Add "Uncategorized" group(s) at the end (always last)
  const uncategorizedGroups: ThemeGroup[] = [];
  if (uncategorizedItems.length > 0) {
    uncategorizedGroups.push(
      ...buildGroupsForTheme("Uncategorized", uncategorizedItems, false, "ungrouped"),
    );
  }

  return [...themedGroups, ...uncategorizedGroups];
}
