import { initRedisQuota } from "@aharadar/llm";
import { createRedisClient } from "@aharadar/queues";
import { createLogger, loadDotEnvIfPresent } from "@aharadar/shared";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import Fastify from "fastify";
import { apiKeyAuth } from "./auth/api_key.js";
import { sessionAuth } from "./auth/session.js";
import { closePipelineQueue } from "./lib/queue.js";
import { registerMetricsHooks } from "./metrics.js";
import { adminRoutes } from "./routes/admin.js";
import { adminLogsRoutes } from "./routes/admin_logs.js";
import { askRoutes } from "./routes/ask.js";
import { authRoutes } from "./routes/auth.js";
import { bookmarksRoutes } from "./routes/bookmarks.js";
import { catchupPacksRoutes } from "./routes/catchup-packs.js";
import { digestsRoutes } from "./routes/digests.js";
import { feedbackRoutes } from "./routes/feedback.js";
import { healthRoutes } from "./routes/health.js";
import { itemSummariesRoutes } from "./routes/item-summaries.js";
import { itemsRoutes } from "./routes/items.js";
import { preferencesRoutes } from "./routes/preferences.js";
import { scoringModesRoutes } from "./routes/scoring-modes.js";
import { storageRoutes } from "./routes/storage.js";
import { summariesRoutes } from "./routes/summaries.js";
import { topicsRoutes } from "./routes/topics.js";
import { userApiKeysRoutes } from "./routes/user-api-keys.js";
import { userUsageRoutes } from "./routes/user-usage.js";

// Load .env and .env.local files (must happen before reading env vars)
loadDotEnvIfPresent();

// Initialize Redis quota tracking for shared state between API and worker
const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
try {
  const redisClient = createRedisClient(REDIS_URL);
  initRedisQuota(redisClient);
} catch (err) {
  // Redis quota tracking will fall back to in-memory if this fails
  console.warn("Failed to initialize Redis quota tracking, falling back to in-memory:", err);
}

const log = createLogger({ component: "api" });

const PORT = parseInt(process.env.API_PORT ?? process.env.PORT ?? "3001", 10);

interface ErrorEnvelope {
  ok: false;
  error: {
    code: string;
    message: string;
  };
}

async function buildServer() {
  const fastify = Fastify({
    logger: true,
  });

  // Enable CORS for local development (web app on port 3000, API on port 3001)
  await fastify.register(cors, {
    origin: true, // Allow all origins in dev; restrict in production
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "X-API-Key", "Authorization"],
  });

  // Cookie parsing for session management
  await fastify.register(cookie, {
    parseOptions: {},
  });

  // Register Prometheus metrics hooks
  registerMetricsHooks(fastify);

  fastify.setErrorHandler(
    (error: Error & { statusCode?: number; code?: string }, _request, reply) => {
      const statusCode = error.statusCode ?? 500;
      const envelope: ErrorEnvelope = {
        ok: false,
        error: {
          code: error.code ?? "INTERNAL_ERROR",
          message: error.message,
        },
      };
      reply.code(statusCode).send(envelope);
    },
  );

  // Public routes (no auth required)
  await fastify.register(healthRoutes, { prefix: "/api" });
  await fastify.register(authRoutes, { prefix: "/api" });
  await fastify.register(storageRoutes, { prefix: "/api" });

  // Protected routes - allow either session cookie OR API key
  await fastify.register(
    async (api) => {
      api.addHook("onRequest", async (request, reply) => {
        const sessionToken = request.cookies?.session;
        const bypassAuth = request.cookies?.BYPASS_AUTH;

        // Call sessionAuth if session exists OR dev bypass is enabled
        if (sessionToken || (bypassAuth && process.env.NODE_ENV !== "production")) {
          await sessionAuth(request, reply);
          return;
        }
        // Fall back to API key (for admin/CLI usage)
        apiKeyAuth(request, reply, () => {});
      });
      await api.register(adminRoutes);
      await api.register(adminLogsRoutes);
      await api.register(askRoutes);
      await api.register(bookmarksRoutes);
      await api.register(catchupPacksRoutes);
      await api.register(itemSummariesRoutes);
      await api.register(digestsRoutes);
      await api.register(feedbackRoutes);
      await api.register(itemsRoutes);
      await api.register(preferencesRoutes);
      await api.register(scoringModesRoutes);
      await api.register(summariesRoutes);
      await api.register(topicsRoutes);
      await api.register(userApiKeysRoutes);
      await api.register(userUsageRoutes);
    },
    { prefix: "/api" },
  );

  return fastify;
}

async function main() {
  const server = await buildServer();

  const shutdown = async (signal: string): Promise<void> => {
    log.info({ signal }, "Received signal, shutting down");
    await server.close();
    await closePipelineQueue();
    log.info("Shutdown complete");
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  try {
    await server.listen({ port: PORT, host: "0.0.0.0" });
    log.info({ port: PORT }, "API server listening");
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

main();
