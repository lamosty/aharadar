/**
 * Fair Sampling - Stratified sampling across sources and time buckets
 *
 * Implements candidate recall that doesn't rely on recency dominance.
 * Instead, samples fairly across:
 * - Source types (e.g., rss, x_posts, reddit)
 * - Individual sources
 * - Time buckets within the window
 *
 * This ensures high-volume sources don't starve quieter sources.
 */

// ============================================================================
// Types
// ============================================================================

export interface SamplingCandidate {
  candidateId: string;
  sourceType: string;
  sourceId: string;
  candidateAtMs: number;
  /** Pre-computed heuristic score for sorting within groups */
  heuristicScore: number;
}

export interface StratifiedSampleParams {
  candidates: SamplingCandidate[];
  windowStartMs: number;
  windowEndMs: number;
  maxPoolSize: number;
}

export interface StratifiedSampleResult {
  /** Sampled candidate IDs in no particular order */
  sampledIds: Set<string>;
  /** Distribution stats for logging */
  stats: SamplingStats;
}

export interface SamplingStats {
  inputCount: number;
  outputCount: number;
  bucketCount: number;
  sourceTypeCount: number;
  sourceCount: number;
  /** Top source types by count */
  topSourceTypes: Array<{ type: string; count: number }>;
  /** Top sources by count */
  topSources: Array<{ sourceId: string; sourceType: string; count: number }>;
}

// ============================================================================
// Constants
// ============================================================================

const MIN_BUCKETS = 3;
const MAX_BUCKETS = 12;
const HOURS_PER_BUCKET = 2;

// ============================================================================
// Implementation
// ============================================================================

