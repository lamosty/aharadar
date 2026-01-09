/**
 * Diversity Selection - Greedy selection with soft diversity penalties
 *
 * Selects digest items while applying penalties to avoid domination by
 * a single source type or source. For clusters, tracks all member sources
 * as represented.
 *
 * Formula: adjusted = score / (1 + alphaType * countType + alphaSource * countSource)
 */

// ============================================================================
// Types
// ============================================================================

export interface DiversityCandidate {
  candidateId: string;
  /** Base score (from ranking) */
  score: number;
  /** Source type for this candidate */
  sourceType: string;
  /** Primary source ID */
  sourceId: string;
  /**
   * For clusters: all member source IDs + types.
   * When a cluster is selected, all these sources count as "represented".
   */
  memberSources?: Array<{ sourceId: string; sourceType: string }>;
  /** Whether this candidate has triage data */
  hasTriageData: boolean;
}

export interface DiversitySelectionParams {
  candidates: DiversityCandidate[];
  maxItems: number;
  /** Penalty factor for source type (default 0.15) */
  alphaType?: number;
  /** Penalty factor for individual source (default 0.05) */
  alphaSource?: number;
  /** If true, only select candidates with triage data */
  requireTriageData?: boolean;
}

export interface DiversitySelectionResult {
  /** Selected candidate IDs in order */
  selectedIds: string[];
  /** Stats for logging */
  stats: DiversityStats;
}

export interface DiversityStats {
  inputCount: number;
  outputCount: number;
  triagedInputCount: number;
  /** Distribution by source type in output */
  outputByType: Array<{ type: string; count: number }>;
  /** Distribution by source in output (top 5) */
  outputBySource: Array<{ sourceId: string; sourceType: string; count: number }>;
  /** Whether output was limited by triage data availability */
  limitedByTriageData: boolean;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_ALPHA_TYPE = 0.15;
const DEFAULT_ALPHA_SOURCE = 0.05;

// ============================================================================
// Implementation
// ============================================================================

/**
 * Select candidates with diversity penalties.
 *
 * Algorithm:
 * 1. Filter to triaged candidates (if required)
 * 2. Greedy select: pick highest adjusted score, update counts, repeat
 * 3. Adjusted score = score / (1 + alphaType * countType + alphaSource * countSource)
 * 4. For clusters, selecting adds all member sources to the counts
 */
export function selectWithDiversity(params: DiversitySelectionParams): DiversitySelectionResult {
  const { candidates, maxItems } = params;
  const alphaType = params.alphaType ?? DEFAULT_ALPHA_TYPE;
  const alphaSource = params.alphaSource ?? DEFAULT_ALPHA_SOURCE;
  const requireTriageData = params.requireTriageData ?? false;

  // Filter by triage data if required
  const eligible = requireTriageData ? candidates.filter((c) => c.hasTriageData) : candidates;

  const triagedInputCount = candidates.filter((c) => c.hasTriageData).length;

  if (eligible.length === 0 || maxItems <= 0) {
    return {
      selectedIds: [],
      stats: {
        inputCount: candidates.length,
        outputCount: 0,
        triagedInputCount,
        outputByType: [],
        outputBySource: [],
        limitedByTriageData: requireTriageData && triagedInputCount < candidates.length,
      },
    };
  }

  // Track selection counts for penalty calculation
  const typeCount = new Map<string, number>();
  const sourceCount = new Map<string, number>();

  const selectedIds: string[] = [];
  const selectedSet = new Set<string>();

  // Build lookup for candidates
  const candidateMap = new Map(eligible.map((c) => [c.candidateId, c]));
  const remainingIds = new Set(eligible.map((c) => c.candidateId));

  while (selectedIds.length < maxItems && remainingIds.size > 0) {
    // Find candidate with highest adjusted score
    let bestId: string | null = null;
    let bestAdjustedScore = -Infinity;

    for (const id of remainingIds) {
      const candidate = candidateMap.get(id);
      if (!candidate) continue;

      // Compute adjusted score with current counts
      const currentTypeCount = typeCount.get(candidate.sourceType) ?? 0;
      const currentSourceCount = sourceCount.get(candidate.sourceId) ?? 0;

      const penalty = 1 + alphaType * currentTypeCount + alphaSource * currentSourceCount;
      const adjusted = candidate.score / penalty;

      if (adjusted > bestAdjustedScore) {
        bestAdjustedScore = adjusted;
        bestId = id;
      }
    }

    if (!bestId) break;

    // Select this candidate
    const selected = candidateMap.get(bestId)!;
    selectedIds.push(bestId);
    selectedSet.add(bestId);
    remainingIds.delete(bestId);

    // Update counts
    // Add primary source
    typeCount.set(selected.sourceType, (typeCount.get(selected.sourceType) ?? 0) + 1);
    sourceCount.set(selected.sourceId, (sourceCount.get(selected.sourceId) ?? 0) + 1);

    // For clusters, also add all member sources
    if (selected.memberSources) {
      for (const member of selected.memberSources) {
        typeCount.set(member.sourceType, (typeCount.get(member.sourceType) ?? 0) + 1);
        sourceCount.set(member.sourceId, (sourceCount.get(member.sourceId) ?? 0) + 1);
      }
    }
  }

  // Build stats
  const outputByType = Array.from(typeCount.entries())
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);

  const outputBySource: Array<{ sourceId: string; sourceType: string; count: number }> = [];
  for (const [sourceId, count] of sourceCount.entries()) {
    // Find the source type for this source
    const candidate = eligible.find((c) => c.sourceId === sourceId);
    if (candidate) {
      outputBySource.push({ sourceId, sourceType: candidate.sourceType, count });
    }
  }
  outputBySource.sort((a, b) => b.count - a.count);

  return {
    selectedIds,
    stats: {
      inputCount: candidates.length,
      outputCount: selectedIds.length,
      triagedInputCount,
      outputByType,
      outputBySource: outputBySource.slice(0, 5),
      limitedByTriageData:
        requireTriageData && selectedIds.length < maxItems && triagedInputCount < candidates.length,
    },
  };
}
