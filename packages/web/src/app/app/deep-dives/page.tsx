"use client";

import { Suspense, useState } from "react";
import type { DeepDivePromotedItem } from "@/lib/api";
import { useDeepDivePromoted } from "@/lib/hooks";
import { t } from "@/lib/i18n";
import styles from "./page.module.css";

// Helper functions for display
function getDisplayTitle(item: {
  title: string | null;
  author: string | null;
  sourceType: string;
}): string {
  if (item.sourceType === "x_posts" && !item.title) {
    if (item.author) {
      return item.author.startsWith("@") ? item.author : `@${item.author}`;
    }
    return "X post";
  }
  return item.title || "(No title)";
}

function formatSourceType(type: string): string {
  const labels: Record<string, string> = {
    hn: "HN",
    reddit: "Reddit",
    rss: "RSS",
    youtube: "YouTube",
    x_posts: "X",
    signal: "Signal",
  };
  return labels[type] || type.toUpperCase();
}

function getSourceColor(type: string): string {
  const colors: Record<string, string> = {
    hn: "var(--color-warning)",
    reddit: "#ff4500",
    rss: "var(--color-primary)",
    youtube: "#ff0000",
    x_posts: "var(--color-text-primary)",
    signal: "var(--color-success)",
  };
  return colors[type] || "var(--color-text-muted)";
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

export default function DeepDivesPage() {
  return (
    <Suspense fallback={<DeepDivesPageSkeleton />}>
      <DeepDivesPageContent />
    </Suspense>
  );
}

function DeepDivesPageSkeleton() {
  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>Deep Dives</h1>
        <p className={styles.subtitle}>Your saved research with AI-generated summaries</p>
      </header>
      <div className={styles.loadingState}>Loading...</div>
    </div>
  );
}

function DeepDivesPageContent() {
  const { data, isLoading, isError, refetch } = useDeepDivePromoted();
  const items = data?.items ?? [];

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>Deep Dives</h1>
        <p className={styles.subtitle}>Your saved research with AI-generated summaries</p>
      </header>

      {isLoading && <div className={styles.loadingState}>Loading...</div>}

      {isError && (
        <div className={styles.errorState}>
          <p className={styles.errorTitle}>Failed to load items</p>
          <button className="btn btn-secondary" onClick={() => refetch()}>
            Try again
          </button>
        </div>
      )}

      {!isLoading && !isError && items.length === 0 && (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>
            <BookmarkIcon />
          </div>
          <p className={styles.emptyTitle}>{t("deepDive.promoted.empty")}</p>
          <p className={styles.emptyDescription}>{t("deepDive.promoted.emptyDescription")}</p>
        </div>
      )}

      {!isLoading && !isError && items.length > 0 && (
        <div className={styles.itemList}>
          {items.map((item) => (
            <DeepDiveCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

function DeepDiveCard({ item }: { item: DeepDivePromotedItem }) {
  const [expanded, setExpanded] = useState(false);
  const summary = item.summaryJson;

  return (
    <article className={styles.card}>
      <div className={styles.cardHeader}>
        <div className={styles.cardMeta}>
          <span
            className={styles.sourceBadge}
            style={{ backgroundColor: getSourceColor(item.sourceType) }}
          >
            {formatSourceType(item.sourceType)}
          </span>
          {item.author && (
            <span className={styles.author}>
              {item.author.startsWith("@") ? item.author : `@${item.author}`}
            </span>
          )}
          <span className={styles.savedAt}>Saved {formatRelativeTime(item.promotedAt)}</span>
        </div>
        <h2 className={styles.cardTitle}>
          {item.url ? (
            <a href={item.url} target="_blank" rel="noopener noreferrer">
              {getDisplayTitle(item)}
            </a>
          ) : (
            getDisplayTitle(item)
          )}
        </h2>
      </div>

      <p className={styles.oneLiner}>{summary.one_liner}</p>

      <button
        type="button"
        className={styles.expandButton}
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
      >
        {expanded ? "Hide details" : "Show details"}
        <ChevronIcon expanded={expanded} />
      </button>

      {expanded && (
        <div className={styles.expandedContent}>
          {summary.bullets.length > 0 && (
            <div className={styles.section}>
              <h5 className={styles.sectionTitle}>{t("deepDive.preview.bullets")}</h5>
              <ul className={styles.bulletList}>
                {summary.bullets.map((bullet, i) => (
                  <li key={i}>{bullet}</li>
                ))}
              </ul>
            </div>
          )}

          {summary.why_it_matters.length > 0 && (
            <div className={styles.section}>
              <h5 className={styles.sectionTitle}>{t("deepDive.preview.whyItMatters")}</h5>
              <ul className={styles.bulletList}>
                {summary.why_it_matters.map((matter, i) => (
                  <li key={i}>{matter}</li>
                ))}
              </ul>
            </div>
          )}

          {summary.risks_or_caveats.length > 0 && (
            <div className={styles.section}>
              <h5 className={styles.sectionTitle}>{t("deepDive.preview.risksOrCaveats")}</h5>
              <ul className={styles.bulletList}>
                {summary.risks_or_caveats.map((risk, i) => (
                  <li key={i}>{risk}</li>
                ))}
              </ul>
            </div>
          )}

          {summary.suggested_followups.length > 0 && (
            <div className={styles.section}>
              <h5 className={styles.sectionTitle}>{t("deepDive.preview.suggestedFollowups")}</h5>
              <ul className={styles.bulletList}>
                {summary.suggested_followups.map((followup, i) => (
                  <li key={i}>{followup}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </article>
  );
}

function BookmarkIcon() {
  return (
    <svg
      width="48"
      height="48"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
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
      style={{
        transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
        transition: "transform 0.2s ease",
      }}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}
