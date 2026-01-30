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
};

const LAYOUT_TOOLTIPS: Record<Layout, string> = {
  condensed: "Dense list view - see more items at once",
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
  // Only condensed layout is supported
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
