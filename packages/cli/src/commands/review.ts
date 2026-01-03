import { spawn } from "node:child_process";

import { createDb } from "@aharadar/db";
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
      `select
         di.rank,
         di.score,
         di.triage_json,
         di.content_item_id::text as content_item_id,
         di.cluster_id::text as cluster_id,
         coalesce(di.content_item_id, cl.representative_content_item_id)::text as feedback_content_item_id,
         coalesce(ci.source_type, rci.source_type)::text as source_type,
         coalesce(ci.title, rci.title) as title,
         coalesce(ci.canonical_url, rci.canonical_url) as canonical_url,
         coalesce(ci.metadata_json, rci.metadata_json) as metadata_json
       from digest_items di
       left join content_items ci on ci.id = di.content_item_id
       left join clusters cl on cl.id = di.cluster_id
       left join content_items rci on rci.id = cl.representative_content_item_id
       where di.digest_id = $1
       order by di.rank asc`,
      [digest.id]
    );

    const items = resolveReviewItems(itemsRes.rows);
    if (items.length === 0) {
      console.log("(no digest items)");
      return;
    }

    const lastActionByRank = new Map<number, FeedbackAction>();

    let idx = 0;
    let view: ViewMode = "item";
    let busy = false;

    const render = (): void => {
      const item = items[idx];
      if (!item) return;
      const header = `${formatHeader({ idx, total: items.length, digestMode: digest.mode })} topic=${topic.name}`;
      const lastAction = lastActionByRank.get(item.rank) ?? null;
      if (view === "help") {
        renderHelp();
        return;
      }
      renderItem({ header, item, view, lastAction, busy });
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
