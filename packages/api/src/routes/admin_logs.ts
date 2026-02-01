import type { FastifyInstance } from "fastify";
import { getUserId } from "../auth/session.js";
import { getDb, getSingletonContext } from "../lib/db.js";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_REGEX.test(value);
}

export async function adminLogsRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /admin/logs/provider-calls - List recent provider calls
  fastify.get("/admin/logs/provider-calls", async (request, reply) => {
    const db = getDb();

    // Get current user and verify admin role
    let userId: string;
    try {
      userId = getUserId(request);
      const user = await db.users.getById(userId);
      if (!user || user.role !== "admin") {
        return reply.code(403).send({
          ok: false,
          error: {
            code: "FORBIDDEN",
            message: "Admin access required",
          },
        });
      }
    } catch {
      return reply.code(401).send({
        ok: false,
        error: {
          code: "NOT_AUTHENTICATED",
          message: "Authentication required",
        },
      });
    }

    // Get singleton context for userId
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

    const query = request.query as Record<string, string | undefined>;

    // Parse query params
    const limit = query.limit ? parseInt(query.limit, 10) : 100;
    const offset = query.offset ? parseInt(query.offset, 10) : 0;
    const purpose = query.purpose;
    const status = query.status;
    const sourceId = query.sourceId;
    const hoursAgo = query.hoursAgo ? parseInt(query.hoursAgo, 10) : 24;

    // Validate numeric params
    if (Number.isNaN(limit) || limit < 1 || limit > 1000) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: "INVALID_PARAM",
          message: "limit must be a number between 1 and 1000",
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

    if (Number.isNaN(hoursAgo) || hoursAgo < 1 || hoursAgo > 720) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: "INVALID_PARAM",
          message: "hoursAgo must be a number between 1 and 720",
        },
      });
    }

    // Validate sourceId if provided
    if (sourceId !== undefined && !isValidUuid(sourceId)) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: "INVALID_PARAM",
          message: "sourceId must be a valid UUID",
        },
      });
    }

    const calls = await db.providerCalls.listRecent({
      userId: ctx.userId,
      limit,
      offset,
      purpose,
      status,
      sourceId,
      hoursAgo,
    });

    return {
      ok: true,
      calls,
    };
  });

  // GET /admin/logs/provider-calls/errors - Get error summary
  fastify.get("/admin/logs/provider-calls/errors", async (request, reply) => {
    const db = getDb();

    // Get current user and verify admin role
    let userId: string;
    try {
      userId = getUserId(request);
      const user = await db.users.getById(userId);
      if (!user || user.role !== "admin") {
        return reply.code(403).send({
          ok: false,
          error: {
            code: "FORBIDDEN",
            message: "Admin access required",
          },
        });
      }
    } catch {
      return reply.code(401).send({
        ok: false,
        error: {
          code: "NOT_AUTHENTICATED",
          message: "Authentication required",
        },
      });
    }

    // Get singleton context for userId
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

    const query = request.query as Record<string, string | undefined>;
    const hoursAgo = query.hoursAgo ? parseInt(query.hoursAgo, 10) : 24;

    // Validate hoursAgo
    if (Number.isNaN(hoursAgo) || hoursAgo < 1 || hoursAgo > 720) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: "INVALID_PARAM",
          message: "hoursAgo must be a number between 1 and 720",
        },
      });
    }

    const errors = await db.providerCalls.getErrorSummary({
      userId: ctx.userId,
      hoursAgo,
    });

    return {
      ok: true,
      errors,
    };
  });

  // GET /admin/logs/notifications - List recent notifications
  fastify.get("/admin/logs/notifications", async (request, reply) => {
    const db = getDb();

    // Get current user and verify admin role
    let userId: string;
    try {
      userId = getUserId(request);
      const user = await db.users.getById(userId);
      if (!user || user.role !== "admin") {
        return reply.code(403).send({
          ok: false,
          error: {
            code: "FORBIDDEN",
            message: "Admin access required",
          },
        });
      }
    } catch {
      return reply.code(401).send({
        ok: false,
        error: {
          code: "NOT_AUTHENTICATED",
          message: "Authentication required",
        },
      });
    }

    // Get singleton context for userId
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

    const query = request.query as Record<string, string | undefined>;

    // Parse query params
    const limit = query.limit ? parseInt(query.limit, 10) : 100;
    const offset = query.offset ? parseInt(query.offset, 10) : 0;
    const hoursAgo = query.hoursAgo ? parseInt(query.hoursAgo, 10) : 24;
    const severityParam = query.severity;

    // Validate numeric params
    if (Number.isNaN(limit) || limit < 1 || limit > 500) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: "INVALID_PARAM",
          message: "limit must be a number between 1 and 500",
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

    if (Number.isNaN(hoursAgo) || hoursAgo < 1 || hoursAgo > 720) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: "INVALID_PARAM",
          message: "hoursAgo must be a number between 1 and 720",
        },
      });
    }

    let severities: ("info" | "warning" | "error")[] | undefined;
    if (severityParam) {
      const allowed = new Set(["info", "warning", "error"]);
      const parsed = severityParam
        .split(",")
        .map((value) => value.trim())
        .filter((value) => value.length > 0);

      if (parsed.length === 0 || parsed.some((value) => !allowed.has(value))) {
        return reply.code(400).send({
          ok: false,
          error: {
            code: "INVALID_PARAM",
            message: "severity must be a comma-separated list of info, warning, or error",
          },
        });
      }

      severities = parsed as ("info" | "warning" | "error")[];
    }

    const [{ notifications, total }, unreadCount] = await Promise.all([
      db.notifications.listRecentByUser({
        userId: ctx.userId,
        hoursAgo,
        limit,
        offset,
        severities,
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

  // GET /admin/logs/fetch-runs - List recent fetch runs
  fastify.get("/admin/logs/fetch-runs", async (request, reply) => {
    const db = getDb();

    // Get current user and verify admin role
    let userId: string;
    try {
      userId = getUserId(request);
      const user = await db.users.getById(userId);
      if (!user || user.role !== "admin") {
        return reply.code(403).send({
          ok: false,
          error: {
            code: "FORBIDDEN",
            message: "Admin access required",
          },
        });
      }
    } catch {
      return reply.code(401).send({
        ok: false,
        error: {
          code: "NOT_AUTHENTICATED",
          message: "Authentication required",
        },
      });
    }

    // Get singleton context for userId
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

    const query = request.query as Record<string, string | undefined>;

    // Parse query params
    const limit = query.limit ? parseInt(query.limit, 10) : 50;
    const offset = query.offset ? parseInt(query.offset, 10) : 0;
    const sourceId = query.sourceId;
    const status = query.status;
    const hoursAgo = query.hoursAgo ? parseInt(query.hoursAgo, 10) : 48;

    // Validate numeric params
    if (Number.isNaN(limit) || limit < 1 || limit > 500) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: "INVALID_PARAM",
          message: "limit must be a number between 1 and 500",
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

    if (Number.isNaN(hoursAgo) || hoursAgo < 1 || hoursAgo > 720) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: "INVALID_PARAM",
          message: "hoursAgo must be a number between 1 and 720",
        },
      });
    }

    // Validate sourceId if provided
    if (sourceId !== undefined && !isValidUuid(sourceId)) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: "INVALID_PARAM",
          message: "sourceId must be a valid UUID",
        },
      });
    }

    const runs = await db.fetchRuns.listRecent({
      userId: ctx.userId,
      limit,
      offset,
      sourceId,
      status,
      hoursAgo,
    });

    return {
      ok: true,
      runs,
    };
  });

  // GET /admin/logs/ingestion/sources - Get source health
  fastify.get("/admin/logs/ingestion/sources", async (request, reply) => {
    const db = getDb();

    // Get current user and verify admin role
    try {
      const userId = getUserId(request);
      const user = await db.users.getById(userId);
      if (!user || user.role !== "admin") {
        return reply.code(403).send({
          ok: false,
          error: {
            code: "FORBIDDEN",
            message: "Admin access required",
          },
        });
      }
    } catch {
      return reply.code(401).send({
        ok: false,
        error: {
          code: "NOT_AUTHENTICATED",
          message: "Authentication required",
        },
      });
    }

    // Get singleton context for userId
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

    const sources = await db.ingestionHealth.getSourceHealth({
      userId: ctx.userId,
    });

    return {
      ok: true,
      sources,
    };
  });

  // GET /admin/logs/ingestion/handles - Get handle health
  fastify.get("/admin/logs/ingestion/handles", async (request, reply) => {
    const db = getDb();

    // Get current user and verify admin role
    try {
      const userId = getUserId(request);
      const user = await db.users.getById(userId);
      if (!user || user.role !== "admin") {
        return reply.code(403).send({
          ok: false,
          error: {
            code: "FORBIDDEN",
            message: "Admin access required",
          },
        });
      }
    } catch {
      return reply.code(401).send({
        ok: false,
        error: {
          code: "NOT_AUTHENTICATED",
          message: "Authentication required",
        },
      });
    }

    // Get singleton context for userId
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

    const query = request.query as Record<string, string | undefined>;
    const sourceId = query.sourceId;

    // Validate sourceId if provided
    if (sourceId !== undefined && !isValidUuid(sourceId)) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: "INVALID_PARAM",
          message: "sourceId must be a valid UUID",
        },
      });
    }

    const handles = await db.ingestionHealth.getHandleHealth({
      userId: ctx.userId,
      sourceId,
    });

    return {
      ok: true,
      handles,
    };
  });
}
