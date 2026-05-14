import { loadDotEnvIfPresent } from "@aharadar/shared";
import { runMigrations } from "./migrations";

async function main(): Promise<void> {
  loadDotEnvIfPresent();

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("Missing required env var: DATABASE_URL");
  }

  const result = await runMigrations({ databaseUrl });

  console.log(
    `Migrations complete. Total: ${result.total}, Skipped: ${result.skipped}, Applied: ${result.applied.length}`,
  );
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`Migration failed: ${message}`);
  process.exit(1);
});
