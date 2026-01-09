import type { ProviderCallDraft } from "@aharadar/shared";

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

export function createProviderCallsRepo(db: Queryable) {
  return {
    async insert(draft: ProviderCallDraft): Promise<{ id: string }> {
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
          draft.costEstimateUsd ?? 0,
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
  };
}
