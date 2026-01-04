import { createDb } from "@aharadar/db";
import {
  clusterTopicContentItems,
  dedupeTopicContentItems,
  embedTopicContentItems,
  ingestEnabledSources,
  persistDigestFromContentItems,
} from "@aharadar/pipeline";
import { canonicalizeUrl, loadRuntimeEnv, sha256Hex } from "@aharadar/shared";

import { formatTopicList, resolveTopicForUser } from "../topics";

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
  maxDigestItems: number | null;
  sourceTypes: string[];
  sourceIds: string[];
  topic: string | null;
};

type DigestNowOptions = {
  maxItems: number | null;
  sourceTypes: string[];
  sourceIds: string[];
  topic: string | null;
};

type EmbedNowOptions = {
  maxItems: number | null;
  topic: string | null;
};

function splitCsv(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function parseDigestNowArgs(args: string[]): DigestNowOptions {
  let maxItems: number | null = null;
  const sourceTypes: string[] = [];
  const sourceIds: string[] = [];
  let topic: string | null = null;

  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === "--max-items") {
      const next = args[i + 1];
      const parsed = next ? Number.parseInt(next, 10) : Number.NaN;
      if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error("Invalid --max-items (expected a positive integer)");
      }
      maxItems = parsed;
      i += 1;
      continue;
    }
    if (a === "--topic") {
      const next = args[i + 1];
      if (!next || String(next).trim().length === 0) {
        throw new Error("Missing --topic value (expected a topic id or name)");
      }
      topic = String(next).trim();
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

  return { maxItems, sourceTypes, sourceIds, topic };
}

function parseEmbedNowArgs(args: string[]): EmbedNowOptions {
  let maxItems: number | null = null;
  let topic: string | null = null;

  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === "--max-items") {
      const next = args[i + 1];
      const parsed = next ? Number.parseInt(next, 10) : Number.NaN;
      if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error("Invalid --max-items (expected a positive integer)");
      }
      maxItems = parsed;
      i += 1;
      continue;
    }
    if (a === "--topic") {
      const next = args[i + 1];
      if (!next || String(next).trim().length === 0) {
        throw new Error("Missing --topic value (expected a topic id or name)");
      }
      topic = String(next).trim();
      i += 1;
      continue;
    }
    if (a === "--help" || a === "-h") {
      throw new Error("help");
    }
  }

  return { maxItems, topic };
}

function parseRunNowArgs(args: string[]): RunNowOptions {
  let maxItemsPerSource = 50;
  let maxDigestItems: number | null = null;
  const sourceTypes: string[] = [];
  const sourceIds: string[] = [];
  let topic: string | null = null;

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
    if (a === "--max-digest-items") {
      const next = args[i + 1];
      const parsed = next ? Number.parseInt(next, 10) : Number.NaN;
      if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error("Invalid --max-digest-items (expected a positive integer)");
      }
      maxDigestItems = parsed;
      i += 1;
      continue;
    }
    if (a === "--topic") {
      const next = args[i + 1];
      if (!next || String(next).trim().length === 0) {
        throw new Error("Missing --topic value (expected a topic id or name)");
      }
      topic = String(next).trim();
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

  return { maxItemsPerSource, maxDigestItems, sourceTypes, sourceIds, topic };
}

function printRunNowUsage(): void {
  console.log("Usage:");
  console.log(
    "  admin:run-now [--topic <id-or-name>] [--max-items-per-source N] [--max-digest-items N] [--source-type <type>[,<type>...]] [--source-id <uuid>]"
  );
  console.log("");
  console.log("Example:");
  console.log("  pnpm dev:cli -- admin:run-now --topic finance --source-type reddit --max-items-per-source 200");
  console.log("  pnpm dev:cli -- admin:run-now --source-type signal");
}

function printEmbedNowUsage(): void {
  console.log("Usage:");
  console.log("  admin:embed-now [--topic <id-or-name>] [--max-items N]");
  console.log("");
  console.log("Notes:");
  console.log("- Does NOT run ingest (no connector fetch). Embeds existing content_items already in the DB.");
  console.log("- Respects OPENAI_EMBED_MAX_ITEMS_PER_RUN unless overridden with --max-items.");
  console.log("");
  console.log("Example:");
  console.log('  pnpm dev:cli -- admin:embed-now --topic "default"');
}

