#!/usr/bin/env tsx

/**
 * Cleanup Inbox Items Script
 *
 * Safely removes inbox items from specific topics, with backup.
 *
 * Items EXCLUDED from deletion (protected):
 * - Items with feedback (like/dislike)
 * - Items that are read (stored)
 * - Items with AI summaries
 *
 * Usage: pnpm tsx scripts/cleanup-inbox-items.ts
 */

import { createDb } from "@aharadar/db";
import * as fs from "fs";
import * as path from "path";

const DATABASE_URL =
  process.env.DATABASE_URL || "postgres://aharadar:aharadar_dev_password@localhost:5432/aharadar";
const BACKUP_DIR = process.env.HOME || "/tmp";

// Topics to clean up (case-insensitive match)
const TOPICS_TO_CLEAN = ["investing & finances", "tech news"];

interface ContentItemBackup {
  id: string;
  title: string;
  canonical_url: string | null;
  source_type: string;
  published_at: string | null;
  fetched_at: string;
  author: string | null;
  body_text: string | null;
  metadata_json: unknown;
  topic_name: string;
  source_name: string;
}

async function main() {
  console.log("===========================================");
  console.log("Inbox Items Cleanup Script");
  console.log("===========================================\n");

  const db = createDb(DATABASE_URL);

  try {
    // 1. Find the topics
    console.log("Finding topics...");
    const topicsResult = await db.query<{ id: string; name: string; user_id: string }>(
      `
      SELECT id, name, user_id FROM topics
      WHERE LOWER(name) = ANY($1::text[])
    `,
      [TOPICS_TO_CLEAN.map((t) => t.toLowerCase())],
    );

    if (topicsResult.rows.length === 0) {
      console.log("No matching topics found. Exiting.");
      return;
    }

    console.log(`Found ${topicsResult.rows.length} topics:`);
    for (const topic of topicsResult.rows) {
      console.log(`  - ${topic.name} (${topic.id})`);
    }

    const topicIds = topicsResult.rows.map((t) => t.id);
    const userId = topicsResult.rows[0].user_id;

    // 2. Find inbox items that are safe to delete
    // Inbox = no feedback AND not read
    // Also exclude items with AI summaries
    console.log("\nFinding inbox items to remove (excluding protected items)...");

    const itemsToDelete = await db.query<ContentItemBackup>(
      `
      SELECT
        ci.id,
        ci.title,
        ci.canonical_url,
        ci.source_type,
        ci.published_at::text,
        ci.fetched_at::text,
        ci.author,
        ci.body_text,
        ci.metadata_json,
        t.name as topic_name,
        s.name as source_name
      FROM content_items ci
      JOIN sources s ON s.id = ci.source_id
      JOIN topics t ON t.id = s.topic_id
      WHERE s.topic_id = ANY($2::uuid[])
        AND ci.deleted_at IS NULL
        -- Only inbox items: no feedback AND not read
        AND NOT EXISTS (
          SELECT 1 FROM feedback_events fe
          WHERE fe.content_item_id = ci.id AND fe.user_id = $1
        )
        AND NOT EXISTS (
          SELECT 1 FROM content_item_reads cir
          WHERE cir.content_item_id = ci.id AND cir.user_id = $1
        )
        -- No AI summaries
        AND NOT EXISTS (
          SELECT 1 FROM content_item_summaries cis
          WHERE cis.content_item_id = ci.id AND cis.user_id = $1
        )
      ORDER BY ci.fetched_at DESC
    `,
      [userId, topicIds],
    );

    console.log(`Found ${itemsToDelete.rows.length} items to delete.\n`);

    if (itemsToDelete.rows.length === 0) {
      console.log("No items to delete. All items are protected.");
      return;
    }

    // Show breakdown by topic
    const byTopic = new Map<string, number>();
    for (const item of itemsToDelete.rows) {
      byTopic.set(item.topic_name, (byTopic.get(item.topic_name) || 0) + 1);
    }
    console.log("Items by topic:");
    for (const [topic, count] of byTopic) {
      console.log(`  - ${topic}: ${count} items`);
    }

    // 3. Backup to JSON
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupFile = path.join(BACKUP_DIR, `aharadar-inbox-backup-${timestamp}.json`);

    console.log(`\nBacking up to: ${backupFile}`);

    const backupData = {
      timestamp: new Date().toISOString(),
      topics: TOPICS_TO_CLEAN,
      itemCount: itemsToDelete.rows.length,
      items: itemsToDelete.rows,
    };

    fs.writeFileSync(backupFile, JSON.stringify(backupData, null, 2));
    console.log(`Backup saved (${(fs.statSync(backupFile).size / 1024).toFixed(1)} KB)`);

    // 4. Count protected items (for info)
    const protectedCount = await db.query<{ reason: string; count: string }>(
      `
      WITH topic_items AS (
        SELECT ci.id
        FROM content_items ci
        JOIN sources s ON s.id = ci.source_id
        WHERE s.topic_id = ANY($2::uuid[])
          AND ci.deleted_at IS NULL
      ),
      with_feedback AS (
        SELECT DISTINCT ti.id
        FROM topic_items ti
        JOIN feedback_events fe ON fe.content_item_id = ti.id AND fe.user_id = $1
      ),
      with_reads AS (
        SELECT DISTINCT ti.id
        FROM topic_items ti
        JOIN content_item_reads cir ON cir.content_item_id = ti.id AND cir.user_id = $1
      ),
      with_summaries AS (
        SELECT DISTINCT ti.id
        FROM topic_items ti
        JOIN content_item_summaries cis ON cis.content_item_id = ti.id AND cis.user_id = $1
      )
      SELECT 'feedback' as reason, COUNT(*)::text as count FROM with_feedback
      UNION ALL
      SELECT 'read' as reason, COUNT(*)::text as count FROM with_reads
      UNION ALL
      SELECT 'summary' as reason, COUNT(*)::text as count FROM with_summaries
    `,
      [userId, topicIds],
    );

    console.log("\nProtected items (not deleted):");
    for (const row of protectedCount.rows) {
      console.log(`  - With ${row.reason}: ${row.count}`);
    }

    // 5. Delete items (soft delete via deleted_at)
    console.log("\nDeleting items...");

    const itemIds = itemsToDelete.rows.map((i) => i.id);

    const deleteResult = await db.query(
      `
      UPDATE content_items
      SET deleted_at = NOW()
      WHERE id = ANY($1::uuid[])
    `,
      [itemIds],
    );

    console.log(`Deleted ${deleteResult.rowCount} items (soft delete - deleted_at set).`);

    // 6. Also clean up related digest_items
    const digestCleanup = await db.query(
      `
      DELETE FROM digest_items
      WHERE content_item_id = ANY($1::uuid[])
    `,
      [itemIds],
    );

    console.log(`Cleaned up ${digestCleanup.rowCount} digest_items entries.`);

    console.log("\n===========================================");
    console.log("Cleanup complete!");
    console.log(`Backup file: ${backupFile}`);
    console.log("===========================================");
  } finally {
    await db.close();
  }
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
