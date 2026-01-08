# Session Recap: Preference Scoring & Triage Investigation

**Date:** 2026-01-08
**Duration:** ~1.5 hours
**Focus:** User preference-based ranking, recency decay, X display names, triage debugging

## Summary

Implemented the complete preference-based scoring system (Task 046), recency decay (Task 047), X display names (Task 052), and investigated/fixed triage visibility (Task 059). All planned tasks from the previous planning session are now complete.

## Commits Made (8 total)

### Task 053: WhyShown Messaging
- `2fc71d1` feat(web): show unavailable message when triage data missing

### Task 046: Preference-Based Scoring (4 phases)
- `28f997b` feat(api,db): update preference profile on feedback
- `d4bed04` feat(pipeline): increase preference weight from 5% to 15%
- `de11c3c` feat(pipeline): enable source/author weight preferences in ranking

### Task 047: Recency Decay
- `f056fa2` feat(pipeline): implement recency decay in ranking

### Task 052: X Display Names
- `bd7e304` feat(connectors,web): add X user display names

### Task 059: Triage Investigation
- `c15e43d` feat(pipeline): add triage stats to digest output

## Technical Details

### Preference Scoring System (Task 046)

**Phase 1: Auto-update profiles on feedback**
- In `POST /feedback`, after storing event:
  - Fetch item's embedding via new `getByContentItemId()` method
  - Look up topic_id via content_item_sources → sources
  - Call `applyFeedbackEmbedding()` to update preference profile
- Files: `packages/api/src/routes/feedback.ts`, `packages/db/src/repos/embeddings.ts`

**Phase 2: Increase preference weight**
- Changed `wPref` from 0.05 to 0.15 (3x more impactful)
- File: `packages/pipeline/src/stages/rank.ts`

**Phase 3: Source/author weight preferences**
- Wire up `computeUserPreferences()` from feedback_events repo
- Pass `sourceType` and `author` to each ranking candidate
- Apply as multipliers: `score × sourceTypeWeight × authorWeight`
- File: `packages/pipeline/src/stages/digest.ts`

**Phase 4: Web feedback UI** - Already complete from previous session

### Recency Decay (Task 047)

Added exponential decay based on topic's `decay_hours` setting:
```typescript
const decayFactor = Math.exp(-ageHours / decayHours);
const score = baseScore * decayFactor;
```

- At `age = decay_hours`, factor ≈ 0.37 (1/e)
- Stored in `recency_decay_v1` system feature for explainability
- Fetches topic's `decay_hours` before ranking
- Files: `packages/pipeline/src/stages/rank.ts`, `digest.ts`

### X Display Names (Task 052)

- Updated Grok prompt to request `user_display_name` field
- Passed through: fetch → normalize → metadata
- Web UI shows "Display Name (@handle)" for X posts
- Files: `packages/connectors/src/x_shared/grok_x_search.ts`, `x_posts/fetch.ts`, `x_posts/normalize.ts`, `packages/web/src/components/Feed/FeedItem.tsx`

### Triage Investigation (Task 059)

**Root cause identified:** Triage is silently disabled when:
1. OpenAI env vars missing (throws in `createEnvLlmRouter()`)
2. Budget exhausted (`paidCallsAllowed = false`)

**Fix:** Added visibility to digest output:
- `DigestRunResult` now includes `triaged` count and `paidCallsAllowed`
- Console logs: `[digest] Full triage: 30/30 items have LLM scores.`
- Ran fresh digest to populate triage_json for recent items

**Current state:**
- 68 items with triage_json
- 76 items without (from older digests before fix)
- New runs will fully triage all items

## Files Changed

### New/Modified in This Session
```
packages/api/src/routes/feedback.ts          # Auto-update preference profiles
packages/db/src/repos/embeddings.ts          # Added getByContentItemId
packages/pipeline/src/stages/rank.ts         # wPref increase, decay logic
packages/pipeline/src/stages/digest.ts       # Wire up preferences, decay, triage stats
packages/connectors/src/x_shared/grok_x_search.ts  # Request display name
packages/connectors/src/x_posts/fetch.ts     # Pass display name
packages/connectors/src/x_posts/normalize.ts # Store display name in metadata
packages/web/src/components/Feed/FeedItem.tsx       # Show display name
packages/web/src/components/WhyShown/*              # Unavailable state
packages/web/src/messages/en.json                   # i18n strings
```

