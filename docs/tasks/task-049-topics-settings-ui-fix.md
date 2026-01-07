# Task 049: Fix Topics Settings UI Layout

## Problem

The Topics section in Settings page has broken visual layout:
1. Profile option buttons appear in a confusing grid that looks broken
2. Options seem to overlap or flow incorrectly
3. The expandable topic card doesn't collapse/expand cleanly
4. Layout doesn't match intended design (should be clear radio-style selection)

## Current State

### Screenshot Issue
- All 5 profile options (Power User, Daily, Weekly, Research, Custom) show as a 2x3 grid
- The buttons appear to have inconsistent sizing
- Not clear which option is selected
- Looks cramped when expanded

### CSS (`TopicViewingProfileSettings.module.css`)
```css
.profileGrid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: var(--spacing-sm);
}
```
This creates an auto-flowing grid that looks broken at certain widths.

## Solution

### Option A: Radio-style vertical list (Recommended)
Change from grid to vertical list with clear selection state:

```css
.profileGrid {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}

.profileButton {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-sm) var(--spacing-md);
  /* ... rest of styles */
}

.profileLabel {
  font-weight: 500;
}

.profileMeta {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  color: var(--color-text-tertiary);
}
```

### Option B: Fixed 2-column grid
If grid is preferred, use fixed columns:

```css
.profileGrid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--spacing-sm);
}

@media (max-width: 480px) {
  .profileGrid {
    grid-template-columns: 1fr;
  }
}
```

### TopicsList.module.css Updates

Fix the expandable card styling:

```css
.topicCard {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  overflow: hidden;
  background: var(--color-background);
}

.topicHeader {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--spacing-md);
  background: none;
  border: none;
  cursor: pointer;
}

.topicContent {
  border-top: 1px solid var(--color-border);
  padding: var(--spacing-md);
  background: var(--color-background-subtle);
}
```

## Component Updates

### TopicViewingProfileSettings.tsx

Consider simplifying the button layout:

```tsx
<div className={styles.profileList}>
  {PROFILE_OPTIONS.map((option) => (
    <label key={option.value} className={styles.profileOption}>
      <input
        type="radio"
        name="viewingProfile"
        value={option.value}
        checked={currentProfile === option.value}
        onChange={() => handleProfileChange(option.value)}
        disabled={isPending}
        className={styles.radioInput}
      />
      <span className={styles.profileLabel}>
        {t(`settings.viewing.profiles.${option.value}`)}
      </span>
      <span className={styles.profileDescription}>
        {t(`settings.viewing.profileDescriptions.${option.value}`)}
      </span>
      {option.value !== "custom" && (
        <span className={styles.profileDecay}>{option.decayHours}h</span>
      )}
    </label>
  ))}
</div>
```

## Testing

1. Verify profile options display clearly in a single column
2. Verify selected state is obvious (highlighted, checkmark, etc.)
3. Verify expand/collapse animation is smooth
4. Test at various screen widths
5. Verify "Mark as caught up" button is accessible

## Files to Modify

- `packages/web/src/components/TopicViewingProfile/TopicViewingProfileSettings.module.css`
- `packages/web/src/components/TopicViewingProfile/TopicViewingProfileSettings.tsx` (optional)
- `packages/web/src/components/TopicViewingProfile/TopicsList.module.css`

## Priority

**Medium** - Functional but looks broken; affects user confidence in the app.
