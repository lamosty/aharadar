import type { Db } from "@aharadar/db";
import { describe, expect, it, vi } from "vitest";
import { generateDueWindows, getSchedulableTopics, parseSchedulerConfig } from "./cron";

// -----------------------------------------------------------------------------
// parseSchedulerConfig
// -----------------------------------------------------------------------------
describe("parseSchedulerConfig", () => {
  it("returns fixed_3x_daily when env var is missing", () => {
    const result = parseSchedulerConfig({});
    expect(result.windowMode).toBe("fixed_3x_daily");
  });

  it("returns fixed_3x_daily when env var is undefined", () => {
    const result = parseSchedulerConfig({ SCHEDULER_WINDOW_MODE: undefined });
    expect(result.windowMode).toBe("fixed_3x_daily");
  });

  it("returns since_last_run when env var is since_last_run", () => {
    const result = parseSchedulerConfig({ SCHEDULER_WINDOW_MODE: "since_last_run" });
    expect(result.windowMode).toBe("since_last_run");
  });

  it("returns fixed_3x_daily for unknown string value", () => {
    const result = parseSchedulerConfig({ SCHEDULER_WINDOW_MODE: "unknown_mode" });
    expect(result.windowMode).toBe("fixed_3x_daily");
  });

  it("returns fixed_3x_daily when explicitly set", () => {
    const result = parseSchedulerConfig({ SCHEDULER_WINDOW_MODE: "fixed_3x_daily" });
    expect(result.windowMode).toBe("fixed_3x_daily");
  });
});

// -----------------------------------------------------------------------------
// generateDueWindows - fixed_3x_daily mode
// -----------------------------------------------------------------------------
describe("generateDueWindows - fixed_3x_daily", () => {
  function createMockDb(overrides: Partial<Db> = {}): Db {
    return {
      query: vi.fn().mockResolvedValue({ rows: [] }),
      digests: {
        getLatestByUserAndTopic: vi.fn().mockResolvedValue(null),
      },
      users: {
        getFirstUser: vi.fn().mockResolvedValue(null),
      },
      topics: {
        listByUser: vi.fn().mockResolvedValue([]),
      },
      ...overrides,
    } as unknown as Db;
  }

  describe("window boundaries", () => {
    it("returns [00:00, 08:00) UTC window when hour is 03:00", async () => {
      const db = createMockDb();
      const now = new Date("2024-06-15T03:30:00Z");

      const result = await generateDueWindows({
        db,
        userId: "user-1",
        topicId: "topic-1",
        config: { windowMode: "fixed_3x_daily" },
        now,
      });

      expect(result).toHaveLength(1);
      expect(result[0].windowStart).toBe("2024-06-15T00:00:00.000Z");
      expect(result[0].windowEnd).toBe("2024-06-15T08:00:00.000Z");
      expect(result[0].mode).toBe("normal");
    });

    it("returns [08:00, 16:00) UTC window when hour is 12:00", async () => {
      const db = createMockDb();
      const now = new Date("2024-06-15T12:00:00Z");

      const result = await generateDueWindows({
        db,
        userId: "user-1",
        topicId: "topic-1",
        config: { windowMode: "fixed_3x_daily" },
        now,
      });

      expect(result).toHaveLength(1);
      expect(result[0].windowStart).toBe("2024-06-15T08:00:00.000Z");
      expect(result[0].windowEnd).toBe("2024-06-15T16:00:00.000Z");
    });

    it("returns [16:00, 24:00) UTC window when hour is 20:00", async () => {
      const db = createMockDb();
      const now = new Date("2024-06-15T20:45:00Z");

      const result = await generateDueWindows({
        db,
        userId: "user-1",
        topicId: "topic-1",
        config: { windowMode: "fixed_3x_daily" },
        now,
      });

      expect(result).toHaveLength(1);
      expect(result[0].windowStart).toBe("2024-06-15T16:00:00.000Z");
      expect(result[0].windowEnd).toBe("2024-06-16T00:00:00.000Z");
    });

    it("returns [00:00, 08:00) window at exactly 00:00", async () => {
      const db = createMockDb();
      const now = new Date("2024-06-15T00:00:00Z");

      const result = await generateDueWindows({
        db,
        userId: "user-1",
        topicId: "topic-1",
        config: { windowMode: "fixed_3x_daily" },
        now,
      });

      expect(result[0].windowStart).toBe("2024-06-15T00:00:00.000Z");
      expect(result[0].windowEnd).toBe("2024-06-15T08:00:00.000Z");
    });

    it("returns [08:00, 16:00) window at exactly 08:00", async () => {
      const db = createMockDb();
      const now = new Date("2024-06-15T08:00:00Z");

      const result = await generateDueWindows({
        db,
        userId: "user-1",
        topicId: "topic-1",
        config: { windowMode: "fixed_3x_daily" },
        now,
      });

      expect(result[0].windowStart).toBe("2024-06-15T08:00:00.000Z");
      expect(result[0].windowEnd).toBe("2024-06-15T16:00:00.000Z");
    });

    it("returns [16:00, 24:00) window at exactly 16:00", async () => {
      const db = createMockDb();
      const now = new Date("2024-06-15T16:00:00Z");

      const result = await generateDueWindows({
        db,
        userId: "user-1",
        topicId: "topic-1",
        config: { windowMode: "fixed_3x_daily" },
        now,
      });

      expect(result[0].windowStart).toBe("2024-06-15T16:00:00.000Z");
      expect(result[0].windowEnd).toBe("2024-06-16T00:00:00.000Z");
    });
  });

  describe("existing digest check", () => {
    it("returns empty array when digest already exists for window+mode", async () => {
      const db = createMockDb({
        query: vi.fn().mockResolvedValue({ rows: [{ id: "existing-digest" }] }),
      });
      const now = new Date("2024-06-15T10:00:00Z");

      const result = await generateDueWindows({
        db,
        userId: "user-1",
        topicId: "topic-1",
        config: { windowMode: "fixed_3x_daily" },
        now,
      });

      expect(result).toEqual([]);
    });

    it("returns window when no existing digest found", async () => {
      const db = createMockDb({
        query: vi.fn().mockResolvedValue({ rows: [] }),
      });
      const now = new Date("2024-06-15T10:00:00Z");

      const result = await generateDueWindows({
        db,
        userId: "user-1",
        topicId: "topic-1",
        config: { windowMode: "fixed_3x_daily" },
        now,
      });

      expect(result).toHaveLength(1);
      expect(result[0].mode).toBe("normal");
    });

    it("queries with correct parameters", async () => {
      const mockQuery = vi.fn().mockResolvedValue({ rows: [] });
      const db = createMockDb({ query: mockQuery });
      const now = new Date("2024-06-15T10:00:00Z");

      await generateDueWindows({
        db,
        userId: "user-123",
        topicId: "topic-456",
        config: { windowMode: "fixed_3x_daily" },
        now,
      });

      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining("SELECT id FROM digests"), [
        "user-123",
        "topic-456",
        "2024-06-15T08:00:00.000Z",
        "2024-06-15T16:00:00.000Z",
        "normal",
      ]);
    });
  });
});

