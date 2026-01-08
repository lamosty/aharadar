import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { createDb, type Db } from "@aharadar/db";
import { persistDigestFromContentItems } from "./digest";

/**
 * Integration test for persistDigestFromContentItems.
 *
 * Uses Testcontainers to spin up a Postgres instance with pgvector,
 * applies migrations, seeds minimal data, and verifies digest creation
 * without requiring LLM keys (paidCallsAllowed=false).
 *
 * Run with: pnpm test:integration
 */
describe("persistDigestFromContentItems integration", () => {
  let container: StartedPostgreSqlContainer | null = null;
  let db: Db | null = null;

  // Test data IDs (set during seeding)
  let userId: string;
  let topicId: string;
  let sourceId: string;
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
    ];

    for (const file of migrationFiles) {
      const sql = readFileSync(join(migrationsDir, file), "utf-8");
      await db.query(sql, []);
    }

    // Seed test data
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
      []
    );
    userId = userResult.rows[0].id;

    // Create topic
    const topicResult = await db.query<{ id: string }>(
      `INSERT INTO topics (user_id, name) VALUES ($1, 'test-topic') RETURNING id`,
      [userId]
    );
    topicId = topicResult.rows[0].id;

    // Create source (disabled to avoid network fetches)
    const sourceResult = await db.query<{ id: string }>(
      `INSERT INTO sources (user_id, topic_id, type, name, is_enabled)
       VALUES ($1, $2, 'rss', 'Test Source', false) RETURNING id`,
      [userId, topicId]
    );
    sourceId = sourceResult.rows[0].id;

    // Create content items within the window
    contentItemIds = [];
    const items = [
      {
        title: "First Test Article",
        bodyText: "This is the body of the first test article.",
        canonicalUrl: "https://example.com/article-1",
        externalId: "ext-1",
        publishedAt: "2026-01-05T10:00:00.000Z",
      },
      {
        title: "Second Test Article",
        bodyText: "This is the body of the second test article with more content.",
        canonicalUrl: "https://example.com/article-2",
        externalId: "ext-2",
        publishedAt: "2026-01-05T14:00:00.000Z",
      },
      {
        title: "Third Test Article",
        bodyText: "This is the body of the third test article.",
        canonicalUrl: "https://example.com/article-3",
        externalId: "ext-3",
        publishedAt: "2026-01-05T18:00:00.000Z",
      },
    ];

    for (const item of items) {
      const result = await db.query<{ id: string }>(
        `INSERT INTO content_items
           (user_id, source_id, source_type, external_id, canonical_url, title, body_text, published_at, fetched_at)
         VALUES ($1, $2, 'rss', $3, $4, $5, $6, $7::timestamptz, $7::timestamptz)
         RETURNING id`,
        [userId, sourceId, item.externalId, item.canonicalUrl, item.title, item.bodyText, item.publishedAt]
      );
      contentItemIds.push(result.rows[0].id);

      // Link content item to source
      await db.query(`INSERT INTO content_item_sources (content_item_id, source_id) VALUES ($1, $2)`, [
        result.rows[0].id,
        sourceId,
      ]);
    }
  }

  it("creates digest and digest_items with paidCallsAllowed=false", async () => {
    if (!db) throw new Error("DB not initialized");

    const result = await persistDigestFromContentItems({
      db,
      userId,
      topicId,
      windowStart,
      windowEnd,
      mode: "low",
      paidCallsAllowed: false,
    });

    // Assert result is non-null
    expect(result).not.toBeNull();
    expect(result!.digestId).toBeDefined();
    expect(result!.digestId.length).toBeGreaterThan(0);
    expect(result!.mode).toBe("low");
    expect(result!.items).toBeGreaterThanOrEqual(1);

    // Verify digest row exists in DB
    const digestResult = await db.query<{ id: string; mode: string }>(
      `SELECT id, mode FROM digests WHERE id = $1`,
      [result!.digestId]
    );
    expect(digestResult.rows).toHaveLength(1);
    expect(digestResult.rows[0].mode).toBe("low");

    // Verify digest_items exist
    const digestItemsResult = await db.query<{ digest_id: string; rank: number }>(
      `SELECT digest_id, rank FROM digest_items WHERE digest_id = $1 ORDER BY rank`,
      [result!.digestId]
    );
    expect(digestItemsResult.rows.length).toBeGreaterThanOrEqual(1);
    expect(digestItemsResult.rows[0].rank).toBe(1);
  });

  it("skips LLM triage when paidCallsAllowed=false", async () => {
    if (!db) throw new Error("DB not initialized");

    // Create a new window to avoid conflicts
    const newWindowStart = "2026-01-06T00:00:00.000Z";
    const newWindowEnd = "2026-01-07T00:00:00.000Z";

    // Add a content item for the new window
    const newItemResult = await db.query<{ id: string }>(
      `INSERT INTO content_items
         (user_id, source_id, source_type, external_id, canonical_url, title, body_text, published_at, fetched_at)
       VALUES ($1, $2, 'rss', 'ext-4', 'https://example.com/article-4', 'Fourth Article', 'Body text', '2026-01-06T12:00:00.000Z'::timestamptz, '2026-01-06T12:00:00.000Z'::timestamptz)
       RETURNING id`,
      [userId, sourceId]
    );
    await db.query(`INSERT INTO content_item_sources (content_item_id, source_id) VALUES ($1, $2)`, [
      newItemResult.rows[0].id,
      sourceId,
    ]);

    const result = await persistDigestFromContentItems({
      db,
      userId,
      topicId,
      windowStart: newWindowStart,
      windowEnd: newWindowEnd,
      mode: "low",
      paidCallsAllowed: false,
    });

    expect(result).not.toBeNull();

    // Verify no provider_calls were made (LLM was skipped)
    const providerCallsResult = await db.query<{ id: string }>(
      `SELECT id FROM provider_calls WHERE user_id = $1`,
      [userId]
    );
    expect(providerCallsResult.rows).toHaveLength(0);
  });

  it("uses heuristic scoring when paidCallsAllowed=false", async () => {
    if (!db) throw new Error("DB not initialized");

    // Check the digest items have scores (from heuristic scoring)
    const digestItemsResult = await db.query<{ score: number; triage_json: unknown }>(
      `SELECT score, triage_json FROM digest_items
       WHERE digest_id IN (SELECT id FROM digests WHERE user_id = $1)
       ORDER BY score DESC
       LIMIT 5`,
      [userId]
    );

    expect(digestItemsResult.rows.length).toBeGreaterThanOrEqual(1);
    // Scores should be positive numbers from heuristic scoring
    for (const row of digestItemsResult.rows) {
      expect(typeof row.score).toBe("number");
      expect(row.score).toBeGreaterThanOrEqual(0);
    }
  });
});
