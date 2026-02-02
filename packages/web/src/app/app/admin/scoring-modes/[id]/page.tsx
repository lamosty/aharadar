"use client";

import Link from "next/link";
import { use, useState } from "react";
import { useToast } from "@/components/Toast";
import type { ScoringMode, UpdateScoringModeRequest } from "@/lib/api";
import {
  useScoringExperiments,
  useScoringMode,
  useScoringModeSetDefault,
  useScoringModeUpdate,
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

export default function ScoringModeDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const { addToast } = useToast();
  const { data, isLoading, error } = useScoringMode(id);
  const { data: experimentsData } = useScoringExperiments({ limit: 5 });
  const updateMutation = useScoringModeUpdate();
  const setDefaultMutation = useScoringModeSetDefault();

  const mode = data?.mode;
  const relatedExperiments = experimentsData?.experiments.filter((e) => e.modeId === id) ?? [];

  // Form state
  const [editingSection, setEditingSection] = useState<
    "name" | "weights" | "features" | "notes" | null
  >(null);
  const [formData, setFormData] = useState<{
    name: string;
    description: string;
    notes: string;
    weights: {
      wAha: number;
      wHeuristic: number;
      wPref: number;
      wNovelty: number;
    };
    features: {
      perSourceCalibration: boolean;
      aiPreferenceInjection: boolean;
      embeddingPreferences: boolean;
    };
  } | null>(null);

  function startEditing(section: "name" | "weights" | "features" | "notes", modeData: ScoringMode) {
    setFormData({
      name: modeData.name,
      description: modeData.description ?? "",
      notes: modeData.notes ?? "",
      weights: { ...modeData.config.weights },
      features: { ...modeData.config.features },
    });
    setEditingSection(section);
  }

  function cancelEditing() {
    setEditingSection(null);
    setFormData(null);
  }

  async function saveChanges() {
    if (!formData || !mode) return;

    const updates: UpdateScoringModeRequest = {};

    if (editingSection === "name") {
      if (formData.name !== mode.name) updates.name = formData.name;
      if (formData.description !== (mode.description ?? ""))
        updates.description = formData.description || null;
    } else if (editingSection === "weights") {
      updates.weights = formData.weights;
    } else if (editingSection === "features") {
      updates.features = formData.features;
    } else if (editingSection === "notes") {
      if (formData.notes !== (mode.notes ?? "")) updates.notes = formData.notes || null;
    }

    if (Object.keys(updates).length === 0) {
      cancelEditing();
      return;
    }

    try {
      await updateMutation.mutateAsync({ id, data: updates });
      addToast("Scoring mode updated", "success");
      cancelEditing();
    } catch (err) {
      addToast(`Failed to update: ${(err as Error).message}`, "error");
    }
  }

  async function handleSetDefault() {
    if (!mode) return;
    try {
      await setDefaultMutation.mutateAsync({ id });
      addToast(`"${mode.name}" is now the default scoring mode`, "success");
    } catch (err) {
      addToast(`Failed to set default: ${(err as Error).message}`, "error");
    }
  }

  if (isLoading) {
    return (
      <div className={styles.page}>
        <header className={styles.header}>
          <Link href="/app/admin/scoring-modes" className={styles.backLink}>
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
          <Link href="/app/admin/scoring-modes" className={styles.backLink}>
            <BackIcon />
            <span>Back</span>
          </Link>
          <h1 className={styles.title}>Scoring Mode</h1>
        </header>
        <div className={styles.error} role="alert">
          <ErrorIcon />
          <span>{error.message || "Failed to load scoring mode"}</span>
        </div>
      </div>
    );
  }

  if (!mode) return null;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/app/admin/scoring-modes" className={styles.backLink}>
          <BackIcon />
          <span>Back</span>
        </Link>
        <div className={styles.headerRow}>
          <div>
            <div className={styles.titleRow}>
              <h1 className={styles.title}>{mode.name}</h1>
              {mode.isDefault && <span className={styles.defaultBadge}>Default</span>}
            </div>
            {mode.description && <p className={styles.subtitle}>{mode.description}</p>}
          </div>
          {!mode.isDefault && (
            <button
              className={styles.primaryButton}
              onClick={handleSetDefault}
              disabled={setDefaultMutation.isPending}
            >
              Set as Default
            </button>
          )}
        </div>
      </header>

      {/* Name & Description Section */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Name & Description</h2>
          {editingSection !== "name" && (
            <button className={styles.editButton} onClick={() => startEditing("name", mode)}>
              <EditIcon />
              Edit
            </button>
          )}
        </div>

        {editingSection === "name" && formData ? (
          <div className={styles.editCard}>
            <div className={styles.formGroup}>
              <label className={styles.label}>Name</label>
              <input
                type="text"
                className={styles.input}
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Scoring mode name"
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Description</label>
              <input
                type="text"
                className={styles.input}
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Optional description"
              />
            </div>
            <div className={styles.editActions}>
              <button className={styles.secondaryButton} onClick={cancelEditing}>
                Cancel
              </button>
              <button
                className={styles.primaryButton}
                onClick={saveChanges}
                disabled={updateMutation.isPending}
              >
                {updateMutation.isPending ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        ) : (
          <div className={styles.infoCard}>
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>Name</span>
              <span className={styles.infoValue}>{mode.name}</span>
            </div>
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>Description</span>
              <span className={styles.infoValue}>
                {mode.description || <em className={styles.muted}>None</em>}
              </span>
            </div>
          </div>
        )}
      </section>

      {/* Weights Section */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Scoring Weights</h2>
          {editingSection !== "weights" && (
            <button className={styles.editButton} onClick={() => startEditing("weights", mode)}>
              <EditIcon />
              Edit
            </button>
          )}
        </div>

        {editingSection === "weights" && formData ? (
          <div className={styles.editCard}>
            <p className={styles.helpText}>
              Weights control how different signals contribute to the final score. Total should
              equal 100%.
            </p>
            <div className={styles.weightsGrid}>
              <WeightSlider
                label="AI Triage"
                description="Score from AI triage (novelty, relevance)"
                value={formData.weights.wAha}
                onChange={(v) =>
                  setFormData({
                    ...formData,
                    weights: { ...formData.weights, wAha: v },
                  })
                }
              />
              <WeightSlider
                label="Heuristic"
                description="Source quality, engagement metrics"
                value={formData.weights.wHeuristic}
                onChange={(v) =>
                  setFormData({
                    ...formData,
                    weights: { ...formData.weights, wHeuristic: v },
                  })
                }
              />
              <WeightSlider
                label="Preference"
                description="Learning from your feedback"
                value={formData.weights.wPref}
                onChange={(v) =>
                  setFormData({
                    ...formData,
                    weights: { ...formData.weights, wPref: v },
                  })
                }
              />
              <WeightSlider
                label="Novelty"
                description="Freshness and uniqueness boost"
                value={formData.weights.wNovelty}
                onChange={(v) =>
                  setFormData({
                    ...formData,
                    weights: { ...formData.weights, wNovelty: v },
                  })
                }
              />
            </div>
            <div className={styles.weightsTotal}>
              Total:{" "}
              {Math.round(
                (formData.weights.wAha +
                  formData.weights.wHeuristic +
                  formData.weights.wPref +
                  formData.weights.wNovelty) *
                  100,
              )}
              %
              {Math.abs(
                formData.weights.wAha +
                  formData.weights.wHeuristic +
                  formData.weights.wPref +
                  formData.weights.wNovelty -
                  1,
              ) > 0.01 && <span className={styles.warningText}> (should be 100%)</span>}
            </div>
            <div className={styles.editActions}>
              <button className={styles.secondaryButton} onClick={cancelEditing}>
                Cancel
              </button>
              <button
                className={styles.primaryButton}
                onClick={saveChanges}
                disabled={updateMutation.isPending}
              >
                {updateMutation.isPending ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        ) : (
          <div className={styles.weightsDisplay}>
            <div className={styles.weightItem}>
              <div className={styles.weightHeader}>
                <span className={styles.weightLabel}>AI Triage</span>
                <span className={styles.weightValue}>
                  {Math.round(mode.config.weights.wAha * 100)}%
                </span>
              </div>
              <div className={styles.weightBar}>
                <div
                  className={styles.weightFill}
                  style={{ width: `${mode.config.weights.wAha * 100}%` }}
                />
              </div>
            </div>
            <div className={styles.weightItem}>
              <div className={styles.weightHeader}>
                <span className={styles.weightLabel}>Heuristic</span>
                <span className={styles.weightValue}>
                  {Math.round(mode.config.weights.wHeuristic * 100)}%
                </span>
              </div>
              <div className={styles.weightBar}>
                <div
                  className={styles.weightFill}
                  style={{ width: `${mode.config.weights.wHeuristic * 100}%` }}
                />
              </div>
            </div>
            <div className={styles.weightItem}>
              <div className={styles.weightHeader}>
                <span className={styles.weightLabel}>Preference</span>
                <span className={styles.weightValue}>
                  {Math.round(mode.config.weights.wPref * 100)}%
                </span>
              </div>
              <div className={styles.weightBar}>
                <div
                  className={styles.weightFill}
                  style={{ width: `${mode.config.weights.wPref * 100}%` }}
                />
              </div>
            </div>
            <div className={styles.weightItem}>
              <div className={styles.weightHeader}>
                <span className={styles.weightLabel}>Novelty</span>
                <span className={styles.weightValue}>
                  {Math.round(mode.config.weights.wNovelty * 100)}%
                </span>
              </div>
              <div className={styles.weightBar}>
                <div
                  className={styles.weightFill}
                  style={{ width: `${mode.config.weights.wNovelty * 100}%` }}
                />
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Features Section */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Feature Flags</h2>
          {editingSection !== "features" && (
            <button className={styles.editButton} onClick={() => startEditing("features", mode)}>
              <EditIcon />
              Edit
            </button>
          )}
        </div>

        {editingSection === "features" && formData ? (
          <div className={styles.editCard}>
            <div className={styles.featuresList}>
              <FeatureToggle
                label="Per-Source Calibration"
                description="Adjust scores based on historical hit rate per source"
                checked={formData.features.perSourceCalibration}
                onChange={(v) =>
                  setFormData({
                    ...formData,
                    features: { ...formData.features, perSourceCalibration: v },
                  })
                }
              />
              <FeatureToggle
                label="AI Preference Injection"
                description="Include learned preferences in AI triage prompts"
                checked={formData.features.aiPreferenceInjection}
                onChange={(v) =>
                  setFormData({
                    ...formData,
                    features: {
                      ...formData.features,
                      aiPreferenceInjection: v,
                    },
                  })
                }
              />
              <FeatureToggle
                label="Embedding Preferences"
                description="Use semantic similarity with liked items"
                checked={formData.features.embeddingPreferences}
                onChange={(v) =>
                  setFormData({
                    ...formData,
                    features: { ...formData.features, embeddingPreferences: v },
                  })
                }
              />
            </div>
            <div className={styles.editActions}>
              <button className={styles.secondaryButton} onClick={cancelEditing}>
                Cancel
              </button>
              <button
                className={styles.primaryButton}
                onClick={saveChanges}
                disabled={updateMutation.isPending}
              >
                {updateMutation.isPending ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        ) : (
          <div className={styles.featuresDisplay}>
            <FeatureItem
              label="Per-Source Calibration"
              enabled={mode.config.features.perSourceCalibration}
            />
            <FeatureItem
              label="AI Preference Injection"
              enabled={mode.config.features.aiPreferenceInjection}
            />
            <FeatureItem
              label="Embedding Preferences"
              enabled={mode.config.features.embeddingPreferences}
            />
          </div>
        )}
      </section>

      {/* Notes Section */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Notes</h2>
          {editingSection !== "notes" && (
            <button className={styles.editButton} onClick={() => startEditing("notes", mode)}>
              <EditIcon />
              Edit
            </button>
          )}
        </div>

        {editingSection === "notes" && formData ? (
          <div className={styles.editCard}>
            <div className={styles.formGroup}>
              <textarea
                className={styles.textarea}
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Add notes about this scoring mode (e.g., why you created it, what you're testing)"
                rows={4}
              />
            </div>
            <div className={styles.editActions}>
              <button className={styles.secondaryButton} onClick={cancelEditing}>
                Cancel
              </button>
              <button
                className={styles.primaryButton}
                onClick={saveChanges}
                disabled={updateMutation.isPending}
              >
                {updateMutation.isPending ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        ) : (
          <div className={styles.notesDisplay}>
            {mode.notes ? (
              <p className={styles.notesText}>{mode.notes}</p>
            ) : (
              <p className={styles.muted}>No notes added yet.</p>
            )}
          </div>
        )}
      </section>

      {/* Related Experiments */}
      {relatedExperiments.length > 0 && (
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Related Experiments</h2>
            <Link href="/app/admin/scoring-modes/experiments" className={styles.viewAllLink}>
              View all experiments
            </Link>
          </div>
          <div className={styles.experimentsList}>
            {relatedExperiments.map((exp) => (
              <Link
                key={exp.id}
                href={`/app/admin/scoring-modes/experiments/${exp.id}`}
                className={styles.experimentCard}
              >
                <div className={styles.experimentHeader}>
                  <span className={styles.experimentName}>{exp.name}</span>
                  <span
                    className={`${styles.experimentStatus} ${exp.endedAt ? styles.statusEnded : styles.statusActive}`}
                  >
                    {exp.endedAt ? "Ended" : "Active"}
                  </span>
                </div>
                {exp.hypothesis && <p className={styles.experimentHypothesis}>{exp.hypothesis}</p>}
                <div className={styles.experimentMeta}>
                  <span>
                    {exp.itemsLiked} liked / {exp.itemsDisliked} disliked
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Metadata */}
      <div className={styles.metaSection}>
        <span>Created {formatDate(mode.createdAt)}</span>
        <span className={styles.metaDot}>·</span>
        <span>Updated {formatDate(mode.updatedAt)}</span>
      </div>
    </div>
  );
}

interface WeightSliderProps {
  label: string;
  description: string;
  value: number;
  onChange: (value: number) => void;
}

function WeightSlider({ label, description, value, onChange }: WeightSliderProps) {
  return (
    <div className={styles.sliderGroup}>
      <div className={styles.sliderHeader}>
        <label className={styles.sliderLabel}>{label}</label>
        <span className={styles.sliderValue}>{Math.round(value * 100)}%</span>
      </div>
      <p className={styles.sliderDescription}>{description}</p>
      <input
        type="range"
        className={styles.slider}
        min="0"
        max="1"
        step="0.05"
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
    </div>
  );
}

interface FeatureToggleProps {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

function FeatureToggle({ label, description, checked, onChange }: FeatureToggleProps) {
  return (
    <label className={styles.featureToggle}>
      <div className={styles.featureInfo}>
        <span className={styles.featureLabel}>{label}</span>
        <span className={styles.featureDescription}>{description}</span>
      </div>
      <div
        className={`${styles.toggle} ${checked ? styles.toggleOn : ""}`}
        onClick={() => onChange(!checked)}
        onKeyDown={(e) => e.key === "Enter" && onChange(!checked)}
        tabIndex={0}
        role="switch"
        aria-checked={checked}
      >
        <div className={styles.toggleThumb} />
      </div>
    </label>
  );
}

interface FeatureItemProps {
  label: string;
  enabled: boolean;
}

function FeatureItem({ label, enabled }: FeatureItemProps) {
  return (
    <div className={styles.featureItem}>
      <span
        className={`${styles.featureStatus} ${enabled ? styles.featureEnabled : styles.featureDisabled}`}
      >
        {enabled ? <CheckIcon /> : <XIcon />}
      </span>
      <span className={styles.featureLabel}>{label}</span>
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
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function XIcon() {
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
