import type { Db } from "@aharadar/db";
import { createLogger } from "@aharadar/shared";

const log = createLogger({ component: "theme" });

export interface ThemeLimits {
  /** Max number of items to process per run. */
  maxItems: number;
  /** Only consider themes updated within this lookback window (days). */
  themeLookbackDays: number;
  /** Similarity threshold for assigning to an existing theme. */
  similarityThreshold: number;
  /** Whether to update centroid vectors as themes grow. */
  updateCentroid: boolean;
  /** Max items per theme before creating a new one. */
  maxItemsPerTheme: number;
  /** Age threshold (days) after which stricter similarity is required. */
  stricterThresholdAfterDays: number;
  /** Stricter threshold for older themes. */
  stricterSimilarityThreshold: number;
}

export interface ThemeRunResult {
  attempted: number;
  attachedToExisting: number;
  created: number;
  skipped: number;
  errors: number;
}

type CandidateRow = {
  content_item_id: string;
  vector_text: string;
  title: string | null;
};

type NearestThemeRow = {
  theme_id: string;
  centroid_text: string | null;
  member_count: number;
  inbox_count: number;
  similarity: number;
  representative_content_item_id: string | null;
  updated_at: string;
};

function parseIntEnv(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseFloatEnv(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseIsoMs(value: string): number {
  const ms = new Date(value).getTime();
  if (!Number.isFinite(ms)) throw new Error(`Invalid ISO timestamp: ${value}`);
  return ms;
}

function clamp01(x: number): number {
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

function parseVectorText(text: string): number[] | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) return null;
  const inner = trimmed.slice(1, -1).trim();
  if (inner.length === 0) return [];
  const parts = inner.split(",");
  const out: number[] = [];
  for (const p of parts) {
    const n = Number.parseFloat(p);
    if (!Number.isFinite(n)) return null;
    out.push(n);
  }
  return out;
}

function asVectorLiteral(vector: number[]): string {
  return `[${vector.map((n) => (Number.isFinite(n) ? n : 0)).join(",")}]`;
}

/**
 * Group topic-scoped inbox items into themes.
 *
 * Themes use a looser similarity threshold (0.65) than clusters (0.86)
 * to create broader topic-level groupings. Only inbox items (no feedback)
 * are themed - processed items are excluded from theming.
 *
 * Safeguards against theme ballooning:
 * - Lookback window: themes older than N days won't accept new items (default: 7)
 * - Size cap: themes with >= maxItemsPerTheme items create new theme (default: 100)
 * - Stricter threshold: older themes (>3 days) require higher similarity (0.70 vs 0.65)
 * - Inbox-only: only themes with at least 1 inbox item are candidates
 *
 * Algorithm:
 * 1. Select inbox items with embeddings that don't have a theme
 * 2. For each item:
 *    - Query nearest theme centroid from eligible themes (has inbox items, within lookback, under size cap)
 *    - Apply stricter threshold for older themes
 *    - If similarity >= threshold: assign to theme, update centroid incrementally
 *    - Else: create new theme with item as seed
 * 3. Update item_count on affected themes
 */
export async function themeTopicContentItems(params: {
  db: Db;
  userId: string;
  topicId: string;
  windowStart: string;
  windowEnd: string;
  limits?: Partial<ThemeLimits>;
}): Promise<ThemeRunResult> {
  const maxItems =
    params.limits?.maxItems ?? parseIntEnv(process.env.THEME_MAX_ITEMS_PER_RUN) ?? 500;
  const themeLookbackDays =
    params.limits?.themeLookbackDays ?? parseIntEnv(process.env.THEME_LOOKBACK_DAYS) ?? 7;
  const similarityThreshold =
    params.limits?.similarityThreshold ?? parseFloatEnv(process.env.THEME_SIM_THRESHOLD) ?? 0.65;
  const updateCentroid =
    params.limits?.updateCentroid ?? process.env.THEME_UPDATE_CENTROID !== "false";
  const maxItemsPerTheme =
    params.limits?.maxItemsPerTheme ?? parseIntEnv(process.env.THEME_MAX_ITEMS_PER_THEME) ?? 100;
  const stricterThresholdAfterDays =
    params.limits?.stricterThresholdAfterDays ??
    parseIntEnv(process.env.THEME_STRICTER_AFTER_DAYS) ??
    3;
  const stricterSimilarityThreshold =
    params.limits?.stricterSimilarityThreshold ??
    parseFloatEnv(process.env.THEME_STRICTER_THRESHOLD) ??
    0.7;

  const limit = Math.max(0, Math.min(5_000, Math.floor(maxItems)));
  if (limit === 0)
    return { attempted: 0, attachedToExisting: 0, created: 0, skipped: 0, errors: 0 };

  const lookbackStartIso = new Date(
    parseIsoMs(params.windowEnd) - Math.max(0, themeLookbackDays) * 24 * 60 * 60 * 1000,
  ).toISOString();

  const threshold = clamp01(similarityThreshold);

  // Pick topic-scoped, in-window candidates that:
  // - have embeddings
  // - are not marked duplicates
  // - have not yet been themed
  // - have no feedback (inbox items only)
  const candidatesRes = await params.db.query<CandidateRow>(
    `with topic_membership as (
       select distinct cis.content_item_id
       from content_item_sources cis
       join sources s on s.id = cis.source_id
       where s.user_id = $1
         and s.topic_id = $2::uuid
     )
     select
       ci.id::text as content_item_id,
       e.vector::text as vector_text,
       ci.title
     from content_items ci
     join embeddings e on e.content_item_id = ci.id
     join topic_membership tm on tm.content_item_id = ci.id
     where ci.user_id = $1
       and ci.deleted_at is null
       and ci.duplicate_of_content_item_id is null
       and coalesce(ci.published_at, ci.fetched_at) >= $3::timestamptz
       and coalesce(ci.published_at, ci.fetched_at) < $4::timestamptz
       and not exists (
         select 1 from theme_items ti
         where ti.content_item_id = ci.id
       )
       and not exists (
         select 1 from feedback_events fe
         where fe.content_item_id = ci.id
           and fe.user_id = $1
       )
     order by coalesce(ci.published_at, ci.fetched_at) desc
     limit $5`,
    [params.userId, params.topicId, params.windowStart, params.windowEnd, limit],
  );

  const candidates = candidatesRes.rows;
  if (candidates.length === 0)
    return { attempted: 0, attachedToExisting: 0, created: 0, skipped: 0, errors: 0 };

  let attempted = 0;
  let attachedToExisting = 0;
  let created = 0;
  let skipped = 0;
  let errors = 0;

  await params.db.tx(async (tx) => {
    for (const row of candidates) {
      attempted += 1;
      const vectorText = row.vector_text;
      if (!vectorText || vectorText.trim().length === 0) {
        skipped += 1;
        continue;
      }

      try {
        // Find nearest theme centroid within lookback window
        // Only consider themes that:
        // - Have at least 1 inbox item (not "dead" themes)
        // - Updated within lookback window
        // - Have fewer than maxItemsPerTheme items
        const nearest = await tx.query<NearestThemeRow>(
          `select
             t.id::text as theme_id,
             t.centroid_vector::text as centroid_text,
             t.item_count as member_count,
             (
               select count(*)::int
               from theme_items ti_inbox
               join content_items ci_inbox on ci_inbox.id = ti_inbox.content_item_id
               where ti_inbox.theme_id = t.id
                 and ci_inbox.deleted_at is null
                 and not exists (
                   select 1 from feedback_events fe_inbox
                   where fe_inbox.content_item_id = ci_inbox.id
                     and fe_inbox.user_id = $1
                 )
             ) as inbox_count,
             (1 - (t.centroid_vector <=> $2::vector))::float8 as similarity,
             t.representative_content_item_id::text as representative_content_item_id,
             t.updated_at::text as updated_at
           from themes t
           where t.user_id = $1
             and t.topic_id = $3::uuid
             and t.centroid_vector is not null
             and t.updated_at >= $4::timestamptz
             and t.item_count < $5
             and exists (
               select 1
               from theme_items ti_check
               join content_items ci_check on ci_check.id = ti_check.content_item_id
               where ti_check.theme_id = t.id
                 and ci_check.deleted_at is null
                 and not exists (
                   select 1 from feedback_events fe_check
                   where fe_check.content_item_id = ci_check.id
                     and fe_check.user_id = $1
                 )
             )
           order by t.centroid_vector <=> $2::vector asc
           limit 1`,
          [params.userId, vectorText, params.topicId, lookbackStartIso, maxItemsPerTheme],
        );

        const best = nearest.rows[0] ?? null;
        const bestSim = best
          ? Number.isFinite(best.similarity)
            ? (best.similarity as number)
            : 0
          : 0;

        // Apply stricter threshold for older themes
        let effectiveThreshold = threshold;
        if (best?.updated_at) {
          const themeAgeMs = Date.now() - new Date(best.updated_at).getTime();
          const themeAgeDays = themeAgeMs / (24 * 60 * 60 * 1000);
          if (themeAgeDays > stricterThresholdAfterDays) {
            effectiveThreshold = stricterSimilarityThreshold;
          }
        }

        if (!best || bestSim < effectiveThreshold) {
          // Create a new theme anchored by this item
          const label = row.title ? row.title.slice(0, 200) : null;
          const inserted = await tx.query<{ id: string }>(
            `insert into themes (user_id, topic_id, representative_content_item_id, centroid_vector, label, item_count)
             values ($1::uuid, $2::uuid, $3::uuid, $4::vector, $5, 1)
             returning id::text as id`,
            [params.userId, params.topicId, row.content_item_id, vectorText, label],
          );
          const newId = inserted.rows[0]?.id;
          if (!newId) throw new Error("themes insert failed: no id returned");

          await tx.query(
            `insert into theme_items (theme_id, content_item_id, similarity)
             values ($1::uuid, $2::uuid, $3)`,
            [newId, row.content_item_id, 1.0],
          );
          created += 1;
          continue;
        }

        // Attach to existing theme
        const attachRes = await tx.query<{ inserted: boolean }>(
          `insert into theme_items (theme_id, content_item_id, similarity)
           values ($1::uuid, $2::uuid, $3)
           on conflict (theme_id, content_item_id)
           do update set similarity = excluded.similarity
           returning (xmax = 0) as inserted`,
          [best.theme_id, row.content_item_id, bestSim],
        );
        const inserted = attachRes.rows[0]?.inserted ?? false;
        if (!inserted) {
          skipped += 1;
          continue;
        }

        attachedToExisting += 1;

        // Update theme metadata
        await tx.query(
          `update themes set
             updated_at = now(),
             item_count = item_count + 1
           where id = $1::uuid`,
          [best.theme_id],
        );

        // Update representative to prefer titled items
        await tx.query(
          `update themes set representative_content_item_id = (
            select ci.id
            from theme_items ti
            join content_items ci on ci.id = ti.content_item_id
            where ti.theme_id = $1::uuid
              and ci.deleted_at is null
            order by
              (case when ci.title is not null then 0 else 1 end) asc,
              length(coalesce(ci.body_text, '')) desc,
              coalesce(ci.published_at, ci.fetched_at) desc,
              ci.id asc
            limit 1
          ),
          label = (
            select ci.title
            from theme_items ti
            join content_items ci on ci.id = ti.content_item_id
            where ti.theme_id = $1::uuid
              and ci.deleted_at is null
              and ci.title is not null
            order by
              length(coalesce(ci.body_text, '')) desc,
              coalesce(ci.published_at, ci.fetched_at) desc
            limit 1
          )
          where id = $1::uuid`,
          [best.theme_id],
        );

        // Update centroid incrementally
        if (updateCentroid) {
          const centroidText = best.centroid_text;
          const centroidVec = centroidText ? parseVectorText(centroidText) : null;
          const itemVec = parseVectorText(vectorText);
          if (
            !centroidVec ||
            !itemVec ||
            centroidVec.length !== itemVec.length ||
            centroidVec.length === 0
          ) {
            continue;
          }

          const nBefore = Math.max(0, Math.floor(best.member_count));
          const nAfter = nBefore + 1;
          const next: number[] = new Array(itemVec.length);
          for (let i = 0; i < itemVec.length; i += 1) {
            next[i] = (centroidVec[i]! * nBefore + itemVec[i]!) / nAfter;
          }

          await tx.query(
            `update themes
             set centroid_vector = $2::vector,
                 updated_at = now()
             where id = $1::uuid`,
            [best.theme_id, asVectorLiteral(next)],
          );
        }
      } catch (err) {
        errors += 1;
        log.warn(
          { contentItemId: row.content_item_id, err },
          "Theme stage failed for content item",
        );
      }
    }
  });

  return { attempted, attachedToExisting, created, skipped, errors };
}
