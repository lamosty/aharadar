/**
 * Triage Allocation - Two-phase exploration + exploitation
 *
 * Allocates LLM triage calls to ensure fair coverage of all sources
 * while also prioritizing globally high-potential candidates.
 *
 * Phase A (Exploration): Guarantees minimum coverage per source type and source
 * Phase B (Exploitation): Uses remaining budget for globally best candidates
 */

// ============================================================================
// Types
// ============================================================================

export interface TriageCandidate {
  candidateId: string;
  sourceType: string;
  sourceId: string;
  /** Pre-computed heuristic score for prioritization */
  heuristicScore: number;
}

export interface TriageAllocationParams {
  candidates: TriageCandidate[];
  maxTriageCalls: number;
  /** Fraction of budget for exploration (default 0.3) */
  explorationFraction?: number;
}

export interface TriageAllocationResult {
  /** Ordered list of candidate IDs to triage (exploration first, then exploitation) */
  triageOrder: string[];
  /** Stats for logging */
  stats: TriageAllocationStats;
}

export interface TriageAllocationStats {
  totalCandidates: number;
  maxTriageCalls: number;
  explorationSlots: number;
  exploitationSlots: number;
  /** How many candidates each source type got in exploration */
  explorationByType: Array<{ type: string; count: number }>;
  /** How many unique sources got exploration slots */
  explorationSourceCount: number;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_EXPLORATION_FRACTION = 0.3;
const MIN_EXPLORATION_PER_TYPE = 2;
const MIN_EXPLORATION_PER_SOURCE = 1;

// ============================================================================
// Implementation
// ============================================================================

/**
 * Allocate triage calls using exploration + exploitation strategy.
 *
 * Phase A (Exploration):
 * - Split base triage budget across source types
 * - Within each type, allocate slots to individual sources
 * - Pick top candidates per source by heuristic score
 *
 * Phase B (Exploitation):
 * - Remaining triage calls go to globally top candidates (excluding exploration picks)
 */
export function allocateTriageCalls(params: TriageAllocationParams): TriageAllocationResult {
  const { candidates, maxTriageCalls } = params;
  const explorationFraction = params.explorationFraction ?? DEFAULT_EXPLORATION_FRACTION;

  if (candidates.length === 0 || maxTriageCalls <= 0) {
    return {
      triageOrder: [],
      stats: {
        totalCandidates: candidates.length,
        maxTriageCalls,
        explorationSlots: 0,
        exploitationSlots: 0,
        explorationByType: [],
        explorationSourceCount: 0,
      },
    };
  }

  // If we can triage all candidates, just sort by heuristic and return
  if (candidates.length <= maxTriageCalls) {
    const sorted = [...candidates].sort((a, b) => b.heuristicScore - a.heuristicScore);
    return {
      triageOrder: sorted.map((c) => c.candidateId),
      stats: {
        totalCandidates: candidates.length,
        maxTriageCalls,
        explorationSlots: candidates.length,
        exploitationSlots: 0,
        explorationByType: computeTypeDistribution(candidates),
        explorationSourceCount: new Set(candidates.map((c) => c.sourceId)).size,
      },
    };
  }

  // Phase A: Exploration
  const explorationBudget = Math.max(1, Math.floor(maxTriageCalls * explorationFraction));
  const exploitationBudget = maxTriageCalls - explorationBudget;

  // Group candidates by source type
  const byType = new Map<string, TriageCandidate[]>();
  for (const c of candidates) {
    const group = byType.get(c.sourceType);
    if (group) {
      group.push(c);
    } else {
      byType.set(c.sourceType, [c]);
    }
  }

  const numTypes = byType.size;
  const basePerType = Math.max(MIN_EXPLORATION_PER_TYPE, Math.floor(explorationBudget / numTypes));

  // Within each type, allocate to sources
  const explorationPicks = new Set<string>();
  const explorationByType: Array<{ type: string; count: number }> = [];

  for (const [sourceType, typeCandidates] of byType) {
    // Group by source within type
    const bySource = new Map<string, TriageCandidate[]>();
    for (const c of typeCandidates) {
      const group = bySource.get(c.sourceId);
      if (group) {
        group.push(c);
      } else {
        bySource.set(c.sourceId, [c]);
      }
    }

    const numSources = bySource.size;
    const slotsForThisType = Math.min(basePerType, typeCandidates.length);

    // Allocate slots to sources within type
    // At least MIN_EXPLORATION_PER_SOURCE per source, then distribute remainder
    const basePerSource = Math.max(
      MIN_EXPLORATION_PER_SOURCE,
      Math.floor(slotsForThisType / numSources),
    );

    let typePickCount = 0;
    for (const [_sourceId, sourceCandidates] of bySource) {
      // Sort by heuristic within source
      sourceCandidates.sort((a, b) => b.heuristicScore - a.heuristicScore);

      // Take up to basePerSource, but don't exceed remaining type budget
      const remaining = slotsForThisType - typePickCount;
      if (remaining <= 0) break;

      const toTake = Math.min(basePerSource, sourceCandidates.length, remaining);
      for (let i = 0; i < toTake; i++) {
        explorationPicks.add(sourceCandidates[i].candidateId);
        typePickCount++;
      }
    }

    explorationByType.push({ type: sourceType, count: typePickCount });
  }

  // Phase B: Exploitation
  // Pick globally top candidates by heuristic, excluding exploration picks
  const remaining = candidates.filter((c) => !explorationPicks.has(c.candidateId));
  remaining.sort((a, b) => b.heuristicScore - a.heuristicScore);

  const exploitationPicks: string[] = [];
  for (let i = 0; i < exploitationBudget && i < remaining.length; i++) {
    exploitationPicks.push(remaining[i].candidateId);
  }

  // Combine: exploration first, then exploitation
  // Sort exploration picks by heuristic for determinism
  const explorationList = candidates
    .filter((c) => explorationPicks.has(c.candidateId))
    .sort((a, b) => b.heuristicScore - a.heuristicScore)
    .map((c) => c.candidateId);

  const triageOrder = [...explorationList, ...exploitationPicks];

  return {
    triageOrder,
    stats: {
      totalCandidates: candidates.length,
      maxTriageCalls,
      explorationSlots: explorationPicks.size,
      exploitationSlots: exploitationPicks.length,
      explorationByType,
      explorationSourceCount: new Set(
        candidates.filter((c) => explorationPicks.has(c.candidateId)).map((c) => c.sourceId),
      ).size,
    },
  };
}

/**
 * Compute distribution by source type for stats.
 */
function computeTypeDistribution(
  candidates: TriageCandidate[],
): Array<{ type: string; count: number }> {
  const counts = new Map<string, number>();
  for (const c of candidates) {
    counts.set(c.sourceType, (counts.get(c.sourceType) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);
}
