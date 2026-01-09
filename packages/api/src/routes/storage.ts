import { createDb } from "@aharadar/db";
import { createLogger } from "@aharadar/shared";
import type { FastifyInstance } from "fastify";

const log = createLogger({ component: "storage-metrics" });

interface TableStats {
  table_name: string;
  total_size: string;
  index_size: string;
  row_count: string;
}

interface DbSizeResult {
  size: string;
}

export async function storageRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get("/storage/metrics", async (_request, reply) => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      log.error("DATABASE_URL not configured");
      reply.code(500).send("DATABASE_URL not configured");
      return;
    }

    const db = createDb(databaseUrl);

    try {
      // Get total database size
      const dbSizeResult = await db.query<DbSizeResult>(
        "SELECT pg_database_size(current_database()) as size",
      );
      const dbSize = dbSizeResult.rows[0]?.size ?? "0";

      // Get table sizes and row counts
      const tableStatsResult = await db.query<TableStats>(`
        SELECT
          relname as table_name,
          pg_total_relation_size(relid)::text as total_size,
          pg_indexes_size(relid)::text as index_size,
          n_live_tup::text as row_count
        FROM pg_stat_user_tables
        ORDER BY pg_total_relation_size(relid) DESC
      `);

      // Format as Prometheus metrics
      let output = "";

      // Database size
      output += "# HELP postgres_database_size_bytes Total database size in bytes\n";
      output += "# TYPE postgres_database_size_bytes gauge\n";
      output += `postgres_database_size_bytes ${dbSize}\n\n`;

      // Table sizes
      output += "# HELP postgres_table_size_bytes Table size in bytes (including indexes)\n";
      output += "# TYPE postgres_table_size_bytes gauge\n";
      for (const row of tableStatsResult.rows) {
        output += `postgres_table_size_bytes{table="${row.table_name}"} ${row.total_size}\n`;
      }
      output += "\n";

      // Index sizes
      output += "# HELP postgres_index_size_bytes Index size in bytes per table\n";
      output += "# TYPE postgres_index_size_bytes gauge\n";
      for (const row of tableStatsResult.rows) {
        output += `postgres_index_size_bytes{table="${row.table_name}"} ${row.index_size}\n`;
      }
      output += "\n";

      // Row counts
      output += "# HELP postgres_row_count Estimated row count per table\n";
      output += "# TYPE postgres_row_count gauge\n";
      for (const row of tableStatsResult.rows) {
        output += `postgres_row_count{table="${row.table_name}"} ${row.row_count}\n`;
      }

      reply.type("text/plain; charset=utf-8").send(output);
    } catch (error) {
      log.error({ error }, "Failed to collect storage metrics");
      reply.code(500).send("Failed to collect storage metrics");
    } finally {
      await db.close();
    }
  });
}
