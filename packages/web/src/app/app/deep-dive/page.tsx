"use client";

import { Suspense, useCallback, useState } from "react";
import { useToast } from "@/components/Toast";
import type { DeepDivePromotedItem, DeepDiveQueueItem, ManualSummaryOutput } from "@/lib/api";
import {
  useDeepDiveDecision,
  useDeepDivePreview,
  useDeepDivePromoted,
  useDeepDiveQueue,
} from "@/lib/hooks";
import { t } from "@/lib/i18n";
import styles from "./page.module.css";

const MAX_CHARS = 60000;

export default function DeepDivePage() {
  return (
    <Suspense fallback={<DeepDivePageSkeleton />}>
      <DeepDivePageContent />
    </Suspense>
  );
}

function DeepDivePageSkeleton() {
  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>{t("deepDive.title")}</h1>
        <p className={styles.subtitle}>{t("deepDive.subtitle")}</p>
      </header>
      <div className={styles.skeleton}>Loading...</div>
    </div>
  );
}

function DeepDivePageContent() {
  const [activeTab, setActiveTab] = useState<"queue" | "promoted">("queue");

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>{t("deepDive.title")}</h1>
        <p className={styles.subtitle}>{t("deepDive.subtitle")}</p>
      </header>

      <div className={styles.tabs}>
        <button
          type="button"
          className={`${styles.tab} ${activeTab === "queue" ? styles.tabActive : ""}`}
          onClick={() => setActiveTab("queue")}
        >
          {t("deepDive.tabs.queue")}
        </button>
        <button
          type="button"
          className={`${styles.tab} ${activeTab === "promoted" ? styles.tabActive : ""}`}
          onClick={() => setActiveTab("promoted")}
        >
          {t("deepDive.tabs.promoted")}
        </button>
      </div>

      {activeTab === "queue" ? <QueueView /> : <PromotedView />}
    </div>
  );
}

function QueueView() {
  const { data, isLoading, isError, refetch } = useDeepDiveQueue();
  const items = data?.items ?? [];

  if (isLoading) {
    return <div className={styles.loadingState}>Loading...</div>;
  }

  if (isError) {
    return (
      <div className={styles.errorState}>
        <p>Failed to load queue</p>
        <button className="btn btn-secondary" onClick={() => refetch()}>
          Retry
        </button>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className={styles.emptyState}>
        <p className={styles.emptyTitle}>{t("deepDive.queue.empty")}</p>
        <p className={styles.emptyDescription}>{t("deepDive.queue.emptyDescription")}</p>
      </div>
    );
  }

  return (
    <div className={styles.queueList}>
      {items.map((item) => (
        <QueueItemCard key={item.id} item={item} onDecisionMade={refetch} />
      ))}
    </div>
  );
}

