import { calculateCostUsd, type ProviderCallDraft } from "@aharadar/shared";

import type { Queryable } from "../db";

export interface UsageSummary {
  totalUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  callCount: number;
}

export interface UsageByProvider {
  provider: string;
  totalUsd: number;
  callCount: number;
}

export interface UsageByModel {
  provider: string;
  model: string;
  totalUsd: number;
  inputTokens: number;
  outputTokens: number;
  callCount: number;
}

export interface DailyUsage {
  date: string; // YYYY-MM-DD
  totalUsd: number;
  callCount: number;
}

export interface ProviderCallListItem {
  id: string;
  purpose: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  status: string;
  error: Record<string, unknown> | null;
  meta: Record<string, unknown>;
  startedAt: Date;
  endedAt: Date | null;
}

export interface ProviderCallListRecentParams {
  userId: string;
  limit?: number;
  offset?: number;
  purpose?: string;
  status?: string;
  sourceId?: string;
  hoursAgo?: number;
}

export interface ErrorSummaryItem {
  purpose: string;
  errorCount: number;
  totalCount: number;
}

export interface ProviderCallErrorSummaryParams {
  userId: string;
  hoursAgo?: number;
}

export function createProviderCallsRepo(db: Queryable) {
  return {
    async insert(draft: ProviderCallDraft): Promise<{ id: string }> {
      // Calculate USD cost if not provided - centralizes cost calculation
      const costUsd =
        draft.costEstimateUsd ??
        calculateCostUsd(draft.provider, draft.model, draft.inputTokens, draft.outputTokens);

      const res = await db.query<{ id: string }>(
        `insert into provider_calls (
           user_id,
           purpose,
           provider,
           model,
           input_tokens,
           output_tokens,
           cost_estimate_credits,
           cost_estimate_usd,
           meta_json,
           started_at,
           ended_at,
           status,
           error_json
         ) values (
           $1, $2, $3, $4,
           $5, $6, $7, $8,
           $9::jsonb,
           $10::timestamptz,
           $11::timestamptz,
           $12,
           $13::jsonb
         )
         returning id`,
        [
          draft.userId,
          draft.purpose,
          draft.provider,
          draft.model,
          draft.inputTokens,
          draft.outputTokens,
          draft.costEstimateCredits,
          costUsd,
          JSON.stringify(draft.meta ?? {}),
          draft.startedAt,
          draft.endedAt ?? null,
          draft.status,
          draft.error ? JSON.stringify(draft.error) : null,
        ],
      );
      const row = res.rows[0];
      if (!row) throw new Error("Failed to insert provider_call");
      return row;
    },

    async getUsageByPeriod(
      userId: string,
      startDate: Date,
      endDate: Date,
    ): Promise<{
      summary: UsageSummary;
      byProvider: UsageByProvider[];
      byModel: UsageByModel[];
    }> {
      // Summary
      const summaryResult = await db.query<{
        totalUsd: string;
        totalInputTokens: string;
        totalOutputTokens: string;
        callCount: string;
      }>(
        `SELECT
           COALESCE(SUM(cost_estimate_usd), 0) as "totalUsd",
           COALESCE(SUM(input_tokens), 0) as "totalInputTokens",
           COALESCE(SUM(output_tokens), 0) as "totalOutputTokens",
           COUNT(*) as "callCount"
         FROM provider_calls
         WHERE user_id = $1 AND started_at >= $2 AND started_at < $3`,
        [userId, startDate.toISOString(), endDate.toISOString()],
      );

      // By provider
      const providerResult = await db.query<{
        provider: string;
        totalUsd: string;
        callCount: string;
      }>(
        `SELECT
           provider,
           COALESCE(SUM(cost_estimate_usd), 0) as "totalUsd",
           COUNT(*) as "callCount"
         FROM provider_calls
         WHERE user_id = $1 AND started_at >= $2 AND started_at < $3
         GROUP BY provider
         ORDER BY "totalUsd" DESC`,
        [userId, startDate.toISOString(), endDate.toISOString()],
      );

      // By model
      const modelResult = await db.query<{
        provider: string;
        model: string;
        totalUsd: string;
        inputTokens: string;
        outputTokens: string;
        callCount: string;
      }>(
        `SELECT
           provider,
           model,
           COALESCE(SUM(cost_estimate_usd), 0) as "totalUsd",
           COALESCE(SUM(input_tokens), 0) as "inputTokens",
           COALESCE(SUM(output_tokens), 0) as "outputTokens",
           COUNT(*) as "callCount"
         FROM provider_calls
         WHERE user_id = $1 AND started_at >= $2 AND started_at < $3
         GROUP BY provider, model
         ORDER BY "totalUsd" DESC`,
        [userId, startDate.toISOString(), endDate.toISOString()],
      );

      const summaryRow = summaryResult.rows[0];

      return {
        summary: {
          totalUsd: parseFloat(summaryRow?.totalUsd ?? "0"),
          totalInputTokens: parseInt(summaryRow?.totalInputTokens ?? "0", 10),
          totalOutputTokens: parseInt(summaryRow?.totalOutputTokens ?? "0", 10),
          callCount: parseInt(summaryRow?.callCount ?? "0", 10),
        },
        byProvider: providerResult.rows.map((r) => ({
          provider: r.provider,
          totalUsd: parseFloat(r.totalUsd),
          callCount: parseInt(r.callCount, 10),
        })),
        byModel: modelResult.rows.map((r) => ({
          provider: r.provider,
          model: r.model,
          totalUsd: parseFloat(r.totalUsd),
          inputTokens: parseInt(r.inputTokens, 10),
          outputTokens: parseInt(r.outputTokens, 10),
          callCount: parseInt(r.callCount, 10),
        })),
      };
    },

    async getMonthlyUsage(userId: string): Promise<{
      summary: UsageSummary;
      byProvider: UsageByProvider[];
      byModel: UsageByModel[];
    }> {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

      return this.getUsageByPeriod(userId, startOfMonth, startOfNextMonth);
    },

    async getDailyUsage(userId: string, startDate: Date, endDate: Date): Promise<DailyUsage[]> {
      const result = await db.query<{
        date: string;
        totalUsd: string;
        callCount: string;
      }>(
        `SELECT
           DATE(started_at) as date,
           COALESCE(SUM(cost_estimate_usd), 0) as "totalUsd",
           COUNT(*) as "callCount"
         FROM provider_calls
         WHERE user_id = $1 AND started_at >= $2 AND started_at < $3
         GROUP BY DATE(started_at)
         ORDER BY date`,
        [userId, startDate.toISOString(), endDate.toISOString()],
      );

      return result.rows.map((r) => ({
        date: r.date,
        totalUsd: parseFloat(r.totalUsd),
        callCount: parseInt(r.callCount, 10),
      }));
    },

    /**
     * Get total USD cost for a digest run.
     * Sums costs from triage and deep_summary calls made after the run start time.
     */
    async getDigestRunCosts(
      userId: string,
      runStartedAt: Date,
    ): Promise<{ totalUsd: number; callCount: number }> {
      const result = await db.query<{ totalUsd: string; callCount: string }>(
        `SELECT
           COALESCE(SUM(cost_estimate_usd), 0) as "totalUsd",
           COUNT(*) as "callCount"
         FROM provider_calls
         WHERE user_id = $1
           AND started_at >= $2
           AND purpose IN ('triage', 'triage_batch', 'deep_summary')
           AND status = 'ok'`,
        [userId, runStartedAt.toISOString()],
      );

      const row = result.rows[0];
      return {
        totalUsd: parseFloat(row?.totalUsd ?? "0"),
        callCount: parseInt(row?.callCount ?? "0", 10),
      };
    },

    /**
     * List recent provider calls with filtering.
     * For admin logs page.
     */
    async listRecent(params: ProviderCallListRecentParams): Promise<ProviderCallListItem[]> {
      const { userId, limit = 100, offset = 0, purpose, status, sourceId, hoursAgo = 24 } = params;

      const conditions: string[] = ["user_id = $1", "started_at >= NOW() - $2 * INTERVAL '1 hour'"];
      const values: unknown[] = [userId, hoursAgo];
      let paramIndex = 3;

      if (purpose) {
        conditions.push(`purpose = $${paramIndex}`);
        values.push(purpose);
        paramIndex++;
      }

      if (status) {
        conditions.push(`status = $${paramIndex}`);
        values.push(status);
        paramIndex++;
      }

      if (sourceId) {
        conditions.push(`meta_json->>'sourceId' = $${paramIndex}`);
        values.push(sourceId);
        paramIndex++;
      }

      values.push(limit, offset);

      const result = await db.query<{
        id: string;
        purpose: string;
        provider: string;
        model: string;
        inputTokens: string;
        outputTokens: string;
        costUsd: string;
        status: string;
        error: Record<string, unknown> | null;
        meta: Record<string, unknown>;
        startedAt: Date;
        endedAt: Date | null;
      }>(
        `SELECT
           id,
           purpose,
           provider,
           model,
           input_tokens as "inputTokens",
           output_tokens as "outputTokens",
           COALESCE(cost_estimate_usd, 0) as "costUsd",
           status,
           error_json as error,
           meta_json as meta,
           started_at as "startedAt",
           ended_at as "endedAt"
         FROM provider_calls
         WHERE ${conditions.join(" AND ")}
         ORDER BY started_at DESC
         LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        values,
      );

      return result.rows.map((r) => ({
        id: r.id,
        purpose: r.purpose,
        provider: r.provider,
        model: r.model,
        inputTokens: parseInt(r.inputTokens, 10),
        outputTokens: parseInt(r.outputTokens, 10),
        costUsd: parseFloat(r.costUsd),
        status: r.status,
        error: r.error,
        meta: r.meta,
        startedAt: r.startedAt,
        endedAt: r.endedAt,
      }));
    },

    /**
     * Get error count by purpose.
     * For admin error summary.
     */
    async getErrorSummary(params: ProviderCallErrorSummaryParams): Promise<ErrorSummaryItem[]> {
      const { userId, hoursAgo = 24 } = params;

      const result = await db.query<{
        purpose: string;
        errorCount: string;
        totalCount: string;
      }>(
        `SELECT
           purpose,
           COUNT(*) FILTER (WHERE status = 'error') as "errorCount",
           COUNT(*) as "totalCount"
         FROM provider_calls
         WHERE user_id = $1 AND started_at >= NOW() - $2 * INTERVAL '1 hour'
         GROUP BY purpose
         HAVING COUNT(*) FILTER (WHERE status = 'error') > 0
         ORDER BY "errorCount" DESC`,
        [userId, hoursAgo],
      );

      return result.rows.map((r) => ({
        purpose: r.purpose,
        errorCount: parseInt(r.errorCount, 10),
        totalCount: parseInt(r.totalCount, 10),
      }));
    },
  };
}
