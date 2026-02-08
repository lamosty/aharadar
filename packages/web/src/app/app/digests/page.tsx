"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { DateRangePicker } from "@/components/DateRangePicker";
import { DigestStatsCards } from "@/components/DigestStatsCards";
import { DigestsListCondensed, DigestsListCondensedSkeleton } from "@/components/DigestsList";
import { QueueStatus } from "@/components/QueueStatus";
import { useDigestStats, useDigests, useTopics } from "@/lib/hooks";
import { t } from "@/lib/i18n";
import type { DigestSummary } from "@/lib/mock-data";
import styles from "./page.module.css";

// Default to last 7 days
function getDefaultDateRange() {
  const now = new Date();
  const to = now.toISOString().split("T")[0];
  const from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  return { from, to };
}

export default function DigestsPage() {
  return (
    <Suspense fallback={<DigestsPageSkeleton />}>
      <DigestsPageContent />
    </Suspense>
  );
}

function DigestsPageSkeleton() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>{t("digests.title")}</h1>
      </header>
      <DigestsListCondensedSkeleton />
    </div>
  );
}

function DigestsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Parse URL params
  const topicParam = searchParams.get("topic");
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");

  // Default date range
  const defaultRange = useMemo(() => getDefaultDateRange(), []);
  const [dateFrom, setDateFrom] = useState(fromParam || defaultRange.from);
  const [dateTo, setDateTo] = useState(toParam || defaultRange.to);
  const [selectedTopic, setSelectedTopic] = useState<string | null>(topicParam);

  // Fetch topics for the switcher
  const { data: topicsData } = useTopics();
  const topics = topicsData?.topics ?? [];

  // Convert dates to ISO for API
  const fromIso = `${dateFrom}T00:00:00.000Z`;
  const toIso = `${dateTo}T23:59:59.999Z`;

  // Fetch digests with filters
  const {
    data: digestsData,
    isLoading: digestsLoading,
    isError: digestsError,
    refetch: refetchDigests,
  } = useDigests({
    from: fromIso,
    to: toIso,
    topic: selectedTopic ?? undefined,
  });

  // Fetch stats with same filters
  const { data: statsData, isLoading: statsLoading } = useDigestStats({
    from: fromIso,
    to: toIso,
    topic: selectedTopic ?? undefined,
  });

  // Adapt digests to component format
  const digests: DigestSummary[] = useMemo(() => {
    if (!digestsData?.digests) return [];
    return digestsData.digests.map((d) => ({
      id: d.id,
      topicId: d.topicId,
      topicName: d.topicName,
      windowStart: d.windowStart,
      windowEnd: d.windowEnd,
      mode: d.mode as DigestSummary["mode"],
      status: d.status,
      creditsUsed: d.creditsUsed,
      errorMessage: d.errorMessage,
      topScore: d.topScore,
      itemCount: d.itemCount,
      sourceCount: d.sourceCount,
      createdAt: d.createdAt,
    }));
  }, [digestsData]);

  // Update URL when filters change
  const updateUrl = (newTopic: string | null, newFrom: string, newTo: string) => {
    const params = new URLSearchParams();
    if (newTopic) params.set("topic", newTopic);
    if (newFrom !== defaultRange.from) params.set("from", newFrom);
    if (newTo !== defaultRange.to) params.set("to", newTo);
    const query = params.toString();
    router.replace(query ? `/app/digests?${query}` : "/app/digests");
  };

  const handleTopicChange = (topicId: string | null) => {
    setSelectedTopic(topicId);
    updateUrl(topicId, dateFrom, dateTo);
  };

  const handleDateChange = (from: string, to: string) => {
    setDateFrom(from);
    setDateTo(to);
    updateUrl(selectedTopic, from, to);
  };

  // Show topic column only when viewing all topics
  const showTopicColumn = !selectedTopic;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerTop}>
          <h1 className={styles.title}>{t("digests.title")}</h1>
        </div>
        <div className={styles.filters}>
          <select
            className={styles.topicSelect}
            value={selectedTopic ?? ""}
            onChange={(e) => handleTopicChange(e.target.value === "" ? null : e.target.value)}
          >
            <option value="">All Topics</option>
            {topics.map((topic) => (
              <option key={topic.id} value={topic.id}>
                {topic.name}
              </option>
            ))}
          </select>
          <DateRangePicker from={dateFrom} to={dateTo} onChange={handleDateChange} />
        </div>
      </header>

      <QueueStatus />

      {/* Stats Cards */}
      {statsData && (
        <div className={styles.statsSection}>
          <DigestStatsCards
            stats={statsData.stats}
            previousPeriod={statsData.previousPeriod}
            isLoading={statsLoading}
          />
        </div>
      )}
      {statsLoading && !statsData && (
        <div className={styles.statsSection}>
          <DigestStatsCards
            stats={{
              totalItems: 0,
              digestCount: 0,
              avgItemsPerDigest: 0,
              avgTopScore: 0,
              triageBreakdown: { high: 0, medium: 0, low: 0, skip: 0 },
              totalCredits: 0,
              avgCreditsPerDigest: 0,
              creditsByMode: { low: 0, normal: 0, high: 0 },
            }}
            previousPeriod={{
              totalItems: 0,
              digestCount: 0,
              avgTopScore: 0,
              totalCredits: 0,
            }}
            isLoading={true}
          />
        </div>
      )}

      {/* Digests List */}
      {digestsLoading && <DigestsListCondensedSkeleton showTopic={showTopicColumn} />}

      {digestsError && (
        <div className={styles.errorState}>
          <ErrorIcon />
          <h2 className={styles.errorTitle}>{t("digests.list.error")}</h2>
          <button
            type="button"
            className={`btn btn-primary ${styles.retryButton}`}
            onClick={() => refetchDigests()}
          >
            {t("digests.list.retry")}
          </button>
        </div>
      )}

      {!digestsLoading && !digestsError && digests.length === 0 && (
        <div className={styles.emptyState}>
          <EmptyIcon />
          <h2 className={styles.emptyTitle}>{t("digests.list.empty")}</h2>
          <p className={styles.emptyDescription}>{t("digests.list.emptyDescription")}</p>
        </div>
      )}

      {!digestsLoading && !digestsError && digests.length > 0 && (
        <DigestsListCondensed digests={digests} showTopic={showTopicColumn} />
      )}
    </div>
  );
}

function EmptyIcon() {
  return (
    <svg
      width="64"
      height="64"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="12" y1="18" x2="12" y2="12" />
      <line x1="9" y1="15" x2="15" y2="15" />
    </svg>
  );
}

function ErrorIcon() {
  return (
    <svg
      width="64"
      height="64"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
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
