"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { FeedFilterBar, FeedItem, FeedItemSkeleton } from "@/components/Feed";
import { LayoutToggle } from "@/components/LayoutToggle";
import { type PageSize, Pagination } from "@/components/Pagination";
import { useToast } from "@/components/Toast";
import { Tooltip } from "@/components/Tooltip";
import { useTopic } from "@/components/TopicProvider";
import { TopicSwitcher } from "@/components/TopicSwitcher";
import type { FeedView } from "@/lib/api";
import {
  useClearFeedback,
  useFeedback,
  useLocalStorage,
  usePagedItems,
  usePageLayout,
  useTopicMarkChecked,
  useTopics,
} from "@/lib/hooks";
import { t } from "@/lib/i18n";
import styles from "./page.module.css";

type SortOption = "score_desc" | "date_desc" | "date_asc";

// Default page size based on layout
const DEFAULT_PAGE_SIZE: PageSize = 50;

export default function FeedPage() {
  return (
    <Suspense fallback={<FeedPageSkeleton />}>
      <FeedPageContent />
    </Suspense>
  );
}

function FeedPageSkeleton() {
  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>Feed</h1>
        <p className={styles.subtitle}>All your ranked items in one place</p>
      </header>
      <div className={styles.feedList}>
        {Array.from({ length: 5 }).map((_, i) => (
          <FeedItemSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

function FeedPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { addToast } = useToast();
  const { currentTopicId, setCurrentTopicId, isReady: topicReady } = useTopic();
  const { data: topicsData, isLoading: topicsLoading } = useTopics();
  const { layout, setLayout, hasOverride, resetToGlobal } = usePageLayout("feed");

  const hasTopics = topicsData?.topics && topicsData.topics.length > 0;

  // Parse URL params
  const sourcesParam = searchParams.get("sources");
  const sortParam = searchParams.get("sort") as SortOption | null;
  const pageParam = searchParams.get("page");
  const topicParam = searchParams.get("topic");
  const viewParam = searchParams.get("view") as FeedView | null;

  const [selectedSources, setSelectedSources] = useState<string[]>(
    sourcesParam ? sourcesParam.split(",").filter(Boolean) : [],
  );
  const [sort, setSort] = useState<SortOption>(sortParam || "score_desc");
  const [view, setView] = useState<FeedView>(viewParam || "inbox");

  // Pagination state - page size persisted in localStorage
  const [pageSize, setPageSize] = useLocalStorage<PageSize>("feedPageSize", DEFAULT_PAGE_SIZE);
  const [currentPage, setCurrentPage] = useState(pageParam ? parseInt(pageParam, 10) : 1);

  // Track if URL sync has been done
  const [urlSynced, setUrlSynced] = useState(false);

  // Sync URL topic param with TopicProvider on mount
  useEffect(() => {
    if (!topicReady || urlSynced) return;

    if (topicParam === "all") {
      setCurrentTopicId(null);
    } else if (topicParam) {
      // Validate that topic exists before setting
      const topicExists = topicsData?.topics.some((t) => t.id === topicParam);
      if (topicExists) {
        setCurrentTopicId(topicParam);
      }
    }
    setUrlSynced(true);
  }, [topicParam, topicReady, topicsData, setCurrentTopicId, urlSynced]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, []);

  // Determine if we're in "all topics" mode
  const isAllTopicsMode = currentTopicId === null;

  // Update URL when filters/page/topic/view change
  const updateUrl = useCallback(
    (
      sources: string[],
      newSort: SortOption,
      page: number,
      topic: string | null,
      newView: FeedView,
    ) => {
      const params = new URLSearchParams();
      if (topic === null) {
        params.set("topic", "all");
      } else if (topic) {
        params.set("topic", topic);
      }
      if (newView !== "inbox") params.set("view", newView);
      if (sources.length > 0) params.set("sources", sources.join(","));
      if (newSort !== "score_desc") params.set("sort", newSort);
      if (page > 1) params.set("page", String(page));
      const query = params.toString();
      router.replace(query ? `/app/feed?${query}` : "/app/feed", { scroll: false });
    },
    [router],
  );

  const handleSourcesChange = useCallback(
    (sources: string[]) => {
      setSelectedSources(sources);
      updateUrl(sources, sort, 1, currentTopicId, view);
    },
    [sort, updateUrl, currentTopicId, view],
  );

  const handleSortChange = useCallback(
    (newSort: SortOption) => {
      setSort(newSort);
      updateUrl(selectedSources, newSort, 1, currentTopicId, view);
    },
    [selectedSources, updateUrl, currentTopicId, view],
  );

  const handlePageChange = useCallback(
    (page: number) => {
      setCurrentPage(page);
      updateUrl(selectedSources, sort, page, currentTopicId, view);
      // Scroll to top of feed
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [selectedSources, sort, updateUrl, currentTopicId, view],
  );

  const handlePageSizeChange = useCallback(
    (size: PageSize) => {
      setPageSize(size);
      setCurrentPage(1);
      updateUrl(selectedSources, sort, 1, currentTopicId, view);
    },
    [selectedSources, sort, updateUrl, setPageSize, currentTopicId, view],
  );

  // Handle topic change from TopicSwitcher - update URL
  const handleTopicChange = useCallback(
    (newTopicId: string | null) => {
      setCurrentTopicId(newTopicId);
      setCurrentPage(1);
      updateUrl(selectedSources, sort, 1, newTopicId, view);
    },
    [setCurrentTopicId, updateUrl, selectedSources, sort, view],
  );

  // Handle view change
  const handleViewChange = useCallback(
    (newView: FeedView) => {
      setView(newView);
      setCurrentPage(1);
      updateUrl(selectedSources, sort, 1, currentTopicId, newView);
    },
    [updateUrl, selectedSources, sort, currentTopicId],
  );

  // Fetch items using paged query
  // Pass "all" for all topics mode, otherwise the topic ID
  const { data, isLoading, isError, error, isFetching, refetch } = usePagedItems({
    sourceTypes: selectedSources.length > 0 ? selectedSources : undefined,
    sort,
    page: currentPage,
    pageSize,
    topicId: isAllTopicsMode ? "all" : currentTopicId || undefined,
    view,
  });

  // Feedback mutation
  const feedbackMutation = useFeedback({
    onError: () => {
      addToast("Failed to save feedback. Please try again.", "error");
    },
    onSuccess: () => {
      // Refetch in inbox view to remove items with feedback
      if (view === "inbox") {
        refetch();
      }
    },
  });

  // Clear feedback mutation (undo)
  const clearFeedbackMutation = useClearFeedback({
    onError: () => {
      addToast("Failed to clear feedback. Please try again.", "error");
    },
    onSuccess: () => {
      // Refetch to update the list
      refetch();
    },
  });

  // Mark as caught up mutation - use topic-specific endpoint
  const markCheckedMutation = useTopicMarkChecked(currentTopicId ?? "", {
    onSuccess: () => {
      addToast(t("digests.feed.caughtUpSuccess"), "success");
    },
    onError: () => {
      addToast(t("digests.feed.caughtUpError"), "error");
    },
  });

  const handleMarkCaughtUp = useCallback(() => {
    if (!currentTopicId) return;
    markCheckedMutation.mutate();
  }, [markCheckedMutation, currentTopicId]);

  const handleFeedback = useCallback(
    async (contentItemId: string, action: "like" | "dislike" | "save" | "skip") => {
      const item = data?.items.find((i) => i.id === contentItemId);
      await feedbackMutation.mutateAsync({
        contentItemId,
        digestId: item?.digestId,
        action,
      });
    },
    [data, feedbackMutation],
  );

  const handleClearFeedback = useCallback(
    async (contentItemId: string) => {
      const item = data?.items.find((i) => i.id === contentItemId);
      await clearFeedbackMutation.mutateAsync({
        contentItemId,
        digestId: item?.digestId,
      });
    },
    [data, clearFeedbackMutation],
  );

  const items = data?.items ?? [];
  const totalCount = data?.pagination.total ?? 0;
  const isCondensed = layout === "condensed";

  // Show onboarding when no topics exist
  if (!topicsLoading && !hasTopics) {
    return (
      <div className={styles.container}>
        <header className={styles.header}>
          <div className={styles.headerTop}>
            <div>
              <h1 className={styles.title}>{t("feed.title")}</h1>
              <p className={styles.subtitle}>{t("feed.onboarding.subtitle")}</p>
            </div>
          </div>
        </header>

        <div className={styles.onboardingState}>
          <div className={styles.onboardingIcon}>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="64"
              height="64"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </div>
          <h2 className={styles.onboardingTitle}>{t("feed.onboarding.title")}</h2>
          <p className={styles.onboardingMessage}>{t("feed.onboarding.message")}</p>

          <div className={styles.onboardingSteps}>
            <div className={styles.onboardingStep}>
              <span className={styles.stepNumber}>1</span>
              <span className={styles.stepText}>{t("feed.onboarding.step1")}</span>
            </div>
            <div className={styles.onboardingStep}>
              <span className={styles.stepNumber}>2</span>
              <span className={styles.stepText}>{t("feed.onboarding.step2")}</span>
            </div>
            <div className={styles.onboardingStep}>
              <span className={styles.stepNumber}>3</span>
              <span className={styles.stepText}>{t("feed.onboarding.step3")}</span>
            </div>
          </div>

          <Link href="/app/settings" className={`btn btn-primary ${styles.onboardingCta}`}>
            {t("feed.onboarding.cta")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.headerTop}>
          <div>
            <h1 className={styles.title}>{t("feed.title")}</h1>
            <p className={styles.subtitle}>{t("feed.subtitle")}</p>
          </div>
          <div className={styles.headerActions}>
            {/* View toggle: Inbox / Saved / All */}
            <div className={styles.viewToggle}>
              <button
                type="button"
                className={`${styles.viewToggleBtn} ${view === "inbox" ? styles.viewToggleBtnActive : ""}`}
                onClick={() => handleViewChange("inbox")}
              >
                {t("feed.view.inbox")}
              </button>
              <button
                type="button"
                className={`${styles.viewToggleBtn} ${view === "saved" ? styles.viewToggleBtnActive : ""}`}
                onClick={() => handleViewChange("saved")}
              >
                {t("feed.view.saved")}
              </button>
              <button
                type="button"
                className={`${styles.viewToggleBtn} ${view === "all" ? styles.viewToggleBtnActive : ""}`}
                onClick={() => handleViewChange("all")}
              >
                {t("feed.view.all")}
              </button>
            </div>
            <LayoutToggle
              layout={layout}
              onLayoutChange={setLayout}
              hasOverride={hasOverride}
              onResetToGlobal={resetToGlobal}
              size="sm"
            />
            <TopicSwitcher onTopicChange={handleTopicChange} />
            {isAllTopicsMode ? (
              <Tooltip content={t("feed.selectTopicForCaughtUp")}>
                <button className={`btn btn-secondary ${styles.markCaughtUpBtn}`} disabled>
                  {t("digests.feed.markCaughtUp")}
                </button>
              </Tooltip>
            ) : (
              <button
                className={`btn btn-secondary ${styles.markCaughtUpBtn}`}
                onClick={handleMarkCaughtUp}
                disabled={markCheckedMutation.isPending}
              >
                {markCheckedMutation.isPending
                  ? t("digests.feed.markingCaughtUp")
                  : t("digests.feed.markCaughtUp")}
              </button>
            )}
          </div>
        </div>
      </header>

      <FeedFilterBar
        selectedSources={selectedSources}
        onSourcesChange={handleSourcesChange}
        sort={sort}
        onSortChange={handleSortChange}
        layout={layout}
      />

      {isLoading && (
        <div className={styles.feedList}>
          {Array.from({ length: Math.min(pageSize, 10) }).map((_, i) => (
            <FeedItemSkeleton key={i} />
          ))}
        </div>
      )}

      {isError && (
        <div className={styles.errorState}>
          <p className={styles.errorTitle}>Failed to load feed</p>
          <p className={styles.errorMessage}>{error?.message || "An error occurred"}</p>
          <button className="btn btn-secondary" onClick={() => window.location.reload()}>
            Try again
          </button>
        </div>
      )}

      {!isLoading && !isError && items.length === 0 && (
        <div className={styles.emptyState}>
          <p className={styles.emptyTitle}>No items yet</p>
          <p className={styles.emptyMessage}>
            Run the pipeline to fetch and rank items from your sources.
          </p>
        </div>
      )}

      {!isLoading && !isError && items.length > 0 && (
        <>
          <div
            className={`${styles.feedList} ${isFetching ? styles.feedListLoading : ""}`}
            data-layout={layout}
          >
            {items.map((item) => (
              <FeedItem
                key={item.id}
                item={item}
                onFeedback={handleFeedback}
                onClear={handleClearFeedback}
                layout={layout}
                showTopicBadge={isAllTopicsMode}
              />
            ))}
          </div>

          <Pagination
            currentPage={currentPage}
            totalItems={totalCount}
            pageSize={pageSize}
            onPageChange={handlePageChange}
            onPageSizeChange={handlePageSizeChange}
            isLoading={isFetching}
            compact={isCondensed}
          />
        </>
      )}
    </div>
  );
}
