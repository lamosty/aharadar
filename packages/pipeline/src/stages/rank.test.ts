import type { TriageOutput } from "@aharadar/llm";
import { describe, expect, it } from "vitest";
import {
  computeEffectiveSourceWeight,
  parseSourceTypeWeights,
  type RankCandidateInput,
  rankCandidates,
} from "./rank";

// Helper to create a valid TriageOutput for testing
function makeTriage(overrides: Partial<TriageOutput> = {}): TriageOutput {
  return {
    schema_version: "triage_v1",
    prompt_id: "triage_v1",
    provider: "test-provider",
    model: "test-model",
    ai_score: 50,
    reason: "test reason",
    is_relevant: true,
    is_novel: true,
    categories: [],
    should_deep_summarize: false,
    topic: "Test Topic",
    one_liner: "Test summary",
    ...overrides,
  };
}

// -----------------------------------------------------------------------------
// parseSourceTypeWeights
// -----------------------------------------------------------------------------
describe("parseSourceTypeWeights", () => {
  it("returns empty Map when env var is missing", () => {
    const result = parseSourceTypeWeights({});
    expect(result).toEqual(new Map());
  });

  it("returns empty Map when env var is undefined", () => {
    const result = parseSourceTypeWeights({ SOURCE_TYPE_WEIGHTS_JSON: undefined });
    expect(result).toEqual(new Map());
  });

  it("returns empty Map when JSON is invalid", () => {
    const result = parseSourceTypeWeights({ SOURCE_TYPE_WEIGHTS_JSON: "not-json" });
    expect(result).toEqual(new Map());
  });

  it("returns empty Map when JSON is an array", () => {
    const result = parseSourceTypeWeights({ SOURCE_TYPE_WEIGHTS_JSON: "[1, 2, 3]" });
    expect(result).toEqual(new Map());
  });

  it("returns empty Map when JSON is null", () => {
    const result = parseSourceTypeWeights({ SOURCE_TYPE_WEIGHTS_JSON: "null" });
    expect(result).toEqual(new Map());
  });

  it("returns empty Map when JSON is a string", () => {
    const result = parseSourceTypeWeights({ SOURCE_TYPE_WEIGHTS_JSON: '"hello"' });
    expect(result).toEqual(new Map());
  });

  it("returns empty Map when JSON is a number", () => {
    const result = parseSourceTypeWeights({ SOURCE_TYPE_WEIGHTS_JSON: "42" });
    expect(result).toEqual(new Map());
  });

  it("parses valid object with numeric weights", () => {
    const result = parseSourceTypeWeights({
      SOURCE_TYPE_WEIGHTS_JSON: '{"rss": 1.5, "hn": 0.8}',
    });
    expect(result).toEqual(
      new Map([
        ["rss", 1.5],
        ["hn", 0.8],
      ]),
    );
  });

  it("filters out non-finite numbers (NaN, Infinity, -Infinity)", () => {
    const result = parseSourceTypeWeights({
      SOURCE_TYPE_WEIGHTS_JSON: JSON.stringify({
        rss: 1.5,
        nanVal: NaN, // NaN is not JSON-serializable, becomes null
        infVal: Infinity, // becomes null
        negInfVal: -Infinity, // becomes null
        strVal: "string",
        boolVal: true,
        nullVal: null,
        objVal: { nested: 1 },
        arrVal: [1, 2],
        zero: 0,
        negative: -1.5,
      }),
    });
    // Only finite numbers are included
    expect(result).toEqual(
      new Map([
        ["rss", 1.5],
        ["zero", 0],
        ["negative", -1.5],
      ]),
    );
  });
});