// -----------------------------------------------------------------------------
// generateDueWindows - since_last_run mode
// -----------------------------------------------------------------------------
describe("generateDueWindows - since_last_run", () => {
  function createMockDb(lastDigest: { window_end: string } | null = null): Db {
    return {
      query: vi.fn().mockResolvedValue({ rows: [] }),
      digests: {
        getLatestByUserAndTopic: vi.fn().mockResolvedValue(lastDigest),
      },
      users: {
        getFirstUser: vi.fn().mockResolvedValue(null),
      },
      topics: {
        listByUser: vi.fn().mockResolvedValue([]),
      },
    } as unknown as Db;
  }

  it("starts from last digest window_end when digest exists", async () => {
    const db = createMockDb({ window_end: "2024-06-15T08:00:00.000Z" });
    const now = new Date("2024-06-15T12:00:00Z");

    const result = await generateDueWindows({
      db,
      userId: "user-1",
      topicId: "topic-1",
      config: { windowMode: "since_last_run" },
      now,
    });

    expect(result).toHaveLength(1);
    expect(result[0].windowStart).toBe("2024-06-15T08:00:00.000Z");
    expect(result[0].windowEnd).toBe("2024-06-15T12:00:00.000Z");
  });

  it("starts from now - 24h when no digest exists", async () => {
    const db = createMockDb(null);
    const now = new Date("2024-06-15T12:00:00.000Z");

    const result = await generateDueWindows({
      db,
      userId: "user-1",
      topicId: "topic-1",
      config: { windowMode: "since_last_run" },
      now,
    });

    expect(result).toHaveLength(1);
    expect(result[0].windowStart).toBe("2024-06-14T12:00:00.000Z");
    expect(result[0].windowEnd).toBe("2024-06-15T12:00:00.000Z");
  });

  it("returns empty array when duration is less than 60 seconds", async () => {
    const db = createMockDb({ window_end: "2024-06-15T11:59:30.000Z" });
    const now = new Date("2024-06-15T12:00:00.000Z");

    const result = await generateDueWindows({
      db,
      userId: "user-1",
      topicId: "topic-1",
      config: { windowMode: "since_last_run" },
      now,
    });

    expect(result).toEqual([]);
  });

  it("returns empty array when duration is exactly 59 seconds", async () => {
    const db = createMockDb({ window_end: "2024-06-15T11:59:01.000Z" });
    const now = new Date("2024-06-15T12:00:00.000Z");

    const result = await generateDueWindows({
      db,
      userId: "user-1",
      topicId: "topic-1",
      config: { windowMode: "since_last_run" },
      now,
    });

    expect(result).toEqual([]);
  });

  it("returns window when duration is exactly 60 seconds", async () => {
    const db = createMockDb({ window_end: "2024-06-15T11:59:00.000Z" });
    const now = new Date("2024-06-15T12:00:00.000Z");

    const result = await generateDueWindows({
      db,
      userId: "user-1",
      topicId: "topic-1",
      config: { windowMode: "since_last_run" },
      now,
    });

    expect(result).toHaveLength(1);
  });

  it("does not set mode field for since_last_run windows", async () => {
    const db = createMockDb(null);
    const now = new Date("2024-06-15T12:00:00Z");

    const result = await generateDueWindows({
      db,
      userId: "user-1",
      topicId: "topic-1",
      config: { windowMode: "since_last_run" },
      now,
    });

    expect(result[0].mode).toBeUndefined();
  });

  it("queries digest repo with correct userId and topicId", async () => {
    const mockGetLatest = vi.fn().mockResolvedValue(null);
    const db = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
      digests: {
        getLatestByUserAndTopic: mockGetLatest,
      },
      users: { getFirstUser: vi.fn() },
      topics: { listByUser: vi.fn() },
    } as unknown as Db;
    const now = new Date("2024-06-15T12:00:00Z");

    await generateDueWindows({
      db,
      userId: "user-abc",
      topicId: "topic-xyz",
      config: { windowMode: "since_last_run" },
      now,
    });

    expect(mockGetLatest).toHaveBeenCalledWith({ userId: "user-abc", topicId: "topic-xyz" });
  });
});

