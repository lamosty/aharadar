import type { FastifyInstance } from "fastify";
import { getDb, getSingletonContext } from "../lib/db.js";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_REGEX.test(value);
}

export async function notificationsRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /notifications - List notifications for the current user
  fastify.get<{
    Querystring: { unreadOnly?: string; limit?: string; offset?: string };
  }>("/notifications", async (request, reply) => {
    const ctx = await getSingletonContext();
    if (!ctx) {
      return reply.code(503).send({
        ok: false,
        error: {
          code: "NOT_INITIALIZED",
          message: "Database not initialized: no user or topic found",
        },
      });
    }

    const unreadOnly = request.query.unreadOnly === "true";
    const limit = request.query.limit ? parseInt(request.query.limit, 10) : 20;
    const offset = request.query.offset ? parseInt(request.query.offset, 10) : 0;

    if (Number.isNaN(limit) || limit < 1 || limit > 100) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: "INVALID_PARAM",
          message: "limit must be a number between 1 and 100",
        },
      });
    }

    if (Number.isNaN(offset) || offset < 0) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: "INVALID_PARAM",
          message: "offset must be a non-negative number",
        },
      });
    }

    const db = getDb();
    const [{ notifications, total }, unreadCount] = await Promise.all([
      db.notifications.listByUser({
        userId: ctx.userId,
        unreadOnly,
        limit,
        offset,
      }),
      db.notifications.getUnreadCount(ctx.userId),
    ]);

    return {
      ok: true,
      notifications: notifications.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        body: n.body,
        severity: n.severity,
        data: n.data_json,
        isRead: n.is_read,
        readAt: n.read_at,
        createdAt: n.created_at,
      })),
      unreadCount,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
    };
  });

  // POST /notifications/:id/dismiss - Mark a single notification as read
  fastify.post<{ Params: { id: string } }>("/notifications/:id/dismiss", async (request, reply) => {
    const ctx = await getSingletonContext();
    if (!ctx) {
      return reply.code(503).send({
        ok: false,
        error: {
          code: "NOT_INITIALIZED",
          message: "Database not initialized: no user or topic found",
        },
      });
    }

    const { id } = request.params;
    if (!isValidUuid(id)) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: "INVALID_PARAM",
          message: "id must be a valid UUID",
        },
      });
    }

    const db = getDb();
    const notification = await db.notifications.markAsRead(id);

    if (!notification) {
      return reply.code(404).send({
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: "Notification not found",
        },
      });
    }

    // Verify notification belongs to the current user
    if (notification.user_id !== ctx.userId) {
      return reply.code(403).send({
        ok: false,
        error: {
          code: "FORBIDDEN",
          message: "Not authorized to dismiss this notification",
        },
      });
    }

    return {
      ok: true,
      notification: {
        id: notification.id,
        type: notification.type,
        title: notification.title,
        body: notification.body,
        severity: notification.severity,
        data: notification.data_json,
        isRead: notification.is_read,
        readAt: notification.read_at,
        createdAt: notification.created_at,
      },
    };
  });

  // POST /notifications/dismiss-all - Mark all notifications as read
  fastify.post("/notifications/dismiss-all", async (request, reply) => {
    const ctx = await getSingletonContext();
    if (!ctx) {
      return reply.code(503).send({
        ok: false,
        error: {
          code: "NOT_INITIALIZED",
          message: "Database not initialized: no user or topic found",
        },
      });
    }

    const db = getDb();
    const count = await db.notifications.markAllAsRead(ctx.userId);

    return {
      ok: true,
      dismissed: count,
    };
  });
}