// -----------------------------------------------------------------------------
// computeEffectiveSourceWeight
// -----------------------------------------------------------------------------
describe("computeEffectiveSourceWeight", () => {
  it("defaults type weight to 1.0 when source type is missing from map", () => {
    const result = computeEffectiveSourceWeight({
      sourceType: "unknown_type",
      sourceWeight: 1.0,
      typeWeights: new Map([["rss", 2.0]]),
    });
    expect(result.type_weight).toBe(1.0);
    expect(result.effective_weight).toBe(1.0);
  });

  it("defaults source weight to 1.0 when null", () => {
    const result = computeEffectiveSourceWeight({
      sourceType: "rss",
      sourceWeight: null,
      typeWeights: new Map([["rss", 2.0]]),
    });
    expect(result.source_weight).toBe(1.0);
    expect(result.effective_weight).toBe(2.0); // 2.0 * 1.0
  });

  it("multiplies type weight and source weight", () => {
    const result = computeEffectiveSourceWeight({
      sourceType: "rss",
      sourceWeight: 1.5,
      typeWeights: new Map([["rss", 2.0]]),
    });
    expect(result.type_weight).toBe(2.0);
    expect(result.source_weight).toBe(1.5);
    expect(result.effective_weight).toBe(3.0); // 2.0 * 1.5, clamped to max 3.0
  });

  it("clamps effective weight to minimum 0.1", () => {
    const result = computeEffectiveSourceWeight({
      sourceType: "rss",
      sourceWeight: 0.01,
      typeWeights: new Map([["rss", 0.05]]),
    });
    expect(result.type_weight).toBe(0.05);
    expect(result.source_weight).toBe(0.01);
    // raw = 0.05 * 0.01 = 0.0005, clamped to 0.1
    expect(result.effective_weight).toBe(0.1);
  });

  it("clamps effective weight to maximum 3.0", () => {
    const result = computeEffectiveSourceWeight({
      sourceType: "rss",
      sourceWeight: 2.0,
      typeWeights: new Map([["rss", 2.0]]),
    });
    expect(result.type_weight).toBe(2.0);
    expect(result.source_weight).toBe(2.0);
    // raw = 2.0 * 2.0 = 4.0, clamped to 3.0
    expect(result.effective_weight).toBe(3.0);
  });

  it("returns exact value when within bounds", () => {
    const result = computeEffectiveSourceWeight({
      sourceType: "rss",
      sourceWeight: 1.2,
      typeWeights: new Map([["rss", 1.5]]),
    });
    expect(result.effective_weight).toBeCloseTo(1.8, 5); // 1.5 * 1.2 = 1.8
  });
});

