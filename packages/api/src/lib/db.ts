import { createDb, type Db } from "@aharadar/db";
import { loadRuntimeEnv } from "@aharadar/shared";

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
