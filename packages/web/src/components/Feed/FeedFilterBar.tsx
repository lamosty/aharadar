"use client";

import { Tooltip } from "@/components/Tooltip";
import type { Layout } from "@/lib/theme";
import styles from "./FeedFilterBar.module.css";
import { SourceFilterCombobox } from "./SourceFilterCombobox";

export type SortOption = "best" | "latest" | "trending" | "ai_score";

interface FeedFilterBarProps {
  selectedSources: string[];
  onSourcesChange: (sources: string[]) => void;
  sort: SortOption;
  onSortChange: (sort: SortOption) => void;
  /** Layout mode - condensed uses simpler styling */
  layout?: Layout;
}

const SORT_OPTIONS: Array<{ value: SortOption; label: string }> = [
  { value: "best", label: "Best" },
  { value: "latest", label: "Latest" },
  { value: "trending", label: "Trending" },
  { value: "ai_score", label: "AI Score" },
];

function SortHelpContent() {
  return (
    <div className={styles.sortHelpContent}>
      <div className={styles.sortHelpTitle}>Sort options</div>
      <ul className={styles.sortHelpList}>
        <li className={styles.sortHelpItem}>
          <strong>Best:</strong> Personalized ranking based on your feedback
        </li>
        <li className={styles.sortHelpItem}>
          <strong>Latest:</strong> Most recent items first
        </li>
        <li className={styles.sortHelpItem}>
          <strong>Trending:</strong> Popular items with recency boost
        </li>
        <li className={styles.sortHelpItem}>
          <strong>AI Score:</strong> Raw AI-assigned relevance score
        </li>
      </ul>
    </div>
  );
}

export function FeedFilterBar({
  selectedSources,
  onSourcesChange,
  sort,
  onSortChange,
  layout = "reader",
}: FeedFilterBarProps) {
  const isCondensed = layout === "condensed";

  return (
    <div className={`${styles.filterBar} ${isCondensed ? styles.filterBarCondensed : ""}`}>
      <div className={styles.leftControls}>
        <SourceFilterCombobox
          selectedSources={selectedSources}
          onSourcesChange={onSourcesChange}
          layout={layout}
        />
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
        <Tooltip content={<SortHelpContent />} position="bottom">
          <button type="button" className={styles.helpButton} aria-label="Sort options help">
            ?
          </button>
        </Tooltip>
      </div>
    </div>
  );
}
