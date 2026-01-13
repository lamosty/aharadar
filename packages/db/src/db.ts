import type { PoolClient, QueryResult, QueryResultRow } from "pg";
import { Pool } from "pg";
import { createAbtestsRepo } from "./repos/abtests";
import { createAggregateSummariesRepo } from "./repos/aggregate_summaries";
import { createAuthTokensRepo } from "./repos/auth_tokens";
import { createContentItemSourcesRepo } from "./repos/content_item_sources";
import { createContentItemsRepo } from "./repos/content_items";
import { createDeepReviewsRepo } from "./repos/deep_reviews";
import { createDigestItemsRepo } from "./repos/digest_items";
import { createDigestsRepo } from "./repos/digests";
import { createEmbeddingsRepo } from "./repos/embeddings";
import { createFeedbackEventsRepo } from "./repos/feedback_events";
import { createFetchRunsRepo } from "./repos/fetch_runs";
import { createLlmSettingsRepo } from "./repos/llm_settings";
import { createProviderCallsRepo } from "./repos/provider_calls";
import { createSessionsRepo } from "./repos/sessions";
import { createSourcesRepo } from "./repos/sources";
import { createTopicPreferenceProfilesRepo } from "./repos/topic_preference_profiles";
import { createTopicsRepo } from "./repos/topics";
import { createUserApiKeysRepo } from "./repos/user_api_keys";
import { createUsersRepo } from "./repos/users";
import { createXAccountPoliciesRepo } from "./repos/x_account_policies";

export interface Queryable {
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[],
  ): Promise<QueryResult<T>>;
}

export type DbContext = Queryable & {
  users: ReturnType<typeof createUsersRepo>;
  topics: ReturnType<typeof createTopicsRepo>;
  sources: ReturnType<typeof createSourcesRepo>;
  fetchRuns: ReturnType<typeof createFetchRunsRepo>;
  contentItems: ReturnType<typeof createContentItemsRepo>;
  contentItemSources: ReturnType<typeof createContentItemSourcesRepo>;
  embeddings: ReturnType<typeof createEmbeddingsRepo>;
  topicPreferenceProfiles: ReturnType<typeof createTopicPreferenceProfilesRepo>;
  digests: ReturnType<typeof createDigestsRepo>;
  digestItems: ReturnType<typeof createDigestItemsRepo>;
  feedbackEvents: ReturnType<typeof createFeedbackEventsRepo>;
  providerCalls: ReturnType<typeof createProviderCallsRepo>;
  authTokens: ReturnType<typeof createAuthTokensRepo>;
  sessions: ReturnType<typeof createSessionsRepo>;
  userApiKeys: ReturnType<typeof createUserApiKeysRepo>;
  llmSettings: ReturnType<typeof createLlmSettingsRepo>;
  abtests: ReturnType<typeof createAbtestsRepo>;
  xAccountPolicies: ReturnType<typeof createXAccountPoliciesRepo>;
  deepReviews: ReturnType<typeof createDeepReviewsRepo>;
  aggregateSummaries: ReturnType<typeof createAggregateSummariesRepo>;
};

export interface Db extends DbContext {
  tx<T>(fn: (tx: DbContext) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

function createContext(db: Queryable): DbContext {
  return {
    query: db.query.bind(db),
    users: createUsersRepo(db),
    topics: createTopicsRepo(db),
    sources: createSourcesRepo(db),
    fetchRuns: createFetchRunsRepo(db),
    contentItems: createContentItemsRepo(db),
    contentItemSources: createContentItemSourcesRepo(db),
    embeddings: createEmbeddingsRepo(db),
    topicPreferenceProfiles: createTopicPreferenceProfilesRepo(db),
    digests: createDigestsRepo(db),
    digestItems: createDigestItemsRepo(db),
    feedbackEvents: createFeedbackEventsRepo(db),
    providerCalls: createProviderCallsRepo(db),
    authTokens: createAuthTokensRepo(db),
    sessions: createSessionsRepo(db),
    userApiKeys: createUserApiKeysRepo(db),
    llmSettings: createLlmSettingsRepo(db),
    abtests: createAbtestsRepo(db),
    xAccountPolicies: createXAccountPoliciesRepo(db),
    deepReviews: createDeepReviewsRepo(db),
    aggregateSummaries: createAggregateSummariesRepo(db),
  };
}

function asQueryable(client: PoolClient): Queryable {
  return {
    query: client.query.bind(client),
  };
}

export function createDb(databaseUrl: string): Db {
  const pool = new Pool({ connectionString: databaseUrl });
  const base: Queryable = {
    query: pool.query.bind(pool),
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
    },
  };
}
