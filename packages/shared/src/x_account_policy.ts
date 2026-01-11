/**
 * X Account Policy Math
 *
 * Implements gradual throttling for X accounts based on user feedback.
 * Uses exponential decay, Laplace smoothing, and smoothstep mapping.
 */

import type {
  XAccountFeedbackAction,
  XAccountPolicyMode,
  XAccountPolicyRow,
  XAccountPolicyState,
  XAccountPolicyView,
} from "./types/x_account_policy";
import { sha256Hex } from "./utils/hash";

// ============================================================================
// Constants (tunable)
// ============================================================================

/** Half-life in days for exponential decay */
export const DECAY_HALF_LIFE_DAYS = 45;

/** Minimum sample size before throttling applies */
export const MIN_SAMPLE_SIZE = 5;

/** Exploration floor - minimum fetch probability */
export const EXPLORATION_FLOOR = 0.15;

/** Smoothstep input range: score below this = floor throttle */
const SMOOTHSTEP_LOW = 0.35;

/** Smoothstep input range: score above this = full throttle */
const SMOOTHSTEP_HIGH = 0.65;

// ============================================================================
// Handle normalization
// ============================================================================

/**
 * Normalize a Twitter/X handle to lowercase without @ prefix.
 */
export function normalizeHandle(handle: string): string {
  return handle.replace(/^@/, "").toLowerCase();
}

// ============================================================================
// Decay
// ============================================================================

/**
 * Apply exponential decay to pos/neg scores based on time elapsed.
 * Uses half-life of 45 days.
 *
 * @param pos Current positive score
 * @param neg Current negative score
 * @param lastUpdatedAt Last time decay was applied
 * @param now Current time
 * @returns Decayed scores
 */
export function applyDecay(
  pos: number,
  neg: number,
  lastUpdatedAt: Date | null,
  now: Date,
): { pos: number; neg: number } {
  if (!lastUpdatedAt) {
    // No previous update, no decay to apply
    return { pos, neg };
  }

  const elapsedMs = now.getTime() - lastUpdatedAt.getTime();
  if (elapsedMs <= 0) {
    return { pos, neg };
  }

  const elapsedDays = elapsedMs / (1000 * 60 * 60 * 24);
  const decayFactor = 0.5 ** (elapsedDays / DECAY_HALF_LIFE_DAYS);

  return {
    pos: pos * decayFactor,
    neg: neg * decayFactor,
  };
}

// ============================================================================
// Feedback delta
// ============================================================================

/**
 * Get the score delta for a feedback action.
 *
 * @param action The feedback action
 * @returns { posDelta, negDelta }
 */
export function getFeedbackDelta(action: XAccountFeedbackAction): {
  posDelta: number;
  negDelta: number;
} {
  switch (action) {
    case "like":
    case "save":
      return { posDelta: 1, negDelta: 0 };
    case "dislike":
      return { posDelta: 0, negDelta: 1 };
    case "skip":
      return { posDelta: 0, negDelta: 0 };
    default:
      return { posDelta: 0, negDelta: 0 };
  }
}

/**
 * Apply a feedback action's delta to scores.
 *
 * @param pos Current positive score
 * @param neg Current negative score
 * @param action The feedback action
 * @returns Updated scores
 */
export function applyFeedbackDelta(
  pos: number,
  neg: number,
  action: XAccountFeedbackAction,
): { pos: number; neg: number } {
  const { posDelta, negDelta } = getFeedbackDelta(action);
  return {
    pos: pos + posDelta,
    neg: neg + negDelta,
  };
}

// ============================================================================
// Score computation
// ============================================================================

/**
 * Compute smoothed score using Beta(1,1) Laplace prior.
 * Returns value in range [0, 1] where higher = better.
 *
 * @param pos Positive score (decayed)
 * @param neg Negative score (decayed)
 * @returns Score between 0 and 1
 */
export function computeScore(pos: number, neg: number): number {
  // Laplace smoothing with Beta(1,1) prior
  // score = (pos + 1) / (pos + neg + 2)
  return (pos + 1) / (pos + neg + 2);
}

/**
 * Get the effective sample size (pos + neg).
 */
export function getSampleSize(pos: number, neg: number): number {
  return pos + neg;
}

// ============================================================================
// Throttle computation
// ============================================================================

/**
 * Smoothstep function for smooth transitions.
 * Maps value in [edge0, edge1] to [0, 1] with smooth easing.
 */
