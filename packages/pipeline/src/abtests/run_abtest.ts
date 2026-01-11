import type { AbtestItemInsert, AbtestResultInsert, AbtestVariantInsert, Db } from "@aharadar/db";
import { createConfiguredLlmRouter, type LlmRuntimeConfig, triageCandidate } from "@aharadar/llm";
import { createLogger, type ProviderCallDraft } from "@aharadar/shared";

const log = createLogger({ component: "abtest" });

/**
 * AB test variant configuration.
 */
export interface AbtestVariantConfig {
  name: string;
  provider: "openai" | "anthropic" | "claude-subscription" | "codex-subscription";
  model: string;
  reasoningEffort?: "none" | "low" | "medium" | "high" | null;
  maxOutputTokens?: number;
}

/**
 * Candidate row from the database query.
 */
interface CandidateRow {
  kind: "cluster" | "item";
  candidate_id: string;
  candidate_at: string;
  rep_content_item_id: string;
  cluster_id: string | null;
  source_id: string;
  source_type: string;
  source_name: string | null;
  title: string | null;
  body_text: string | null;
  canonical_url: string | null;
  author: string | null;
  published_at: string | null;
}

/**
 * Result of an AB test run.
 */
export interface AbtestRunResult {
  runId: string;
  itemCount: number;
  variantCount: number;
  resultCount: number;
  status: "completed" | "failed";
  error?: string;
}

/**
 * Parameters for running an AB test.
 */
export interface RunAbtestParams {
  runId: string;
  userId: string;
  topicId: string;
  windowStart: string;
  windowEnd: string;
  variants: AbtestVariantConfig[];
  maxItems?: number;
}

/**
 * Query candidates from the database for a given topic and window.
 * Uses a simplified version of the digest candidate query.
 */
async function queryCandidates(
  db: Db,
  params: {
    userId: string;
    topicId: string;
    windowStart: string;
    windowEnd: string;
    limit: number;
  },
): Promise<CandidateRow[]> {
  // Query for both clustered and unclustered items in the window
  // Simplified from digest.ts - focuses on getting representative samples
  const result = await db.query<CandidateRow>(
    `with topic_sources as (
       select id from sources
       where user_id = $1 and topic_id = $2::uuid and is_enabled = true
     ),
     window_items as (
       select
         ci.id as content_item_id,
         ci.source_id,
         ci.source_type,
         s.name as source_name,
         ci.title,
         ci.body_text,
         ci.canonical_url,
         ci.author,
         ci.published_at,
         coalesce(ci.published_at, ci.fetched_at) as candidate_at
       from content_items ci
       join content_item_sources cis on cis.content_item_id = ci.id
       join topic_sources ts on ts.id = cis.source_id
       join sources s on s.id = ci.source_id
       where ci.user_id = $1
         and ci.deleted_at is null
         and ci.duplicate_of_content_item_id is null
         and coalesce(ci.published_at, ci.fetched_at) >= $3::timestamptz
         and coalesce(ci.published_at, ci.fetched_at) < $4::timestamptz
     ),
     cluster_rows as (
       select
         'cluster'::text as kind,
         cl.id::text as candidate_id,
         max(wi.candidate_at)::text as candidate_at,
         cl.representative_content_item_id::text as rep_content_item_id,
         cl.id::text as cluster_id,
         wi.source_id::text as source_id,
         wi.source_type,
         wi.source_name,
         (select title from content_items where id = cl.representative_content_item_id) as title,
         (select body_text from content_items where id = cl.representative_content_item_id) as body_text,
         (select canonical_url from content_items where id = cl.representative_content_item_id) as canonical_url,
         (select author from content_items where id = cl.representative_content_item_id) as author,
         (select published_at::text from content_items where id = cl.representative_content_item_id) as published_at
       from clusters cl
       join cluster_items cli on cli.cluster_id = cl.id
       join window_items wi on wi.content_item_id = cli.content_item_id
       where cl.user_id = $1
         and cl.representative_content_item_id is not null
       group by cl.id, wi.source_id, wi.source_type, wi.source_name
     ),
     item_rows as (
       select
         'item'::text as kind,
         wi.content_item_id::text as candidate_id,
         wi.candidate_at::text as candidate_at,
         wi.content_item_id::text as rep_content_item_id,
         null::text as cluster_id,
         wi.source_id::text as source_id,
         wi.source_type,
         wi.source_name,
         wi.title,
         wi.body_text,
         wi.canonical_url,
         wi.author,
         wi.published_at::text as published_at
       from window_items wi
       where not exists (
         select 1 from cluster_items cli where cli.content_item_id = wi.content_item_id
       )
     ),
     all_candidates as (
       select * from cluster_rows
       union all
       select * from item_rows
     )
     select *
     from all_candidates
     order by
       (title is not null) desc,
       candidate_at desc
     limit $5`,
    [params.userId, params.topicId, params.windowStart, params.windowEnd, params.limit],
  );

  return result.rows;
}

