"use client";

import { t } from "@/lib/i18n";
import styles from "./Pagination.module.css";

export const PAGE_SIZE_OPTIONS = [25, 50, 100, 200] as const;
export type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];

interface PaginationProps {
  /** Current page (1-indexed) */
  currentPage: number;
  /** Total number of items */
  totalItems: number;
  /** Items per page */
  pageSize: PageSize;
  /** Called when page changes */
  onPageChange: (page: number) => void;
  /** Called when page size changes */
  onPageSizeChange: (size: PageSize) => void;
  /** Whether data is currently loading */
  isLoading?: boolean;
  /** Compact mode for condensed layouts */
  compact?: boolean;
}

export function Pagination({
  currentPage,
  totalItems,
  pageSize,
  onPageChange,
  onPageSizeChange,
  isLoading = false,
  compact = false,
}: PaginationProps) {
  const totalPages = Math.ceil(totalItems / pageSize);
  const startItem = (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalItems);

  const canGoPrevious = currentPage > 1;
  const canGoNext = currentPage < totalPages;

  const handlePrevious = () => {
    if (canGoPrevious) onPageChange(currentPage - 1);
  };

  const handleNext = () => {
    if (canGoNext) onPageChange(currentPage + 1);
  };

  // Generate page numbers to display (with truncation for large page counts)
  const getPageNumbers = (): (number | "ellipsis")[] => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    const pages: (number | "ellipsis")[] = [];

    // Always show first page
    pages.push(1);

    if (currentPage > 3) {
      pages.push("ellipsis");
    }

    // Show pages around current page
    const start = Math.max(2, currentPage - 1);
    const end = Math.min(totalPages - 1, currentPage + 1);

    for (let i = start; i <= end; i++) {
      if (!pages.includes(i)) pages.push(i);
    }

    if (currentPage < totalPages - 2) {
      pages.push("ellipsis");
    }

    // Always show last page
    if (!pages.includes(totalPages)) {
      pages.push(totalPages);
    }

    return pages;
  };

  if (totalItems === 0) {
    return null;
  }

  return (
    <div className={`${styles.pagination} ${compact ? styles.compact : ""}`}>
      {/* Items range display */}
      <div className={styles.info}>
        <span className={styles.range}>
          {startItem.toLocaleString()}-{endItem.toLocaleString()} of {totalItems.toLocaleString()}
        </span>
      </div>

      {/* Page size selector */}
      <div className={styles.pageSizeControl}>
        <label className={styles.pageSizeLabel} htmlFor="page-size">
          {compact ? "" : "Show"}
        </label>
        <select
          id="page-size"
          className={styles.pageSizeSelect}
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value) as PageSize)}
          disabled={isLoading}
        >
          {PAGE_SIZE_OPTIONS.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
        {!compact && <span className={styles.pageSizeLabel}>per page</span>}
      </div>

      {/* Page navigation */}
      <div className={styles.navigation}>
        <button
          className={styles.navButton}
          onClick={handlePrevious}
          disabled={!canGoPrevious || isLoading}
          aria-label="Previous page"
        >
          <ChevronLeftIcon />
          {!compact && <span>Prev</span>}
        </button>

        {!compact && (
          <div className={styles.pageNumbers}>
            {getPageNumbers().map((pageNum, index) =>
              pageNum === "ellipsis" ? (
                <span key={`ellipsis-${index}`} className={styles.ellipsis}>
                  ...
                </span>
              ) : (
                <button
                  key={pageNum}
                  className={`${styles.pageNumber} ${pageNum === currentPage ? styles.pageNumberActive : ""}`}
                  onClick={() => onPageChange(pageNum)}
                  disabled={isLoading}
                  aria-current={pageNum === currentPage ? "page" : undefined}
                >
                  {pageNum}
                </button>
              )
            )}
          </div>
        )}

        {compact && (
          <span className={styles.pageIndicator}>
            {currentPage} / {totalPages}
          </span>
        )}

        <button
          className={styles.navButton}
          onClick={handleNext}
          disabled={!canGoNext || isLoading}
          aria-label="Next page"
        >
          {!compact && <span>Next</span>}
          <ChevronRightIcon />
        </button>
      </div>
    </div>
  );
}

function ChevronLeftIcon() {
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
      <polyline points="15 18 9 12 15 6" />
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
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}