function QueueItemCard({
  item,
  onDecisionMade,
}: {
  item: DeepDiveQueueItem;
  onDecisionMade: () => void;
}) {
  const { addToast } = useToast();
  const [pastedText, setPastedText] = useState("");
  const [summary, setSummary] = useState<ManualSummaryOutput | null>(null);

  const previewMutation = useDeepDivePreview();
  const decisionMutation = useDeepDiveDecision({ onSuccess: onDecisionMade });

  const charCount = pastedText.length;
  const isOverLimit = charCount > MAX_CHARS;
  const canSummarize = charCount > 0 && !isOverLimit && !previewMutation.isPending;

  const handleSummarize = useCallback(async () => {
    try {
      const result = await previewMutation.mutateAsync({
        contentItemId: item.id,
        pastedText,
        metadata: {
          title: item.title ?? undefined,
          author: item.author ?? undefined,
          url: item.url ?? undefined,
          sourceType: item.sourceType,
        },
      });
      setSummary(result.summary);
    } catch (err) {
      const error = err as { error?: { code?: string } };
      if (error?.error?.code === "INSUFFICIENT_CREDITS") {
        addToast(t("deepDive.insufficientCredits"), "error");
      } else {
        addToast("Failed to generate summary", "error");
      }
    }
  }, [previewMutation, item, pastedText, addToast]);

  const handlePromote = useCallback(async () => {
    if (!summary) return;
    try {
      await decisionMutation.mutateAsync({
        contentItemId: item.id,
        decision: "promote",
        summaryJson: summary,
      });
      addToast("Summary promoted!", "success");
    } catch {
      addToast("Failed to promote", "error");
    }
  }, [decisionMutation, item.id, summary, addToast]);

  const handleDrop = useCallback(async () => {
    try {
      await decisionMutation.mutateAsync({
        contentItemId: item.id,
        decision: "drop",
      });
      addToast("Item dropped", "success");
    } catch {
      addToast("Failed to drop", "error");
    }
  }, [decisionMutation, item.id, addToast]);

  return (
    <div className={styles.queueItem}>
      <div className={styles.itemHeader}>
        <h3 className={styles.itemTitle}>
          {item.url ? (
            <a href={item.url} target="_blank" rel="noopener noreferrer">
              {item.title || "(No title)"}
            </a>
          ) : (
            item.title || "(No title)"
          )}
        </h3>
        <div className={styles.itemMeta}>
          {item.author && <span className={styles.author}>{item.author}</span>}
          <span className={styles.sourceType}>{item.sourceType}</span>
          <span className={styles.likedAt}>Liked {formatRelativeTime(item.likedAt)}</span>
        </div>
      </div>

      {!summary ? (
        <>
          <div className={styles.pasteSection}>
            <label className={styles.pasteLabel}>{t("deepDive.paste.label")}</label>
            <textarea
              className={`${styles.pasteArea} ${isOverLimit ? styles.pasteAreaError : ""}`}
              placeholder={t("deepDive.paste.placeholder")}
              value={pastedText}
              onChange={(e) => setPastedText(e.target.value)}
              rows={8}
            />
            <div className={styles.pasteFooter}>
              <span className={`${styles.charCount} ${isOverLimit ? styles.charCountError : ""}`}>
                {charCount.toLocaleString()} / 60,000
              </span>
              <p className={styles.pasteWarning}>{t("deepDive.paste.warning")}</p>
            </div>
          </div>

          <div className={styles.itemActions}>
            <button className="btn btn-primary" onClick={handleSummarize} disabled={!canSummarize}>
              {previewMutation.isPending ? t("deepDive.summarizing") : t("deepDive.summarize")}
            </button>
            <button
              className="btn btn-secondary"
              onClick={handleDrop}
              disabled={decisionMutation.isPending}
            >
              {t("deepDive.drop")}
            </button>
          </div>
        </>
      ) : (
        <SummaryPreview
          summary={summary}
          onPromote={handlePromote}
          onDrop={handleDrop}
          isPromoting={decisionMutation.isPending}
        />
      )}
    </div>
  );
}

