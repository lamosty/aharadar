"use client";

import { Tooltip } from "@/components/Tooltip";
import { t } from "@/lib/i18n";
import { LAYOUTS, type Layout } from "@/lib/theme";
import styles from "./LayoutToggle.module.css";

interface LayoutToggleProps {
  layout: Layout;
  onLayoutChange: (layout: Layout) => void;
  hasOverride?: boolean;
  onResetToGlobal?: () => void;
  size?: "sm" | "md";
}

const LAYOUT_LABELS: Record<Layout, string> = {
  condensed: "Condensed",
  reader: "Reader",
  timeline: "Timeline",
};

const LAYOUT_TOOLTIPS: Record<Layout, string> = {
  condensed: "Dense list view - see more items at once",
  reader: "Card view - comfortable reading",
  timeline: "Visual timeline - media-focused",
};

export function LayoutToggle({
  layout,
  onLayoutChange,
  hasOverride = false,
  onResetToGlobal,
  size = "md",
}: LayoutToggleProps) {
  return (
    <div
      className={`${styles.container} ${styles[size]}`}
      role="radiogroup"
      aria-label={t("feed.layout.toggle")}
    >
      {LAYOUTS.map((l) => (
        <Tooltip key={l} content={LAYOUT_TOOLTIPS[l]}>
          <button
            type="button"
            role="radio"
            aria-checked={layout === l}
            className={`${styles.button} ${layout === l ? styles.active : ""}`}
            onClick={() => onLayoutChange(l)}
          >
            <LayoutIcon layout={l} />
            <span className={styles.buttonLabel}>{LAYOUT_LABELS[l]}</span>
          </button>
        </Tooltip>
      ))}

      {/* Override indicator with reset option */}
      {hasOverride && onResetToGlobal && (
        <Tooltip content="Reset to global default">
          <button
            type="button"
            className={styles.resetButton}
            onClick={onResetToGlobal}
            aria-label="Reset to global default"
          >
            <ResetIcon />
          </button>
        </Tooltip>
      )}
    </div>
  );
}

interface LayoutIconProps {
  layout: Layout;
}

function LayoutIcon({ layout }: LayoutIconProps) {
  switch (layout) {
    case "condensed":
      return (
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden="true"
        >
          {/* Three horizontal lines - compact list */}
          <line x1="2" y1="4" x2="14" y2="4" />
          <line x1="2" y1="8" x2="14" y2="8" />
          <line x1="2" y1="12" x2="14" y2="12" />
        </svg>
      );
    case "reader":
      return (
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden="true"
        >
          {/* Card/rectangle shapes */}
          <rect x="2" y="2" width="12" height="5" rx="1" />
          <rect x="2" y="9" width="12" height="5" rx="1" />
        </svg>
      );
    case "timeline":
      return (
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden="true"
        >
          {/* Timeline with dots */}
          <line x1="4" y1="2" x2="4" y2="14" />
          <circle cx="4" cy="4" r="2" fill="currentColor" />
          <circle cx="4" cy="10" r="2" fill="currentColor" />
          <line x1="7" y1="4" x2="14" y2="4" />
          <line x1="7" y1="10" x2="14" y2="10" />
        </svg>
      );
  }
}

function ResetIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <path d="M2 8a6 6 0 1 1 1.5 4" />
      <polyline points="2 4 2 8 6 8" />
    </svg>
  );
}
