import type { TriageOutput } from "@aharadar/llm";

export interface RankWeights {
  wAha: number;
  wHeuristic: number;
  wPref: number;
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

  const scored = params.candidates.map((c) => {
    const triage = c.triage;
    const triageJson = triage ? (triage as unknown as Record<string, unknown>) : null;
    const aha01 = triage ? triage.aha_score / 100 : c.heuristicScore;
    const pos = asFiniteNumber(c.positiveSim) ?? 0;
    const neg = asFiniteNumber(c.negativeSim) ?? 0;
    const pref = pos - neg; // [-1,1]ish
    const score = triage ? wAha * aha01 + wHeuristic * c.heuristicScore + wPref * pref : c.heuristicScore + wPref * pref;
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

