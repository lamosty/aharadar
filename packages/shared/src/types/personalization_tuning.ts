/**
 * Personalization Tuning Types
 *
 * Per-topic configuration for personalization behavior.
 * Stored in topics.custom_settings.personalization_tuning_v1
 */

/**
 * Raw personalization tuning config stored in custom_settings.
 * All values are optional; parsePersonalizationTuning() applies defaults.
 */
export interface PersonalizationTuningV1 {
  schema_version: "personalization_tuning_v1";
  /** Bias weight for sampling phase (0.0-0.5) */
  prefBiasSamplingWeight?: number;
  /** Bias weight for triage allocation phase (0.0-0.5) */
  prefBiasTriageWeight?: number;
  /** Weight for preference score in ranking (0.0-0.5) */
  rankPrefWeight?: number;
  /** Delta for adjusting feedback weights (0.0-0.2) */
  feedbackWeightDelta?: number;
}

/**
 * Resolved tuning with all defaults applied and values clamped.
 * Guaranteed to have all fields populated with valid values.
 */
export interface PersonalizationTuningResolved {
  prefBiasSamplingWeight: number;
  prefBiasTriageWeight: number;
  rankPrefWeight: number;
  feedbackWeightDelta: number;
}

/** Default tuning values */
export const PERSONALIZATION_TUNING_DEFAULTS: PersonalizationTuningResolved = {
  prefBiasSamplingWeight: 0.15,
  prefBiasTriageWeight: 0.2,
  rankPrefWeight: 0.25,
  feedbackWeightDelta: 0.12,
};

/** Clamp ranges for each tuning parameter */
export const PERSONALIZATION_TUNING_RANGES = {
  prefBiasSamplingWeight: { min: 0.0, max: 0.5 },
  prefBiasTriageWeight: { min: 0.0, max: 0.5 },
  rankPrefWeight: { min: 0.0, max: 0.5 },
  feedbackWeightDelta: { min: 0.0, max: 0.2 },
} as const;

/**
 * Parse and validate personalization tuning from custom_settings.
 *
 * @param raw - The raw value from custom_settings.personalization_tuning_v1
 * @returns Resolved tuning with defaults applied and values clamped
 */
export function parsePersonalizationTuning(raw: unknown): PersonalizationTuningResolved {
  const defaults = PERSONALIZATION_TUNING_DEFAULTS;
  const ranges = PERSONALIZATION_TUNING_RANGES;

  // Guard: must be object
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...defaults };
  }

  const obj = raw as Record<string, unknown>;

  // Helper: extract and clamp a numeric field
  function extractClamped(
    key: keyof PersonalizationTuningResolved,
    defaultValue: number,
    min: number,
    max: number,
  ): number {
    const value = obj[key];
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return defaultValue;
    }
    return Math.max(min, Math.min(max, value));
  }

  return {
    prefBiasSamplingWeight: extractClamped(
      "prefBiasSamplingWeight",
      defaults.prefBiasSamplingWeight,
      ranges.prefBiasSamplingWeight.min,
      ranges.prefBiasSamplingWeight.max,
    ),
    prefBiasTriageWeight: extractClamped(
      "prefBiasTriageWeight",
      defaults.prefBiasTriageWeight,
      ranges.prefBiasTriageWeight.min,
      ranges.prefBiasTriageWeight.max,
    ),
    rankPrefWeight: extractClamped(
      "rankPrefWeight",
      defaults.rankPrefWeight,
      ranges.rankPrefWeight.min,
      ranges.rankPrefWeight.max,
    ),
    feedbackWeightDelta: extractClamped(
      "feedbackWeightDelta",
      defaults.feedbackWeightDelta,
      ranges.feedbackWeightDelta.min,
      ranges.feedbackWeightDelta.max,
    ),
  };
}

/**
 * Validate tuning values for API input.
 * Returns array of validation error messages (empty if valid).
 */
export function validatePersonalizationTuning(input: Partial<PersonalizationTuningV1>): string[] {
  const errors: string[] = [];
  const ranges = PERSONALIZATION_TUNING_RANGES;

  function validateField(key: keyof typeof ranges, value: unknown): void {
    if (value === undefined) return;
    if (typeof value !== "number" || !Number.isFinite(value)) {
      errors.push(`${key} must be a finite number`);
      return;
    }
    const { min, max } = ranges[key];
    if (value < min || value > max) {
      errors.push(`${key} must be between ${min} and ${max}`);
    }
  }

  validateField("prefBiasSamplingWeight", input.prefBiasSamplingWeight);
  validateField("prefBiasTriageWeight", input.prefBiasTriageWeight);
  validateField("rankPrefWeight", input.rankPrefWeight);
  validateField("feedbackWeightDelta", input.feedbackWeightDelta);

  return errors;
}
