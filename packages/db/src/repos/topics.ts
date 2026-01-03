import type { Queryable } from "../db";

export interface TopicRow {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  created_at: string;
}

export function createTopicsRepo(db: Queryable) {
  return {
    async listByUser(userId: string): Promise<TopicRow[]> {
      const res = await db.query<TopicRow>(
        `select id, user_id, name, description, created_at::text as created_at
         from topics
         where user_id = $1
         order by created_at asc`,
        [userId]
      );
      return res.rows;
    },

    async getById(topicId: string): Promise<TopicRow | null> {
      const res = await db.query<TopicRow>(
        `select id, user_id, name, description, created_at::text as created_at
         from topics
         where id = $1
         limit 1`,
        [topicId]
      );
      return res.rows[0] ?? null;
    },

    async getByName(params: { userId: string; name: string }): Promise<TopicRow | null> {
      const res = await db.query<TopicRow>(
        `select id, user_id, name, description, created_at::text as created_at
         from topics
         where user_id = $1 and name = $2
         limit 1`,
        [params.userId, params.name]
      );
      return res.rows[0] ?? null;
    },

    async create(params: {
      userId: string;
      name: string;
      description?: string | null;
    }): Promise<{ id: string }> {
      const res = await db.query<{ id: string }>(
        `insert into topics (user_id, name, description)
         values ($1, $2, $3)
         returning id`,
        [params.userId, params.name, params.description ?? null]
      );
      const row = res.rows[0];
      if (!row) throw new Error("topics.create failed: no row returned");
      return row;
    },

    async getOrCreateDefaultForUser(userId: string): Promise<{ id: string; inserted: boolean }> {
      const res = await db.query<{ id: string; inserted: boolean }>(
        `insert into topics (user_id, name)
         values ($1, 'default')
         on conflict (user_id, name)
         do update set name = excluded.name
         returning id, (xmax = 0) as inserted`,
        [userId]
      );
      const row = res.rows[0];
      if (!row) throw new Error("topics.getOrCreateDefaultForUser failed: no row returned");
      return row;
    },
  };
}


