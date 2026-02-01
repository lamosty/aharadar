import type { ScoringModeConfig, SourceCalibration } from "@aharadar/db";
import type { TriageOutput } from "@aharadar/llm";
import type { SourceType } from "@aharadar/shared";
import type { NoveltyFeature } from "../scoring/novelty";

export interface RankWeights {
  wAha: number;
  wHeuristic: number;
  wPref: number;
  wSignal: number;
  wNovelty: number;
}

/**
 * Source calibration feature for explainability.
 */
export interface SourceCalibrationFeature {
  source_id: string;
  hit_rate: number | null;
  calibration_offset: number;
  items_total: number;
  applied: boolean;
}

/**
 * User preference weights computed from feedback history.
 * These are applied as multipliers to item scores.
 */
export interface UserPreferences {
  sourceTypeWeights: Partial<Record<SourceType, number>>;
  authorWeights: Record<string, number>;
}

/**
 * User preference feature for explainability.
 */
export interface UserPreferenceFeature {
  source_type_weight: number;
  author_weight: number;
  effective_weight: number;
  source_type: SourceType;
  author: string | null;
}

export interface SignalCorroborationFeature {
  matched: boolean;
  matchedUrl: string | null;
  signalUrlSample: string[];
}

/**
 * Source weight feature for explainability.
 */
export interface SourceWeightFeature {
  source_type?: string;
  source_name?: string;
  type_weight: number;
  source_weight: number;
  effective_weight: number;
}

/**
 * Parse SOURCE_TYPE_WEIGHTS_JSON env var.
 * Returns a map of source_type -> weight (default 1.0 for missing types).
 */
export function parseSourceTypeWeights(env: NodeJS.ProcessEnv = process.env): Map<string, number> {
  const raw = env.SOURCE_TYPE_WEIGHTS_JSON;
  if (!raw) return new Map();

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return new Map();

    const map = new Map<string, number>();
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "number" && Number.isFinite(value)) {
        map.set(key, value);
      }
    }
    return map;
  } catch {
    return new Map();
  }
}

/**
 * Compute effective source weight.
 * effectiveWeight = clamp(typeWeight * sourceWeight, 0.1, 3.0)
 */
export function computeEffectiveSourceWeight(params: {
  sourceType: string;
  sourceName?: string | null;
  sourceWeight: number | null;
  typeWeights: Map<string, number>;
}): SourceWeightFeature {
  const typeWeight = params.typeWeights.get(params.sourceType) ?? 1.0;
  const sourceWeight = params.sourceWeight ?? 1.0;
  const raw = typeWeight * sourceWeight;
  const effectiveWeight = Math.max(0.1, Math.min(3.0, raw));

  return {
    source_type: params.sourceType,
    source_name: params.sourceName ?? undefined,
    type_weight: typeWeight,
    source_weight: sourceWeight,
    effective_weight: effectiveWeight,
  };
}

export interface RankCandidateInput {
  candidateId: string;
  kind: "cluster" | "item";
  representativeContentItemId: string;
  candidateAtMs: number;
  heuristicScore: number;
  /** Recency component (0-1) for score debug */
  recency01?: number;
  /** Normalized engagement component (0-1) for score debug */
  engagement01?: number;
  positiveSim: number | null;
  negativeSim: number | null;
  triage: TriageOutput | null;
  signalCorroboration: SignalCorroborationFeature | null;
  novelty: NoveltyFeature | null;
  sourceWeight: SourceWeightFeature | null;
  /** Source type for user preference lookup */
  sourceType?: SourceType;
  /** Author for user preference lookup */
  author?: string | null;
  /** Source ID for per-source calibration lookup */
  sourceId?: string;
}

