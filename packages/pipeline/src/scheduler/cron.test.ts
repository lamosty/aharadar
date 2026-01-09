import type { Db, TopicRow } from "@aharadar/db";
import { describe, expect, it, vi } from "vitest";
import {
  generateDueWindows,
  getSchedulableTopics,
  parseSchedulerConfig,
  type SchedulerConfig,
} from "./cron";

// -----------------------------------------------------------------------------
// parseSchedulerConfig
// -----------------------------------------------------------------------------
describe("parseSchedulerConfig", () => {
  it("returns defaults when env vars are missing", () => {
    const result = parseSchedulerConfig({});
    expect(result.maxBackfillWindows).toBe(6);
    expect(result.minWindowSeconds).toBe(60);
    expect(result.lagSeconds).toBe(60);
  });

  it("parses SCHEDULER_MAX_BACKFILL_WINDOWS from env", () => {
    const result = parseSchedulerConfig({ SCHEDULER_MAX_BACKFILL_WINDOWS: "10" });
    expect(result.maxBackfillWindows).toBe(10);
  });

  it("parses SCHEDULER_MIN_WINDOW_SECONDS from env", () => {
    const result = parseSchedulerConfig({ SCHEDULER_MIN_WINDOW_SECONDS: "120" });
    expect(result.minWindowSeconds).toBe(120);
  });

  it("ignores invalid maxBackfillWindows values", () => {
    expect(
      parseSchedulerConfig({ SCHEDULER_MAX_BACKFILL_WINDOWS: "invalid" }).maxBackfillWindows,
    ).toBe(6);
    expect(parseSchedulerConfig({ SCHEDULER_MAX_BACKFILL_WINDOWS: "0" }).maxBackfillWindows).toBe(
      6,
    );
    expect(parseSchedulerConfig({ SCHEDULER_MAX_BACKFILL_WINDOWS: "-5" }).maxBackfillWindows).toBe(
      6,
    );
  });

  it("ignores invalid minWindowSeconds values", () => {
    expect(parseSchedulerConfig({ SCHEDULER_MIN_WINDOW_SECONDS: "invalid" }).minWindowSeconds).toBe(
      60,
    );
    expect(parseSchedulerConfig({ SCHEDULER_MIN_WINDOW_SECONDS: "0" }).minWindowSeconds).toBe(60);
    expect(parseSchedulerConfig({ SCHEDULER_MIN_WINDOW_SECONDS: "-5" }).minWindowSeconds).toBe(60);
  });
});

