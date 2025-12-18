import { createDb } from "@aharadar/db";
import { runPipelineOnce } from "@aharadar/pipeline";
import { loadRuntimeEnv } from "@aharadar/shared";

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  return {};
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function truncate(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}…`;
}

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

type SignalDebugOptions = {
  limit: number;
  json: boolean;
  raw: boolean;
};

function parseSignalDebugArgs(args: string[]): SignalDebugOptions {
  let limit = 3;
  let json = false;
  let raw = false;

  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === "--json") {
      json = true;
      continue;
    }
    if (a === "--raw") {
      raw = true;
      continue;
    }
    if (a === "--limit") {
      const next = args[i + 1];
      const parsed = next ? Number.parseInt(next, 10) : Number.NaN;
      if (Number.isFinite(parsed) && parsed > 0) limit = parsed;
      i += 1;
      continue;
    }
  }

  return { limit, json, raw };
}

type SignalResult = { date: string | null; url: string | null; text: string | null };

function asSignalResults(value: unknown): SignalResult[] {
  if (!Array.isArray(value)) return [];
  const out: SignalResult[] = [];
  for (const entry of value) {
    const r = asRecord(entry);
    const date = asString(r.date);
    const url = asString(r.url);
    const text = asString(r.text);
    out.push({ date, url, text });
    if (out.length >= 50) break;
  }
  return out;
}

export async function adminSignalDebugCommand(args: string[]): Promise<void> {
  const opts = parseSignalDebugArgs(args);
  const env = loadRuntimeEnv();
  const db = createDb(env.databaseUrl);
  try {
    const user = await db.users.getFirstUser();
    if (!user) {
      console.log("No user found yet. Run `admin:run-now` after creating sources.");
      return;
    }

    const signalItems = await db.query<{
      id: string;
      title: string | null;
      body_text: string | null;
      fetched_at: string;
      metadata_json: Record<string, unknown>;
      raw_json: unknown | null;
    }>(
      `select id, title, body_text, fetched_at, metadata_json, raw_json
       from content_items
       where user_id = $1
         and deleted_at is null
         and source_type = 'signal'
       order by fetched_at desc
       limit $2`,
      [user.id, opts.limit]
    );

    const providerCalls = await db.query<{
      id: string;
      started_at: string;
      ended_at: string | null;
      status: string;
      input_tokens: number;
      output_tokens: number;
      cost_estimate_credits: string;
      meta_json: Record<string, unknown>;
      error_json: Record<string, unknown> | null;
    }>(
      `select
         id,
         started_at,
         ended_at,
         status,
         input_tokens,
         output_tokens,
         cost_estimate_credits::text as cost_estimate_credits,
         meta_json,
         error_json
       from provider_calls
       where user_id = $1
         and purpose = 'signal_search'
       order by started_at desc
       limit $2`,
      [user.id, Math.max(10, opts.limit * 5)]
    );

    const normalized = signalItems.rows.map((row) => {
      const meta = row.metadata_json ?? {};
      const signalResults = asSignalResults((meta as Record<string, unknown>).signal_results);
      return {
        id: row.id,
        fetchedAt: row.fetched_at,
        title: row.title,
        query: asString((meta as Record<string, unknown>).query),
        dayBucket: asString((meta as Record<string, unknown>).day_bucket),
        windowStart: asString((meta as Record<string, unknown>).window_start),
        windowEnd: asString((meta as Record<string, unknown>).window_end),
        resultCount: (meta as Record<string, unknown>).result_count,
        primaryUrl: asString((meta as Record<string, unknown>).primary_url),
        extractedUrls: Array.isArray((meta as Record<string, unknown>).extracted_urls)
          ? ((meta as Record<string, unknown>).extracted_urls as unknown[]).filter((u) => typeof u === "string")
          : [],
        signalResults,
        bodyText: row.body_text,
        raw: opts.raw ? row.raw_json : undefined
      };
    });

    if (opts.json) {
      console.log(
        JSON.stringify(
          {
            userId: user.id,
            generatedAt: new Date().toISOString(),
            signalItems: normalized,
            providerCalls: providerCalls.rows
          },
          null,
          2
        )
      );
      return;
    }

    console.log(`Signal debug (user=${user.id}, latest signal items=${normalized.length}):`);

    for (const item of normalized) {
      const q = item.query ?? "(unknown query)";
      const rc = item.resultCount ?? item.signalResults.length;
      const p = item.primaryUrl ? ` primary_url=${item.primaryUrl}` : "";
      console.log(``);
      console.log(`- ${item.id} fetched_at=${item.fetchedAt} day=${item.dayBucket ?? "?"} results=${rc} query=${JSON.stringify(q)}${p}`);

      if (item.extractedUrls.length > 0) {
        const preview = item.extractedUrls.slice(0, 10);
        const suffix = item.extractedUrls.length > preview.length ? ` (+${item.extractedUrls.length - preview.length} more)` : "";
        console.log(`  extracted_urls (${item.extractedUrls.length}): ${preview.join(" ")}${suffix}`);
      }

      if (item.signalResults.length > 0) {
        console.log(`  signal_results (${item.signalResults.length}):`);
        for (let i = 0; i < item.signalResults.length; i += 1) {
          const r = item.signalResults[i]!;
          const date = r.date ?? "?";
          const url = r.url ?? "(no url)";
          const text = r.text ? truncate(r.text.replaceAll("\n", " ").trim(), 240) : "(no text)";
          console.log(`    ${i + 1}. ${date} ${url}`);
          console.log(`       ${text}`);
        }
      } else {
        console.log("  (no parsed signal_results on this item; try re-running ingestion or use --raw)");
      }

      if (opts.raw) {
        console.log("  raw_json:");
        console.log(`    ${truncate(JSON.stringify(item.raw ?? null), 2_000)}`);
      }
    }

    if (providerCalls.rows.length > 0) {
      console.log("");
      console.log(`Latest provider_calls (purpose='signal_search', showing ${providerCalls.rows.length}):`);
      for (const c of providerCalls.rows) {
        const meta = c.meta_json ?? {};
        const query = asString((meta as Record<string, unknown>).query) ?? "(unknown query)";
        const resultsCount = (meta as Record<string, unknown>).results_count;
        const winEnd = asString((meta as Record<string, unknown>).windowEnd);
        console.log(
          `- ${c.started_at} status=${c.status} query=${JSON.stringify(query)} results=${resultsCount ?? "?"} tokens_in=${c.input_tokens} tokens_out=${c.output_tokens} credits=${c.cost_estimate_credits} windowEnd=${winEnd ?? "?"}`
        );
      }
    }
  } finally {
    await db.close();
  }
}
