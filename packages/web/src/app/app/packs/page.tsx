"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { CatchupPackModal } from "@/components/CatchupPackModal";
import { useToast } from "@/components/Toast";
import { useTopic } from "@/components/TopicProvider";
import { TopicSwitcher } from "@/components/TopicSwitcher";
import type { CatchupPack } from "@/lib/api";
import {
  useCatchupPacks,
  useCreateCatchupPack,
  useDeleteCatchupPack,
  useTopics,
} from "@/lib/hooks";
import { t } from "@/lib/i18n";
import styles from "./page.module.css";

const DAY_MS = 24 * 60 * 60 * 1000;

function formatRelativeTime(dateStr: string): string {
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

export default function PacksPage() {
  const router = useRouter();
  const { addToast } = useToast();
  const { currentTopicId } = useTopic();
  const { data: topicsData } = useTopics();
  const [isModalOpen, setIsModalOpen] = useState(false);

  const { data, isLoading, isError, error } = useCatchupPacks(
    currentTopicId ? { topicId: currentTopicId } : undefined,
    { enabled: Boolean(currentTopicId) },
  );

  const packs = data?.packs ?? [];
  const hasTopics = (topicsData?.topics?.length ?? 0) > 0;
  const createPackMutation = useCreateCatchupPack({
    onSuccess: (data) => {
      addToast(t("packs.retryStarted"), "success");
      router.push(`/app/packs/${data.pack.id}`);
    },
    onError: (err) => {
      addToast(err.message, "error");
    },
  });
  const deletePackMutation = useDeleteCatchupPack({
    onSuccess: () => {
      addToast(t("packs.deleted"), "success");
    },
    onError: (err) => {
      addToast(err.message, "error");
    },
  });

  const statusLabels = useMemo(
    () => ({
      pending: t("packs.status.pending"),
      complete: t("packs.status.complete"),
      error: t("packs.status.error"),
      skipped: t("packs.status.skipped"),
    }),
    [t],
  );

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>{t("packs.title")}</h1>
          <p className={styles.subtitle}>{t("packs.subtitle")}</p>
        </div>
        <div className={styles.headerActions}>
          <TopicSwitcher />
          <button
            className="btn btn-primary"
            onClick={() => setIsModalOpen(true)}
            disabled={!currentTopicId}
            title={!currentTopicId ? t("packs.selectTopic") : undefined}
          >
            {t("packs.create")}
          </button>
        </div>
      </header>

      {!hasTopics && (
        <div className={styles.emptyState}>
          <p className={styles.emptyTitle}>{t("topics.emptyTitle")}</p>
          <p className={styles.emptyMessage}>{t("topics.emptyDescription")}</p>
          <Link href="/app/topics" className="btn btn-primary">
            {t("topics.addSource")}
          </Link>
        </div>
      )}

      {hasTopics && !currentTopicId && (
        <div className={styles.emptyState}>
          <p className={styles.emptyTitle}>{t("packs.selectTopic")}</p>
          <p className={styles.emptyMessage}>{t("packs.emptyMessage")}</p>
        </div>
      )}

      {currentTopicId && isLoading && (
        <div className={styles.list}>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className={styles.cardSkeleton} />
          ))}
        </div>
      )}

      {currentTopicId && isError && (
        <div className={styles.errorState}>
          <p className={styles.errorTitle}>{t("packs.errorTitle")}</p>
          <p className={styles.errorMessage}>{error?.message || t("common.error")}</p>
          <button className="btn btn-secondary" onClick={() => window.location.reload()}>
            {t("common.retry")}
          </button>
        </div>
      )}

      {currentTopicId && !isLoading && !isError && packs.length === 0 && (
        <div className={styles.emptyState}>
          <p className={styles.emptyTitle}>{t("packs.emptyTitle")}</p>
          <p className={styles.emptyMessage}>{t("packs.emptyMessage")}</p>
        </div>
      )}

      {currentTopicId && packs.length > 0 && (
        <div className={styles.list}>
          {packs.map((pack) => (
            <PackCard
              key={pack.id}
              pack={pack}
              statusLabels={statusLabels}
              onRetry={(params) => createPackMutation.mutate(params)}
              onDelete={(id) => deletePackMutation.mutate({ id })}
            />
          ))}
        </div>
      )}

      <CatchupPackModal
        isOpen={isModalOpen}
        topicId={currentTopicId}
        onClose={() => setIsModalOpen(false)}
        onCreated={(packId) => {
          setIsModalOpen(false);
          router.push(`/app/packs/${packId}`);
        }}
      />
    </div>
  );
}

