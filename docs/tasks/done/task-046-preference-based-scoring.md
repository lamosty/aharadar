# Task 046 — `feat(pipeline): preference-based scoring from user feedback`

- **Owner**: Claude Code Opus 4.5 (implementer)
- **Reviewer**: GPT-5.2 xtra high
- **Driver**: human (runs commands, merges)

## Goal

Make user feedback (likes/dislikes) influence future item scoring. When a user likes items from certain sources, topics, or authors, similar future items should score higher. When they dislike items, similar ones should score lower.

## Background

Currently:

- User feedback is stored in `feedback_events`
- Scoring is purely algorithmic (LLM triage + source weights)
- Feedback doesn't affect future rankings

Desired:

- Feedback trains a "preference profile" per user
- Future items are scored: `final_score = algorithmic_score * preference_adjustment`

## Read first (required)

- `AGENTS.md`
- `CLAUDE.md`
- `docs/pipeline.md`
- `docs/data-model.md`
- `packages/pipeline/src/stages/rank.ts`

## Scope (allowed files)

- `packages/pipeline/src/stages/rank.ts`
- `packages/db/src/repos/` (new preference repo or extend feedback repo)
- New migration if schema changes needed
- `packages/shared/src/types/` if new types needed

If anything else seems required, **stop and ask**.

## Implementation steps (ordered)

1. **Design preference model**:
   - Option A: Simple - track liked/disliked source types, boost/penalize
   - Option B: Embedding-based - compute user preference vector from liked items
   - **Recommend starting with Option A for simplicity**

2. **Create preference aggregation**:

   ```typescript
   interface UserPreferences {
     sourceTypeWeights: Record<string, number>; // e.g., { hn: 1.2, reddit: 0.8 }
     authorWeights: Record<string, number>; // e.g., { "pg": 1.5 }
     // Future: topicWeights, keywordWeights
   }
   ```

   - Compute from feedback_events:
     - Like → +0.1 to source/author weight
     - Dislike → -0.1 to source/author weight
     - Cap weights between 0.5 and 2.0

3. **Update rank stage**:
   - Load user preferences before scoring
   - Adjust scores: `adjusted_score = base_score * sourceWeight * authorWeight`
   - Store both raw and adjusted scores (for transparency)

4. **Add "Why shown" transparency**:
   - Include preference adjustments in triage_json
   - UI can show "Boosted because you liked similar items from HN"

5. **Incremental recomputation**:
   - Don't recompute all preferences on every feedback
   - Option: Recompute preferences once per pipeline run
   - Option: Async background job when feedback submitted

## Acceptance criteria

- [ ] `pnpm -r typecheck` passes
- [ ] `pnpm -r build` passes
- [ ] Liking HN items increases future HN item scores
- [ ] Disliking Reddit items decreases future Reddit item scores
- [ ] Scores are bounded (don't go to 0 or infinity)
- [ ] "Why shown" includes preference info

## Test plan (copy/paste)

```bash
pnpm dev:services
pnpm build

# 1. Run pipeline with no feedback
pnpm dev:cli -- admin:run-now --topic <topic-id>
# Note scores for HN vs Reddit items

# 2. Add feedback via API
curl -X POST -H "X-API-Key: $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"action":"like"}' \
  "http://localhost:3001/api/items/<hn-item-id>/feedback"

# 3. Run pipeline again
pnpm dev:cli -- admin:run-now --topic <topic-id>
# HN items should have slightly higher scores
```

## Notes

- Start simple (source type weights only)
- Can extend to embeddings-based similarity later
- Consider decay of old feedback (feedback from 6 months ago less relevant)
- Don't over-personalize - novelty detection should still surface surprising things
