import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@aharadar/connectors", () => ({
  getConnector: vi.fn(),
}));

import { getConnector } from "@aharadar/connectors";
import type { Db } from "@aharadar/db";
import { ingestEnabledSources } from "./ingest";

describe("ingestEnabledSources", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("preserves provider-reported costEstimateUsd when inserting provider calls", async () => {
    const fetch = vi.fn().mockResolvedValue({
      rawItems: [],
      nextCursor: {},
      meta: {
        providerCalls: [
          {
            userId: "user-1",
            purpose: "x_posts_fetch",
            provider: "xai",
            model: "grok-4-1-fast-non-reasoning",
            inputTokens: 123,
            outputTokens: 45,
            costEstimateCredits: 50,
            costEstimateUsd: 1.234,
            meta: {},
            startedAt: "2026-02-07T12:00:00.000Z",
            endedAt: "2026-02-07T12:00:01.000Z",
            status: "ok",
          },
        ],
      },
    });

    vi.mocked(getConnector).mockReturnValue({
      sourceType: "x_posts",
      fetch,
      normalize: vi.fn(),
    } as never);

    const providerCallInsert = vi.fn().mockResolvedValue({ id: "pc-1" });
    const db = {
      sources: {
        listEnabledByUserAndTopic: vi.fn().mockResolvedValue([
          {
            id: "source-1",
            user_id: "user-1",
            topic_id: "topic-1",
            type: "x_posts",
            name: "X source",
            is_enabled: true,
            config_json: { vendor: "grok", queries: ["from:alpha"] },
            cursor_json: {},
            created_at: new Date(),
            updated_at: new Date(),
          },
        ]),
        updateCursor: vi.fn().mockResolvedValue(undefined),
      },
      fetchRuns: {
        start: vi.fn().mockResolvedValue({ id: "fetch-run-1" }),
        finish: vi.fn().mockResolvedValue(undefined),
      },
      providerCalls: {
        insert: providerCallInsert,
      },
      contentItems: {
        upsert: vi.fn(),
      },
      contentItemSources: {
        upsert: vi.fn(),
      },
      xAccountPolicies: {
        upsertDefaults: vi.fn(),
      },
      notifications: {
        create: vi.fn(),
      },
    } as unknown as Db;

    await ingestEnabledSources({
      db,
      userId: "user-1",
      topicId: "topic-1",
      windowStart: "2026-02-07T00:00:00.000Z",
      windowEnd: "2026-02-07T23:59:59.000Z",
      limits: { maxItemsPerSource: 20 },
    });

    expect(providerCallInsert).toHaveBeenCalledTimes(1);
    expect(providerCallInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        purpose: "x_posts_fetch",
        costEstimateUsd: 1.234,
      }),
    );
  });
});
