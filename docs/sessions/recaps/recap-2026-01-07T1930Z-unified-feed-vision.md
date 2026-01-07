# Session Recap: Unified Feed Vision & Architecture Discussion

**Date:** 2026-01-07
**Session focus:** Product vision clarification, UX paradigm shift, scoring architecture

---

## Executive Summary

We identified a fundamental mismatch between the current "digest-centric" UX and the user's actual vision of an "always up-to-date radar of interesting ideas." This led to a deep discussion about how items should be scored, how user feedback should influence rankings, and how the existing Topic concept fits in.

---

## The Problem Identified

### Current Model (Digest-Centric)
```
User opens app → Picks a "Digest" (time window) → Sees 8-20 items from that window
```

- Items are grouped into time-bounded "digests" (e.g., 8-hour windows)
- If an item is fetched after a window closes, it "misses" and goes to next window
- User navigates digest-by-digest
- This came from an "email newsletter" mental model

### User's Actual Vision (Feed-Centric)
```
User opens app → Sees ALL interesting items ranked best-to-worst → Filters/sorts as needed
```

- One unified ranked list of all items
- New items flow in continuously (via batch processing, but not UX-facing)
- Filterable by source, date, score, topic
- "Digests" become background metadata, not primary navigation
- More like "an always up-to-date radar screen of the best ideas"

---

## Key Architectural Discussions

### 1. Ranking Strategy

**Question:** When should items be ranked?

**Decision:** Rank at ingest time, against recent items (~30 days), not continuous re-ranking.

**Reasoning:**
- Continuous re-ranking is expensive and complex
- Ingest-time ranking is sufficient for novelty detection
- User feedback can adjust displayed scores without re-running pipeline

### 2. Novelty Detection vs User Preferences

**The Core Insight:**
> "If there's something new/novel, user couldn't have possibly seen it before and give it a rank - that's the point of the app."

This means novelty detection MUST be algorithmic - you can't train on novel things by definition.

**Two Concepts Being Measured:**

| Concept | What it measures | Can user feedback train it? |
|---------|------------------|----------------------------|
| **Novelty** | "Is this idea new/surprising to the world?" | No - algorithmic only |
| **Preference** | "Does this user care about this topic/source?" | Yes - from likes/dislikes |

**Proposed Formula:**
```
Final Score = Novelty (algorithmic, LLM-based) × Preference (user-trained weights)
```

**Three Implementation Options:**

| Option | Description | Effort | Personalization |
|--------|-------------|--------|-----------------|
| **A: Pure Algorithmic** | No preference training, feedback only filters | 0 weeks | None |
| **B: Preference-Weighted** | Source/topic weights from feedback | 1-2 weeks | Medium |
| **C: Embedding-Based** | User preference vector from liked items | 3-4 weeks | High |

**Recommendation:** Start with Option B (preference-weighted novelty)

**Long-Term Output Example:**

| Item | Novelty | User A (tech fan) | User B (bio fan) |
|------|---------|-------------------|------------------|
| Novel AI breakthrough | 0.9 | 0.9 × 1.2 = 1.08 | 0.9 × 0.8 = 0.72 |
| Novel bio discovery | 0.85 | 0.85 × 0.7 = 0.60 | 0.85 × 1.3 = 1.11 |

### 3. The Topic Concept

**Important context:** The app has a Topic concept that we shouldn't forget.

**Current data model:**
- Users have Topics (e.g., "Tech News", "Finance", "Science")
- Topics have Sources (Reddit, HN, Twitter accounts, RSS feeds)
- Items belong to Sources, which belong to Topics

**How Topics reduce preference complexity:**
- If sources are properly organized into topics, we don't need preference weights to "fight" between tech vs finance - they're already separated
- User preference within a topic should focus on: source weights, author preferences, content style (not topic itself)

**Usage patterns:**
- Some users: One "default" topic with all sources mixed
- Other users: Multiple topics (daily tech radar, monthly science digest, etc.)

### 4. Time Decay & Usage Patterns

**Different users have different check frequencies:**

