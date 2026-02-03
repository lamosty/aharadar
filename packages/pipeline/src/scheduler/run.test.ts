import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the stage functions before importing
vi.mock("../stages/ingest", () => ({
  ingestEnabledSources: vi.fn(),
}));

vi.mock("../stages/embed", () => ({
  embedTopicContentItems: vi.fn(),
}));

vi.mock("../stages/dedupe", () => ({
  dedupeTopicContentItems: vi.fn(),
}));

vi.mock("../stages/cluster", () => ({
  clusterTopicContentItems: vi.fn(),
}));

vi.mock("../stages/digest", () => ({
  persistDigestFromContentItems: vi.fn(),
}));

vi.mock("../budgets/credits", () => ({
  computeCreditsStatus: vi.fn(),
  printCreditsWarning: vi.fn(),
}));

import type { Db } from "@aharadar/db";
import { computeCreditsStatus, printCreditsWarning } from "../budgets/credits";
import { applyBudgetScale, compileDigestPlan } from "../lib/digest_plan";
import { clusterTopicContentItems } from "../stages/cluster";
import { dedupeTopicContentItems } from "../stages/dedupe";
import { persistDigestFromContentItems } from "../stages/digest";
import { embedTopicContentItems } from "../stages/embed";
import { ingestEnabledSources } from "../stages/ingest";
import { runPipelineOnce } from "./run";

