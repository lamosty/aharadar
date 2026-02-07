import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Queryable } from "../db";
import { createProviderCallsRepo } from "./provider_calls";

describe("provider_calls repo", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-07T12:34:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("fills missing x_posts parse trend buckets with zeros", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          bucket_start: new Date("2026-02-07T10:00:00.000Z"),
          total_calls: "4",
          parse_errors: "1",
          lines_total: "100",
          lines_valid: "80",
          lines_invalid: "20",
        },
      ],
    });
    const db = { query } as unknown as Queryable;
    const repo = createProviderCallsRepo(db);

    const points = await repo.getXPostsParseTrend({
      userId: "user-1",
      hoursAgo: 6,
      bucketHours: 2,
    });

    expect(points).toHaveLength(4); // 06:00, 08:00, 10:00, 12:00
    expect(points[0]).toMatchObject({
      bucketStart: "2026-02-07T06:00:00.000Z",
      totalCalls: 0,
      parseErrors: 0,
      linesValid: 0,
      linesInvalid: 0,
    });
    expect(points[2]).toMatchObject({
      bucketStart: "2026-02-07T10:00:00.000Z",
      totalCalls: 4,
      parseErrors: 1,
      parseErrorRatePct: 25,
      linesTotal: 100,
      linesValid: 80,
      linesInvalid: 20,
      lineValidRatePct: 80,
    });
    expect(points[3]).toMatchObject({
      bucketStart: "2026-02-07T12:00:00.000Z",
      totalCalls: 0,
    });
  });
});
