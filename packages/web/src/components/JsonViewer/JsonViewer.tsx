"use client";

import { useState, useMemo } from "react";
import styles from "./JsonViewer.module.css";

interface JsonViewerProps {
  /** The JSON data to display */
  data: unknown;
  /** Maximum depth to render (default: 3) */
  maxDepth?: number;
  /** Maximum string length before truncation (default: 200) */
  maxStringLength?: number;
  /** Maximum array items to show (default: 20) */
  maxArrayItems?: number;
  /** Initial collapsed state (default: true) */
  initialCollapsed?: boolean;
  /** Label for the toggle button */
  label?: string;
  /** Accessible label for screen readers */
  ariaLabel?: string;
}

interface JsonNodeProps {
  value: unknown;
  depth: number;
  maxDepth: number;
  maxStringLength: number;
  maxArrayItems: number;
  keyName?: string;
}

function truncateString(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength) + "...";
}

function JsonNode({
  value,
  depth,
  maxDepth,
  maxStringLength,
  maxArrayItems,
  keyName,
}: JsonNodeProps) {
  const [isExpanded, setIsExpanded] = useState(depth < 1);

  const keyPrefix = keyName ? (
    <span className={styles.key}>{keyName}: </span>
  ) : null;

  // Null
  if (value === null) {
    return (
      <div className={styles.node}>
        {keyPrefix}
        <span className={styles.null}>null</span>
      </div>
    );
  }

  // Undefined
  if (value === undefined) {
    return (
      <div className={styles.node}>
        {keyPrefix}
        <span className={styles.undefined}>undefined</span>
      </div>
    );
  }

  // Boolean
  if (typeof value === "boolean") {
    return (
      <div className={styles.node}>
        {keyPrefix}
        <span className={styles.boolean}>{value ? "true" : "false"}</span>
      </div>
    );
  }

  // Number
  if (typeof value === "number") {
    return (
      <div className={styles.node}>
        {keyPrefix}
        <span className={styles.number}>{value}</span>
      </div>
    );
  }

  // String
  if (typeof value === "string") {
    const displayValue = truncateString(value, maxStringLength);
    const isTruncated = value.length > maxStringLength;
    return (
      <div className={styles.node}>
        {keyPrefix}
        <span className={styles.string} title={isTruncated ? value : undefined}>
          &quot;{displayValue}&quot;
        </span>
      </div>
    );
  }

  // Array
  if (Array.isArray(value)) {
    if (depth >= maxDepth) {
      return (
        <div className={styles.node}>
          {keyPrefix}
          <span className={styles.collapsed}>Array[{value.length}]</span>
        </div>
      );
    }

    const itemsToShow = value.slice(0, maxArrayItems);
    const hasMore = value.length > maxArrayItems;

    return (
      <div className={styles.node}>
        <button
          type="button"
          className={styles.toggle}
          onClick={() => setIsExpanded(!isExpanded)}
          aria-expanded={isExpanded}
          aria-label={isExpanded ? "Collapse array" : "Expand array"}
        >
          <span className={styles.toggleIcon}>{isExpanded ? "-" : "+"}</span>
          {keyPrefix}
          <span className={styles.bracket}>[</span>
          {!isExpanded && (
            <span className={styles.preview}>{value.length} items</span>
          )}
        </button>
        {isExpanded && (
          <div className={styles.children}>
            {itemsToShow.map((item, index) => (
              <JsonNode
                key={index}
                value={item}
                depth={depth + 1}
                maxDepth={maxDepth}
                maxStringLength={maxStringLength}
                maxArrayItems={maxArrayItems}
                keyName={String(index)}
              />
            ))}
            {hasMore && (
              <div className={styles.more}>
                ... {value.length - maxArrayItems} more items
              </div>
            )}
          </div>
        )}
        {isExpanded && <span className={styles.bracket}>]</span>}
        {!isExpanded && <span className={styles.bracket}>]</span>}
      </div>
    );
  }

  // Object
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);

    if (depth >= maxDepth) {
      return (
        <div className={styles.node}>
          {keyPrefix}
          <span className={styles.collapsed}>
            {"{"} {entries.length} keys {"}"}
          </span>
        </div>
      );
    }

    return (
      <div className={styles.node}>
        <button
          type="button"
          className={styles.toggle}
          onClick={() => setIsExpanded(!isExpanded)}
          aria-expanded={isExpanded}
          aria-label={isExpanded ? "Collapse object" : "Expand object"}
        >
          <span className={styles.toggleIcon}>{isExpanded ? "-" : "+"}</span>
          {keyPrefix}
          <span className={styles.bracket}>{"{"}</span>
          {!isExpanded && (
            <span className={styles.preview}>{entries.length} keys</span>
          )}
        </button>
        {isExpanded && (
          <div className={styles.children}>
            {entries.map(([key, val]) => (
              <JsonNode
                key={key}
                value={val}
                depth={depth + 1}
                maxDepth={maxDepth}
                maxStringLength={maxStringLength}
                maxArrayItems={maxArrayItems}
                keyName={key}
              />
            ))}
          </div>
        )}
        {isExpanded && <span className={styles.bracket}>{"}"}</span>}
        {!isExpanded && <span className={styles.bracket}>{"}"}</span>}
      </div>
    );
  }

  // Fallback for any other type
  return (
    <div className={styles.node}>
      {keyPrefix}
      <span className={styles.unknown}>{String(value)}</span>
    </div>
  );
}

export function JsonViewer({
  data,
  maxDepth = 3,
  maxStringLength = 200,
  maxArrayItems = 20,
  initialCollapsed = true,
  label = "JSON Data",
  ariaLabel,
}: JsonViewerProps) {
  const [isCollapsed, setIsCollapsed] = useState(initialCollapsed);

  // Memoize stringified JSON for raw view fallback
  const formattedJson = useMemo(() => {
    try {
      return JSON.stringify(data, null, 2);
    } catch {
      return "Unable to serialize data";
    }
  }, [data]);

  // Check if data is empty or null
  const isEmpty = data === null || data === undefined ||
    (typeof data === "object" && Object.keys(data as object).length === 0);

  if (isEmpty) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <span className={styles.label}>{label}</span>
        </div>
        <div className={styles.empty}>No metadata available</div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <button
        type="button"
        className={styles.headerButton}
        onClick={() => setIsCollapsed(!isCollapsed)}
        aria-expanded={!isCollapsed}
        aria-label={ariaLabel || `${isCollapsed ? "Show" : "Hide"} ${label}`}
      >
        <ChevronIcon expanded={!isCollapsed} />
        <span className={styles.label}>{label}</span>
      </button>

      {!isCollapsed && (
        <div className={styles.content} role="region" aria-label={label}>
          <div className={styles.viewer}>
            <JsonNode
              value={data}
              depth={0}
              maxDepth={maxDepth}
              maxStringLength={maxStringLength}
              maxArrayItems={maxArrayItems}
            />
          </div>
          <details className={styles.rawDetails}>
            <summary className={styles.rawSummary}>Raw JSON</summary>
            <pre className={styles.raw}>{formattedJson}</pre>
          </details>
        </div>
      )}
    </div>
  );
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      className={`${styles.chevron} ${expanded ? styles.chevronExpanded : ""}`}
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 4l4 4-4 4" />
    </svg>
  );
}

export default JsonViewer;
