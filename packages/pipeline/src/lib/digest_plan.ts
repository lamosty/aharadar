/**
 * Digest Plan Compiler
 *
 * Computes digest size and budget limits from topic settings.
 * See docs/tasks/task-120-topic-digest-cadence-spec.md for formulas.
 */

import type { BudgetTier } from "@aharadar/shared";

// ============================================================================
// Types
// ============================================================================

export interface DigestPlan {
  /** Maximum items in the final digest */
  digestMaxItems: number;
  /** Maximum triage LLM calls */
  triageMaxCalls: number;
  /** Maximum deep summary LLM calls */
  deepSummaryMaxCalls: number;
  /** Maximum candidate pool size */
  candidatePoolMax: number;
}

export interface CompileDigestPlanParams {
  mode: BudgetTier;
  digestDepth: number; // 0..100
  enabledSourceCount: number;
  /** Optional env overrides for testing */
  env?: NodeJS.ProcessEnv;
}

// ============================================================================
// Constants
// ============================================================================

/** Mode-specific coefficients for digest sizing */
const MODE_COEFFICIENTS = {
  low: {
    base: 30,
    perSource: 10,
    min: 25,
    max: 300,
    triageMultiplier: 2,
    deepSummaryRatio: 0, // No deep summaries in low mode
    deepSummaryMax: 0,
  },
  normal: {
    base: 70,
    perSource: 20,
    min: 50,
    max: 700,
    triageMultiplier: 3,
    deepSummaryRatio: 0.15,
    deepSummaryMax: 40,
  },
  high: {
    base: 200,
    perSource: 60,
    min: 100,
    max: 2000,
    triageMultiplier: 5,
    deepSummaryRatio: 0.3,
    deepSummaryMax: 150,
  },
} as const;

/** Default hard caps (can be overridden via env) */
const DEFAULT_HARD_CAPS = {
  maxItems: 2500,
  triageMaxCalls: 10000,
  deepSummaryMaxCalls: 200,
  candidatePoolMax: 10000,
} as const;

// ============================================================================
// Helpers
// ============================================================================

function clamp(min: number, max: number, value: number): number {
  return Math.max(min, Math.min(max, value));
}

function parseIntEnv(env: NodeJS.ProcessEnv | undefined, key: string, fallback: number): number {
  const value = parseInt(env?.[key] ?? "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

// ============================================================================
// Compiler
// ============================================================================

/**
 * Compile a DigestPlan from topic settings.
 *
 * Formulas:
 * - digestMaxItems = clamp(min, max, round((base + perSource*S) * depthFactor))
 * - depthFactor = 0.5 + (digestDepth * 1.5) / 100 (range [0.5, 2.0])
 * - triageMaxCalls = clamp(digestMaxItems, 10000, digestMaxItems * triageMultiplier)
 * - deepSummaryMaxCalls = min(deepSummaryMax, round(digestMaxItems * deepSummaryRatio))
 * - candidatePoolMax = min(10000, max(500, digestMaxItems * 20))
 */
export function compileDigestPlan(params: CompileDigestPlanParams): DigestPlan {
  const { mode, digestDepth, enabledSourceCount, env = process.env } = params;

  // Get mode coefficients
  const coeff = MODE_COEFFICIENTS[mode];

  // Parse hard caps from env
  const hardCaps = {
    maxItems: parseIntEnv(env, "DIGEST_MAX_ITEMS_HARD_CAP", DEFAULT_HARD_CAPS.maxItems),
    triageMaxCalls: parseIntEnv(
      env,
      "DIGEST_TRIAGE_MAX_CALLS_HARD_CAP",
      DEFAULT_HARD_CAPS.triageMaxCalls,
    ),
    deepSummaryMaxCalls: parseIntEnv(
      env,
      "DIGEST_DEEP_SUMMARY_MAX_CALLS_HARD_CAP",
      DEFAULT_HARD_CAPS.deepSummaryMaxCalls,
    ),
    candidatePoolMax: parseIntEnv(
      env,
      "DIGEST_CANDIDATE_POOL_HARD_CAP",
      DEFAULT_HARD_CAPS.candidatePoolMax,
    ),
  };

  // Calculate depth factor (0.5 to 2.0)
  const clampedDepth = clamp(0, 100, digestDepth);
  const depthFactor = 0.5 + (clampedDepth * 1.5) / 100;

  // Calculate digest max items
  const rawMaxItems = Math.round((coeff.base + coeff.perSource * enabledSourceCount) * depthFactor);
  const digestMaxItems = Math.min(hardCaps.maxItems, clamp(coeff.min, coeff.max, rawMaxItems));

  // Calculate triage max calls
  const rawTriageCalls = digestMaxItems * coeff.triageMultiplier;
  const triageMaxCalls = Math.min(
    hardCaps.triageMaxCalls,
    clamp(digestMaxItems, 10000, rawTriageCalls),
  );

  // Calculate deep summary max calls
  const rawDeepSummary = Math.round(digestMaxItems * coeff.deepSummaryRatio);
  const deepSummaryMaxCalls = Math.min(
    hardCaps.deepSummaryMaxCalls,
    Math.min(coeff.deepSummaryMax, rawDeepSummary),
  );

  // Calculate candidate pool max
  const rawCandidatePool = Math.max(500, digestMaxItems * 20);
  const candidatePoolMax = Math.min(hardCaps.candidatePoolMax, rawCandidatePool);

  return {
    digestMaxItems,
    triageMaxCalls,
    deepSummaryMaxCalls,
    candidatePoolMax,
  };
}

/**
 * Apply a budget scale factor to a DigestPlan.
 *
 * This is used when credits are approaching/critical to reduce
 * LLM-heavy work (triage + deep summaries) and shrink candidate pools.
 */
export function applyBudgetScale(plan: DigestPlan, scale: number): DigestPlan {
  const safeScale = Math.max(0, Math.min(1, scale));
  if (safeScale >= 0.999) return plan;

  const digestMaxItems = Math.max(5, Math.round(plan.digestMaxItems * safeScale));
  const triageMaxCalls = Math.max(digestMaxItems, Math.round(plan.triageMaxCalls * safeScale));
  const deepSummaryMaxCalls = Math.max(0, Math.round(plan.deepSummaryMaxCalls * safeScale));
  const candidatePoolMax = Math.max(100, Math.round(plan.candidatePoolMax * safeScale));

  return {
    digestMaxItems,
    triageMaxCalls,
    deepSummaryMaxCalls,
    candidatePoolMax,
  };
}
