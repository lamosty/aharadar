"use client";

import { Listbox, ListboxButton, ListboxOption, ListboxOptions } from "@headlessui/react";
import { useMemo, useState } from "react";
import { SUPPORTED_SOURCE_TYPES, type SupportedSourceType } from "@/lib/api";
import type { Layout } from "@/lib/theme";
import styles from "./SourceFilterCombobox.module.css";

interface SourceFilterComboboxProps {
  selectedSources: string[];
  onSourcesChange: (sources: string[]) => void;
  layout?: Layout;
}

const SOURCE_LABELS: Record<SupportedSourceType, string> = {
  hn: "Hacker News",
  reddit: "Reddit",
  rss: "RSS",
  youtube: "YouTube",
  x_posts: "X (Twitter)",
  sec_edgar: "SEC Edgar",
  congress_trading: "Congress Trading",
  polymarket: "Polymarket",
  options_flow: "Options Flow",
  market_sentiment: "Market Sentiment",
  podcast: "Podcast",
  substack: "Substack",
  medium: "Medium",
  arxiv: "arXiv",
  lobsters: "Lobsters",
  producthunt: "Product Hunt",
  github_releases: "GitHub Releases",
  telegram: "Telegram",
};

// Shorter labels for the button display
const SOURCE_SHORT_LABELS: Record<SupportedSourceType, string> = {
  hn: "HN",
  reddit: "Reddit",
  rss: "RSS",
  youtube: "YouTube",
  x_posts: "X",
  sec_edgar: "SEC",
  congress_trading: "Congress",
  polymarket: "Polymarket",
  options_flow: "Options",
  market_sentiment: "Sentiment",
  podcast: "Podcast",
  substack: "Substack",
  medium: "Medium",
  arxiv: "arXiv",
  lobsters: "Lobsters",
  producthunt: "PH",
  github_releases: "GitHub",
  telegram: "Telegram",
};

export function SourceFilterCombobox({
  selectedSources,
  onSourcesChange,
  layout = "reader",
}: SourceFilterComboboxProps) {
  const [query, setQuery] = useState("");

  const filteredSources = useMemo(() => {
    if (!query) return SUPPORTED_SOURCE_TYPES;
    const lowerQuery = query.toLowerCase();
    return SUPPORTED_SOURCE_TYPES.filter(
      (source) =>
        SOURCE_LABELS[source].toLowerCase().includes(lowerQuery) ||
        source.toLowerCase().includes(lowerQuery),
    );
  }, [query]);

  const isCondensed = layout === "condensed";
  const allSelected = selectedSources.length === 0;

  // Display text for the button
  const buttonText = useMemo(() => {
    if (allSelected) {
      return "All sources";
    }
    if (selectedSources.length === 1) {
      return SOURCE_SHORT_LABELS[selectedSources[0] as SupportedSourceType] || selectedSources[0];
    }
    if (selectedSources.length <= 3) {
      return selectedSources
        .map((s) => SOURCE_SHORT_LABELS[s as SupportedSourceType] || s)
        .join(", ");
    }
    return `${selectedSources.length} sources`;
  }, [selectedSources, allSelected]);

  const handleClearAll = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onSourcesChange([]);
    setQuery("");
  };

  return (
    <Listbox
      multiple
      value={selectedSources}
      onChange={onSourcesChange}
      as="div"
      className={styles.comboboxWrapper}
    >
      <ListboxButton className={`${styles.trigger} ${isCondensed ? styles.triggerCondensed : ""}`}>
        <span className={styles.triggerText}>{buttonText}</span>
        <ChevronDownIcon className={styles.chevron} />
      </ListboxButton>

      <ListboxOptions
        className={styles.dropdown}
        // Clear search when dropdown closes
        onTransitionEnd={() => setQuery("")}
      >
        <div className={styles.searchWrapper}>
          <SearchIcon className={styles.searchIcon} />
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Search sources..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              // Prevent Listbox keyboard navigation while typing
              e.stopPropagation();
            }}
            autoFocus
          />
        </div>

        {!allSelected && (
          <button type="button" className={styles.clearButton} onClick={handleClearAll}>
            <span>Clear selection</span>
            <span className={styles.clearCount}>({selectedSources.length})</span>
          </button>
        )}

        <div className={styles.optionsList}>
          {filteredSources.length === 0 ? (
            <div className={styles.noResults}>No sources found</div>
          ) : (
            filteredSources.map((source) => (
              <ListboxOption
                key={source}
                value={source}
                className={({ focus, selected }) =>
                  `${styles.option} ${focus ? styles.optionFocus : ""} ${selected ? styles.optionSelected : ""}`
                }
              >
                {({ selected }) => (
                  <>
                    <span
                      className={`${styles.checkbox} ${selected ? styles.checkboxChecked : ""}`}
                    >
                      {selected && <CheckIcon />}
                    </span>
                    <span className={styles.optionLabel}>{SOURCE_LABELS[source]}</span>
                  </>
                )}
              </ListboxOption>
            ))
          )}
        </div>
      </ListboxOptions>
    </Listbox>
  );
}

// Inline SVG Icons
function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
