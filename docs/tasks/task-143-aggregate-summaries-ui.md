# Task 143 — `feat(web): digest + inbox aggregate summary UI`

- **Owner**: Claude Code Opus 4.5 (implementer)
- **Reviewer**: GPT‑5.2 xtra high
- **Driver**: human (runs commands, merges)

## Goal

Expose aggregate summaries in the UI:

- Digest detail page shows digest summary when available
- Feed page can generate and display **Inbox Summary** (unread items)

## Read first (required)

- `AGENTS.md`
- `docs/tasks/task-142-aggregate-summaries-jobs-api.md`
- `docs/web.md`
- Code:
  - `packages/web/src/app/app/digests/[id]/page.tsx`
  - `packages/web/src/app/app/feed/page.tsx`
  - `packages/web/src/lib/api.ts`
  - `packages/web/src/lib/hooks.ts`

## Decisions (approved)

- Summaries are scope‑specific (digest vs inbox)
- Digest summaries auto‑run only if enabled (topic config)
- Inbox summaries are **manual** (button) and require an explicit date range

## Scope (allowed files)

- `packages/web/src/app/app/digests/[id]/page.tsx`
- `packages/web/src/app/app/feed/page.tsx`
- `packages/web/src/components/*` (new summary card component ok)
- `packages/web/src/lib/api.ts`
- `packages/web/src/lib/hooks.ts`
- `packages/web/src/messages/en.json`

## Implementation requirements

### 1) API client + hooks

Add typed client functions and hooks for:

- `POST /summaries/digest/:digestId`
- `POST /summaries/inbox`
- `GET /summaries/:id`

### 2) Digest detail UI

- Render a **Summary panel** above the ranked items
- If summary missing:
  - Show “Generate summary” button
  - Show loading state while job runs
- If summary present:
  - Show `one_liner`, `overview`, `themes`, `notable_items`, `sentiment`, etc.

### 3) Feed (Inbox) UI

- Add “Summarize unread items” button
- Require a date range input (since/until) before allowing the call
- When clicked, call `POST /summaries/inbox`
- Poll summary until `status=complete`
- Render summary in a panel at top of feed
- If `topic=all`, label summary as “All topics”

### 4) Styling + copy

- Use neutral, compact card style
- Update `messages/en.json` with new labels and button text

## Acceptance criteria

- [ ] Digest detail shows summary when available
- [ ] Users can generate digest summary manually
- [ ] Feed page supports inbox summary generation and display
- [ ] Loading + error states are clear

## Test plan (copy/paste)

```bash
pnpm -r typecheck
pnpm test
```

## Commit (suggested)

- **Message**: `feat(web): display digest + inbox aggregate summaries`
- **Files expected**:
  - `packages/web/src/app/app/digests/[id]/page.tsx`
  - `packages/web/src/app/app/feed/page.tsx`
  - `packages/web/src/lib/api.ts`
  - `packages/web/src/lib/hooks.ts`
  - `packages/web/src/messages/en.json`
  - `packages/web/src/components/*`
