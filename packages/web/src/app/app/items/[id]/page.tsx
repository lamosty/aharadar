"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { t } from "@/lib/i18n";
import { JsonViewer } from "@/components";
import styles from "./page.module.css";

// Types for content item based on API spec
interface ContentItem {
  id: string;
  title: string | null;
  url: string;
  author: string | null;
  publishedAt: string | null;
  sourceType: string;
  sourceName: string;
  metadata: Record<string, unknown> | null;
  digestId?: string;
}

// Mock data placeholder - will be replaced by useItem(id) from data layer
function useMockItem(id: string): {
  item: ContentItem | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
} {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Simulate API fetch delay
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 800);
    return () => clearTimeout(timer);
  }, [id]);

  const mockItem: ContentItem = {
    id,
    title: "Understanding Large Language Models: A Comprehensive Guide",
    url: "https://example.com/article/understanding-llms",
    author: "Jane Smith",
    publishedAt: "2025-01-05T14:30:00Z",
    sourceType: "rss",
    sourceName: "Tech Blog",
    digestId: "digest-123",
    metadata: {
      feedUrl: "https://example.com/feed.xml",
      categories: ["AI", "Machine Learning", "Technology"],
      wordCount: 2450,
      readingTime: "12 min",
      language: "en",
      excerpt:
        "Large language models have transformed how we interact with technology. This guide covers the fundamentals...",
      thumbnailUrl: "https://example.com/images/llm-guide.jpg",
      engagement: {
        likes: 142,
        comments: 23,
        shares: 56,
      },
      triageScore: 0.87,
      triageReason: "High relevance to your interests in AI and technology",
    },
  };

  const refetch = () => {
    setIsLoading(true);
    setError(null);
    setTimeout(() => {
      setIsLoading(false);
    }, 800);
  };

  return {
    item: isLoading || error ? null : mockItem,
    isLoading,
    error,
    refetch,
  };
}

function formatDate(dateString: string | null): string {
  if (!dateString) return "";
  try {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  } catch {
    return dateString;
  }
}

function ItemSkeleton() {
  return (
    <div className={styles.skeleton} aria-busy="true" aria-label={t("item.loading")}>
      <div className={styles.skeletonBreadcrumb} />
      <div className={styles.skeletonTitle} />
      <div className={styles.skeletonMeta}>
        <div className={styles.skeletonMetaItem} />
        <div className={styles.skeletonMetaItem} />
        <div className={styles.skeletonMetaItem} />
      </div>
      <div className={styles.skeletonButton} />
      <div className={styles.skeletonMetadata} />
    </div>
  );
}

function ErrorState({
  error,
  onRetry,
}: {
  error: Error;
  onRetry: () => void;
}) {
  return (
    <div className={styles.error} role="alert">
      <ErrorIcon />
      <h2 className={styles.errorTitle}>{t("item.error")}</h2>
      <p className={styles.errorMessage}>{error.message}</p>
      <button type="button" className={`btn btn-primary ${styles.retryButton}`} onClick={onRetry}>
        {t("common.retry")}
      </button>
    </div>
  );
}

function NotFoundState() {
  return (
    <div className={styles.notFound} role="alert">
      <NotFoundIcon />
      <h2 className={styles.notFoundTitle}>{t("item.notFound")}</h2>
      <Link href="/app/digests" className={`btn btn-secondary ${styles.backLink}`}>
        {t("item.backToDigest")}
      </Link>
    </div>
  );
}

export default function ItemDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const { item, isLoading, error, refetch } = useMockItem(id);

  if (isLoading) {
    return (
      <div className={styles.page}>
        <ItemSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.page}>
        <ErrorState error={error} onRetry={refetch} />
      </div>
    );
  }

  if (!item) {
    return (
      <div className={styles.page}>
        <NotFoundState />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      {/* Breadcrumb navigation */}
      <nav className={styles.breadcrumb} aria-label="Breadcrumb">
        <Link href="/app/digests" className={styles.breadcrumbLink}>
          {t("nav.digests")}
        </Link>
        {item.digestId && (
          <>
            <span className={styles.breadcrumbSeparator} aria-hidden="true">
              /
            </span>
            <Link
              href={`/app/digests/${item.digestId}`}
              className={styles.breadcrumbLink}
            >
              Digest
            </Link>
          </>
        )}
        <span className={styles.breadcrumbSeparator} aria-hidden="true">
          /
        </span>
        <span className={styles.breadcrumbCurrent} aria-current="page">
          {t("item.title")}
        </span>
      </nav>

      {/* Header section */}
      <header className={styles.header}>
        <h1 className={styles.title}>{item.title || t("item.noTitle")}</h1>

        <dl className={styles.meta}>
          {item.author && (
            <div className={styles.metaItem}>
              <dt className="sr-only">{t("item.author")}</dt>
              <dd className={styles.metaValue}>
                <AuthorIcon />
                <span>{item.author}</span>
              </dd>
            </div>
          )}

          {item.publishedAt && (
            <div className={styles.metaItem}>
              <dt className="sr-only">{t("item.publishedAt")}</dt>
              <dd className={styles.metaValue}>
                <CalendarIcon />
                <time dateTime={item.publishedAt}>
                  {formatDate(item.publishedAt)}
                </time>
              </dd>
            </div>
          )}

          <div className={styles.metaItem}>
            <dt className="sr-only">{t("item.source")}</dt>
            <dd className={styles.metaValue}>
              <SourceIcon />
              <span>
                {item.sourceName} ({item.sourceType})
              </span>
            </dd>
          </div>
        </dl>
      </header>

      {/* Actions */}
      <div className={styles.actions}>
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className={`btn btn-primary ${styles.openButton}`}
        >
          <ExternalLinkIcon />
          {t("item.openOriginal")}
        </a>
      </div>

      {/* Metadata viewer */}
      {item.metadata && (
        <section className={styles.metadataSection}>
          <JsonViewer
            data={item.metadata}
            label={t("item.metadata")}
            initialCollapsed={true}
            maxDepth={4}
            maxStringLength={300}
          />
        </section>
      )}
    </div>
  );
}

// Icons
function AuthorIcon() {
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
      className={styles.icon}
    >
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function CalendarIcon() {
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
      className={styles.icon}
    >
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function SourceIcon() {
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
      className={styles.icon}
    >
      <path d="M4 11a9 9 0 0 1 9 9" />
      <path d="M4 4a16 16 0 0 1 16 16" />
      <circle cx="5" cy="19" r="1" />
    </svg>
  );
}

function ExternalLinkIcon() {
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
      className={styles.icon}
    >
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

function ErrorIcon() {
  return (
    <svg
      width="48"
      height="48"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={styles.stateIcon}
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

function NotFoundIcon() {
  return (
    <svg
      width="48"
      height="48"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={styles.stateIcon}
    >
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
      <line x1="8" y1="11" x2="14" y2="11" />
    </svg>
  );
}
