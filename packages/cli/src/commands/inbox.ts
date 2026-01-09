import { createDb } from "@aharadar/db";
import { loadRuntimeEnv } from "@aharadar/shared";

import { resolveTopicForUser } from "../topics";

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  return {};
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function clip(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars - 1)}…`;
}

function padRight(value: string, width: number): string {
  if (value.length >= width) return value;
  return value + " ".repeat(width - value.length);
}

function wrapText(value: string, width: number): string[] {
  const normalized = normalizeWhitespace(value);
  if (normalized.length <= width) return [normalized];

  const words = normalized.split(" ");
  const lines: string[] = [];
  let line = "";

  for (const word of words) {
    if (word.length > width) {
      if (line.length > 0) {
        lines.push(line);
        line = "";
      }
      lines.push(clip(word, width));
      continue;
    }
    if (line.length === 0) {
      line = word;
      continue;
    }
    if (line.length + 1 + word.length <= width) {
      line = `${line} ${word}`;
    } else {
      lines.push(line);
      line = word;
    }
  }

  if (line.length > 0) lines.push(line);
  return lines;
}

function formatOsc8Link(label: string, url: string): string {
  const osc = "\u001b]8;;";
  const st = "\u001b\\";
  return `${osc}${url}${st}${label}${osc}${st}`;
}

function extractSignalHighlights(meta: Record<string, unknown>, limit: number): string[] {
  const results = meta.signal_results;
  if (!Array.isArray(results)) return [];
  const out: string[] = [];
  for (const entry of results) {
    if (!entry || typeof entry !== "object") continue;
    const text = asString((entry as Record<string, unknown>).text);
    if (!text) continue;
    out.push(normalizeWhitespace(text));
    if (out.length >= limit) break;
  }
  return out;
}

function extractSignalQuery(meta: Record<string, unknown>): string | null {
  return asString(meta.query);
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

type InboxCard = {
  rank: number;
  score: string;
  aha: string | null;
  source: string;
  title: string;
  reason: string | null;
  link: string | null;
  signalSnippets: string[];
  signalQuery: string | null;
};

function printInboxCards(rows: InboxCard[]): void {
  const termWidth = process.stdout.columns ?? 120;
  const width = Math.max(60, Math.min(termWidth, 160));
  const indent = 2;
  const contentWidth = Math.max(20, width - indent);

  for (const row of rows) {
    const ahaText = row.aha ?? "-";
    console.log(`${row.rank}. score=${row.score} aha=${ahaText} [${row.source}]`);

    const titleLines = wrapText(`title: ${row.title}`, contentWidth);
    for (const line of titleLines) console.log(" ".repeat(indent) + line);

    if (row.signalQuery) {
      const queryLines = wrapText(`query: ${row.signalQuery}`, contentWidth);
      for (const line of queryLines) console.log(" ".repeat(indent) + line);
    }

    if (row.signalSnippets.length > 0) {
      const combined = row.signalSnippets.join(" | ");
      const signalLines = wrapText(`signal: ${combined}`, contentWidth);
      for (const line of signalLines) console.log(" ".repeat(indent) + line);
    }

    if (row.reason) {
      const reasonLines = wrapText(`reason: ${row.reason}`, contentWidth);
      for (const line of reasonLines) console.log(" ".repeat(indent) + line);
    }

    if (row.link) {
      const linkText = formatOsc8Link("link", row.link);
      console.log(" ".repeat(indent) + `link: ${linkText}`);
    }

    console.log("");
  }
}

type InboxTableRow = {
  rank: string;
  score: string;
  aha: string;
  source: string;
  title: string;
  link: string;
  reason: string;
};

function printInboxTable(rows: InboxTableRow[]): void {
  const columns: Array<{ key: keyof InboxTableRow; label: string; maxWidth: number }> = [
    { key: "rank", label: "rank", maxWidth: 4 },
    { key: "score", label: "score", maxWidth: 6 },
    { key: "aha", label: "aha", maxWidth: 4 },
    { key: "source", label: "source", maxWidth: 10 },
    { key: "title", label: "title", maxWidth: 64 },
    { key: "link", label: "link", maxWidth: 20 },
    { key: "reason", label: "reason", maxWidth: 80 },
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

type InboxView = "cards" | "table";

type InboxArgs = { view: InboxView; topic: string | null };

function parseInboxArgs(args: string[]): InboxArgs {
  let view: InboxView = "cards";
  let topic: string | null = null;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--table") {
      view = "table";
      continue;
    }
    if (arg === "--cards") {
      view = "cards";
      continue;
    }
    if (arg === "--topic") {
      const next = args[i + 1];
      if (!next || String(next).trim().length === 0) {
        throw new Error("Missing --topic value (expected a topic id or name)");
      }
      topic = String(next).trim();
      i += 1;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      throw new Error("help");
    }
  }

  return { view, topic };
}

function printInboxUsage(): void {
  console.log("Usage:");
  console.log("  inbox [--cards|--table] [--topic <id-or-name>]");
  console.log("");
  console.log("Examples:");
  console.log("  pnpm dev:cli -- inbox");
  console.log("  pnpm dev:cli -- inbox --table");
  console.log('  pnpm dev:cli -- inbox --topic "default"');
}

export async function inboxCommand(args: string[] = []): Promise<void> {
  const env = loadRuntimeEnv();
  const db = createDb(env.databaseUrl);
  try {
    let parsed: InboxArgs;
    try {
      parsed = parseInboxArgs(args);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === "help") {
        printInboxUsage();
        return;
      }
      console.error(message);
      console.log("");
      printInboxUsage();
      process.exitCode = 1;
      return;
    }

    const user = await db.users.getFirstUser();
    if (!user) {
      console.log("No user found yet. Run `admin:run-now` after creating sources.");
      return;
    }

    const topic = await resolveTopicForUser({ db, userId: user.id, topicArg: parsed.topic });
    const digest = await db.digests.getLatestByUserAndTopic({ userId: user.id, topicId: topic.id });
    if (!digest) {
      console.log(`No digests yet for topic "${topic.name}". Run \`admin:run-now\` after creating sources.`);
      return;
    }

    const items = await db.query<{
      rank: number;
      score: number;
      triage_json: Record<string, unknown> | null;
      source_type: string;
      title: string | null;
      canonical_url: string | null;
      metadata_json: Record<string, unknown>;
    }>(
      `with topic_item_source as (
         select distinct on (cis.content_item_id)
           cis.content_item_id,
           cis.source_id
         from content_item_sources cis
         join sources s on s.id = cis.source_id
         where s.user_id = $2::uuid
           and s.topic_id = $3::uuid
         order by cis.content_item_id, cis.added_at desc
       )
       select
         di.rank,
         di.score,
         di.triage_json,
         s.type as source_type,
         ci.title,
         ci.canonical_url,
         ci.metadata_json
       from digest_items di
       left join lateral (
         select ci2.id as content_item_id
         from cluster_items cli
         join content_items ci2 on ci2.id = cli.content_item_id
         join topic_item_source tis2 on tis2.content_item_id = ci2.id
         where di.cluster_id is not null
           and cli.cluster_id = di.cluster_id
           and ci2.deleted_at is null
           and ci2.duplicate_of_content_item_id is null
         order by
           (case
              when coalesce(ci2.published_at, ci2.fetched_at) >= $4::timestamptz
               and coalesce(ci2.published_at, ci2.fetched_at) < $5::timestamptz
              then 0 else 1
            end) asc,
           (case when ci2.title is not null then 0 else 1 end) asc,
           coalesce(ci2.published_at, ci2.fetched_at) desc
         limit 1
       ) rep on di.cluster_id is not null
       join content_items ci on ci.id = coalesce(di.content_item_id, rep.content_item_id)
       join topic_item_source tis on tis.content_item_id = ci.id
       join sources s on s.id = tis.source_id
       where di.digest_id = $1
       order by di.rank asc`,
      [digest.id, user.id, topic.id, digest.window_start, digest.window_end]
    );

    console.log(
      `Latest digest (user=${user.id}, topic=${topic.name}, window=${digest.window_start} → ${digest.window_end}, mode=${digest.mode}):`
    );
    const rows: InboxCard[] = items.rows.map((item) => {
      const title = normalizeWhitespace(item.title ?? "(no title)");
      const primaryUrl = getPrimaryUrl(item);
      const score = Number.isFinite(item.score) ? item.score.toFixed(3) : String(item.score);
      const triage = asRecord(item.triage_json);
      const ahaScore = asFiniteNumber(triage.aha_score);
      const reasonRaw = asString(triage.reason);
      const meta = asRecord(item.metadata_json);
      const signalSnippets = item.source_type === "signal" ? extractSignalHighlights(meta, 2) : [];
      const signalQuery = item.source_type === "signal" ? extractSignalQuery(meta) : null;
      return {
        rank: item.rank,
        score,
        aha: ahaScore !== null ? String(Math.round(ahaScore)) : null,
        source: item.source_type,
        title,
        link: primaryUrl,
        reason: reasonRaw ? normalizeWhitespace(reasonRaw) : null,
        signalSnippets,
        signalQuery,
      };
    });

    if (rows.length === 0) {
      console.log("(no digest items)");
      return;
    }

    if (parsed.view === "table") {
      const tableRows: InboxTableRow[] = rows.map((row) => ({
        rank: String(row.rank),
        score: row.score,
        aha: row.aha ?? "-",
        source: row.source,
        title: row.title,
        link: row.link ? formatOsc8Link("link", row.link) : "",
        reason: row.reason ?? "",
      }));
      printInboxTable(tableRows);
      return;
    }

    printInboxCards(rows);
  } finally {
    await db.close();
  }
}
