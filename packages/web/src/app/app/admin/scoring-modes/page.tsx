"use client";

import Link from "next/link";
import { useState } from "react";
import { useToast } from "@/components/Toast";
import type { ScoringExperiment, ScoringMode } from "@/lib/api";
import {
  useScoringExperimentEnd,
  useScoringExperimentsActive,
  useScoringModeDelete,
  useScoringModeSetDefault,
  useScoringModes,
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

function formatDuration(startedAt: string): string {
  const start = new Date(startedAt);
  const now = new Date();
  const days = Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  if (days === 0) return "Started today";
  if (days === 1) return "1 day";
  return `${days} days`;
}

function getHitRate(exp: ScoringExperiment): string | null {
  const total = exp.itemsLiked + exp.itemsDisliked;
  if (total === 0) return null;
  return `${Math.round((exp.itemsLiked / total) * 100)}%`;
}

export default function AdminScoringModesPage() {
  const { data: modesData, isLoading: loadingModes, error: modesError } = useScoringModes();
  const {
    data: experimentsData,
    isLoading: loadingExperiments,
    error: experimentsError,
  } = useScoringExperimentsActive();

  const setDefaultMutation = useScoringModeSetDefault();
  const deleteMutation = useScoringModeDelete();
  const endExperimentMutation = useScoringExperimentEnd();

  const { addToast } = useToast();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [endingExperimentId, setEndingExperimentId] = useState<string | null>(null);

  const isLoading = loadingModes || loadingExperiments;
  const error = modesError || experimentsError;

  const modes = modesData?.modes ?? [];
  const activeExperiments = experimentsData?.experiments ?? [];

  async function handleSetDefault(mode: ScoringMode) {
    try {
      await setDefaultMutation.mutateAsync({ id: mode.id });
      addToast(`"${mode.name}" is now the default scoring mode`, "success");
    } catch (err) {
      addToast(`Failed to set default: ${(err as Error).message}`, "error");
    }
  }

  async function handleDelete(mode: ScoringMode) {
    if (deletingId !== mode.id) {
      setDeletingId(mode.id);
      return;
    }

    try {
      await deleteMutation.mutateAsync(mode.id);
      addToast(`"${mode.name}" deleted`, "success");
      setDeletingId(null);
    } catch (err) {
      addToast(`Failed to delete: ${(err as Error).message}`, "error");
      setDeletingId(null);
    }
  }

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
        <Link href="/app/admin" className={styles.backLink}>
          <BackIcon />
          <span>Back</span>
        </Link>
        <div className={styles.headerRow}>
          <div>
            <h1 className={styles.title}>Scoring Modes</h1>
            <p className={styles.subtitle}>
              Configure ranking strategies and run experiments to optimize content quality
            </p>
          </div>
          <Link href="/app/admin/scoring-modes/experiments" className={styles.secondaryButton}>
            <ExperimentIcon />
            <span>All Experiments</span>
          </Link>
        </div>
      </header>

      {/* Active Experiments Section */}
      {!isLoading && activeExperiments.length > 0 && (
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>
              <ExperimentIcon />
              Active Experiments
            </h2>
            <span className={styles.badge}>{activeExperiments.length} running</span>
          </div>
          <div className={styles.experimentsList}>
            {activeExperiments.map((exp) => {
              const mode = modes.find((m) => m.id === exp.modeId);
              const hitRate = getHitRate(exp);
              const isEnding = endingExperimentId === exp.id;

              return (
                <div key={exp.id} className={styles.experimentCard}>
                  <div className={styles.experimentHeader}>
                    <div>
                      <Link
                        href={`/app/admin/scoring-modes/experiments/${exp.id}`}
                        className={styles.experimentNameLink}
                      >
                        <h3 className={styles.experimentName}>{exp.name}</h3>
                      </Link>
                      <span className={styles.experimentMode}>
                        Testing:{" "}
                        <Link
                          href={`/app/admin/scoring-modes/${exp.modeId}`}
                          className={styles.experimentModeLink}
                        >
                          {mode?.name ?? "Unknown mode"}
                        </Link>
                      </span>
                    </div>
                    <span className={styles.experimentDuration}>
                      {formatDuration(exp.startedAt)}
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
                    <button
                      className={isEnding ? styles.dangerButton : styles.secondaryButton}
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

      {/* Scoring Modes Section */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>
            <ModeIcon />
            Scoring Modes
          </h2>
          <span className={styles.badge}>{modes.length} modes</span>
        </div>

        {isLoading && (
          <div className={styles.modesList}>
            {[1, 2, 3].map((i) => (
              <div key={i} className={`${styles.skeleton} ${styles.skeletonCard}`} />
            ))}
          </div>
        )}

        {error && (
          <div className={styles.error} role="alert">
            <ErrorIcon />
            <span>{(error as Error)?.message || "Failed to load scoring modes"}</span>
          </div>
        )}

        {!isLoading && !error && modes.length === 0 && (
          <div className={styles.emptyCard}>
            <div className={styles.emptyIcon}>
              <ModeIcon />
            </div>
            <h3 className={styles.emptyTitle}>No scoring modes</h3>
            <p className={styles.emptyDescription}>
              Scoring modes will be created automatically when you first use the app
            </p>
          </div>
        )}

        {!isLoading && !error && modes.length > 0 && (
          <div className={styles.modesList}>
            {modes.map((mode) => {
              const isDeleting = deletingId === mode.id;
              const isSettingDefault = setDefaultMutation.isPending;
              const activeExp = activeExperiments.find((e) => e.modeId === mode.id);

              return (
                <div
                  key={mode.id}
                  className={`${styles.modeCard} ${mode.isDefault ? styles.modeCardDefault : ""}`}
                >
                  <div className={styles.modeHeader}>
                    <div className={styles.modeTitleRow}>
                      <Link
                        href={`/app/admin/scoring-modes/${mode.id}`}
                        className={styles.modeNameLink}
                      >
                        <h3 className={styles.modeName}>{mode.name}</h3>
                      </Link>
                      {mode.isDefault && <span className={styles.defaultBadge}>Default</span>}
                      {activeExp && <span className={styles.activeBadge}>In Experiment</span>}
                    </div>
                    {mode.description && (
                      <p className={styles.modeDescription}>{mode.description}</p>
                    )}
                  </div>

                  <div className={styles.modeConfig}>
                    <div className={styles.configSection}>
                      <h4 className={styles.configTitle}>Weights</h4>
                      <div className={styles.configGrid}>
                        <div className={styles.configItem}>
                          <span className={styles.configLabel}>AI Triage</span>
                          <span className={styles.configValue}>
                            {Math.round(mode.config.weights.wAha * 100)}%
                          </span>
                        </div>
                        <div className={styles.configItem}>
                          <span className={styles.configLabel}>Heuristic</span>
                          <span className={styles.configValue}>
                            {Math.round(mode.config.weights.wHeuristic * 100)}%
                          </span>
                        </div>
                        <div className={styles.configItem}>
                          <span className={styles.configLabel}>Preference</span>
                          <span className={styles.configValue}>
                            {Math.round(mode.config.weights.wPref * 100)}%
                          </span>
                        </div>
                        <div className={styles.configItem}>
                          <span className={styles.configLabel}>Novelty</span>
                          <span className={styles.configValue}>
                            {Math.round(mode.config.weights.wNovelty * 100)}%
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className={styles.configSection}>
                      <h4 className={styles.configTitle}>Features</h4>
                      <div className={styles.featureList}>
                        <span
                          className={`${styles.featureTag} ${mode.config.features.perSourceCalibration ? styles.featureEnabled : styles.featureDisabled}`}
                        >
                          Source Calibration
                        </span>
                        <span
                          className={`${styles.featureTag} ${mode.config.features.aiPreferenceInjection ? styles.featureEnabled : styles.featureDisabled}`}
                        >
                          AI Preference Injection
                        </span>
                        <span
                          className={`${styles.featureTag} ${mode.config.features.embeddingPreferences ? styles.featureEnabled : styles.featureDisabled}`}
                        >
                          Embedding Preferences
                        </span>
                      </div>
                    </div>
                  </div>

                  {mode.notes && <p className={styles.modeNotes}>{mode.notes}</p>}

                  <div className={styles.modeActions}>
                    {!mode.isDefault && (
                      <button
                        className={styles.secondaryButton}
                        onClick={() => handleSetDefault(mode)}
                        disabled={isSettingDefault}
                      >
                        Set as Default
                      </button>
                    )}
                    {!mode.isDefault && !activeExp && (
                      <button
                        className={isDeleting ? styles.dangerButton : styles.ghostButton}
                        onClick={() => handleDelete(mode)}
                        disabled={deleteMutation.isPending}
                      >
                        {isDeleting ? "Confirm Delete" : "Delete"}
                      </button>
                    )}
                  </div>

                  <div className={styles.modeMeta}>
                    <span>Updated {formatDate(mode.updatedAt)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Info Section */}
      <section className={styles.infoSection}>
        <h3 className={styles.infoTitle}>About Scoring Modes</h3>
        <div className={styles.infoContent}>
          <p>
            <strong>Scoring modes</strong> control how items are ranked in your feed. Each mode
            defines weights for different signals (AI triage, heuristics, preferences, novelty) and
            feature flags for advanced ranking.
          </p>
          <p>
            <strong>A/B Tests</strong> (in the separate A/B Tests section) compare different LLM
            providers and models for triage quality. Scoring modes adjust how those triage scores
            are combined with other signals.
          </p>
          <p>
            <strong>Experiments</strong> let you test a scoring mode for a period, automatically
            gathering feedback metrics. Start an experiment by assigning a mode to a topic.
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

function ModeIcon() {
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
      <line x1="4" y1="21" x2="4" y2="14" />
      <line x1="4" y1="10" x2="4" y2="3" />
      <line x1="12" y1="21" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12" y2="3" />
      <line x1="20" y1="21" x2="20" y2="16" />
      <line x1="20" y1="12" x2="20" y2="3" />
      <line x1="1" y1="14" x2="7" y2="14" />
      <line x1="9" y1="8" x2="15" y2="8" />
      <line x1="17" y1="16" x2="23" y2="16" />
    </svg>
  );
}

function ExperimentIcon() {
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
      <path d="M4.5 3h15" />
      <path d="M6 3v16a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V3" />
      <path d="M6 14h12" />
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