| Profile | Check Frequency | Decay Behavior | "New" means |
|---------|-----------------|----------------|-------------|
| Power | Multiple/day | Fast (hours) | Since last check |
| Daily | Once/day | Medium (24h) | Since yesterday |
| Weekly | Once/week | Slow (7 days) | Since last week |
| Research | Monthly | Very slow | Since last month |

**Decision:** Make this configurable (task-047), not one-size-fits-all.

---

## Decisions Made

1. **UX Paradigm:** Shift from digest-centric to feed-centric
2. **Ranking Timing:** At ingest time, not continuous
3. **Novelty:** Must be algorithmic (LLM-based)
4. **Preferences:** Trained from user feedback, multiply with novelty
5. **Implementation Order:** Start with Option B (source/topic weights)
6. **Topics:** Keep and leverage - they reduce preference complexity
7. **Time Decay:** Make configurable per user/topic

---

## Open Questions

1. **Per-topic preferences?** Should preference weights be global or per-topic?
   - Global: Simpler, user likes HN everywhere
   - Per-topic: More nuanced, might like HN for tech but Reddit for finance

2. **Feedback decay?** Should old feedback (6+ months) count less?
   - User interests change over time
   - But don't want to lose learned preferences entirely

3. **Cold start for new topics?** When user creates new topic, what's the default?
   - Copy from other topics?
   - Start neutral?
   - Ask user for initial preferences?

4. **Multiple radars per user?** Should users be able to have:
   - "Daily Tech Radar" (power mode, tech sources)
   - "Weekly Science Digest" (weekly mode, science sources)
   - Currently this IS topics, but decay settings are per-user not per-topic

5. **How much novelty vs preference weight?** The formula `novelty × preference` assumes equal weight. Should it be configurable?
   - `0.7 × novelty + 0.3 × preference` (novelty-heavy)
   - Or user-adjustable slider?

---

## Next Tasks Created

See `docs/_session/tasks/task-044-047-overview.md` for full details.

| Task | Description | Depends On |
|------|-------------|------------|
| **044** | API: Unified items endpoint with filters | - |
| **045** | Web: Unified feed view | 044 |
| **046** | Pipeline: Preference-based scoring | - |
| **047** | Configurable timeframes/decay | 044, 045 |

**Suggested order:** 044 → 045 → 046 → 047

---

## Bug Fixes Made This Session

1. **BullMQ job ID fix** (committed)
   - Job IDs can't contain colons
   - Fixed in both API and worker

2. **Worker .env loading** (committed)
   - Worker now loads .env automatically like API does

3. **Digests itemCount fix** (committed)
   - API now returns itemCount in digest list
   - Frontend updated to use it

4. **Reddit connector fix** (DB update, not committed)
   - Changed timeFilter from "hour" to "day"
   - "Top" listing with "hour" returns 0 results on slow subreddits

---

## Commits Made This Session

```
d414e76 docs: add unified feed refactoring tasks (044-047)
dc61dd7 fix(api,web): include itemCount in digests list endpoint
e22d5f0 fix(worker): sanitize scheduler job ID and load .env automatically
d374ffb fix(api): sanitize job ID to avoid BullMQ colon restriction
```

---

## Still TODO (UI Issues)

These were mentioned but not addressed due to the strategic discussion:

1. **Dark mode contrast** - buttons/links not visible enough
2. **Get Started button hover** - text becomes invisible on hover

---

## Key Files to Know

- `packages/pipeline/src/stages/rank.ts` - where scoring happens
- `packages/db/src/repos/` - database access
- `packages/api/src/routes/digests.ts` - current digests endpoints
- `docs/_session/tasks/task-044*.md` - new task files
- `docs/data-model.md` - schema reference
- `docs/spec.md` - product spec

---

## How to Continue

1. Review task-044 and implement unified items endpoint
2. Then task-045 for the feed UI
3. Tasks 046-047 can be done in parallel after 045
4. Address the open questions above as they become relevant
5. Don't forget the UI styling issues when doing frontend work
