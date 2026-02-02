"use client";

import Link from "next/link";
import { use, useState } from "react";
import { useToast } from "@/components/Toast";
import type { ExperimentOutcome } from "@/lib/api";
import {
  useScoringExperiment,
  useScoringExperimentEnd,
  useScoringExperimentUpdate,
  useScoringMode,
  useTopic,
} from "@/lib/hooks";
import styles from "./page.module.css";

interface PageProps {
  params: Promise<{ id: string }>;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(startedAt: string, endedAt: string | null): string {
  const start = new Date(startedAt);
  const end = endedAt ? new Date(endedAt) : new Date();
  const diffMs = end.getTime() - start.getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

  if (days === 0) {
    if (hours === 0) return "Less than an hour";
    return `${hours} hour${hours !== 1 ? "s" : ""}`;
  }
  if (days === 1) return "1 day";
  return `${days} days`;
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

export default function ExperimentDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const { addToast } = useToast();
  const { data, isLoading, error, refetch } = useScoringExperiment(id);
  const updateMutation = useScoringExperimentUpdate();
  const endMutation = useScoringExperimentEnd();

  const experiment = data?.experiment;
  const { data: modeData } = useScoringMode(experiment?.modeId ?? "");
  const { data: topicData } = useTopic(experiment?.topicId ?? "");

  const mode = modeData?.mode;
  const topic = topicData?.topic;

  // Editing states
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesValue, setNotesValue] = useState("");
  const [editingHypothesis, setEditingHypothesis] = useState(false);
  const [hypothesisValue, setHypothesisValue] = useState("");

  // End experiment state
  const [showEndDialog, setShowEndDialog] = useState(false);
  const [endOutcome, setEndOutcome] = useState<ExperimentOutcome | null>(null);
  const [endLearnings, setEndLearnings] = useState("");

  function startEditingNotes() {
    setNotesValue(experiment?.notes ?? "");
    setEditingNotes(true);
  }

  async function saveNotes() {
    try {
      await updateMutation.mutateAsync({
        id,
        data: { notes: notesValue || null },
      });
      addToast("Notes updated", "success");
      setEditingNotes(false);
      refetch();
    } catch (err) {
      addToast(`Failed to update notes: ${(err as Error).message}`, "error");
    }
  }

  function startEditingHypothesis() {
    setHypothesisValue(experiment?.hypothesis ?? "");
    setEditingHypothesis(true);
  }

  async function saveHypothesis() {
    try {
      await updateMutation.mutateAsync({
        id,
        data: { hypothesis: hypothesisValue || null },
      });
      addToast("Hypothesis updated", "success");
      setEditingHypothesis(false);
      refetch();
    } catch (err) {
      addToast(`Failed to update hypothesis: ${(err as Error).message}`, "error");
    }
  }

  function openEndDialog() {
    setEndOutcome(null);
    setEndLearnings("");
    setShowEndDialog(true);
  }

  async function handleEndExperiment() {
    try {
      await endMutation.mutateAsync({
        id,
        data: {
          outcome: endOutcome,
          learnings: endLearnings || undefined,
        },
      });
      addToast("Experiment ended", "success");
      setShowEndDialog(false);
      refetch();
    } catch (err) {
      addToast(`Failed to end experiment: ${(err as Error).message}`, "error");
    }
  }

