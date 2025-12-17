import { createDb } from "@aharadar/db";
import { runPipelineOnce } from "@aharadar/pipeline";
import { loadRuntimeEnv } from "@aharadar/shared";

export async function adminRunNowCommand(): Promise<void> {
  const env = loadRuntimeEnv();
  const db = createDb(env.databaseUrl);
  try {
    // Temporary cost guardrails for local dev: cap signal search calls per run unless explicitly configured.
    if (!process.env.SIGNAL_MAX_SEARCH_CALLS_PER_RUN) {
      process.env.SIGNAL_MAX_SEARCH_CALLS_PER_RUN = "10";
    }

    const user = await db.users.getOrCreateSingleton();

    const now = new Date();
    const windowEnd = now.toISOString();
    const windowStart = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

    console.log(`Running pipeline (user=${user.id}, window=${windowStart} → ${windowEnd})...`);

    const result = await runPipelineOnce(db, {
      userId: user.id,
      windowStart,
      windowEnd
    });

    console.log("");
    console.log("Ingest summary:");
    console.log(`- sources:    ${result.ingest.totals.sources}`);
    console.log(`- fetched:    ${result.ingest.totals.fetched}`);
    console.log(`- normalized: ${result.ingest.totals.normalized}`);
    console.log(`- upserted:   ${result.ingest.totals.upserted}`);
    console.log(`- inserted:   ${result.ingest.totals.inserted}`);
    console.log(`- errors:     ${result.ingest.totals.errors}`);

    if (result.ingest.perSource.length > 0) {
      console.log("");
      console.log("Per-source:");
      for (const s of result.ingest.perSource) {
        const suffix = s.error ? ` (${s.error.message})` : "";
        console.log(
          `- ${s.sourceType}:${s.sourceName} status=${s.status} fetched=${s.fetched} upserted=${s.upserted} inserted=${s.inserted} errors=${s.errors}${suffix}`
        );
      }
    }

    // Helpful diagnostics: summarize provider-call errors for this run (keyed by windowEnd).
    if (result.ingest.totals.errors > 0) {
      const summary = await db.query<{ error: string | null; count: string }>(
        `select
           error_json->>'message' as error,
           count(*)::text as count
         from provider_calls
         where user_id = $1
           and purpose = 'signal_search'
           and status = 'error'
           and meta_json->>'windowEnd' = $2
         group by 1
         order by count(*) desc
         limit 5`,
        [user.id, windowEnd]
      );

      if (summary.rows.length > 0) {
        console.log("");
        console.log("Signal provider errors (this run):");
        for (const row of summary.rows) {
          console.log(`- ${row.count}× ${row.error ?? "(no message)"}`);
        }
      }
    }

    // Signal usage summary (this run).
    const signalOk = await db.query<{ calls: string; input_tokens: string; output_tokens: string; credits: string }>(
      `select
         count(*)::text as calls,
         coalesce(sum(input_tokens), 0)::text as input_tokens,
         coalesce(sum(output_tokens), 0)::text as output_tokens,
         coalesce(sum(cost_estimate_credits), 0)::text as credits
       from provider_calls
       where user_id = $1
         and purpose = 'signal_search'
         and status = 'ok'
         and meta_json->>'windowEnd' = $2`,
      [user.id, windowEnd]
    );
    const okRow = signalOk.rows[0];
    if (okRow) {
      console.log("");
      console.log("Signal usage (this run):");
      console.log(`- calls: ${okRow.calls} (cap=${process.env.SIGNAL_MAX_SEARCH_CALLS_PER_RUN})`);
      console.log(`- tokens_in: ${okRow.input_tokens}`);
      console.log(`- tokens_out: ${okRow.output_tokens}`);
      console.log(`- cost_estimate_credits: ${okRow.credits}`);
    }
  } finally {
    await db.close();
  }
}

export function adminBudgetsCommand(): void {
  const env = loadRuntimeEnv();
  console.log("Budgets (runtime env):");
  console.log(`- monthlyCredits: ${env.monthlyCredits}`);
  console.log(`- dailyThrottleCredits: ${env.dailyThrottleCredits ?? "(none)"}`);
  console.log(`- defaultTier: ${env.defaultTier}`);
}


