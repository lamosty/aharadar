import type { Queryable } from "../db";

// Status types
export type AbtestRunStatus = "pending" | "running" | "completed" | "failed";
export type AbtestResultStatus = "pending" | "ok" | "error";

// Row types (snake_case from DB)
export interface AbtestRunRow {
  id: string;
  user_id: string;
  topic_id: string;
  window_start: string;
  window_end: string;
  status: AbtestRunStatus;
  config_json: Record<string, unknown>;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface AbtestVariantRow {
  id: string;
  run_id: string;
  name: string;
  provider: string;
  model: string;
  reasoning_effort: string | null;
  max_output_tokens: number | null;
  order: number;
}

export interface AbtestItemRow {
  id: string;
  run_id: string;
  candidate_id: string | null;
  cluster_id: string | null;
  content_item_id: string | null;
  representative_content_item_id: string | null;
  source_id: string | null;
  source_type: string | null;
  title: string | null;
  url: string | null;
  author: string | null;
  published_at: string | null;
  body_text: string | null;
}

export interface AbtestResultRow {
  id: string;
  abtest_item_id: string;
  variant_id: string;
  triage_json: Record<string, unknown> | null;
  input_tokens: number;
  output_tokens: number;
  status: AbtestResultStatus;
  error_json: Record<string, unknown> | null;
  created_at: string;
}

// Raw row type from DB (JSONB may come as string)
interface AbtestRunRowRaw {
  id: string;
  user_id: string;
  topic_id: string;
  window_start: string;
  window_end: string;
  status: AbtestRunStatus;
  config_json: Record<string, unknown> | string;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

function parseRunRow(raw: AbtestRunRowRaw): AbtestRunRow {
  return {
    ...raw,
    config_json:
      typeof raw.config_json === "string" ? JSON.parse(raw.config_json) : (raw.config_json ?? {}),
  };
}

// Input types for insert operations
export interface AbtestVariantInsert {
  name: string;
  provider: string;
  model: string;
  reasoningEffort?: string | null;
  maxOutputTokens?: number | null;
  order: number;
}

export interface AbtestItemInsert {
  candidateId?: string | null;
  clusterId?: string | null;
  contentItemId?: string | null;
  representativeContentItemId?: string | null;
  sourceId?: string | null;
  sourceType?: string | null;
  title?: string | null;
  url?: string | null;
  author?: string | null;
  publishedAt?: string | null;
  bodyText?: string | null;
}

export interface AbtestResultInsert {
  abtestItemId: string;
  variantId: string;
  triageJson?: Record<string, unknown> | null;
  inputTokens?: number;
  outputTokens?: number;
  status: AbtestResultStatus;
  errorJson?: Record<string, unknown> | null;
}

// Run detail includes all related entities
export interface AbtestRunDetail {
  run: AbtestRunRow;
  variants: AbtestVariantRow[];
  items: AbtestItemRow[];
  results: AbtestResultRow[];
}

export function createAbtestsRepo(db: Queryable) {
  return {
    async createRun(params: {
      userId: string;
      topicId: string;
      windowStart: string;
      windowEnd: string;
      configJson?: Record<string, unknown>;
    }): Promise<AbtestRunRow> {
      const configJson = params.configJson ?? {};
      const res = await db.query<AbtestRunRowRaw>(
        `insert into abtest_runs (user_id, topic_id, window_start, window_end, config_json)
         values ($1, $2::uuid, $3::timestamptz, $4::timestamptz, $5::jsonb)
         returning id, user_id, topic_id::text as topic_id,
                   window_start::text as window_start, window_end::text as window_end,
                   status, config_json,
                   created_at::text as created_at,
                   started_at::text as started_at,
                   completed_at::text as completed_at`,
        [
          params.userId,
          params.topicId,
          params.windowStart,
          params.windowEnd,
          JSON.stringify(configJson),
        ],
      );
      const row = res.rows[0];
      if (!row) throw new Error("abtests.createRun failed: no row returned");
      return parseRunRow(row);
    },

    async updateRunStatus(params: {
      runId: string;
      status: AbtestRunStatus;
      startedAt?: string | null;
      completedAt?: string | null;
    }): Promise<AbtestRunRow> {
      const updates: string[] = ["status = $2"];
      const values: unknown[] = [params.runId, params.status];
      let idx = 3;

      if (params.startedAt !== undefined) {
        updates.push(`started_at = $${idx}::timestamptz`);
        values.push(params.startedAt);
        idx++;
      }
      if (params.completedAt !== undefined) {
        updates.push(`completed_at = $${idx}::timestamptz`);
        values.push(params.completedAt);
        idx++;
      }

      const res = await db.query<AbtestRunRowRaw>(
        `update abtest_runs
         set ${updates.join(", ")}
         where id = $1
         returning id, user_id, topic_id::text as topic_id,
                   window_start::text as window_start, window_end::text as window_end,
                   status, config_json,
                   created_at::text as created_at,
                   started_at::text as started_at,
                   completed_at::text as completed_at`,
        values,
      );
      const row = res.rows[0];
      if (!row) throw new Error("abtests.updateRunStatus failed: no row returned");
      return parseRunRow(row);
    },

    async insertVariants(
      runId: string,
      variants: AbtestVariantInsert[],
    ): Promise<AbtestVariantRow[]> {
      if (variants.length === 0) return [];

      const values: unknown[] = [];
      const placeholders: string[] = [];
      let idx = 1;

      for (const v of variants) {
        placeholders.push(
          `($${idx}::uuid, $${idx + 1}, $${idx + 2}, $${idx + 3}, $${idx + 4}, $${idx + 5}, $${idx + 6})`,
        );
        values.push(
          runId,
          v.name,
          v.provider,
          v.model,
          v.reasoningEffort ?? null,
          v.maxOutputTokens ?? null,
          v.order,
        );
        idx += 7;
      }

      const res = await db.query<AbtestVariantRow>(
        `insert into abtest_variants (run_id, name, provider, model, reasoning_effort, max_output_tokens, "order")
         values ${placeholders.join(", ")}
         returning id, run_id::text as run_id, name, provider, model, reasoning_effort, max_output_tokens, "order"`,
        values,
      );
      return res.rows;
    },

    async insertItems(runId: string, items: AbtestItemInsert[]): Promise<AbtestItemRow[]> {
      if (items.length === 0) return [];

      const values: unknown[] = [];
      const placeholders: string[] = [];
      let idx = 1;

      for (const item of items) {
        placeholders.push(
          `($${idx}::uuid, $${idx + 1}::uuid, $${idx + 2}::uuid, $${idx + 3}::uuid, $${idx + 4}::uuid, $${idx + 5}::uuid, $${idx + 6}, $${idx + 7}, $${idx + 8}, $${idx + 9}, $${idx + 10}::timestamptz, $${idx + 11})`,
        );
        values.push(
          runId,
          item.candidateId ?? null,
          item.clusterId ?? null,
          item.contentItemId ?? null,
          item.representativeContentItemId ?? null,
          item.sourceId ?? null,
          item.sourceType ?? null,
          item.title ?? null,
          item.url ?? null,
          item.author ?? null,
          item.publishedAt ?? null,
          item.bodyText ?? null,
        );
        idx += 12;
      }

      const res = await db.query<AbtestItemRow>(
        `insert into abtest_items (run_id, candidate_id, cluster_id, content_item_id, representative_content_item_id, source_id, source_type, title, url, author, published_at, body_text)
         values ${placeholders.join(", ")}
         returning id, run_id::text as run_id, candidate_id::text as candidate_id,
                   cluster_id::text as cluster_id, content_item_id::text as content_item_id,
                   representative_content_item_id::text as representative_content_item_id,
                   source_id::text as source_id, source_type, title, url, author,
                   published_at::text as published_at, body_text`,
        values,
      );
      return res.rows;
    },

    async insertResults(results: AbtestResultInsert[]): Promise<AbtestResultRow[]> {
      if (results.length === 0) return [];

      const values: unknown[] = [];
      const placeholders: string[] = [];
      let idx = 1;

      for (const r of results) {
        placeholders.push(
          `($${idx}::uuid, $${idx + 1}::uuid, $${idx + 2}::jsonb, $${idx + 3}, $${idx + 4}, $${idx + 5}, $${idx + 6}::jsonb)`,
        );
        values.push(
          r.abtestItemId,
          r.variantId,
          r.triageJson ? JSON.stringify(r.triageJson) : null,
          r.inputTokens ?? 0,
          r.outputTokens ?? 0,
          r.status,
          r.errorJson ? JSON.stringify(r.errorJson) : null,
        );
        idx += 7;
      }

      const res = await db.query<AbtestResultRow>(
        `insert into abtest_results (abtest_item_id, variant_id, triage_json, input_tokens, output_tokens, status, error_json)
         values ${placeholders.join(", ")}
         returning id, abtest_item_id::text as abtest_item_id, variant_id::text as variant_id,
                   triage_json, input_tokens, output_tokens, status, error_json,
                   created_at::text as created_at`,
        values,
      );
      return res.rows;
    },

    async listRuns(params: { userId: string; limit?: number }): Promise<AbtestRunRow[]> {
      const limit = params.limit ?? 20;
      const res = await db.query<AbtestRunRowRaw>(
        `select id, user_id, topic_id::text as topic_id,
                window_start::text as window_start, window_end::text as window_end,
                status, config_json,
                created_at::text as created_at,
                started_at::text as started_at,
                completed_at::text as completed_at
         from abtest_runs
         where user_id = $1
         order by created_at desc
         limit $2`,
        [params.userId, limit],
      );
      return res.rows.map(parseRunRow);
    },

    async getRunDetail(runId: string): Promise<AbtestRunDetail | null> {
      // Fetch run
      const runRes = await db.query<AbtestRunRowRaw>(
        `select id, user_id, topic_id::text as topic_id,
                window_start::text as window_start, window_end::text as window_end,
                status, config_json,
                created_at::text as created_at,
                started_at::text as started_at,
                completed_at::text as completed_at
         from abtest_runs
         where id = $1`,
        [runId],
      );
      const runRow = runRes.rows[0];
      if (!runRow) return null;

      // Fetch variants
      const variantsRes = await db.query<AbtestVariantRow>(
        `select id, run_id::text as run_id, name, provider, model, reasoning_effort, max_output_tokens, "order"
         from abtest_variants
         where run_id = $1
         order by "order"`,
        [runId],
      );

      // Fetch items
      const itemsRes = await db.query<AbtestItemRow>(
        `select id, run_id::text as run_id, candidate_id::text as candidate_id,
                cluster_id::text as cluster_id, content_item_id::text as content_item_id,
                representative_content_item_id::text as representative_content_item_id,
                source_id::text as source_id, source_type, title, url, author,
                published_at::text as published_at, body_text
         from abtest_items
         where run_id = $1`,
        [runId],
      );

      // Fetch results
      const resultsRes = await db.query<AbtestResultRow>(
        `select r.id, r.abtest_item_id::text as abtest_item_id, r.variant_id::text as variant_id,
                r.triage_json, r.input_tokens, r.output_tokens, r.status, r.error_json,
                r.created_at::text as created_at
         from abtest_results r
         join abtest_items i on i.id = r.abtest_item_id
         where i.run_id = $1`,
        [runId],
      );

      return {
        run: parseRunRow(runRow),
        variants: variantsRes.rows,
        items: itemsRes.rows,
        results: resultsRes.rows,
      };
    },
  };
}
