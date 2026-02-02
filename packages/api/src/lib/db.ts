import { createDb, type Db } from "@aharadar/db";
import { loadRuntimeEnv } from "@aharadar/shared";
import type { FastifyRequest } from "fastify";
import type { AuthenticatedRequest } from "../auth/session.js";

let db: Db | null = null;

export function getDb(): Db {
  if (!db) {
    const env = loadRuntimeEnv();
    db = createDb(env.databaseUrl);
  }
  return db;
}

export interface SingletonContext {
  userId: string;
  topicId: string;
  db: Db;
}

export async function getSingletonContext(): Promise<SingletonContext | null> {
  const database = getDb();
  const user = await database.users.getFirstUser();
  if (!user) return null;

  const topics = await database.topics.listByUser(user.id);
  const firstTopic = topics[0];
  if (!firstTopic) return null;

  return { userId: user.id, topicId: firstTopic.id, db: database };
}

/**
 * Get userId from session if authenticated, fallback to singleton context.
 * Use this for routes that should respect session auth but also work for CLI.
 */
export async function getUserIdWithFallback(request: FastifyRequest): Promise<string | null> {
  // Prefer session-authenticated user
  const sessionUserId = (request as AuthenticatedRequest).userId;
  if (sessionUserId) return sessionUserId;

  // Fallback to singleton for CLI/unauthenticated access
  const ctx = await getSingletonContext();
  return ctx?.userId ?? null;
}
