"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SupportedSourceType } from "@/lib/api";
import { t } from "@/lib/i18n";
import {
  CATEGORY_INFO,
  getSourcesGroupedByCategory,
  type SourceCatalogEntry,
  type SourceCategory,
  searchSources,
} from "@/lib/source_catalog";
import styles from "./SourceTypePickerModal.module.css";

interface SourceTypePickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (sourceType: SupportedSourceType) => void;
}

export function SourceTypePickerModal({ isOpen, onClose, onSelect }: SourceTypePickerModalProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<SourceCategory | "all">("all");
  const [showPaidSources, setShowPaidSources] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(0);

  const modalRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Filter sources based on search, category, and paid toggle
  const filteredSources = useMemo(() => {
    let sources = searchQuery.trim()
      ? searchSources(searchQuery)
      : getSourcesGroupedByCategory().flatMap((g) => g.sources);

    // Filter by category
    if (selectedCategory !== "all") {
      sources = sources.filter((s) => s.category === selectedCategory);
    }

    // Filter out paid sources unless toggle is on
    if (!showPaidSources) {
      sources = sources.filter((s) => !s.isPaid);
    }

    return sources;
  }, [searchQuery, selectedCategory, showPaidSources]);

  // Group sources by category for display
  const groupedSources = useMemo(() => {
    if (selectedCategory !== "all") {
      return [
        {
          category: selectedCategory,
          label: CATEGORY_INFO[selectedCategory].label,
          sources: filteredSources,
        },
      ];
    }

    const groups = getSourcesGroupedByCategory();
    return groups
      .map((g) => ({
        ...g,
        sources: g.sources.filter((s) => filteredSources.includes(s)),
      }))
      .filter((g) => g.sources.length > 0);
  }, [filteredSources, selectedCategory]);

  // Flat list for keyboard navigation
  const flatSources = useMemo(() => {
    return groupedSources.flatMap((g) => g.sources);
  }, [groupedSources]);

  // Reset focus when sources change
  useEffect(() => {
    setFocusedIndex(0);
  }, [filteredSources.length]);

  // Focus search input when modal opens
  useEffect(() => {
    if (isOpen) {
      setSearchQuery("");
      setFocusedIndex(0);
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Handle click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen, onClose]);

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (flatSources.length === 0) return;

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setFocusedIndex((prev) => (prev + 1) % flatSources.length);
          break;
        case "ArrowUp":
          e.preventDefault();
          setFocusedIndex((prev) => (prev - 1 + flatSources.length) % flatSources.length);
          break;
        case "Enter":
          e.preventDefault();
          if (flatSources[focusedIndex]) {
            handleSelect(flatSources[focusedIndex]);
          }
          break;
      }
    },
    [flatSources, focusedIndex],
  );

  const handleSelect = (entry: SourceCatalogEntry) => {
    onSelect(entry.sourceType);
    onClose();
  };

  const categories: Array<{ value: SourceCategory | "all"; label: string }> = [
    { value: "all", label: t("sourcePicker.allCategories") },
    ...Object.entries(CATEGORY_INFO)
      .sort(([, a], [, b]) => a.order - b.order)
      .map(([cat, info]) => ({ value: cat as SourceCategory, label: info.label })),
  ];

  // Count paid sources hidden
  const hiddenPaidCount = useMemo(() => {
    const allSources = searchQuery.trim()
      ? searchSources(searchQuery)
      : getSourcesGroupedByCategory().flatMap((g) => g.sources);

    const catFiltered =
      selectedCategory === "all"
        ? allSources
        : allSources.filter((s) => s.category === selectedCategory);

    return catFiltered.filter((s) => s.isPaid).length;
  }, [searchQuery, selectedCategory]);

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} aria-modal="true" role="dialog">
      <div className={styles.modal} ref={modalRef} onKeyDown={handleKeyDown}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerContent}>
            <h2 className={styles.title}>{t("sourcePicker.title")}</h2>
            <p className={styles.subtitle}>{t("sourcePicker.subtitle")}</p>
          </div>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label={t("common.close")}
          >
            <CloseIcon />
          </button>
        </div>

        {/* Search and filters */}
        <div className={styles.controls}>
          <div className={styles.searchWrapper}>
            <SearchIcon />
            <input
              ref={searchInputRef}
              type="text"
              className={styles.searchInput}
              placeholder={t("sourcePicker.searchPlaceholder")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                type="button"
                className={styles.clearButton}
                onClick={() => setSearchQuery("")}
                aria-label="Clear search"
              >
                <CloseIcon />
              </button>
            )}
          </div>

          <div className={styles.categoryTabs}>
            {categories.map((cat) => (
              <button
                key={cat.value}
                type="button"
                className={`${styles.categoryTab} ${selectedCategory === cat.value ? styles.categoryTabActive : ""}`}
                onClick={() => setSelectedCategory(cat.value)}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Source list */}
        <div className={styles.body}>
          {flatSources.length === 0 ? (
            <div className={styles.emptyState}>
              <p>{t("sourcePicker.noResults")}</p>
              {!showPaidSources && hiddenPaidCount > 0 && (
                <p className={styles.emptyHint}>
                  {t("sourcePicker.hiddenPaidHint", { count: hiddenPaidCount })}
                </p>
              )}
            </div>
          ) : (
            groupedSources.map((group) => (
              <div key={group.category} className={styles.categoryGroup}>
                <h3 className={styles.categoryLabel}>{group.label}</h3>
                <div className={styles.sourceList}>
                  {group.sources.map((entry, idx) => {
                    const globalIndex = flatSources.indexOf(entry);
                    const isFocused = globalIndex === focusedIndex;

                    return (
                      <button
                        key={entry.sourceType}
                        type="button"
                        className={`${styles.sourceItem} ${isFocused ? styles.sourceItemFocused : ""}`}
                        onClick={() => handleSelect(entry)}
                        onMouseEnter={() => setFocusedIndex(globalIndex)}
                      >
                        <div className={styles.sourceInfo}>
                          <div className={styles.sourceName}>
                            {entry.name}
                            {entry.isPaid && (
                              <span className={styles.badgePaid}>
                                {t("sourcePicker.badgePaid")}
                              </span>
                            )}
                            {entry.isBudgetSensitive && (
                              <span className={styles.badgeBudget} title={entry.costHint}>
                                {t("sourcePicker.badgeBudget")}
                              </span>
                            )}
                            {entry.isExperimental && (
                              <span className={styles.badgeExperimental}>
                                {t("sourcePicker.badgeExperimental")}
                              </span>
                            )}
                          </div>
                          <div className={styles.sourceDescription}>{entry.description}</div>
                          {entry.costHint && (
                            <div className={styles.costHint}>{entry.costHint}</div>
                          )}
                        </div>
                        <ChevronRightIcon />
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer with paid toggle */}
        <div className={styles.footer}>
          <label className={styles.toggleLabel}>
            <input
              type="checkbox"
              checked={showPaidSources}
              onChange={(e) => setShowPaidSources(e.target.checked)}
              className={styles.toggleInput}
            />
            <span className={styles.toggleSlider} />
            <span className={styles.toggleText}>
              {t("sourcePicker.showPaidSources")}
              {hiddenPaidCount > 0 && !showPaidSources && (
                <span className={styles.hiddenCount}>({hiddenPaidCount})</span>
              )}
            </span>
          </label>
        </div>
      </div>
    </div>
  );
}

// Icons
function CloseIcon() {
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
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function SearchIcon() {
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
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function ChevronRightIcon() {
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
      className={styles.chevron}
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

export type { SourceCatalogEntry } from "@/lib/source_catalog";
// Re-export for convenience
export { SOURCE_CATALOG } from "@/lib/source_catalog";
