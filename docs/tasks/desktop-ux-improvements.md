# Task: Desktop Feed UX Improvements

## Summary
Improve the desktop feed UX by fixing action button positioning in the dense view's expanded panel, adding undo/bookmark buttons, and removing unused layout options.

## Background
The app has a "dense" (condensed) feed view where items are shown as scannable rows. Hovering/clicking expands a floating detail panel with more info and action buttons. Currently:
- Action buttons are at the bottom of the panel content, so they move based on content length
- No "go back" (undo) button to reverse feedback
- No bookmark button on desktop
- There are 3 layout options (dense, reader, timeline) but only dense is used

## Requirements

### 1. Fixed Action Button Position in Detail Panel
**Location:** `packages/web/src/components/Feed/FeedItem.tsx` (lines 517-756 for condensed layout)

The detail panel (`.detailPanel` class) currently has action buttons in `.detailActions` div which is positioned after content.

**Change needed:**
- Move action buttons to a fixed position within the panel (top-right or sticky bottom)
- Add: Undo button, Bookmark button
- Keep: Thumbs up, Thumbs down, Paste input / View AI Summary button

**Current structure (lines 588-714):**
```
.detailPanel
  ├── .detailPanelHeader (Open/Close - mobile only)
  ├── Body text preview
  ├── .detailMeta (author, subreddit, comments)
  ├── .detailActions (FeedbackButtons + paste input) ← MOVE THIS
  ├── .largeTextConfirm (optional)
  └── .detailWhyShown
```

**Target structure:**
```
.detailPanel
  ├── .detailPanelActions (FIXED POSITION - top-right or sticky)
  │   ├── FeedbackButtons
  │   ├── Undo button (if canUndo)
  │   └── Bookmark button
  ├── .detailPanelHeader (Open/Close - mobile only)
  ├── Body text preview
  ├── .detailMeta
  ├── Paste input / View AI Summary
  ├── .largeTextConfirm (optional)
  └── .detailWhyShown
```

### 2. Add Undo (Go Back) Functionality
**Files to modify:**
- `packages/web/src/app/app/feed/page.tsx` - add desktop history state + handler
- `packages/web/src/components/Feed/FeedItem.tsx` - add props and render button

**Implementation:**
1. Add state in feed page:
```typescript
const [desktopHistory, setDesktopHistory] = useState<FeedItemType[]>([]);
```

2. Track items when feedback given:
```typescript
// In handleFeedback, before mutation:
if (item && !isMobile) {
  setDesktopHistory(prev => [...prev.slice(-9), item]); // Keep last 10
}
```

3. Add undo handler:
```typescript
const handleDesktopUndo = useCallback(async () => {
  if (desktopHistory.length === 0) return;
  const previousItem = desktopHistory[desktopHistory.length - 1];
  setDesktopHistory(prev => prev.slice(0, -1));
  await clearFeedbackMutation.mutateAsync({
    contentItemId: previousItem.id,
    digestId: previousItem.digestId,
  });
}, [desktopHistory, clearFeedbackMutation]);
```

4. Pass to FeedItem:
```typescript
onUndo={!isMobile ? handleDesktopUndo : undefined}
canUndo={!isMobile && desktopHistory.length > 0}
```

### 3. Add Bookmark Button
**Files to modify:**
- `packages/web/src/components/Feed/FeedItem.tsx`

**Implementation:**
1. Import hooks:
```typescript
import { useBookmarkToggle, useIsBookmarked } from "@/lib/hooks";
```

2. Use in component:
```typescript
const { data: isBookmarked } = useIsBookmarked(item.id);
const bookmarkMutation = useBookmarkToggle();
```

3. Render button:
```typescript
<button
  onClick={() => bookmarkMutation.mutate(item.id)}
  disabled={bookmarkMutation.isPending}
>
  <BookmarkIcon filled={isBookmarked} />
</button>
```

### 4. AI Summary Modal Improvements
**File:** `packages/web/src/components/ItemSummaryModal/ItemSummaryModal.tsx`