// -----------------------------------------------------------------------------
// generateDueWindows - topic-based scheduling
// -----------------------------------------------------------------------------
describe("generateDueWindows", () => {
  const defaultConfig: SchedulerConfig = {
    maxBackfillWindows: 6,
    minWindowSeconds: 60,
    lagSeconds: 60,
  };

  function createMockTopic(overrides: Partial<TopicRow> = {}): TopicRow {
    return {
      id: "topic-1",
      user_id: "user-1",
      name: "Test Topic",
      description: null,
      viewing_profile: null,
      decay_hours: null,
      last_checked_at: null,
      created_at: new Date().toISOString(),
      digest_schedule_enabled: true,
      digest_interval_minutes: 60, // 1 hour
      digest_mode: "normal",
      digest_depth: 50,
      digest_cursor_end: null,
      ...overrides,
    };
  }

  function createMockDb(topic: TopicRow | null = null): Db {
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
        getById: vi.fn().mockResolvedValue(topic),
      },
    } as unknown as Db;
  }

  describe("schedule disabled", () => {
    it("returns empty array when digest_schedule_enabled is false", async () => {
      const topic = createMockTopic({ digest_schedule_enabled: false });
      const db = createMockDb(topic);
      const now = new Date("2024-06-15T10:00:00Z");

      const result = await generateDueWindows({
        db,
        userId: "user-1",
        topicId: "topic-1",
        config: defaultConfig,
        now,
      });

      expect(result).toEqual([]);
    });

    it("returns empty array when topic not found", async () => {
      const db = createMockDb(null);
      const now = new Date("2024-06-15T10:00:00Z");

      const result = await generateDueWindows({
        db,
        userId: "user-1",
        topicId: "nonexistent",
        config: defaultConfig,
        now,
      });

      expect(result).toEqual([]);
    });
  });

  describe("cursor initialization (no cursor_end)", () => {
    it("does not emit window immediately when cursor is freshly initialized", async () => {
      // When there's no cursor, we initialize to now_floor - interval
      // The first window would end at now_floor, which is within the lag period
      // So no windows are emitted until the next tick (or more time passes)
      const topic = createMockTopic({
        digest_interval_minutes: 60,
        digest_cursor_end: null,
      });
      const db = createMockDb(topic);
      const now = new Date("2024-06-15T13:02:00Z");

      const result = await generateDueWindows({
        db,
        userId: "user-1",
        topicId: "topic-1",
        config: defaultConfig,
        now,
      });

      // No windows because the initialized cursor puts windowEnd at now_floor (13:02)
      // which is > now - lag (13:01)
      expect(result).toHaveLength(0);
    });

    it("emits window after enough time passes since cursor initialization", async () => {
      // Simulate: cursor was initialized on first tick at 12:00
      // Then time passes to 13:02 (62 minutes later)
      // Now we have: cursorEnd = 12:00, windowEnd = 13:00, now = 13:02
      // windowEnd (13:00) <= now - lag (13:01), so window is emitted
      const topic = createMockTopic({
        digest_interval_minutes: 60,
        // Simulate cursor was set on a previous tick
        digest_cursor_end: "2024-06-15T12:00:00Z",
      });
      const db = createMockDb(topic);
      const now = new Date("2024-06-15T13:02:00Z");

      const result = await generateDueWindows({
        db,
        userId: "user-1",
        topicId: "topic-1",
        config: defaultConfig,
        now,
      });

      expect(result).toHaveLength(1);
      expect(result[0].windowStart).toBe("2024-06-15T12:00:00.000Z");
      expect(result[0].windowEnd).toBe("2024-06-15T13:00:00.000Z");
    });
  });

  describe("cursor from digest_cursor_end", () => {
    it("starts from digest_cursor_end when it exists", async () => {
      const topic = createMockTopic({
        digest_interval_minutes: 60,
        digest_cursor_end: "2024-06-15T08:00:00Z",
        digest_mode: "high",
      });
      const db = createMockDb(topic);
      // cursor = 08:00, interval = 60min, windowEnd = 09:00
      // now must be > windowEnd + 60s = 09:01
      const now = new Date("2024-06-15T10:00:00Z");

      const result = await generateDueWindows({
        db,
        userId: "user-1",
        topicId: "topic-1",
        config: defaultConfig,
        now,
      });

      expect(result).toHaveLength(1);
      expect(result[0].windowStart).toBe("2024-06-15T08:00:00.000Z");
      expect(result[0].windowEnd).toBe("2024-06-15T09:00:00.000Z");
      expect(result[0].mode).toBe("high");
      expect(result[0].trigger).toBe("scheduled");
    });
  });

  describe("backfill behavior", () => {
    it("generates multiple consecutive windows when cursor is behind", async () => {
      const topic = createMockTopic({
        digest_interval_minutes: 60,
        digest_cursor_end: "2024-06-15T06:00:00Z",
      });
      const db = createMockDb(topic);
      // cursor = 06:00, now = 10:00
      // windows: [06:00, 07:00], [07:00, 08:00], [08:00, 09:00] (09:00 < 10:00 - 60s)
      // [09:00, 10:00] would have windowEnd = 10:00 > now - 60s = 09:59, so not emitted
      const now = new Date("2024-06-15T10:00:00Z");

      const result = await generateDueWindows({
        db,
        userId: "user-1",
        topicId: "topic-1",
        config: defaultConfig,
        now,
      });

      expect(result).toHaveLength(3);
      expect(result[0].windowStart).toBe("2024-06-15T06:00:00.000Z");
      expect(result[0].windowEnd).toBe("2024-06-15T07:00:00.000Z");
      expect(result[1].windowStart).toBe("2024-06-15T07:00:00.000Z");
      expect(result[1].windowEnd).toBe("2024-06-15T08:00:00.000Z");
      expect(result[2].windowStart).toBe("2024-06-15T08:00:00.000Z");
      expect(result[2].windowEnd).toBe("2024-06-15T09:00:00.000Z");
    });

    it("respects SCHEDULER_MAX_BACKFILL_WINDOWS cap", async () => {
      const topic = createMockTopic({
        digest_interval_minutes: 60,
        digest_cursor_end: "2024-06-14T00:00:00Z", // 24 hours behind
      });
      const db = createMockDb(topic);
      const now = new Date("2024-06-15T00:00:00Z");

      const result = await generateDueWindows({
        db,
        userId: "user-1",
        topicId: "topic-1",
        config: { ...defaultConfig, maxBackfillWindows: 3 },
        now,
      });

      // Should only emit 3 windows even though 24 are "due"
      expect(result).toHaveLength(3);
    });
  });

  describe("mode propagation", () => {
    it("propagates mode from topic.digest_mode", async () => {
      const topic = createMockTopic({
        digest_interval_minutes: 60,
        digest_cursor_end: "2024-06-15T08:00:00Z",
        digest_mode: "low",
      });
      const db = createMockDb(topic);
      const now = new Date("2024-06-15T10:00:00Z");

      const result = await generateDueWindows({
        db,
        userId: "user-1",
        topicId: "topic-1",
        config: defaultConfig,
        now,
      });

      expect(result[0].mode).toBe("low");
    });
  });

  describe("trigger field", () => {
    it("sets trigger to scheduled for all generated windows", async () => {
      const topic = createMockTopic({
        digest_interval_minutes: 60,
        digest_cursor_end: "2024-06-15T06:00:00Z",
      });
      const db = createMockDb(topic);
      const now = new Date("2024-06-15T10:00:00Z");

      const result = await generateDueWindows({
        db,
        userId: "user-1",
        topicId: "topic-1",
        config: defaultConfig,
        now,
      });

      for (const window of result) {
        expect(window.trigger).toBe("scheduled");
      }
    });
  });

  describe("lag behavior", () => {
    it("does not emit window when windowEnd is within lag period", async () => {
      const topic = createMockTopic({
        digest_interval_minutes: 60,
        digest_cursor_end: "2024-06-15T09:00:00Z",
      });
      const db = createMockDb(topic);
      // cursor = 09:00, windowEnd = 10:00
      // now = 10:00:30, lag = 60s
      // windowEnd (10:00) > now - lag (09:59:30), so no window
      const now = new Date("2024-06-15T10:00:30Z");

      const result = await generateDueWindows({
        db,
        userId: "user-1",
        topicId: "topic-1",
        config: { ...defaultConfig, lagSeconds: 60 },
        now,
      });

      expect(result).toHaveLength(0);
    });

    it("emits window when windowEnd is outside lag period", async () => {
      const topic = createMockTopic({
        digest_interval_minutes: 60,
        digest_cursor_end: "2024-06-15T09:00:00Z",
      });
      const db = createMockDb(topic);
      // cursor = 09:00, windowEnd = 10:00
      // now = 10:01:01, lag = 60s
      // windowEnd (10:00) <= now - lag (10:00:01), so emit window
      const now = new Date("2024-06-15T10:01:01Z");

      const result = await generateDueWindows({
        db,
        userId: "user-1",
        topicId: "topic-1",
        config: { ...defaultConfig, lagSeconds: 60 },
        now,
      });

      expect(result).toHaveLength(1);
    });
  });
});

