"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
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

// Helper functions for display
function getDisplayTitle(item: {
  title: string | null;
  author: string | null;
  sourceType: string;
}): string {
  // For X posts without title, show @author as primary
  if (item.sourceType === "x_posts" && !item.title) {
    if (item.author) {
      // Ensure @ prefix, avoid double @
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
  const { data: queueData } = useDeepDiveQueue();
  const { data: promotedData } = useDeepDivePromoted();

  const queueCount = queueData?.items?.length ?? 0;
  const promotedCount = promotedData?.items?.length ?? 0;

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
          {queueCount > 0 && <span className={styles.tabBadge}>{queueCount}</span>}
        </button>
        <button
          type="button"
          className={`${styles.tab} ${activeTab === "promoted" ? styles.tabActive : ""}`}
          onClick={() => setActiveTab("promoted")}
        >
          {t("deepDive.tabs.promoted")}
          {promotedCount > 0 && <span className={styles.tabBadge}>{promotedCount}</span>}
        </button>
      </div>

      {activeTab === "queue" ? <QueueView /> : <PromotedView />}
    </div>
  );
}

function QueueView() {
  const { data, isLoading, isError, refetch } = useDeepDiveQueue();
  const items = data?.items ?? [];

  // State for master-detail pattern
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [pastedTexts, setPastedTexts] = useState<Record<string, string>>({});
  const [summaries, setSummaries] = useState<Record<string, ManualSummaryOutput>>({});

  // Auto-select first item when list loads
  useEffect(() => {
    if (items.length > 0 && !selectedItemId) {
      setSelectedItemId(items[0].id);
    }
  }, [items, selectedItemId]);

  // Clear selection when selected item is removed (after decision)
  useEffect(() => {
    if (selectedItemId && !items.find((item) => item.id === selectedItemId)) {
      // Select next item or first item
      setSelectedItemId(items.length > 0 ? items[0].id : null);
    }
  }, [items, selectedItemId]);

  const selectedItem = items.find((item) => item.id === selectedItemId) ?? null;

  const handlePastedTextChange = useCallback((itemId: string, text: string) => {
    setPastedTexts((prev) => ({ ...prev, [itemId]: text }));
  }, []);

  const handleSummaryGenerated = useCallback((itemId: string, summary: ManualSummaryOutput) => {
    setSummaries((prev) => ({ ...prev, [itemId]: summary }));
  }, []);

  const handleDecisionMade = useCallback(
    (itemId: string) => {
      // Clear state for this item
      setPastedTexts((prev) => {
        const next = { ...prev };
        delete next[itemId];
        return next;
      });
      setSummaries((prev) => {
        const next = { ...prev };
        delete next[itemId];
        return next;
      });
      refetch();
    },
    [refetch],
  );

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
    <div className={styles.masterDetailLayout}>
      {/* Master Panel (Left) */}
      <div className={styles.masterPanel}>
        <div className={styles.masterPanelHeader}>
          <span>Items to review</span>
          <span className={styles.masterPanelCount}>{items.length}</span>
        </div>
        <div className={styles.masterList}>
          {items.map((item) => (
            <QueueListItem
              key={item.id}
              item={item}
              isSelected={item.id === selectedItemId}
              onSelect={() => setSelectedItemId(item.id)}
            />
          ))}
        </div>
      </div>

      {/* Detail Panel (Right) */}
      {selectedItem ? (
        <QueueDetailPanel
          item={selectedItem}
          pastedText={pastedTexts[selectedItem.id] ?? ""}
          summary={summaries[selectedItem.id] ?? null}
          onPastedTextChange={(text) => handlePastedTextChange(selectedItem.id, text)}
          onSummaryGenerated={(summary) => handleSummaryGenerated(selectedItem.id, summary)}
          onDecisionMade={() => handleDecisionMade(selectedItem.id)}
        />
      ) : (
        <div className={styles.detailPanelEmpty}>
          <p>Select an item from the list to review</p>
        </div>
      )}
    </div>
  );
}

