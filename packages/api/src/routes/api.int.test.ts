import { createDb, type Db } from "@aharadar/db";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import Fastify, { type FastifyInstance } from "fastify";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Integration tests for API routes.
 *
 * Uses Testcontainers to spin up a Postgres instance with pgvector,
 * applies migrations, seeds minimal data, and verifies API behavior.
 *
 * Note: These tests set DATABASE_URL before importing routes to inject
 * the test database connection.
 *
 * Run with: pnpm test:integration
 */
describe("API Routes Integration Tests", () => {
  let container: StartedPostgreSqlContainer | null = null;
  let db: Db | null = null;
  let app: FastifyInstance | null = null;
  let userId: string;
  let topicId: string;
  let contentItemId: string;
  let contentItemId2: string;
  let contentItemId3: string;
  let sourceId: string;

  beforeAll(async () => {
    // Start Postgres container with pgvector
    container = await new PostgreSqlContainer("pgvector/pgvector:pg16")
      .withDatabase("aharadar_test")
      .withUsername("test")
      .withPassword("test")
      .start();

    const connectionString = container.getConnectionUri();

    // Set required env vars before importing route modules
    process.env.DATABASE_URL = connectionString;
    process.env.REDIS_URL = "redis://localhost:6379"; // Not actually used in these tests
    process.env.MONTHLY_CREDITS = "60000";

    db = createDb(connectionString);

    // Apply all migrations in order
    const migrationsDir = join(__dirname, "../../../db/migrations");
    const migrationFiles = readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    for (const file of migrationFiles) {
      const sql = readFileSync(join(migrationsDir, file), "utf-8");
      await db.query(sql, []);
    }

    // Seed test data
    await seedTestData();

    // Dynamically import routes after DATABASE_URL is set
    const { topicsRoutes } = await import("./topics.js");
    const { feedbackRoutes } = await import("./feedback.js");
    const { itemsRoutes } = await import("./items.js");
    const { exportsRoutes } = await import("./exports.js");

    // Build Fastify app with routes
    app = Fastify({ logger: false });
    await app.register(topicsRoutes, { prefix: "/api" });
    await app.register(feedbackRoutes, { prefix: "/api" });
    await app.register(itemsRoutes, { prefix: "/api" });
    await app.register(exportsRoutes, { prefix: "/api" });
    await app.ready();
  }, 120000); // 2 minute timeout for container startup

  afterAll(async () => {
    if (app) {
      await app.close();
    }
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

    // Create default topic
    const topicResult = await db.query<{ id: string }>(
      `INSERT INTO topics (user_id, name, description)
       VALUES ($1, 'default', 'Default test topic') RETURNING id`,
      [userId],
    );
    topicId = topicResult.rows[0].id;

    // Create source
    const sourceResult = await db.query<{ id: string }>(
      `INSERT INTO sources (user_id, topic_id, type, name, config_json)
       VALUES ($1, $2, 'hn', 'Test Source', '{}') RETURNING id`,
      [userId, topicId],
    );
    sourceId = sourceResult.rows[0].id;

    // Create content item
    const contentResult = await db.query<{ id: string }>(
      `INSERT INTO content_items (user_id, source_id, source_type, title, body_text, canonical_url, author, published_at, metadata_json)
       VALUES ($1, $2, 'hn', 'Test HN Post', 'Test content body', 'https://example.com/test', 'testuser', NOW(), '{}')
       RETURNING id`,
      [userId, sourceId],
    );
    contentItemId = contentResult.rows[0].id;

    // Create additional content items for export tests
    const contentResult2 = await db.query<{ id: string }>(
      `INSERT INTO content_items (user_id, source_id, source_type, title, body_text, canonical_url, author, published_at, metadata_json)
       VALUES ($1, $2, 'reddit', 'Second Summary Item', 'Second test content body with enough detail for excerpts', 'https://example.com/second', 'author2', NOW() - INTERVAL '2 hours', '{}')
       RETURNING id`,
      [userId, sourceId],
    );
    contentItemId2 = contentResult2.rows[0].id;

    const contentResult3 = await db.query<{ id: string }>(
      `INSERT INTO content_items (user_id, source_id, source_type, title, body_text, canonical_url, author, published_at, metadata_json)
       VALUES ($1, $2, 'rss', 'Third Unsummarized Item', 'Third item intentionally has no manual summary', 'https://example.com/third', 'author3', NOW() - INTERVAL '4 hours', '{}')
       RETURNING id`,
      [userId, sourceId],
    );
    contentItemId3 = contentResult3.rows[0].id;

    // Link content item to source (junction table for multi-source support)
    await db.query(
      `INSERT INTO content_item_sources (content_item_id, source_id) VALUES ($1, $2)`,
      [contentItemId, sourceId],
    );
    await db.query(
      `INSERT INTO content_item_sources (content_item_id, source_id) VALUES ($1, $2)`,
      [contentItemId2, sourceId],
    );
    await db.query(
      `INSERT INTO content_item_sources (content_item_id, source_id) VALUES ($1, $2)`,
      [contentItemId3, sourceId],
    );

    // Create embedding for the content item (needed for preference updates)
    const embeddingVector = Array(1536).fill(0.01); // Fake embedding
    await db.query(
      `INSERT INTO embeddings (content_item_id, model, dims, vector) VALUES ($1, 'text-embedding-3-small', 1536, $2::vector)`,
      [contentItemId, `[${embeddingVector.join(",")}]`],
    );

    // Create user preferences
    await db.query(
      `INSERT INTO user_preferences (user_id, decay_hours) VALUES ($1, 24) ON CONFLICT DO NOTHING`,
      [userId],
    );

    // Create a digest with the content item
    const digestResult = await db.query<{ id: string }>(
      `INSERT INTO digests (user_id, topic_id, window_start, window_end, mode)
       VALUES ($1, $2, NOW() - INTERVAL '1 day', NOW(), 'normal') RETURNING id`,
      [userId, topicId],
    );
    const digestId = digestResult.rows[0].id;

    // Add content item to digest
    await db.query(
      `INSERT INTO digest_items (digest_id, content_item_id, aha_score, rank, triage_json)
       VALUES ($1, $2, 0.85, 1, '{"ai_score": 85, "reason": "Test item"}')`,
      [digestId, contentItemId],
    );
    await db.query(
      `INSERT INTO digest_items (digest_id, content_item_id, aha_score, rank, triage_json)
       VALUES ($1, $2, 0.77, 2, '{"ai_score": 77, "reason": "Second test item"}')`,
      [digestId, contentItemId2],
    );
    await db.query(
      `INSERT INTO digest_items (digest_id, content_item_id, aha_score, rank, triage_json)
       VALUES ($1, $2, 0.55, 3, '{"ai_score": 55, "reason": "Unsummarized item"}')`,
      [digestId, contentItemId3],
    );

    // Seed manual summaries for item 1 and 2 (item 3 intentionally missing summary)
    await db.query(
      `INSERT INTO content_item_summaries (user_id, content_item_id, summary_json, source)
       VALUES
       ($1, $2, '{"schema_version":"manual_summary_v2","prompt_id":"manual_summary_v2","provider":"test","model":"test-model","one_liner":"Summary for item one","bullets":["Point A","Point B"],"discussion_highlights":["Debate A"]}'::jsonb, 'manual_paste'),
       ($1, $3, '{"schema_version":"manual_summary_v2","prompt_id":"manual_summary_v2","provider":"test","model":"test-model","one_liner":"Summary for item two","bullets":["Point C"],"discussion_highlights":["Debate B"]}'::jsonb, 'manual_paste')`,
      [userId, contentItemId, contentItemId2],
    );

    // Seed one bookmark-only item and one liked+bookmarked item for selector coverage
    await db.query(`INSERT INTO bookmarks (user_id, content_item_id) VALUES ($1, $2), ($1, $3)`, [
      userId,
      contentItemId,
      contentItemId3,
    ]);
    await db.query(
      `INSERT INTO feedback_events (user_id, digest_id, content_item_id, action)
       VALUES ($1, $2, $3, 'like')`,
      [userId, digestId, contentItemId2],
    );
  }

  describe("Topics CRUD", () => {
    it("GET /api/topics - should list topics", async () => {
      const response = await app!.inject({
        method: "GET",
        url: "/api/topics",
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.ok).toBe(true);
      expect(body.topics).toBeInstanceOf(Array);
      expect(body.topics.length).toBeGreaterThanOrEqual(1);
      expect(body.topics[0].name).toBe("default");
      expect(body.profileOptions).toBeInstanceOf(Array);
    });

    it("POST /api/topics - should create a new topic", async () => {
      const response = await app!.inject({
        method: "POST",
        url: "/api/topics",
        payload: {
          name: "New Topic",
          description: "A test topic",
          viewingProfile: "daily",
        },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.ok).toBe(true);
      expect(body.topic.name).toBe("New Topic");
      expect(body.topic.description).toBe("A test topic");
      expect(body.topic.viewingProfile).toBe("daily");
    });

    it("POST /api/topics - should reject duplicate names", async () => {
      // First creation
      await app!.inject({
        method: "POST",
        url: "/api/topics",
        payload: { name: "Duplicate Test" },
      });

      // Second creation with same name
      const response = await app!.inject({
        method: "POST",
        url: "/api/topics",
        payload: { name: "Duplicate Test" },
      });

      expect(response.statusCode).toBe(409);
      const body = response.json();
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("DUPLICATE");
    });

    it("GET /api/topics/:id - should get a specific topic", async () => {
      const response = await app!.inject({
        method: "GET",
        url: `/api/topics/${topicId}`,
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.ok).toBe(true);
      expect(body.topic.id).toBe(topicId);
      expect(body.topic.name).toBe("default");
    });

    it("PATCH /api/topics/:id - should update topic name", async () => {
      // Create a topic to update
      const createResponse = await app!.inject({
        method: "POST",
        url: "/api/topics",
        payload: { name: "To Be Updated" },
      });
      const newTopicId = createResponse.json().topic.id;

      // Update it
      const response = await app!.inject({
        method: "PATCH",
        url: `/api/topics/${newTopicId}`,
        payload: {
          name: "Updated Name",
          description: "Updated description",
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.ok).toBe(true);
      expect(body.topic.name).toBe("Updated Name");
      expect(body.topic.description).toBe("Updated description");
    });

    it("DELETE /api/topics/:id - should delete a topic", async () => {
      // Create a topic to delete
      const createResponse = await app!.inject({
        method: "POST",
        url: "/api/topics",
        payload: { name: "To Be Deleted" },
      });
      const newTopicId = createResponse.json().topic.id;

      // Delete it
      const response = await app!.inject({
        method: "DELETE",
        url: `/api/topics/${newTopicId}`,
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.ok).toBe(true);

      // Verify it's gone
      const getResponse = await app!.inject({
        method: "GET",
        url: `/api/topics/${newTopicId}`,
      });
      expect(getResponse.statusCode).toBe(404);
    });

    it("DELETE /api/topics/:id - should not delete default topic", async () => {
      const response = await app!.inject({
        method: "DELETE",
        url: `/api/topics/${topicId}`,
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.error.code).toBe("INVALID_OPERATION");
    });
  });

  describe("Feedback", () => {
    it("POST /api/feedback - should record like feedback", async () => {
      const response = await app!.inject({
        method: "POST",
        url: "/api/feedback",
        payload: {
          contentItemId,
          action: "like",
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.ok).toBe(true);

      // Verify feedback was stored
      const feedbackResult = await db!.query(
        `SELECT action FROM feedback_events WHERE content_item_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [contentItemId],
      );
      expect(feedbackResult.rows[0].action).toBe("like");
    });

    it("POST /api/feedback - should record dislike feedback", async () => {
      const response = await app!.inject({
        method: "POST",
        url: "/api/feedback",
        payload: {
          contentItemId,
          action: "dislike",
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().ok).toBe(true);
    });

    it("POST /api/feedback - should record save feedback", async () => {
      const response = await app!.inject({
        method: "POST",
        url: "/api/feedback",
        payload: {
          contentItemId,
          action: "save",
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().ok).toBe(true);
    });

    it("POST /api/feedback - should reject invalid action", async () => {
      const response = await app!.inject({
        method: "POST",
        url: "/api/feedback",
        payload: {
          contentItemId,
          action: "invalid",
        },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("INVALID_PARAM");
    });

    it("POST /api/feedback - should reject invalid UUID", async () => {
      const response = await app!.inject({
        method: "POST",
        url: "/api/feedback",
        payload: {
          contentItemId: "not-a-uuid",
          action: "like",
        },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.error.code).toBe("INVALID_PARAM");
    });
  });

  describe("Items", () => {
    it("GET /api/items - should list items", async () => {
      const response = await app!.inject({
        method: "GET",
        url: `/api/items?topicId=${topicId}`,
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.ok).toBe(true);
      expect(body.items).toBeInstanceOf(Array);
      expect(body.items.length).toBeGreaterThanOrEqual(1);
      expect(body.pagination).toBeDefined();
      expect(body.pagination.total).toBeGreaterThanOrEqual(1);
    });

    it("GET /api/items - should respect limit parameter", async () => {
      const response = await app!.inject({
        method: "GET",
        url: `/api/items?topicId=${topicId}&limit=1`,
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.items.length).toBeLessThanOrEqual(1);
      expect(body.pagination.limit).toBe(1);
    });

    it("GET /api/items - should include triage data", async () => {
      const response = await app!.inject({
        method: "GET",
        url: `/api/items?topicId=${topicId}`,
      });

      const body = response.json();
      const itemWithTriage = body.items.find((i: { triageJson: unknown }) => i.triageJson !== null);
      expect(itemWithTriage).toBeDefined();
      expect(itemWithTriage.triageJson.ai_score).toBe(85);
    });

    it("GET /api/items - should return 404 for non-existent topic", async () => {
      const response = await app!.inject({
        method: "GET",
        url: "/api/items?topicId=00000000-0000-0000-0000-000000000000",
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe("Feed Dossier Exports", () => {
    it("POST /api/exports/feed-dossier - exports summarized items mode", async () => {
      const response = await app!.inject({
        method: "POST",
        url: "/api/exports/feed-dossier",
        payload: {
          topicId,
          mode: "ai_summaries",
          sort: "best",
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.ok).toBe(true);
      expect(body.export.mimeType).toBe("text/markdown; charset=utf-8");
      expect(body.export.content).toContain("# AhaRadar Research Dossier");
      expect(body.export.content).toContain("Summary for item one");
      expect(body.export.content).toContain("Summary for item two");
      expect(body.export.stats.exportedCount).toBeGreaterThanOrEqual(2);
      expect(body.export.stats.skippedNoSummaryCount).toBe(0);
    });

    it("POST /api/exports/feed-dossier - supports top_n and skips unsummarized", async () => {
      const response = await app!.inject({
        method: "POST",
        url: "/api/exports/feed-dossier",
        payload: {
          topicId,
          mode: "top_n",
          topN: 3,
          sort: "best",
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.ok).toBe(true);
      expect(body.export.stats.selectedCount).toBe(3);
      expect(body.export.stats.skippedNoSummaryCount).toBe(1);
      expect(body.export.content).toContain("## Continue Research Prompt");
    });

    it("POST /api/exports/feed-dossier - liked_or_bookmarked selector returns union", async () => {
      const response = await app!.inject({
        method: "POST",
        url: "/api/exports/feed-dossier",
        payload: {
          topicId,
          mode: "liked_or_bookmarked",
          sort: "best",
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.ok).toBe(true);
      // item 1 bookmarked + item 2 liked + item 3 bookmarked (no summary, skipped)
      expect(body.export.stats.selectedCount).toBeGreaterThanOrEqual(3);
      expect(body.export.stats.skippedNoSummaryCount).toBeGreaterThanOrEqual(1);
      expect(body.export.content).toContain("Summary for item one");
      expect(body.export.content).toContain("Summary for item two");
    });
  });
});
