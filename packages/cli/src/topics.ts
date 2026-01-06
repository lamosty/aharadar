import type { Db, TopicRow } from "@aharadar/db";

function isUuidLike(value: string): boolean {
  // Good-enough UUID v4-ish check for CLI ergonomics.
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim());
}

export type ResolvedTopic = { id: string; name: string };

export async function resolveTopicForUser(params: {
  db: Db;
  userId: string;
  topicArg: string | null;
}): Promise<ResolvedTopic> {
  const topicArg = params.topicArg?.trim() ? params.topicArg.trim() : null;

  const topics = await params.db.topics.listByUser(params.userId);

  if (topicArg) {
    if (isUuidLike(topicArg)) {
      const byId = await params.db.topics.getById(topicArg);
      if (!byId || byId.user_id !== params.userId) {
        throw new Error(`Unknown topic id: ${topicArg}`);
      }
      return { id: byId.id, name: byId.name };
    }

    const byName = await params.db.topics.getByName({ userId: params.userId, name: topicArg });
    if (!byName) {
      throw new Error(`Unknown topic name: ${JSON.stringify(topicArg)}`);
    }
    return { id: byName.id, name: byName.name };
  }

  if (topics.length === 0) {
    const created = await params.db.topics.getOrCreateDefaultForUser(params.userId);
    return { id: created.id, name: "default" };
  }

  if (topics.length === 1) {
    const only = topics[0]!;
    return { id: only.id, name: only.name };
  }

  const def = topics.find((t) => t.name === "default");
  if (def) return { id: def.id, name: def.name };

  throw new Error(
    `Multiple topics exist. Pass --topic <id-or-name>. Available: ${topics.map((t) => t.name).join(", ")}`
  );
}

export function formatTopicList(topics: TopicRow[]): string {
  if (topics.length === 0) return "(no topics)";
  return topics.map((t) => `- ${t.id} ${t.name}${t.description ? ` — ${t.description}` : ""}`).join("\n");
}