// -----------------------------------------------------------------------------
// getSchedulableTopics
// -----------------------------------------------------------------------------
describe("getSchedulableTopics", () => {
  it("returns empty array when no user exists", async () => {
    const db = {
      users: {
        getFirstUser: vi.fn().mockResolvedValue(null),
      },
      topics: {
        listByUser: vi.fn().mockResolvedValue([]),
      },
    } as unknown as Db;

    const result = await getSchedulableTopics(db);

    expect(result).toEqual([]);
    expect(db.topics.listByUser).not.toHaveBeenCalled();
  });

  it("returns all topics for the singleton user", async () => {
    const mockUser = { id: "user-1", email: "test@example.com" };
    const mockTopics = [
      { id: "topic-a", user_id: "user-1" },
      { id: "topic-b", user_id: "user-1" },
      { id: "topic-c", user_id: "user-1" },
    ];
    const db = {
      users: {
        getFirstUser: vi.fn().mockResolvedValue(mockUser),
      },
      topics: {
        listByUser: vi.fn().mockResolvedValue(mockTopics),
      },
    } as unknown as Db;

    const result = await getSchedulableTopics(db);

    expect(result).toEqual([
      { userId: "user-1", topicId: "topic-a" },
      { userId: "user-1", topicId: "topic-b" },
      { userId: "user-1", topicId: "topic-c" },
    ]);
    expect(db.topics.listByUser).toHaveBeenCalledWith("user-1");
  });

  it("returns empty array when user has no topics", async () => {
    const mockUser = { id: "user-1", email: "test@example.com" };
    const db = {
      users: {
        getFirstUser: vi.fn().mockResolvedValue(mockUser),
      },
      topics: {
        listByUser: vi.fn().mockResolvedValue([]),
      },
    } as unknown as Db;

    const result = await getSchedulableTopics(db);

    expect(result).toEqual([]);
  });
});
