import { describe, expect, it, vi } from "vitest";
import type { Queryable } from "../db";
import { createIngestionHealthRepo } from "./ingestion_health";

describe("ingestion_health repo", () => {
  it("normalizes handle query by stripping @ and lowercasing", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const db = { query } as unknown as Queryable;
    const repo = createIngestionHealthRepo(db);

    await repo.getHandleHealth({ userId: "user-1" });

    const sql = String(query.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain("lower(ltrim(btrim(ci.raw_json->>'user_handle'), '@'))");
  });

  it("supports dry-run normalization without updating rows", async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [{ count: "3" }] });
    const db = { query } as unknown as Queryable;
    const repo = createIngestionHealthRepo(db);

    const result = await repo.normalizeStoredXUserHandles({
      userId: "user-1",
      dryRun: true,
    });

    expect(result).toEqual({ candidates: 3, updated: 0 });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("updates candidate rows during normalization", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ count: "2" }] })
      .mockResolvedValueOnce({ rowCount: 2, rows: [] });
    const db = { query } as unknown as Queryable;
    const repo = createIngestionHealthRepo(db);

    const result = await repo.normalizeStoredXUserHandles({
      userId: "user-1",
    });

    expect(result).toEqual({ candidates: 2, updated: 2 });
    expect(query).toHaveBeenCalledTimes(2);
  });
});
