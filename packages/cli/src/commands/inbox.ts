import { createDb } from "@aharadar/db";
import { loadRuntimeEnv } from "@aharadar/shared";

function getPrimaryUrl(item: { canonical_url: string | null; metadata_json: Record<string, unknown> }): string | null {
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

    const items = await db.contentItems.listRecentByUser(user.id, 20);
    if (items.length === 0) {
      console.log("Inbox is empty (no ingested items yet).");
      return;
    }

    console.log(`Latest items (user=${user.id}):`);
    for (const item of items) {
      const title = item.title ?? "(no title)";
      const primaryUrl = getPrimaryUrl(item);
      const url = primaryUrl ? ` ${primaryUrl}` : "";
      console.log(`- [${item.source_type}] ${title}${url}`);
    }
  } finally {
    await db.close();
  }
}