// -----------------------------------------------------------------------------
// getSchedulableTopics
// -----------------------------------------------------------------------------
describe("getSchedulableTopics", () => {
  function createMockTopic(overrides: Partial<TopicRow> = {}): TopicRow {
    return {
      id: "topic-1",
      user_id: "user-1",
      name: "Test Topic",
      description: null,
      viewing_profile: null,
      decay_hours: null,
      last_checked_at: null,
      created_at: new Date().toISOString(),
      digest_schedule_enabled: true,
      digest_interval_minutes: 60,
      digest_mode: "normal",
      digest_depth: 50,
      digest_cursor_end: null,
      ...overrides,
    };
  }

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

  it("returns only topics with digest_schedule_enabled=true", async () => {
    const mockUser = { id: "user-1", email: "test@example.com" };
    const mockTopics = [
      createMockTopic({ id: "topic-a", digest_schedule_enabled: true }),
      createMockTopic({ id: "topic-b", digest_schedule_enabled: false }),
      createMockTopic({ id: "topic-c", digest_schedule_enabled: true }),
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
      { userId: "user-1", topicId: "topic-c" },
    ]);
    expect(db.topics.listByUser).toHaveBeenCalledWith("user-1");
  });

  it("returns empty array when all topics have scheduling disabled", async () => {
    const mockUser = { id: "user-1", email: "test@example.com" };
    const mockTopics = [
      createMockTopic({ id: "topic-a", digest_schedule_enabled: false }),
      createMockTopic({ id: "topic-b", digest_schedule_enabled: false }),
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

    expect(result).toEqual([]);
  });
});
