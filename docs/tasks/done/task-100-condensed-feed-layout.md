# Task 100: Implement Condensed Feed Layout

## Priority: High

## Goal

Create a genuinely different "condensed" layout for the feed page that shows more items per viewport by using a compact, list-like design instead of the current card-based layout.

## Background

The app has three layout settings (condensed/reader/timeline) defined in Settings, but:

1. CSS variables exist in `globals.css` but FeedItem uses hardcoded `var(--space-X)` values
2. All three layouts look essentially the same - just minor spacing differences
3. Users wanting to scan many items quickly have no good option

## Current State

**Layout CSS variables** (globals.css lines 203-224):

```css
[data-layout="condensed"] {
  --content-max-width: 100%;
  --content-gap: var(--space-2);
  --card-padding: var(--space-3);
  --item-spacing: var(--space-1);
}
```

**Problem**: FeedItem.module.css uses hardcoded values like `padding: var(--space-5)` instead of `padding: var(--card-padding)`.

## Requirements

### Option A: Layout-Aware Styling (Minimum)

Update FeedItem.module.css to use the layout variables:

- Replace `padding: var(--space-5)` with `padding: var(--card-padding)`
- Replace gaps/margins with `var(--item-spacing)` or `var(--content-gap)`
- This makes the existing layout settings actually work

### Option B: Truly Distinct Condensed View (Recommended)

Create a completely different component/variant for condensed layout:

**Condensed layout characteristics:**

- Single-line or two-line per item (not card)
- No card borders/shadows - just subtle separators
- Source badge, title, author, time, score all on one row
- Feedback actions shown on hover or as tiny icons
- WhyShown collapsed by default, maybe as popover instead of accordion
- Target: 8-12 items visible per viewport vs current 3-4

**Example condensed row:**

```
[HN] Title of the item goes here... · @author · 2h · [👍][👎] [85]
```

### Option C: Layout Toggle on Feed Page

Add a quick toggle button on the feed page header to switch between layouts without going to Settings.

## Implementation Approach

1. **ThemeContext** already provides `layout` via `useTheme()` hook
2. **FeedItem** could accept a `layout` prop or read from context
3. **Conditional rendering**: Render different JSX based on layout
4. **Or**: Use CSS-only approach with `[data-layout]` selectors in FeedItem.module.css

## Files to Modify

- `packages/web/src/components/Feed/FeedItem.tsx` - Layout-aware rendering
- `packages/web/src/components/Feed/FeedItem.module.css` - Use CSS variables, add condensed styles
- `packages/web/src/components/Feed/Feed.tsx` - Optional layout toggle
- `packages/web/src/styles/globals.css` - May need additional condensed variables

## Design Reference

**Current "Reader" layout** (default):

- Card with padding, border, shadow on hover
- Header row with badges, meta, score
- Title as heading
- WhyShown accordion below

**Proposed "Condensed" layout**:

- No card wrapper, just horizontal rule separator
- All info on 1-2 lines
- Inline score badge (smaller)
- Hover to reveal actions
- Minimal vertical spacing

## Acceptance Criteria

- [ ] Condensed layout shows significantly more items per viewport (2-3x current)
- [ ] Switching layouts in Settings immediately changes feed appearance
- [ ] All functionality preserved (feedback, WhyShown, links)
- [ ] Responsive - works on mobile (may fall back to card view)
- [ ] `pnpm typecheck` passes

## Test Plan

```bash
pnpm dev:web
# Go to Settings > Appearance > Layout
# Switch between Condensed/Reader/Timeline
# Observe feed page changes
```

## Notes

- Consider whether WhyShown makes sense in condensed view (maybe popover?)
- Cluster badges (+N sources) need compact representation
- NEW badge styling may need adjustment
- Score could be smaller/numeric-only in condensed view
