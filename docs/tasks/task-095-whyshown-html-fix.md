# Task 095: Fix WhyShown HTML nesting errors (hydration)

## Problem

The WhyShown component has invalid HTML nesting causing 4 hydration errors in Next.js:

1. `<dt>` cannot be a descendant of `<dd>`
2. `<dd>` cannot contain a nested `<dt>`
3. `<dd>` cannot be a descendant of `<dd>`
4. `<dd>` cannot contain a nested `<dd>`

## Location

`packages/web/src/components/WhyShown/WhyShown.tsx` (lines 70-221)

## Root Cause

The `FeatureSection` component wraps children in `<dd>` (line 221), but within the parent WhyShown component, nested `<dt>` and `<dd>` elements are rendered inside those children (e.g., lines 74-75 for novelty score).

This creates invalid HTML structure:
```html
<dl>
  <dt>Novelty</dt>
  <dd>  <!-- from FeatureSection -->
    <div>
      <dt>Novelty score</dt>  <!-- INVALID: dt inside dd -->
      <dd>73%</dd>            <!-- INVALID: dd inside dd -->
    </div>
  </dd>
</dl>
```

## Solution

Replace nested `<dt>`/`<dd>` pairs inside FeatureSection children with semantic `<div>` or custom styled elements. The description list (`<dl>`) pattern should only be used at the top level.

Options:
1. Use `<div className="label">` / `<div className="value">` for nested pairs
2. Use a different component structure that doesn't nest definition lists
3. Keep `<dl>` only for top-level features, use divs for sub-properties

## Acceptance Criteria

- [ ] No HTML nesting errors in Next.js dev tools
- [ ] No hydration warnings in console
- [ ] Visual appearance unchanged
- [ ] `pnpm typecheck` passes

## Priority

High - causes hydration errors on every feed page load