  if (isLoading) {
    return (
      <div className={styles.page}>
        <header className={styles.header}>
          <Link href="/app/admin/scoring-modes/experiments" className={styles.backLink}>
            <BackIcon />
            <span>Back</span>
          </Link>
          <div className={`${styles.skeleton} ${styles.skeletonTitle}`} />
        </header>
        <div className={`${styles.skeleton} ${styles.skeletonCard}`} />
        <div className={`${styles.skeleton} ${styles.skeletonCard}`} />
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.page}>
        <header className={styles.header}>
          <Link href="/app/admin/scoring-modes/experiments" className={styles.backLink}>
            <BackIcon />
            <span>Back</span>
          </Link>
          <h1 className={styles.title}>Experiment</h1>
        </header>
        <div className={styles.error} role="alert">
          <ErrorIcon />
          <span>{error.message || "Failed to load experiment"}</span>
        </div>
      </div>
    );
  }

  if (!experiment) return null;

  const isActive = !experiment.endedAt;
  const hitRate =
    experiment.itemsLiked + experiment.itemsDisliked > 0
      ? Math.round(
          (experiment.itemsLiked / (experiment.itemsLiked + experiment.itemsDisliked)) * 100,
        )
      : null;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/app/admin/scoring-modes/experiments" className={styles.backLink}>
          <BackIcon />
          <span>Back to Experiments</span>
        </Link>
        <div className={styles.headerRow}>
          <div>
            <div className={styles.titleRow}>
              <h1 className={styles.title}>{experiment.name}</h1>
              <span
                className={`${styles.statusBadge} ${isActive ? styles.statusActive : styles.statusEnded}`}
              >
                {isActive ? "Active" : "Ended"}
              </span>
              {experiment.outcome && (
                <span className={`${styles.outcomeBadge} ${getOutcomeClass(experiment.outcome)}`}>
                  {experiment.outcome}
                </span>
              )}
            </div>
            <div className={styles.subtitleRow}>
              <span>
                Testing{" "}
                <Link
                  href={`/app/admin/scoring-modes/${experiment.modeId}`}
                  className={styles.link}
                >
                  {mode?.name ?? "..."}
                </Link>{" "}
                on <span className={styles.topicName}>{topic?.name ?? "..."}</span>
              </span>
            </div>
          </div>
          {isActive && (
            <button className={styles.dangerButton} onClick={openEndDialog}>
              End Experiment
            </button>
          )}
        </div>
      </header>

      {/* Metrics Section */}
      <section className={styles.metricsSection}>
        <h2 className={styles.sectionTitle}>Metrics</h2>
        <div className={styles.metricsGrid}>
          <div className={styles.metricCard}>
            <span className={styles.metricValue}>{experiment.digestsGenerated}</span>
            <span className={styles.metricLabel}>Digests Generated</span>
          </div>
          <div className={styles.metricCard}>
            <span className={styles.metricValue}>{experiment.itemsShown}</span>
            <span className={styles.metricLabel}>Items Shown</span>
          </div>
          <div className={styles.metricCard}>
            <span className={`${styles.metricValue} ${styles.metricPositive}`}>
              {experiment.itemsLiked}
            </span>
            <span className={styles.metricLabel}>Items Liked</span>
          </div>
          <div className={styles.metricCard}>
            <span className={`${styles.metricValue} ${styles.metricNegative}`}>
              {experiment.itemsDisliked}
            </span>
            <span className={styles.metricLabel}>Items Disliked</span>
          </div>
          <div className={styles.metricCard}>
            <span className={styles.metricValue}>{experiment.itemsSkipped}</span>
            <span className={styles.metricLabel}>Items Skipped</span>
          </div>
          <div className={styles.metricCard}>
            <span className={styles.metricValue}>{hitRate !== null ? `${hitRate}%` : "-"}</span>
            <span className={styles.metricLabel}>Hit Rate</span>
          </div>
        </div>

        {/* Simple metrics bar */}
        {experiment.itemsLiked + experiment.itemsDisliked > 0 && (
          <div className={styles.metricsBar}>
            <div
              className={styles.metricsBarLiked}
              style={{
                width: `${(experiment.itemsLiked / (experiment.itemsLiked + experiment.itemsDisliked)) * 100}%`,
              }}
            />
            <div
              className={styles.metricsBarDisliked}
              style={{
                width: `${(experiment.itemsDisliked / (experiment.itemsLiked + experiment.itemsDisliked)) * 100}%`,
              }}
            />
          </div>
        )}
      </section>

      {/* Duration Section */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Timeline</h2>
        <div className={styles.timelineGrid}>
          <div className={styles.timelineItem}>
            <span className={styles.timelineLabel}>Started</span>
            <span className={styles.timelineValue}>{formatDate(experiment.startedAt)}</span>
          </div>
          <div className={styles.timelineItem}>
            <span className={styles.timelineLabel}>{isActive ? "Running for" : "Ended"}</span>
            <span className={styles.timelineValue}>
              {isActive
                ? formatDuration(experiment.startedAt, null)
                : experiment.endedAt
                  ? formatDate(experiment.endedAt)
                  : "-"}
            </span>
          </div>
          {!isActive && (
            <div className={styles.timelineItem}>
              <span className={styles.timelineLabel}>Duration</span>
              <span className={styles.timelineValue}>
                {formatDuration(experiment.startedAt, experiment.endedAt)}
              </span>
            </div>
          )}
        </div>
      </section>

      {/* Hypothesis Section */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Hypothesis</h2>
          {!editingHypothesis && (
            <button className={styles.editButton} onClick={startEditingHypothesis}>
              <EditIcon />
              Edit
            </button>
          )}
        </div>

        {editingHypothesis ? (
          <div className={styles.editCard}>
            <textarea
              className={styles.textarea}
              value={hypothesisValue}
              onChange={(e) => setHypothesisValue(e.target.value)}
              placeholder="What are you testing? What do you expect to happen?"
              rows={3}
            />
            <div className={styles.editActions}>
              <button
                className={styles.secondaryButton}
                onClick={() => setEditingHypothesis(false)}
              >
                Cancel
              </button>
              <button
                className={styles.primaryButton}
                onClick={saveHypothesis}
                disabled={updateMutation.isPending}
              >
                {updateMutation.isPending ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        ) : (
          <div className={styles.contentCard}>
            {experiment.hypothesis ? (
              <p className={styles.hypothesisText}>{experiment.hypothesis}</p>
            ) : (
              <p className={styles.muted}>No hypothesis recorded. Click Edit to add one.</p>
            )}
          </div>
        )}
      </section>

      {/* Notes Section */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Notes</h2>
          {!editingNotes && (
            <button className={styles.editButton} onClick={startEditingNotes}>
              <EditIcon />
              Edit
            </button>
          )}
        </div>

        {editingNotes ? (
          <div className={styles.editCard}>
            <textarea
              className={styles.textarea}
              value={notesValue}
              onChange={(e) => setNotesValue(e.target.value)}
              placeholder="Add observations, adjustments, or thoughts during the experiment..."
              rows={4}
            />
            <div className={styles.editActions}>
              <button className={styles.secondaryButton} onClick={() => setEditingNotes(false)}>
                Cancel
              </button>
              <button
                className={styles.primaryButton}
                onClick={saveNotes}
                disabled={updateMutation.isPending}
              >
                {updateMutation.isPending ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        ) : (
          <div className={styles.contentCard}>
            {experiment.notes ? (
              <p className={styles.notesText}>{experiment.notes}</p>
            ) : (
              <p className={styles.muted}>No notes yet. Click Edit to add.</p>
            )}
          </div>
        )}
      </section>

      {/* Learnings Section (only for ended experiments) */}
      {!isActive && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Learnings</h2>
          <div className={styles.contentCard}>
            {experiment.learnings ? (
              <p className={styles.learningsText}>{experiment.learnings}</p>
            ) : (
              <p className={styles.muted}>No learnings recorded.</p>
            )}
          </div>
        </section>
      )}

      {/* Mode Details */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Scoring Mode Details</h2>
          <Link href={`/app/admin/scoring-modes/${experiment.modeId}`} className={styles.viewLink}>
            View Mode
          </Link>
        </div>
        {mode ? (
          <div className={styles.modeCard}>
            <div className={styles.modeHeader}>
              <span className={styles.modeName}>{mode.name}</span>
              {mode.isDefault && <span className={styles.defaultBadge}>Default</span>}
            </div>
            {mode.description && <p className={styles.modeDescription}>{mode.description}</p>}
            <div className={styles.modeWeights}>
              <span>AI: {Math.round(mode.config.weights.wAha * 100)}%</span>
              <span>Heuristic: {Math.round(mode.config.weights.wHeuristic * 100)}%</span>
              <span>Pref: {Math.round(mode.config.weights.wPref * 100)}%</span>
              <span>Novelty: {Math.round(mode.config.weights.wNovelty * 100)}%</span>
            </div>
          </div>
        ) : (
          <div className={`${styles.skeleton} ${styles.skeletonSmall}`} />
        )}
      </section>

      {/* Metadata */}
      <div className={styles.metaSection}>
        <span>Created {formatDate(experiment.createdAt)}</span>
        <span className={styles.metaDot}>·</span>
        <span>Updated {formatDate(experiment.updatedAt)}</span>
      </div>

      {/* End Experiment Dialog */}
      {showEndDialog && (
        <div className={styles.dialogOverlay} onClick={() => setShowEndDialog(false)}>
          <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.dialogTitle}>End Experiment</h3>
            <p className={styles.dialogDescription}>
              Record the outcome and learnings from this experiment.
            </p>

            <div className={styles.formGroup}>
              <label className={styles.label}>Outcome</label>
              <div className={styles.outcomeOptions}>
                <button
                  type="button"
                  className={`${styles.outcomeOption} ${endOutcome === "positive" ? styles.outcomeOptionPositive : ""}`}
                  onClick={() => setEndOutcome("positive")}
                >
                  <CheckIcon />
                  Positive
                </button>
                <button
                  type="button"
                  className={`${styles.outcomeOption} ${endOutcome === "neutral" ? styles.outcomeOptionNeutral : ""}`}
                  onClick={() => setEndOutcome("neutral")}
                >
                  <MinusIcon />
                  Neutral
                </button>
                <button
                  type="button"
                  className={`${styles.outcomeOption} ${endOutcome === "negative" ? styles.outcomeOptionNegative : ""}`}
                  onClick={() => setEndOutcome("negative")}
                >
                  <XIcon />
                  Negative
                </button>
              </div>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Learnings (optional)</label>
              <textarea
                className={styles.textarea}
                value={endLearnings}
                onChange={(e) => setEndLearnings(e.target.value)}
                placeholder="What did you learn from this experiment?"
                rows={4}
              />
            </div>

            <div className={styles.dialogActions}>
              <button className={styles.secondaryButton} onClick={() => setShowEndDialog(false)}>
                Cancel
              </button>
              <button
                className={styles.dangerButton}
                onClick={handleEndExperiment}
                disabled={endMutation.isPending}
              >
                {endMutation.isPending ? "Ending..." : "End Experiment"}
              </button>
            </div>
          </div>
        </div>
      )}
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

function EditIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function CheckIcon() {
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
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function MinusIcon() {
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
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function XIcon() {
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
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
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
