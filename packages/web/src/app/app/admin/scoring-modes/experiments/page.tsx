"use client";

import Link from "next/link";
import { useState } from "react";
import { useToast } from "@/components/Toast";
import type { ExperimentOutcome, ScoringExperiment } from "@/lib/api";
import {
  useScoringExperimentEnd,
  useScoringExperiments,
  useScoringModes,
  useTopics,
} from "@/lib/hooks";
import styles from "./page.module.css";

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(startedAt: string, endedAt: string | null): string {
  const start = new Date(startedAt);
  const end = endedAt ? new Date(endedAt) : new Date();
  const days = Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  if (days === 0) return "Started today";
  if (days === 1) return "1 day";
  return `${days} days`;
}

function getHitRate(exp: ScoringExperiment): string | null {
  const total = exp.itemsLiked + exp.itemsDisliked;
  if (total === 0) return null;
  return `${Math.round((exp.itemsLiked / total) * 100)}%`;
}

function getOutcomeClass(outcome: ExperimentOutcome | null): string {
  switch (outcome) {
    case "positive":
      return styles.outcomePositive;
    case "negative":
      return styles.outcomeNegative;
    case "neutral":
      return styles.outcomeNeutral;
    default:
      return "";
  }
}

export default function ExperimentsPage() {
  const { addToast } = useToast();
  const [filterTopicId, setFilterTopicId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "ended">("all");
  const [searchQuery, setSearchQuery] = useState("");

  const { data: topicsData } = useTopics();
  const { data: modesData } = useScoringModes();
  const {
    data: experimentsData,
    isLoading,
    error,
  } = useScoringExperiments({
    topicId: filterTopicId ?? undefined,
    activeOnly: filterStatus === "active" ? true : undefined,
    limit: 100,
  });
  const endExperimentMutation = useScoringExperimentEnd();

  const [endingExperimentId, setEndingExperimentId] = useState<string | null>(null);

  const topics = topicsData?.topics ?? [];
  const modes = modesData?.modes ?? [];
  const experiments = experimentsData?.experiments ?? [];

  // Apply filters
  const filteredExperiments = experiments.filter((exp) => {
    // Status filter
    if (filterStatus === "active" && exp.endedAt) return false;
    if (filterStatus === "ended" && !exp.endedAt) return false;

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchesName = exp.name.toLowerCase().includes(query);
      const matchesHypothesis = exp.hypothesis?.toLowerCase().includes(query);
      if (!matchesName && !matchesHypothesis) return false;
    }

    return true;
  });

  // Group experiments
  const activeExperiments = filteredExperiments.filter((e) => !e.endedAt);
  const endedExperiments = filteredExperiments.filter((e) => e.endedAt);

  async function handleEndExperiment(exp: ScoringExperiment) {
    if (endingExperimentId !== exp.id) {
      setEndingExperimentId(exp.id);
      return;
    }

    try {
      await endExperimentMutation.mutateAsync({ id: exp.id, data: {} });
      addToast(`Experiment "${exp.name}" ended`, "success");
      setEndingExperimentId(null);
    } catch (err) {
      addToast(`Failed to end experiment: ${(err as Error).message}`, "error");
      setEndingExperimentId(null);
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/app/admin/scoring-modes" className={styles.backLink}>
          <BackIcon />
          <span>Back to Scoring Modes</span>
        </Link>
        <div className={styles.headerRow}>
          <div>
            <h1 className={styles.title}>Experiments</h1>
            <p className={styles.subtitle}>
              Test scoring modes and track their performance over time
            </p>
          </div>
        </div>
      </header>

      {/* Filters */}
      <div className={styles.filters}>
        <div className={styles.filterGroup}>
          <label className={styles.filterLabel}>Topic</label>
          <select
            className={styles.select}
            value={filterTopicId ?? ""}
            onChange={(e) => setFilterTopicId(e.target.value || null)}
          >
            <option value="">All Topics</option>
            {topics.map((topic) => (
              <option key={topic.id} value={topic.id}>
                {topic.name}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.filterGroup}>
          <label className={styles.filterLabel}>Status</label>
          <select
            className={styles.select}
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as "all" | "active" | "ended")}
          >
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="ended">Ended</option>
          </select>
        </div>

        <div className={styles.filterGroup}>
          <label className={styles.filterLabel}>Search</label>
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Search by name or hypothesis..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className={styles.experimentsList}>
          {[1, 2, 3].map((i) => (
            <div key={i} className={`${styles.skeleton} ${styles.skeletonCard}`} />
          ))}
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className={styles.error} role="alert">
          <ErrorIcon />
          <span>{error.message || "Failed to load experiments"}</span>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !error && filteredExperiments.length === 0 && (
        <div className={styles.emptyCard}>
          <div className={styles.emptyIcon}>
            <ExperimentIcon />
          </div>
          <h3 className={styles.emptyTitle}>No experiments found</h3>
          <p className={styles.emptyDescription}>
            {searchQuery || filterTopicId
              ? "Try adjusting your filters"
              : "Start an experiment by assigning a scoring mode to a topic"}
          </p>
        </div>
      )}

      {/* Active Experiments */}
      {!isLoading && !error && activeExperiments.length > 0 && (
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>
              <ActiveIcon />
              Active Experiments
            </h2>
            <span className={styles.badge}>{activeExperiments.length}</span>
          </div>
          <div className={styles.experimentsList}>
            {activeExperiments.map((exp) => {
              const mode = modes.find((m) => m.id === exp.modeId);
              const topic = topics.find((t) => t.id === exp.topicId);
              const hitRate = getHitRate(exp);
              const isEnding = endingExperimentId === exp.id;

              return (
                <div key={exp.id} className={styles.experimentCard}>
                  <div className={styles.experimentHeader}>
                    <Link
                      href={`/app/admin/scoring-modes/experiments/${exp.id}`}
                      className={styles.experimentNameLink}
                    >
                      {exp.name}
                    </Link>
                    <span className={styles.experimentDuration}>
                      {formatDuration(exp.startedAt, null)}
                    </span>
                  </div>

                  <div className={styles.experimentMeta}>
                    <span className={styles.metaItem}>
                      <span className={styles.metaLabel}>Mode:</span>
                      <Link
                        href={`/app/admin/scoring-modes/${exp.modeId}`}
                        className={styles.metaLink}
                      >
                        {mode?.name ?? "Unknown"}
                      </Link>
                    </span>
                    <span className={styles.metaItem}>
                      <span className={styles.metaLabel}>Topic:</span>
                      <span>{topic?.name ?? "Unknown"}</span>
                    </span>
                  </div>

                  {exp.hypothesis && (
                    <p className={styles.experimentHypothesis}>{exp.hypothesis}</p>
                  )}

                  <div className={styles.experimentMetrics}>
                    <div className={styles.metric}>
                      <span className={styles.metricValue}>{exp.digestsGenerated}</span>
                      <span className={styles.metricLabel}>Digests</span>
                    </div>
                    <div className={styles.metric}>
                      <span className={styles.metricValue}>{exp.itemsShown}</span>
                      <span className={styles.metricLabel}>Items Shown</span>
                    </div>
                    <div className={styles.metric}>
                      <span className={styles.metricValue}>{exp.itemsLiked}</span>
                      <span className={styles.metricLabel}>Liked</span>
                    </div>
                    <div className={styles.metric}>
                      <span className={styles.metricValue}>{exp.itemsDisliked}</span>
                      <span className={styles.metricLabel}>Disliked</span>
                    </div>
                    {hitRate && (
                      <div className={styles.metric}>
                        <span className={styles.metricValue}>{hitRate}</span>
                        <span className={styles.metricLabel}>Hit Rate</span>
                      </div>
                    )}
                  </div>

                  <div className={styles.experimentActions}>
                    <Link
                      href={`/app/admin/scoring-modes/experiments/${exp.id}`}
                      className={styles.secondaryButton}
                    >
                      View Details
                    </Link>
                    <button
                      className={isEnding ? styles.dangerButton : styles.ghostButton}
                      onClick={() => handleEndExperiment(exp)}
                      disabled={endExperimentMutation.isPending}
                    >
                      {isEnding ? "Confirm End" : "End Experiment"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Past Experiments */}
      {!isLoading && !error && endedExperiments.length > 0 && (
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>
              <HistoryIcon />
              Past Experiments
            </h2>
            <span className={styles.badge}>{endedExperiments.length}</span>
          </div>
          <div className={styles.experimentsList}>
            {endedExperiments.map((exp) => {
              const mode = modes.find((m) => m.id === exp.modeId);
              const topic = topics.find((t) => t.id === exp.topicId);
              const hitRate = getHitRate(exp);

              return (
                <Link
                  key={exp.id}
                  href={`/app/admin/scoring-modes/experiments/${exp.id}`}
                  className={styles.experimentCardLink}
                >
                  <div className={styles.experimentCardEnded}>
                    <div className={styles.experimentHeader}>
                      <span className={styles.experimentName}>{exp.name}</span>
                      <div className={styles.experimentHeaderRight}>
                        {exp.outcome && (
                          <span
                            className={`${styles.outcomeBadge} ${getOutcomeClass(exp.outcome)}`}
                          >
                            {exp.outcome}
                          </span>
                        )}
                        <span className={styles.experimentDurationEnded}>
                          {formatDuration(exp.startedAt, exp.endedAt)}
                        </span>
                      </div>
                    </div>

                    <div className={styles.experimentMeta}>
                      <span className={styles.metaItem}>
                        <span className={styles.metaLabel}>Mode:</span>
                        <span>{mode?.name ?? "Unknown"}</span>
                      </span>
                      <span className={styles.metaItem}>
                        <span className={styles.metaLabel}>Topic:</span>
                        <span>{topic?.name ?? "Unknown"}</span>
                      </span>
                      <span className={styles.metaItem}>
                        <span className={styles.metaLabel}>Ended:</span>
                        <span>{exp.endedAt ? formatDate(exp.endedAt) : "-"}</span>
                      </span>
                    </div>

                    <div className={styles.experimentMetricsCompact}>
                      <span>
                        {exp.itemsLiked} liked / {exp.itemsDisliked} disliked
                      </span>
                      {hitRate && <span className={styles.hitRateBadge}>{hitRate} hit rate</span>}
                    </div>

                    {exp.learnings && <p className={styles.experimentLearnings}>{exp.learnings}</p>}
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* Info Section */}
      <section className={styles.infoSection}>
        <h3 className={styles.infoTitle}>About Experiments</h3>
        <div className={styles.infoContent}>
          <p>
            <strong>Experiments</strong> let you test different scoring modes and track their
            effectiveness over time. When you assign a scoring mode to a topic, an experiment is
            automatically started.
          </p>
          <p>
            Key metrics tracked include items shown, liked, disliked, and hit rate (likes / total
            feedback). End experiments to record outcomes and learnings for future reference.
          </p>
        </div>
      </section>
    </div>
  );
}

function BackIcon() {
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

function ExperimentIcon() {
  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4.5 3h15" />
      <path d="M6 3v16a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V3" />
      <path d="M6 14h12" />
    </svg>
  );
}

function ActiveIcon() {
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
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  );
}

function HistoryIcon() {
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
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function ErrorIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
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
