import type { SourceType } from "@aharadar/shared";
import type { TriageOutput } from "@aharadar/llm";
import type { NoveltyFeature } from "../scoring/novelty";

export interface RankWeights {
  wAha: number;
  wHeuristic: number;
  wPref: number;
  wSignal: number;
  wNovelty: number;
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
  sourceWeight: number | null;
  typeWeights: Map<string, number>;
}): SourceWeightFeature {
  const typeWeight = params.typeWeights.get(params.sourceType) ?? 1.0;
  const sourceWeight = params.sourceWeight ?? 1.0;
  const raw = typeWeight * sourceWeight;
  const effectiveWeight = Math.max(0.1, Math.min(3.0, raw));

  return {
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

export function rankCandidates(params: {
  candidates: RankCandidateInput[];
  weights?: Partial<RankWeights>;
  /** User preferences from feedback - applied as score multiplier */
  userPreferences?: UserPreferences;
}): RankedCandidate[] {
  const wAha = params.weights?.wAha ?? 0.8;
  const wHeuristic = params.weights?.wHeuristic ?? 0.15;
  const wPref = params.weights?.wPref ?? 0.05;
  const wSignal = params.weights?.wSignal ?? 0.05;
  const wNovelty = params.weights?.wNovelty ?? 0.05;

  const scored = params.candidates.map((c) => {
    const triage = c.triage;
    const aha01 = triage ? triage.aha_score / 100 : c.heuristicScore;
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

    // Compute score with signal boost and novelty, then apply source weight and user preference
    const baseScore = triage
      ? wAha * aha01 + wHeuristic * c.heuristicScore + wPref * pref
      : c.heuristicScore + wPref * pref;
    const preWeightScore = baseScore + wSignal * signalCorr01 + wNovelty * novelty01;
    const score = preWeightScore * effectiveWeight * userPrefWeight;

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
      (a.candidateId < b.candidateId ? -1 : a.candidateId > b.candidateId ? 1 : 0)
  );
  return scored;
}