/**
 * Run an AB test: triage the same candidates with multiple model variants.
 *
 * This bypasses credits (for dev/admin use) and stores all results for comparison.
 */
export async function runAbtestOnce(db: Db, params: RunAbtestParams): Promise<AbtestRunResult> {
  const { runId, userId, topicId, windowStart, windowEnd, variants, maxItems = 50 } = params;

  log.info({ runId: runId.slice(0, 8), topicId: topicId.slice(0, 8) }, "Starting AB test run");

  try {
    // Update run status to running
    await db.abtests.updateRunStatus({
      runId,
      status: "running",
      startedAt: new Date().toISOString(),
    });

    // Insert variants
    const variantInserts: AbtestVariantInsert[] = variants.map((v, idx) => ({
      name: v.name,
      provider: v.provider,
      model: v.model,
      reasoningEffort: v.reasoningEffort ?? null,
      maxOutputTokens: v.maxOutputTokens ?? null,
      order: idx + 1,
    }));
    const insertedVariants = await db.abtests.insertVariants(runId, variantInserts);

    log.info(
      { runId: runId.slice(0, 8), variantCount: insertedVariants.length },
      "Inserted variants",
    );

    // Query candidates
    const candidates = await queryCandidates(db, {
      userId,
      topicId,
      windowStart,
      windowEnd,
      limit: maxItems,
    });

    log.info({ runId: runId.slice(0, 8), candidateCount: candidates.length }, "Queried candidates");

    if (candidates.length === 0) {
      await db.abtests.updateRunStatus({
        runId,
        status: "completed",
        completedAt: new Date().toISOString(),
      });
      return {
        runId,
        itemCount: 0,
        variantCount: insertedVariants.length,
        resultCount: 0,
        status: "completed",
      };
    }

    // Insert items (with content snapshot)
    const itemInserts: AbtestItemInsert[] = candidates.map((c) => ({
      candidateId: c.candidate_id,
      clusterId: c.cluster_id ?? null,
      contentItemId: c.kind === "item" ? c.candidate_id : null,
      representativeContentItemId: c.rep_content_item_id,
      sourceId: c.source_id,
      sourceType: c.source_type,
      title: c.title,
      url: c.canonical_url,
      author: c.author,
      publishedAt: c.published_at,
      bodyText: c.body_text,
    }));
    const insertedItems = await db.abtests.insertItems(runId, itemInserts);

    log.info({ runId: runId.slice(0, 8), itemCount: insertedItems.length }, "Inserted items");

    // For each item × variant, run triage
    const results: AbtestResultInsert[] = [];
    let successCount = 0;
    let errorCount = 0;

    for (const variant of insertedVariants) {
      const rawReasoningEffort = variant.reasoning_effort;
      const normalizedReasoningEffort =
        rawReasoningEffort === "none" ||
        rawReasoningEffort === "low" ||
        rawReasoningEffort === "medium" ||
        rawReasoningEffort === "high"
          ? rawReasoningEffort
          : null;
      // Treat null/undefined as "none" so reasoning can be explicitly disabled.
      const reasoningEffortOverride = normalizedReasoningEffort ?? "none";

      // Build LLM config for this variant
      const llmConfig: LlmRuntimeConfig = {
        provider: variant.provider as LlmRuntimeConfig["provider"],
        anthropicModel:
          variant.provider === "anthropic" || variant.provider === "claude-subscription"
            ? variant.model
            : "claude-sonnet-4-20250514",
        openaiModel: variant.provider === "openai" ? variant.model : "gpt-4o",
        claudeSubscriptionEnabled: variant.provider === "claude-subscription",
        claudeTriageThinking: false,
        claudeCallsPerHour: 1000, // High limit for AB tests
        reasoningEffort: reasoningEffortOverride,
      };

      const router = createConfiguredLlmRouter(process.env, llmConfig);

      for (const item of insertedItems) {
        const candidate = candidates.find((c) => c.candidate_id === item.candidate_id);
        if (!candidate) continue;

        try {
          const triageResult = await triageCandidate({
            router,
            tier: "normal", // Use normal tier for AB tests
            candidate: {
              id: item.id,
              title: candidate.title,
              bodyText: candidate.body_text,
              sourceType: candidate.source_type,
              sourceName: candidate.source_name,
              primaryUrl: candidate.canonical_url,
              author: candidate.author,
              publishedAt: candidate.published_at,
              windowStart,
              windowEnd,
            },
            reasoningEffortOverride,
          });

          results.push({
            abtestItemId: item.id,
            variantId: variant.id,
            triageJson: triageResult.output as unknown as Record<string, unknown>,
            inputTokens: triageResult.inputTokens,
            outputTokens: triageResult.outputTokens,
            status: "ok",
          });

          // Record provider call with abtest metadata (credits=0 for AB tests)
          const now = new Date().toISOString();
          const draft: ProviderCallDraft = {
            userId,
            purpose: "triage",
            provider: triageResult.provider,
            model: triageResult.model,
            inputTokens: triageResult.inputTokens,
            outputTokens: triageResult.outputTokens,
            costEstimateCredits: 0, // AB tests bypass credits
            status: "ok",
            startedAt: now,
            endedAt: now,
            meta: {
              abtest_run_id: runId,
              variant_id: variant.id,
              abtest_item_id: item.id,
            },
          };
          await db.providerCalls.insert(draft);

          successCount++;
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          results.push({
            abtestItemId: item.id,
            variantId: variant.id,
            status: "error",
            errorJson: { message: errorMessage },
          });
          errorCount++;

          log.warn(
            { runId: runId.slice(0, 8), variantId: variant.id.slice(0, 8), error: errorMessage },
            "Triage failed for item",
          );
        }
      }

      log.info(
        {
          runId: runId.slice(0, 8),
          variant: variant.name,
          success: successCount,
          errors: errorCount,
        },
        "Completed variant",
      );
    }

    // Insert all results
    if (results.length > 0) {
      await db.abtests.insertResults(results);
    }

    // Update run status to completed
    await db.abtests.updateRunStatus({
      runId,
      status: "completed",
      completedAt: new Date().toISOString(),
    });

    log.info(
      { runId: runId.slice(0, 8), items: insertedItems.length, results: results.length },
      "AB test run completed",
    );

    return {
      runId,
      itemCount: insertedItems.length,
      variantCount: insertedVariants.length,
      resultCount: results.length,
      status: "completed",
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    log.error({ runId: runId.slice(0, 8), error: errorMessage }, "AB test run failed");

    // Update run status to failed
    try {
      await db.abtests.updateRunStatus({
        runId,
        status: "failed",
        completedAt: new Date().toISOString(),
      });
    } catch {
      // Ignore status update errors
    }

    return {
      runId,
      itemCount: 0,
      variantCount: 0,
      resultCount: 0,
      status: "failed",
      error: errorMessage,
    };
  }
}
