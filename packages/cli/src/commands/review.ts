import { spawn } from "node:child_process";

import { createDb, type Db } from "@aharadar/db";
import type { FeedbackAction } from "@aharadar/shared";
import { loadRuntimeEnv } from "@aharadar/shared";

import { DEFAULT_KEYMAP } from "../ui/keymap";
import { resolveTopicForUser } from "../topics";

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  return {};
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function clip(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars - 1)}…`;
}

function getPrimaryUrl(item: { canonicalUrl: string | null; metadata: Record<string, unknown> }): string | null {
  if (item.canonicalUrl) return item.canonicalUrl;
  const primary = item.metadata.primary_url;
  if (typeof primary === "string" && primary.length > 0) return primary;
  const extracted = item.metadata.extracted_urls;
  if (Array.isArray(extracted) && extracted.length > 0) {
    const first = extracted[0];
    if (typeof first === "string" && first.length > 0) return first;
  }
  return null;
}

function extractSignalQuery(meta: Record<string, unknown>): string | null {
  return asString(meta.query);
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

function openUrlInBrowser(url: string): void {
  const platform = process.platform;
  try {
    if (platform === "darwin") {
      const child = spawn("open", [url], { stdio: "ignore", detached: true });
      child.unref();
      return;
    }
    if (platform === "win32") {
      const child = spawn("cmd", ["/c", "start", "", url], { stdio: "ignore", detached: true });
      child.unref();
      return;
    }
    const child = spawn("xdg-open", [url], { stdio: "ignore", detached: true });
    child.unref();
  } catch {
    // If we can't spawn, the caller can still copy/paste the URL printed in the UI.
  }
}

type ReviewRow = {
  rank: number;
  score: number;
  triage_json: Record<string, unknown> | null;
  // Exactly one is set (per DB constraint), but we load both for clarity:
  content_item_id: string | null;
  cluster_id: string | null;
  // Where feedback should be recorded (content item id, even if the digest row is a cluster):
  feedback_content_item_id: string | null;
  source_type: string | null;
  title: string | null;
  canonical_url: string | null;
  metadata_json: Record<string, unknown> | null;
  last_action: FeedbackAction | null;
};

type ReviewItem = {
  rank: number;
  scoreText: string;
  contentItemIdForFeedback: string | null;
  sourceType: string;
  title: string;
  link: string | null;
  reason: string | null;
  ahaScore: string | null;
  categories: string[];
  signalQuery: string | null;
  signalSnippets: string[];
  triageRaw: Record<string, unknown> | null;
};

type ViewMode = "item" | "details" | "help";

type WhyShownData = {
  targetHasEmbedding: boolean;
  profile:
    | null
    | {
        positiveCount: number;
        negativeCount: number;
        positiveSim: number | null;
        negativeSim: number | null;
      };
  similarLikes: Array<{
    contentItemId: string;
    action: FeedbackAction;
    similarity: number;
    title: string;
    link: string | null;
  }>;
};

type WhyShownState =
  | { status: "loading" }
  | { status: "ready"; data: WhyShownData }
  | { status: "error"; message: string };

async function computeWhyShown(params: {
  db: Db;
  userId: string;
  topicId: string;
  contentItemId: string;
}): Promise<WhyShownData> {
  const target = await params.db.query<{ vector_text: string | null }>(
    `select vector::text as vector_text
     from embeddings
     where content_item_id = $1::uuid
     limit 1`,
    [params.contentItemId]
  );
  const vectorText = target.rows[0]?.vector_text ?? null;
  if (!vectorText) {
    return { targetHasEmbedding: false, profile: null, similarLikes: [] };
  }

  const prof = await params.db.query<{
    positive_count: number;
    negative_count: number;
    positive_sim: number | null;
    negative_sim: number | null;
  }>(
    `select
       positive_count,
       negative_count,
       (case
          when positive_vector is not null then (1 - (positive_vector <=> $3::vector))::float8
          else null
        end) as positive_sim,
       (case
          when negative_vector is not null then (1 - (negative_vector <=> $3::vector))::float8
          else null
        end) as negative_sim
     from topic_preference_profiles
     where user_id = $1::uuid and topic_id = $2::uuid`,
    [params.userId, params.topicId, vectorText]
  );
  const profileRow = prof.rows[0] ?? null;

  const similar = await params.db.query<{
    content_item_id: string;
    action: FeedbackAction;
    similarity: number;
    title: string | null;
    canonical_url: string | null;
    metadata_json: Record<string, unknown>;
  }>(
    `with nn as (
       select
         e.content_item_id,
         (1 - (e.vector <=> $3::vector))::float8 as similarity
       from embeddings e
       where e.content_item_id <> $4::uuid
       order by e.vector <=> $3::vector asc
       limit 50
     ),
     last_feedback as (
       select distinct on (fe.content_item_id)
         fe.content_item_id,
         fe.action
       from feedback_events fe
       where fe.user_id = $1::uuid
       order by fe.content_item_id, fe.created_at desc
     ),
     topic_membership as (
       select distinct cis.content_item_id
       from content_item_sources cis
       join sources s on s.id = cis.source_id
       where s.user_id = $1::uuid
         and s.topic_id = $2::uuid
     ),
     liked_nn as (
       select nn.content_item_id, nn.similarity, lf.action
       from nn
       join last_feedback lf on lf.content_item_id = nn.content_item_id
       join topic_membership tm on tm.content_item_id = nn.content_item_id
       where lf.action in ('like','save')
       order by nn.similarity desc
       limit 3
     )
     select
       lnn.content_item_id::text as content_item_id,
       lnn.action,
       lnn.similarity,
       ci.title,
       ci.canonical_url,
       ci.metadata_json
     from liked_nn lnn
     join content_items ci on ci.id = lnn.content_item_id`,
    [params.userId, params.topicId, vectorText, params.contentItemId]
  );

  const similarLikes = similar.rows.map((r) => {
    const title = normalizeWhitespace(r.title ?? "(no title)");
    const link = getPrimaryUrl({ canonicalUrl: r.canonical_url, metadata: asRecord(r.metadata_json) });
    return {
      contentItemId: r.content_item_id,
      action: r.action,
      similarity: r.similarity,
      title,
      link,
    };
  });

  return {
    targetHasEmbedding: true,
    profile: profileRow
      ? {
          positiveCount: profileRow.positive_count,
          negativeCount: profileRow.negative_count,
          positiveSim: profileRow.positive_sim,
          negativeSim: profileRow.negative_sim,
        }
      : null,
    similarLikes,
  };
}

function formatHeader(params: { idx: number; total: number; digestMode: string }): string {
  return `Review (${params.idx + 1}/${params.total}, mode=${params.digestMode})`;
}

function renderHelp(): void {
  console.clear();
  console.log("Aha Radar — review help");
  console.log("");
  console.log("Keys:");
  console.log(`- ${DEFAULT_KEYMAP.next}/${DEFAULT_KEYMAP.prev}: next/prev`);
  console.log(`- ${DEFAULT_KEYMAP.like}: like`);
  console.log(`- ${DEFAULT_KEYMAP.dislike}: dislike`);
  console.log(`- ${DEFAULT_KEYMAP.save}: save`);
  console.log(`- ${DEFAULT_KEYMAP.skip}: skip`);
  console.log(`- ${DEFAULT_KEYMAP.open}: open link`);
  console.log(`- ${DEFAULT_KEYMAP.why}: details (toggle)`);
  console.log(`- ${DEFAULT_KEYMAP.help}: help`);
  console.log(`- ${DEFAULT_KEYMAP.quit}: quit`);
  console.log("");
  console.log("Notes:");
  console.log("- Feedback is persisted to `feedback_events` immediately.");
  console.log("- Personalization/embeddings will use this data later; collecting it now is still valuable.");
  console.log("");
  console.log("Press any key to return.");
}

function renderItem(params: {
  header: string;
  item: ReviewItem;
  view: ViewMode;
  lastAction: FeedbackAction | null;
  busy: boolean;
  whyShown: WhyShownState | null;
}): void {
  console.clear();
  console.log(params.header);
  console.log("");

  const busySuffix = params.busy ? " (saving…)" : "";
  const lastAction = params.lastAction ? `last_action=${params.lastAction}` : "last_action=-";

  console.log(`rank=${params.item.rank} score=${params.item.scoreText} aha=${params.item.ahaScore ?? "-"} ${lastAction}${busySuffix}`);
  console.log(`source=${params.item.sourceType}`);
  console.log("");

  console.log(`title: ${params.item.title}`);

  if (params.item.signalQuery) {
    console.log(`query: ${params.item.signalQuery}`);
  }

  if (params.item.signalSnippets.length > 0) {
    console.log(`signal: ${clip(params.item.signalSnippets.join(" | "), 240)}`);
  }

  if (params.item.reason) {
    console.log("");
    console.log(`reason: ${params.item.reason}`);
  }

  if (params.item.link) {
    console.log("");
    console.log(`link: ${params.item.link}`);
  }

  console.log("");
  console.log(
    `keys: ${DEFAULT_KEYMAP.like}=like ${DEFAULT_KEYMAP.dislike}=dislike ${DEFAULT_KEYMAP.save}=save ${DEFAULT_KEYMAP.skip}=skip ` +
      `${DEFAULT_KEYMAP.next}/${DEFAULT_KEYMAP.prev}=nav ${DEFAULT_KEYMAP.open}=open ${DEFAULT_KEYMAP.why}=details ${DEFAULT_KEYMAP.help}=help ${DEFAULT_KEYMAP.quit}=quit`
  );

  if (params.view === "details") {
    console.log("");
    console.log("--- details ---");

    console.log("personalization:");
    if (!params.item.contentItemIdForFeedback) {
      console.log("(missing content_item_id for feedback; can't compute embedding-based why-shown)");
    } else if (!params.whyShown) {
      console.log("(loading…)");
    } else if (params.whyShown.status === "loading") {
      console.log("(loading…)");
    } else if (params.whyShown.status === "error") {
      console.log(`(error: ${params.whyShown.message})`);
    } else {
      const data = params.whyShown.data;
      if (!data.targetHasEmbedding) {
        console.log("(no embedding for this item yet; run admin:embed-now)");
      } else if (!data.profile) {
        console.log("(no topic preference profile yet; like/save/dislike a few items)");
      } else {
        const posSim = data.profile.positiveSim;
        const negSim = data.profile.negativeSim;
        const posText = posSim !== null && Number.isFinite(posSim) ? posSim.toFixed(3) : "-";
        const negText = negSim !== null && Number.isFinite(negSim) ? negSim.toFixed(3) : "-";
        const pref =
          posSim !== null && negSim !== null && Number.isFinite(posSim) && Number.isFinite(negSim) ? posSim - negSim : null;
        const prefText = pref !== null && Number.isFinite(pref) ? pref.toFixed(3) : "-";
        console.log(
          `pref_sim=${prefText} (pos_sim=${posText}, pos_n=${data.profile.positiveCount}; neg_sim=${negText}, neg_n=${data.profile.negativeCount})`
        );
      }

      if (data.similarLikes.length > 0) {
        console.log("similar_to_likes:");
        for (const s of data.similarLikes) {
          const sim = Number.isFinite(s.similarity) ? s.similarity.toFixed(3) : String(s.similarity);
          const suffix = s.link ? ` link=${s.link}` : "";
          console.log(`- sim=${sim} action=${s.action} title=${clip(s.title, 140)}${suffix}`);
        }
      } else {
        console.log("similar_to_likes: (none yet)");
      }
    }

    if (params.item.categories.length > 0) {
      console.log(`categories: ${params.item.categories.join(", ")}`);
    }
    if (params.item.triageRaw) {
      console.log("triage_json:");
      console.log(clip(JSON.stringify(params.item.triageRaw, null, 2), 4_000));
    } else {
      console.log("(no triage_json)");
    }
    if (!params.item.contentItemIdForFeedback) {
      console.log("");
      console.log("warning: this digest item has no content_item_id to attach feedback to (likely missing cluster representative).");
    }
  }
}

function normalizeCategories(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const trimmed = entry.trim();
    if (trimmed.length === 0) continue;
    out.push(trimmed);
    if (out.length >= 10) break;
  }
  return out;
}

function resolveReviewItems(rows: ReviewRow[]): ReviewItem[] {
  return rows.map((row) => {
    const scoreText = Number.isFinite(row.score) ? row.score.toFixed(3) : String(row.score);
    const triage = asRecord(row.triage_json);
    const aha = asFiniteNumber(triage.aha_score);
    const reasonRaw = asString(triage.reason);
    const meta = asRecord(row.metadata_json);
    const title = normalizeWhitespace(row.title ?? "(no title)");
    const sourceType = row.source_type ?? "(unknown)";

    return {
      rank: row.rank,
      scoreText,
      contentItemIdForFeedback: row.feedback_content_item_id,
      sourceType,
      title,
      link: getPrimaryUrl({ canonicalUrl: row.canonical_url, metadata: meta }),
      reason: reasonRaw ? normalizeWhitespace(reasonRaw) : null,
      ahaScore: aha !== null ? String(Math.round(aha)) : null,
      categories: normalizeCategories(triage.categories),
      signalQuery: sourceType === "signal" ? extractSignalQuery(meta) : null,
      signalSnippets: sourceType === "signal" ? extractSignalHighlights(meta, 3) : [],
      triageRaw: row.triage_json,
    };
  });
}

function startKeyListener(onKey: (key: string) => void): () => void {
  const stdin = process.stdin;
  if (!stdin.isTTY) {
    throw new Error("review requires an interactive TTY (stdin is not a TTY)");
  }

  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding("utf8");

  const handler = (chunk: string): void => {
    // In raw mode, we can get:
    // - single chars ("j")
    // - escape sequences ("\u001b[A") for arrows
    // - ctrl+c ("\u0003")
    for (const ch of chunk) {
      onKey(ch);
    }
  };

  stdin.on("data", handler);

  return () => {
    stdin.off("data", handler);
    try {
      stdin.setRawMode(false);
    } catch {
      // ignore
    }
    stdin.pause();
  };
}

export async function reviewCommand(args: string[] = []): Promise<void> {
  const env = loadRuntimeEnv();
  const db = createDb(env.databaseUrl);
  try {
    for (const a of args) {
      if (a === "--help" || a === "-h") {
        console.log("Usage:");
        console.log("  review [--topic <id-or-name>]");
        console.log("");
        console.log("Notes:");
        console.log("- Review is topic-scoped; if you have multiple topics, pass --topic.");
        console.log("");
        console.log("Example:");
        console.log('  pnpm dev:cli -- review --topic "default"');
        return;
      }
    }

    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      console.log("review requires an interactive terminal. Try:");
      console.log("  pnpm dev:cli -- inbox");
      process.exitCode = 1;
      return;
    }

    const user = await db.users.getFirstUser();
    if (!user) {
      console.log("No user found yet. Run `admin:run-now` after creating sources.");
      return;
    }

    let topicArg: string | null = null;
    for (let i = 0; i < args.length; i += 1) {
      const a = args[i];
      if (a === "--topic") {
        const next = args[i + 1];
        if (!next || String(next).trim().length === 0) {
          throw new Error("Missing --topic value (expected a topic id or name)");
        }
        topicArg = String(next).trim();
        i += 1;
      }
    }

    const topic = await resolveTopicForUser({ db, userId: user.id, topicArg });
    const digest = await db.digests.getLatestByUserAndTopic({ userId: user.id, topicId: topic.id });
    if (!digest) {
      console.log(`No digests yet for topic "${topic.name}". Run \`admin:run-now\` after creating sources.`);
      return;
    }

    const itemsRes = await db.query<ReviewRow>(
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
         di.content_item_id::text as content_item_id,
         di.cluster_id::text as cluster_id,
         coalesce(di.content_item_id, rep.content_item_id)::text as feedback_content_item_id,
         s.type as source_type,
         ci.title,
         ci.canonical_url,
         ci.metadata_json,
         fe.action as last_action
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
           coalesce(ci2.published_at, ci2.fetched_at) desc
         limit 1
       ) rep on di.cluster_id is not null
       left join content_items ci on ci.id = coalesce(di.content_item_id, rep.content_item_id)
       left join topic_item_source tis on tis.content_item_id = ci.id
       left join sources s on s.id = tis.source_id
       left join lateral (
         select action
         from feedback_events
         where user_id = $2::uuid
           and content_item_id = coalesce(di.content_item_id, rep.content_item_id)
         order by created_at desc
         limit 1
       ) fe on true
       where di.digest_id = $1
       order by di.rank asc`,
      [digest.id, user.id, topic.id, digest.window_start, digest.window_end]
    );

    const reviewed = itemsRes.rows.filter((r) => r.last_action !== null).length;
    const unreviewedRows = itemsRes.rows.filter((r) => r.last_action === null);

    const items = resolveReviewItems(unreviewedRows);
    if (items.length === 0) {
      if (reviewed > 0) {
        console.log(`No unreviewed items left for topic "${topic.name}".`);
        console.log(`- reviewed: ${reviewed}`);
      } else {
        console.log("(no digest items)");
      }
      return;
    }

    const lastActionByRank = new Map<number, FeedbackAction>();
    const whyByContentItemId = new Map<string, WhyShownState>();

    let idx = 0;
    let view: ViewMode = "item";
    let busy = false;

    const render = (): void => {
      const item = items[idx];
      if (!item) return;
      const header = `${formatHeader({ idx, total: items.length, digestMode: digest.mode })} topic=${topic.name}`;
      const lastAction = lastActionByRank.get(item.rank) ?? null;
      const whyShown =
        item.contentItemIdForFeedback && whyByContentItemId.has(item.contentItemIdForFeedback)
          ? (whyByContentItemId.get(item.contentItemIdForFeedback) ?? null)
          : null;
      if (view === "help") {
        renderHelp();
        return;
      }
      renderItem({ header, item, view, lastAction, busy, whyShown });
    };

    const ensureWhyLoaded = (): void => {
      const item = items[idx];
      const contentItemId = item?.contentItemIdForFeedback ?? null;
      if (!contentItemId) return;
      if (whyByContentItemId.has(contentItemId)) return;
      whyByContentItemId.set(contentItemId, { status: "loading" });
      render();
      void (async () => {
        try {
          const data = await computeWhyShown({ db, userId: user.id, topicId: topic.id, contentItemId });
          whyByContentItemId.set(contentItemId, { status: "ready", data });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          whyByContentItemId.set(contentItemId, { status: "error", message });
        }
        render();
      })();
    };

    const recordFeedback = async (action: FeedbackAction): Promise<void> => {
      const item = items[idx];
      if (!item) return;
      if (!item.contentItemIdForFeedback) {
        // Can't persist feedback without a concrete content item id.
        return;
      }

      busy = true;
      render();
      try {
        await db.feedbackEvents.insert({
          userId: user.id,
          digestId: digest.id,
          contentItemId: item.contentItemIdForFeedback,
          action,
        });

        // Update topic-scoped preference profile (best effort).
        if (action === "like" || action === "save" || action === "dislike") {
          try {
            const emb = await db.query<{ vector_text: string | null }>(
              `select vector::text as vector_text
               from embeddings
               where content_item_id = $1::uuid
               limit 1`,
              [item.contentItemIdForFeedback]
            );
            const vecText = emb.rows[0]?.vector_text ?? null;
            if (vecText) {
              const trimmed = vecText.trim();
              if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
                const inner = trimmed.slice(1, -1).trim();
                const parts = inner.length > 0 ? inner.split(",") : [];
                const vector: number[] = [];
                let ok = true;
                for (const p of parts) {
                  const n = Number.parseFloat(p);
                  if (!Number.isFinite(n)) {
                    ok = false;
                    break;
                  }
                  vector.push(n);
                }
                if (ok && vector.length > 0) {
                  await db.topicPreferenceProfiles.applyFeedbackEmbedding({
                    userId: user.id,
                    topicId: topic.id,
                    action,
                    embeddingVector: vector,
                  });
                }
              }
            }
          } catch (err) {
            // Preference updates should never break the review loop.
            console.warn("preference profile update failed", err);
          }
        }
        lastActionByRank.set(item.rank, action);
      } finally {
        busy = false;
      }

      // Auto-advance after recording an action.
      if (idx < items.length - 1) {
        idx += 1;
        view = "item";
        render();
        return;
      }

      console.clear();
      console.log("Review complete.");
      console.log(`- items: ${items.length}`);
      console.log("Tip: re-run `inbox` to see the latest digest again.");
      process.exitCode = 0;
      cleanup();
      done();
    };

    let cleanup: () => void = () => {};
    let done: () => void = () => {};

    const finished = new Promise<void>((resolve) => {
      done = resolve;
    });

    cleanup = startKeyListener((key) => {
      if (busy) return;

      // ctrl+c
      if (key === "\u0003") {
        cleanup();
        console.clear();
        done();
        return;
      }

      // Escape sequences (arrows, etc.)
      if (key === "\u001b") return;

      if (view === "help") {
        view = "item";
        render();
        return;
      }

      if (key === DEFAULT_KEYMAP.quit) {
        cleanup();
        console.clear();
        done();
        return;
      }

      if (key === DEFAULT_KEYMAP.help) {
        view = "help";
        render();
        return;
      }

      if (key === DEFAULT_KEYMAP.why) {
        view = view === "details" ? "item" : "details";
        if (view === "details") ensureWhyLoaded();
        render();
        return;
      }

      if (key === DEFAULT_KEYMAP.next) {
        idx = Math.min(items.length - 1, idx + 1);
        view = "item";
        render();
        return;
      }

      if (key === DEFAULT_KEYMAP.prev) {
        idx = Math.max(0, idx - 1);
        view = "item";
        render();
        return;
      }

      if (key === DEFAULT_KEYMAP.open) {
        const item = items[idx];
        if (item?.link) openUrlInBrowser(item.link);
        return;
      }

      if (key === DEFAULT_KEYMAP.like) {
        void recordFeedback("like");
        return;
      }
      if (key === DEFAULT_KEYMAP.dislike) {
        void recordFeedback("dislike");
        return;
      }
      if (key === DEFAULT_KEYMAP.save) {
        void recordFeedback("save");
        return;
      }
      if (key === DEFAULT_KEYMAP.skip) {
        void recordFeedback("skip");
        return;
      }
    });

    render();
    await finished;
  } finally {
    await db.close();
  }
}