function PackCard({
  pack,
  statusLabels,
  onRetry,
  onDelete,
}: {
  pack: CatchupPack;
  statusLabels: Record<string, string>;
  onRetry: (params: { topicId: string; timeframeDays: number; timeBudgetMinutes: number }) => void;
  onDelete: (id: string) => void;
}) {
  const scope = (pack.metaJson?.scope ?? {}) as {
    since?: string;
    until?: string;
    timeBudgetMinutes?: number;
  };
  const daysRaw =
    scope.since && scope.until
      ? Math.round((new Date(scope.until).getTime() - new Date(scope.since).getTime()) / DAY_MS)
      : null;
  const days = daysRaw && Number.isFinite(daysRaw) ? Math.max(1, daysRaw) : null;
  const budgetMinutes = scope.timeBudgetMinutes ?? pack.summaryJson?.time_budget_minutes ?? null;
  const totalItems = pack.summaryJson
    ? pack.summaryJson.tiers.must_read.length +
      pack.summaryJson.tiers.worth_scanning.length +
      pack.summaryJson.tiers.headlines.length
    : null;

  const canRetry =
    (pack.status === "error" || pack.status === "skipped") &&
    days !== null &&
    budgetMinutes !== null;
  const canDelete = pack.status === "error" || pack.status === "skipped";

  return (
    <article className={styles.card}>
      <div className={styles.cardHeader}>
        <div>
          <div className={styles.cardTitleRow}>
            <h3 className={styles.cardTitle}>{t("packs.detail.title")}</h3>
            <span className={styles.statusBadge} data-status={pack.status}>
              {statusLabels[pack.status] ?? pack.status}
            </span>
          </div>
          <div className={styles.cardMeta}>
            {budgetMinutes && (
              <span className={styles.metaPill}>
                {t("packs.timeBudget", { minutes: budgetMinutes })}
              </span>
            )}
            {days && <span className={styles.metaPill}>{t("packs.timeframe", { days })}</span>}
            {totalItems !== null && (
              <span className={styles.metaPill}>
                {t("packs.itemsCount", { count: totalItems })}
              </span>
            )}
            <span className={styles.metaText}>{formatRelativeTime(pack.createdAt)}</span>
          </div>
        </div>
        <div className={styles.cardActions}>
          <Link href={`/app/packs/${pack.id}`} className="btn btn-secondary">
            {t("packs.detail.open")}
          </Link>
          {canRetry && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() =>
                onRetry({
                  topicId: pack.topicId,
                  timeframeDays: days ?? 7,
                  timeBudgetMinutes: budgetMinutes ?? 60,
                })
              }
            >
              {t("packs.retry")}
            </button>
          )}
          {canDelete && (
            <button
              type="button"
              className={styles.deleteBtn}
              onClick={() => {
                const confirmText = t("packs.confirmDelete");
                if (window.confirm(confirmText)) {
                  onDelete(pack.id);
                }
              }}
            >
              {t("common.delete")}
            </button>
          )}
        </div>
      </div>
      {pack.status === "error" && pack.errorMessage && (
        <div className={styles.errorNote}>{pack.errorMessage}</div>
      )}
    </article>
  );
}
