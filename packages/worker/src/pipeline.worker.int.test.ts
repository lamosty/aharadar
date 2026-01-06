import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { GenericContainer, type StartedTestContainer } from "testcontainers";
import { Queue, QueueEvents } from "bullmq";
import { createDb, type Db } from "@aharadar/db";
import {
  PIPELINE_QUEUE_NAME,
  RUN_WINDOW_JOB_NAME,
  parseRedisConnection,
  type RunWindowJobData,
} from "@aharadar/queues";
import { createPipelineWorker } from "./workers/pipeline.worker";

/**
 * Integration test for BullMQ pipeline worker.
 *
 * Uses Testcontainers to spin up Postgres (pgvector) + Redis,
 * applies migrations, seeds minimal data, enqueues a job,
 * and verifies the worker processes it end-to-end.
 *
 * Run with: pnpm test:integration
 */
describe("BullMQ pipeline worker integration", () => {
  let pgContainer: StartedPostgreSqlContainer | null = null;
  let redisContainer: StartedTestContainer | null = null;
  let db: Db | null = null;
  let workerDb: Db | null = null;

  // Test data IDs (set during seeding)
  let userId: string;
  let topicId: string;
  let sourceId: string;

  // Connection URLs
  let databaseUrl: string;
  let redisUrl: string;

  const windowStart = "2026-01-05T00:00:00.000Z";
  const windowEnd = "2026-01-06T00:00:00.000Z";

  beforeAll(async () => {
    // Start Postgres container with pgvector
    pgContainer = await new PostgreSqlContainer("pgvector/pgvector:pg16")
      .withDatabase("aharadar_test")
      .withUsername("test")
      .withPassword("test")
      .start();

    databaseUrl = pgContainer.getConnectionUri();

    // Start Redis container
    redisContainer = await new GenericContainer("redis:7-alpine").withExposedPorts(6379).start();

    const redisHost = redisContainer.getHost();
    const redisPort = redisContainer.getMappedPort(6379);
    redisUrl = `redis://${redisHost}:${redisPort}`;

    // Create DB connection for test setup
    db = createDb(databaseUrl);

    // Apply migrations in order
    const migrationsDir = join(__dirname, "../../db/migrations");
    const migrationFiles = ["0001_init.sql", "0002_topics.sql", "0003_topic_preference_profiles.sql"];

    for (const file of migrationFiles) {
      const sql = readFileSync(join(migrationsDir, file), "utf-8");
      await db.query(sql, []);
    }

    // Seed test data
    await seedTestData();

    // Set env vars BEFORE creating worker (worker calls loadRuntimeEnv)
    process.env.DATABASE_URL = databaseUrl;
    process.env.REDIS_URL = redisUrl;
    process.env.MONTHLY_CREDITS = "100000";
    process.env.DEFAULT_TIER = "normal";
  }, 120000); // 2 minute timeout for container startup

  afterAll(async () => {
    if (workerDb) {
      await workerDb.close();
    }
    if (db) {
      await db.close();
    }
    if (redisContainer) {
      await redisContainer.stop();
    }
    if (pgContainer) {
      await pgContainer.stop();
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
      `INSERT INTO topics (user_id, name) VALUES ($1, 'default') RETURNING id`,
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
    const items = [
      {
        title: "First Test Article",
        bodyText: "This is the body of the first test article about technology.",
        canonicalUrl: "https://example.com/article-1",
        externalId: "ext-1",
        publishedAt: "2026-01-05T10:00:00.000Z",
      },
      {
        title: "Second Test Article",
        bodyText: "This is the body of the second test article about science.",
        canonicalUrl: "https://example.com/article-2",
        externalId: "ext-2",
        publishedAt: "2026-01-05T14:00:00.000Z",
      },
      {
        title: "Third Test Article",
        bodyText: "This is the body of the third test article about business.",
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

      // Link content item to source (for topic membership)
      await db.query(`INSERT INTO content_item_sources (content_item_id, source_id) VALUES ($1, $2)`, [
        result.rows[0].id,
        sourceId,
      ]);
    }
  }

  it("processes run_window job and creates digest", async () => {
    if (!db) throw new Error("DB not initialized");

    // Create worker (uses process.env set in beforeAll)
    const { worker, db: wDb } = createPipelineWorker(redisUrl);
    workerDb = wDb;

    // Create queue for enqueuing jobs
    const queue = new Queue<RunWindowJobData>(PIPELINE_QUEUE_NAME, {
      connection: parseRedisConnection(redisUrl),
    });

    // Create queue events for waiting on job completion
    const queueEvents = new QueueEvents(PIPELINE_QUEUE_NAME, {
      connection: parseRedisConnection(redisUrl),
    });

    try {
      // Deterministic job ID (replace colons since BullMQ disallows them)
      const sanitize = (s: string) => s.replace(/:/g, "-");
      const jobId = `${RUN_WINDOW_JOB_NAME}_${userId}_${topicId}_${sanitize(windowStart)}_${sanitize(windowEnd)}_normal`;

      // Enqueue job
      const job = await queue.add(
        RUN_WINDOW_JOB_NAME,
        {
          userId,
          topicId,
          windowStart,
          windowEnd,
          mode: "normal",
        },
        {
          jobId,
          removeOnComplete: 100,
          removeOnFail: 50,
        }
      );

      // Wait for job to complete (30 second timeout)
      const result = await job.waitUntilFinished(queueEvents, 30000);

      // Assert job succeeded
      expect(result).toBeDefined();
      expect(result.topicId).toBe(topicId);
      expect(result.windowStart).toBe(windowStart);
      expect(result.windowEnd).toBe(windowEnd);

      // Verify digest row exists in DB
      const digestResult = await db.query<{ id: string; mode: string }>(
        `SELECT id, mode FROM digests
         WHERE user_id = $1 AND topic_id = $2::uuid
           AND window_start = $3::timestamptz AND window_end = $4::timestamptz`,
        [userId, topicId, windowStart, windowEnd]
      );
      expect(digestResult.rows.length).toBeGreaterThanOrEqual(1);

      const digestId = digestResult.rows[0].id;

      // Verify digest_items exist
      const digestItemsResult = await db.query<{ digest_id: string; rank: number }>(
        `SELECT digest_id, rank FROM digest_items WHERE digest_id = $1 ORDER BY rank`,
        [digestId]
      );
      expect(digestItemsResult.rows.length).toBeGreaterThanOrEqual(1);
      expect(digestItemsResult.rows[0].rank).toBe(1);
    } finally {
      // Clean shutdown
      await queueEvents.close();
      await queue.close();
      await worker.close();
    }
  }, 60000); // 1 minute timeout for job processing
});
