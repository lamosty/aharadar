"use client";

import { SUPPORTED_SOURCE_TYPES, type SupportedSourceType } from "@/lib/api";
import type { Layout } from "@/lib/theme";
import styles from "./FeedFilterBar.module.css";

export type SortOption = "best" | "latest" | "trending";

interface FeedFilterBarProps {
  selectedSources: string[];
  onSourcesChange: (sources: string[]) => void;
  sort: SortOption;
  onSortChange: (sort: SortOption) => void;
  /** Layout mode - condensed uses simpler styling */
  layout?: Layout;
}

const SOURCE_LABELS: Record<SupportedSourceType, string> = {
  hn: "HN",
  reddit: "Reddit",
  rss: "RSS",
  youtube: "YouTube",
  x_posts: "X",
  signal: "Signal",
  sec_edgar: "SEC",
  congress_trading: "Congress",
  polymarket: "Polymarket",
  options_flow: "Options",
  market_sentiment: "Sentiment",
  // RSS-based types
  podcast: "Podcast",
  substack: "Substack",
  medium: "Medium",
  arxiv: "arXiv",
  lobsters: "Lobsters",
  producthunt: "PH",
  github_releases: "GitHub",
  telegram: "Telegram",
};

const SORT_OPTIONS: Array<{ value: SortOption; label: string }> = [
  { value: "best", label: "Best" },
  { value: "latest", label: "Latest" },
  { value: "trending", label: "Trending" },
];

export function FeedFilterBar({
  selectedSources,
  onSourcesChange,
  sort,
  onSortChange,
  layout = "reader",
}: FeedFilterBarProps) {
  const toggleSource = (source: string) => {
    if (selectedSources.includes(source)) {
      onSourcesChange(selectedSources.filter((s) => s !== source));
    } else {
      onSourcesChange([...selectedSources, source]);
    }
  };

  const allSelected = selectedSources.length === 0;
  const isCondensed = layout === "condensed";

  return (
    <div className={`${styles.filterBar} ${isCondensed ? styles.filterBarCondensed : ""}`}>
      <div className={styles.sourceFilters}>
        <button
          className={`${styles.sourceButton} ${allSelected ? styles.sourceButtonActive : ""}`}
          onClick={() => onSourcesChange([])}
          aria-pressed={allSelected}
        >
          All
        </button>
        {SUPPORTED_SOURCE_TYPES.map((source) => {
          const isActive = selectedSources.includes(source);
          return (
            <button
              key={source}
              className={`${styles.sourceButton} ${isActive ? styles.sourceButtonActive : ""}`}
              onClick={() => toggleSource(source)}
              aria-pressed={isActive}
            >
              {SOURCE_LABELS[source]}
            </button>
          );
        })}
      </div>

      <div className={styles.rightControls}>
        <select
          className={styles.sortSelect}
          value={sort}
          onChange={(e) => onSortChange(e.target.value as SortOption)}
          aria-label="Sort by"
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
