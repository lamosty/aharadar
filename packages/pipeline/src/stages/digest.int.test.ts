import { createDb, type Db } from "@aharadar/db";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { readFileSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { persistDigestFromContentItems } from "./digest";

/**
 * Integration test for persistDigestFromContentItems.
 *
 * Uses Testcontainers to spin up a Postgres instance with pgvector,
 * applies migrations, seeds minimal data, and verifies digest behavior.
 *
 * Note: Tests with paidCallsAllowed=true require LLM keys to be configured
 * or will be skipped. Tests with paidCallsAllowed=false verify the policy=STOP
 * behavior (returns null without creating a digest).
 *
 * Run with: pnpm test:integration
 */
describe("persistDigestFromContentItems integration", () => {
  let container: StartedPostgreSqlContainer | null = null;
  let db: Db | null = null;

  // Test data IDs (set during seeding)
  let userId: string;
  let topicId: string;
  let sourceId1: string;
  let sourceId2: string;
  let contentItemIds: string[];

  const windowStart = "2026-01-05T00:00:00.000Z";
  const windowEnd = "2026-01-06T00:00:00.000Z";

  beforeAll(async () => {
    // Start Postgres container with pgvector
    container = await new PostgreSqlContainer("pgvector/pgvector:pg16")
      .withDatabase("aharadar_test")
      .withUsername("test")
      .withPassword("test")
      .start();

    const connectionString = container.getConnectionUri();
    db = createDb(connectionString);

    // Apply migrations in order
    const migrationsDir = join(__dirname, "../../../db/migrations");
    const migrationFiles = [
      "0001_init.sql",
      "0002_topics.sql",
      "0003_topic_preference_profiles.sql",
      "0004_user_preferences.sql",
      "0005_auth_tables.sql",
      "0006_topics_viewing_profile.sql",
      "0007_user_roles.sql",
      "0008_user_api_keys.sql",
      "0009_cost_usd_column.sql",
      "0010_llm_settings.sql",
    ];

    for (const file of migrationFiles) {
      const sql = readFileSync(join(migrationsDir, file), "utf-8");
      await db.query(sql, []);
    }

    // Seed test data with multiple sources for fairness testing
    await seedTestData();
  }, 120000); // 2 minute timeout for container startup

  afterAll(async () => {
    if (db) {
      await db.close();
    }
    if (container) {
      await container.stop();
    }
  });

  async function seedTestData() {
    if (!db) throw new Error("DB not initialized");

    // Create user
    const userResult = await db.query<{ id: string }>(
      `INSERT INTO users (email) VALUES ('test@example.com') RETURNING id`,
      [],
    );
    userId = userResult.rows[0].id;

    // Create topic
    const topicResult = await db.query<{ id: string }>(
      `INSERT INTO topics (user_id, name) VALUES ($1, 'test-topic') RETURNING id`,
      [userId],
    );
    topicId = topicResult.rows[0].id;

    // Create two sources with different types for fairness testing
    const sourceResult1 = await db.query<{ id: string }>(
      `INSERT INTO sources (user_id, topic_id, type, name, is_enabled)
       VALUES ($1, $2, 'rss', 'RSS Source', false) RETURNING id`,
      [userId, topicId],
    );
    sourceId1 = sourceResult1.rows[0].id;

    const sourceResult2 = await db.query<{ id: string }>(
      `INSERT INTO sources (user_id, topic_id, type, name, is_enabled)
       VALUES ($1, $2, 'reddit', 'Reddit Source', false) RETURNING id`,
      [userId, topicId],
    );
    sourceId2 = sourceResult2.rows[0].id;

    // Create content items from both sources
    contentItemIds = [];

    // RSS items (3)
    const rssItems = [
      {
        title: "RSS Article 1",
        bodyText: "This is the body of the first RSS article.",
        canonicalUrl: "https://example.com/rss-1",
        externalId: "rss-ext-1",
        publishedAt: "2026-01-05T10:00:00.000Z",
        sourceId: sourceId1,
        sourceType: "rss",
      },
      {
        title: "RSS Article 2",
        bodyText: "This is the body of the second RSS article.",
        canonicalUrl: "https://example.com/rss-2",
        externalId: "rss-ext-2",
        publishedAt: "2026-01-05T14:00:00.000Z",
        sourceId: sourceId1,
        sourceType: "rss",
      },
      {
        title: "RSS Article 3",
        bodyText: "This is the body of the third RSS article.",
        canonicalUrl: "https://example.com/rss-3",
        externalId: "rss-ext-3",
        publishedAt: "2026-01-05T18:00:00.000Z",
        sourceId: sourceId1,
        sourceType: "rss",
      },
    ];

    // Reddit items (2) with engagement metadata
    const redditItems = [
      {
        title: "Reddit Post 1",
        bodyText: "This is the body of the first Reddit post with high engagement.",
        canonicalUrl: "https://reddit.com/r/test/1",
        externalId: "reddit-ext-1",
        publishedAt: "2026-01-05T12:00:00.000Z",
        sourceId: sourceId2,
        sourceType: "reddit",
        metadata: { score: 500, num_comments: 100 },
      },
      {
        title: "Reddit Post 2",
        bodyText: "This is the body of the second Reddit post.",
        canonicalUrl: "https://reddit.com/r/test/2",
        externalId: "reddit-ext-2",
        publishedAt: "2026-01-05T16:00:00.000Z",
        sourceId: sourceId2,
        sourceType: "reddit",
        metadata: { score: 50, num_comments: 10 },
      },
    ];

    const allItems = [...rssItems, ...redditItems];

    for (const item of allItems) {
      const result = await db.query<{ id: string }>(
        `INSERT INTO content_items
           (user_id, source_id, source_type, external_id, canonical_url, title, body_text, published_at, fetched_at, metadata_json)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz, $8::timestamptz, $9)
         RETURNING id`,
        [
          userId,
          item.sourceId,
          item.sourceType,
          item.externalId,
          item.canonicalUrl,
          item.title,
          item.bodyText,
          item.publishedAt,
          JSON.stringify((item as { metadata?: object }).metadata ?? {}),
        ],
      );
      contentItemIds.push(result.rows[0].id);

      // Link content item to source
      await db.query(
        `INSERT INTO content_item_sources (content_item_id, source_id) VALUES ($1, $2)`,
        [result.rows[0].id, item.sourceId],
      );
    }
  }

  it("returns null when paidCallsAllowed=false (policy=STOP)", async () => {
    if (!db) throw new Error("DB not initialized");

    // With the new fair sampling implementation, paidCallsAllowed=false
    // returns null without creating a digest (policy=STOP)
    const result = await persistDigestFromContentItems({
      db,
      userId,
      topicId,
      windowStart,
      windowEnd,
      mode: "low",
      paidCallsAllowed: false,
    });

    // Result should be null
    expect(result).toBeNull();

    // Verify no digest was created
    const digestResult = await db.query<{ id: string }>(
      `SELECT id FROM digests WHERE user_id = $1 AND topic_id = $2
       AND window_start = $3::timestamptz AND window_end = $4::timestamptz`,
      [userId, topicId, windowStart, windowEnd],
    );
    expect(digestResult.rows).toHaveLength(0);
  });

  it("returns null when no candidates exist", async () => {
    if (!db) throw new Error("DB not initialized");

    // Use a window with no content items
    const emptyWindowStart = "2020-01-01T00:00:00.000Z";
    const emptyWindowEnd = "2020-01-02T00:00:00.000Z";

    const result = await persistDigestFromContentItems({
      db,
      userId,
      topicId,
      windowStart: emptyWindowStart,
      windowEnd: emptyWindowEnd,
      mode: "low",
      paidCallsAllowed: true, // Even with paid calls, no candidates = null
    });

    expect(result).toBeNull();
  });

  it("does not make provider_calls when paidCallsAllowed=false", async () => {
    if (!db) throw new Error("DB not initialized");

    // Clear any existing provider_calls
    await db.query(`DELETE FROM provider_calls WHERE user_id = $1`, [userId]);

    // Try to create a digest with paidCallsAllowed=false
    const newWindowStart = "2026-01-06T00:00:00.000Z";
    const newWindowEnd = "2026-01-07T00:00:00.000Z";

    // Add a content item for the new window
    const newItemResult = await db.query<{ id: string }>(
      `INSERT INTO content_items
         (user_id, source_id, source_type, external_id, canonical_url, title, body_text, published_at, fetched_at)
       VALUES ($1, $2, 'rss', 'ext-new', 'https://example.com/new', 'New Article', 'Body text', $3::timestamptz, $3::timestamptz)
       RETURNING id`,
      [userId, sourceId1, "2026-01-06T12:00:00.000Z"],
    );
    await db.query(
      `INSERT INTO content_item_sources (content_item_id, source_id) VALUES ($1, $2)`,
      [newItemResult.rows[0].id, sourceId1],
    );

    await persistDigestFromContentItems({
      db,
      userId,
      topicId,
      windowStart: newWindowStart,
      windowEnd: newWindowEnd,
      mode: "low",
      paidCallsAllowed: false,
    });

    // Verify no provider_calls were made
    const providerCallsResult = await db.query<{ id: string }>(
      `SELECT id FROM provider_calls WHERE user_id = $1`,
      [userId],
    );
    expect(providerCallsResult.rows).toHaveLength(0);
  });
});

/**
 * Unit tests for fair sampling helpers
 */
describe("fair sampling helpers", () => {
  // Import helpers for unit testing
  const { stratifiedSample } = require("../lib/fair_sampling");
  const { allocateTriageCalls } = require("../lib/triage_allocation");
  const { selectWithDiversity } = require("../lib/diversity_selection");

  describe("stratifiedSample", () => {
    it("returns all candidates when below maxPoolSize", () => {
      const candidates = [
        {
          candidateId: "1",
          sourceType: "rss",
          sourceId: "s1",
          candidateAtMs: 1000,
          heuristicScore: 0.8,
        },
        {
          candidateId: "2",
          sourceType: "rss",
          sourceId: "s1",
          candidateAtMs: 2000,
          heuristicScore: 0.6,
        },
      ];

      const result = stratifiedSample({
        candidates,
        windowStartMs: 0,
        windowEndMs: 3000,
        maxPoolSize: 10,
      });

      expect(result.sampledIds.size).toBe(2);
      expect(result.sampledIds.has("1")).toBe(true);
      expect(result.sampledIds.has("2")).toBe(true);
    });

    it("samples fairly across sources when pool is limited", () => {
      // Create 10 candidates from source A and 2 from source B
      const candidates = [
        ...Array.from({ length: 10 }, (_, i) => ({
          candidateId: `a${i}`,
          sourceType: "rss",
          sourceId: "sourceA",
          candidateAtMs: i * 100,
          heuristicScore: 0.5 + i * 0.01,
        })),
        {
          candidateId: "b1",
          sourceType: "reddit",
          sourceId: "sourceB",
          candidateAtMs: 500,
          heuristicScore: 0.9,
        },
        {
          candidateId: "b2",
          sourceType: "reddit",
          sourceId: "sourceB",
          candidateAtMs: 600,
          heuristicScore: 0.85,
        },
      ];

      const result = stratifiedSample({
        candidates,
        windowStartMs: 0,
        windowEndMs: 1000,
        maxPoolSize: 6,
      });

      // Both sources should be represented in the sample
      const sampleArray = Array.from(result.sampledIds) as string[];
      const hasSourceA = sampleArray.some((id: string) => id.startsWith("a"));
      const hasSourceB = sampleArray.some((id: string) => id.startsWith("b"));

      expect(hasSourceA).toBe(true);
      expect(hasSourceB).toBe(true);
      expect(result.sampledIds.size).toBeLessThanOrEqual(6);
    });
  });

  describe("allocateTriageCalls", () => {
    it("allocates exploration slots to each source type", () => {
      const candidates = [
        { candidateId: "1", sourceType: "rss", sourceId: "s1", heuristicScore: 0.8 },
        { candidateId: "2", sourceType: "rss", sourceId: "s1", heuristicScore: 0.7 },
        { candidateId: "3", sourceType: "reddit", sourceId: "s2", heuristicScore: 0.9 },
        { candidateId: "4", sourceType: "reddit", sourceId: "s2", heuristicScore: 0.6 },
      ];

      const result = allocateTriageCalls({
        candidates,
        maxTriageCalls: 4,
      });

      // Both types should get exploration slots
      const byType = result.stats.explorationByType;
      expect(byType.length).toBe(2);
      expect(byType.some((t: { type: string }) => t.type === "rss")).toBe(true);
      expect(byType.some((t: { type: string }) => t.type === "reddit")).toBe(true);
    });

    it("returns all candidates when maxTriageCalls >= candidateCount", () => {
      const candidates = [
        { candidateId: "1", sourceType: "rss", sourceId: "s1", heuristicScore: 0.8 },
        { candidateId: "2", sourceType: "reddit", sourceId: "s2", heuristicScore: 0.9 },
      ];

      const result = allocateTriageCalls({
        candidates,
        maxTriageCalls: 10,
      });

      expect(result.triageOrder.length).toBe(2);
    });
  });

  describe("selectWithDiversity", () => {
    it("applies diversity penalty to avoid source domination", () => {
      // Source A has higher scores but we should see some diversity
      const candidates = [
        { candidateId: "a1", score: 0.95, sourceType: "rss", sourceId: "sA", hasTriageData: true },
        { candidateId: "a2", score: 0.9, sourceType: "rss", sourceId: "sA", hasTriageData: true },
        { candidateId: "a3", score: 0.85, sourceType: "rss", sourceId: "sA", hasTriageData: true },
        {
          candidateId: "b1",
          score: 0.8,
          sourceType: "reddit",
          sourceId: "sB",
          hasTriageData: true,
        },
      ];

      const result = selectWithDiversity({
        candidates,
        maxItems: 3,
        requireTriageData: true,
      });

      // Source B should be included despite lower score due to diversity penalty
      expect(result.selectedIds).toContain("b1");
      expect(result.selectedIds.length).toBe(3);
    });

    it("only selects triaged candidates when requireTriageData=true", () => {
      const candidates = [
        { candidateId: "1", score: 0.95, sourceType: "rss", sourceId: "s1", hasTriageData: false },
        { candidateId: "2", score: 0.9, sourceType: "rss", sourceId: "s1", hasTriageData: true },
        {
          candidateId: "3",
          score: 0.85,
          sourceType: "reddit",
          sourceId: "s2",
          hasTriageData: true,
        },
      ];

      const result = selectWithDiversity({
        candidates,
        maxItems: 3,
        requireTriageData: true,
      });

      // Only triaged candidates should be selected
      expect(result.selectedIds).not.toContain("1");
      expect(result.selectedIds.length).toBe(2);
      expect(result.stats.limitedByTriageData).toBe(true);
    });
  });
});
