"use client";

import type { AggregateSummary } from "@/lib/api";
import { t } from "@/lib/i18n";
import styles from "./AggregateSummaryPanel.module.css";

interface SummaryOutput {
  one_liner?: string;
  overview?: string;
  sentiment?: {
    label?: string;
    confidence?: number;
    rationale?: string;
  };
  themes?: Array<{
    title?: string;
    summary?: string;
    item_ids?: string[]; // LLM schema uses item_ids array, not item_count
  }>;
  notable_items?: Array<{
    item_id?: string;
    why?: string;
  }>;
  open_questions?: string[];
  suggested_followups?: string[];
  [key: string]: unknown;
}

interface AggregateSummaryPanelProps {
  summary: AggregateSummary;
  isLoading?: boolean;
}

export function AggregateSummaryPanel({ summary, isLoading }: AggregateSummaryPanelProps) {
  if (isLoading) {
    return (
      <div className={styles.panel}>
        <div className={styles.skeleton} style={{ height: "200px" }} />
      </div>
    );
  }

  if (summary.status === "error") {
    return (
      <div className={styles.panel}>
        <div className={styles.errorState}>
          <div className={styles.errorIcon}>!</div>
          <h3 className={styles.errorTitle}>{t("summaries.error.title")}</h3>
          <p className={styles.errorMessage}>
            {summary.error_message || t("summaries.error.message")}
          </p>
        </div>
      </div>
    );
  }

  if (summary.status === "skipped") {
    return (
      <div className={styles.panel}>
        <div className={styles.skippedState}>
          <h3 className={styles.skippedTitle}>{t("summaries.skipped.title")}</h3>
          <p className={styles.skippedMessage}>
            {summary.error_message || t("summaries.skipped.message")}
          </p>
        </div>
      </div>
    );
  }

  const summaryJson = summary.summary_json as SummaryOutput | null;

  // Show pending state when summary is still being generated
  if (summary.status === "pending" || !summaryJson) {
    return (
      <div className={styles.panel}>
        <div className={styles.pendingState}>
          <div className={styles.spinner} />
          <p>{t("summaries.pending.message")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.panel}>
      {/* One-liner */}
      {summaryJson.one_liner && (
        <div className={styles.oneLiner}>
          <p>{summaryJson.one_liner}</p>
        </div>
      )}

      {/* Overview */}
      {summaryJson.overview && (
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>{t("summaries.overview")}</h3>
          <p className={styles.overview}>{summaryJson.overview}</p>
        </section>
      )}

      {/* Sentiment */}
      {summaryJson.sentiment && (
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>{t("summaries.sentiment")}</h3>
          <div className={styles.sentimentCard}>
            <div className={styles.sentimentLabel}>
              <span className={styles.label}>{summaryJson.sentiment.label || "Neutral"}</span>
              {summaryJson.sentiment.confidence !== undefined && (
                <span className={styles.confidence}>
                  {Math.round(summaryJson.sentiment.confidence * 100)}%
                </span>
              )}
            </div>
            {summaryJson.sentiment.rationale && (
              <p className={styles.rationale}>{summaryJson.sentiment.rationale}</p>
            )}
          </div>
        </section>
      )}

      {/* Themes */}
      {summaryJson.themes && summaryJson.themes.length > 0 && (
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>{t("summaries.themes")}</h3>
          <div className={styles.themesList}>
            {summaryJson.themes.map((theme, idx) => {
              const itemCount = theme.item_ids?.length ?? 0;
              return (
                <details key={idx} className={styles.themeItem}>
                  <summary className={styles.themeSummary}>
                    <span className={styles.themeTitle}>{theme.title || "Theme"}</span>
                    {itemCount > 0 && (
                      <span className={styles.itemCount}>
                        {itemCount} {itemCount === 1 ? t("summaries.item") : t("summaries.items")}
                      </span>
                    )}
                  </summary>
                  {theme.summary && <p className={styles.themeSummaryText}>{theme.summary}</p>}
                </details>
              );
            })}
          </div>
        </section>
      )}

      {/* Notable Items */}
      {summaryJson.notable_items && summaryJson.notable_items.length > 0 && (
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>{t("summaries.notableItems")}</h3>
          <div className={styles.notableItemsList}>
            {summaryJson.notable_items.map((item, idx) => (
              <div key={idx} className={styles.notableItem}>
                {item.item_id && (
                  <span className={styles.itemId}>Item {item.item_id.slice(0, 8)}</span>
                )}
                {item.why && <p className={styles.itemWhy}>{item.why}</p>}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Open Questions */}
      {summaryJson.open_questions && summaryJson.open_questions.length > 0 && (
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>{t("summaries.openQuestions")}</h3>
          <ul className={styles.bulletList}>
            {summaryJson.open_questions.map((question, idx) => (
              <li key={idx}>{question}</li>
            ))}
          </ul>
        </section>
      )}

      {/* Suggested Followups */}
      {summaryJson.suggested_followups && summaryJson.suggested_followups.length > 0 && (
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>{t("summaries.suggestedFollowups")}</h3>
          <ul className={styles.bulletList}>
            {summaryJson.suggested_followups.map((followup, idx) => (
              <li key={idx}>{followup}</li>
            ))}
          </ul>
        </section>
      )}

      {/* Footer with metadata */}
      <div className={styles.footer}>
        <span className={styles.metadata}>
          {summary.input_item_count && (
            <>
              {summary.input_item_count}{" "}
              {summary.input_item_count === 1 ? t("summaries.item") : t("summaries.items")}
            </>
          )}
          {summary.input_tokens && <> — {summary.input_tokens} input tokens</>}
          {summary.output_tokens && <> — {summary.output_tokens} output tokens</>}
        </span>
      </div>
    </div>
  );
}
