import type { Queryable } from "../db";

export type UserRole = "admin" | "user";

export interface UserRow {
  id: string;
  email: string | null;
  role: UserRole;
  created_at: string;
}

export interface UserRowWithPassword extends UserRow {
  password_hash: string | null;
}

export interface CreateUserParams {
  email?: string;
}

export function createUsersRepo(db: Queryable) {
  return {
    async getFirstUser(): Promise<UserRow | null> {
      const res = await db.query<UserRow>(
        "select id, email, role, created_at from users order by created_at asc limit 1",
      );
      return res.rows[0] ?? null;
    },

    async getById(userId: string): Promise<UserRow | null> {
      const res = await db.query<UserRow>(
        "select id, email, role, created_at from users where id = $1 limit 1",
        [userId],
      );
      return res.rows[0] ?? null;
    },

    async getByEmail(email: string): Promise<UserRow | null> {
      const normalizedEmail = email.toLowerCase().trim();
      const res = await db.query<UserRow>(
        "select id, email, role, created_at from users where lower(email) = $1 limit 1",
        [normalizedEmail],
      );
      return res.rows[0] ?? null;
    },

    async getOrCreateByEmail(email: string): Promise<UserRow> {
      const normalizedEmail = email.toLowerCase().trim();

      // Try to find existing user
      const existing = await this.getByEmail(normalizedEmail);
      if (existing) return existing;

      // Create new user with email (we already checked it doesn't exist)
      const res = await db.query<UserRow>(
        `INSERT INTO users (email) VALUES ($1) RETURNING id, email, role, created_at`,
        [normalizedEmail],
      );

      const row = res.rows[0];
      if (!row) throw new Error("Failed to create user by email");
      return row;
    },

    async create(params: CreateUserParams = {}): Promise<UserRow> {
      const res = await db.query<UserRow>(
        "insert into users (email) values ($1) returning id, email, role, created_at",
        [params.email ?? null],
      );
      const row = res.rows[0];
      if (!row) throw new Error("Failed to create user");
      return row;
    },

    async getOrCreateSingleton(params: CreateUserParams = {}): Promise<UserRow> {
      const existing = await this.getFirstUser();
      if (existing) return existing;
      return await this.create(params);
    },

    async listAll(): Promise<UserRow[]> {
      const res = await db.query<UserRow>(
        "SELECT id, email, role, created_at FROM users ORDER BY created_at DESC",
      );
      return res.rows;
    },

    async getByEmailWithPassword(email: string): Promise<UserRowWithPassword | null> {
      const normalizedEmail = email.toLowerCase().trim();
      const res = await db.query<UserRowWithPassword>(
        "SELECT id, email, role, created_at, password_hash FROM users WHERE lower(email) = $1 LIMIT 1",
        [normalizedEmail],
      );
      return res.rows[0] ?? null;
    },

    async updatePassword(userId: string, passwordHash: string): Promise<void> {
      await db.query("UPDATE users SET password_hash = $1 WHERE id = $2", [passwordHash, userId]);
    },

    async createWithPassword(email: string, passwordHash: string): Promise<UserRow> {
      const normalizedEmail = email.toLowerCase().trim();
      const res = await db.query<UserRow>(
        `INSERT INTO users (email, password_hash) VALUES ($1, $2)
         RETURNING id, email, role, created_at`,
        [normalizedEmail, passwordHash],
      );
      const row = res.rows[0];
      if (!row) throw new Error("Failed to create user with password");
      return row;
    },
  };
}
