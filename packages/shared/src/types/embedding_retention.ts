/**
 * Embedding Retention Types
 *
 * Per-topic configuration for pruning historical embeddings.
 * Stored in topics.custom_settings.embedding_retention_v1
 */

/**
 * Raw retention config stored in custom_settings.
 * All values are optional; parseEmbeddingRetention() applies defaults.
 */
export interface EmbeddingRetentionV1 {
  schema_version: "embedding_retention_v1";
  /** Whether embedding retention is enabled */
  enabled?: boolean;
  /** Max age (days) to keep embeddings (30-120) */
  maxAgeDays?: number;
  /** Max embeddings to keep per topic (0 = off) */
  maxItems?: number;
  /** Max embedding input tokens (estimated) to keep per topic (0 = off) */
  maxTokens?: number;
  /** Keep embeddings for items with feedback events */
  protectFeedback?: boolean;
  /** Keep embeddings for bookmarked items */
  protectBookmarks?: boolean;
}

/**
 * Resolved retention config with defaults applied.
 */
export interface EmbeddingRetentionResolved {
  enabled: boolean;
  maxAgeDays: number;
  maxItems: number;
  maxTokens: number;
  protectFeedback: boolean;
  protectBookmarks: boolean;
}

/** Default retention values */
export const EMBEDDING_RETENTION_DEFAULTS: EmbeddingRetentionResolved = {
  enabled: true,
  maxAgeDays: 90,
  maxItems: 0,
  maxTokens: 0,
  protectFeedback: true,
  protectBookmarks: true,
};

/** Clamp ranges for retention parameters */
export const EMBEDDING_RETENTION_RANGES = {
  maxAgeDays: { min: 30, max: 120 },
  maxItems: { min: 0, max: 200000 },
  maxTokens: { min: 0, max: 50000000 },
} as const;

/**
 * Parse and validate embedding retention from custom_settings.
 */
export function parseEmbeddingRetention(raw: unknown): EmbeddingRetentionResolved {
  const defaults = EMBEDDING_RETENTION_DEFAULTS;
  const ranges = EMBEDDING_RETENTION_RANGES;

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...defaults };
  }

  const obj = raw as Record<string, unknown>;

  function extractBool(key: keyof EmbeddingRetentionResolved, defaultValue: boolean): boolean {
    const value = obj[key];
    if (typeof value !== "boolean") return defaultValue;
    return value;
  }

  function extractClamped(
    key: "maxAgeDays" | "maxItems" | "maxTokens",
    defaultValue: number,
    min: number,
    max: number,
  ): number {
    const value = obj[key];
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return defaultValue;
    }
    return Math.max(min, Math.min(max, Math.floor(value)));
  }

  return {
    enabled: extractBool("enabled", defaults.enabled),
    maxAgeDays: extractClamped(
      "maxAgeDays",
      defaults.maxAgeDays,
      ranges.maxAgeDays.min,
      ranges.maxAgeDays.max,
    ),
    maxItems: extractClamped(
      "maxItems",
      defaults.maxItems,
      ranges.maxItems.min,
      ranges.maxItems.max,
    ),
    maxTokens: extractClamped(
      "maxTokens",
      defaults.maxTokens,
      ranges.maxTokens.min,
      ranges.maxTokens.max,
    ),
    protectFeedback: extractBool("protectFeedback", defaults.protectFeedback),
    protectBookmarks: extractBool("protectBookmarks", defaults.protectBookmarks),
  };
}

/**
 * Validate embedding retention values for API input.
 */
export function validateEmbeddingRetention(input: Partial<EmbeddingRetentionV1>): string[] {
  const errors: string[] = [];
  const ranges = EMBEDDING_RETENTION_RANGES;

  if (input.enabled !== undefined && typeof input.enabled !== "boolean") {
    errors.push("enabled must be a boolean");
  }
  if (input.protectFeedback !== undefined && typeof input.protectFeedback !== "boolean") {
    errors.push("protectFeedback must be a boolean");
  }
  if (input.protectBookmarks !== undefined && typeof input.protectBookmarks !== "boolean") {
    errors.push("protectBookmarks must be a boolean");
  }

  if (input.maxAgeDays !== undefined) {
    if (typeof input.maxAgeDays !== "number" || !Number.isFinite(input.maxAgeDays)) {
      errors.push("maxAgeDays must be a finite number");
    } else if (
      input.maxAgeDays < ranges.maxAgeDays.min ||
      input.maxAgeDays > ranges.maxAgeDays.max
    ) {
      errors.push(
        `maxAgeDays must be between ${ranges.maxAgeDays.min} and ${ranges.maxAgeDays.max}`,
      );
    }
  }

  if (input.maxItems !== undefined) {
    if (typeof input.maxItems !== "number" || !Number.isFinite(input.maxItems)) {
      errors.push("maxItems must be a finite number");
    } else if (input.maxItems < ranges.maxItems.min || input.maxItems > ranges.maxItems.max) {
      errors.push(`maxItems must be between ${ranges.maxItems.min} and ${ranges.maxItems.max}`);
    }
  }

  if (input.maxTokens !== undefined) {
    if (typeof input.maxTokens !== "number" || !Number.isFinite(input.maxTokens)) {
      errors.push("maxTokens must be a finite number");
    } else if (input.maxTokens < ranges.maxTokens.min || input.maxTokens > ranges.maxTokens.max) {
      errors.push(`maxTokens must be between ${ranges.maxTokens.min} and ${ranges.maxTokens.max}`);
    }
  }

  return errors;
}
