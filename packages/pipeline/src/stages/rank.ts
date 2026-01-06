import type { TriageOutput } from "@aharadar/llm";
import type { NoveltyFeature } from "../scoring/novelty";

export interface RankWeights {
  wAha: number;
  wHeuristic: number;
  wPref: number;
  wSignal: number;
  wNovelty: number;
}

export interface SignalCorroborationFeature {
  matched: boolean;
  matchedUrl: string | null;
  signalUrlSample: string[];
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

export function rankCandidates(params: { candidates: RankCandidateInput[]; weights?: Partial<RankWeights> }): RankedCandidate[] {
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

    // Compute score with signal boost and novelty
    const baseScore = triage
      ? wAha * aha01 + wHeuristic * c.heuristicScore + wPref * pref
      : c.heuristicScore + wPref * pref;
    const score = baseScore + wSignal * signalCorr01 + wNovelty * novelty01;

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

  scored.sort((a, b) => b.score - a.score || b.candidateAtMs - a.candidateAtMs);
  return scored;
}