function SummaryPreview({
  summary,
  onPromote,
  onDrop,
  isPromoting,
}: {
  summary: ManualSummaryOutput;
  onPromote: () => void;
  onDrop: () => void;
  isPromoting: boolean;
}) {
  return (
    <div className={styles.summaryPreview}>
      <h4 className={styles.previewTitle}>{t("deepDive.preview.title")}</h4>

      <div className={styles.summarySection}>
        <h5>{t("deepDive.preview.oneLiner")}</h5>
        <p className={styles.oneLiner}>{summary.one_liner}</p>
      </div>

      {summary.bullets.length > 0 && (
        <div className={styles.summarySection}>
          <h5>{t("deepDive.preview.bullets")}</h5>
          <ul className={styles.bulletList}>
            {summary.bullets.map((bullet, i) => (
              <li key={i}>{bullet}</li>
            ))}
          </ul>
        </div>
      )}

      {summary.why_it_matters.length > 0 && (
        <div className={styles.summarySection}>
          <h5>{t("deepDive.preview.whyItMatters")}</h5>
          <ul className={styles.bulletList}>
            {summary.why_it_matters.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      {summary.risks_or_caveats.length > 0 && (
        <div className={styles.summarySection}>
          <h5>{t("deepDive.preview.risksOrCaveats")}</h5>
          <ul className={styles.bulletList}>
            {summary.risks_or_caveats.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      {summary.suggested_followups.length > 0 && (
        <div className={styles.summarySection}>
          <h5>{t("deepDive.preview.suggestedFollowups")}</h5>
          <ul className={styles.bulletList}>
            {summary.suggested_followups.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      <div className={styles.previewActions}>
        <button className="btn btn-primary" onClick={onPromote} disabled={isPromoting}>
          {t("deepDive.promote")}
        </button>
        <button className="btn btn-secondary" onClick={onDrop} disabled={isPromoting}>
          {t("deepDive.drop")}
        </button>
      </div>
    </div>
  );
}

function PromotedView() {
  const { data, isLoading, isError, refetch } = useDeepDivePromoted();
  const items = data?.items ?? [];

  if (isLoading) {
    return <div className={styles.loadingState}>Loading...</div>;
  }

  if (isError) {
    return (
      <div className={styles.errorState}>
        <p>Failed to load promoted items</p>
        <button className="btn btn-secondary" onClick={() => refetch()}>
          Retry
        </button>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className={styles.emptyState}>
        <p className={styles.emptyTitle}>{t("deepDive.promoted.empty")}</p>
        <p className={styles.emptyDescription}>{t("deepDive.promoted.emptyDescription")}</p>
      </div>
    );
  }

  return (
    <div className={styles.promotedList}>
      {items.map((item) => (
        <PromotedItemCard key={item.id} item={item} />
      ))}
    </div>
  );
}

function PromotedItemCard({ item }: { item: DeepDivePromotedItem }) {
  const [expanded, setExpanded] = useState(false);
  const summary = item.summaryJson;

  return (
    <div className={styles.promotedItem}>
      <div className={styles.itemHeader}>
        <h3 className={styles.itemTitle}>
          {item.url ? (
            <a href={item.url} target="_blank" rel="noopener noreferrer">
              {item.title || "(No title)"}
            </a>
          ) : (
            item.title || "(No title)"
          )}
        </h3>
        <div className={styles.itemMeta}>
          {item.author && <span className={styles.author}>{item.author}</span>}
          <span className={styles.sourceType}>{item.sourceType}</span>
          <span className={styles.promotedAt}>Promoted {formatRelativeTime(item.promotedAt)}</span>
        </div>
      </div>

      <p className={styles.oneLiner}>{summary.one_liner}</p>

      <button type="button" className={styles.expandButton} onClick={() => setExpanded(!expanded)}>
        {expanded ? "Hide details" : "Show details"}
      </button>

      {expanded && (
        <div className={styles.expandedSummary}>
          {summary.bullets.length > 0 && (
            <div className={styles.summarySection}>
              <h5>{t("deepDive.preview.bullets")}</h5>
              <ul className={styles.bulletList}>
                {summary.bullets.map((bullet, i) => (
                  <li key={i}>{bullet}</li>
                ))}
              </ul>
            </div>
          )}

          {summary.why_it_matters.length > 0 && (
            <div className={styles.summarySection}>
              <h5>{t("deepDive.preview.whyItMatters")}</h5>
              <ul className={styles.bulletList}>
                {summary.why_it_matters.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>
          )}

          {summary.risks_or_caveats.length > 0 && (
            <div className={styles.summarySection}>
              <h5>{t("deepDive.preview.risksOrCaveats")}</h5>
              <ul className={styles.bulletList}>
                {summary.risks_or_caveats.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>
          )}

          {summary.suggested_followups.length > 0 && (
            <div className={styles.summarySection}>
              <h5>{t("deepDive.preview.suggestedFollowups")}</h5>
              <ul className={styles.bulletList}>
                {summary.suggested_followups.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
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
