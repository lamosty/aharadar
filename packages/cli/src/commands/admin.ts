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

type RunNowOptions = {
  maxItemsPerSource: number;
  sourceTypes: string[];
  sourceIds: string[];
};

function splitCsv(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function parseRunNowArgs(args: string[]): RunNowOptions {
  let maxItemsPerSource = 50;
  const sourceTypes: string[] = [];
  const sourceIds: string[] = [];

  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === "--max-items-per-source") {
      const next = args[i + 1];
      const parsed = next ? Number.parseInt(next, 10) : Number.NaN;
      if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error("Invalid --max-items-per-source (expected a positive integer)");
      }
      maxItemsPerSource = parsed;
      i += 1;
      continue;
    }
    if (a === "--source-type") {
      const next = args[i + 1];
      if (!next || String(next).trim().length === 0) {
        throw new Error("Missing --source-type value (expected a source type string)");
      }
      sourceTypes.push(...splitCsv(String(next)));
      i += 1;
      continue;
    }
    if (a === "--source-id") {
      const next = args[i + 1];
      if (!next || String(next).trim().length === 0) {
        throw new Error("Missing --source-id value (expected a source id)");
      }
      sourceIds.push(String(next).trim());
      i += 1;
      continue;
    }
    if (a === "--help" || a === "-h") {
      throw new Error("help");
    }
  }

  return { maxItemsPerSource, sourceTypes, sourceIds };
}

function printRunNowUsage(): void {
  console.log("Usage:");
  console.log("  admin:run-now [--max-items-per-source N] [--source-type <type>[,<type>...]] [--source-id <uuid>]");
  console.log("");
  console.log("Example:");
  console.log("  pnpm dev:cli -- admin:run-now --source-type reddit --max-items-per-source 200");
  console.log("  pnpm dev:cli -- admin:run-now --source-type signal");
}

