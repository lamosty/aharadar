import { createDb } from "@aharadar/db";
import { runPipelineOnce } from "@aharadar/pipeline";
import { loadRuntimeEnv } from "@aharadar/shared";

export async function adminRunNowCommand(): Promise<void> {
  const env = loadRuntimeEnv();
  const db = createDb(env.databaseUrl);
  try {
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


