/**
 * Theme Tuning Types
 *
 * Per-topic configuration for theme grouping behavior.
 * Stored in topics.custom_settings.theme_tuning_v1
 */

/**
 * Raw theme tuning config stored in custom_settings.
 * All values are optional; parseThemeTuning() applies defaults.
 */
export interface ThemeTuningV1 {
  schema_version: "theme_tuning_v1";
  /** Whether theme grouping is enabled */
  enabled?: boolean;
  /** Similarity threshold for theme clustering (0.3-0.9) */
  similarityThreshold?: number;
  /** Lookback window in days for theme continuity (1-14) */
  lookbackDays?: number;
}

/**
 * Resolved tuning with all defaults applied and values clamped.
 */
export interface ThemeTuningResolved {
  enabled: boolean;
  similarityThreshold: number;
  lookbackDays: number;
}

/** Default tuning values (match admin UI defaults) */
export const THEME_TUNING_DEFAULTS: ThemeTuningResolved = {
  enabled: true,
  similarityThreshold: 0.65,
  lookbackDays: 7,
};

/** Clamp ranges for each tuning parameter */
export const THEME_TUNING_RANGES = {
  similarityThreshold: { min: 0.3, max: 0.9 },
  lookbackDays: { min: 1, max: 14 },
} as const;

/**
 * Parse and validate theme tuning from custom_settings.
 *
 * @param raw - The raw value from custom_settings.theme_tuning_v1
 * @returns Resolved tuning with defaults applied and values clamped
 */
export function parseThemeTuning(raw: unknown): ThemeTuningResolved {
  const defaults = THEME_TUNING_DEFAULTS;
  const ranges = THEME_TUNING_RANGES;

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...defaults };
  }

  const obj = raw as Record<string, unknown>;

  const enabled = typeof obj.enabled === "boolean" ? obj.enabled : defaults.enabled;

  function extractClamped(
    key: keyof ThemeTuningResolved,
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
    enabled,
    similarityThreshold: extractClamped(
      "similarityThreshold",
      defaults.similarityThreshold,
      ranges.similarityThreshold.min,
      ranges.similarityThreshold.max,
    ),
    lookbackDays: extractClamped(
      "lookbackDays",
      defaults.lookbackDays,
      ranges.lookbackDays.min,
      ranges.lookbackDays.max,
    ),
  };
}

/**
 * Validate theme tuning values for API input.
 * Returns array of validation error messages (empty if valid).
 */
export function validateThemeTuning(input: Partial<ThemeTuningV1>): string[] {
  const errors: string[] = [];
  const ranges = THEME_TUNING_RANGES;

  if (input.enabled !== undefined && typeof input.enabled !== "boolean") {
    errors.push("enabled must be a boolean");
  }

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

  validateField("similarityThreshold", input.similarityThreshold);
  validateField("lookbackDays", input.lookbackDays);

  return errors;
}
