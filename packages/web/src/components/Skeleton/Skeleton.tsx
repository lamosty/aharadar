/**
 * Skeleton loading components for snappy UX.
 *
 * Provides visual placeholders while content loads.
 * Matches the layout of actual content for smooth transitions.
 */

import styles from "./Skeleton.module.css";

interface SkeletonProps {
  /** Custom width (CSS value) */
  width?: string;
  /** Custom height (CSS value) */
  height?: string;
  /** Border radius variant */
  rounded?: "none" | "sm" | "md" | "lg" | "full";
  /** Additional CSS class */
  className?: string;
  /** Accessible label for screen readers */
  "aria-label"?: string;
}

/**
 * Base skeleton component with shimmer animation.
 */
export function Skeleton({
  width,
  height,
  rounded = "md",
  className = "",
  "aria-label": ariaLabel = "Loading...",
}: SkeletonProps) {
  const style: React.CSSProperties = {};
  if (width) style.width = width;
  if (height) style.height = height;

  return (
    <div
      className={`${styles.skeleton} ${styles[`rounded-${rounded}`]} ${className}`}
      style={style}
      role="status"
      aria-label={ariaLabel}
      aria-busy="true"
    />
  );
}

/**
 * Text line skeleton, mimics a line of text.
 */
export function SkeletonText({
  width = "100%",
  lines = 1,
  className = "",
}: {
  width?: string;
  lines?: number;
  className?: string;
}) {
  return (
    <div className={`${styles.textGroup} ${className}`} role="status" aria-busy="true">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          width={i === lines - 1 && lines > 1 ? "70%" : width}
          height="1em"
          rounded="sm"
          aria-label={`Loading text line ${i + 1}`}
        />
      ))}
    </div>
  );
}

/**
 * Avatar/circular skeleton.
 */
export function SkeletonAvatar({
  size = "40px",
  className = "",
}: {
  size?: string;
  className?: string;
}) {
  return (
    <Skeleton
      width={size}
      height={size}
      rounded="full"
      className={className}
      aria-label="Loading avatar"
    />
  );
}

/**
 * Button skeleton placeholder.
 */
export function SkeletonButton({
  width = "100px",
  height = "36px",
  className = "",
}: {
  width?: string;
  height?: string;
  className?: string;
}) {
  return (
    <Skeleton
      width={width}
      height={height}
      rounded="md"
      className={className}
      aria-label="Loading button"
    />
  );
}

/**
 * Card skeleton placeholder.
 */
export function SkeletonCard({
  className = "",
  showImage = true,
  showTitle = true,
  textLines = 2,
}: {
  className?: string;
  showImage?: boolean;
  showTitle?: boolean;
  textLines?: number;
}) {
  return (
    <div className={`${styles.card} ${className}`} role="status" aria-busy="true">
      {showImage && (
        <Skeleton height="160px" rounded="lg" aria-label="Loading image" />
      )}
      <div className={styles.cardContent}>
        {showTitle && (
          <Skeleton width="70%" height="1.5em" rounded="sm" aria-label="Loading title" />
        )}
        <SkeletonText lines={textLines} />
      </div>
    </div>
  );
}

/**
 * Digest list item skeleton.
 */
export function SkeletonDigestItem({ className = "" }: { className?: string }) {
  return (
    <div className={`${styles.digestItem} ${className}`} role="status" aria-busy="true">
      <div className={styles.digestItemMain}>
        <Skeleton width="60%" height="1.25em" rounded="sm" aria-label="Loading title" />
        <Skeleton width="40%" height="0.875em" rounded="sm" aria-label="Loading subtitle" />
      </div>
      <div className={styles.digestItemMeta}>
        <Skeleton width="80px" height="0.875em" rounded="sm" aria-label="Loading meta" />
        <Skeleton width="60px" height="0.875em" rounded="sm" aria-label="Loading date" />
      </div>
    </div>
  );
}

/**
 * Digest detail item skeleton (ranked item in digest).
 */
export function SkeletonRankedItem({ className = "" }: { className?: string }) {
  return (
    <div className={`${styles.rankedItem} ${className}`} role="status" aria-busy="true">
      <div className={styles.rankedItemRank}>
        <Skeleton width="24px" height="24px" rounded="full" aria-label="Loading rank" />
      </div>
      <div className={styles.rankedItemContent}>
        <Skeleton width="85%" height="1.25em" rounded="sm" aria-label="Loading title" />
        <Skeleton width="60%" height="0.875em" rounded="sm" aria-label="Loading author" />
        <SkeletonText lines={2} />
      </div>
      <div className={styles.rankedItemActions}>
        <Skeleton width="32px" height="32px" rounded="md" aria-label="Loading action" />
        <Skeleton width="32px" height="32px" rounded="md" aria-label="Loading action" />
      </div>
    </div>
  );
}

/**
 * Source item skeleton for admin sources page.
 */
export function SkeletonSourceItem({ className = "" }: { className?: string }) {
  return (
    <div className={`${styles.sourceItem} ${className}`} role="status" aria-busy="true">
      <div className={styles.sourceItemMain}>
        <Skeleton width="50%" height="1.25em" rounded="sm" aria-label="Loading name" />
        <Skeleton width="30%" height="0.875em" rounded="sm" aria-label="Loading type" />
      </div>
      <div className={styles.sourceItemControls}>
        <Skeleton width="48px" height="24px" rounded="full" aria-label="Loading toggle" />
        <Skeleton width="80px" height="32px" rounded="md" aria-label="Loading input" />
      </div>
    </div>
  );
}

/**
 * Budget card skeleton.
 */
export function SkeletonBudgetCard({ className = "" }: { className?: string }) {
  return (
    <div className={`${styles.budgetCard} ${className}`} role="status" aria-busy="true">
      <Skeleton width="100px" height="1em" rounded="sm" aria-label="Loading label" />
      <Skeleton width="100%" height="8px" rounded="full" aria-label="Loading progress" />
      <div className={styles.budgetCardStats}>
        <Skeleton width="60px" height="0.875em" rounded="sm" aria-label="Loading stat" />
        <Skeleton width="60px" height="0.875em" rounded="sm" aria-label="Loading stat" />
        <Skeleton width="60px" height="0.875em" rounded="sm" aria-label="Loading stat" />
      </div>
    </div>
  );
}

/**
 * Full page skeleton with header and content area.
 */
export function SkeletonPage({
  showHeader = true,
  children,
}: {
  showHeader?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className={styles.page} role="status" aria-busy="true" aria-label="Loading page">
      {showHeader && (
        <div className={styles.pageHeader}>
          <Skeleton width="200px" height="2rem" rounded="sm" aria-label="Loading page title" />
        </div>
      )}
      <div className={styles.pageContent}>
        {children}
      </div>
    </div>
  );
}

/**
 * Skeleton list with multiple items.
 */
export function SkeletonList({
  count = 5,
  ItemComponent = SkeletonDigestItem,
  className = "",
}: {
  count?: number;
  ItemComponent?: React.ComponentType<{ className?: string }>;
  className?: string;
}) {
  return (
    <div className={`${styles.list} ${className}`} role="status" aria-busy="true">
      {Array.from({ length: count }).map((_, i) => (
        <ItemComponent key={i} />
      ))}
    </div>
  );
}
