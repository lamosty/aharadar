"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { JsonViewer } from "@/components";
import { useItem, useItemRelatedContext } from "@/lib/hooks";
import { t } from "@/lib/i18n";
import styles from "./page.module.css";

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

function ErrorState({ errorMessage, onRetry }: { errorMessage: string; onRetry: () => void }) {
  return (
    <div className={styles.error} role="alert">
      <ErrorIcon />
      <h2 className={styles.errorTitle}>{t("item.error")}</h2>
      <p className={styles.errorMessage}>{errorMessage}</p>
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
  const searchParams = useSearchParams();
  const id = params.id as string;
  const digestId = searchParams.get("digestId");
  const { data, isLoading, isError, error, refetch } = useItem(id);
  const { data: relatedContextData } = useItemRelatedContext(id, undefined, {
    staleTime: 60_000,
  });
  const item = data?.item ?? null;
  const relatedBadges = relatedContextData?.badges ?? [];
  const relatedHints = relatedContextData?.hints ?? [];
  const relatedEntries = relatedContextData?.related_context ?? [];
  const showRelatedContext =
    relatedBadges.length > 0 || relatedHints.length > 0 || relatedEntries.length > 0;

  if (isLoading) {
    return (
      <div className={styles.page}>
        <ItemSkeleton />
      </div>
    );
  }

  if (isError) {
    return (
      <div className={styles.page}>
        <ErrorState errorMessage={error?.message || t("common.error")} onRetry={() => refetch()} />
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
        {digestId && (
          <>
            <span className={styles.breadcrumbSeparator} aria-hidden="true">
              /
            </span>
            <Link href={`/app/digests/${digestId}`} className={styles.breadcrumbLink}>
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
                <time dateTime={item.publishedAt}>{formatDate(item.publishedAt)}</time>
              </dd>
            </div>
          )}

          <div className={styles.metaItem}>
            <dt className="sr-only">{t("item.source")}</dt>
            <dd className={styles.metaValue}>
              <SourceIcon />
              <span>{item.sourceType}</span>
            </dd>
          </div>
        </dl>
      </header>

      {/* Actions */}
      {item.url && (
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
      )}

      {showRelatedContext && (
        <section className={styles.relatedContextSection} aria-label="Related context">
          {relatedBadges.length > 0 && (
            <div className={styles.badgesRow}>
              {relatedBadges.map((badge) => (
                <span
                  key={`${badge.code}-${badge.label}`}
                  className={`${styles.relatedBadge} ${
                    badge.level === "critical"
                      ? styles.relatedBadgeCritical
                      : badge.level === "warn"
                        ? styles.relatedBadgeWarn
                        : styles.relatedBadgeInfo
                  }`}
                >
                  {badge.label}
                </span>
              ))}
            </div>
          )}

          {relatedHints.length > 0 && (
            <ul className={styles.hintsList}>
              {relatedHints.map((hint, index) => (
                <li key={`${hint}-${index}`}>{hint}</li>
              ))}
            </ul>
          )}

          {relatedEntries.length > 0 && (
            <ul className={styles.relatedEntriesList}>
              {relatedEntries.map((entry) => (
                <li key={entry.context_id} className={styles.relatedEntryItem}>
                  <h3 className={styles.relatedEntryTitle}>{entry.title}</h3>
                  {entry.snippet && <p className={styles.relatedEntrySnippet}>{entry.snippet}</p>}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

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