// -----------------------------------------------------------------------------
// rankCandidates
// -----------------------------------------------------------------------------
describe("rankCandidates", () => {
  // Helper to create minimal candidate input
  function makeCandidate(overrides: Partial<RankCandidateInput> = {}): RankCandidateInput {
    return {
      candidateId: "cand-1",
      kind: "item",
      representativeContentItemId: "item-1",
      candidateAtMs: Date.now(),
      heuristicScore: 0.5,
      positiveSim: null,
      negativeSim: null,
      triage: null,
      signalCorroboration: null,
      novelty: null,
      sourceWeight: null,
      ...overrides,
    };
  }

  describe("triage scoring", () => {
    it("uses aha_score/100 when triage is present", () => {
      const candidates = [
        makeCandidate({
          candidateId: "a",
          heuristicScore: 0.2,
          triage: makeTriage({ ai_score: 80, reason: "interesting" }),
        }),
      ];
      // With default weights: wAha=0.8, wHeuristic=0.15, wPref=0.05
      // baseScore = 0.8 * (80/100) + 0.15 * 0.2 + 0.05 * 0 = 0.64 + 0.03 = 0.67
      const [result] = rankCandidates({ candidates });
      expect(result.score).toBeCloseTo(0.67, 5);
    });

    it("includes triage fields in triageJson when triage is present", () => {
      const candidates = [
        makeCandidate({
          triage: makeTriage({ ai_score: 75, reason: "great content" }),
        }),
      ];
      const [result] = rankCandidates({ candidates });
      expect(result.triageJson).toMatchObject({
        ai_score: 75,
        reason: "great content",
        schema_version: "triage_v1",
      });
    });

    it("uses heuristicScore when triage is absent", () => {
      const candidates = [
        makeCandidate({
          candidateId: "a",
          heuristicScore: 0.6,
          triage: null,
        }),
      ];
      // Without triage: baseScore = heuristicScore + wPref * pref = 0.6 + 0 = 0.6
      const [result] = rankCandidates({ candidates });
      expect(result.score).toBeCloseTo(0.6, 5);
    });
  });

  describe("triageJson system_features", () => {
    it("emits system_features when signal corroboration is present (no triage)", () => {
      const candidates = [
        makeCandidate({
          triage: null,
          signalCorroboration: {
            matched: true,
            matchedUrl: "https://example.com",
            signalUrlSample: ["https://x.com/post1"],
          },
        }),
      ];
      const [result] = rankCandidates({ candidates });
      expect(result.triageJson).toEqual({
        system_features: {
          signal_corroboration_v1: {
            matched: true,
            matched_url: "https://example.com",
            signal_url_sample: ["https://x.com/post1"],
          },
        },
      });
    });

    it("emits system_features when novelty is present (no triage)", () => {
      const candidates = [
        makeCandidate({
          triage: null,
          novelty: {
            lookback_days: 14,
            max_similarity: 0.3,
            novelty01: 0.7,
          },
        }),
      ];
      const [result] = rankCandidates({ candidates });
      expect(result.triageJson).toEqual({
        system_features: {
          novelty_v1: {
            lookback_days: 14,
            max_similarity: 0.3,
            novelty01: 0.7,
          },
        },
      });
    });

    it("emits system_features when source weight is present (no triage)", () => {
      const candidates = [
        makeCandidate({
          triage: null,
          sourceWeight: {
            type_weight: 1.5,
            source_weight: 1.2,
            effective_weight: 1.8,
          },
        }),
      ];
      const [result] = rankCandidates({ candidates });
      expect(result.triageJson).toEqual({
        system_features: {
          source_weight_v1: {
            type_weight: 1.5,
            source_weight: 1.2,
            effective_weight: 1.8,
          },
        },
      });
    });

    it("merges system_features into triageJson when triage is present", () => {
      const candidates = [
        makeCandidate({
          triage: makeTriage({ ai_score: 90, reason: "hot topic" }),
          signalCorroboration: {
            matched: true,
            matchedUrl: "https://example.com",
            signalUrlSample: [],
          },
        }),
      ];
      const [result] = rankCandidates({ candidates });
      expect(result.triageJson).toMatchObject({
        ai_score: 90,
        reason: "hot topic",
        system_features: {
          signal_corroboration_v1: {
            matched: true,
            matched_url: "https://example.com",
            signal_url_sample: [],
          },
        },
      });
    });

    it("returns null triageJson when no triage and no features", () => {
      const candidates = [makeCandidate()];
      const [result] = rankCandidates({ candidates });
      expect(result.triageJson).toBeNull();
    });
  });

  describe("signal corroboration boost", () => {
    it("increases score by wSignal when matched=true (before source multiplier)", () => {
      const base = makeCandidate({
        heuristicScore: 0.5,
        triage: null,
      });
      const withSignal = makeCandidate({
        candidateId: "with-signal",
        heuristicScore: 0.5,
        triage: null,
        signalCorroboration: {
          matched: true,
          matchedUrl: "https://example.com",
          signalUrlSample: [],
        },
      });

      const [baseResult] = rankCandidates({ candidates: [base] });
      const [signalResult] = rankCandidates({ candidates: [withSignal] });

      // Default wSignal = 0.05
      expect(signalResult.score - baseResult.score).toBeCloseTo(0.05, 5);
    });

    it("does not boost score when matched=false", () => {
      const base = makeCandidate({
        heuristicScore: 0.5,
        triage: null,
      });
      const withUnmatchedSignal = makeCandidate({
        candidateId: "no-match",
        heuristicScore: 0.5,
        triage: null,
        signalCorroboration: {
          matched: false,
          matchedUrl: null,
          signalUrlSample: [],
        },
      });

      const [baseResult] = rankCandidates({ candidates: [base] });
      const [signalResult] = rankCandidates({ candidates: [withUnmatchedSignal] });

      expect(signalResult.score).toBeCloseTo(baseResult.score, 5);
    });
  });

  describe("novelty boost", () => {
    it("increases score by wNovelty * novelty01 (before source multiplier)", () => {
      const base = makeCandidate({
        heuristicScore: 0.5,
        triage: null,
      });
      const withNovelty = makeCandidate({
        candidateId: "with-novelty",
        heuristicScore: 0.5,
        triage: null,
        novelty: {
          lookback_days: 14,
          max_similarity: 0.2,
          novelty01: 0.8,
        },
      });

      const [baseResult] = rankCandidates({ candidates: [base] });
      const [noveltyResult] = rankCandidates({ candidates: [withNovelty] });

      // Default wNovelty = 0.05, novelty01 = 0.8
      // boost = 0.05 * 0.8 = 0.04
      expect(noveltyResult.score - baseResult.score).toBeCloseTo(0.04, 5);
    });

    it("no boost when novelty01 is 0", () => {
      const base = makeCandidate({
        heuristicScore: 0.5,
        triage: null,
      });
      const withZeroNovelty = makeCandidate({
        candidateId: "zero-novelty",
        heuristicScore: 0.5,
        triage: null,
        novelty: {
          lookback_days: 14,
          max_similarity: 1.0,
          novelty01: 0,
        },
      });

      const [baseResult] = rankCandidates({ candidates: [base] });
      const [noveltyResult] = rankCandidates({ candidates: [withZeroNovelty] });

      expect(noveltyResult.score).toBeCloseTo(baseResult.score, 5);
    });
  });

  describe("source weight multiplier", () => {
    it("multiplies score by effective_weight", () => {
      const base = makeCandidate({
        heuristicScore: 0.5,
        triage: null,
      });
      const withWeight = makeCandidate({
        candidateId: "with-weight",
        heuristicScore: 0.5,
        triage: null,
        sourceWeight: {
          type_weight: 1.0,
          source_weight: 2.0,
          effective_weight: 2.0,
        },
      });

      const [baseResult] = rankCandidates({ candidates: [base] });
      const [weightedResult] = rankCandidates({ candidates: [withWeight] });

      // Source weight multiplies the post-boost score
      expect(weightedResult.score).toBeCloseTo(baseResult.score * 2.0, 5);
    });

    it("applies source weight after signal and novelty boosts", () => {
      const candidate = makeCandidate({
        heuristicScore: 0.5,
        triage: null,
        signalCorroboration: {
          matched: true,
          matchedUrl: "https://example.com",
          signalUrlSample: [],
        },
        novelty: {
          lookback_days: 14,
          max_similarity: 0.0,
          novelty01: 1.0,
        },
        sourceWeight: {
          type_weight: 1.0,
          source_weight: 2.0,
          effective_weight: 2.0,
        },
      });

      const [result] = rankCandidates({ candidates: [candidate] });

      // baseScore = 0.5 (heuristicScore) + 0 (pref)
      // preWeightScore = 0.5 + 0.05 (signal) + 0.05 (novelty) = 0.6
      // score = 0.6 * 2.0 = 1.2
      expect(result.score).toBeCloseTo(1.2, 5);
    });
  });

  describe("custom weights", () => {
    it("uses provided weights instead of defaults", () => {
      const candidates = [
        makeCandidate({
          heuristicScore: 0.5,
          triage: makeTriage({ ai_score: 100, reason: "test" }),
        }),
      ];

      const [result] = rankCandidates({
        candidates,
        weights: {
          wAha: 1.0,
          wHeuristic: 0,
          wPref: 0,
          wSignal: 0,
          wNovelty: 0,
        },
      });

      // score = 1.0 * 1.0 + 0 + 0 = 1.0
      expect(result.score).toBeCloseTo(1.0, 5);
    });

    it("allows partial weight overrides", () => {
      const candidates = [
        makeCandidate({
          heuristicScore: 0.5,
          triage: null,
          signalCorroboration: { matched: true, matchedUrl: null, signalUrlSample: [] },
        }),
      ];

      const [result] = rankCandidates({
        candidates,
        weights: { wSignal: 0.5 }, // Override only wSignal
      });

      // baseScore = 0.5, signalBoost = 0.5 * 1 = 0.5
      // score = 0.5 + 0.5 = 1.0
      expect(result.score).toBeCloseTo(1.0, 5);
    });
  });

  describe("preference scoring", () => {
    it("adds (positiveSim - negativeSim) * wPref to score", () => {
      const candidates = [
        makeCandidate({
          heuristicScore: 0.5,
          triage: null,
          positiveSim: 0.8,
          negativeSim: 0.2,
        }),
      ];

      const [result] = rankCandidates({ candidates });

      // baseScore = 0.5 + 0.15 * (0.8 - 0.2) = 0.5 + 0.09 = 0.59
      expect(result.score).toBeCloseTo(0.59, 5);
    });

    it("handles null similarity values as 0", () => {
      const candidates = [
        makeCandidate({
          heuristicScore: 0.5,
          triage: null,
          positiveSim: null,
          negativeSim: null,
        }),
      ];

      const [result] = rankCandidates({ candidates });

      // pref = 0 - 0 = 0, no contribution
      expect(result.score).toBeCloseTo(0.5, 5);
    });

    it("uses overridden wPref when provided", () => {
      const candidates = [
        makeCandidate({
          heuristicScore: 0.5,
          triage: null,
          positiveSim: 0.8,
          negativeSim: 0.2,
        }),
      ];

      // With higher wPref (0.25), preference should have more impact
      const [result] = rankCandidates({ candidates, weights: { wPref: 0.25 } });

      // baseScore = 0.5 + 0.25 * (0.8 - 0.2) = 0.5 + 0.15 = 0.65
      expect(result.score).toBeCloseTo(0.65, 5);
    });

    it("wPref override changes relative ranking", () => {
      const candidates = [
        makeCandidate({
          candidateId: "high-pref",
          heuristicScore: 0.4,
          triage: null,
          positiveSim: 0.9,
          negativeSim: 0.0,
        }),
        makeCandidate({
          candidateId: "low-pref",
          heuristicScore: 0.5,
          triage: null,
          positiveSim: 0.2,
          negativeSim: 0.5,
        }),
      ];

      // With default wPref=0.15:
      // high-pref: 0.4 + 0.15 * 0.9 = 0.535
      // low-pref: 0.5 + 0.15 * -0.3 = 0.455
      const defaultResult = rankCandidates({ candidates });
      expect(defaultResult[0].candidateId).toBe("high-pref");

      // With wPref=0, only heuristic matters:
      // high-pref: 0.4
      // low-pref: 0.5
      const noPrefResult = rankCandidates({ candidates, weights: { wPref: 0 } });
      expect(noPrefResult[0].candidateId).toBe("low-pref");
    });
  });

  describe("sorting", () => {
    it("sorts by score descending", () => {
      const candidates = [
        makeCandidate({ candidateId: "low", heuristicScore: 0.3, candidateAtMs: 1000 }),
        makeCandidate({ candidateId: "high", heuristicScore: 0.9, candidateAtMs: 1000 }),
        makeCandidate({ candidateId: "mid", heuristicScore: 0.6, candidateAtMs: 1000 }),
      ];

      const results = rankCandidates({ candidates });

      expect(results.map((r) => r.candidateId)).toEqual(["high", "mid", "low"]);
    });

    it("uses candidateAtMs descending as secondary sort", () => {
      const candidates = [
        makeCandidate({ candidateId: "older", heuristicScore: 0.5, candidateAtMs: 1000 }),
        makeCandidate({ candidateId: "newer", heuristicScore: 0.5, candidateAtMs: 2000 }),
      ];

      const results = rankCandidates({ candidates });

      // Same score, so more recent (higher candidateAtMs) should come first
      expect(results.map((r) => r.candidateId)).toEqual(["newer", "older"]);
    });

    it("uses candidateId ascending as final tie-breaker", () => {
      const candidates = [
        makeCandidate({ candidateId: "zebra", heuristicScore: 0.5, candidateAtMs: 1000 }),
        makeCandidate({ candidateId: "alpha", heuristicScore: 0.5, candidateAtMs: 1000 }),
        makeCandidate({ candidateId: "beta", heuristicScore: 0.5, candidateAtMs: 1000 }),
      ];

      const results = rankCandidates({ candidates });

      // Same score and same time, should sort by candidateId ascending for determinism
      expect(results.map((r) => r.candidateId)).toEqual(["alpha", "beta", "zebra"]);
    });
  });
});
