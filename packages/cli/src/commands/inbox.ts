import { createDb } from "@aharadar/db";
import { loadRuntimeEnv } from "@aharadar/shared";

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
      const url = item.canonical_url ? ` ${item.canonical_url}` : "";
      console.log(`- [${item.source_type}] ${title}${url}`);
    }
  } finally {
    await db.close();
  }
}


