# Task 073: Dashboard Purpose & Widget Exploration

## Priority: Medium

## Problem
Current Dashboard page at `/app` has unclear purpose. It shows "Welcome to your radar" but doesn't provide much value.

## Exploration Questions
1. What should the dashboard show?
2. Should it be the landing page after login?
3. What would make it useful for daily use?

## Widget Ideas (to explore with user)

### Quick Discovery Widgets
- "Top 3 from each topic" - quick scan across all interests
- "New since last visit" - count per topic
- "Trending" - items appearing in multiple sources

### Activity Widgets
- "Your recent feedback" - what you liked/disliked
- "Pipeline status" - last run, next scheduled
- "Credit usage" - daily/monthly at a glance

### Personalization Widgets
- "Topics overview" - card per topic with counts
- "Source health" - which sources are fetching
- "Recommendations" - suggested new sources based on interests

## Questions for User
1. Do you want Dashboard as landing page or go straight to Feed?
2. Which widgets would you actually use daily?
3. Should widgets be configurable/draggable?
4. Should Dashboard replace Feed as primary view?

## Implementation Approach
If proceeding:
1. Create widget component system
2. Define 2-3 initial widgets based on user feedback
3. Add widget grid to dashboard
4. Consider making widgets configurable

## Related Tasks
- Task 071: Admin/user separation
- Task 072: Design consistency

## Acceptance Criteria
- Clear purpose defined for Dashboard
- Either: Useful widgets implemented, OR: Dashboard removed/redirects to Feed
