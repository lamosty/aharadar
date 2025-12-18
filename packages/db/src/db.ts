import { Pool } from "pg";
import type { PoolClient, QueryResult, QueryResultRow } from "pg";

import { createContentItemsRepo } from "./repos/content_items";
import { createFetchRunsRepo } from "./repos/fetch_runs";
import { createProviderCallsRepo } from "./repos/provider_calls";
import { createSourcesRepo } from "./repos/sources";
import { createUsersRepo } from "./repos/users";

export interface Queryable {
  query<T extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]): Promise<QueryResult<T>>;
}

export type DbContext = Queryable & {
  users: ReturnType<typeof createUsersRepo>;
  sources: ReturnType<typeof createSourcesRepo>;
  fetchRuns: ReturnType<typeof createFetchRunsRepo>;
  contentItems: ReturnType<typeof createContentItemsRepo>;
  providerCalls: ReturnType<typeof createProviderCallsRepo>;
};

export interface Db extends DbContext {
  tx<T>(fn: (tx: DbContext) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

function createContext(db: Queryable): DbContext {
  return {
    query: db.query.bind(db),
    users: createUsersRepo(db),
    sources: createSourcesRepo(db),
    fetchRuns: createFetchRunsRepo(db),
    contentItems: createContentItemsRepo(db),
    providerCalls: createProviderCallsRepo(db)
  };
}

function asQueryable(client: PoolClient): Queryable {
  return {
    query: client.query.bind(client)
  };
}

export function createDb(databaseUrl: string): Db {
  const pool = new Pool({ connectionString: databaseUrl });
  const base: Queryable = {
    query: pool.query.bind(pool)
  };

  const ctx = createContext(base);

  return {
    ...ctx,
    async tx<T>(fn: (tx: DbContext) => Promise<T>): Promise<T> {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const txCtx = createContext(asQueryable(client));
        const result = await fn(txCtx);
        await client.query("COMMIT");
        return result;
      } catch (err) {
        try {
          await client.query("ROLLBACK");
        } catch {
          // swallow rollback errors; original error is more relevant
        }
        throw err;
      } finally {
        client.release();
      }
    },
    async close(): Promise<void> {
      await pool.end();
    }
  };
}
