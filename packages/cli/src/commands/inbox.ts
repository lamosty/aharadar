import { createDb } from "@aharadar/db";
import { loadRuntimeEnv } from "@aharadar/shared";

function truncate(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars - 1)}…`;
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
    for (const item of items.rows) {
      const title = item.title ?? "(no title)";
      const primaryUrl = getPrimaryUrl(item);
      const url = primaryUrl ? ` ${primaryUrl}` : "";
      const score = Number.isFinite(item.score) ? item.score.toFixed(3) : String(item.score);
      const triage = item.triage_json ?? {};
      const ahaScore =
        typeof (triage as Record<string, unknown>).aha_score === "number"
          ? (triage as Record<string, unknown>).aha_score
          : null;
      const reason =
        typeof (triage as Record<string, unknown>).reason === "string"
          ? (triage as Record<string, unknown>).reason
          : null;
      const ahaText = ahaScore !== null ? ` aha=${Math.round(ahaScore)}` : "";
      const reasonText = reason ? ` — ${truncate(reason, 140)}` : "";
      console.log(`${String(item.rank).padStart(2, " ")}. score=${score}${ahaText} [${item.source_type}] ${title}${url}${reasonText}`);
    }
  } finally {
    await db.close();
  }
}
