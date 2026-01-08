import type { FastifyInstance } from "fastify";
import { getMetrics, getMetricsContentType } from "../metrics.js";

export async function healthRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get("/health", async () => {
    return { ok: true };
  });

  fastify.get("/metrics", async (_request, reply) => {
    const metrics = await getMetrics();
    reply.type(getMetricsContentType()).send(metrics);
  });
}
