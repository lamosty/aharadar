-- Migration: Rename scores for consistency (Aha vs AI)
--
-- Changes:
-- 1. Rename column: digest_items.score -> digest_items.aha_score
-- 2. Rename index: digest_items_digest_score_idx -> digest_items_digest_aha_score_idx
-- 3. Backfill triage_json: aha_score -> ai_score (in digest_items)
-- 4. Backfill triage_json: aha_score -> ai_score (in abtest_results)

-- Step 1: Rename column (idempotent - only if 'score' exists and 'aha_score' doesn't)
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'digest_items' and column_name = 'score'
  ) and not exists (
    select 1 from information_schema.columns
    where table_name = 'digest_items' and column_name = 'aha_score'
  ) then
    alter table digest_items rename column score to aha_score;
  end if;
end $$;

-- Step 2: Rename index (already idempotent with IF EXISTS)
alter index if exists digest_items_digest_score_idx rename to digest_items_digest_aha_score_idx;

-- Step 3: Backfill triage_json in digest_items
-- Only copy when ai_score is missing and aha_score exists
update digest_items
set triage_json = (triage_json - 'aha_score') || jsonb_build_object('ai_score', triage_json->'aha_score')
where triage_json ? 'aha_score' and not (triage_json ? 'ai_score');

-- Step 4: Backfill triage_json in abtest_results
-- Only copy when ai_score is missing and aha_score exists
update abtest_results
set triage_json = (triage_json - 'aha_score') || jsonb_build_object('ai_score', triage_json->'aha_score')
where triage_json ? 'aha_score' and not (triage_json ? 'ai_score');
