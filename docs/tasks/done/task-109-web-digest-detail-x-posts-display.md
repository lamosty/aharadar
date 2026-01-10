# Task 109 — `fix(web): show x_posts text + display name in digest detail`

- **Owner**: Claude Code Opus 4.5 (implementer)
- **Reviewer**: GPT‑5.2 xtra high
- **Driver**: human (runs commands, merges)

## Goal

Make Digest Detail pages (condensed/reader/timeline) render `x_posts` as high-value items:

- show tweet text (via `bodyText`) as the primary display title when `title` is null
- show `user_display_name (@handle)` when available (same behavior as the unified feed)
- avoid “(No title)” / empty rows

## Depends on

- Task 107 (digest detail WhyShown + triage reason) merged (or include the relevant subset here if not done)
- Task 108 (digest detail API includes `bodyText` + `metadata`) merged

## Read first (required)

- `AGENTS.md`
- `docs/connectors.md` (x_posts: `title=null`, text in `body_text`)
- `packages/web/src/components/Feed/FeedItem.tsx` (reference display logic)
- `packages/web/src/app/app/digests/[id]/page.tsx`
- `packages/web/src/lib/mock-data.ts` (`adaptDigestItem`)
- `packages/web/src/components/DigestDetail/*`

## Scope (allowed files)

- `packages/web/src/lib/api.ts` (if needed for types)
- `packages/web/src/lib/mock-data.ts`
- `packages/web/src/components/DigestDetail/**`
- (optional) `packages/web/src/messages/en.json` (copy tweaks only)

If anything else seems required, **stop and ask**.

## Implementation steps (ordered)

1. **Plumb `bodyText` + `metadata` through the digest detail adapter**:
   - extend the component-level `DigestItem` shape (in `mock-data.ts`) to carry:
     - `contentItem.bodyText?: string | null`
     - `contentItem.metadata?: Record<string, unknown> | null`
   - map from `ApiDigestItem.item.bodyText` / `.metadata`.
2. **Display title fallback**:
   - in each digest detail layout, display:
     - `contentItem.title` when present
     - else a truncated `contentItem.bodyText` (same truncation policy as `FeedItem.getDisplayTitle()`).
3. **X display name formatting**:
   - for `sourceType === "x_posts"`, if `metadata.user_display_name` exists, show:
     - `Display Name (@handle)`
   - otherwise keep current author display.
4. **X date fallback (approximate)**:
   - If `publishedAt` is null for an X post but `metadata.post_date` (YYYY-MM-DD) exists, display that date (clearly approximate).
   - Else keep the existing fallback behavior (digest created time / no date, depending on template).
4. **Condensed layout constraints**:
   - ensure tweet text is visually truncated (1–2 lines) so the table doesn’t explode in height.
5. Manual smoke:
   - open a digest containing X items and confirm rows are readable and clickable.

## Acceptance criteria

- [ ] In digest detail, X items no longer display “(No title)” in typical cases; tweet text appears instead.
- [ ] X items show display name when available.
- [ ] All 3 digest detail layouts work and remain reasonably compact.
- [ ] `pnpm -r typecheck` passes.

## Test plan (copy/paste)

```bash
pnpm -r typecheck
pnpm -r build
pnpm dev:web
```

## Commit

- **Message**: `fix(web): render x_posts text + display name in digest detail`
- **Files expected**:
  - `packages/web/src/lib/mock-data.ts`
  - `packages/web/src/components/DigestDetail/**`
  - (optional) `packages/web/src/lib/api.ts`

## Final step (required): write task report files (no copy/paste)

Follow `docs/workflows/task-template.md`.
