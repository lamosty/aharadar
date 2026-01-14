# Task 147 — `feat(feed): inline auto-summary on paste + remove deep-dive UI`

- **Owner**: Claude Code Opus 4.5 (implementer)
- **Reviewer**: GPT‑5.2 xtra high
- **Driver**: human (runs commands, merges)

## Workflow notes (required)

- Use `git status` before/after to ensure only intended files are staged.
- If any behavior is unclear, spawn a subagent to inspect the relevant file(s) and summarize before proceeding.
- Run the test plan **before** committing.
- One commit only; do not amend or squash unless the driver explicitly requests it.

## Goal

Move manual summaries into the **feed itself** and remove Deep Dive UI:

- every feed item shows a **tiny paste input**
- **on paste**, automatically generate + save an AI summary (no Generate/Save/Drop buttons)
- summaries remain stored regardless of feedback
- Top Picks = **liked items** (`view=highlights`)
- remove Deep Dives page + nav
- rename the summary modal to a **read‑only Item Summary** viewer

## Read first (required)

- `AGENTS.md`
- `docs/spec.md`
- `docs/web.md`
- Code:
  - `packages/web/src/app/app/feed/page.tsx`
  - `packages/web/src/components/Feed/FeedItem.tsx`
  - `packages/web/src/components/DeepDiveModal/DeepDiveModal.tsx`
  - `packages/web/src/app/app/deep-dives/page.tsx`
  - `packages/web/src/components/AppShell/nav-model.ts`
  - `packages/web/src/lib/api.ts`
  - `packages/web/src/lib/hooks.ts`
  - `packages/web/src/messages/en.json`
  - `packages/web/e2e/feed.spec.ts`

## Decisions (locked)

1. **Auto‑summary on paste**: no Generate button.
2. **Auto‑save** summary when generated; no Promote/Drop.
3. **Input appears on all feed items**, regardless of feedback state.
4. **Top Picks = liked items** (`view=highlights`).
5. **No Deep Dive UI** (page/nav/modal naming removed).
6. **Thumbs down** replaces Drop (maps to feedback `dislike`).
7. Summary modal is **read‑only** and renamed.

## Scope (allowed files)

- `packages/web/src/app/app/feed/page.tsx`
- `packages/web/src/app/app/deep-dives/*`
- `packages/web/src/components/Feed/FeedItem.tsx`
- `packages/web/src/components/Feed/FeedItem.module.css`
- `packages/web/src/components/DeepDiveModal/*`
- `packages/web/src/components/AppShell/nav-model.ts`
- `packages/web/src/lib/api.ts`
- `packages/web/src/lib/hooks.ts`
- `packages/web/src/messages/en.json`
- `packages/web/e2e/feed.spec.ts`

If anything else seems required, **stop and ask** before changing.

## Implementation steps (ordered)

### 1) Web API client + hooks

- In `packages/web/src/lib/api.ts`:
  - Replace Deep Dive API section with **Item Summaries API**.
  - Add `postItemSummary` that calls `POST /item-summaries`.
  - Remove queue/promoted types + functions.
  - Update `FeedItem` type to include `manualSummaryJson`.
  - Update `FeedView` to: `"inbox" | "highlights" | "all"`.
- In `packages/web/src/lib/hooks.ts`:
  - Replace `useDeepDivePreview`/`useDeepDiveDecision` with `useItemSummary` (create summary).
  - Remove unused deep‑dive hooks.

### 2) Feed view semantics: Top Picks = highlights

- In `packages/web/src/app/app/feed/page.tsx`:
  - View toggle labels: Inbox / Top Picks / All.
  - Top Picks uses `view="highlights"`.
  - Remove `top_picks` alias mapping.

### 3) Inline paste input + auto‑summary

In `FeedItem.tsx` (both condensed + reader layouts):

- Add a small textarea/input that is always visible in the detail section.
- `onPaste` handler:
  - reads clipboard text
  - trims and validates (non‑empty, <= 60k chars)
  - calls `postItemSummary` immediately
- Show states:
  - pending: “Summarizing…”
  - error: insufficient credits or general error
- Initialize `summary` state from `item.manualSummaryJson`.
- Show **AI badge** if summary exists.
- When summary exists, show **View** button to open the summary modal.

### 4) Top Picks actions

- Remove the old research panel with Generate/Save/Drop.
- Replace with a compact action row:
  - **View** (if summary exists)
  - **Thumbs down** (maps to feedback `dislike`)

### 5) Rename DeepDiveModal → ItemSummaryModal (read‑only)

- Create a new component folder `ItemSummaryModal` (or rename the existing folder).
- Modal only **displays** summary details (no paste/generate/decision buttons).
- Update `FeedPage` to use this modal and remove deep‑dive state (`deepDiveItem`, `deepDiveSummary`, Read Next logic, etc.).

### 6) Remove Deep Dives page + nav

- Delete `packages/web/src/app/app/deep-dives/`.
- Remove Deep Dives nav item from `nav-model.ts`.
- Remove any remaining deep‑dive icon usage.

### 7) i18n cleanup

- Remove Deep Dive labels/strings.
- Add new strings for:
  - paste placeholder
  - “Summarizing…”
  - summary saved / error copy
  - “View summary”
  - “Thumbs down”

### 8) Update e2e tests

- Remove Deep Dive view tests.
- Add test that Top Picks uses `view=highlights`.
- Update tooltip expectations (no Save button).
- (Optional) Add a mock item with `manualSummaryJson` and assert AI badge is shown.

## Acceptance criteria

- All feed items show a paste input and auto‑summarize on paste.
- No Generate/Save/Drop buttons remain.
- Top Picks uses `view=highlights` and supports thumbs‑down feedback.
- Deep Dives page + nav removed.
- Modal is read‑only and renamed; no Deep Dive wording in UI.
- `pnpm --filter @aharadar/web typecheck` and `pnpm test:e2e` pass.

## Test plan (copy/paste)

```bash
pnpm --filter @aharadar/web typecheck
pnpm test:e2e
```

## Commit

- **Message**: `feat(web): inline manual summaries and remove deep-dive UI`
- **Files expected**:
  - `packages/web/src/app/app/feed/page.tsx`
  - `packages/web/src/components/Feed/FeedItem.tsx`
  - `packages/web/src/components/Feed/FeedItem.module.css`
  - `packages/web/src/components/ItemSummaryModal/*` (new)
  - `packages/web/src/components/DeepDiveModal/*` (removed)
  - `packages/web/src/app/app/deep-dives/*` (removed)
  - `packages/web/src/components/AppShell/nav-model.ts`
  - `packages/web/src/lib/api.ts`
  - `packages/web/src/lib/hooks.ts`
  - `packages/web/src/messages/en.json`
  - `packages/web/e2e/feed.spec.ts`
