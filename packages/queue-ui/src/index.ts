import { loadDotEnvIfPresent } from "@aharadar/shared";
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";
import { Queue } from "bullmq";
import express from "express";

// Load .env from project root
loadDotEnvIfPresent();

const PIPELINE_QUEUE_NAME = "pipeline";

/**
 * Parse Redis URL into BullMQ connection options.
 */
function parseRedisConnection(redisUrl: string) {
  const url = new URL(redisUrl);
  const isTls = url.protocol === "rediss:";
  const dbMatch = url.pathname.match(/^\/(\d+)$/);
  const db = dbMatch ? Number.parseInt(dbMatch[1], 10) : undefined;

  return {
    host: url.hostname,
    port: Number.parseInt(url.port || "6379", 10),
    password: url.password || undefined,
    db,
    tls: isTls ? {} : undefined,
  };
}

async function main() {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    console.error("REDIS_URL environment variable is required");
    process.exit(1);
  }

  const port = Number.parseInt(process.env.QUEUE_UI_PORT || "3101", 10);

  const connection = parseRedisConnection(redisUrl);

  // Create queue instance for bull-board (read-only)
  const pipelineQueue = new Queue(PIPELINE_QUEUE_NAME, { connection });

  // Set up Express adapter for bull-board
  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath("/");

  // Create the board with our queue
  createBullBoard({
    queues: [new BullMQAdapter(pipelineQueue)],
    serverAdapter,
  });

  const app = express();

  // Mount bull-board at root
  app.use("/", serverAdapter.getRouter());

  app.listen(port, () => {
    console.log(`BullMQ Dashboard running at http://localhost:${port}`);
  });
}

main().catch((err) => {
  console.error("Failed to start queue-ui:", err);
  process.exit(1);
});
