import type { Queryable } from "../db";

export interface UserApiKeyRow {
  id: string;
  user_id: string;
  provider: string;
  encrypted_key: Buffer;
  iv: Buffer;
  key_suffix: string;
  created_at: string;
  updated_at: string;
}

export interface UserApiKeySummary {
  id: string;
  provider: string;
  key_suffix: string;
  created_at: string;
  updated_at: string;
}

export function createUserApiKeysRepo(db: Queryable) {
  return {
    async upsert(
      userId: string,
      provider: string,
      encryptedKey: Buffer,
      iv: Buffer,
      keySuffix: string
    ): Promise<UserApiKeyRow> {
      const result = await db.query<UserApiKeyRow>(
        `INSERT INTO user_api_keys (user_id, provider, encrypted_key, iv, key_suffix)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id, provider) DO UPDATE SET
           encrypted_key = EXCLUDED.encrypted_key,
           iv = EXCLUDED.iv,
           key_suffix = EXCLUDED.key_suffix,
           updated_at = now()
         RETURNING id, user_id, provider, encrypted_key, iv, key_suffix, created_at, updated_at`,
        [userId, provider, encryptedKey, iv, keySuffix]
      );
      const row = result.rows[0];
      if (!row) throw new Error("Failed to upsert user API key");
      return row;
    },

    async findByUserAndProvider(userId: string, provider: string): Promise<UserApiKeyRow | null> {
      const result = await db.query<UserApiKeyRow>(
        `SELECT id, user_id, provider, encrypted_key, iv, key_suffix, created_at, updated_at
         FROM user_api_keys
         WHERE user_id = $1 AND provider = $2`,
        [userId, provider]
      );
      return result.rows[0] ?? null;
    },

    async listByUser(userId: string): Promise<UserApiKeySummary[]> {
      const result = await db.query<UserApiKeySummary>(
        `SELECT id, provider, key_suffix, created_at, updated_at
         FROM user_api_keys
         WHERE user_id = $1
         ORDER BY provider`,
        [userId]
      );
      return result.rows;
    },

    async delete(userId: string, id: string): Promise<boolean> {
      const result = await db.query(
        `DELETE FROM user_api_keys WHERE id = $1 AND user_id = $2`,
        [id, userId]
      );
      return (result.rowCount ?? 0) > 0;
    },

    async deleteByProvider(userId: string, provider: string): Promise<boolean> {
      const result = await db.query(
        `DELETE FROM user_api_keys WHERE user_id = $1 AND provider = $2`,
        [userId, provider]
      );
      return (result.rowCount ?? 0) > 0;
    },
  };
}
