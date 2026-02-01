/**
 * AI Guidance Types
 *
 * Per-topic configuration for AI prompt customization.
 * Stored in topics.custom_settings.ai_guidance_v1
 */

/**
 * Raw AI guidance config stored in custom_settings.
 * All values are optional; parseAiGuidance() applies defaults.
 */
export interface AiGuidanceV1 {
  schema_version: "ai_guidance_v1";
  /** Custom guidance for AI summaries - injected into summary prompts */
  summary_prompt?: string;
  /** Custom guidance for triage - affects relevance/importance judging */
  triage_prompt?: string;
}

/**
 * Resolved AI guidance with all defaults applied.
 * Guaranteed to have all fields populated (may be empty strings).
 */
export interface AiGuidanceResolved {
  summary_prompt: string;
  triage_prompt: string;
}

/** Default AI guidance values */
export const AI_GUIDANCE_DEFAULTS: AiGuidanceResolved = {
  summary_prompt: "",
  triage_prompt: "",
};

/** Max length for each guidance field */
export const AI_GUIDANCE_MAX_LENGTH = 2000;

/**
 * Parse and validate AI guidance from custom_settings.
 *
 * @param raw - The raw value from custom_settings.ai_guidance_v1
 * @returns Resolved guidance with defaults applied
 */
export function parseAiGuidance(raw: unknown): AiGuidanceResolved {
  const defaults = AI_GUIDANCE_DEFAULTS;

  // Guard: must be object
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...defaults };
  }

  const obj = raw as Record<string, unknown>;

  // Helper: extract and sanitize a string field
  function extractString(key: keyof AiGuidanceResolved, defaultValue: string): string {
    const value = obj[key];
    if (typeof value !== "string") {
      return defaultValue;
    }
    // Trim and limit length
    return value.trim().slice(0, AI_GUIDANCE_MAX_LENGTH);
  }

  return {
    summary_prompt: extractString("summary_prompt", defaults.summary_prompt),
    triage_prompt: extractString("triage_prompt", defaults.triage_prompt),
  };
}

/**
 * Validate AI guidance values for API input.
 * Returns array of validation error messages (empty if valid).
 */
export function validateAiGuidance(input: Partial<AiGuidanceV1>): string[] {
  const errors: string[] = [];

  function validateField(key: "summary_prompt" | "triage_prompt", value: unknown): void {
    if (value === undefined) return;
    if (typeof value !== "string") {
      errors.push(`${key} must be a string`);
      return;
    }
    if (value.length > AI_GUIDANCE_MAX_LENGTH) {
      errors.push(`${key} must be ${AI_GUIDANCE_MAX_LENGTH} characters or less`);
    }
  }

  validateField("summary_prompt", input.summary_prompt);
  validateField("triage_prompt", input.triage_prompt);

  return errors;
}