describe("runPipelineOnce", () => {
  // Mock db with required methods
  const mockDb = {
    topics: {
      getById: vi.fn().mockResolvedValue({
        id: "topic-1",
        user_id: "user-1",
        name: "Test Topic",
        digest_mode: "normal",
        digest_depth: 50,
        decay_hours: null,
      }),
    },
    sources: {
      listEnabledByUserAndTopic: vi
        .fn()
        .mockResolvedValue([{ id: "source-1", type: "rss", name: "Test Source" }]),
    },
    notifications: {
      create: vi.fn().mockResolvedValue(undefined),
    },
  } as unknown as Db;

  const baseParams = {
    userId: "user-1",
    topicId: "topic-1",
    windowStart: "2024-06-15T00:00:00Z",
    windowEnd: "2024-06-15T08:00:00Z",
  };

  const mockIngestResult = {
    sourcesProcessed: 1,
    itemsIngested: 5,
    perSource: [
      {
        sourceId: "source-1",
        sourceName: "Test Source",
        sourceType: "rss",
        status: "ok",
        itemsFetched: 5,
      },
    ],
  };
  const mockEmbedResult = { itemsEmbedded: 5 };
  const mockDedupeResult = { deduplicatedCount: 0 };
  const mockClusterResult = { clustersCreated: 1 };
  const mockDigestResult = { digestId: "digest-1", itemsIncluded: 5 };

  beforeEach(() => {
    vi.mocked(ingestEnabledSources).mockResolvedValue(mockIngestResult as never);
    vi.mocked(embedTopicContentItems).mockResolvedValue(mockEmbedResult as never);
    vi.mocked(dedupeTopicContentItems).mockResolvedValue(mockDedupeResult as never);
    vi.mocked(clusterTopicContentItems).mockResolvedValue(mockClusterResult as never);
    vi.mocked(persistDigestFromContentItems).mockResolvedValue(mockDigestResult as never);
    vi.mocked(printCreditsWarning).mockReturnValue(false);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("without budget config", () => {
    it("does not call computeCreditsStatus when no budget provided", async () => {
      await runPipelineOnce(mockDb, baseParams);

      expect(computeCreditsStatus).not.toHaveBeenCalled();
    });

    it("passes paidCallsAllowed=true to all stages", async () => {
      await runPipelineOnce(mockDb, baseParams);

      expect(ingestEnabledSources).toHaveBeenCalledWith(
        expect.objectContaining({ paidCallsAllowed: true }),
      );
      expect(embedTopicContentItems).toHaveBeenCalledWith(
        expect.objectContaining({ paidCallsAllowed: true }),
      );
      expect(persistDigestFromContentItems).toHaveBeenCalledWith(
        expect.objectContaining({ paidCallsAllowed: true }),
      );
    });

    it("uses normal mode for digest by default", async () => {
      await runPipelineOnce(mockDb, baseParams);

      expect(persistDigestFromContentItems).toHaveBeenCalledWith(
        expect.objectContaining({ mode: "normal" }),
      );
    });

    // catch_up mode tests removed per task-121
  });

  describe("with budget config - paidCallsAllowed=true", () => {
    beforeEach(() => {
      vi.mocked(computeCreditsStatus).mockResolvedValue({
        monthlyUsed: 500,
        monthlyLimit: 1000,
        monthlyRemaining: 500,
        dailyUsed: 50,
        dailyLimit: null,
        dailyRemaining: null,
        paidCallsAllowed: true,
        warningLevel: "none",
      });
    });

    it("calls computeCreditsStatus with budget params", async () => {
      await runPipelineOnce(mockDb, {
        ...baseParams,
        budget: { monthlyCredits: 1000, dailyThrottleCredits: 100 },
      });

      expect(computeCreditsStatus).toHaveBeenCalledWith({
        db: mockDb,
        userId: "user-1",
        monthlyCredits: 1000,
        dailyThrottleCredits: 100,
        windowEnd: "2024-06-15T08:00:00Z",
      });
    });

    it("passes paidCallsAllowed=true to stages", async () => {
      await runPipelineOnce(mockDb, {
        ...baseParams,
        budget: { monthlyCredits: 1000 },
      });

      expect(ingestEnabledSources).toHaveBeenCalledWith(
        expect.objectContaining({ paidCallsAllowed: true }),
      );
      expect(embedTopicContentItems).toHaveBeenCalledWith(
        expect.objectContaining({ paidCallsAllowed: true }),
      );
      expect(persistDigestFromContentItems).toHaveBeenCalledWith(
        expect.objectContaining({ paidCallsAllowed: true }),
      );
    });

    it("uses normal mode for digest when mode not specified", async () => {
      await runPipelineOnce(mockDb, {
        ...baseParams,
        budget: { monthlyCredits: 1000 },
      });

      expect(persistDigestFromContentItems).toHaveBeenCalledWith(
        expect.objectContaining({ mode: "normal" }),
      );
    });

    it("uses specified mode for digest when provided", async () => {
      await runPipelineOnce(mockDb, {
        ...baseParams,
        mode: "high",
        budget: { monthlyCredits: 1000 },
      });

      expect(persistDigestFromContentItems).toHaveBeenCalledWith(
        expect.objectContaining({ mode: "high" }),
      );
    });

    it("includes creditsStatus in result", async () => {
      const result = await runPipelineOnce(mockDb, {
        ...baseParams,
        budget: { monthlyCredits: 1000 },
      });

      expect(result.creditsStatus).toBeDefined();
      expect(result.creditsStatus?.monthlyUsed).toBe(500);
    });

    it("scales digest plan when credits are approaching limit", async () => {
      vi.mocked(computeCreditsStatus).mockResolvedValue({
        monthlyUsed: 850,
        monthlyLimit: 1000,
        monthlyRemaining: 150,
        dailyUsed: 0,
        dailyLimit: null,
        dailyRemaining: null,
        paidCallsAllowed: true,
        warningLevel: "approaching",
      });

      await runPipelineOnce(mockDb, {
        ...baseParams,
        budget: { monthlyCredits: 1000 },
      });

      const plan = compileDigestPlan({
        mode: "normal",
        digestDepth: 50,
        enabledSourceCount: 1,
        env: {},
      });
      const scaled = applyBudgetScale(plan, 0.7);

      expect(persistDigestFromContentItems).toHaveBeenCalledWith(
        expect.objectContaining({
          limits: expect.objectContaining({
            triageMaxCalls: scaled.triageMaxCalls,
            candidatePoolMax: scaled.candidatePoolMax,
            deepSummaryMaxCalls: scaled.deepSummaryMaxCalls,
          }),
        }),
      );
    });
  });

  describe("with budget config - paidCallsAllowed=false (credits exhausted)", () => {
    beforeEach(() => {
      vi.mocked(computeCreditsStatus).mockResolvedValue({
        monthlyUsed: 1000,
        monthlyLimit: 1000,
        monthlyRemaining: 0,
        dailyUsed: 100,
        dailyLimit: 100,
        dailyRemaining: 0,
        paidCallsAllowed: false,
        warningLevel: "critical",
      });
    });

    it("passes paidCallsAllowed=false to ingest", async () => {
      await runPipelineOnce(mockDb, {
        ...baseParams,
        budget: { monthlyCredits: 1000 },
      });

      expect(ingestEnabledSources).toHaveBeenCalledWith(
        expect.objectContaining({ paidCallsAllowed: false }),
      );
    });

    it("passes paidCallsAllowed=false to embed", async () => {
      await runPipelineOnce(mockDb, {
        ...baseParams,
        budget: { monthlyCredits: 1000 },
      });

      expect(embedTopicContentItems).toHaveBeenCalledWith(
        expect.objectContaining({ paidCallsAllowed: false }),
      );
    });

    it("skips digest creation when credits exhausted (policy=STOP)", async () => {
      const result = await runPipelineOnce(mockDb, {
        ...baseParams,
        budget: { monthlyCredits: 1000 },
      });

      // Digest should NOT be called when credits exhausted and budget is configured
      expect(persistDigestFromContentItems).not.toHaveBeenCalled();
      expect(result.digest).toBeNull();
      expect(result.digestSkippedDueToCredits).toBe(true);
    });

    it("forces tier to low for embed when credits exhausted", async () => {
      await runPipelineOnce(mockDb, {
        ...baseParams,
        mode: "high", // Even if user requests high, should be forced to low
        budget: { monthlyCredits: 1000 },
      });

      expect(embedTopicContentItems).toHaveBeenCalledWith(expect.objectContaining({ tier: "low" }));
    });

    it("calls printCreditsWarning", async () => {
      await runPipelineOnce(mockDb, {
        ...baseParams,
        budget: { monthlyCredits: 1000 },
      });

      expect(printCreditsWarning).toHaveBeenCalled();
    });
  });

  describe("tier resolution", () => {
    beforeEach(() => {
      vi.mocked(computeCreditsStatus).mockResolvedValue({
        monthlyUsed: 100,
        monthlyLimit: 1000,
        monthlyRemaining: 900,
        dailyUsed: 10,
        dailyLimit: null,
        dailyRemaining: null,
        paidCallsAllowed: true,
        warningLevel: "none",
      });
    });

    it("uses low tier when mode is low", async () => {
      await runPipelineOnce(mockDb, {
        ...baseParams,
        mode: "low",
        budget: { monthlyCredits: 1000 },
      });

      expect(embedTopicContentItems).toHaveBeenCalledWith(expect.objectContaining({ tier: "low" }));
    });

    it("uses normal tier when mode is normal", async () => {
      await runPipelineOnce(mockDb, {
        ...baseParams,
        mode: "normal",
        budget: { monthlyCredits: 1000 },
      });

      expect(embedTopicContentItems).toHaveBeenCalledWith(
        expect.objectContaining({ tier: "normal" }),
      );
    });

    it("uses high tier when mode is high", async () => {
      await runPipelineOnce(mockDb, {
        ...baseParams,
        mode: "high",
        budget: { monthlyCredits: 1000 },
      });

      expect(embedTopicContentItems).toHaveBeenCalledWith(
        expect.objectContaining({ tier: "high" }),
      );
    });

    // catch_up mode tests removed per task-121
  });
});