function QueueListItem({
  item,
  isSelected,
  onSelect,
}: {
  item: DeepDiveQueueItem;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={`${styles.listItem} ${isSelected ? styles.listItemSelected : ""}`}
      onClick={onSelect}
    >
      <div className={styles.listItemContent}>
        <span className={styles.listItemTitle}>{getDisplayTitle(item)}</span>
        <div className={styles.listItemMeta}>
          <span
            className={styles.sourceBadge}
            style={{ "--source-color": getSourceColor(item.sourceType) } as React.CSSProperties}
          >
            {formatSourceType(item.sourceType)}
          </span>
          {item.author && item.sourceType !== "x_posts" && (
            <span className={styles.listItemAuthor}>{item.author}</span>
          )}
          <span className={styles.listItemTime}>{formatRelativeTime(item.likedAt)}</span>
        </div>
      </div>
    </button>
  );
}

function QueueDetailPanel({
  item,
  pastedText,
  summary,
  onPastedTextChange,
  onSummaryGenerated,
  onDecisionMade,
}: {
  item: DeepDiveQueueItem;
  pastedText: string;
  summary: ManualSummaryOutput | null;
  onPastedTextChange: (text: string) => void;
  onSummaryGenerated: (summary: ManualSummaryOutput) => void;
  onDecisionMade: () => void;
}) {
  const { addToast } = useToast();
  const [error, setError] = useState<string | null>(null);

  const previewMutation = useDeepDivePreview();
  const decisionMutation = useDeepDiveDecision({ onSuccess: onDecisionMade });

  const charCount = pastedText.length;
  const isOverLimit = charCount > MAX_CHARS;
  const canSummarize = charCount > 0 && !isOverLimit && !previewMutation.isPending;

  const handleSummarize = useCallback(async () => {
    setError(null);
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
      onSummaryGenerated(result.summary);
    } catch (err) {
      const apiError = err as { error?: { code?: string; message?: string } };
      if (apiError?.error?.code === "INSUFFICIENT_CREDITS") {
        setError(t("deepDive.insufficientCredits"));
      } else {
        setError(apiError?.error?.message || "Failed to generate summary. Please try again.");
      }
    }
  }, [previewMutation, item, pastedText, onSummaryGenerated]);

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

  // For X posts without title, we use @author as the title, so don't duplicate it in meta
  const showAuthorInMeta = item.author && !(item.sourceType === "x_posts" && !item.title);

  return (
    <div className={styles.detailPanel}>
      {/* Header */}
      <div className={styles.detailHeader}>
        <h3 className={styles.detailTitle}>
          {item.url ? (
            <a href={item.url} target="_blank" rel="noopener noreferrer">
              {getDisplayTitle(item)}
            </a>
          ) : (
            getDisplayTitle(item)
          )}
        </h3>
        <div className={styles.detailMeta}>
          <span
            className={styles.detailSourceBadge}
            style={{ "--source-color": getSourceColor(item.sourceType) } as React.CSSProperties}
          >
            {formatSourceType(item.sourceType)}
          </span>
          {showAuthorInMeta && <span>·</span>}
          {showAuthorInMeta && <span>{item.author}</span>}
          <span>·</span>
          <span>Liked {formatRelativeTime(item.likedAt)}</span>
        </div>
        {/* Show body text preview for items (especially X posts) */}
        {item.bodyText && <p className={styles.detailBodyPreview}>{item.bodyText}</p>}
      </div>

      {!summary ? (
        <>
          {/* Inline error */}
          {error && <div className={styles.errorInline}>{error}</div>}

          {/* Paste section */}
          <div className={styles.pasteSection}>
            <textarea
              className={`${styles.pasteArea} ${isOverLimit ? styles.pasteAreaError : ""}`}
              placeholder={t("deepDive.paste.placeholder")}
              value={pastedText}
              onChange={(e) => {
                onPastedTextChange(e.target.value);
                if (error) setError(null);
              }}
              disabled={previewMutation.isPending}
            />
            <div className={styles.pasteFooter}>
              <span className={`${styles.charCount} ${isOverLimit ? styles.charCountError : ""}`}>
                {charCount.toLocaleString()} / 60,000
              </span>
              <p className={styles.pasteWarning}>{t("deepDive.paste.warning")}</p>
            </div>
          </div>

          {/* Actions */}
          <div className={styles.detailActions}>
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
              {getDisplayTitle(item)}
            </a>
          ) : (
            getDisplayTitle(item)
          )}
        </h3>
        <div className={styles.itemMeta}>
          <span
            className={styles.sourceType}
            style={{ "--source-color": getSourceColor(item.sourceType) } as React.CSSProperties}
          >
            {formatSourceType(item.sourceType)}
          </span>
          {item.author && <span className={styles.author}>{item.author}</span>}
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
