import type { FastifyInstance } from "fastify";
import { getDb, getSingletonContext } from "../lib/db.js";

export async function userUsageRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /user/usage
   * Get usage summary for current month
   */
  fastify.get("/user/usage", async (request, reply) => {
    const ctx = await getSingletonContext();
    if (!ctx) {
      return reply.code(503).send({
        ok: false,
        error: { code: "NOT_INITIALIZED", message: "Database not initialized" },
      });
    }

    const db = getDb();
    const usage = await db.providerCalls.getMonthlyUsage(ctx.userId);

    return {
      ok: true,
      period: "current_month",
      ...usage,
    };
  });

  /**
   * GET /user/usage/period
   * Get usage for a specific date range
   */
  fastify.get<{
    Querystring: { startDate?: string; endDate?: string };
  }>("/user/usage/period", async (request, reply) => {
    const ctx = await getSingletonContext();
    if (!ctx) {
      return reply.code(503).send({
        ok: false,
        error: { code: "NOT_INITIALIZED", message: "Database not initialized" },
      });
    }

    const now = new Date();
    const startDate = request.query.startDate
      ? new Date(request.query.startDate)
      : new Date(now.getFullYear(), now.getMonth(), 1);

    const endDate = request.query.endDate
      ? new Date(request.query.endDate)
      : new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const db = getDb();
    const usage = await db.providerCalls.getUsageByPeriod(ctx.userId, startDate, endDate);

    return {
      ok: true,
      period: { startDate: startDate.toISOString(), endDate: endDate.toISOString() },
      ...usage,
    };
  });

  /**
   * GET /user/usage/daily
   * Get daily usage for charts (last 30 days by default)
   */
  fastify.get<{
    Querystring: { days?: string };
  }>("/user/usage/daily", async (request, reply) => {
    const ctx = await getSingletonContext();
    if (!ctx) {
      return reply.code(503).send({
        ok: false,
        error: { code: "NOT_INITIALIZED", message: "Database not initialized" },
      });
    }

    const days = parseInt(request.query.days ?? "30", 10);
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const db = getDb();
    const dailyUsage = await db.providerCalls.getDailyUsage(ctx.userId, startDate, endDate);

    return {
      ok: true,
      days,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      daily: dailyUsage,
    };
  });
}
