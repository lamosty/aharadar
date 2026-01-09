# ✅ DONE

# Task 072: Design Consistency Overhaul

## Priority: Medium

## Problem

Inconsistent alignment and layout across pages:

- Card-based pages (Topics, Sources): Left-aligned to sidebar
- Feed page: Center-aligned items
- Different max-widths and spacing patterns

## Goals

1. Consistent visual language across all pages
2. Better use of horizontal space
3. Modern, clean design that scales well

## Pages to Review

- `/app/feed` - center aligned, max-width 900px
- `/app/topics` - left aligned, max-width 1000px
- `/app/sources` - left aligned, max-width 900px
- `/app/settings` - left aligned, max-width 600px
- `/app/digests` - varies
- `/app/admin/*` - varies

## Design Decisions Needed

1. **Alignment**: Should all content be center-aligned or left-aligned?
2. **Max-width**: Consistent max-width across pages?
3. **Card style**: Unified card component/styling?
4. **Spacing**: Consistent page padding and margins?

## Recommendation

Use ui-designer subagent to:

1. Audit current layouts
2. Propose unified design system
3. Create consistent page template

## Related Tasks

- Task 071: Admin/user separation (design implications)
- Task 073: Dashboard redesign

## Acceptance Criteria

- All pages follow consistent layout pattern
- Design system documented
- Responsive across screen sizes