## What Works Now

1. **Feedback → Learning** - Like/dislike/save updates user preference profiles
2. **Preference Scoring** - Items scored based on embedding similarity + source/author weights
3. **Recency Decay** - Older items score lower based on topic's decay_hours
4. **X Display Names** - Shows "Elon Musk (@elonmusk)" instead of just "@elonmusk"
5. **Triage Visibility** - Clear logging of triage status per digest run
6. **WhyShown Fallback** - Shows "Ranking details unavailable" when triage_json is NULL

## Known Limitations

1. **Historical items** - 76 old digest items still lack triage_json (would need re-digest)
2. **Preference weight not configurable** - Fixed at 0.15, could be user-adjustable
3. **Decay toggles** - Plan mentioned toggleable decay (score vs badge vs both), not implemented

---

## Recommended Next Tasks

### High Priority

#### Task 060: Onboarding Flow
**Problem:** New users land on empty feed with no guidance.

**Scope:**
- Empty state with "Create your first topic" CTA
- Guide to add sources
- Optional: topic templates (Tech, Finance, Science)

**Files:** `packages/web/src/app/app/feed/page.tsx`, new onboarding components

#### Task 061: Integration Tests for Core Flows
**Problem:** No automated tests for critical paths.

**Scope:**
- Test feedback → preference profile update flow
- Test digest with triage
- Test topic CRUD operations

**Files:** `packages/pipeline/src/*.test.ts`, `packages/api/src/*.test.ts`

### Medium Priority

#### Task 062: Configurable Preference Weight
**Problem:** Preference weight (0.15) is hardcoded.

**Scope:**
- Add `preference_weight` to user_preferences.custom_settings
- UI slider in Settings: "How much should preferences affect ranking?"
- Pass to rankCandidates

**Files:** `packages/db/src/repos/user_preferences.ts`, `packages/web/src/app/app/settings/page.tsx`

#### Task 063: Decay Toggle Options
**Problem:** Decay currently always affects score. Plan mentioned toggles.

**Scope:**
- Add to topic settings: "Decay affects: Score ranking / New badge / Both"
- Implement conditional decay application

**Files:** `packages/db/migrations/`, `packages/pipeline/src/stages/rank.ts`

#### Task 064: WhyShown Decay Display
**Problem:** Decay is now a ranking factor but not visible in WhyShown.

**Scope:**
- Add recency_decay_v1 to WhyShown component
- Show "90% fresh" or similar indicator
- Tooltip explaining decay

**Files:** `packages/web/src/components/WhyShown/WhyShown.tsx`

### Lower Priority

#### Task 065: Remove Singleton Context
**Problem:** Still using `getSingletonContext()` for user - not multi-user ready.

**Scope:**
- Replace with proper auth context from magic link session
- Update all API routes to use authenticated user

#### Task 066: Topic URL Params
**Problem:** Topic selection not in URL, can't share/bookmark filtered feeds.

**Scope:**
- Add `?topic=uuid` to feed URL
- Sync TopicProvider with URL
- Update on topic switch

### Technical Debt

1. **Preference decay** - Old feedback should matter less than recent
2. **Batch preference updates** - Currently updates on every feedback, could batch
3. **Triage retry** - Items that failed triage should be retried

---

## Seed Prompt for Next Session

```
Continue work on aharadar. Last session (2026-01-08) completed preference scoring system:

Commits made:
- Task 053: WhyShown unavailable message
- Task 046: Full preference-based scoring (4 phases)
  - Auto-update profiles on feedback
  - Increased wPref to 0.15
  - Source/author weight preferences
- Task 047: Recency decay in ranking
- Task 052: X user display names
- Task 059: Triage visibility + investigation

Current state:
- Feedback updates preference profiles automatically
- Rankings use embedding similarity + source/author weights + decay
- X posts show display names
- Triage logging shows status per digest run
- 68 items have triage_json, 76 historical items without

Recommended next:
1. **Task 060** (High) - Onboarding flow for new users
2. **Task 064** (Med) - Show decay in WhyShown component
3. **Task 061** (Med) - Integration tests for core flows

See docs/recaps/recap-2026-01-08T1100Z-preference-scoring-triage.md for details.
```
