import type { Queryable } from "../db";

export interface SessionRow {
  id: string;
  user_id: string;
  token_hash: string;
  user_agent: string | null;
  ip_address: string | null;
  expires_at: string;
  created_at: string;
  last_activity_at: string;
}

export interface CreateSessionParams {
  userId: string;
  tokenHash: string;
  userAgent?: string;
  ipAddress?: string;
  expiresAt: Date;
}

export function createSessionsRepo(db: Queryable) {
  return {
    async create(params: CreateSessionParams): Promise<SessionRow> {
      const result = await db.query<SessionRow>(
        `INSERT INTO sessions (user_id, token_hash, user_agent, ip_address, expires_at)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, user_id, token_hash, user_agent, ip_address,
                   expires_at::text, created_at::text, last_activity_at::text`,
        [
          params.userId,
          params.tokenHash,
          params.userAgent ?? null,
          params.ipAddress ?? null,
          params.expiresAt.toISOString(),
        ],
      );
      const row = result.rows[0];
      if (!row) throw new Error("Failed to create session");
      return row;
    },

    async getByTokenHash(tokenHash: string): Promise<SessionRow | null> {
      const result = await db.query<SessionRow>(
        `SELECT id, user_id, token_hash, user_agent, ip_address,
                expires_at::text, created_at::text, last_activity_at::text
         FROM sessions
         WHERE token_hash = $1`,
        [tokenHash],
      );
      return result.rows[0] ?? null;
    },

    async getValidByTokenHash(tokenHash: string): Promise<SessionRow | null> {
      const result = await db.query<SessionRow>(
        `SELECT id, user_id, token_hash, user_agent, ip_address,
                expires_at::text, created_at::text, last_activity_at::text
         FROM sessions
         WHERE token_hash = $1
           AND expires_at > now()`,
        [tokenHash],
      );
      return result.rows[0] ?? null;
    },

    async updateActivity(id: string): Promise<void> {
      await db.query("UPDATE sessions SET last_activity_at = now() WHERE id = $1", [id]);
    },

    async delete(id: string): Promise<void> {
      await db.query("DELETE FROM sessions WHERE id = $1", [id]);
    },

    async deleteByTokenHash(tokenHash: string): Promise<void> {
      await db.query("DELETE FROM sessions WHERE token_hash = $1", [tokenHash]);
    },

    async deleteByUser(userId: string): Promise<number> {
      const result = await db.query("DELETE FROM sessions WHERE user_id = $1", [userId]);
      return result.rowCount ?? 0;
    },

    async deleteExpired(): Promise<number> {
      const result = await db.query("DELETE FROM sessions WHERE expires_at < now()");
      return result.rowCount ?? 0;
    },

    async listByUser(userId: string): Promise<SessionRow[]> {
      const result = await db.query<SessionRow>(
        `SELECT id, user_id, token_hash, user_agent, ip_address,
                expires_at::text, created_at::text, last_activity_at::text
         FROM sessions
         WHERE user_id = $1
         ORDER BY last_activity_at DESC`,
        [userId],
      );
      return result.rows;
    },
  };
}
