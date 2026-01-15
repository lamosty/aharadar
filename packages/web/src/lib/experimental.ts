/**
 * Experimental features management.
 *
 * Stores feature flags in localStorage for easy experimentation.
 * Server-side feature flags (env vars) still take precedence - this is
 * for client-side UI toggling during development.
 */

const STORAGE_KEY = "aharadar_experimental_features";

export interface ExperimentalFeatures {
  /** Q&A / Ask Your Knowledge Base */
  qa: boolean;
  /** Score debug tooltips showing ranking breakdown */
  score_debug: boolean;
}

const DEFAULT_FEATURES: ExperimentalFeatures = {
  qa: false,
  score_debug: false,
};

/**
 * Get experimental feature settings from localStorage.
 */
export function getExperimentalFeatures(): ExperimentalFeatures {
  if (typeof window === "undefined") {
    return DEFAULT_FEATURES;
  }

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return DEFAULT_FEATURES;
    }
    const parsed = JSON.parse(stored) as Partial<ExperimentalFeatures>;
    return { ...DEFAULT_FEATURES, ...parsed };
  } catch {
    return DEFAULT_FEATURES;
  }
}

/**
 * Save experimental feature settings to localStorage.
 */
export function setExperimentalFeatures(features: ExperimentalFeatures): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(features));
  } catch {
    // Ignore storage errors
  }
}

/**
 * Toggle a single experimental feature.
 */
export function toggleExperimentalFeature(
  feature: keyof ExperimentalFeatures,
  enabled: boolean,
): ExperimentalFeatures {
  const current = getExperimentalFeatures();
  const updated = { ...current, [feature]: enabled };
  setExperimentalFeatures(updated);
  return updated;
}

/**
 * Check if a specific experimental feature is enabled.
 */
export function isExperimentalFeatureEnabled(feature: keyof ExperimentalFeatures): boolean {
  return getExperimentalFeatures()[feature];
}

/**
 * Check if score debug feature is enabled via env.
 * This gates visibility of the toggle itself.
 */
export function isScoreDebugEnvEnabled(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return process.env.NEXT_PUBLIC_SCORE_DEBUG_ENABLED === "true";
}

/**
 * Check if score debug mode is effectively enabled.
 * Requires both: env flag AND user toggle.
 */
export function isScoreDebugEnabled(): boolean {
  return isScoreDebugEnvEnabled() && isExperimentalFeatureEnabled("score_debug");
}

/**
 * Reset all experimental features to defaults.
 */
export function resetExperimentalFeatures(): ExperimentalFeatures {
  setExperimentalFeatures(DEFAULT_FEATURES);
  return DEFAULT_FEATURES;
}

/**
 * Feature metadata for UI display.
 */
export interface FeatureMeta {
  key: keyof ExperimentalFeatures;
  labelKey: string;
  descriptionKey: string;
  /** Link to the feature page if applicable */
  href?: string;
}

/**
 * All experimental features with metadata.
 */
export const EXPERIMENTAL_FEATURES: FeatureMeta[] = [
  {
    key: "qa",
    labelKey: "settings.experimental.features.qa.label",
    descriptionKey: "settings.experimental.features.qa.description",
    href: "/app/ask",
  },
  {
    key: "score_debug",
    labelKey: "settings.experimental.features.score_debug.label",
    descriptionKey: "settings.experimental.features.score_debug.description",
  },
];
