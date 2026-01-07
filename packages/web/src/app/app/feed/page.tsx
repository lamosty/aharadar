"use client";

import { Suspense, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useItems, useFeedback, useMarkChecked } from "@/lib/hooks";
import { FeedItem, FeedItemSkeleton, FeedFilterBar } from "@/components/Feed";
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

  // Fetch items
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, isError, error } = useItems({
    sourceTypes: selectedSources.length > 0 ? selectedSources : undefined,
    sort,
    limit: 20,
  });

  // Feedback mutation
  const feedbackMutation = useFeedback({
    onError: () => {
      addToast("Failed to save feedback. Please try again.", "error");
    },
  });

  // Mark as caught up mutation
  const markCheckedMutation = useMarkChecked({
    onSuccess: () => {
      addToast(t("digests.feed.caughtUpSuccess"), "success");
    },
    onError: () => {
      addToast(t("digests.feed.caughtUpError"), "error");
    },
  });

  const handleMarkCaughtUp = useCallback(() => {
    markCheckedMutation.mutate();
  }, [markCheckedMutation]);

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

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.headerTop}>
          <div>
            <h1 className={styles.title}>Feed</h1>
            <p className={styles.subtitle}>All your ranked items in one place</p>
          </div>
          <button
            className={`btn btn-secondary ${styles.markCaughtUpBtn}`}
            onClick={handleMarkCaughtUp}
            disabled={markCheckedMutation.isPending}
          >
            {markCheckedMutation.isPending
              ? t("digests.feed.markingCaughtUp")
              : t("digests.feed.markCaughtUp")}
          </button>
        </div>
      </header>

      <FeedFilterBar
        selectedSources={selectedSources}
        onSourcesChange={handleSourcesChange}
        sort={sort}
        onSortChange={handleSortChange}
        totalCount={totalCount}
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
          <div className={styles.feedList}>
            {allItems.map((item) => (
              <FeedItem key={item.id} item={item} onFeedback={handleFeedback} />
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
