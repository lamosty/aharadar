import { createDb } from "@aharadar/db";
import { embedText } from "@aharadar/pipeline";
import type { ProviderCallDraft } from "@aharadar/shared";
import { loadRuntimeEnv } from "@aharadar/shared";

import { resolveTopicForUser } from "../topics";

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value))
    return value as Record<string, unknown>;
  return {};
}

function _asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function clampText(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars - 1)}…`;
}

function formatOsc8Link(label: string, url: string): string {
  const osc = "\u001b]8;;";
  const st = "\u001b\\";
  return `${osc}${url}${st}${label}${osc}${st}`;
}

function getPrimaryUrl(item: {
  canonical_url: string | null;
  metadata_json: Record<string, unknown>;
}): string | null {
  if (item.canonical_url) return item.canonical_url;
  const meta = item.metadata_json;
  const primary = meta.primary_url;
  if (typeof primary === "string" && primary.length > 0) return primary;
  const extracted = meta.extracted_urls;
  if (Array.isArray(extracted) && extracted.length > 0) {
    const first = extracted[0];
    if (typeof first === "string" && first.length > 0) return first;
  }
  return null;
}

function asVectorLiteral(vector: number[]): string {
  return `[${vector.map((n) => (Number.isFinite(n) ? n : 0)).join(",")}]`;
}

type SearchArgs = { topic: string | null; limit: number; query: string };

function parseSearchArgs(args: string[]): SearchArgs {
  let topic: string | null = null;
  let limit = 10;
  const parts: string[] = [];

  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === "--topic") {
      const next = args[i + 1];
      if (!next || String(next).trim().length === 0) {
        throw new Error("Missing --topic value (expected a topic id or name)");
      }
      topic = String(next).trim();
      i += 1;
      continue;
    }
    if (a === "--limit") {
      const next = args[i + 1];
      const parsed = next ? Number.parseInt(next, 10) : Number.NaN;
      if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error("Invalid --limit (expected a positive integer)");
      }
      limit = parsed;
      i += 1;
      continue;
    }
    if (a === "--help" || a === "-h") {
      throw new Error("help");
    }
    parts.push(String(a));
  }

  const query = parts.join(" ").trim();
  if (!query) {
    throw new Error("Missing search query");
  }

  return { topic, limit, query };
}

function printSearchUsage(): void {
  console.log("Usage:");
  console.log('  search [--topic <id-or-name>] [--limit N] "<query>"');
  console.log("");
  console.log("Examples:");
  console.log('  pnpm dev:cli -- search "vector database indexing"');
  console.log('  pnpm dev:cli -- search --topic default "faster ingestion"');
  console.log('  pnpm dev:cli -- search --topic <uuid> --limit 20 "ranking heuristic"');
}

const EXPECTED_DIMS = 1536;

export async function searchCommand(args: string[] = []): Promise<void> {
  const env = loadRuntimeEnv();
  const db = createDb(env.databaseUrl);
  try {
    let parsed: SearchArgs;
    try {
      parsed = parseSearchArgs(args);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === "help") {
        printSearchUsage();
        return;
      }
      console.error(message);
      console.log("");
      printSearchUsage();
      process.exitCode = 1;
      return;
    }

    const user = await db.users.getFirstUser();
    if (!user) {
      console.log("No user found yet. Run `admin:run-now` after creating sources.");
      return;
    }

    const topic = await resolveTopicForUser({ db, userId: user.id, topicArg: parsed.topic });

    const startedAt = new Date().toISOString();
    try {
      const call = await embedText({ text: parsed.query, tier: env.defaultTier });
      const vector = call.vector;

      const endedAt = new Date().toISOString();
      const providerDraft: ProviderCallDraft = {
        userId: user.id,
        purpose: "embedding",
        provider: call.provider,
        model: call.model,
        inputTokens: call.inputTokens,
        outputTokens: 0,
        costEstimateCredits: call.costEstimateCredits,
        meta: {
          kind: "search_query",
          topicId: topic.id,
          query: parsed.query,
          endpoint: call.endpoint,
          dims: EXPECTED_DIMS,
        },
        startedAt,
        endedAt,
        status: "ok",
      };
      try {
        await db.providerCalls.insert(providerDraft);
      } catch (err) {
        console.warn("provider_calls insert failed (search query embedding)", err);
      }

      const limit = Math.max(1, Math.min(50, Math.floor(parsed.limit)));

      const rows = await db.query<{
        content_item_id: string;
        title: string | null;
        canonical_url: string | null;
        metadata_json: Record<string, unknown>;
        source_type: string;
        source_name: string | null;
        similarity: number;
      }>(
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
         select
           ci.id::text as content_item_id,
           ci.title,
           ci.canonical_url,
           ci.metadata_json,
           s.type as source_type,
           s.name as source_name,
           (1 - (e.vector <=> $3::vector))::float8 as similarity
         from embeddings e
         join content_items ci on ci.id = e.content_item_id
         join topic_item_source tis on tis.content_item_id = ci.id
         join sources s on s.id = tis.source_id
         where ci.user_id = $1
           and ci.deleted_at is null
           and ci.duplicate_of_content_item_id is null
           and e.model = $4
           and e.dims = $5
         order by e.vector <=> $3::vector asc
         limit $6`,
        [user.id, topic.id, asVectorLiteral(vector), call.model, EXPECTED_DIMS, limit],
      );

      if (rows.rows.length === 0) {
        console.log(`No semantic results yet for topic "${topic.name}".`);
        console.log(
          "Tip: run `admin:run-now` to ingest items, and ensure the embed stage has run.",
        );
        return;
      }

      console.log(`Search results (topic=${topic.name}, model=${call.model}, limit=${limit}):`);
      for (let i = 0; i < rows.rows.length; i += 1) {
        const r = rows.rows[i]!;
        const title = (r.title ?? "(no title)").replace(/\s+/g, " ").trim();
        const url = getPrimaryUrl({
          canonical_url: r.canonical_url,
          metadata_json: asRecord(r.metadata_json),
        });
        const sim = Number.isFinite(r.similarity) ? r.similarity.toFixed(3) : String(r.similarity);
        const source = r.source_type + (r.source_name ? `:${r.source_name}` : "");
        console.log(`${i + 1}. sim=${sim} [${source}] ${clampText(title, 120)}`);
        if (url) console.log(`   link: ${formatOsc8Link("link", url)}`);
      }
    } catch (err) {
      const endedAt = new Date().toISOString();
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("Missing required env var")) {
        console.warn(`Embeddings disabled: ${message}`);
        console.log("Set embeddings env vars (e.g. OPENAI_EMBED_MODEL) to enable semantic search.");
        return;
      }

      const errObj = err && typeof err === "object" ? (err as Record<string, unknown>) : {};
      try {
        await db.providerCalls.insert({
          userId: user.id,
          purpose: "embedding",
          provider: "openai",
          model: typeof errObj.model === "string" ? (errObj.model as string) : "unknown",
          inputTokens: 0,
          outputTokens: 0,
          costEstimateCredits: 0,
          meta: {
            kind: "search_query",
            topicId: topic.id,
            query: parsed.query,
            endpoint: typeof errObj.endpoint === "string" ? (errObj.endpoint as string) : null,
            dims: EXPECTED_DIMS,
          },
          startedAt,
          endedAt,
          status: "error",
          error: {
            message: err instanceof Error ? err.message : String(err),
            statusCode: errObj.statusCode,
            responseSnippet: errObj.responseSnippet,
          },
        });
      } catch (err) {
        console.warn("provider_calls insert failed (search query embedding error)", err);
      }
      throw err;
    }
  } finally {
    await db.close();
  }
}
