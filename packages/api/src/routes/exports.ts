import type { FastifyInstance } from "fastify";
import { getDb, getSingletonContext } from "../lib/db.js";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_TOP_N = 200;
const DEFAULT_TOP_N = 50;
const MAX_SELECTION_ITEMS = 5000;
const MAX_EXPORT_LINES = 4000;
const MAX_EXPORT_CHARS = 1_200_000;
const EXCERPT_MAX_CHARS = 500;

type ExportMode = "ai_summaries" | "top_n" | "liked_or_bookmarked";
type ExportSort = "best" | "latest" | "trending" | "comments_desc" | "ai_score" | "has_ai_summary";
type TruncateReason = "line_cap" | "char_cap" | "item_cap";

interface FeedDossierExportBody {
  topicId?: string;
  mode?: ExportMode;
  topN?: number;
  sort?: ExportSort;
  includeExcerpt?: boolean;
}

interface ExportItemRow {
  content_item_id: string;
  digest_id: string;
  digest_created_at: string;
  aha_score: number;
  trending_score: number;
  ai_score: number | null;
  triage_json: Record<string, unknown> | null;
  topic_name: string;
  title: string | null;
  body_text: string | null;
  canonical_url: string | null;
  author: string | null;
  published_at: string | null;
  source_type: string;
  metadata_json: Record<string, unknown> | null;
  manual_summary_json: unknown;
  feedback_action: string | null;
  is_bookmarked: boolean;
}

interface ManualSummarySection {
  title: string;
  items: string[];
}

interface ManualSummaryLike {
  one_liner: string | null;
  bullets: string[];
  discussion_highlights: string[];
  sections: ManualSummarySection[];
  why_it_matters: string[];
  risks_or_caveats: string[];
  suggested_followups: string[];
}

function isValidUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_REGEX.test(value);
}

function isExportMode(value: unknown): value is ExportMode {
  return value === "ai_summaries" || value === "top_n" || value === "liked_or_bookmarked";
}

function isExportSort(value: unknown): value is ExportSort {
  return (
    value === "best" ||
    value === "latest" ||
    value === "trending" ||
    value === "comments_desc" ||
    value === "ai_score" ||
    value === "has_ai_summary"
  );
}

function toInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isInteger(parsed)) return parsed;
  }
  return null;
}

function sourceLabel(sourceType: string): string {
  const labels: Record<string, string> = {
    hn: "HN",
    reddit: "Reddit",
    rss: "RSS",
    youtube: "YouTube",
    x_posts: "X",
    signal: "Signal",
  };
  return labels[sourceType] ?? sourceType;
}

function sanitizeInline(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function stringOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? sanitizeInline(item) : null))
    .filter((item): item is string => Boolean(item));
}

function parseManualSummary(value: unknown): ManualSummaryLike | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const obj = value as Record<string, unknown>;

  const sections = Array.isArray(obj.sections)
    ? obj.sections
        .map((entry) => {
          if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
          const section = entry as Record<string, unknown>;
          const title = stringOrNull(section.title);
          const items = stringArray(section.items);
          if (!title || items.length === 0) return null;
          return { title, items };
        })
        .filter((entry): entry is ManualSummarySection => Boolean(entry))
    : [];

  return {
    one_liner: stringOrNull(obj.one_liner),
    bullets: stringArray(obj.bullets),
    discussion_highlights: stringArray(obj.discussion_highlights),
    sections,
    why_it_matters: stringArray(obj.why_it_matters),
    risks_or_caveats: stringArray(obj.risks_or_caveats),
    suggested_followups: stringArray(obj.suggested_followups),
  };
}

function formatDate(value: string | null): string {
  if (!value) return "unknown";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "unknown";
  return parsed.toISOString();
}

function formatScore(value: number | null): string {
  if (typeof value !== "number" || Number.isNaN(value)) return "n/a";
  return value.toFixed(3);
}

