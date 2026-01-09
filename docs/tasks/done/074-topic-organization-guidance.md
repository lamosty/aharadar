# ✅ DONE

# Task 074: Topic Organization & Ranking UX

## Priority: Low (Guidance/Documentation)

## Problem

User feedback: When mixing diverse sources (HN, Twitter, r/wallstreetbets, r/reddit) in one topic, Reddit posts rank low (below 50) and get buried. User unsure if they should create separate topics.

## Current Behavior

- All sources in a topic compete for ranking
- LLM triage scores based on relevance to topic description (if any)
- High-volume sources may dominate
- Different source types have different content patterns

## Guidance to Document

### When to Use Single Topic

- Sources cover same interest area
- You want cross-source comparison (e.g., "what's HN saying about X vs Twitter")
- Content is similar in nature

### When to Create Separate Topics

- Sources have very different content types (news vs memes vs technical)
- You want different decay rates (daily for news, weekly for research)
- One source consistently gets buried
- Different "viewing profiles" needed

### Example Topic Structures

```
Option A: Single "Tech News" topic
- HN, Twitter tech accounts, r/programming
- Works if all sources are similar depth

Option B: Split by type
- "Quick News" (Twitter, Reddit) - 12h decay
- "Deep Reads" (HN, RSS blogs) - 48h decay
- "Research" (arxiv, papers) - 720h decay

Option C: Split by interest
- "Crypto/Investing" (r/wallstreetbets, Twitter finance)
- "Tech" (HN, r/programming)
- "General" (other Reddit, misc)
```

## Possible Feature Enhancements

1. **Per-source weight within topic** - boost Reddit items if desired
2. **Minimum items per source** - ensure each source gets representation
3. **Source diversity score** - penalize feeds dominated by one source
4. **Topic suggestions** - "You have diverse sources, consider splitting"

## Action Items

1. Add guidance to onboarding or settings
2. Consider "topic templates" for common patterns
3. Evaluate if per-source weighting would help

## Acceptance Criteria

- User understands when to split topics
- Documentation/UI guidance exists
- Optional: Per-source weight feature scoped
