import { createDb } from "@aharadar/db";
import { loadRuntimeEnv } from "@aharadar/shared";

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
    { key: "link", label: "link", maxWidth: 64 },
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

export async function inboxCommand(): Promise<void> {
  const env = loadRuntimeEnv();
  const db = createDb(env.databaseUrl);
  try {
    const user = await db.users.getFirstUser();
    if (!user) {
      console.log("No user found yet. Run `admin:run-now` after creating sources.");
      return;
    }

    const digest = await db.digests.getLatestByUser(user.id);
    if (!digest) {
      console.log("No digests yet. Run `admin:run-now` after creating sources.");
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
      `select
         di.rank,
         di.score,
         di.triage_json,
         ci.source_type,
         ci.title,
         ci.canonical_url,
         ci.metadata_json
       from digest_items di
       join content_items ci on ci.id = di.content_item_id
       where di.digest_id = $1
       order by di.rank asc`,
      [digest.id]
    );

    console.log(`Latest digest (user=${user.id}, window=${digest.window_start} → ${digest.window_end}, mode=${digest.mode}):`);
    const rows: InboxTableRow[] = items.rows.map((item) => {
      const title = normalizeWhitespace(item.title ?? "(no title)");
      const primaryUrl = getPrimaryUrl(item);
      const score = Number.isFinite(item.score) ? item.score.toFixed(3) : String(item.score);
      const triage = asRecord(item.triage_json);
      const ahaScore = asFiniteNumber(triage.aha_score);
      const reasonRaw = asString(triage.reason);
      return {
        rank: String(item.rank),
        score,
        aha: ahaScore !== null ? String(Math.round(ahaScore)) : "-",
        source: item.source_type,
        title,
        link: primaryUrl ?? "",
        reason: reasonRaw ? normalizeWhitespace(reasonRaw) : "",
      };
    });

    if (rows.length === 0) {
      console.log("(no digest items)");
      return;
    }

    printInboxTable(rows);
  } finally {
    await db.close();
  }
}
