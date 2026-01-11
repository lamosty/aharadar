import { describe, expect, it } from "vitest";
import type { XAccountPolicyRow } from "./types/x_account_policy";
import {
  applyDecay,
  applyFeedbackDelta,
  computePolicyView,
  computeScore,
  computeThrottle,
  deterministicSample,
  EXPLORATION_FLOOR,
  MIN_SAMPLE_SIZE,
  normalizeHandle,
  resolveState,
} from "./x_account_policy";

describe("normalizeHandle", () => {
  it("removes @ prefix and lowercases", () => {
    expect(normalizeHandle("@ElonMusk")).toBe("elonmusk");
    expect(normalizeHandle("SomeUser")).toBe("someuser");
    expect(normalizeHandle("@user123")).toBe("user123");
  });
});

describe("applyDecay", () => {
  it("returns original scores when no lastUpdatedAt", () => {
    const result = applyDecay(5, 3, null, new Date());
    expect(result.pos).toBe(5);
    expect(result.neg).toBe(3);
  });

  it("applies exponential decay over time", () => {
    const baseTime = new Date("2024-01-01T00:00:00Z");
    // 45 days later = half-life
    const halfLifeLater = new Date("2024-02-15T00:00:00Z");

    const result = applyDecay(10, 10, baseTime, halfLifeLater);
    // After one half-life, scores should be ~half
    expect(result.pos).toBeCloseTo(5, 1);
    expect(result.neg).toBeCloseTo(5, 1);
  });

  it("does not decay when time elapsed is 0", () => {
    const now = new Date();
    const result = applyDecay(5, 3, now, now);
    expect(result.pos).toBe(5);
    expect(result.neg).toBe(3);
  });
});

describe("applyFeedbackDelta", () => {
  it("increments pos for like", () => {
    const result = applyFeedbackDelta(1, 1, "like");
    expect(result.pos).toBe(2);
    expect(result.neg).toBe(1);
  });

  it("increments pos for save", () => {
    const result = applyFeedbackDelta(1, 1, "save");
    expect(result.pos).toBe(2);
    expect(result.neg).toBe(1);
  });

  it("increments neg for dislike", () => {
    const result = applyFeedbackDelta(1, 1, "dislike");
    expect(result.pos).toBe(1);
    expect(result.neg).toBe(2);
  });

  it("does nothing for skip", () => {
    const result = applyFeedbackDelta(1, 1, "skip");
    expect(result.pos).toBe(1);
    expect(result.neg).toBe(1);
  });
});

describe("computeScore", () => {
  it("returns 0.5 for zero scores (Laplace prior)", () => {
    const score = computeScore(0, 0);
    expect(score).toBeCloseTo(0.5, 2);
  });

  it("returns higher score for more positive feedback", () => {
    const scorePos = computeScore(10, 0);
    const scoreNeg = computeScore(0, 10);
    expect(scorePos).toBeGreaterThan(scoreNeg);
  });

  it("approaches 1 for very positive feedback", () => {
    const score = computeScore(100, 0);
    expect(score).toBeGreaterThan(0.95);
    expect(score).toBeLessThanOrEqual(1);
  });
});

describe("computeThrottle", () => {
  it("returns 1.0 when sample < MIN_SAMPLE", () => {
    const throttle = computeThrottle(0.2, MIN_SAMPLE_SIZE - 1);
    expect(throttle).toBe(1.0);
  });

  it("returns EXPLORATION_FLOOR for very low score", () => {
    const throttle = computeThrottle(0.1, 10);
    expect(throttle).toBeCloseTo(EXPLORATION_FLOOR, 2);
  });

  it("returns 1.0 for very high score", () => {
    const throttle = computeThrottle(0.9, 10);
    expect(throttle).toBeCloseTo(1.0, 2);
  });

  it("returns value between floor and 1 for mid score", () => {
    const throttle = computeThrottle(0.5, 10);
    expect(throttle).toBeGreaterThan(EXPLORATION_FLOOR);
    expect(throttle).toBeLessThan(1.0);
  });
});

describe("resolveState", () => {
  it("returns muted for mute mode", () => {
    expect(resolveState("mute", 1.0)).toBe("muted");
    expect(resolveState("mute", 0.5)).toBe("muted");
  });

  it("returns normal for always mode", () => {
    expect(resolveState("always", 0.5)).toBe("normal");
    expect(resolveState("always", 0.15)).toBe("normal");
  });

  it("returns reduced for auto mode with low throttle", () => {
    expect(resolveState("auto", 0.5)).toBe("reduced");
    expect(resolveState("auto", 0.8)).toBe("reduced");
  });

  it("returns normal for auto mode with high throttle", () => {
    expect(resolveState("auto", 0.95)).toBe("normal");
    expect(resolveState("auto", 1.0)).toBe("normal");
  });
});

describe("deterministicSample", () => {
  it("returns consistent results for same key", () => {
    const key = "source|handle|window";
    const threshold = 0.5;
    const result1 = deterministicSample(key, threshold);
    const result2 = deterministicSample(key, threshold);
    expect(result1).toBe(result2);
  });

  it("returns true for threshold 1.0", () => {
    expect(deterministicSample("any-key", 1.0)).toBe(true);
  });

  it("returns false for threshold 0", () => {
    expect(deterministicSample("any-key", 0)).toBe(false);
  });
});

describe("computePolicyView", () => {
  it("computes view with all derived fields", () => {
    const now = new Date("2024-06-15T12:00:00Z");
    const row: XAccountPolicyRow = {
      id: "test-id",
      source_id: "source-id",
      handle: "testuser",
      mode: "auto",
      pos_score: 5,
      neg_score: 2,
      last_feedback_at: new Date("2024-06-14T12:00:00Z"),
      last_updated_at: new Date("2024-06-14T12:00:00Z"),
      created_at: new Date("2024-06-01T00:00:00Z"),
      updated_at: new Date("2024-06-14T12:00:00Z"),
    };

    const view = computePolicyView(row, now);

    expect(view.handle).toBe("testuser");
    expect(view.mode).toBe("auto");
    expect(view.score).toBeGreaterThan(0.5); // More positive than negative
    expect(view.sample).toBeGreaterThan(0);
    expect(view.throttle).toBeGreaterThan(0);
    expect(view.throttle).toBeLessThanOrEqual(1);
    expect(["normal", "reduced", "muted"]).toContain(view.state);
    expect(view.nextLike.throttle).toBeGreaterThanOrEqual(view.throttle);
    expect(view.nextDislike.throttle).toBeLessThanOrEqual(view.throttle);
  });
});
