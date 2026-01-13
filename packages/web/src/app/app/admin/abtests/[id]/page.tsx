"use client";

import Link from "next/link";
import { use } from "react";
import { useToast } from "@/components/Toast";
import type { AbtestItem, AbtestResult, AbtestRunStatus, AbtestVariant } from "@/lib/api";
import { useAdminAbtest } from "@/lib/hooks";
import { t } from "@/lib/i18n";
import styles from "./page.module.css";

interface PageProps {
  params: Promise<{ id: string }>;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "-";
  const date = new Date(dateStr);
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatWindow(start: string, end: string): string {
  const startDate = new Date(start);
  const endDate = new Date(end);
  return `${startDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })} - ${endDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
}

function getStatusClass(status: AbtestRunStatus): string {
  switch (status) {
    case "pending":
      return styles.statusPending;
    case "running":
      return styles.statusRunning;
    case "completed":
      return styles.statusCompleted;
    case "failed":
      return styles.statusFailed;
    default:
      return styles.statusPending;
  }
}

interface ResultsByItem {
  [itemId: string]: {
    [variantId: string]: AbtestResult;
  };
}

function organizeResults(results: AbtestResult[]): ResultsByItem {
  const organized: ResultsByItem = {};
  for (const result of results) {
    if (!organized[result.abtestItemId]) {
      organized[result.abtestItemId] = {};
    }
    organized[result.abtestItemId][result.variantId] = result;
  }
  return organized;
}

export default function AbtestDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const { addToast } = useToast();
  const { data, isLoading, isError, error } = useAdminAbtest(id, {
    refetchInterval: (query) => {
      // Poll every 5 seconds if run is pending or running
      const run = query.state.data?.run;
      if (run && (run.status === "pending" || run.status === "running")) {
        return 5000;
      }
      return false;
    },
  });

  const handleCopyJson = async (result: AbtestResult) => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(result.triage, null, 2));
      addToast(t("admin.abtests.detail.jsonCopied"), "success");
    } catch {
      addToast(t("common.error"), "error");
    }
  };

  if (isLoading) {
    return (
      <div className={styles.page}>
        <header className={styles.header}>
          <Link href="/app/admin/abtests" className={styles.backLink}>
            <BackIcon />
            <span>{t("common.back")}</span>
          </Link>
          <h1 className={styles.title}>{t("admin.abtests.detail.title")}</h1>
        </header>
        <div className={`${styles.skeleton} ${styles.skeletonCard}`} />
        <div
          className={`${styles.skeleton} ${styles.skeletonTable}`}
          style={{ marginTop: "var(--space-6)" }}
        />
      </div>
    );
  }

  if (isError) {
    return (
      <div className={styles.page}>
        <header className={styles.header}>
          <Link href="/app/admin/abtests" className={styles.backLink}>
            <BackIcon />
            <span>{t("common.back")}</span>
          </Link>
          <h1 className={styles.title}>{t("admin.abtests.detail.title")}</h1>
        </header>
        <div className={styles.error} role="alert">
          <ErrorIcon />
          <span>{error?.message || t("common.error")}</span>
        </div>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const { run, variants, items, results } = data;
  const resultsByItem = organizeResults(results);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/app/admin/abtests" className={styles.backLink}>
          <BackIcon />
          <span>{t("common.back")}</span>
        </Link>
        <h1 className={styles.title}>{t("admin.abtests.detail.title")}</h1>
      </header>

      {/* Run info card */}
      <div className={styles.runInfoCard}>
        <div className={styles.runInfoHeader}>
          <h2 className={styles.runInfoTitle}>{t("admin.abtests.detail.runInfo")}</h2>
          <span className={`${styles.statusBadge} ${getStatusClass(run.status)}`}>
            {t(`admin.abtests.status.${run.status}` as Parameters<typeof t>[0])}
          </span>
        </div>
        <div className={styles.runInfoGrid}>
          <div className={styles.runInfoItem}>
            <span className={styles.runInfoLabel}>{t("admin.abtests.detail.window")}</span>
            <span className={styles.runInfoValue}>
              {formatWindow(run.windowStart, run.windowEnd)}
            </span>
          </div>
          <div className={styles.runInfoItem}>
            <span className={styles.runInfoLabel}>{t("admin.abtests.detail.created")}</span>
            <span className={styles.runInfoValue}>{formatDate(run.createdAt)}</span>
          </div>
          <div className={styles.runInfoItem}>
            <span className={styles.runInfoLabel}>{t("admin.abtests.detail.started")}</span>
            <span className={styles.runInfoValue}>{formatDate(run.startedAt)}</span>
          </div>
          <div className={styles.runInfoItem}>
            <span className={styles.runInfoLabel}>{t("admin.abtests.detail.completed")}</span>
            <span className={styles.runInfoValue}>{formatDate(run.completedAt)}</span>
          </div>
        </div>
      </div>

      {/* Variants */}
      <div className={styles.variantsSection}>
        <h3 className={styles.sectionTitle}>{t("admin.abtests.detail.variants")}</h3>
        <div className={styles.variantsList}>
          {variants.map((variant) => (
            <div key={variant.id} className={styles.variantTag}>
              <span className={styles.variantName}>{variant.name}</span>
              <span className={styles.variantMeta}>
                {variant.provider} / {variant.model}
                {variant.reasoningEffort && ` (${variant.reasoningEffort})`}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Results table */}
      <div className={styles.resultsSection}>
        <h3 className={styles.sectionTitle}>{t("admin.abtests.detail.results")}</h3>

        {items.length === 0 || results.length === 0 ? (
          <div className={styles.emptyCard}>
            <div className={styles.emptyIcon}>
              <BeakerIcon />
            </div>
            <h3 className={styles.emptyTitle}>{t("admin.abtests.detail.noResults")}</h3>
          </div>
        ) : (
          <div className={styles.resultsTableWrapper}>
            <table className={styles.resultsTable}>
              <thead>
                <tr>
                  <th>{t("admin.abtests.detail.item")}</th>
                  {variants.map((variant) => (
                    <th key={variant.id}>{variant.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td className={styles.itemCell}>
                      <ItemInfo item={item} />
                    </td>
                    {variants.map((variant) => {
                      const result = resultsByItem[item.id]?.[variant.id];
                      return (
                        <td key={variant.id} className={styles.variantCell}>
                          {result ? (
                            <VariantResult
                              result={result}
                              onCopyJson={() => handleCopyJson(result)}
                            />
                          ) : (
                            <span className={styles.variantMeta}>-</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function ItemInfo({ item }: { item: AbtestItem }) {
  const title = item.title || "(Untitled)";
  const meta = [item.sourceType, item.author].filter(Boolean).join(" | ");

  return (
    <div>
      <div className={styles.itemTitle}>
        {item.url ? (
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.itemTitleLink}
          >
            {title}
          </a>
        ) : (
          title
        )}
      </div>
      {meta && <div className={styles.itemMeta}>{meta}</div>}
    </div>
  );
}

interface VariantResultProps {
  result: AbtestResult;
  onCopyJson: () => void;
}

function VariantResult({ result, onCopyJson }: VariantResultProps) {
  if (result.status === "error") {
    return (
      <div className={`${styles.variantResult} ${styles.variantResultError}`}>
        <span className={styles.errorMessage}>{t("admin.abtests.detail.error")}</span>
        <button type="button" onClick={onCopyJson} className={styles.copyButton}>
          <CopyIcon />
          {t("admin.abtests.detail.copyJson")}
        </button>
      </div>
    );
  }

  const triage = result.triage;
  const score = triage?.ai_score ?? 0;
  const reason = triage?.reasoning ?? "";
  const isRelevant = triage?.is_relevant ?? false;
  const isNovel = triage?.is_novel ?? false;
  const shouldDeepSummarize = triage?.should_deep_summarize ?? false;
  const categories = triage?.categories ?? [];

  return (
    <div className={styles.variantResult}>
      <div className={styles.scoreRow}>
        <span className={styles.scoreValue}>{score}</span>
        <div className={styles.scoreBadges}>
          <span
            className={`${styles.badge} ${isRelevant ? styles.badgeRelevant : styles.badgeInactive}`}
            title={t("admin.abtests.detail.relevant")}
          >
            R
          </span>
          <span
            className={`${styles.badge} ${isNovel ? styles.badgeNovel : styles.badgeInactive}`}
            title={t("admin.abtests.detail.novel")}
          >
            N
          </span>
          <span
            className={`${styles.badge} ${shouldDeepSummarize ? styles.badgeDeep : styles.badgeInactive}`}
            title={t("admin.abtests.detail.deepSummarize")}
          >
            D
          </span>
        </div>
      </div>

      {reason && <p className={styles.reasonText}>{reason}</p>}

      {categories.length > 0 && (
        <div className={styles.categoriesList}>
          {categories.slice(0, 3).map((cat) => (
            <span key={cat} className={styles.categoryTag}>
              {cat}
            </span>
          ))}
          {categories.length > 3 && (
            <span className={styles.categoryTag}>+{categories.length - 3}</span>
          )}
        </div>
      )}

      <div className={styles.variantActions}>
        <span className={styles.tokenInfo}>
          {result.inputTokens !== null && result.outputTokens !== null
            ? `${result.inputTokens + result.outputTokens} ${t("admin.abtests.detail.tokens")}`
            : ""}
        </span>
        <button type="button" onClick={onCopyJson} className={styles.copyButton}>
          <CopyIcon />
          {t("admin.abtests.detail.copyJson")}
        </button>
      </div>
    </div>
  );
}

function BackIcon() {
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
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </svg>
  );
}

function BeakerIcon() {
  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4.5 3h15" />
      <path d="M6 3v16a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V3" />
      <path d="M6 14h12" />
    </svg>
  );
}

function ErrorIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}