function renderReasonIncluded(
  mode: ExportMode,
  row: ExportItemRow,
  rank: number,
  sort: ExportSort,
): string {
  if (mode === "ai_summaries") {
    return "Included because this item has an existing manual AI summary.";
  }

  if (mode === "top_n") {
    return `Included by Top N selection (rank #${rank} by ${sort}).`;
  }

  const reasons: string[] = [];
  if (row.feedback_action === "like") {
    reasons.push("liked");
  }
  if (row.is_bookmarked) {
    reasons.push("bookmarked");
  }
  if (reasons.length === 0) {
    return "Included by liked/bookmarked selector.";
  }
  return `Included because it is ${reasons.join(" and ")}.`;
}

function buildExcerpt(bodyText: string | null): string | null {
  if (!bodyText) return null;
  const normalized = sanitizeInline(bodyText);
  if (normalized.length === 0) return null;
  if (normalized.length <= EXCERPT_MAX_CHARS) return normalized;
  return `${normalized.slice(0, EXCERPT_MAX_CHARS).trim()}...`;
}

function buildItemSection(params: {
  row: ExportItemRow;
  rank: number;
  mode: ExportMode;
  sort: ExportSort;
  includeExcerpt: boolean;
}): string[] {
  const { row, rank, mode, sort, includeExcerpt } = params;
  const summary = parseManualSummary(row.manual_summary_json);

  const title = row.title ? sanitizeInline(row.title) : "(Untitled)";
  const source = sourceLabel(row.source_type);
  const author = row.author ? sanitizeInline(row.author) : "unknown";
  const publishedAt = formatDate(row.published_at);
  const url = row.canonical_url ?? "(none)";

  const lines: string[] = [];
  lines.push(`## Item ${rank}: ${title}`);
  lines.push(`- Item ID: \`${row.content_item_id}\``);
  lines.push(`- Source: ${source}`);
  lines.push(`- Author: ${author}`);
  lines.push(`- Topic: ${sanitizeInline(row.topic_name)}`);
  lines.push(`- Published: ${publishedAt}`);
  lines.push(`- URL: ${url}`);
  lines.push(`- Why included: ${renderReasonIncluded(mode, row, rank, sort)}`);
  lines.push(
    `- Scores: aha=${formatScore(row.aha_score)}, trending=${formatScore(row.trending_score)}, ai_score=${formatScore(row.ai_score)}`,
  );
  lines.push("");

  if (!summary) {
    lines.push("**Summary:** Missing or invalid summary payload.");
    lines.push("");
    return lines;
  }

  if (summary.one_liner) {
    lines.push(`**One-liner:** ${summary.one_liner}`);
    lines.push("");
  }

  if (summary.bullets.length > 0) {
    lines.push("**Key points:**");
    for (const bullet of summary.bullets) {
      lines.push(`- ${bullet}`);
    }
    lines.push("");
  }

  if (summary.discussion_highlights.length > 0) {
    lines.push("**Discussion highlights:**");
    for (const highlight of summary.discussion_highlights) {
      lines.push(`- ${highlight}`);
    }
    lines.push("");
  }

  if (summary.sections.length > 0) {
    for (const section of summary.sections) {
      lines.push(`**${sanitizeInline(section.title)}:**`);
      for (const item of section.items) {
        lines.push(`- ${item}`);
      }
      lines.push("");
    }
  }

  if (summary.why_it_matters.length > 0) {
    lines.push("**Why it matters:**");
    for (const entry of summary.why_it_matters) {
      lines.push(`- ${entry}`);
    }
    lines.push("");
  }

  if (summary.risks_or_caveats.length > 0) {
    lines.push("**Risks or caveats:**");
    for (const entry of summary.risks_or_caveats) {
      lines.push(`- ${entry}`);
    }
    lines.push("");
  }

  if (summary.suggested_followups.length > 0) {
    lines.push("**Suggested follow-ups:**");
    for (const entry of summary.suggested_followups) {
      lines.push(`- ${entry}`);
    }
    lines.push("");
  }

  if (includeExcerpt) {
    const excerpt = buildExcerpt(row.body_text);
    if (excerpt) {
      lines.push(`**Short excerpt:** ${excerpt}`);
      lines.push("");
    }
  }

  return lines;
}

