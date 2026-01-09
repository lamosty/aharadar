"use client";

import { Suspense, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useItems, useFeedback, useTopicMarkChecked, useTopics, usePageLayout } from "@/lib/hooks";
import { FeedItem, FeedItemSkeleton, FeedFilterBar } from "@/components/Feed";
import { TopicSwitcher } from "@/components/TopicSwitcher";
import { LayoutToggle } from "@/components/LayoutToggle";
import { useTopic } from "@/components/TopicProvider";
import Link from "next/link";
import { useToast } from "@/components/Toast";
import { t } from "@/lib/i18n";
import styles from "./page.module.css";

type SortOption = "score_desc" | "date_desc" | "date_asc";

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
  const { currentTopicId, isReady: topicReady } = useTopic();
  const { data: topicsData, isLoading: topicsLoading } = useTopics();
  const { layout, setLayout, hasOverride, resetToGlobal } = usePageLayout("feed");

  const hasTopics = topicsData?.topics && topicsData.topics.length > 0;

  // Parse URL params
  const sourcesParam = searchParams.get("sources");
  const sortParam = searchParams.get("sort") as SortOption | null;

  const [selectedSources, setSelectedSources] = useState<string[]>(
    sourcesParam ? sourcesParam.split(",").filter(Boolean) : []
  );
  const [sort, setSort] = useState<SortOption>(sortParam || "score_desc");

  // Update URL when filters change
  const updateUrl = useCallback(
    (sources: string[], newSort: SortOption) => {
      const params = new URLSearchParams();
      if (sources.length > 0) params.set("sources", sources.join(","));
      if (newSort !== "score_desc") params.set("sort", newSort);
      const query = params.toString();
      router.replace(query ? `/app/feed?${query}` : "/app/feed", { scroll: false });
    },
    [router]
  );

  const handleSourcesChange = useCallback(
    (sources: string[]) => {
      setSelectedSources(sources);
      updateUrl(sources, sort);
    },
    [sort, updateUrl]
  );

  const handleSortChange = useCallback(
    (newSort: SortOption) => {
      setSort(newSort);
      updateUrl(selectedSources, newSort);
    },
    [selectedSources, updateUrl]
  );

  // Fetch items - wait for topic context to be ready
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, isError, error } = useItems({
    sourceTypes: selectedSources.length > 0 ? selectedSources : undefined,
    sort,
    limit: 20,
    topicId: currentTopicId || undefined,
  });

  // Feedback mutation
  const feedbackMutation = useFeedback({
    onError: () => {
      addToast("Failed to save feedback. Please try again.", "error");
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
      const item = data?.pages.flatMap((p) => p.items).find((i) => i.id === contentItemId);
      await feedbackMutation.mutateAsync({
        contentItemId,
        digestId: item?.digestId,
        action,
      });
    },
    [data, feedbackMutation]
  );

  // Flatten pages into single items array
  const allItems = data?.pages.flatMap((page) => page.items) ?? [];
  const totalCount = data?.pages[0]?.pagination.total;

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
            <LayoutToggle
              layout={layout}
              onLayoutChange={setLayout}
              hasOverride={hasOverride}
              onResetToGlobal={resetToGlobal}
              size="sm"
            />
            <TopicSwitcher />
            <button
              className={`btn btn-secondary ${styles.markCaughtUpBtn}`}
              onClick={handleMarkCaughtUp}
              disabled={markCheckedMutation.isPending || !currentTopicId}
            >
              {markCheckedMutation.isPending
                ? t("digests.feed.markingCaughtUp")
                : t("digests.feed.markCaughtUp")}
            </button>
          </div>
        </div>
      </header>

      <FeedFilterBar
        selectedSources={selectedSources}
        onSourcesChange={handleSourcesChange}
        sort={sort}
        onSortChange={handleSortChange}
        totalCount={totalCount}
        layout={layout}
      />

      {isLoading && (
        <div className={styles.feedList}>
          {Array.from({ length: 5 }).map((_, i) => (
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

      {!isLoading && !isError && allItems.length === 0 && (
        <div className={styles.emptyState}>
          <p className={styles.emptyTitle}>No items yet</p>
          <p className={styles.emptyMessage}>Run the pipeline to fetch and rank items from your sources.</p>
        </div>
      )}

      {!isLoading && !isError && allItems.length > 0 && (
        <>
          <div className={styles.feedList} data-layout={layout}>
            {allItems.map((item) => (
              <FeedItem key={item.id} item={item} onFeedback={handleFeedback} layout={layout} />
            ))}
          </div>

          {hasNextPage && (
            <div className={styles.loadMore}>
              <button
                className="btn btn-secondary"
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
              >
                {isFetchingNextPage ? "Loading..." : "Load more"}
              </button>
            </div>
          )}

          {!hasNextPage && allItems.length > 0 && (
            <div className={styles.endOfFeed}>
              <p>You've reached the end</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
