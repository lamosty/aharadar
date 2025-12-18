import type { ProviderCallDraft } from "@aharadar/shared";

import type { Queryable } from "../db";

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
           meta_json,
           started_at,
           ended_at,
           status,
           error_json
         ) values (
           $1, $2, $3, $4,
           $5, $6, $7,
           $8::jsonb,
           $9::timestamptz,
           $10::timestamptz,
           $11,
           $12::jsonb
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
          JSON.stringify(draft.meta ?? {}),
          draft.startedAt,
          draft.endedAt ?? null,
          draft.status,
          draft.error ? JSON.stringify(draft.error) : null
        ]
      );
      const row = res.rows[0];
      if (!row) throw new Error("Failed to insert provider_call");
      return row;
    }
  };
}