function renderPromptTail(): string[] {
  return [
    "---",
    "",
    "## Continue Research Prompt",
    "",
    "Use this dossier as source context.",
    "",
    "1. Build a synthesis of the strongest themes and disagreements.",
    "2. Identify assumptions that need verification and list concrete checks.",
    "3. Propose next-step research questions ranked by expected value.",
    "4. For each recommendation, cite the item IDs used.",
    "5. Call out missing evidence and what additional data would change the conclusion.",
    "",
    "Output format:",
    "- Executive summary",
    "- Evidence map by theme",
    "- Open questions",
    "- Next actions",
    "",
  ];
}

function sortLabel(sort: ExportSort): string {
  const labels: Record<ExportSort, string> = {
    best: "best",
    latest: "latest",
    trending: "trending",
    comments_desc: "comments_desc",
    ai_score: "ai_score",
    has_ai_summary: "has_ai_summary",
  };
  return labels[sort];
}

function modeLabel(mode: ExportMode): string {
  const labels: Record<ExportMode, string> = {
    ai_summaries: "items with AI summary",
    top_n: "top N",
    liked_or_bookmarked: "liked or bookmarked",
  };
  return labels[mode];
}

const COMMENTS_COUNT_SQL = `
  CASE
    WHEN ci.source_type = 'reddit' AND (ci.metadata_json->>'num_comments') ~ '^[0-9]+$'
      THEN (ci.metadata_json->>'num_comments')::int
    WHEN ci.source_type = 'hn' AND (ci.metadata_json->>'descendants') ~ '^[0-9]+$'
      THEN (ci.metadata_json->>'descendants')::int
    ELSE 0
  END
`;

function orderByClause(sort: ExportSort): string {
  switch (sort) {
    case "latest":
      return "base.published_at DESC NULLS LAST, base.digest_created_at DESC, base.content_item_id DESC";
    case "trending":
      return "base.trending_score DESC, base.content_item_id DESC";
    case "comments_desc":
      return "base.comments_count DESC, base.aha_score DESC, base.content_item_id DESC";
    case "ai_score":
      return "base.ai_score DESC NULLS LAST, base.content_item_id DESC";
    case "has_ai_summary":
      return "CASE WHEN base.manual_summary_json IS NOT NULL THEN 0 ELSE 1 END ASC, base.aha_score DESC, base.content_item_id DESC";
    default:
      return "base.aha_score DESC, base.content_item_id DESC";
  }
}

