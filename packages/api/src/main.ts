import Fastify from "fastify";
import { apiKeyAuth } from "./auth/api_key.js";
import { closePipelineQueue } from "./lib/queue.js";
import { adminRoutes } from "./routes/admin.js";
import { digestsRoutes } from "./routes/digests.js";
import { feedbackRoutes } from "./routes/feedback.js";
import { healthRoutes } from "./routes/health.js";
import { itemsRoutes } from "./routes/items.js";

const PORT = parseInt(process.env.PORT ?? "3000", 10);

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

  fastify.setErrorHandler((error: Error & { statusCode?: number; code?: string }, _request, reply) => {
    const statusCode = error.statusCode ?? 500;
    const envelope: ErrorEnvelope = {
      ok: false,
      error: {
        code: error.code ?? "INTERNAL_ERROR",
        message: error.message,
      },
    };
    reply.code(statusCode).send(envelope);
  });

  await fastify.register(healthRoutes, { prefix: "/api" });

  await fastify.register(
    async (api) => {
      api.addHook("onRequest", apiKeyAuth);
      await api.register(adminRoutes);
      await api.register(digestsRoutes);
      await api.register(feedbackRoutes);
      await api.register(itemsRoutes);
    },
    { prefix: "/api" }
  );

  return fastify;
}

async function main() {
  const server = await buildServer();

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`[api] Received ${signal}, shutting down...`);
    await server.close();
    await closePipelineQueue();
    console.log("[api] Shutdown complete");
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  try {
    await server.listen({ port: PORT, host: "0.0.0.0" });
    console.log(`API server listening on port ${PORT}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

main();