function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Compute throttle probability based on score and sample size.
 *
 * - If sample < MIN_SAMPLE_SIZE, returns 1.0 (always fetch, need more data)
 * - Otherwise maps score through smoothstep to [EXPLORATION_FLOOR, 1.0]
 *
 * @param score Smoothed score (0-1)
 * @param sample Sample size
 * @returns Throttle probability (0.15-1.0)
 */
export function computeThrottle(score: number, sample: number): number {
  // Not enough samples yet - always fetch
  if (sample < MIN_SAMPLE_SIZE) {
    return 1.0;
  }

  // Map score through smoothstep
  // score 0.35 or below -> 0 (floor throttle)
  // score 0.65 or above -> 1 (full fetch)
  const t = smoothstep(SMOOTHSTEP_LOW, SMOOTHSTEP_HIGH, score);

  // Map t from [0, 1] to [EXPLORATION_FLOOR, 1.0]
  return EXPLORATION_FLOOR + t * (1.0 - EXPLORATION_FLOOR);
}

// ============================================================================
// State resolution
// ============================================================================

/**
 * Resolve the effective state based on mode and throttle.
 *
 * @param mode User-set mode
 * @param throttle Computed throttle probability
 * @returns Effective state
 */
export function resolveState(mode: XAccountPolicyMode, throttle: number): XAccountPolicyState {
  if (mode === "mute") {
    return "muted";
  }
  if (mode === "always") {
    return "normal";
  }
  // Auto mode: check throttle
  // If throttle < 0.9, consider it "reduced" for UI indication
  if (throttle < 0.9) {
    return "reduced";
  }
  return "normal";
}

// ============================================================================
// Policy view computation
// ============================================================================

/**
 * Compute the full policy view with derived fields.
 *
 * @param row DB row
 * @param now Current time for decay
 * @returns Policy view with all computed fields
 */
export function computePolicyView(row: XAccountPolicyRow, now: Date): XAccountPolicyView {
  // Apply decay
  const decayed = applyDecay(row.pos_score, row.neg_score, row.last_updated_at, now);

  const score = computeScore(decayed.pos, decayed.neg);
  const sample = getSampleSize(decayed.pos, decayed.neg);
  const throttle = computeThrottle(score, sample);
  const state = resolveState(row.mode, throttle);

  // Compute next effects
  const nextLike = computeNextEffect(decayed.pos, decayed.neg, "like");
  const nextDislike = computeNextEffect(decayed.pos, decayed.neg, "dislike");

  return {
    handle: row.handle,
    mode: row.mode,
    score,
    sample,
    throttle,
    state,
    nextLike,
    nextDislike,
  };
}

/**
 * Compute what the score and throttle would be after a feedback action.
 *
 * @param pos Current decayed positive score
 * @param neg Current decayed negative score
 * @param action Hypothetical feedback action
 * @returns Projected score and throttle
 */
function computeNextEffect(
  pos: number,
  neg: number,
  action: XAccountFeedbackAction,
): { score: number; throttle: number } {
  const updated = applyFeedbackDelta(pos, neg, action);
  const score = computeScore(updated.pos, updated.neg);
  const sample = getSampleSize(updated.pos, updated.neg);
  const throttle = computeThrottle(score, sample);
  return { score, throttle };
}

/**
 * Compute next effects without mutating DB.
 * Useful for showing "what if" scenarios in UI.
 *
 * @param row DB row
 * @param now Current time
 * @returns Object with nextLike and nextDislike previews
 */
export function computeNextEffects(
  row: XAccountPolicyRow,
  now: Date,
): {
  nextLike: { score: number; throttle: number };
  nextDislike: { score: number; throttle: number };
} {
  const decayed = applyDecay(row.pos_score, row.neg_score, row.last_updated_at, now);

  return {
    nextLike: computeNextEffect(decayed.pos, decayed.neg, "like"),
    nextDislike: computeNextEffect(decayed.pos, decayed.neg, "dislike"),
  };
}

// ============================================================================
// Deterministic sampling
// ============================================================================

/**
 * Deterministic sampling based on SHA256 hash.
 * Returns true if the hash falls below the threshold.
 *
 * @param key Unique key for this decision (e.g., sourceId|handle|windowEnd)
 * @param threshold Probability threshold (0-1)
 * @returns true if should include (fetch)
 */
export function deterministicSample(key: string, threshold: number): boolean {
  const hash = sha256Hex(key);
  // Take first 8 hex chars (32 bits) and convert to [0, 1)
  const value = parseInt(hash.slice(0, 8), 16) / 0xffffffff;
  return value < threshold;
}
