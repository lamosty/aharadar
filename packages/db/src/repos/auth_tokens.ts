import type { Queryable } from "../db";

export interface AuthTokenRow {
  id: string;
  user_id: string;
  token_hash: string;
  purpose: string;
  expires_at: string;
  used_at: string | null;
  created_at: string;
}

export interface CreateAuthTokenParams {
  userId: string;
  tokenHash: string;
  purpose?: string;
  expiresAt: Date;
}

export function createAuthTokensRepo(db: Queryable) {
  return {
    async create(params: CreateAuthTokenParams): Promise<AuthTokenRow> {
      const result = await db.query<AuthTokenRow>(
        `INSERT INTO auth_tokens (user_id, token_hash, purpose, expires_at)
         VALUES ($1, $2, $3, $4)
         RETURNING id, user_id, token_hash, purpose,
                   expires_at::text, used_at::text, created_at::text`,
        [params.userId, params.tokenHash, params.purpose ?? "magic_link", params.expiresAt.toISOString()]
      );
      const row = result.rows[0];
      if (!row) throw new Error("Failed to create auth token");
      return row;
    },

    async getByHash(tokenHash: string): Promise<AuthTokenRow | null> {
      const result = await db.query<AuthTokenRow>(
        `SELECT id, user_id, token_hash, purpose,
                expires_at::text, used_at::text, created_at::text
         FROM auth_tokens
         WHERE token_hash = $1`,
        [tokenHash]
      );
      return result.rows[0] ?? null;
    },

    async getValidByHash(tokenHash: string): Promise<AuthTokenRow | null> {
      const result = await db.query<AuthTokenRow>(
        `SELECT id, user_id, token_hash, purpose,
                expires_at::text, used_at::text, created_at::text
         FROM auth_tokens
         WHERE token_hash = $1
           AND used_at IS NULL
           AND expires_at > now()`,
        [tokenHash]
      );
      return result.rows[0] ?? null;
    },

    async markUsed(id: string): Promise<void> {
      await db.query("UPDATE auth_tokens SET used_at = now() WHERE id = $1", [id]);
    },

    async deleteByUser(userId: string): Promise<number> {
      const result = await db.query("DELETE FROM auth_tokens WHERE user_id = $1", [userId]);
      return result.rowCount ?? 0;
    },

    async deleteExpired(): Promise<number> {
      const result = await db.query("DELETE FROM auth_tokens WHERE expires_at < now()");
      return result.rowCount ?? 0;
    },
  };
}