function printDigestNowUsage(): void {
  console.log("Usage:");
  console.log(
    "  admin:digest-now [--topic <id-or-name>] [--max-items N] [--source-type <type>[,<type>...]] [--source-id <uuid>]"
  );
  console.log("");
  console.log("Notes:");
  console.log("- Does NOT run ingest (no connector fetch). Uses existing content_items already in the DB.");
  console.log("- If --max-items is omitted, uses a dev-friendly default: all candidates (capped).");
  console.log("");
  console.log("Example:");
  console.log("  pnpm dev:cli -- admin:digest-now --source-type reddit");
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
    const topic = await resolveTopicForUser({ db, userId: user.id, topicArg: opts.topic });

    const now = new Date();
    const windowEnd = now.toISOString();
    const windowStart = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

    console.log(
      `Running pipeline (user=${user.id}, topic=${topic.name}, window=${windowStart} → ${windowEnd}, maxItemsPerSource=${opts.maxItemsPerSource})...`
    );

    const ingestFilter =
      opts.sourceTypes.length > 0 || opts.sourceIds.length > 0
        ? {
            onlySourceTypes: opts.sourceTypes.length > 0 ? opts.sourceTypes : undefined,
            onlySourceIds: opts.sourceIds.length > 0 ? opts.sourceIds : undefined,
          }
        : undefined;

    const ingest = await ingestEnabledSources({
      db,
      userId: user.id,
      topicId: topic.id,
      windowStart,
      windowEnd,
      limits: { maxItemsPerSource: opts.maxItemsPerSource },
      filter: ingestFilter,
    });

    const embed = await embedTopicContentItems({
      db,
      userId: user.id,
      topicId: topic.id,
      windowStart,
      windowEnd,
      tier: env.defaultTier,
    });

    const dedupe = await dedupeTopicContentItems({
      db,
      userId: user.id,
      topicId: topic.id,
      windowStart,
      windowEnd,
    });

    const cluster = await clusterTopicContentItems({
      db,
      userId: user.id,
      topicId: topic.id,
      windowStart,
      windowEnd,
    });

    // Dev-friendly default: include "all candidates (capped)" so review doesn't feel broken.
    // Cap matches the digest candidate pool bound (500) to prevent runaway triage/review.
    const digestMaxItemsDefault = Math.min(500, Math.max(20, ingest.totals.upserted));
    const digestMaxItems = opts.maxDigestItems ?? digestMaxItemsDefault;

    const digest = await persistDigestFromContentItems({
      db,
      userId: user.id,
      topicId: topic.id,
      windowStart,
      windowEnd,
      mode: env.defaultTier,
      limits: { maxItems: digestMaxItems },
      filter: ingestFilter,
    });

    console.log("");
    console.log("Ingest summary:");
    console.log(`- sources:    ${ingest.totals.sources}`);
    console.log(`- fetched:    ${ingest.totals.fetched}`);
    console.log(`- normalized: ${ingest.totals.normalized}`);
    console.log(`- upserted:   ${ingest.totals.upserted}`);
    console.log(`- inserted:   ${ingest.totals.inserted}`);
    console.log(`- errors:     ${ingest.totals.errors}`);

    console.log("");
    console.log("Embed summary:");
    console.log(`- attempted:         ${embed.attempted}`);
    console.log(`- embedded:          ${embed.embedded}`);
    console.log(`- updated_hash_only: ${embed.updatedHashOnly}`);
    console.log(`- skipped:           ${embed.skipped}`);
    console.log(`- errors:            ${embed.errors}`);
    console.log(`- provider_calls_ok: ${embed.providerCallsOk}`);
    console.log(`- provider_calls_err:${embed.providerCallsError}`);

    console.log("");
    console.log("Dedupe summary:");
    console.log(`- attempted: ${dedupe.attempted}`);
    console.log(`- matches:   ${dedupe.matches}`);
    console.log(`- deduped:   ${dedupe.deduped}`);

    console.log("");
    console.log("Cluster summary:");
    console.log(`- attempted:           ${cluster.attempted}`);
    console.log(`- attached_to_existing:${cluster.attachedToExisting}`);
    console.log(`- created:             ${cluster.created}`);
    console.log(`- skipped:             ${cluster.skipped}`);
    console.log(`- errors:              ${cluster.errors}`);

    console.log("");
    console.log("Digest summary:");
    if (digest) {
      console.log(`- digest_id: ${digest.digestId}`);
      console.log(`- mode:      ${digest.mode}`);
      console.log(`- topic:     ${topic.name}`);
      console.log(`- items:     ${digest.items} (requested_max_items=${digestMaxItems})`);
    } else {
      console.log("- (no digest created; no candidates in window)");
    }

    if (ingest.perSource.length > 0) {
      console.log("");
      console.log("Per-source:");
      for (const s of ingest.perSource) {
        const suffix = s.error ? ` (${s.error.message})` : "";
        console.log(
          `- ${s.sourceType}:${s.sourceName} status=${s.status} fetched=${s.fetched} upserted=${s.upserted} inserted=${s.inserted} errors=${s.errors}${suffix}`
        );
      }
    }

    // Helpful diagnostics: summarize provider-call errors for this run (keyed by windowEnd).
    if (ingest.totals.errors > 0) {
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

export async function adminEmbedNowCommand(args: string[] = []): Promise<void> {
  const env = loadRuntimeEnv();
  const db = createDb(env.databaseUrl);
  try {
    let opts: EmbedNowOptions;
    try {
      opts = parseEmbedNowArgs(args);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === "help") {
        printEmbedNowUsage();
        return;
      }
      console.error(message);
      console.log("");
      printEmbedNowUsage();
      process.exitCode = 1;
      return;
    }

    const user = await db.users.getOrCreateSingleton();
    const topic = await resolveTopicForUser({ db, userId: user.id, topicArg: opts.topic });

    console.log(`Embedding (no ingest/digest) (user=${user.id}, topic=${topic.name})...`);

    const embed = await embedTopicContentItems({
      db,
      userId: user.id,
      topicId: topic.id,
      tier: env.defaultTier,
      limits: opts.maxItems ? { maxItems: opts.maxItems } : undefined,
    });

    console.log("");
    console.log("Embed summary:");
    console.log(`- attempted:         ${embed.attempted}`);
    console.log(`- embedded:          ${embed.embedded}`);
    console.log(`- updated_hash_only: ${embed.updatedHashOnly}`);
    console.log(`- skipped:           ${embed.skipped}`);
    console.log(`- errors:            ${embed.errors}`);
    console.log(`- provider_calls_ok: ${embed.providerCallsOk}`);
    console.log(`- provider_calls_err:${embed.providerCallsError}`);

    console.log("");
    console.log("Next:");
    console.log(`- semantic search: pnpm dev:cli -- search --topic ${JSON.stringify(topic.name)} "your query"`);
  } finally {
    await db.close();
  }
}

export async function adminDigestNowCommand(args: string[] = []): Promise<void> {
  const env = loadRuntimeEnv();
  const db = createDb(env.databaseUrl);
  try {
    let opts: DigestNowOptions;
    try {
      opts = parseDigestNowArgs(args);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === "help") {
        printDigestNowUsage();
        return;
      }
      console.error(message);
      console.log("");
      printDigestNowUsage();
      process.exitCode = 1;
      return;
    }

    const user = await db.users.getOrCreateSingleton();
    const topic = await resolveTopicForUser({ db, userId: user.id, topicArg: opts.topic });

    const now = new Date();
    const windowEnd = now.toISOString();
    const windowStart = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

    // Dev-friendly default: include "all candidates (capped)" so review/search doesn't feel broken.
    // Candidate definition matches the digest stage (topic-scoped via content_item_sources).
    const candidateCountArgs: unknown[] = [user.id, topic.id, windowStart, windowEnd];
    let filterSql = "";
    if (opts.sourceTypes.length > 0) {
      candidateCountArgs.push(opts.sourceTypes);
      filterSql += ` and s.type = any($${candidateCountArgs.length}::text[])`;
    }
    if (opts.sourceIds.length > 0) {
      candidateCountArgs.push(opts.sourceIds);
      filterSql += ` and s.id = any($${candidateCountArgs.length}::uuid[])`;
    }

    const candidateCountRes = await db.query<{ candidate_count: number }>(
      `with topic_item_source as (
         select distinct on (cis.content_item_id)
           cis.content_item_id,
           cis.source_id
         from content_item_sources cis
         join sources s on s.id = cis.source_id
         where s.user_id = $1
           and s.topic_id = $2::uuid
         order by cis.content_item_id, cis.added_at desc
       )
       select least(count(*), 500)::int as candidate_count
       from content_items ci
       join topic_item_source tis on tis.content_item_id = ci.id
       join sources s on s.id = tis.source_id
       where ci.user_id = $1
         and ci.deleted_at is null
         and ci.duplicate_of_content_item_id is null
         and coalesce(ci.published_at, ci.fetched_at) >= $3::timestamptz
         and coalesce(ci.published_at, ci.fetched_at) < $4::timestamptz
         ${filterSql}`,
      candidateCountArgs
    );
    const candidateCount = candidateCountRes.rows[0]?.candidate_count ?? 0;
    const digestMaxItemsDefault = Math.min(500, Math.max(20, candidateCount));
    const digestMaxItems = opts.maxItems ?? digestMaxItemsDefault;

    console.log(
      `Building digest (no ingest) (user=${user.id}, topic=${topic.name}, window=${windowStart} → ${windowEnd}, maxItems=${digestMaxItems})...`
    );

    // Keep clustering/dedupe reasonably fresh even when re-running digest without ingest.
    const dedupe = await dedupeTopicContentItems({
      db,
      userId: user.id,
      topicId: topic.id,
      windowStart,
      windowEnd,
    });
    const cluster = await clusterTopicContentItems({
      db,
      userId: user.id,
      topicId: topic.id,
      windowStart,
      windowEnd,
    });

    const digest = await persistDigestFromContentItems({
      db,
      userId: user.id,
      topicId: topic.id,
      windowStart,
      windowEnd,
      mode: env.defaultTier,
      limits: { maxItems: digestMaxItems },
      filter:
        opts.sourceTypes.length > 0 || opts.sourceIds.length > 0
          ? {
              onlySourceTypes: opts.sourceTypes.length > 0 ? opts.sourceTypes : undefined,
              onlySourceIds: opts.sourceIds.length > 0 ? opts.sourceIds : undefined,
            }
          : undefined,
    });

    console.log("");
    console.log("Dedupe summary:");
    console.log(`- attempted: ${dedupe.attempted}`);
    console.log(`- matches:   ${dedupe.matches}`);
    console.log(`- deduped:   ${dedupe.deduped}`);

    console.log("");
    console.log("Cluster summary:");
    console.log(`- attempted:           ${cluster.attempted}`);
    console.log(`- attached_to_existing:${cluster.attachedToExisting}`);
    console.log(`- created:             ${cluster.created}`);
    console.log(`- skipped:             ${cluster.skipped}`);
    console.log(`- errors:              ${cluster.errors}`);

    console.log("");
    console.log("Digest summary:");
    if (digest) {
      console.log(`- digest_id: ${digest.digestId}`);
      console.log(`- mode:      ${digest.mode}`);
      console.log(`- topic:     ${topic.name}`);
      console.log(`- items:     ${digest.items}`);
      console.log(`- requested_max_items: ${digestMaxItems}`);
    } else {
      console.log("- (no digest created; no candidates in window)");
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

    const sources = await db.query<{
      id: string;
      is_enabled: boolean;
      type: string;
      name: string;
      config_json: Record<string, unknown> | null;
      topic_name: string | null;
    }>(
      `select s.id, s.is_enabled, s.type, s.name, s.config_json, t.name as topic_name
       from sources s
       join topics t on t.id = s.topic_id
       where s.user_id = $1
       order by s.created_at asc`,
      [user.id]
    );
    if (sources.rows.length === 0) {
      console.log("No sources yet.");
      console.log("");
      console.log("Add one with:");
      console.log(
        '  pnpm dev:cli -- admin:sources-add --type reddit --name "reddit:MachineLearning" --config \'{"subreddits":["MachineLearning"],"listing":"new"}\''
      );
      return;
    }

    console.log(`Sources (${sources.rows.length}):`);
    for (const s of sources.rows) {
      const enabled = s.is_enabled ? "enabled" : "disabled";
      const cfg = JSON.stringify(s.config_json ?? {});
      const topicName = s.topic_name ?? "(unknown topic)";
      console.log(`- ${s.id} ${enabled} ${s.type}:${s.name} config=${truncate(cfg, 240)}`);
      console.log(`  topic: ${topicName}`);
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
    let topicArg: string | null = null;
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
      if (a === "--topic") {
        topicArg = args[i + 1] ? String(args[i + 1]).trim() : null;
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
      console.log("  admin:sources-add --type <type> --name <name> [--topic <id-or-name>] [--config <json>] [--cursor <json>]");
      console.log("");
      console.log("Example (reddit):");
      console.log(
        '  pnpm dev:cli -- admin:sources-add --type reddit --name "reddit:MachineLearning" --config \'{"subreddits":["MachineLearning"],"listing":"new"}\''
      );
      return;
    }

    const topic = await resolveTopicForUser({ db, userId: user.id, topicArg });
    const config = parseJsonObjectFlag(configStr);
    const cursor = parseJsonObjectFlag(cursorStr);
    const res = await db.sources.create({ userId: user.id, topicId: topic.id, type, name, config, cursor, isEnabled: true });

    console.log("Created source:");
    console.log(`- id: ${res.id}`);
    console.log(`- type: ${type}`);
    console.log(`- name: ${name}`);
    console.log(`- topic: ${topic.name}`);
  } finally {
    await db.close();
  }
}

export async function adminTopicsListCommand(): Promise<void> {
  const env = loadRuntimeEnv();
  const db = createDb(env.databaseUrl);
  try {
    const user = await db.users.getOrCreateSingleton();
    await db.topics.getOrCreateDefaultForUser(user.id);
    const topics = await db.topics.listByUser(user.id);
    console.log(`Topics (${topics.length}):`);
    console.log(formatTopicList(topics));
  } finally {
    await db.close();
  }
}

export async function adminTopicsAddCommand(args: string[]): Promise<void> {
  const env = loadRuntimeEnv();
  const db = createDb(env.databaseUrl);
  try {
    const user = await db.users.getOrCreateSingleton();

    let name: string | null = null;
    let description: string | null = null;

    for (let i = 0; i < args.length; i += 1) {
      const a = args[i];
      if (a === "--name") {
        name = args[i + 1] ? String(args[i + 1]).trim() : null;
        i += 1;
        continue;
      }
      if (a === "--description") {
        description = args[i + 1] ? String(args[i + 1]).trim() : null;
        i += 1;
        continue;
      }
      if (a === "--help" || a === "-h") {
        name = null;
      }
    }

    if (!name || name.length === 0) {
      console.log("Usage:");
      console.log("  admin:topics-add --name <name> [--description <text>]");
      console.log("");
      console.log("Example:");
      console.log('  pnpm dev:cli -- admin:topics-add --name "vehicles"');
      return;
    }

    const res = await db.topics.create({ userId: user.id, name, description });
    console.log("Created topic:");
    console.log(`- id: ${res.id}`);
    console.log(`- name: ${name}`);
    if (description) console.log(`- description: ${description}`);
  } finally {
    await db.close();
  }
}

export async function adminSourcesSetTopicCommand(args: string[]): Promise<void> {
  const env = loadRuntimeEnv();
  const db = createDb(env.databaseUrl);
  try {
    const user = await db.users.getOrCreateSingleton();

    let sourceId: string | null = null;
    let topicArg: string | null = null;
    for (let i = 0; i < args.length; i += 1) {
      const a = args[i];
      if (a === "--source-id") {
        sourceId = args[i + 1] ? String(args[i + 1]).trim() : null;
        i += 1;
        continue;
      }
      if (a === "--topic") {
        topicArg = args[i + 1] ? String(args[i + 1]).trim() : null;
        i += 1;
        continue;
      }
    }

    if (!sourceId || !topicArg) {
      console.log("Usage:");
      console.log("  admin:sources-set-topic --source-id <uuid> --topic <id-or-name>");
      console.log("");
      console.log("Tip: list topics with `admin:topics-list` and sources with `admin:sources-list`.");
      return;
    }

    const topic = await resolveTopicForUser({ db, userId: user.id, topicArg });
    await db.sources.updateTopic({ sourceId, topicId: topic.id });
    console.log("Updated source topic:");
    console.log(`- source_id: ${sourceId}`);
    console.log(`- topic: ${topic.name}`);
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
  kind: "post" | "bundle" | "all";
  json: boolean;
  raw: boolean;
  verbose: boolean;
};

function parseSignalDebugArgs(args: string[]): SignalDebugOptions {
  let limit = 50;
  let kind: "post" | "bundle" | "all" = "post";
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
    if (a === "--kind") {
      const next = args[i + 1];
      const v = next ? String(next).trim().toLowerCase() : "";
      if (v === "post" || v === "bundle" || v === "all") {
        kind = v;
      } else {
        throw new Error('Invalid --kind (expected "post", "bundle", or "all")');
      }
      i += 1;
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

  return { limit, kind, json, raw, verbose };
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

function extractXHandleFromPostUrl(url: string | null): string | null {
  if (!url) return null;
  const m = url.match(/\/\/(?:www\.)?(?:x\.com|twitter\.com)\/([A-Za-z0-9_]{1,30})\/status\/\d+/);
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
  kind: string;
  who: string;
  results: string;
  text: string;
  link: string;
};

function printSignalDebugTable(rows: SignalDebugTableRow[]): void {
  const columns: Array<{ key: keyof SignalDebugTableRow; label: string; maxWidth: number }> = [
    { key: "fetched", label: "fetched", maxWidth: 16 },
    { key: "kind", label: "kind", maxWidth: 6 },
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

    let kindSql = "";
    if (opts.kind === "post") kindSql = " and canonical_url is not null";
    if (opts.kind === "bundle") kindSql = " and canonical_url is null";

    const signalItems = await db.query<{
      id: string;
      title: string | null;
      body_text: string | null;
      canonical_url: string | null;
      fetched_at: unknown;
      metadata_json: Record<string, unknown>;
      raw_json: unknown | null;
    }>(
      `select id, title, body_text, canonical_url, fetched_at, metadata_json, raw_json
       from content_items
       where user_id = $1
         and deleted_at is null
         and source_type = 'signal'
         ${kindSql}
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
      const canonicalUrl = asString(row.canonical_url) ?? null;
      const metaKind = asString((meta as Record<string, unknown>).kind);
      const kind = metaKind ?? (canonicalUrl ? "signal_post_v1" : "signal_bundle_v1");
      const signalResults = asSignalResults((meta as Record<string, unknown>).signal_results);
      return {
        id: row.id,
        fetchedAt: row.fetched_at,
        title: row.title,
        kind,
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
        canonicalUrl,
        raw: opts.raw ? row.raw_json : undefined,
      };
    });

    if (opts.json) {
      console.log(
        JSON.stringify(
          {
            userId: user.id,
            generatedAt: new Date().toISOString(),
            kind: opts.kind,
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
      const isPost = item.canonicalUrl !== null;
      const kind = isPost ? "post" : "bundle";
      const handleFromUrl = extractXHandleFromPostUrl(item.canonicalUrl);
      const handleFromQuery = extractXHandleFromQuery(item.query);
      const who = handleFromUrl
        ? `@${handleFromUrl}`
        : handleFromQuery
          ? `@${handleFromQuery}`
          : item.query
            ? clip(item.query, 16)
            : "(signal)";
      const rc = isPost ? 1 : typeof item.resultCount === "number" ? item.resultCount : item.signalResults.length;
      const topTextRaw =
        isPost
          ? typeof item.bodyText === "string"
            ? item.bodyText
            : ""
          : item.signalResults.length > 0
            ? (item.signalResults[0]?.text ?? "")
            : typeof item.bodyText === "string"
              ? item.bodyText
              : "";
      const topText = topTextRaw.replaceAll("\n", " ").trim();
      const link =
        item.primaryUrl && !isXLikeUrl(item.primaryUrl)
          ? item.primaryUrl
          : item.extractedUrls.find((u) => typeof u === "string" && !isXLikeUrl(u)) ??
            item.canonicalUrl ??
            "";
      return {
        fetched: formatShortLocalTimestamp(item.fetchedAt),
        kind,
        who,
        results: String(rc),
        text: topText,
        link,
      };
    });

    console.log(`Signal debug (kind=${opts.kind}, latest ${normalized.length}):`);
    printSignalDebugTable(tableRows);

    if (!opts.verbose) {
      console.log("");
      console.log(
        'Tip: add --verbose to print full results and recent provider calls; use --json for structured output; filter with --kind post|bundle|all. For paging: append `| less -R`.'
      );
      return;
    }

    for (const item of normalized) {
      const q = item.query ?? "(unknown query)";
      const handleFromUrl = extractXHandleFromPostUrl(item.canonicalUrl);
      const handleFromQuery = extractXHandleFromQuery(q);
      const who = handleFromUrl ? `@${handleFromUrl}` : handleFromQuery ? `@${handleFromQuery}` : q;
      const isPost = item.canonicalUrl !== null;
      const rc = isPost ? 1 : typeof item.resultCount === "number" ? item.resultCount : item.signalResults.length;
      const topPost = item.signalResults.length > 0 ? (item.signalResults[0]?.url ?? null) : item.canonicalUrl;
      const primary = item.primaryUrl ?? item.canonicalUrl;

      console.log("");
      console.log(`- kind=${item.kind} who=${who} fetched=${formatShortLocalTimestamp(item.fetchedAt)} results=${rc}`);
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
      } else if (!isPost) {
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

type SignalExplodeOptions = {
  limitBundles: number;
  dryRun: boolean;
  deleteBundles: boolean;
};

function parseSignalExplodeArgs(args: string[]): SignalExplodeOptions {
  let limitBundles = 50;
  let dryRun = false;
  let deleteBundles = false;

  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (a === "--delete-bundles") {
      deleteBundles = true;
      continue;
    }
    if (a === "--limit") {
      const next = args[i + 1];
      const parsed = next ? Number.parseInt(next, 10) : Number.NaN;
      if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error("Invalid --limit (expected a positive integer)");
      }
      limitBundles = parsed;
      i += 1;
      continue;
    }
  }

  return { limitBundles, dryRun, deleteBundles };
}

function looksLikeUrl(s: string): boolean {
  return s.startsWith("http://") || s.startsWith("https://");
}

function extractUrlsFromText(text: string): string[] {
  const matches = text.match(/https?:\/\/[^\s"'<>]+/g) ?? [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of matches) {
    const cleaned = raw.replace(/[)\].,;!?]+$/g, "");
    if (!looksLikeUrl(cleaned)) continue;
    if (seen.has(cleaned)) continue;
    seen.add(cleaned);
    out.push(cleaned);
    if (out.length >= 100) break;
  }
  return out;
}

function parseXStatusId(url: string): string | null {
  const m = url.match(/\/status\/(\d+)/);
  return m ? m[1] ?? null : null;
}

function parseXHandle(url: string): string | null {
  const m = url.match(/\/\/(?:www\.)?(?:x\.com|twitter\.com)\/([A-Za-z0-9_]{1,30})\/status\/\d+/);
  return m ? m[1] ?? null : null;
}

/**
 * Backfill helper: convert existing stored signal bundles (canonical_url is null, metadata.signal_results exists)
 * into per-post `signal_post_v1` content items. This avoids re-calling the signal provider.
 *
 * Notes:
 * - Posts are upserted via canonical URL hash (x.com status URL) and linked back to the same source_id.
 * - New posts will have fresh fetched_at timestamps (because upsert sets fetched_at=now()).
 * - Bundles can optionally be soft-deleted after backfill.
 */
export async function adminSignalExplodeBundlesCommand(args: string[] = []): Promise<void> {
  const opts = parseSignalExplodeArgs(args);
  const env = loadRuntimeEnv();
  const db = createDb(env.databaseUrl);
  try {
    const user = await db.users.getFirstUser();
    if (!user) {
      console.log("No user found yet. Run `admin:run-now` after creating sources.");
      return;
    }

    const bundles = await db.query<{
      id: string;
      source_id: string;
      fetched_at: string;
      metadata_json: Record<string, unknown>;
    }>(
      `select id, source_id, fetched_at::text as fetched_at, metadata_json
       from content_items
       where user_id = $1
         and deleted_at is null
         and source_type = 'signal'
         and canonical_url is null
       order by fetched_at desc
       limit $2`,
      [user.id, opts.limitBundles]
    );

    let bundlesScanned = 0;
    let bundlesMarked = 0;
    let bundlesDeleted = 0;
    let postsAttempted = 0;
    let postsUpserted = 0;
    let postsInserted = 0;
    let errors = 0;

    for (const b of bundles.rows) {
      bundlesScanned += 1;
      const meta = b.metadata_json ?? {};
      const provider = asString((meta as Record<string, unknown>).provider) ?? "x_search";
      const vendor = asString((meta as Record<string, unknown>).vendor) ?? "grok";
      const query = asString((meta as Record<string, unknown>).query) ?? "signal";
      const dayBucket = asString((meta as Record<string, unknown>).day_bucket) ?? b.fetched_at.slice(0, 10);

      const results = asSignalResults((meta as Record<string, unknown>).signal_results);
      if (results.length === 0) continue;

      for (const r of results) {
        const url = r.url;
        if (!url || !looksLikeUrl(url)) continue;
        let canon: string;
        try {
          canon = canonicalizeUrl(url);
        } catch {
          continue;
        }

        const hashUrl = sha256Hex(canon);

        const statusId = parseXStatusId(canon);
        const handle = parseXHandle(canon);
        const text = r.text ? r.text.replaceAll("\n", " ").trim() : null;
        const extractedUrls = text ? extractUrlsFromText(text).filter((u) => u !== canon) : [];
        const primaryUrl = extractedUrls[0] ?? canon;
        const externalId = statusId ?? sha256Hex([provider, vendor, query, dayBucket, canon].join("|"));

        postsAttempted += 1;
        if (opts.dryRun) continue;

        try {
          const upsertRes = await db.contentItems.upsert({
            userId: user.id,
            sourceId: b.source_id,
            sourceType: "signal",
            externalId,
            canonicalUrl: canon,
            title: null,
            bodyText: text,
            author: handle ? `@${handle}` : null,
            publishedAt: null,
            language: null,
            metadata: {
              kind: "signal_post_v1",
              provider,
              vendor,
              query,
              day_bucket: dayBucket,
              window_start: asString((meta as Record<string, unknown>).window_start),
              window_end: asString((meta as Record<string, unknown>).window_end),
              post_url: canon,
              extracted_urls: extractedUrls,
              primary_url: primaryUrl,
              origin_bundle_content_item_id: b.id,
            },
            raw: {
              kind: "signal_post_v1",
              origin_bundle_content_item_id: b.id,
              day_bucket: dayBucket,
            },
            hashUrl,
            hashText: null,
          });
          postsUpserted += 1;
          if (upsertRes.inserted) postsInserted += 1;

          try {
            await db.contentItemSources.upsert({ contentItemId: upsertRes.id, sourceId: b.source_id });
          } catch (err) {
            errors += 1;
            console.warn("content_item_sources upsert failed (signal explode)", err);
          }
        } catch (err) {
          errors += 1;
          console.warn("content_items upsert failed (signal explode)", err);
        }
      }

      if (!opts.dryRun) {
        // Mark the bundle as signal_bundle_v1 for clarity (if it wasn't already).
        try {
          const updated = await db.query<{ updated: boolean }>(
            `update content_items
             set metadata_json = jsonb_set(metadata_json, '{kind}', '"signal_bundle_v1"'::jsonb, true)
             where id = $1::uuid
               and (metadata_json->>'kind') is null
             returning true as updated`,
            [b.id]
          );
          if (updated.rows.length > 0) bundlesMarked += 1;
        } catch (err) {
          errors += 1;
          console.warn("bundle kind mark failed (signal explode)", err);
        }
      }
    }

    if (!opts.dryRun && opts.deleteBundles && bundles.rows.length > 0) {
      try {
        const ids = bundles.rows.map((r) => r.id);
        const res = await db.query<{ id: string }>(
          `update content_items
           set deleted_at = now()
           where id = any($1::uuid[])
           returning id::text as id`,
          [ids]
        );
        bundlesDeleted = res.rows.length;
      } catch (err) {
        errors += 1;
        console.warn("bundle delete failed (signal explode)", err);
      }
    }

    console.log("Signal bundle explode:");
    console.log(`- dry_run:          ${opts.dryRun ? "yes" : "no"}`);
    console.log(`- bundles_scanned:  ${bundlesScanned}`);
    console.log(`- bundles_marked:   ${opts.dryRun ? "(dry-run)" : String(bundlesMarked)}`);
    console.log(`- bundles_deleted:  ${opts.dryRun ? "(dry-run)" : String(bundlesDeleted)}`);
    console.log(`- posts_attempted:  ${postsAttempted}`);
    console.log(`- posts_upserted:   ${opts.dryRun ? "(dry-run)" : String(postsUpserted)}`);
    console.log(`- posts_inserted:   ${opts.dryRun ? "(dry-run)" : String(postsInserted)}`);
    console.log(`- errors:           ${errors}`);
    console.log("");
    console.log("Next:");
    console.log("- Inspect: pnpm dev:cli -- admin:signal-debug --kind post --limit 20 --verbose");
    console.log("- Re-run digest: pnpm dev:cli -- admin:run-now --source-type signal");
  } finally {
    await db.close();
  }
}