Add to the footer (alongside existing FeedbackButtons):
- Undo button (when `canUndo` prop is true)
- Bookmark button

Props to add:
```typescript
onUndo?: () => void;
canUndo?: boolean;
```

### 5. Remove Unused Layout Options
**Files to modify:**

1. `packages/web/src/lib/theme.ts`:
   - Change `DEFAULT_LAYOUT` to `"condensed"`
   - Optionally remove `"reader"` and `"timeline"` from `Layout` type

2. `packages/web/src/app/app/feed/page.tsx`:
   - Remove `<LayoutToggle>` component
   - Remove unused imports and variables (`setLayout`, `hasOverride`, `resetToGlobal`)

3. `packages/web/src/components/Feed/FeedItem.tsx`:
   - Keep the condensed layout code (lines 517-756)
   - Remove the reader/timeline layout code (lines 759-951)

4. `packages/web/src/components/Feed/FeedItem.module.css`:
   - Keep `.scanItem`, `.scanRow`, `.detailPanel` styles
   - Remove `.card`, `.header`, `.headerLeft`, etc. (reader layout styles)

5. `packages/web/src/components/LayoutToggle/`:
   - Can be deleted entirely or kept for other pages

### 6. Add i18n Strings
**File:** `packages/web/src/messages/en.json`

Add under `"feed"`:
```json
"undo": "Go back",
"addBookmark": "Add bookmark",
"removeBookmark": "Remove bookmark"
```

## CSS Changes

### Detail Panel Action Bar (Fixed Position)
Add to `packages/web/src/components/Feed/FeedItem.module.css`:

```css
.detailPanelActions {
  position: absolute;
  top: var(--space-2);
  right: var(--space-3);
  display: flex;
  align-items: center;
  gap: var(--space-2);
  z-index: 10;
}

/* Adjust detail panel to have space for actions */
.detailPanel {
  padding-top: var(--space-10); /* Extra space for action bar */
}

/* Hide on mobile - use swipe instead */
@media (max-width: 768px) {
  .detailPanelActions {
    display: none;
  }

  .detailPanel {
    padding-top: var(--space-12); /* Original mobile padding for header */
  }
}
```

### Icon Button Styles
```css
.actionIconButton {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  background: transparent;
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-md);
  color: var(--color-text-muted);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.actionIconButton:hover:not(:disabled) {
  background: var(--color-surface-hover);
  color: var(--color-text-secondary);
}

.actionIconButtonActive {
  color: var(--color-primary);
  background: var(--color-primary-subtle);
  border-color: var(--color-primary);
}
```

## Icon Components Needed

Add to `FeedItem.tsx`:
```typescript
function UndoIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 14l-4-4 4-4" />
      <path d="M5 10h9a5 5 0 1 1 0 10h-1" />
    </svg>
  );
}

function BookmarkIcon({ filled }: { filled?: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
  );
}
```

## Testing Checklist
- [ ] Dense view flow not broken (hover/click to expand still works)
- [ ] Action buttons in fixed position within detail panel
- [ ] Undo button appears after giving feedback
- [ ] Undo button clears feedback and item returns to inbox
- [ ] Multiple undos work (up to 10)
- [ ] Bookmark button toggles correctly
- [ ] Mobile still uses swipe UI (action bar hidden)
- [ ] AI Summary modal has undo + bookmark buttons
- [ ] Layout toggle removed from feed page
- [ ] Reader/timeline code removed
- [ ] No TypeScript errors (`pnpm typecheck`)
- [ ] Biome passes (`pnpm format`)

## Verification Commands
```bash
pnpm typecheck        # Verify no type errors
pnpm format           # Format code
pnpm dev:web          # Test locally
```

Use Playwright MCP tools to test:
1. Navigate to http://localhost:3000/app/feed
2. Verify dense layout is default
3. Hover over item, check action buttons position
4. Click Like, verify undo button appears
5. Click Undo, verify item restored
6. Test bookmark toggle