export interface RankedCandidate {
  candidateId: string;
  kind: "cluster" | "item";
  representativeContentItemId: string;
  candidateAtMs: number;
  score: number;
  triageJson: Record<string, unknown> | null;
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Compute user preference weight for a candidate.
 * Returns a multiplier based on source type and author preferences.
 */
export function computeUserPreferenceWeight(params: {
  sourceType?: SourceType;
  author?: string | null;
  userPreferences?: UserPreferences;
}): UserPreferenceFeature | null {
  const { sourceType, author, userPreferences } = params;

  // If no user preferences or no source type, no preference adjustment
  if (!userPreferences || !sourceType) {
    return null;
  }

  const sourceTypeWeight = userPreferences.sourceTypeWeights[sourceType] ?? 1.0;
  const authorWeight = author ? (userPreferences.authorWeights[author] ?? 1.0) : 1.0;

  // Combined weight, clamped to [0.5, 2.0]
  const rawWeight = sourceTypeWeight * authorWeight;
  const effectiveWeight = Math.max(0.5, Math.min(2.0, rawWeight));

  return {
    source_type_weight: sourceTypeWeight,
    author_weight: authorWeight,
    effective_weight: effectiveWeight,
    source_type: sourceType,
    author: author ?? null,
  };
}

/**
 * Recency decay feature for explainability.
 */
export interface RecencyDecayFeature {
  age_hours: number;
  decay_hours: number;
  decay_factor: number;
}

/**
 * Compute exponential decay factor based on age.
 * decay_factor = exp(-age_hours / decay_hours)
 * At age = decay_hours, factor ≈ 0.37 (1/e)
 */
export function computeDecayFactor(params: {
  candidateAtMs: number;
  nowMs: number;
  decayHours: number;
}): RecencyDecayFeature {
  const ageMs = params.nowMs - params.candidateAtMs;
  const ageHours = Math.max(0, ageMs / (1000 * 60 * 60));
  const decayFactor = Math.exp(-ageHours / params.decayHours);
  return {
    age_hours: ageHours,
    decay_hours: params.decayHours,
    decay_factor: decayFactor,
  };
}

export function rankCandidates(params: {
  candidates: RankCandidateInput[];
  weights?: Partial<RankWeights>;
  /** User preferences from feedback - applied as score multiplier */
  userPreferences?: UserPreferences;
  /** Hours for exponential decay half-life. If provided, older items score lower. */
  decayHours?: number | null;
  /** Scoring mode configuration for feature flags and calibration settings */
  scoringModeConfig?: ScoringModeConfig | null;
  /** Per-source calibration data keyed by source ID */
  sourceCalibrations?: Map<string, SourceCalibration>;
}): RankedCandidate[] {
  // Use weights from scoringModeConfig if provided, otherwise fall back to params.weights or defaults
  const modeConfig = params.scoringModeConfig;
  const wAha = params.weights?.wAha ?? modeConfig?.weights.wAha ?? 0.8;
  const wHeuristic = params.weights?.wHeuristic ?? modeConfig?.weights.wHeuristic ?? 0.15;
  const wPref = params.weights?.wPref ?? modeConfig?.weights.wPref ?? 0.15;
  // Signal corroboration is disabled by default (ENABLE_SIGNAL_CORROBORATION=1 to enable)
  const wSignal = params.weights?.wSignal ?? 0;
  const wNovelty = params.weights?.wNovelty ?? modeConfig?.weights.wNovelty ?? 0.05;

  // Feature flags from mode config
  const perSourceCalibrationEnabled = modeConfig?.features.perSourceCalibration ?? false;
  const calibrationMinSamples = modeConfig?.calibration.minSamples ?? 10;

  const nowMs = Date.now();
  const decayHours = params.decayHours ?? null;

  const scored = params.candidates.map((c) => {
    const triage = c.triage;
    let aha01 = triage ? triage.ai_score / 100 : c.heuristicScore;

    // Apply per-source calibration to AI score if enabled
    let calibrationFeature: SourceCalibrationFeature | null = null;
    if (perSourceCalibrationEnabled && c.sourceId && params.sourceCalibrations) {
      const calibration = params.sourceCalibrations.get(c.sourceId);
      if (calibration) {
        const totalFeedback = calibration.itemsLiked + calibration.itemsDisliked;
        const applied = totalFeedback >= calibrationMinSamples;
        calibrationFeature = {
          source_id: c.sourceId,
          hit_rate: calibration.rollingHitRate,
          calibration_offset: calibration.calibrationOffset,
          items_total: totalFeedback,
          applied,
        };
        if (applied && triage) {
          // Apply calibration offset to AI score (not heuristic fallback)
          aha01 = Math.max(0, Math.min(1, aha01 + calibration.calibrationOffset));
        }
      }
    }
    const pos = asFiniteNumber(c.positiveSim) ?? 0;
    const neg = asFiniteNumber(c.negativeSim) ?? 0;
    const pref = pos - neg; // [-1,1]ish

    // Signal corroboration feature (0 or 1 for MVP)
    const signalCorr01 = c.signalCorroboration?.matched ? 1 : 0;

    // Novelty feature (0-1 where 1 = most novel)
    const novelty01 = c.novelty?.novelty01 ?? 0;

    // Source weight feature (multiplier)
    const effectiveWeight = c.sourceWeight?.effective_weight ?? 1.0;

    // User preference weight (multiplier based on feedback history)
    const userPrefFeature = computeUserPreferenceWeight({
      sourceType: c.sourceType,
      author: c.author,
      userPreferences: params.userPreferences,
    });
    const userPrefWeight = userPrefFeature?.effective_weight ?? 1.0;

    // Recency decay (if configured)
    let decayFeature: RecencyDecayFeature | null = null;
    let decayMultiplier = 1.0;
    if (decayHours && decayHours > 0) {
      decayFeature = computeDecayFactor({
        candidateAtMs: c.candidateAtMs,
        nowMs,
        decayHours,
      });
      decayMultiplier = decayFeature.decay_factor;
    }

    // Compute score with signal boost and novelty, then apply source weight and user preference
    const baseScore = triage
      ? wAha * aha01 + wHeuristic * c.heuristicScore + wPref * pref
      : c.heuristicScore + wPref * pref;
    const preWeightScore = baseScore + wSignal * signalCorr01 + wNovelty * novelty01;
    const score = preWeightScore * effectiveWeight * userPrefWeight * decayMultiplier;

    // Build triageJson with system_features for explainability
    let triageJson: Record<string, unknown> | null = null;
    if (triage) {
      triageJson = { ...(triage as unknown as Record<string, unknown>) };
    }

    // Build system_features object with all available features
    const systemFeatures: Record<string, unknown> = {};

    if (c.signalCorroboration) {
      systemFeatures.signal_corroboration_v1 = {
        matched: c.signalCorroboration.matched,
        matched_url: c.signalCorroboration.matchedUrl,
        signal_url_sample: c.signalCorroboration.signalUrlSample,
      };
    }

    if (c.novelty) {
      systemFeatures.novelty_v1 = {
        lookback_days: c.novelty.lookback_days,
        max_similarity: c.novelty.max_similarity,
        novelty01: c.novelty.novelty01,
      };
    }

    if (c.sourceWeight) {
      systemFeatures.source_weight_v1 = {
        source_type: c.sourceWeight.source_type,
        source_name: c.sourceWeight.source_name,
        type_weight: c.sourceWeight.type_weight,
        source_weight: c.sourceWeight.source_weight,
        effective_weight: c.sourceWeight.effective_weight,
      };
    }

    if (userPrefFeature) {
      systemFeatures.user_preference_v1 = {
        source_type: userPrefFeature.source_type,
        source_type_weight: userPrefFeature.source_type_weight,
        author: userPrefFeature.author,
        author_weight: userPrefFeature.author_weight,
        effective_weight: userPrefFeature.effective_weight,
      };
    }

    if (decayFeature) {
      systemFeatures.recency_decay_v1 = {
        age_hours: Math.round(decayFeature.age_hours * 10) / 10, // Round to 1 decimal
        decay_hours: decayFeature.decay_hours,
        decay_factor: Math.round(decayFeature.decay_factor * 100) / 100, // Round to 2 decimals
      };
    }

    if (calibrationFeature) {
      systemFeatures.source_calibration_v1 = {
        source_id: calibrationFeature.source_id,
        hit_rate:
          calibrationFeature.hit_rate !== null
            ? Math.round(calibrationFeature.hit_rate * 1000) / 1000
            : null,
        calibration_offset: Math.round(calibrationFeature.calibration_offset * 1000) / 1000,
        items_total: calibrationFeature.items_total,
        applied: calibrationFeature.applied,
      };
    }

    // Score debug breakdown for UI tooltips
    // Heuristic subweights are hardcoded in digest.ts
    const wRecency = 0.6;
    const wEngagement = 0.4;
    const recency01 = c.recency01 ?? 0;
    const engagement01 = c.engagement01 ?? 0;

    // Compute weighted components for transparency
    const aiComponent = triage ? wAha * aha01 : 0;
    const heuristicComponent = triage ? wHeuristic * c.heuristicScore : c.heuristicScore;
    const preferenceComponent = wPref * pref;
    const noveltyComponent = wNovelty * novelty01;
    const signalComponent = wSignal * signalCorr01;

    systemFeatures.score_debug_v1 = {
      weights: {
        w_aha: wAha,
        w_heuristic: wHeuristic,
        w_pref: wPref,
        w_novelty: wNovelty,
        w_signal: wSignal,
      },
      inputs: {
        ai_score: triage?.ai_score ?? null,
        aha01: Math.round(aha01 * 1000) / 1000,
        aha01_calibrated:
          calibrationFeature?.applied && triage ? Math.round(aha01 * 1000) / 1000 : null,
        calibration_offset: calibrationFeature?.applied
          ? Math.round(calibrationFeature.calibration_offset * 1000) / 1000
          : null,
        heuristic_score: Math.round(c.heuristicScore * 1000) / 1000,
        recency01: Math.round(recency01 * 1000) / 1000,
        engagement01: Math.round(engagement01 * 1000) / 1000,
        preference_score: Math.round(pref * 1000) / 1000,
        novelty01: Math.round(novelty01 * 1000) / 1000,
        signal01: signalCorr01,
      },
      heuristic_weights: {
        w_recency: wRecency,
        w_engagement: wEngagement,
      },
      components: {
        ai: Math.round(aiComponent * 1000) / 1000,
        heuristic: Math.round(heuristicComponent * 1000) / 1000,
        preference: Math.round(preferenceComponent * 1000) / 1000,
        novelty: Math.round(noveltyComponent * 1000) / 1000,
        signal: Math.round(signalComponent * 1000) / 1000,
      },
      base_score: Math.round(baseScore * 1000) / 1000,
      pre_weight_score: Math.round(preWeightScore * 1000) / 1000,
      multipliers: {
        source_weight: Math.round(effectiveWeight * 1000) / 1000,
        user_preference_weight: Math.round(userPrefWeight * 1000) / 1000,
        decay_multiplier: Math.round(decayMultiplier * 1000) / 1000,
      },
      final_score: Math.round(score * 1000) / 1000,
    };

    // Attach system_features to triageJson if we have any features
    if (Object.keys(systemFeatures).length > 0) {
      if (triageJson) {
        triageJson.system_features = systemFeatures;
      } else {
        triageJson = { system_features: systemFeatures };
      }
    }

    return {
      candidateId: c.candidateId,
      kind: c.kind,
      representativeContentItemId: c.representativeContentItemId,
      candidateAtMs: c.candidateAtMs,
      score,
      triageJson,
    };
  });

  // Sort: score desc, candidateAtMs desc, candidateId asc (deterministic tie-breaker)
  scored.sort(
    (a, b) =>
      b.score - a.score ||
      b.candidateAtMs - a.candidateAtMs ||
      (a.candidateId < b.candidateId ? -1 : a.candidateId > b.candidateId ? 1 : 0),
  );
  return scored;
}
