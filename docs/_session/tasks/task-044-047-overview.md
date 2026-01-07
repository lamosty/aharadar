# Tasks 044-047 Overview: Unified Feed Refactoring

## The Problem

Current UX is **digest-centric**: users navigate digest-by-digest, and items that "miss" a time window don't appear. This doesn't match the product vision of an "always up-to-date radar of interesting ideas."

## The Vision

A **feed-centric** UX where:
- All interesting items appear in ONE ranked list
- New items flow in continuously (via batch processing)
- Users can filter by source, date, score
- "Digests" become background metadata, not primary navigation
- User feedback trains future rankings
- Decay/freshness is configurable per user's check frequency

## Task Breakdown

| Task | Description | Depends On |
|------|-------------|------------|
| **044** | API: Unified items endpoint | - |
| **045** | Web: Unified feed view | 044 |
| **046** | Pipeline: Preference-based scoring | - |
| **047** | Configurable timeframes/decay | 044, 045 |

## Suggested Order

1. **044** - API endpoint (foundation)
2. **045** - Web feed view (primary UX change)
3. **046** - Preference scoring (can be parallel with 047)
4. **047** - Configurable timeframes (polish)

## Key Decisions Made

- **Ranking**: At ingest time, against recent items (~30 days)
- **Feedback**: Trains preferences (what user finds interesting), not novelty detection
- **Novelty**: Algorithmic - independent of user preferences
- **Decay**: Configurable based on usage pattern
- **Primary UX**: Scrollable feed (Twitter-like)
- **Batch processing**: Kept for cost efficiency, but not UX-facing

## Future Considerations

- Multiple "radars" per user (daily tech, monthly science)
- Embedding-based preference learning (beyond source weights)
- Real-time notifications for high-score items
- Mobile app with swipe UX