export async function exportsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post<{ Body: FeedDossierExportBody }>("/exports/feed-dossier", async (request, reply) => {
    const ctx = await getSingletonContext();
    if (!ctx) {
      return reply.code(503).send({
        ok: false,
        error: {
          code: "NOT_INITIALIZED",
          message: "Database not initialized: no user or topic found",
        },
      });
    }

    const body = request.body as unknown;
    if (!body || typeof body !== "object") {
      return reply.code(400).send({
        ok: false,
        error: {
          code: "INVALID_BODY",
          message: "Request body must be a JSON object",
        },
      });
    }

    const payload = body as FeedDossierExportBody;
    if (payload.mode !== undefined && !isExportMode(payload.mode)) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: "INVALID_PARAM",
          message: "mode must be one of ai_summaries, top_n, liked_or_bookmarked",
        },
      });
    }
    if (payload.sort !== undefined && !isExportSort(payload.sort)) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: "INVALID_PARAM",
          message:
            "sort must be one of best, latest, trending, comments_desc, ai_score, has_ai_summary",
        },
      });
    }

    const mode = payload.mode ?? "ai_summaries";
    const sort = payload.sort ?? "best";
    const includeExcerpt = payload.includeExcerpt !== false;
    const topN = mode === "top_n" ? (toInt(payload.topN) ?? DEFAULT_TOP_N) : null;

    if (mode === "top_n" && (topN === null || topN < 1 || topN > MAX_TOP_N)) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: "INVALID_PARAM",
          message: `topN must be an integer between 1 and ${MAX_TOP_N} when mode is top_n`,
        },
      });
    }

    let effectiveTopicId: string | null = ctx.topicId;
    const requestedTopicId = payload.topicId;
    if (requestedTopicId === "all") {
      effectiveTopicId = null;
    } else if (requestedTopicId !== undefined) {
      if (!isValidUuid(requestedTopicId)) {
        return reply.code(400).send({
          ok: false,
          error: {
            code: "INVALID_PARAM",
            message: "topicId must be a valid UUID or 'all'",
          },
        });
      }

      const db = getDb();
      const topic = await db.topics.getById(requestedTopicId);
      if (!topic) {
        return reply.code(404).send({
          ok: false,
          error: {
            code: "NOT_FOUND",
            message: `Topic not found: ${requestedTopicId}`,
          },
        });
      }
      if (topic.user_id !== ctx.userId) {
        return reply.code(403).send({
          ok: false,
          error: {
            code: "FORBIDDEN",
            message: "Topic does not belong to current user",
          },
        });
      }

      effectiveTopicId = requestedTopicId;
    }

    const db = getDb();

    let decayHours = 24;
    if (effectiveTopicId) {
      const topic = await db.topics.getById(effectiveTopicId);
      if (topic?.decay_hours) {
        decayHours = topic.decay_hours;
      }
    }

    const params: unknown[] = [ctx.userId, decayHours];
    const topicFilterClause =
      effectiveTopicId !== null
        ? (() => {
            params.push(effectiveTopicId);
            return `AND d.topic_id = $${params.length}::uuid`;
          })()
        : "";

    const selectionFilterParts: string[] = [];
    if (mode === "ai_summaries") {
      selectionFilterParts.push("base.manual_summary_json IS NOT NULL");
    }
    if (mode === "liked_or_bookmarked") {
      selectionFilterParts.push("(base.feedback_action = 'like' OR base.is_bookmarked = true)");
    }
    const selectionFilterClause =
      selectionFilterParts.length > 0 ? selectionFilterParts.join(" AND ") : "true";

    const orderBy = orderByClause(sort);

    const countQuery = `
      WITH latest_items AS (
        SELECT DISTINCT ON (COALESCE(di.content_item_id, c.representative_content_item_id))
          COALESCE(di.content_item_id, c.representative_content_item_id) as content_item_id,
          di.digest_id,
          di.aha_score,
          di.triage_json,
          d.created_at as digest_created_at,
          d.topic_id
        FROM digest_items di
        JOIN digests d ON d.id = di.digest_id
        LEFT JOIN clusters c ON c.id = di.cluster_id
        JOIN content_items ci_inner ON ci_inner.id = COALESCE(di.content_item_id, c.representative_content_item_id)
        WHERE (di.content_item_id IS NOT NULL OR c.representative_content_item_id IS NOT NULL)
          AND d.user_id = $1::uuid
          ${topicFilterClause}
        ORDER BY COALESCE(di.content_item_id, c.representative_content_item_id), d.created_at DESC
      ),
      base AS (
        SELECT
          li.content_item_id::text as content_item_id,
          li.digest_id::text as digest_id,
          li.digest_created_at::text as digest_created_at,
          li.aha_score,
          (li.aha_score * EXP(
            -GREATEST(0, EXTRACT(EPOCH FROM (NOW() - COALESCE(ci.published_at, li.digest_created_at))) / 3600.0)
            / GREATEST(1, $2::float)
          ))::real as trending_score,
          ${COMMENTS_COUNT_SQL} as comments_count,
          (li.triage_json->>'ai_score')::float8 as ai_score,
          li.triage_json,
          t.name as topic_name,
          ci.title,
          ci.body_text,
          ci.canonical_url,
          ci.author,
          ci.published_at,
          ci.source_type,
          ci.metadata_json,
          cis.summary_json as manual_summary_json,
          fe.action as feedback_action,
          (b.content_item_id IS NOT NULL) as is_bookmarked
        FROM latest_items li
        JOIN content_items ci ON ci.id = li.content_item_id
        JOIN topics t ON t.id = li.topic_id
        LEFT JOIN content_item_summaries cis
          ON cis.user_id = $1::uuid AND cis.content_item_id = li.content_item_id
        LEFT JOIN LATERAL (
          SELECT action FROM feedback_events
          WHERE user_id = $1::uuid AND content_item_id = li.content_item_id
          ORDER BY created_at DESC
          LIMIT 1
        ) fe ON true
        LEFT JOIN bookmarks b
          ON b.user_id = $1::uuid AND b.content_item_id = li.content_item_id
        WHERE ci.deleted_at IS NULL
      )
      SELECT count(*)::int as total
      FROM base
      WHERE ${selectionFilterClause}
    `;

    const countResult = await db.query<{ total: number }>(countQuery, params);
    const totalEligible = countResult.rows[0]?.total ?? 0;

    const selectionLimit =
      mode === "top_n"
        ? Math.min(topN ?? DEFAULT_TOP_N, MAX_TOP_N)
        : Math.min(MAX_SELECTION_ITEMS, Math.max(totalEligible, 0));

    const selectionParams = [...params, selectionLimit];
    const limitParamIdx = selectionParams.length;

    const selectionQuery = `
      WITH latest_items AS (
        SELECT DISTINCT ON (COALESCE(di.content_item_id, c.representative_content_item_id))
          COALESCE(di.content_item_id, c.representative_content_item_id) as content_item_id,
          di.digest_id,
          di.aha_score,
          di.triage_json,
          d.created_at as digest_created_at,
          d.topic_id
        FROM digest_items di
        JOIN digests d ON d.id = di.digest_id
        LEFT JOIN clusters c ON c.id = di.cluster_id
        JOIN content_items ci_inner ON ci_inner.id = COALESCE(di.content_item_id, c.representative_content_item_id)
        WHERE (di.content_item_id IS NOT NULL OR c.representative_content_item_id IS NOT NULL)
          AND d.user_id = $1::uuid
          ${topicFilterClause}
        ORDER BY COALESCE(di.content_item_id, c.representative_content_item_id), d.created_at DESC
      ),
      base AS (
        SELECT
          li.content_item_id::text as content_item_id,
          li.digest_id::text as digest_id,
          li.digest_created_at::text as digest_created_at,
          li.aha_score,
          (li.aha_score * EXP(
            -GREATEST(0, EXTRACT(EPOCH FROM (NOW() - COALESCE(ci.published_at, li.digest_created_at))) / 3600.0)
            / GREATEST(1, $2::float)
          ))::real as trending_score,
          ${COMMENTS_COUNT_SQL} as comments_count,
          (li.triage_json->>'ai_score')::float8 as ai_score,
          li.triage_json,
          t.name as topic_name,
          ci.title,
          ci.body_text,
          ci.canonical_url,
          ci.author,
          ci.published_at::text as published_at,
          ci.source_type,
          ci.metadata_json,
          cis.summary_json as manual_summary_json,
          fe.action as feedback_action,
          (b.content_item_id IS NOT NULL) as is_bookmarked
        FROM latest_items li
        JOIN content_items ci ON ci.id = li.content_item_id
        JOIN topics t ON t.id = li.topic_id
        LEFT JOIN content_item_summaries cis
          ON cis.user_id = $1::uuid AND cis.content_item_id = li.content_item_id
        LEFT JOIN LATERAL (
          SELECT action FROM feedback_events
          WHERE user_id = $1::uuid AND content_item_id = li.content_item_id
          ORDER BY created_at DESC
          LIMIT 1
        ) fe ON true
        LEFT JOIN bookmarks b
          ON b.user_id = $1::uuid AND b.content_item_id = li.content_item_id
        WHERE ci.deleted_at IS NULL
      )
      SELECT
        base.content_item_id,
        base.digest_id,
        base.digest_created_at,
        base.aha_score,
        base.trending_score,
        base.ai_score,
        base.triage_json,
        base.topic_name,
        base.title,
        base.body_text,
        base.canonical_url,
        base.author,
        base.published_at,
        base.source_type,
        base.metadata_json,
        base.manual_summary_json,
        base.feedback_action,
        base.is_bookmarked
      FROM base
      WHERE ${selectionFilterClause}
      ORDER BY ${orderBy}
      LIMIT $${limitParamIdx}
    `;

    const selectionResult = await db.query<ExportItemRow>(selectionQuery, selectionParams);
    const selectedRows = selectionResult.rows;

    const selectedCount =
      mode === "top_n"
        ? Math.min(totalEligible, Math.min(topN ?? DEFAULT_TOP_N, MAX_TOP_N))
        : totalEligible;

    const lines: string[] = [];
    const timestamp = new Date().toISOString();
    const promptTail = renderPromptTail();
    const promptTailChars = promptTail.join("\n").length;
    const tailReserveLines = promptTail.length + 20;
    const tailReserveChars = promptTailChars + 1600;

    lines.push("# AhaRadar Research Dossier");
    lines.push("");
    lines.push(`- Generated at: ${timestamp}`);
    lines.push(`- Selection mode: ${modeLabel(mode)}`);
    lines.push(`- Sort: ${sortLabel(sort)}`);
    lines.push(`- Topic scope: ${effectiveTopicId ? `topic:${effectiveTopicId}` : "all-topics"}`);
    lines.push(`- Selected items (before filters): ${selectedCount}`);
    lines.push("");

    const rowsWithSummary = selectedRows.filter((row) => row.manual_summary_json != null);
    const skippedNoSummaryCount = selectedRows.length - rowsWithSummary.length;

    let exportedCount = 0;
    let truncated = false;
    let truncatedBy: TruncateReason | null = null;

    const exportedCandidateCapExceeded =
      mode !== "top_n" &&
      totalEligible > selectedRows.length &&
      selectedRows.length >= MAX_SELECTION_ITEMS;
    if (exportedCandidateCapExceeded) {
      truncated = true;
      truncatedBy = "item_cap";
    }

    for (let idx = 0; idx < rowsWithSummary.length; idx += 1) {
      const row = rowsWithSummary[idx];
      const sectionLines = buildItemSection({
        row,
        rank: idx + 1,
        mode,
        sort,
        includeExcerpt,
      });

      const currentText = lines.join("\n");
      const candidateText = `${currentText}\n${sectionLines.join("\n")}`;
      const candidateLineCount = candidateText.split("\n").length + tailReserveLines;
      const candidateCharCount = candidateText.length + tailReserveChars;

      if (candidateLineCount > MAX_EXPORT_LINES) {
        truncated = true;
        if (!truncatedBy) truncatedBy = "line_cap";
        break;
      }
      if (candidateCharCount > MAX_EXPORT_CHARS) {
        truncated = true;
        if (!truncatedBy) truncatedBy = "char_cap";
        break;
      }

      lines.push(...sectionLines);
      exportedCount += 1;
    }

    lines.push("---");
    lines.push("");
    lines.push("## Export Stats");
    lines.push("");
    lines.push(`- Selected items: ${selectedCount}`);
    lines.push(`- Items fetched for export: ${selectedRows.length}`);
    lines.push(`- Exported items: ${exportedCount}`);
    lines.push(`- Skipped (missing summary): ${skippedNoSummaryCount}`);
    lines.push(`- Truncated: ${truncated ? "yes" : "no"}`);
    if (truncatedBy) {
      lines.push(`- Truncation reason: ${truncatedBy}`);
    }
    lines.push("");

    if (exportedCount === 0) {
      lines.push("No exportable summarized items found for this selection.");
      lines.push("");
    }

    if (truncated) {
      lines.push(
        `Note: export was truncated (${truncatedBy ?? "limit"}). Narrow scope or reduce Top N for a complete dossier.`,
      );
      lines.push("");
    }

    lines.push(...promptTail);

    const content = `${lines.join("\n")}\n`;
    const charCount = content.length;

    const dateTag = timestamp.replace(/[:.]/g, "").replace(/-/g, "");
    const filename = `aharadar-dossier-${dateTag}.md`;

    return {
      ok: true,
      export: {
        filename,
        mimeType: "text/markdown; charset=utf-8",
        content,
        stats: {
          selectedCount,
          exportedCount,
          skippedNoSummaryCount,
          truncated,
          truncatedBy,
          charCount,
        },
      },
    };
  });
}
