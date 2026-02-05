"use client";

import { Tooltip } from "@/components/Tooltip";
import { isScoringModeDisplayEnabled } from "@/lib/experimental";
import type { Layout } from "@/lib/theme";
import styles from "./FeedFilterBar.module.css";
import { SourceFilterCombobox } from "./SourceFilterCombobox";

export type SortOption =
  | "best"
  | "latest"
  | "trending"
  | "comments_desc"
  | "ai_score"
  | "has_ai_summary";

interface FeedFilterBarProps {
  selectedSources: string[];
  onSourcesChange: (sources: string[]) => void;
  sort: SortOption;
  onSortChange: (sort: SortOption) => void;
  /** Layout mode - condensed uses simpler styling */
  layout?: Layout;
  /** Available scoring modes for filtering */
  availableModes?: Array<{ id: string; name: string }>;
  /** Currently selected scoring mode filter (empty = all modes) */
  selectedModeId?: string;
  /** Callback when mode filter changes */
  onModeChange?: (modeId: string) => void;
  /** Whether to group items by scoring mode */
  groupByMode?: boolean;
  /** Callback when group by mode toggle changes */
  onGroupByModeChange?: (enabled: boolean) => void;
}

const SORT_OPTIONS: Array<{ value: SortOption; label: string }> = [
  { value: "best", label: "Best" },
  { value: "latest", label: "Latest" },
  { value: "trending", label: "Trending" },
  { value: "comments_desc", label: "Most Comments" },
  { value: "ai_score", label: "AI Score" },
  { value: "has_ai_summary", label: "Has AI Summary" },
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
          <strong>Most Comments:</strong> Items with the largest discussion first
        </li>
        <li className={styles.sortHelpItem}>
          <strong>AI Score:</strong> Raw AI-assigned relevance score
        </li>
        <li className={styles.sortHelpItem}>
          <strong>Has AI Summary:</strong> Items with AI summary first
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
  layout = "condensed",
  availableModes,
  selectedModeId = "",
  onModeChange,
  groupByMode = false,
  onGroupByModeChange,
}: FeedFilterBarProps) {
  const isCondensed = layout === "condensed";
  const showModeControls =
    isScoringModeDisplayEnabled() && availableModes && availableModes.length > 0;

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
        {/* Mode filter dropdown - only shown when experimental toggle is enabled */}
        {showModeControls && onModeChange && (
          <select
            className={styles.modeSelect}
            value={selectedModeId}
            onChange={(e) => onModeChange(e.target.value)}
            aria-label="Filter by mode"
          >
            <option value="">All modes</option>
            {availableModes.map((mode) => (
              <option key={mode.id} value={mode.id}>
                {mode.name}
              </option>
            ))}
          </select>
        )}

        {/* Group by mode toggle - only shown when experimental toggle is enabled */}
        {showModeControls && onGroupByModeChange && (
          <Tooltip content="Group items by scoring mode">
            <button
              type="button"
              className={`${styles.groupToggle} ${groupByMode ? styles.groupToggleActive : ""}`}
              onClick={() => onGroupByModeChange(!groupByMode)}
              aria-label="Group by mode"
              aria-pressed={groupByMode}
            >
              <GroupIcon />
            </button>
          </Tooltip>
        )}

        <Tooltip content={<SortHelpContent />} position="bottom">
          <button type="button" className={styles.helpButton} aria-label="Sort options help">
            ?
          </button>
        </Tooltip>
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

function GroupIcon() {
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
      aria-hidden="true"
    >
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
    </svg>
  );
}