function clamp(min: number, max: number, value: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Compute the number of time buckets based on window duration.
 * Formula: clamp(3, 12, round(windowHours / 2))
 */
function computeBucketCount(windowStartMs: number, windowEndMs: number): number {
  const windowMs = Math.max(1, windowEndMs - windowStartMs);
  const windowHours = windowMs / (1000 * 60 * 60);
  return clamp(MIN_BUCKETS, MAX_BUCKETS, Math.round(windowHours / HOURS_PER_BUCKET));
}

/**
 * Assign a candidate to a time bucket index.
 */
function getBucketIndex(
  candidateAtMs: number,
  windowStartMs: number,
  windowEndMs: number,
  bucketCount: number,
): number {
  const windowMs = Math.max(1, windowEndMs - windowStartMs);
  const offsetMs = Math.max(0, candidateAtMs - windowStartMs);
  const ratio = offsetMs / windowMs;
  // Clamp to [0, bucketCount-1]
  return clamp(0, bucketCount - 1, Math.floor(ratio * bucketCount));
}

/**
 * Build a group key for stratified sampling.
 * Groups are: (sourceType, sourceId, bucketIndex)
 */
function buildGroupKey(sourceType: string, sourceId: string, bucketIndex: number): string {
  return `${sourceType}|${sourceId}|${bucketIndex}`;
}

/**
 * Stratified sampling: sample fairly across (sourceType, sourceId, timeBucket) groups.
 *
 * Algorithm:
 * 1. Build time buckets for the window
 * 2. Group candidates by (sourceType, sourceId, bucket)
 * 3. Compute k = how many to take per group based on maxPoolSize and group count
 * 4. Take top k per group by heuristic score
 * 5. Merge all groups, dedupe, and clamp to maxPoolSize
 *
 * This guarantees every source+bucket combination can contribute candidates
 * even if some sources are extremely prolific.
 */
export function stratifiedSample(params: StratifiedSampleParams): StratifiedSampleResult {
  const { candidates, windowStartMs, windowEndMs, maxPoolSize } = params;

  if (candidates.length === 0) {
    return {
      sampledIds: new Set(),
      stats: {
        inputCount: 0,
        outputCount: 0,
        bucketCount: 0,
        sourceTypeCount: 0,
        sourceCount: 0,
        topSourceTypes: [],
        topSources: [],
      },
    };
  }

  // If we have fewer candidates than maxPoolSize, return all
  if (candidates.length <= maxPoolSize) {
    const stats = computeStats(candidates, 0);
    return {
      sampledIds: new Set(candidates.map((c) => c.candidateId)),
      stats: { ...stats, outputCount: candidates.length },
    };
  }

  const bucketCount = computeBucketCount(windowStartMs, windowEndMs);

  // Group candidates by (sourceType, sourceId, bucket)
  const groups = new Map<string, SamplingCandidate[]>();
  const sourceTypes = new Set<string>();
  const sources = new Set<string>();

  for (const candidate of candidates) {
    const bucketIdx = getBucketIndex(
      candidate.candidateAtMs,
      windowStartMs,
      windowEndMs,
      bucketCount,
    );
    const key = buildGroupKey(candidate.sourceType, candidate.sourceId, bucketIdx);

    sourceTypes.add(candidate.sourceType);
    sources.add(candidate.sourceId);

    const group = groups.get(key);
    if (group) {
      group.push(candidate);
    } else {
      groups.set(key, [candidate]);
    }
  }

  // Compute k (candidates per group) to roughly fill maxPoolSize
  // We want: groupCount * k ≈ maxPoolSize
  // So k = ceil(maxPoolSize / groupCount)
  // But also ensure k >= 1
  const groupCount = groups.size;
  const kPerGroup = Math.max(1, Math.ceil(maxPoolSize / groupCount));

  // Sample top k from each group by heuristic score
  const sampledIds = new Set<string>();

  for (const group of groups.values()) {
    // Sort by heuristic score descending
    group.sort((a, b) => b.heuristicScore - a.heuristicScore);

    // Take top k
    const toTake = Math.min(kPerGroup, group.length);
    for (let i = 0; i < toTake; i++) {
      sampledIds.add(group[i].candidateId);
    }
  }

  // If we've exceeded maxPoolSize (rare, due to rounding), we need to trim
  // In this case, convert back to array, sort by heuristic, and take top maxPoolSize
  if (sampledIds.size > maxPoolSize) {
    const sampledCandidates = candidates.filter((c) => sampledIds.has(c.candidateId));
    sampledCandidates.sort((a, b) => b.heuristicScore - a.heuristicScore);

    sampledIds.clear();
    for (let i = 0; i < maxPoolSize && i < sampledCandidates.length; i++) {
      sampledIds.add(sampledCandidates[i].candidateId);
    }
  }

  // Build stats from the sampled candidates
  const sampledCandidates = candidates.filter((c) => sampledIds.has(c.candidateId));
  const stats = computeStats(sampledCandidates, bucketCount);

  return {
    sampledIds,
    stats: {
      ...stats,
      inputCount: candidates.length,
    },
  };
}

/**
 * Compute distribution stats for logging.
 */
function computeStats(candidates: SamplingCandidate[], bucketCount: number): SamplingStats {
  const sourceTypeCounts = new Map<string, number>();
  const sourceCounts = new Map<string, { sourceId: string; sourceType: string; count: number }>();

  for (const c of candidates) {
    // Count by source type
    sourceTypeCounts.set(c.sourceType, (sourceTypeCounts.get(c.sourceType) ?? 0) + 1);

    // Count by source
    const existing = sourceCounts.get(c.sourceId);
    if (existing) {
      existing.count++;
    } else {
      sourceCounts.set(c.sourceId, { sourceId: c.sourceId, sourceType: c.sourceType, count: 1 });
    }
  }

  // Top source types
  const topSourceTypes = Array.from(sourceTypeCounts.entries())
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // Top sources
  const topSources = Array.from(sourceCounts.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return {
    inputCount: candidates.length,
    outputCount: candidates.length,
    bucketCount,
    sourceTypeCount: sourceTypeCounts.size,
    sourceCount: sourceCounts.size,
    topSourceTypes,
    topSources,
  };
}
