"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { FeedFilterBar, FeedItem, FeedItemSkeleton, type SortOption } from "@/components/Feed";
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
  const [sort, setSort] = useState<SortOption>(sortParam || "best");
  const [view, setView] = useState<FeedView>(viewParam || "inbox");

  // Pagination state - page size persisted in localStorage
  const [pageSize, setPageSize] = useLocalStorage<PageSize>("feedPageSize", DEFAULT_PAGE_SIZE);
  const [currentPage, setCurrentPage] = useState(pageParam ? parseInt(pageParam, 10) : 1);

  // Fast triage mode - auto-expand next item after feedback
  const [fastTriageMode, setFastTriageMode] = useLocalStorage<boolean>("feedFastTriage", false);
  const [forceExpandedId, setForceExpandedId] = useState<string | null>(null);
  const hoverClearTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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

  // Cleanup hover timeout on unmount
  useEffect(() => {
    return () => {
      if (hoverClearTimeoutRef.current) {
        clearTimeout(hoverClearTimeoutRef.current);
      }
    };
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
      if (newSort !== "best") params.set("sort", newSort);
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
    async (contentItemId: string, action: "like" | "dislike" | "skip") => {
      const items = data?.items ?? [];
      const item = items.find((i) => i.id === contentItemId);
      const currentIndex = items.findIndex((i) => i.id === contentItemId);

      await feedbackMutation.mutateAsync({
        contentItemId,
        digestId: item?.digestId,
        action,
      });

      // In fast triage mode, expand the next item (which will shift up to current position)
      if (
        fastTriageMode &&
        view === "inbox" &&
        currentIndex >= 0 &&
        currentIndex < items.length - 1
      ) {
        // The item at currentIndex+1 will move to currentIndex after the current item is removed
        const nextItem = items[currentIndex + 1];
        if (nextItem) {
          setForceExpandedId(nextItem.id);
        }
      }
    },
    [data, feedbackMutation, fastTriageMode, view],
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
            {/* View toggle: Inbox / Highlights / All */}
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
                className={`${styles.viewToggleBtn} ${view === "highlights" ? styles.viewToggleBtnActive : ""}`}
                onClick={() => handleViewChange("highlights")}
              >
                {t("feed.view.highlights")}
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
            {layout === "condensed" && (
              <Tooltip content={fastTriageMode ? "Fast triage ON" : "Fast triage OFF"}>
                <button
                  type="button"
                  className={`${styles.fastTriageBtn} ${fastTriageMode ? styles.fastTriageBtnActive : ""}`}
                  onClick={() => setFastTriageMode(!fastTriageMode)}
                  aria-pressed={fastTriageMode}
                >
                  <FastIcon />
                </button>
              </Tooltip>
            )}
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
                forceExpanded={fastTriageMode && forceExpandedId === item.id}
                onHover={() => {
                  // Clear any pending timeout
                  if (hoverClearTimeoutRef.current) {
                    clearTimeout(hoverClearTimeoutRef.current);
                    hoverClearTimeoutRef.current = null;
                  }

                  // If hovering the force-expanded item, don't clear
                  if (forceExpandedId === item.id) {
                    return;
                  }

                  // Clear force-expanded after a delay when hovering a different item
                  // This gives leeway for small mouse movements
                  if (forceExpandedId) {
                    hoverClearTimeoutRef.current = setTimeout(() => {
                      setForceExpandedId(null);
                    }, 300);
                  }
                }}
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

function FastIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}