export async function adminRunNowCommand(args: string[] = []): Promise<void> {
  const env = loadRuntimeEnv();
  const db = createDb(env.databaseUrl);
  try {
    let opts: RunNowOptions;
    try {
      opts = parseRunNowArgs(args);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === "help") {
        printRunNowUsage();
        return;
      }
      console.error(message);
      console.log("");
      printRunNowUsage();
      process.exitCode = 1;
      return;
    }

    const user = await db.users.getOrCreateSingleton();

    const now = new Date();
    const windowEnd = now.toISOString();
    const windowStart = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

    console.log(
      `Running pipeline (user=${user.id}, window=${windowStart} → ${windowEnd}, maxItemsPerSource=${opts.maxItemsPerSource})...`
    );

    const result = await runPipelineOnce(db, {
      userId: user.id,
      windowStart,
      windowEnd,
      ingest: { maxItemsPerSource: opts.maxItemsPerSource },
      ingestFilter:
        opts.sourceTypes.length > 0 || opts.sourceIds.length > 0
          ? {
              onlySourceTypes: opts.sourceTypes.length > 0 ? opts.sourceTypes : undefined,
              onlySourceIds: opts.sourceIds.length > 0 ? opts.sourceIds : undefined,
            }
          : undefined,
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
    const signalOk = await db.query<{
      calls: string;
      input_tokens: string;
      output_tokens: string;
      credits: string;
    }>(
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
      console.log(`- calls: ${okRow.calls} (cap=${process.env.SIGNAL_MAX_SEARCH_CALLS_PER_RUN ?? "(none)"})`);
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

function parseJsonObjectFlag(value: string | null): Record<string, unknown> {
  if (!value) return {};
  const parsed: unknown = JSON.parse(value);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Expected JSON object");
  }
  return parsed as Record<string, unknown>;
}

export async function adminSourcesListCommand(): Promise<void> {
  const env = loadRuntimeEnv();
  const db = createDb(env.databaseUrl);
  try {
    const user = await db.users.getFirstUser();
    if (!user) {
      console.log("No user found yet. Run `admin:run-now` after creating sources.");
      return;
    }

    const sources = await db.sources.listByUser(user.id);
    if (sources.length === 0) {
      console.log("No sources yet.");
      console.log("");
      console.log("Add one with:");
      console.log(
        '  pnpm dev:cli -- admin:sources-add --type reddit --name "reddit:MachineLearning" --config \'{"subreddits":["MachineLearning"],"listing":"new"}\''
      );
      return;
    }

    console.log(`Sources (${sources.length}):`);
    for (const s of sources) {
      const enabled = s.is_enabled ? "enabled" : "disabled";
      const cfg = JSON.stringify(s.config_json ?? {});
      console.log(`- ${s.id} ${enabled} ${s.type}:${s.name} config=${truncate(cfg, 240)}`);
    }
  } finally {
    await db.close();
  }
}

export async function adminSourcesAddCommand(args: string[]): Promise<void> {
  const env = loadRuntimeEnv();
  const db = createDb(env.databaseUrl);
  try {
    const user = await db.users.getOrCreateSingleton();

    let type: string | null = null;
    let name: string | null = null;
    let configStr: string | null = null;
    let cursorStr: string | null = null;

    for (let i = 0; i < args.length; i += 1) {
      const a = args[i];
      if (a === "--type") {
        type = args[i + 1] ? String(args[i + 1]).trim() : null;
        i += 1;
        continue;
      }
      if (a === "--name") {
        name = args[i + 1] ? String(args[i + 1]).trim() : null;
        i += 1;
        continue;
      }
      if (a === "--config") {
        configStr = args[i + 1] ? String(args[i + 1]).trim() : null;
        i += 1;
        continue;
      }
      if (a === "--cursor") {
        cursorStr = args[i + 1] ? String(args[i + 1]).trim() : null;
        i += 1;
        continue;
      }
    }

    if (!type || !name) {
      console.log("Usage:");
      console.log("  admin:sources-add --type <type> --name <name> [--config <json>] [--cursor <json>]");
      console.log("");
      console.log("Example (reddit):");
      console.log(
        '  pnpm dev:cli -- admin:sources-add --type reddit --name "reddit:MachineLearning" --config \'{"subreddits":["MachineLearning"],"listing":"new"}\''
      );
      return;
    }

    const config = parseJsonObjectFlag(configStr);
    const cursor = parseJsonObjectFlag(cursorStr);
    const res = await db.sources.create({ userId: user.id, type, name, config, cursor, isEnabled: true });

    console.log("Created source:");
    console.log(`- id: ${res.id}`);
    console.log(`- type: ${type}`);
    console.log(`- name: ${name}`);
  } finally {
    await db.close();
  }
}

export async function adminSignalResetCursorCommand(args: string[]): Promise<void> {
  const env = loadRuntimeEnv();
  const db = createDb(env.databaseUrl);
  try {
    const user = await db.users.getFirstUser();
    if (!user) {
      console.log("No user found yet. Run `admin:run-now` after creating sources.");
      return;
    }

    let sinceTime: string | null = null;
    for (let i = 0; i < args.length; i += 1) {
      const a = args[i];
      if (a === "--since-time") {
        const v = args[i + 1];
        if (v && v.trim().length > 0) sinceTime = v.trim();
        i += 1;
      }
      if (a === "--clear") {
        sinceTime = null;
      }
    }

    const cursor = sinceTime ? { since_time: sinceTime } : {};
    const res = await db.query<{ id: string; name: string }>(
      `update sources
       set cursor_json = $2::jsonb
       where user_id = $1
         and type = 'signal'
       returning id, name`,
      [user.id, JSON.stringify(cursor)]
    );

    console.log(`Reset cursor for ${res.rows.length} signal source(s).`);
    if (sinceTime) {
      console.log(`- new cursor_json: ${JSON.stringify(cursor)}`);
    } else {
      console.log("- new cursor_json: {}");
    }
    for (const row of res.rows) {
      console.log(`- ${row.id} ${row.name}`);
    }
  } finally {
    await db.close();
  }
}

type SignalDebugOptions = {
  limit: number;
  json: boolean;
  raw: boolean;
  verbose: boolean;
};

function parseSignalDebugArgs(args: string[]): SignalDebugOptions {
  let limit = 50;
  let json = false;
  let raw = false;
  let verbose = false;

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
    if (a === "--verbose") {
      verbose = true;
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

  // raw output is inherently verbose.
  if (raw) verbose = true;

  return { limit, json, raw, verbose };
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

function extractXHandleFromQuery(query: string | null): string | null {
  if (!query) return null;
  const m = query.trim().match(/^from:([A-Za-z0-9_]{1,30})(?:\s|$)/);
  return m ? m[1] : null;
}

function isXLikeUrl(url: string): boolean {
  // Minimal heuristic; avoids being provider-specific elsewhere.
  return url.includes("://x.com/") || url.includes("://twitter.com/");
}

function formatShortLocalTimestamp(value: unknown): string {
  const d =
    value instanceof Date
      ? value
      : typeof value === "string" || typeof value === "number"
        ? new Date(value)
        : null;
  if (!d || !Number.isFinite(d.getTime())) return typeof value === "string" ? value : String(value);
  const yyyy = String(d.getFullYear());
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

function clip(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars - 1)}…`;
}

function padRight(value: string, width: number): string {
  if (value.length >= width) return value;
  return value + " ".repeat(width - value.length);
}

type SignalDebugTableRow = {
  fetched: string;
  who: string;
  results: string;
  text: string;
  link: string;
};

function printSignalDebugTable(rows: SignalDebugTableRow[]): void {
  const columns: Array<{ key: keyof SignalDebugTableRow; label: string; maxWidth: number }> = [
    { key: "fetched", label: "fetched", maxWidth: 16 },
    { key: "who", label: "who", maxWidth: 16 },
    { key: "results", label: "results", maxWidth: 7 },
    { key: "text", label: "text", maxWidth: 100 },
    { key: "link", label: "link", maxWidth: 64 },
  ];

  const widths = columns.map((c) => {
    const max = Math.max(c.label.length, ...rows.map((r) => r[c.key].length));
    return Math.min(max, c.maxWidth);
  });

  const header = columns.map((c, i) => padRight(c.label, widths[i]!)).join("  ");
  const sep = columns.map((_c, i) => "-".repeat(widths[i]!)).join("  ");
  console.log(header);
  console.log(sep);

  for (const row of rows) {
    const line = columns
      .map((c, i) => {
        const raw = row[c.key] ?? "";
        const cell = raw.length > widths[i]! ? clip(raw, widths[i]!) : raw;
        return padRight(cell, widths[i]!);
      })
      .join("  ");
    console.log(line);
  }
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
      fetched_at: unknown;
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
          ? ((meta as Record<string, unknown>).extracted_urls as unknown[]).filter(
              (u) => typeof u === "string"
            )
          : [],
        signalResults,
        bodyText: row.body_text,
        raw: opts.raw ? row.raw_json : undefined,
      };
    });

    if (opts.json) {
      console.log(
        JSON.stringify(
          {
            userId: user.id,
            generatedAt: new Date().toISOString(),
            signalItems: normalized,
            providerCalls: providerCalls.rows,
          },
          null,
          2
        )
      );
      return;
    }

    const tableRows: SignalDebugTableRow[] = normalized.map((item) => {
      const handle = extractXHandleFromQuery(item.query);
      const who = handle ? `@${handle}` : item.query ? clip(item.query, 16) : "(signal)";
      const rc = typeof item.resultCount === "number" ? item.resultCount : item.signalResults.length;
      const topTextRaw =
        item.signalResults.length > 0
          ? (item.signalResults[0]?.text ?? "")
          : typeof item.bodyText === "string"
            ? item.bodyText
            : "";
      const topText = topTextRaw.replaceAll("\n", " ").trim();
      const link =
        item.primaryUrl && !isXLikeUrl(item.primaryUrl)
          ? item.primaryUrl
          : (item.extractedUrls.find((u) => typeof u === "string" && !isXLikeUrl(u)) ?? "");
      return {
        fetched: formatShortLocalTimestamp(item.fetchedAt),
        who,
        results: String(rc),
        text: topText,
        link,
      };
    });

    console.log(`Signal debug (latest ${normalized.length}):`);
    printSignalDebugTable(tableRows);

    if (!opts.verbose) {
      console.log("");
      console.log(
        "Tip: add --verbose to print full results and recent provider calls; use --json for structured output. For paging: append `| less -R`."
      );
      return;
    }

    for (const item of normalized) {
      const q = item.query ?? "(unknown query)";
      const handle = extractXHandleFromQuery(q);
      const who = handle ? `@${handle}` : q;
      const rc = typeof item.resultCount === "number" ? item.resultCount : item.signalResults.length;
      const topPost = item.signalResults.length > 0 ? (item.signalResults[0]?.url ?? null) : null;
      const primary = item.primaryUrl;

      console.log("");
      console.log(`- ${who} fetched=${formatShortLocalTimestamp(item.fetchedAt)} results=${rc}`);
      if (topPost) console.log(`  top_post: ${topPost}`);
      if (primary) console.log(`  primary_url: ${primary}`);

      if (item.extractedUrls.length > 0) {
        const preview = item.extractedUrls.slice(0, 10);
        const suffix =
          item.extractedUrls.length > preview.length
            ? ` (+${item.extractedUrls.length - preview.length} more)`
            : "";
        console.log(`  extracted_urls (${item.extractedUrls.length}): ${preview.join(" ")}${suffix}`);
      }

      if (item.signalResults.length > 0) {
        console.log(`  signal_results (${item.signalResults.length}):`);
        for (let i = 0; i < item.signalResults.length; i += 1) {
          const r = item.signalResults[i]!;
          const date = r.date ?? "?";
          const text = r.text ? r.text.replaceAll("\n", " ").trim() : "(no text)";
          console.log(`    ${i + 1}. ${date} ${text}`);
        }
      } else {
        console.log("  (no parsed signal_results on this item)");
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
        const handle = extractXHandleFromQuery(query);
        const who = handle ? `@${handle}` : query;
        const resultsCount = (meta as Record<string, unknown>).results_count;
        const winEnd = asString((meta as Record<string, unknown>).windowEnd);
        console.log(
          `- ${formatShortLocalTimestamp(c.started_at)} status=${c.status} who=${JSON.stringify(who)} results=${resultsCount ?? "?"} tokens_in=${c.input_tokens} tokens_out=${c.output_tokens} credits=${c.cost_estimate_credits} windowEnd=${winEnd ?? "?"}`
        );
      }
    }
  } finally {
    await db.close();
  }
}
