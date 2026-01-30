"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { FeedFilterBar, FeedItem, FeedItemSkeleton, type SortOption } from "@/components/Feed";
import { FeedItemModal } from "@/components/Feed/FeedItemModal";
import { InboxSummaryModal } from "@/components/InboxSummaryModal";
import { ItemSummaryModal } from "@/components/ItemSummaryModal";
import { LayoutToggle } from "@/components/LayoutToggle";
import { type PageSize, Pagination } from "@/components/Pagination";
import { useToast } from "@/components/Toast";
import { Tooltip } from "@/components/Tooltip";
import { useTopic } from "@/components/TopicProvider";
import { TopicSwitcher } from "@/components/TopicSwitcher";
import type { CatchupPackItem, FeedItem as FeedItemType, FeedView } from "@/lib/api";
import {
  useCatchupView,
  useClearFeedback,
  useFeedback,
  useLocalStorage,
  useMarkItemRead,
  useMediaQuery,
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

  // Desktop undo history - tracks items after feedback for undo
  const [desktopHistory, setDesktopHistory] = useState<FeedItemType[]>([]);

  // Track if URL sync has been done
  const [urlSynced, setUrlSynced] = useState(false);

  // Item summary modal state (read-only view of generated summary)
  const [summaryModalItem, setSummaryModalItem] = useState<FeedItemType | null>(null);
  const [summaryModalSummary, setSummaryModalSummary] = useState<
    import("@/lib/api").ManualSummaryOutput | null
  >(null);
  const [isSummaryModalOpen, setIsSummaryModalOpen] = useState(false);

  // Inbox summary modal state
  const [isInboxSummaryModalOpen, setIsInboxSummaryModalOpen] = useState(false);

  // Mobile modal state
  const [mobileModalItem, setMobileModalItem] = useState<FeedItemType | null>(null);
  const [mobileModalHistory, setMobileModalHistory] = useState<FeedItemType[]>([]);
  const isMobile = useMediaQuery("(max-width: 768px)");

  // Catch-up view state
  const catchupView = useCatchupView({ topicId: currentTopicId });
  const [catchupTimeframeDays, setCatchupTimeframeDays] = useState(7);
  const [catchupTimeBudgetMinutes, setCatchupTimeBudgetMinutes] = useState(60);
  const [catchupError, setCatchupError] = useState<string | null>(null);

  // Mark item read mutation for catch-up
  const markItemReadMutation = useMarkItemRead();

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

  // Open reader modal for an item with summary
  const handleOpenReaderModal = useCallback(
    (item: FeedItemType, summary: import("@/lib/api").ManualSummaryOutput) => {
      setSummaryModalItem(item);
      setSummaryModalSummary(summary);
      setIsSummaryModalOpen(true);
    },
    [],
  );

  // Find items with existing summaries for "Read Next" navigation in modal
  const itemsWithSummary = (data?.items ?? []).filter((item) => item.manualSummaryJson != null);

  // Get the next item with summary (after current modal item)
  const getNextItemWithSummary = useCallback(() => {
    if (!summaryModalItem) return null;
    const currentIndex = itemsWithSummary.findIndex((i) => i.id === summaryModalItem.id);
    if (currentIndex >= 0 && currentIndex < itemsWithSummary.length - 1) {
      return itemsWithSummary[currentIndex + 1];
    }
    return null;
  }, [summaryModalItem, itemsWithSummary]);

  const nextItemWithSummary = getNextItemWithSummary();

  // Handle "Read Next" in modal - navigate to next item with summary
  const handleReadNextInModal = useCallback(() => {
    if (nextItemWithSummary?.manualSummaryJson) {
      setSummaryModalItem(nextItemWithSummary);
      setSummaryModalSummary(nextItemWithSummary.manualSummaryJson);
      // Also update the force-expanded ID so when user closes modal, the right item is highlighted
      setForceExpandedId(nextItemWithSummary.id);
    }
  }, [nextItemWithSummary]);

  // Handle "Next" button in Highlights - expand next item's detail panel
  const handleNextItem = useCallback(
    (currentItemId: string) => {
      const allItems = data?.items ?? [];
      const currentIndex = allItems.findIndex((i) => i.id === currentItemId);
      if (currentIndex >= 0 && currentIndex < allItems.length - 1) {
        const nextItem = allItems[currentIndex + 1];
        if (nextItem) {
          // Set force expanded to show the next item's detail panel
          setForceExpandedId(nextItem.id);
          // Scroll to it
          setTimeout(() => {
            const nextElement = document.getElementById(`feed-item-${nextItem.id}`);
            nextElement?.scrollIntoView({ behavior: "smooth", block: "center" });
          }, 50);
        }
      }
    },
    [data],
  );

  const handleFeedback = useCallback(
    async (contentItemId: string, action: "like" | "dislike" | "skip") => {
      const items = data?.items ?? [];
      const item = items.find((i) => i.id === contentItemId);
      const currentIndex = items.findIndex((i) => i.id === contentItemId);

      // Track in desktop history for undo (only on desktop, not mobile)
      if (item && !isMobile) {
        setDesktopHistory((prev) => [...prev, item]);
      }

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
    [data, feedbackMutation, fastTriageMode, view, isMobile],
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

  // Desktop undo handler - pops from history and clears feedback
  const handleDesktopUndo = useCallback(async () => {
    if (desktopHistory.length === 0) return;
    const previousItem = desktopHistory[desktopHistory.length - 1];
    setDesktopHistory((prev) => prev.slice(0, -1));
    await clearFeedbackMutation.mutateAsync({
      contentItemId: previousItem.id,
      digestId: previousItem.digestId,
    });
  }, [desktopHistory, clearFeedbackMutation]);

  // Mobile modal handlers
  const handleMobileItemClick = useCallback((item: FeedItemType) => {
    setMobileModalItem(item);
    setMobileModalHistory([]);
  }, []);

  const handleMobileModalFeedback = useCallback(
    async (action: "like" | "dislike") => {
      if (!mobileModalItem) return;

      const allItems = data?.items ?? [];
      const currentIndex = allItems.findIndex((i) => i.id === mobileModalItem.id);
      const currentItem = mobileModalItem;

      if (!currentItem) return;

      // Capture next item BEFORE feedback (list will shift after mutation in inbox view)
      const nextItem =
        currentIndex >= 0 && currentIndex < allItems.length - 1 ? allItems[currentIndex + 1] : null;

      // OPTIMISTIC: Advance UI immediately, don't wait for network
      if (nextItem) {
        setMobileModalHistory((prev) => [...prev, currentItem]);
        setMobileModalItem(nextItem);
      } else {
        setMobileModalItem(null);
        setMobileModalHistory([]);
      }

      // Fire feedback in background - don't block UI
      // If it fails, the item is already in history for undo
      feedbackMutation.mutate({
        contentItemId: currentItem.id,
        digestId: currentItem.digestId,
        action,
      });
    },
    [mobileModalItem, data, feedbackMutation],
  );

  const handleMobileModalUndo = useCallback(async () => {
    if (mobileModalHistory.length === 0) return;
    const previousItem = mobileModalHistory[mobileModalHistory.length - 1];
    setMobileModalHistory((prev) => prev.slice(0, -1));
    setMobileModalItem(previousItem);
    await clearFeedbackMutation.mutateAsync({
      contentItemId: previousItem.id,
      digestId: previousItem.digestId,
    });
  }, [mobileModalHistory, clearFeedbackMutation]);

  const items = data?.items ?? [];
  const totalCount = data?.pagination.total ?? 0;
  const isCondensed = layout === "condensed";

  // Clear selection when clicking outside feed items
  const handleContainerClick = useCallback(
    (e: React.MouseEvent) => {
      // Check if click was inside a feed item
      const target = e.target as HTMLElement;
      const feedItem = target.closest("[data-feed-item]");

      // If click was outside any feed item, clear selection
      if (!feedItem && forceExpandedId) {
        setForceExpandedId(null);
      }
    },
    [forceExpandedId],
  );

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
    <div className={styles.container} onClick={handleContainerClick}>
      <header className={styles.header}>
        <div className={styles.headerTop}>
          <div>
            <h1 className={styles.title}>{t("feed.title")}</h1>
            <p className={styles.subtitle}>{t("feed.subtitle")}</p>
          </div>
          <div className={styles.headerActions}>
            {/* View toggle: Inbox / Highlights / Catch-up / All */}
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
                className={`${styles.viewToggleBtn} ${view === "catchup" ? styles.viewToggleBtnActive : ""}`}
                onClick={() => handleViewChange("catchup")}
              >
                {t("feed.view.catchup")}
              </button>
              <button
                type="button"
                className={`${styles.viewToggleBtn} ${view === "all" ? styles.viewToggleBtnActive : ""}`}
                onClick={() => handleViewChange("all")}
              >
                {t("feed.view.all")}
              </button>
            </div>
            <div className={styles.layoutToggleWrapper}>
              <LayoutToggle
                layout={layout}
                onLayoutChange={setLayout}
                hasOverride={hasOverride}
                onResetToGlobal={resetToGlobal}
                size="sm"
              />
            </div>
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
            <button
              type="button"
              className={`btn btn-secondary ${styles.summarizeBtn}`}
              onClick={() => setIsInboxSummaryModalOpen(true)}
              disabled={items.length === 0}
            >
              {t("summaries.inboxModal.button")}
            </button>
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

      {view !== "catchup" && (
        <FeedFilterBar
          selectedSources={selectedSources}
          onSourcesChange={handleSourcesChange}
          sort={sort}
          onSortChange={handleSortChange}
          layout={layout}
        />
      )}

      {/* Catch-up View */}
      {view === "catchup" && (
        <CatchupViewContent
          topicId={currentTopicId}
          catchupView={catchupView}
          timeframeDays={catchupTimeframeDays}
          setTimeframeDays={setCatchupTimeframeDays}
          timeBudgetMinutes={catchupTimeBudgetMinutes}
          setTimeBudgetMinutes={setCatchupTimeBudgetMinutes}
          error={catchupError}
          setError={setCatchupError}
          layout={layout}
          fastTriageMode={fastTriageMode}
          onFeedback={handleFeedback}
          onClearFeedback={handleClearFeedback}
          markItemReadMutation={markItemReadMutation}
          onViewSummary={handleOpenReaderModal}
          onSummaryGenerated={() => refetch()}
          sort={sort}
          isMobile={isMobile}
          onMobileItemClick={handleMobileItemClick}
        />
      )}

      {view !== "catchup" && isLoading && (
        <div className={styles.feedList}>
          {Array.from({ length: Math.min(pageSize, 10) }).map((_, i) => (
            <FeedItemSkeleton key={i} />
          ))}
        </div>
      )}

      {view !== "catchup" && isError && (
        <div className={styles.errorState}>
          <p className={styles.errorTitle}>Failed to load feed</p>
          <p className={styles.errorMessage}>{error?.message || "An error occurred"}</p>
          <button className="btn btn-secondary" onClick={() => window.location.reload()}>
            Try again
          </button>
        </div>
      )}

      {view !== "catchup" && !isLoading && !isError && items.length === 0 && (
        <div className={styles.emptyState}>
          <p className={styles.emptyTitle}>No items yet</p>
          <p className={styles.emptyMessage}>
            Run the pipeline to fetch and rank items from your sources.
          </p>
        </div>
      )}

      {view !== "catchup" && !isLoading && !isError && items.length > 0 && (
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
                fastTriageMode={fastTriageMode && forceExpandedId !== null}
                onViewSummary={handleOpenReaderModal}
                onSummaryGenerated={() => refetch()}
                onNext={() => handleNextItem(item.id)}
                onClose={() => setForceExpandedId(null)}
                sort={sort}
                onMobileClick={isMobile ? () => handleMobileItemClick(item) : undefined}
                onUndo={!isMobile ? handleDesktopUndo : undefined}
                canUndo={!isMobile && desktopHistory.length > 0}
                onHover={() => {
                  // In fast triage mode, don't clear force-expanded on hover
                  // CSS disables hover expansion, users click to manually expand
                  if (fastTriageMode) {
                    return;
                  }

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

      {/* Item Summary Modal - Read-only view of generated summary */}
      <ItemSummaryModal
        isOpen={isSummaryModalOpen}
        item={summaryModalItem}
        summary={summaryModalSummary}
        onClose={() => {
          setIsSummaryModalOpen(false);
          setSummaryModalItem(null);
          setSummaryModalSummary(null);
        }}
        onReadNext={handleReadNextInModal}
        hasNextWithSummary={nextItemWithSummary != null}
        currentFeedback={summaryModalItem?.feedback}
        onFeedback={async (action) => {
          if (!summaryModalItem) return;
          // Capture next item before feedback (as current item may be removed from list)
          const nextItem = nextItemWithSummary;
          await handleFeedback(summaryModalItem.id, action);
          // Show next item with summary if available, otherwise close
          if (nextItem?.manualSummaryJson) {
            setSummaryModalItem(nextItem);
            setSummaryModalSummary(nextItem.manualSummaryJson);
            setForceExpandedId(nextItem.id);
          } else {
            setIsSummaryModalOpen(false);
            setSummaryModalItem(null);
            setSummaryModalSummary(null);
          }
        }}
        onUndo={!isMobile ? handleDesktopUndo : undefined}
        canUndo={!isMobile && desktopHistory.length > 0}
      />

      {/* Inbox Summary Modal */}
      <InboxSummaryModal
        isOpen={isInboxSummaryModalOpen}
        topicId={currentTopicId}
        onClose={() => setIsInboxSummaryModalOpen(false)}
      />

      {/* Mobile Feed Item Modal */}
      <FeedItemModal
        isOpen={mobileModalItem !== null}
        item={mobileModalItem}
        onClose={() => {
          setMobileModalItem(null);
          setMobileModalHistory([]);
        }}
        onFeedback={handleMobileModalFeedback}
        onUndo={handleMobileModalUndo}
        canUndo={mobileModalHistory.length > 0}
        sort={sort}
        enableSwipe={isMobile}
        onViewSummary={(item, summary) => {
          setMobileModalItem(null);
          setMobileModalHistory([]);
          handleOpenReaderModal(item, summary);
        }}
        onSummaryGenerated={() => refetch()}
      />
    </div>
  );
}

// ============================================================================
// Catch-up View Component
// ============================================================================

interface CatchupViewContentProps {
  topicId: string | null;
  catchupView: ReturnType<typeof useCatchupView>;
  timeframeDays: number;
  setTimeframeDays: (days: number) => void;
  timeBudgetMinutes: number;
  setTimeBudgetMinutes: (minutes: number) => void;
  error: string | null;
  setError: (error: string | null) => void;
  layout: import("@/lib/theme").Layout;
  fastTriageMode: boolean;
  onFeedback: (contentItemId: string, action: "like" | "dislike" | "skip") => Promise<void>;
  onClearFeedback: (contentItemId: string) => Promise<void>;
  markItemReadMutation: ReturnType<typeof useMarkItemRead>;
  onViewSummary: (item: FeedItemType, summary: import("@/lib/api").ManualSummaryOutput) => void;
  onSummaryGenerated: () => void;
  sort: SortOption;
  isMobile: boolean;
  onMobileItemClick: (item: FeedItemType) => void;
}

function CatchupViewContent({
  topicId,
  catchupView,
  timeframeDays,
  setTimeframeDays,
  timeBudgetMinutes,
  setTimeBudgetMinutes,
  error,
  setError,
  layout,
  fastTriageMode,
  onFeedback,
  onClearFeedback,
  markItemReadMutation,
  onViewSummary,
  onSummaryGenerated,
  sort,
  isMobile,
  onMobileItemClick,
}: CatchupViewContentProps) {
  const { addToast } = useToast();
  // Track items hidden after feedback (for fast triage behavior)
  const [hiddenItemIds, setHiddenItemIds] = useState<Set<string>>(new Set());
  const {
    selectedPackId,
    setSelectedPackId,
    packs,
    isLoadingPacks,
    packDetail,
    isLoadingPackDetail,
    createPack,
    deletePack,
    showGenerationPanel,
  } = catchupView;

  // Handle generate
  const handleGenerate = useCallback(() => {
    if (!topicId) {
      setError(t("feed.catchup.selectTopic"));
      return;
    }
    setError(null);
    createPack.mutate(
      { topicId, timeframeDays, timeBudgetMinutes },
      {
        onError: (err) => {
          setError(err.message);
        },
      },
    );
  }, [topicId, timeframeDays, timeBudgetMinutes, createPack, setError]);

  // Reset hidden items when switching packs
  useEffect(() => {
    setHiddenItemIds(new Set());
  }, [selectedPackId]);

  // Wrap feedback to also hide the item
  const handleCatchupFeedback = useCallback(
    async (contentItemId: string, action: "like" | "dislike" | "skip") => {
      await onFeedback(contentItemId, action);
      // Hide item after feedback
      setHiddenItemIds((prev) => new Set([...prev, contentItemId]));
    },
    [onFeedback],
  );

  // Convert CatchupPackItem to FeedItemType for FeedItem component
  const packItemToFeedItem = useCallback(
    (item: CatchupPackItem, _packId: string): FeedItemType => ({
      id: item.id,
      score: 0,
      rank: 0,
      digestId: "",
      digestCreatedAt: "",
      item: {
        title: item.title,
        bodyText: item.bodyText,
        url: item.url,
        externalId: item.externalId,
        author: item.author,
        publishedAt: item.publishedAt,
        sourceType: item.sourceType,
        sourceId: item.sourceId,
        metadata: item.metadata,
      },
      triageJson: null,
      feedback: item.feedback,
      clusterItems: undefined,
      manualSummaryJson: null,
      topicId: topicId ?? "",
      topicName: "",
      readAt: item.readAt,
    }),
    [topicId],
  );

  // Relative time formatting
  const formatRelativeTime = (dateStr: string): string => {
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
  };

  // Get pack item count
  const getPackItemCount = (pack: (typeof packs)[0]): number => {
    if (!pack.summaryJson) return 0;
    return (
      pack.summaryJson.tiers.must_read.length +
      pack.summaryJson.tiers.worth_scanning.length +
      pack.summaryJson.tiers.headlines.length
    );
  };

  // If no topic selected
  if (!topicId) {
    return (
      <div className={styles.catchupEmpty}>
        <p className={styles.catchupEmptyText}>{t("feed.catchup.selectTopic")}</p>
      </div>
    );
  }

  // If viewing a specific pack
  if (selectedPackId && packDetail) {
    const pack = packDetail.pack;
    const items = packDetail.items;

    // Group items by tier
    const mustReadIds = new Set(pack.summaryJson?.tiers.must_read.map((i) => i.item_id) ?? []);
    const worthScanningIds = new Set(
      pack.summaryJson?.tiers.worth_scanning.map((i) => i.item_id) ?? [],
    );
    const headlinesIds = new Set(pack.summaryJson?.tiers.headlines.map((i) => i.item_id) ?? []);

    const mustReadItems = items.filter((i) => mustReadIds.has(i.id) && !hiddenItemIds.has(i.id));
    const worthScanningItems = items.filter(
      (i) => worthScanningIds.has(i.id) && !hiddenItemIds.has(i.id),
    );
    const headlinesItems = items.filter((i) => headlinesIds.has(i.id) && !hiddenItemIds.has(i.id));

    // Still generating
    if (pack.status === "pending") {
      return (
        <div className={styles.catchupGenerating}>
          <div className={styles.catchupGeneratingSpinner} />
          <p className={styles.catchupGeneratingText}>{t("feed.catchup.generating")}</p>
        </div>
      );
    }

    // Error or skipped
    if (pack.status === "error" || pack.status === "skipped") {
      return (
        <div className={styles.catchupPanel}>
          <button type="button" className={styles.catchupBackBtn} onClick={showGenerationPanel}>
            <ArrowLeftIcon />
            {t("feed.catchup.back")}
          </button>
          <div className={styles.catchupError}>
            {pack.errorMessage ||
              (pack.status === "skipped" ? "Skipped - not enough items" : "Generation failed")}
          </div>
        </div>
      );
    }

    const summary = pack.summaryJson;
    const themes = summary?.themes ?? [];
    const notes = summary?.notes;

    return (
      <div>
        <button type="button" className={styles.catchupBackBtn} onClick={showGenerationPanel}>
          <ArrowLeftIcon />
          {t("feed.catchup.back")}
        </button>

        {/* AI Summary section */}
        {(notes || themes.length > 0) && (
          <div className={styles.catchupSummary}>
            <div className={styles.catchupSummaryHeader}>
              <SparklesIcon />
              AI Summary
            </div>
            {notes && <p className={styles.catchupNotes}>{notes}</p>}
            {themes.length > 0 && (
              <div className={styles.catchupThemes}>
                <div className={styles.catchupThemesLabel}>Key Themes</div>
                {themes.map((theme, idx) => (
                  <div key={idx} className={styles.catchupTheme}>
                    <h4 className={styles.catchupThemeTitle}>{theme.title}</h4>
                    <p className={styles.catchupThemeSummary}>{theme.summary}</p>
                    <div className={styles.catchupThemeCount}>
                      {theme.item_ids.length} item{theme.item_ids.length !== 1 ? "s" : ""}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Must Read tier */}
        {mustReadItems.length > 0 && (
          <div className={styles.catchupTierSection} data-tier="must-read">
            <div className={styles.catchupTierHeader}>
              <h3 className={styles.catchupTierTitle}>{t("feed.catchup.tiers.mustRead")}</h3>
              <span className={styles.catchupTierCount}>{mustReadItems.length}</span>
            </div>
            <div className={styles.catchupTierItems}>
              {mustReadItems.map((item) => (
                <FeedItem
                  key={item.id}
                  item={packItemToFeedItem(item, pack.id)}
                  onFeedback={handleCatchupFeedback}
                  onClear={onClearFeedback}
                  layout={layout}
                  showTopicBadge={false}
                  forceExpanded={false}
                  fastTriageMode={fastTriageMode}
                  onViewSummary={onViewSummary}
                  onSummaryGenerated={onSummaryGenerated}
                  onNext={() => {}}
                  onClose={() => {}}
                  sort={sort}
                  onMobileClick={
                    isMobile
                      ? () => onMobileItemClick(packItemToFeedItem(item, pack.id))
                      : undefined
                  }
                />
              ))}
            </div>
          </div>
        )}

        {/* Worth Scanning tier */}
        {worthScanningItems.length > 0 && (
          <div className={styles.catchupTierSection} data-tier="worth-scanning">
            <div className={styles.catchupTierHeader}>
              <h3 className={styles.catchupTierTitle}>{t("feed.catchup.tiers.worthScanning")}</h3>
              <span className={styles.catchupTierCount}>{worthScanningItems.length}</span>
            </div>
            <div className={styles.catchupTierItems}>
              {worthScanningItems.map((item) => (
                <FeedItem
                  key={item.id}
                  item={packItemToFeedItem(item, pack.id)}
                  onFeedback={handleCatchupFeedback}
                  onClear={onClearFeedback}
                  layout={layout}
                  showTopicBadge={false}
                  forceExpanded={false}
                  fastTriageMode={fastTriageMode}
                  onViewSummary={onViewSummary}
                  onSummaryGenerated={onSummaryGenerated}
                  onNext={() => {}}
                  onClose={() => {}}
                  sort={sort}
                  onMobileClick={
                    isMobile
                      ? () => onMobileItemClick(packItemToFeedItem(item, pack.id))
                      : undefined
                  }
                />
              ))}
            </div>
          </div>
        )}

        {/* Headlines tier */}
        {headlinesItems.length > 0 && (
          <div className={styles.catchupTierSection} data-tier="headlines">
            <div className={styles.catchupTierHeader}>
              <h3 className={styles.catchupTierTitle}>{t("feed.catchup.tiers.headlines")}</h3>
              <span className={styles.catchupTierCount}>{headlinesItems.length}</span>
            </div>
            <div className={styles.catchupTierItems}>
              {headlinesItems.map((item) => (
                <FeedItem
                  key={item.id}
                  item={packItemToFeedItem(item, pack.id)}
                  onFeedback={handleCatchupFeedback}
                  onClear={onClearFeedback}
                  layout={layout}
                  showTopicBadge={false}
                  forceExpanded={false}
                  fastTriageMode={fastTriageMode}
                  onViewSummary={onViewSummary}
                  onSummaryGenerated={onSummaryGenerated}
                  onNext={() => {}}
                  onClose={() => {}}
                  sort={sort}
                  onMobileClick={
                    isMobile
                      ? () => onMobileItemClick(packItemToFeedItem(item, pack.id))
                      : undefined
                  }
                />
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {mustReadItems.length === 0 &&
          worthScanningItems.length === 0 &&
          headlinesItems.length === 0 && (
            <div className={styles.catchupEmpty}>
              <p className={styles.catchupEmptyText}>{t("feed.catchup.noItems")}</p>
            </div>
          )}
      </div>
    );
  }

  // Loading pack detail
  if (selectedPackId && isLoadingPackDetail) {
    return (
      <div className={styles.catchupGenerating}>
        <div className={styles.catchupGeneratingSpinner} />
        <p className={styles.catchupGeneratingText}>{t("common.loading")}</p>
      </div>
    );
  }

  // Generation panel (default view)
  return (
    <div className={styles.catchupPanel}>
      <div className={styles.catchupPanelHeader}>
        <h2 className={styles.catchupPanelTitle}>{t("feed.catchup.panelTitle")}</h2>
      </div>

      <div className={styles.catchupForm}>
        <div className={styles.catchupFormField}>
          <label className={styles.catchupFormLabel} htmlFor="catchup-timeframe">
            {t("feed.catchup.timeRange")}
          </label>
          <select
            id="catchup-timeframe"
            className={styles.catchupFormSelect}
            value={timeframeDays}
            onChange={(e) => setTimeframeDays(Number.parseInt(e.target.value, 10))}
          >
            <option value={3}>Last 3 days</option>
            <option value={7}>Last 7 days</option>
            <option value={14}>Last 14 days</option>
          </select>
        </div>

        <div className={styles.catchupFormField}>
          <label className={styles.catchupFormLabel} htmlFor="catchup-budget">
            {t("feed.catchup.readingTime")}
          </label>
          <select
            id="catchup-budget"
            className={styles.catchupFormSelect}
            value={timeBudgetMinutes}
            onChange={(e) => setTimeBudgetMinutes(Number.parseInt(e.target.value, 10))}
          >
            <option value={30}>30 minutes</option>
            <option value={45}>45 minutes</option>
            <option value={60}>60 minutes</option>
            <option value={90}>90 minutes</option>
          </select>
        </div>

        <button
          type="button"
          className={`btn btn-primary ${styles.catchupGenerateBtn}`}
          onClick={handleGenerate}
          disabled={createPack.isPending || !topicId}
        >
          {createPack.isPending ? t("feed.catchup.generating") : t("feed.catchup.generate")}
        </button>
      </div>

      {error && <div className={styles.catchupError}>{error}</div>}

      {/* Previous packs */}
      {packs.length > 0 && (
        <div className={styles.catchupPrevious}>
          <h3 className={styles.catchupPreviousTitle}>{t("feed.catchup.previous")}</h3>
          <div className={styles.catchupPreviousList}>
            {packs.map((pack) => {
              const itemCount = getPackItemCount(pack);
              return (
                <button
                  key={pack.id}
                  type="button"
                  className={styles.catchupPreviousItem}
                  onClick={() => setSelectedPackId(pack.id)}
                >
                  <div className={styles.catchupPreviousItemInfo}>
                    <span>{formatRelativeTime(pack.createdAt)}</span>
                    {pack.status === "complete" && itemCount > 0 && (
                      <span>({itemCount} items)</span>
                    )}
                  </div>
                  <span className={styles.catchupPreviousItemStatus} data-status={pack.status}>
                    {pack.status === "complete"
                      ? "Ready"
                      : pack.status === "pending"
                        ? "Generating"
                        : pack.status === "error"
                          ? "Failed"
                          : "Skipped"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Loading packs */}
      {isLoadingPacks && packs.length === 0 && (
        <div className={styles.catchupGenerating}>
          <div className={styles.catchupGeneratingSpinner} />
        </div>
      )}
    </div>
  );
}

function ArrowLeftIcon() {
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

function SparklesIcon() {
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
      <path d="M12 3l1.912 5.813a2 2 0 001.275 1.275L21 12l-5.813 1.912a2 2 0 00-1.275 1.275L12 21l-1.912-5.813a2 2 0 00-1.275-1.275L3 12l5.813-1.912a2 2 0 001.275-1.275L12 3z" />
      <path d="M5 3v4" />
      <path d="M3 5h4" />
      <path d="M19 17v4" />
      <path d="M17 19h4" />
    </svg>
  );
}
