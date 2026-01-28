"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo } from "react";
import { FeedbackButtons } from "@/components/FeedbackButtons";
import { useToast } from "@/components/Toast";
import type { CatchupPackItem, CatchupPackOutput, FeedbackAction } from "@/lib/api";
import { ApiError } from "@/lib/api";
import { useCatchupPack, useClearFeedback, useFeedback, useMarkItemRead } from "@/lib/hooks";
import { t } from "@/lib/i18n";
import styles from "./page.module.css";

const DAY_MS = 24 * 60 * 60 * 1000;

function formatRelativeTime(dateStr: string | null): string | null {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function PackDetailPage() {
  const params = useParams<{ id: string }>();
  const packId = params.id;
  const { addToast } = useToast();

  const { data, isLoading, isError, error } = useCatchupPack(packId, {
    refetchInterval: (query) => (query.state.data?.pack.status === "pending" ? 2000 : false),
  });

  const feedbackMutation = useFeedback({
    onError: (err) => {
      addToast(err.message, "error");
    },
  });
  const clearFeedbackMutation = useClearFeedback({
    onError: (err) => {
      addToast(err.message, "error");
    },
  });
  const markReadMutation = useMarkItemRead({
    onError: (err) => {
      addToast(err.message, "error");
    },
  });

  const pack = data?.pack ?? null;
  const summary = pack?.summaryJson ?? null;
  const statusLabels = useMemo(
    () => ({
      pending: t("packs.status.pending"),
      complete: t("packs.status.complete"),
      error: t("packs.status.error"),
      skipped: t("packs.status.skipped"),
    }),
    [t],
  );

  const itemMap = useMemo(() => {
    const map = new Map<string, CatchupPackItem>();
    for (const item of data?.items ?? []) {
      map.set(item.id, item);
    }
    return map;
  }, [data?.items]);

  const scopeInfo = (pack?.metaJson?.scope ?? {}) as {
    since?: string;
    until?: string;
    timeBudgetMinutes?: number;
  };
  const daysRaw =
    scopeInfo.since && scopeInfo.until
      ? Math.round(
          (new Date(scopeInfo.until).getTime() - new Date(scopeInfo.since).getTime()) / DAY_MS,
        )
      : null;
  const days = daysRaw && Number.isFinite(daysRaw) ? Math.max(1, daysRaw) : null;
  const budgetMinutes = scopeInfo.timeBudgetMinutes ?? summary?.time_budget_minutes ?? null;

  const handleFeedback = async (contentItemId: string, action: FeedbackAction) => {
    try {
      await feedbackMutation.mutateAsync({ contentItemId, action });
      markReadMutation.mutate({ contentItemId, packId });
    } catch (err) {
      if (err instanceof ApiError) {
        addToast(err.message, "error");
      }
    }
  };

  const handleClearFeedback = async (contentItemId: string) => {
    try {
      await clearFeedbackMutation.mutateAsync({ contentItemId });
    } catch (err) {
      if (err instanceof ApiError) {
        addToast(err.message, "error");
      }
    }
  };

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.skeletonHeader} />
        <div className={styles.skeletonCard} />
        <div className={styles.skeletonCard} />
      </div>
    );
  }

  if (isError || !pack) {
    return (
      <div className={styles.container}>
        <div className={styles.errorState}>
          <p className={styles.errorTitle}>{t("packs.detailErrorTitle")}</p>
          <p className={styles.errorMessage}>{error?.message || t("common.error")}</p>
          <Link href="/app/packs" className="btn btn-secondary">
            {t("packs.detail.back")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <Link href="/app/packs" className={styles.backLink}>
            ← {t("packs.detail.back")}
          </Link>
          <h1 className={styles.title}>{t("packs.detail.title")}</h1>
          <div className={styles.meta}>
            {budgetMinutes && <span>{t("packs.timeBudget", { minutes: budgetMinutes })}</span>}
            {days && <span>{t("packs.timeframe", { days })}</span>}
            <span>{formatRelativeTime(pack.createdAt)}</span>
          </div>
        </div>
        <span className={styles.statusBadge} data-status={pack.status}>
          {statusLabels[pack.status] ?? pack.status}
        </span>
      </header>

      {pack.status === "pending" && (
        <div className={styles.pendingNotice}>
          <p>{t("packs.status.pending")}…</p>
        </div>
      )}

      {pack.status === "error" && pack.errorMessage && (
        <div className={styles.errorNote}>{pack.errorMessage}</div>
      )}

      {summary && summary.themes.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{t("packs.detail.themes")}</h2>
          <div className={styles.themeGrid}>
            {summary.themes.map((theme) => (
              <div key={theme.title} className={styles.themeCard}>
                <h3 className={styles.themeTitle}>{theme.title}</h3>
                <p className={styles.themeSummary}>{theme.summary}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {summary ? (
        <div className={styles.tiers}>
          <TierSection
            title={t("packs.detail.mustRead")}
            items={summary.tiers.must_read}
            itemMap={itemMap}
            packId={packId}
            onFeedback={handleFeedback}
            onClear={handleClearFeedback}
            onMarkRead={(contentItemId) => markReadMutation.mutate({ contentItemId, packId })}
          />
          <TierSection
            title={t("packs.detail.worthScanning")}
            items={summary.tiers.worth_scanning}
            itemMap={itemMap}
            packId={packId}
            onFeedback={handleFeedback}
            onClear={handleClearFeedback}
            onMarkRead={(contentItemId) => markReadMutation.mutate({ contentItemId, packId })}
          />
          <TierSection
            title={t("packs.detail.headlines")}
            items={summary.tiers.headlines}
            itemMap={itemMap}
            packId={packId}
            onFeedback={handleFeedback}
            onClear={handleClearFeedback}
            onMarkRead={(contentItemId) => markReadMutation.mutate({ contentItemId, packId })}
          />
        </div>
      ) : (
        <div className={styles.emptyState}>{t("packs.detail.noItems")}</div>
      )}
    </div>
  );
}

function TierSection({
  title,
  items,
  itemMap,
  packId,
  onFeedback,
  onClear,
  onMarkRead,
}: {
  title: string;
  items: CatchupPackOutput["tiers"]["must_read"];
  itemMap: Map<string, CatchupPackItem>;
  packId: string;
  onFeedback: (contentItemId: string, action: FeedbackAction) => Promise<void>;
  onClear: (contentItemId: string) => Promise<void>;
  onMarkRead: (contentItemId: string) => void;
}) {
  const entries = items
    .map((entry) => {
      const item = itemMap.get(entry.item_id);
      if (!item) return null;
      return { entry, item };
    })
    .filter(Boolean) as Array<{
    entry: CatchupPackOutput["tiers"]["must_read"][number];
    item: CatchupPackItem;
  }>;

  if (entries.length === 0) {
    return null;
  }

  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      <div className={styles.itemList}>
        {entries.map(({ entry, item }) => (
          <PackItemCard
            key={entry.item_id}
            entry={entry}
            item={item}
            packId={packId}
            onFeedback={onFeedback}
            onClear={onClear}
            onMarkRead={onMarkRead}
          />
        ))}
      </div>
    </section>
  );
}

function PackItemCard({
  entry,
  item,
  packId,
  onFeedback,
  onClear,
  onMarkRead,
}: {
  entry: CatchupPackOutput["tiers"]["must_read"][number];
  item: CatchupPackItem;
  packId: string;
  onFeedback: (contentItemId: string, action: FeedbackAction) => Promise<void>;
  onClear: (contentItemId: string) => Promise<void>;
  onMarkRead: (contentItemId: string) => void;
}) {
  const relativeTime = formatRelativeTime(item.publishedAt);
  const isRead = Boolean(item.readAt);

  return (
    <article className={styles.itemCard}>
      <div className={styles.itemHeader}>
        <div>
          <div className={styles.itemTitleRow}>
            <h3 className={styles.itemTitle}>{item.title ?? t("item.noTitle")}</h3>
            {isRead && <span className={styles.readBadge}>{t("packs.detail.read")}</span>}
          </div>
          <div className={styles.itemMeta}>
            <span className={styles.sourceTag}>{item.sourceType}</span>
            {item.author && <span>{item.author}</span>}
            {relativeTime && <span>{relativeTime}</span>}
          </div>
        </div>
        <div className={styles.itemActions}>
          {item.url && (
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.openLink}
              onClick={() => {
                if (!isRead) onMarkRead(item.id);
              }}
            >
              {t("packs.detail.open")}
            </a>
          )}
          <button
            type="button"
            className={styles.markReadBtn}
            onClick={() => onMarkRead(item.id)}
            disabled={isRead}
          >
            {t("packs.detail.markRead")}
          </button>
        </div>
      </div>

      <div className={styles.itemReasons}>
        <span className={styles.themeTag}>{entry.theme}</span>
        <p className={styles.whyText}>{entry.why}</p>
      </div>

      <div className={styles.feedbackRow}>
        <FeedbackButtons
          contentItemId={item.id}
          digestId={packId}
          currentFeedback={item.feedback ?? null}
          onFeedback={(action) => onFeedback(item.id, action)}
          onClear={() => onClear(item.id)}
          variant="compact"
        />
      </div>
    </article>
  );
}
