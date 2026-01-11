import type { FastifyReply, FastifyRequest } from "fastify";
import { getDb, getSingletonContext } from "../lib/db.js";
import { hashToken } from "./crypto.js";

export interface AuthenticatedRequest extends FastifyRequest {
  userId: string;
  sessionId: string;
}

/**
 * Session authentication hook for Fastify
 * Validates the session cookie and attaches userId to request
 */
export async function sessionAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  // Dev mode auth bypass for testing
  if (process.env.NODE_ENV !== "production") {
    const bypassCookie = request.cookies?.BYPASS_AUTH;
    if (bypassCookie === "admin" || bypassCookie === "user") {
      const ctx = await getSingletonContext();
      if (ctx) {
        (request as AuthenticatedRequest).userId = ctx.userId;
        (request as AuthenticatedRequest).sessionId = "dev-bypass-session";
        console.log("[DEV] Auth bypassed", { userId: ctx.userId, role: bypassCookie });
        return;
      }
    }
  }

  const sessionToken = request.cookies?.session;

  if (!sessionToken) {
    reply.code(401).send({
      ok: false,
      error: { code: "NOT_AUTHENTICATED", message: "No session token" },
    });
    return;
  }

  const db = getDb();
  const tokenHash = hashToken(sessionToken);
  const session = await db.sessions.getValidByTokenHash(tokenHash);

  if (!session) {
    reply.code(401).send({
      ok: false,
      error: { code: "SESSION_EXPIRED", message: "Session expired or invalid" },
    });
    return;
  }

  // Update last activity timestamp
  await db.sessions.updateActivity(session.id);

  // Attach user info to request
  (request as AuthenticatedRequest).userId = session.user_id;
  (request as AuthenticatedRequest).sessionId = session.id;
}

/**
 * Get user ID from authenticated request
 * Throws if not authenticated (use after sessionAuth hook)
 */
export function getUserId(request: FastifyRequest): string {
  const userId = (request as AuthenticatedRequest).userId;
  if (!userId) {
    throw new Error("Request not authenticated - missing userId");
  }
  return userId;
}
