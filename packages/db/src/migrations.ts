import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { Pool, type PoolClient } from "pg";

export interface MigrationResult {
  total: number;
  skipped: number;
  applied: string[];
}

export interface RunMigrationsOptions {
  databaseUrl: string;
  migrationsDir?: string;
  log?: Pick<Console, "log" | "error">;
}

const MIGRATION_LOCK_ID = 733_422_934;

function getDefaultMigrationsDir(): string {
  return resolve(__dirname, "../migrations");
}

function listMigrationFiles(migrationsDir: string): string[] {
  if (!existsSync(migrationsDir)) {
    throw new Error(`Migrations directory does not exist: ${migrationsDir}`);
  }

  return readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b));
}

async function ensureSchemaMigrations(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

async function getAppliedMigrationNames(client: PoolClient): Promise<Set<string>> {
  const result = await client.query<{ name: string }>(
    "SELECT name FROM schema_migrations ORDER BY name;",
  );
  return new Set(result.rows.map((row) => row.name));
}

async function applyMigration(
  client: PoolClient,
  migrationsDir: string,
  name: string,
): Promise<void> {
  const sql = readFileSync(resolve(migrationsDir, name), "utf8");

  await client.query("BEGIN");
  try {
    await client.query(sql);
    await client.query("INSERT INTO schema_migrations (name) VALUES ($1);", [name]);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
}

export async function runMigrations(options: RunMigrationsOptions): Promise<MigrationResult> {
  const migrationsDir = options.migrationsDir ?? getDefaultMigrationsDir();
  const log = options.log ?? console;
  const files = listMigrationFiles(migrationsDir);
  const pool = new Pool({ connectionString: options.databaseUrl });
  const appliedNow: string[] = [];
  let skipped = 0;

  const client = await pool.connect();
  try {
    // @decision Use an advisory lock so the Docker one-shot service and any
    // manual migration command cannot race each other during Compose startup.
    await client.query("SELECT pg_advisory_lock($1);", [MIGRATION_LOCK_ID]);

    await ensureSchemaMigrations(client);
    const alreadyApplied = await getAppliedMigrationNames(client);

    for (const name of files) {
      if (alreadyApplied.has(name)) {
        skipped += 1;
        continue;
      }

      log.log(`Applying migration: ${basename(name)}`);
      await applyMigration(client, migrationsDir, name);
      alreadyApplied.add(name);
      appliedNow.push(name);
    }
  } finally {
    try {
      await client.query("SELECT pg_advisory_unlock($1);", [MIGRATION_LOCK_ID]);
    } finally {
      client.release();
      await pool.end();
    }
  }

  return {
    total: files.length,
    skipped,
    applied: appliedNow,
  };
}
